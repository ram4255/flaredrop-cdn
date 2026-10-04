import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { generateCloudflareTemplates, SCHEMA_SQL } from '../lib/cloudflare-templates';
import {
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
  generateApiKey,
  hashApiKey,
} from '../lib/crypto';
import { CloudflareDeployConfig, ApiKeyItem } from '../types';

// Cloudflare Worker ambient types fallback
type D1Database = any;
type Fetcher = any;

export interface Env {
  DB?: D1Database;
  ASSETS?: Fetcher;
  AUTH_SECRET?: string;
  ADMIN_EMAIL?: string;
  JWT_SECRET?: string;
  WSRV_ENDPOINT?: string;
  DEFAULT_QUALITY?: string;
  DEFAULT_FORMAT?: string;
  CACHE_MAX_AGE?: string;
  CORS_ORIGIN?: string;
}

// In-memory fallback for local development or session persistence
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

const localUsersStore = new Map<string, {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}>();

const localApiKeysStore = new Map<string, {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  created_at: string;
  last_used_at: string | null;
}>();

// IP-based Rate Limiter sliding window: max 5 failed attempts per 15 minutes
const failedLoginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const record = failedLoginAttempts.get(ip);
  if (!record) return { allowed: true, retryAfterSeconds: 0 };

  if (now > record.resetAt) {
    failedLoginAttempts.delete(ip);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (record.count >= 5) {
    const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

function recordFailedAttempt(ip: string) {
  const now = Date.now();
  const record = failedLoginAttempts.get(ip);
  if (!record || now > record.resetAt) {
    failedLoginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  } else {
    record.count += 1;
  }
}

function clearFailedAttempts(ip: string) {
  failedLoginAttempts.delete(ip);
}

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
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        key_hash TEXT UNIQUE NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        last_used_at TEXT
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

// Helper to get client IP for rate limiting
function getClientIp(c: any): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-real-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1'
  );
}

// Enable CORS
app.use('*', async (c, next) => {
  const origin = c.env?.CORS_ORIGIN || '*';
  const corsMiddleware = cors({
    origin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-cdn-auth'],
    maxAge: 86400,
  });
  return corsMiddleware(c, next);
});

// Authentication Guard Middleware
async function authenticateRequest(c: any): Promise<{ authenticated: boolean; user?: any; apiKey?: any; error?: string }> {
  const authHeader = c.req.header('Authorization') || '';
  const apiKeyHeader = c.req.header('x-api-key') || '';
  const jwtSecret = c.env?.JWT_SECRET || 'flaredrop_default_jwt_secret_2026';

  // 1. Check Bearer Token (JWT Session)
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();

    // Check if token is actually an API Key passed in Bearer format
    if (token.startsWith('fd_live_sk_')) {
      const keyHash = await hashApiKey(token);
      let keyRecord = null;
      if (c.env?.DB) {
        keyRecord = await c.env.DB.prepare('SELECT id, name, key_prefix FROM api_keys WHERE key_hash = ?').bind(keyHash).first().catch(() => null);
      } else {
        keyRecord = localApiKeysStore.get(keyHash);
      }
      if (keyRecord) {
        return { authenticated: true, apiKey: keyRecord };
      }
      return { authenticated: false, error: 'Invalid API Key' };
    }

    // Verify JWT
    const payload = await verifyJwt(token, jwtSecret);
    if (payload && payload.sub) {
      return { authenticated: true, user: payload };
    }

    // Development fallback token if local
    if (token === 'local_secret' && !c.env?.DB) {
      return { authenticated: true, user: { sub: 'admin_1', email: 'owner@flaredrop.local' } };
    }

    return { authenticated: false, error: 'Session expired or invalid token' };
  }

  // 2. Check x-api-key Header
  if (apiKeyHeader.startsWith('fd_live_sk_')) {
    const keyHash = await hashApiKey(apiKeyHeader);
    let keyRecord = null;
    if (c.env?.DB) {
      keyRecord = await c.env.DB.prepare('SELECT id, name, key_prefix FROM api_keys WHERE key_hash = ?').bind(keyHash).first().catch(() => null);
    } else {
      keyRecord = localApiKeysStore.get(keyHash);
    }
    if (keyRecord) {
      return { authenticated: true, apiKey: keyRecord };
    }
    return { authenticated: false, error: 'Invalid API Key' };
  }

  return { authenticated: false, error: 'Authentication required. Pass Bearer JWT or x-api-key.' };
}

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({
    status: 'online',
    framework: 'Hono Web Standard',
    authEngine: 'PBKDF2-SHA256 (100k rounds) + HMAC-SHA256 JWT + Scoped API Keys',
    rateLimiting: 'Edge Sliding Window Brute-Force Shield',
    database: 'Cloudflare D1 SQL + Edge Cache',
    timestamp: new Date().toISOString(),
  });
});

