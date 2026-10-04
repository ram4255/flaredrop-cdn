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

// In-memory fallback for local dev environment when D1 is not attached
const localMemoryStore = new Map<string, {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width: number;
  height: number;
  data_blob: ArrayBuffer;
  cdn_url: string;
  created_at: string;
}>();

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

// Helper to get request origin dynamically
function getRequestOrigin(c: any): string {
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:3000';
  const proto = c.req.header('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
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
    optimizer: 'Client-Side Canvas + wsrv.nl Edge Proxy',
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
      initialized: true,
      adminEmail: 'owner@flaredrop.local',
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

// List Media Assets from D1
app.get('/api/media', async (c) => {
  try {
    const origin = getRequestOrigin(c);
    if (c.env?.DB) {
      await ensureDatabaseSchema(c.env.DB);
      const results = await c.env.DB.prepare(
        'SELECT id, filename, mime_type, size_bytes, width, height, cdn_url, created_at FROM images ORDER BY created_at DESC LIMIT 100'
      ).all();

      const items = (results?.results || []).map((img: any) => ({
        id: img.id,
        filename: img.filename,
        title: img.filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        mimeType: img.mime_type,
        sizeBytes: img.size_bytes,
        width: img.width || 0,
        height: img.height || 0,
        cdnUrl: `${origin}/cdn/${img.id}.webp`,
        optimizedUrl: `${origin}/cdn/${img.id}.webp?w=800&q=80`,
        url: `${origin}/cdn/${img.id}.webp`,
        thumbnailUrl: `${origin}/cdn/${img.id}.webp?w=120&h=120&fit=cover`,
        createdAt: img.created_at,
      }));

      return c.json({ success: true, items });
    }

    // Local fallback
    const items = Array.from(localMemoryStore.values()).map((img) => ({
      id: img.id,
      filename: img.filename,
      title: img.filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
      mimeType: img.mime_type,
      sizeBytes: img.size_bytes,
      width: img.width,
      height: img.height,
      cdnUrl: `${origin}/cdn/${img.id}.webp`,
      optimizedUrl: `${origin}/cdn/${img.id}.webp?w=800&q=80`,
      url: `${origin}/cdn/${img.id}.webp`,
      thumbnailUrl: `${origin}/cdn/${img.id}.webp`,
      createdAt: img.created_at,
    }));

    return c.json({ success: true, items });
  } catch (err: any) {
    return c.json({ error: err.message, items: [] }, 500);
  }
});

// Upload Media Asset to D1
app.post('/api/media/upload', async (c) => {
  try {
    const contentType = c.req.header('content-type') || '';
    let filename = `upload_${Date.now()}.webp`;
    let mimeType = 'image/webp';
    let rawBuffer: ArrayBuffer | null = null;
    let width = 0;
    let height = 0;

    if (contentType.includes('multipart/form-data')) {
      const formData = await c.req.parseBody();
      const file = formData['file'] as any;
      if (file && typeof file === 'object' && 'arrayBuffer' in file) {
        rawBuffer = await file.arrayBuffer();
        filename = file.name || filename;
        mimeType = file.type || mimeType;
      }
      if (formData['width']) width = parseInt(formData['width'] as string, 10) || 0;
      if (formData['height']) height = parseInt(formData['height'] as string, 10) || 0;
    } else {
      const json = await c.req.json().catch(() => null);
      if (json && json.data) {
        // Base64 upload
        const base64Data = json.data.replace(/^data:image\/\w+;base64,/, '');
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        rawBuffer = bytes.buffer;
        filename = json.filename || filename;
        mimeType = json.mimeType || mimeType;
        width = json.width || 0;
        height = json.height || 0;
      }
    }

    if (!rawBuffer || rawBuffer.byteLength === 0) {
      return c.json({ error: 'No image data provided' }, 400);
    }

    const id = `img_${Date.now()}`;
    const origin = getRequestOrigin(c);
    const cdnUrl = `${origin}/cdn/${id}.webp`;

    if (c.env?.DB) {
      await ensureDatabaseSchema(c.env.DB);
      await c.env.DB.prepare(
        'INSERT INTO images (id, filename, mime_type, size_bytes, width, height, data_blob, cdn_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(id, filename, mimeType, rawBuffer.byteLength, width, height, rawBuffer, cdnUrl)
        .run();
    } else {
      localMemoryStore.set(id, {
        id,
        filename,
        mime_type: mimeType,
        size_bytes: rawBuffer.byteLength,
        width,
        height,
        data_blob: rawBuffer,
        cdn_url: cdnUrl,
        created_at: new Date().toISOString(),
      });
    }

    return c.json({
      success: true,
      asset: {
        id,
        filename,
        title: filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        mimeType,
        sizeBytes: rawBuffer.byteLength,
        width,
        height,
        cdnUrl,
        optimizedUrl: `${origin}/cdn/${id}.webp?w=800&q=80`,
        url: cdnUrl,
        thumbnailUrl: `${origin}/cdn/${id}.webp`,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Delete Media from D1
app.delete('/api/media/:id', async (c) => {
  const id = c.req.param('id');
  try {
    if (c.env?.DB) {
      await c.env.DB.prepare('DELETE FROM images WHERE id = ?').bind(id).run();
    } else {
      localMemoryStore.delete(id);
    }
    return c.json({ success: true, id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Direct Professional CDN Delivery Endpoint: /cdn/:filename or /cdn/:id or /media/:id
async function serveMediaBlob(c: any, rawParam: string) {
  // Strip any file extension like .webp or .png to find ID
  const cleanId = rawParam.replace(/\.(webp|png|jpe?g|avif|gif)$/i, '');

  let record: { data_blob: ArrayBuffer | number[]; mime_type: string; filename: string } | null = null;

  if (c.env?.DB) {
    record = (await c.env.DB.prepare('SELECT data_blob, mime_type, filename FROM images WHERE id = ? OR filename = ?')
      .bind(cleanId, rawParam)
      .first()) as { data_blob: ArrayBuffer | number[]; mime_type: string; filename: string } | null;
  } else {
    const mem = localMemoryStore.get(cleanId);
    if (mem) {
      record = {
        data_blob: mem.data_blob,
        mime_type: mem.mime_type,
        filename: mem.filename,
      };
    }
  }

  if (!record || !record.data_blob) {
    return c.text(`Image "${rawParam}" not found in FlareDrop CDN`, 404);
  }

  const rawBytes = record.data_blob instanceof ArrayBuffer
    ? record.data_blob
    : new Uint8Array(record.data_blob as number[]).buffer;

  const maxAge = c.env?.CACHE_MAX_AGE || '31536000';

  return new Response(rawBytes, {
    headers: {
      'Content-Type': record.mime_type || 'image/webp',
      'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, immutable`,
      'Access-Control-Allow-Origin': '*',
      'ETag': `"${cleanId}"`,
      'X-CDN-Cache': 'HIT',
      'X-Powered-By': 'FlareDrop-Cloudflare-D1',
    },
  });
}

// Support both /cdn/:filename and /media/:id and /i/:id
app.get('/cdn/:filename', (c) => serveMediaBlob(c, c.req.param('filename')));
app.get('/media/:id', (c) => serveMediaBlob(c, c.req.param('id')));
app.get('/i/:id', (c) => serveMediaBlob(c, c.req.param('id')));

// Dynamic Image Optimization via wsrv.nl proxy (with correct origin detection)
app.get('/image/:id', async (c) => {
  const id = c.req.param('id');
  const origin = getRequestOrigin(c);
  const directMediaUrl = `${origin}/cdn/${id}.webp`;

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

  try {
    const response = await fetch(optimizerUrl.toString(), {
      headers: { 'User-Agent': 'FlareDrop-CDN-Edge-Worker' },
    });

    if (!response.ok) {
      // Fallback directly to direct media if wsrv.nl cannot reach localhost or DNS is unresolvable
      return serveMediaBlob(c, id);
    }

    const maxAge = c.env?.CACHE_MAX_AGE || '31536000';
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', `public, max-age=${maxAge}, s-maxage=${maxAge}, immutable`);
    headers.set('X-CDN-Cache', 'HIT');
    headers.set('X-Optimized-By', 'FlareDrop-wsrv.nl');

    return new Response(response.body, { status: response.status, headers });
  } catch {
    // If fetch failed, fallback directly to stored D1 binary
    return serveMediaBlob(c, id);
  }
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
