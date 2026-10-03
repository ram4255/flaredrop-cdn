import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { generateCloudflareTemplates, SCHEMA_SQL } from '../lib/cloudflare-templates';
import { CloudflareDeployConfig } from '../types';

// Cloudflare Worker ambient types fallback
type D1Database = any;
type Fetcher = any;

export interface Env {
  DB?: D1Database;
  ASSETS?: Fetcher;
  AUTH_SECRET?: string;
  JWT_SECRET?: string;
  WSRV_ENDPOINT?: string;
  DEFAULT_QUALITY?: string;
  DEFAULT_FORMAT?: string;
  CACHE_MAX_AGE?: string;
  CORS_ORIGIN?: string;
}

export const app = new Hono<{ Bindings: Env }>();

// Auto-run schema migrations on boot if D1 DB is available
async function ensureDatabaseSchema(db?: D1Database) {
  if (!db) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        width INTEGER DEFAULT 0,
        height INTEGER DEFAULT 0,
        data_blob BLOB,
        cdn_url TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  } catch (err) {
    console.error('Database migration warning:', err);
  }
}

// Enable CORS
app.use('*', async (c, next) => {
  const origin = c.env?.CORS_ORIGIN || '*';
  const corsMiddleware = cors({
    origin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-cdn-auth'],
    maxAge: 86400,
  });
  return corsMiddleware(c, next);
});

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({
    status: 'online',
    framework: 'Hono Web Standard',
    optimizer: 'https://wsrv.nl/',
    database: 'Cloudflare D1 SQL (Auto-Schema Injected)',
    timestamp: new Date().toISOString(),
  });
});

// Setup status check
app.get('/api/setup/status', async (c) => {
  try {
    if (c.env?.DB) {
      await ensureDatabaseSchema(c.env.DB);
      const admin = await c.env.DB.prepare('SELECT id, email FROM users LIMIT 1').first();
      return c.json({
        initialized: !!admin,
        adminEmail: admin ? (admin as any).email : null,
        d1Ready: true,
        freeTierReady: true,
        wsrvEndpoint: c.env?.WSRV_ENDPOINT || 'https://wsrv.nl/',
      });
    }
    return c.json({
      initialized: false,
      adminEmail: null,
      d1Ready: false,
      freeTierReady: true,
      wsrvEndpoint: 'https://wsrv.nl/',
    });
  } catch (err: any) {
    return c.json({ error: err.message, initialized: false }, 500);
  }
});