const DEFAULT_OWNER_EMAIL = 'singhramprasad522@gmail.com';

// Setup status check: Always initialized, zero public signups
app.get('/api/setup/status', async (c) => {
  const ownerEmail = c.env?.ADMIN_EMAIL || DEFAULT_OWNER_EMAIL;
  return c.json({
    initialized: true,
    ownerEmail,
    publicSignup: false,
    d1Ready: !!c.env?.DB,
    security: {
      pbkdf2Rounds: 100000,
      jwtEdgeVerification: true,
      singleTenant: true,
    },
    wsrvEndpoint: c.env?.WSRV_ENDPOINT || 'https://wsrv.nl/',
  });
});

// Hard 404: Registration is permanently disabled
app.post('/api/setup/init', (c) => {
  return c.json({ error: '404 Not Found: Public registration is disabled. This is a private single-tenant CDN.' }, 404);
});

app.post('/api/auth/register', (c) => {
  return c.json({ error: '404 Not Found: Registration is permanently disabled.' }, 404);
});

// Single-Owner High-Security Login (Rate-Limited + Timing-Safe PBKDF2)
app.post('/api/auth/login', async (c) => {
  const clientIp = getClientIp(c);
  const rateLimit = checkRateLimit(clientIp);

  if (!rateLimit.allowed) {
    return c.json(
      {
        error: `Too many failed login attempts from this IP. Rate limit triggered. Please retry after ${rateLimit.retryAfterSeconds} seconds.`,
      },
      429,
      { 'Retry-After': rateLimit.retryAfterSeconds.toString() }
    );
  }

  try {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const allowedOwner = (c.env?.ADMIN_EMAIL || DEFAULT_OWNER_EMAIL).trim().toLowerCase();
    const inputEmail = email.trim().toLowerCase();

    // STRICT CHECK: Reject anyone whose email does not match the designated owner
    if (inputEmail !== allowedOwner) {
      recordFailedAttempt(clientIp);
      return c.json({ error: 'Invalid credentials. Access restricted to CDN owner.' }, 401);
    }

    let user: { id: string; email: string; password_hash: string; created_at?: string } | null = null;

    if (c.env?.DB) {
      await ensureDatabaseSchema(c.env.DB);
      user = (await c.env.DB.prepare('SELECT id, email, password_hash, created_at FROM users WHERE email = ? LIMIT 1')
        .bind(allowedOwner)
        .first()
        .catch(() => null)) as any;
    } else {
      user = localUsersStore.get('owner_1') || Array.from(localUsersStore.values()).find((u) => u.email === allowedOwner) || null;
    }

    if (!user) {
      // First-time owner setup: hash the owner's password with PBKDF2 (100,000 rounds)
      const passwordHash = await hashPassword(password);
      const createdAt = new Date().toISOString();
      user = { id: 'owner_1', email: allowedOwner, password_hash: passwordHash, created_at: createdAt };

      if (c.env?.DB) {
        await c.env.DB.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
          .bind('owner_1', allowedOwner, passwordHash, createdAt)
          .run();
      } else {
        localUsersStore.set('owner_1', user as any);
      }
    } else {
      // Verify password with timing-safe comparison
      const isPasswordValid = await verifyPassword(password, user.password_hash);
      if (!isPasswordValid) {
        recordFailedAttempt(clientIp);
        return c.json({ error: 'Invalid password. Access restricted to CDN owner.' }, 401);
      }
    }

    // Successful login: clear brute-force counter
    clearFailedAttempts(clientIp);

    // Issue signed 7-day JWT session token
    const jwtSecret = c.env?.JWT_SECRET || 'flaredrop_default_jwt_secret_2026';
    const token = await signJwt(
      {
        sub: user.id,
        email: user.email,
        role: 'admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
      },
      jwtSecret
    );

    return c.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: 'CDN Owner',
        role: 'admin',
        createdAt: user.created_at || new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Update Master Password Endpoint (Protected by JWT)
app.post('/api/auth/change-password', async (c) => {
  const auth = await authenticateRequest(c);
  if (!auth.authenticated || !auth.user) {
    return c.json({ error: 'Authentication required to update password' }, 401);
  }

  try {
    const { currentPassword, newPassword } = await c.req.json();
    if (!newPassword || newPassword.length < 8) {
      return c.json({ error: 'New password must be at least 8 characters long' }, 400);
    }

    const email = auth.user.email;
    let user: any = null;

    if (c.env?.DB) {
      user = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ? LIMIT 1').bind(email).first();
    } else {
      user = localUsersStore.get('owner_1') || Array.from(localUsersStore.values())[0];
    }

    if (user && currentPassword) {
      const isValid = await verifyPassword(currentPassword, user.password_hash);
      if (!isValid) {
        return c.json({ error: 'Current password is incorrect' }, 401);
      }
    }

    const newHash = await hashPassword(newPassword);

    if (c.env?.DB) {
      await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE email = ?').bind(newHash, email).run();
    } else if (user) {
      user.password_hash = newHash;
    }

    return c.json({ success: true, message: 'Master password updated successfully!' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Verify Current Session
app.get('/api/auth/me', async (c) => {
  const auth = await authenticateRequest(c);
  if (!auth.authenticated) {
    return c.json({ error: auth.error }, 401);
  }
  return c.json({ success: true, user: auth.user, apiKey: auth.apiKey });
});

// 3. API Key Management (List, Generate, Revoke)
app.get('/api/keys', async (c) => {
  const auth = await authenticateRequest(c);
  if (!auth.authenticated || !auth.user) {
    return c.json({ error: 'Admin JWT authentication required to manage API keys' }, 401);
  }

  try {
    if (c.env?.DB) {
      await ensureDatabaseSchema(c.env.DB);
      const results = await c.env.DB.prepare('SELECT id, name, key_prefix, created_at, last_used_at FROM api_keys ORDER BY created_at DESC').all();
      return c.json({ success: true, keys: results?.results || [] });
    }

    const items = Array.from(localApiKeysStore.values()).map((k) => ({
      id: k.id,
      name: k.name,
      key_prefix: k.key_prefix,
      created_at: k.created_at,
      last_used_at: k.last_used_at,
    }));
    return c.json({ success: true, keys: items });
  } catch (err: any) {
    return c.json({ error: err.message, keys: [] }, 500);
  }
});

app.post('/api/keys', async (c) => {
  const auth = await authenticateRequest(c);
  if (!auth.authenticated || !auth.user) {
    return c.json({ error: 'Admin JWT authentication required to generate API keys' }, 401);
  }

  try {
    const { name } = await c.req.json().catch(() => ({}));
    const keyData = await generateApiKey(name || 'Personal Upload Key');

    if (c.env?.DB) {
      await ensureDatabaseSchema(c.env.DB);
      await c.env.DB.prepare(
        'INSERT INTO api_keys (id, name, key_prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?)'
      )
        .bind(keyData.id, keyData.name, keyData.keyPrefix, keyData.keyHash, keyData.createdAt)
        .run();
    } else {
      localApiKeysStore.set(keyData.keyHash, {
        id: keyData.id,
        name: keyData.name,
        key_prefix: keyData.keyPrefix,
        key_hash: keyData.keyHash,
        created_at: keyData.createdAt,
        last_used_at: null,
      });
    }

    // Return the full plaintext key ONCE to the user. It is never stored or recoverable again!
    return c.json({
      success: true,
      apiKey: {
        id: keyData.id,
        name: keyData.name,
        keyPrefix: keyData.keyPrefix,
        fullKey: keyData.key,
        createdAt: keyData.createdAt,
        lastUsedAt: null,
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.delete('/api/keys/:id', async (c) => {
  const auth = await authenticateRequest(c);
  if (!auth.authenticated || !auth.user) {
    return c.json({ error: 'Admin JWT authentication required to revoke API keys' }, 401);
  }

  const id = c.req.param('id');
  try {
    if (c.env?.DB) {
      await c.env.DB.prepare('DELETE FROM api_keys WHERE id = ?').bind(id).run();
    } else {
      for (const [hash, key] of localApiKeysStore.entries()) {
        if (key.id === id) {
          localApiKeysStore.delete(hash);
          break;
        }
      }
    }
    return c.json({ success: true, id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// List Media Assets from D1 / Storage (Filtered or public)
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

// 4. Upload Media Asset: Protected by JWT Session OR Scoped API Key
app.post('/api/media/upload', async (c) => {
  // Check authorization
  const auth = await authenticateRequest(c);
  if (!auth.authenticated) {
    return c.json({ error: `401 Unauthorized: ${auth.error}` }, 401);
  }

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

// 5. Delete Media from Storage: Protected by Admin JWT Session
app.delete('/api/media/:id', async (c) => {
  const auth = await authenticateRequest(c);
  if (!auth.authenticated || !auth.user) {
    return c.json({ error: 'Admin JWT authentication required to delete media assets' }, 401);
  }

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
    const cleanId = rawParam.replace(/\.(webp|png|jpe?g|avif|gif)$/i, '');

    let imageBytes: Uint8Array | null = null;
    let mimeType = 'image/webp';

    // 1. Check in-memory store first (super fast)
    const mem = localMemoryStore.get(cleanId);
    if (mem && mem.data_blob) {
      imageBytes = mem.data_blob;
      mimeType = mem.mime_type || mimeType;
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

          // Populate in-memory store for future requests
          localMemoryStore.set(cleanId, {
            id: cleanId,
            filename: record.filename || `${cleanId}.webp`,
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
