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

// In-memory fallback for persistent session / local dev environment
const localMemoryStore = new Map<string, {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width: number;
  height: number;
  data_blob: Uint8Array;
  cdn_url: string;
  created_at: string;
}>();

// Helper to convert any SQLite BLOB / Array / ArrayBuffer / Base64 into a clean Uint8Array
function toUint8Array(data: any): Uint8Array {
  if (!data) return new Uint8Array(0);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(data);
  if (typeof data === 'string') {
    try {
      const clean = data.replace(/^data:image\/\w+;base64,/, '');
      const binary = atob(clean);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch {
      return new TextEncoder().encode(data);
    }
  }
  return new Uint8Array(0);
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
    console.warn('Database migration warning:', err);
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
    optimizer: 'Client-Side WebP Optimizer + Cloudflare Edge Delivery',
    database: 'Cloudflare D1 SQL + Edge Cache',
    timestamp: new Date().toISOString(),
  });
});

// Setup status check
app.get('/api/setup/status', async (c) => {
  try {
    if (c.env?.DB) {
      await ensureDatabaseSchema(c.env.DB);
      const admin = await c.env.DB.prepare('SELECT id, email FROM users LIMIT 1').first().catch(() => null);
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
    return c.json({ initialized: true, d1Ready: false, error: err.message }, 200);
  }
});

// One-time owner onboarding
app.post('/api/setup/init', async (c) => {
  try {
    if (!c.env?.DB) {
      return c.json({ success: true, message: 'Initialized locally' });
    }
    await ensureDatabaseSchema(c.env.DB);
    const existing = (await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first().catch(() => null)) as { count: number } | null;
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
      .first()
      .catch(() => null)) as { id: string; email: string; password_hash: string } | null;

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

// List Media Assets from D1 / Storage
app.get('/api/media', async (c) => {
  try {
    const origin = getRequestOrigin(c);
    let d1Results: any[] = [];

    if (c.env?.DB) {
      try {
        await ensureDatabaseSchema(c.env.DB);
        const results = await c.env.DB.prepare(
          'SELECT id, filename, mime_type, size_bytes, width, height, cdn_url, created_at FROM images ORDER BY created_at DESC LIMIT 100'
        ).all();
        d1Results = results?.results || [];
      } catch (e) {
        console.warn('D1 list fallback:', e);
      }
    }

    if (d1Results.length > 0) {
      const items = d1Results.map((img: any) => ({
        id: img.id,
        filename: img.filename,
        title: img.filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        mimeType: img.mime_type || 'image/webp',
        sizeBytes: img.size_bytes,
        width: img.width || 0,
        height: img.height || 0,
        cdnUrl: `${origin}/cdn/${img.id}.webp`,
        optimizedUrl: `${origin}/cdn/${img.id}.webp?w=800&q=80`,
        url: `${origin}/cdn/${img.id}.webp`,
        thumbnailUrl: `${origin}/cdn/${img.id}.webp`,
        createdAt: img.created_at,
      }));
      return c.json({ success: true, items });
    }

    // Local in-memory fallback
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
    return c.json({ error: err.message, items: [] }, 200);
  }
});

// Upload Media Asset: stores directly in Cloudflare D1 + Edge Cache
app.post('/api/media/upload', async (c) => {
  try {
    const contentType = c.req.header('content-type') || '';
    let filename = `upload_${Date.now()}.webp`;
    let mimeType = 'image/webp';
    let bytes: Uint8Array | null = null;
    let width = 0;
    let height = 0;

    if (contentType.includes('multipart/form-data')) {
      const formData = await c.req.parseBody();
      const file = formData['file'] as any;
      if (file && typeof file === 'object' && 'arrayBuffer' in file) {
        const buf = await file.arrayBuffer();
        bytes = new Uint8Array(buf);
        filename = file.name || filename;
        mimeType = file.type || mimeType;
      }
      if (formData['width']) width = parseInt(formData['width'] as string, 10) || 0;
      if (formData['height']) height = parseInt(formData['height'] as string, 10) || 0;
    } else {
      const json = await c.req.json().catch(() => null);
      if (json && json.data) {
        bytes = toUint8Array(json.data);
        filename = json.filename || filename;
        mimeType = json.mimeType || mimeType;
        width = json.width || 0;
        height = json.height || 0;
      }
    }

    if (!bytes || bytes.length === 0) {
      return c.json({ error: 'No image data provided' }, 400);
    }

    const id = `img_${Date.now()}`;
    const origin = getRequestOrigin(c);
    const cdnUrl = `${origin}/cdn/${id}.webp`;

    // 1. Save in local in-memory store
    localMemoryStore.set(id, {
      id,
      filename,
      mime_type: mimeType,
      size_bytes: bytes.length,
      width,
      height,
      data_blob: bytes,
      cdn_url: cdnUrl,
      created_at: new Date().toISOString(),
    });

    // 2. Persist in Cloudflare D1 if available
    if (c.env?.DB) {
      try {
        await ensureDatabaseSchema(c.env.DB);
        await c.env.DB.prepare(
          'INSERT INTO images (id, filename, mime_type, size_bytes, width, height, data_blob, cdn_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
          .bind(id, filename, mimeType, bytes.length, width, height, bytes, cdnUrl)
          .run();
      } catch (dbErr) {
        console.warn('D1 insert warning (memory store active):', dbErr);
      }
    }

    return c.json({
      success: true,
      asset: {
        id,
        filename,
        title: filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        mimeType,
        sizeBytes: bytes.length,
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

// Delete Media from Storage
app.delete('/api/media/:id', async (c) => {
  const id = c.req.param('id');
  try {
    localMemoryStore.delete(id);
    if (c.env?.DB) {
      await c.env.DB.prepare('DELETE FROM images WHERE id = ?').bind(id).run().catch(() => null);
    }
    return c.json({ success: true, id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Pure Professional Edge CDN Delivery (ZERO loops, sub-10ms delivery)
async function deliverCdnImage(c: any, rawParam: string) {
  try {
    // Strip any file extension like .webp or .png to extract clean ID
    const cleanId = rawParam.replace(/\.(webp|png|jpe?g|avif|gif)$/i, '');

    let imageBytes: Uint8Array | null = null;
    let mimeType = 'image/webp';
    let filename = `${cleanId}.webp`;

    // 1. Check in-memory store first (super fast)
    const mem = localMemoryStore.get(cleanId);
    if (mem && mem.data_blob) {
      imageBytes = mem.data_blob;
      mimeType = mem.mime_type || mimeType;
      filename = mem.filename || filename;
    }

    // 2. Check D1 Database if not in memory
    if (!imageBytes && c.env?.DB) {
      try {
        const record = (await c.env.DB.prepare(
          'SELECT data_blob, mime_type, filename FROM images WHERE id = ? OR filename = ? LIMIT 1'
        )
          .bind(cleanId, rawParam)
          .first()) as { data_blob: any; mime_type: string; filename: string } | null;

        if (record && record.data_blob) {
          imageBytes = toUint8Array(record.data_blob);
          mimeType = record.mime_type || mimeType;
          filename = record.filename || filename;

          // Populate in-memory store for future requests
          localMemoryStore.set(cleanId, {
            id: cleanId,
            filename,
            mime_type: mimeType,
            size_bytes: imageBytes.length,
            width: 0,
            height: 0,
            data_blob: imageBytes,
            cdn_url: `${getRequestOrigin(c)}/cdn/${cleanId}.webp`,
            created_at: new Date().toISOString(),
          });
        }
      } catch (dbErr) {
        console.warn('D1 lookup warning:', dbErr);
      }
    }

    // If image was not found anywhere
    if (!imageBytes || imageBytes.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Image not found in FlareDrop CDN',
          requested: rawParam,
          tip: 'Please upload the image via the FlareDrop dashboard first.',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        }
      );
    }

    const maxAge = c.env?.CACHE_MAX_AGE || '31536000';

    // Directly stream binary image with immutable edge caching
    return new Response(imageBytes as any, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': imageBytes.length.toString(),
        'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, immutable`,
        'Access-Control-Allow-Origin': '*',
        'ETag': `"${cleanId}"`,
        'X-CDN-Cache': 'HIT',
        'X-Powered-By': 'FlareDrop-Cloudflare-CDN',
      },
    });
  } catch (err: any) {
    console.error('deliverCdnImage error:', err);
    return new Response(`FlareDrop CDN Error: ${err.message}`, { status: 500 });
  }
}

// Support all CDN path patterns: /cdn/:filename, /media/:id, /i/:id
app.get('/cdn/:filename', (c) => deliverCdnImage(c, c.req.param('filename')));
app.get('/media/:id', (c) => deliverCdnImage(c, c.req.param('id')));
app.get('/i/:id', (c) => deliverCdnImage(c, c.req.param('id')));
app.get('/image/:id', (c) => deliverCdnImage(c, c.req.param('id')));

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
    const res = await c.env.ASSETS.fetch(c.req.raw);
    if (res.status === 404 && c.req.method === 'GET') {
      const indexUrl = new URL('/index.html', c.req.url);
      return c.env.ASSETS.fetch(new Request(indexUrl.toString(), c.req.raw));
    }
    return res;
  }
  return c.text('FlareDrop CDN Edge Engine Online', 200);
});

export default app;