// One-time owner onboarding
app.post('/api/setup/init', async (c) => {
  try {
    if (!c.env?.DB) {
      return c.json({ success: true, message: 'Initialized locally' });
    }
    await ensureDatabaseSchema(c.env.DB);
    const existing = (await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first()) as { count: number } | null;
    if (existing && existing.count > 0) {
      return c.json({ error: 'System is already initialized with an owner account' }, 400);
    }

    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const userId = `admin_${Date.now()}`;
    await c.env.DB.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
      .bind(userId, email, password)
      .run();

    return c.json({
      success: true,
      message: 'Owner account created successfully! Database schema initialized.',
      user: { id: userId, email },
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Owner Login
app.post('/api/auth/login', async (c) => {
  try {
    if (!c.env?.DB) {
      return c.json({ success: true, token: 'local_secret' });
    }
    const { email, password } = await c.req.json();
    const user = (await c.env.DB.prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
      .bind(email)
      .first()) as { id: string; email: string; password_hash: string } | null;

    if (!user || user.password_hash !== password) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    return c.json({
      success: true,
      token: c.env.AUTH_SECRET || 'authenticated',
      user: { id: user.id, email: user.email },
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Direct Media from D1 BLOB (Zero Credit Card Required!)
app.get('/media/:id', async (c) => {
  const id = c.req.param('id');
  if (!c.env?.DB) {
    return c.text('Database not configured', 500);
  }

  const record = (await c.env.DB.prepare('SELECT data_blob, mime_type, filename FROM images WHERE id = ?')
    .bind(id)
    .first()) as { data_blob: ArrayBuffer | number[]; mime_type: string; filename: string } | null;

  if (!record || !record.data_blob) {
    return c.text('Image not found in D1 database', 404);
  }

  const rawBytes = record.data_blob instanceof ArrayBuffer
    ? record.data_blob
    : new Uint8Array(record.data_blob as number[]).buffer;

  return new Response(rawBytes, {
    headers: {
      'Content-Type': record.mime_type || 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

// Dynamic Image Optimization via wsrv.nl proxy
app.get('/image/:id', async (c) => {
  const id = c.req.param('id');
  const directMediaUrl = new URL(`/media/${id}`, c.req.url).toString();

  const wsrvBase = c.env?.WSRV_ENDPOINT || 'https://wsrv.nl/';
  const optimizerUrl = new URL(wsrvBase);
  optimizerUrl.searchParams.set('url', directMediaUrl);

  const query = c.req.query();
  for (const [k, v] of Object.entries(query)) {
    optimizerUrl.searchParams.set(k, v);
  }

  if (!optimizerUrl.searchParams.has('output')) {
    optimizerUrl.searchParams.set('output', c.env?.DEFAULT_FORMAT || 'webp');
  }
  if (!optimizerUrl.searchParams.has('q')) {
    optimizerUrl.searchParams.set('q', c.env?.DEFAULT_QUALITY || '80');
  }

  const response = await fetch(optimizerUrl.toString(), {
    headers: { 'User-Agent': 'FlareDrop-CDN-Edge-Worker' },
  });

  if (!response.ok) {
    return c.text(`Optimization error from wsrv.nl: ${response.statusText}`, response.status as any);
  }

  const maxAge = c.env?.CACHE_MAX_AGE || '31536000';
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', `public, max-age=${maxAge}, s-maxage=${maxAge}, immutable`);
  headers.set('X-CDN-Cache', 'HIT');
  headers.set('X-Optimized-By', 'FlareDrop-wsrv.nl');

  return new Response(response.body, { status: response.status, headers });
});

// Returns D1 schema SQL
app.get('/api/d1/schema', (c) => {
  return c.text(SCHEMA_SQL, 200, {
    'Content-Type': 'text/plain; charset=utf-8',
  });
});

// Auto-generate credentials for 1-click deploy
app.get('/api/credentials/generate', (c) => {
  const randomHex = (bytes = 6) =>
    Array.from({ length: bytes }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');

  const config: CloudflareDeployConfig = {
    projectName: 'flaredrop-media-cdn',
    githubRepoUrl: 'https://github.com/ram4255/flaredrop-cdn',
    d1DatabaseName: 'flaredrop_cdn_db',
    d1DatabaseId: `d1_${randomHex(4)}`,
    r2BucketName: 'flaredrop-media-store',
    authSecretKey: `cf_sec_${randomHex(16)}`,
    jwtSecret: `jwt_${randomHex(24)}`,
    wsrvEndpoint: 'https://wsrv.nl/',
    defaultQuality: 80,
    defaultFormat: 'webp',
    cacheMaxAge: 31536000,
  };

  return c.json({
    success: true,
    config,
    deployUrl: `https://deploy.workers.cloudflare.com/?url=${encodeURIComponent(config.githubRepoUrl)}`,
  });
});

// Get repository templates with credentials injected
app.post('/api/templates', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const randomHex = () => Math.random().toString(36).substring(2, 10);
  
  const config: CloudflareDeployConfig = body.config || {
    projectName: 'flaredrop-media-cdn',
    githubRepoUrl: 'https://github.com/ram4255/flaredrop-cdn',
    d1DatabaseName: 'flaredrop_cdn_db',
    d1DatabaseId: `d1_${randomHex()}`,
    r2BucketName: 'flaredrop-media-store',
    authSecretKey: `cf_sec_${randomHex()}${randomHex()}`,
    jwtSecret: `jwt_${randomHex()}${randomHex()}`,
    wsrvEndpoint: 'https://wsrv.nl/',
    defaultQuality: 80,
    defaultFormat: 'webp',
    cacheMaxAge: 31536000,
  };

  const files = generateCloudflareTemplates(config);
  return c.json({ success: true, files });
});

// Fallback to static SPA assets (React frontend)
app.all('*', async (c) => {
  if (c.env?.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('FlareDrop CDN Edge Engine Online', 200);
});

export default app;
