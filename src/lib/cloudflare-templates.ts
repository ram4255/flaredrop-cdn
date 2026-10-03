import { CloudflareDeployConfig, RepoFile } from '../types';

export const SCHEMA_SQL = `-- FlareDrop CDN - Cloudflare D1 Database Schema
-- 100% Free Tier · Zero Credit Card Required
-- Automatically injected on deployment boot!

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
`;

export function generateCloudflareTemplates(config: CloudflareDeployConfig): RepoFile[] {
  const repoUrl = config.githubRepoUrl || 'https://github.com/singhramprasad522/flaredrop-cdn';

  const readmeMd = `# ${config.projectName} ⚡

> Open-Source, Zero-Configuration Personal Image & Media CDN built with **Hono** for **Cloudflare Workers** & **D1 Database**, featuring automated edge image optimization via **wsrv.nl**.
> **100% Free Tier · Zero Credit Card Required** (Uses Cloudflare D1 Database without requiring R2 or payment verification).

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=${encodeURIComponent(repoUrl)})

Deploy your own high-speed media CDN to Cloudflare in **1 click**. No credit card needed, no manual database configuration, zero egress fees, and sub-10ms global edge cache delivery.

---

## 🚀 1-Click Deployment (Zero Credit Card Required)

Click the **Deploy to Cloudflare Workers** button above. Cloudflare will automatically:
1. Fork/clone this repository to your GitHub account.
2. Automatically provision your **Cloudflare D1 Database** (\`${config.d1DatabaseName}\`) on the 100% free tier.
3. Automatically execute and inject the database schema (\`schema.sql\`).
4. Deploy the **Hono Edge Engine** to 300+ global Cloudflare data centers.
5. On your first visit to your deployed worker URL, a **one-time owner setup** prompts you to create your master password.

---

## 🛠️ Local Development & Manual Deploy

\`\`\`bash
# 1. Clone repository
git clone ${repoUrl}.git
cd ${config.projectName}

# 2. Install dependencies
npm install

# 3. Start local development server (Vite + Hono)
npm run dev

# 4. Deploy directly via Cloudflare Wrangler CLI
npx wrangler deploy
\`\`\`

---

## 🖼️ Automated Image Optimization with \`wsrv.nl\`

All media endpoints support dynamic query parameters powered by the global [wsrv.nl](https://wsrv.nl/) proxy:

- \`GET /image/:id?w=800&output=webp&q=80\` : Auto-resize to 800px width, convert to WebP, quality 80%
- \`GET /image/:id?w=600&h=600&fit=cover&output=avif\` : 1:1 Square avatar, high-efficiency AVIF format
- \`GET /media/:id\` : Direct raw file stream from Cloudflare D1 Database
`;

  const wranglerJsonc = `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "${config.projectName}",
  "main": "src/index.ts",
  "compatibility_date": "2026-03-01",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true
  },
  // Cloudflare D1 Serverless SQL Database - 100% Free Tier (NO Credit Card Required!)
  // Schema auto-created on initial worker boot
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "${config.d1DatabaseName}",
      "database_id": "${config.d1DatabaseId || 'auto_create'}"
    }
  ],
  // Pre-configured environment variables and security tokens
  "vars": {
    "AUTH_SECRET": "${config.authSecretKey}",
    "JWT_SECRET": "${config.jwtSecret}",
    "WSRV_ENDPOINT": "${config.wsrvEndpoint}",
    "DEFAULT_QUALITY": "${config.defaultQuality}",
    "DEFAULT_FORMAT": "${config.defaultFormat}",
    "CACHE_MAX_AGE": "${config.cacheMaxAge}",
    "CORS_ORIGIN": "*"
  }
}
`;

  const workerTs = `/**
 * FlareDrop CDN - Cloudflare Worker Edge Engine
 * Built with Hono Web Framework
 * 
 * 100% Free Tier · Zero Credit Card Required:
 * - Uses Cloudflare D1 Database for both metadata and binary BLOB delivery
 * - Automatic D1 SQLite schema initialization on boot
 * - One-time owner onboarding & login
 * - Automatic image resizing & format transformation via wsrv.nl proxy
 * - Cloudflare Cache API (caches.default) for sub-10ms edge hits
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

export interface Env {
  DB: D1Database;
  AUTH_SECRET: string;
  JWT_SECRET: string;
  WSRV_ENDPOINT: string;
  DEFAULT_QUALITY: string;
  DEFAULT_FORMAT: string;
  CACHE_MAX_AGE: string;
  CORS_ORIGIN: string;
}

const app = new Hono<{ Bindings: Env }>();

// Auto-run schema migrations on boot
async function ensureDatabaseSchema(db: D1Database) {
  await db.exec(\`
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
  \`);
}

// Global CORS Middleware
app.use('*', async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.CORS_ORIGIN || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-cdn-auth'],
    maxAge: 86400,
  });
  return corsMiddleware(c, next);
});

// Setup status check
app.get('/api/setup/status', async (c) => {
  try {
    await ensureDatabaseSchema(c.env.DB);
    const admin = await c.env.DB.prepare('SELECT id, email FROM users LIMIT 1').first();
    return c.json({
      initialized: !!admin,
      adminEmail: admin ? (admin as any).email : null,
      d1Ready: true,
      freeTierReady: true,
      wsrvEndpoint: c.env.WSRV_ENDPOINT || 'https://wsrv.nl/',
    });
  } catch (err: any) {
    return c.json({ error: err.message, initialized: false }, 500);
  }
});

// One-time owner onboarding
app.post('/api/setup/init', async (c) => {
  try {
    await ensureDatabaseSchema(c.env.DB);
    const existing = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
    if (existing && existing.count > 0) {
      return c.json({ error: 'System is already initialized with an owner account' }, 400);
    }

    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const userId = \`admin_\${Date.now()}\`;
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
    const { email, password } = await c.req.json();
    const user = await c.env.DB.prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
      .bind(email)
      .first<{ id: string; email: string; password_hash: string }>();

    if (!user || user.password_hash !== password) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    return c.json({
      success: true,
      token: c.env.AUTH_SECRET,
      user: { id: user.id, email: user.email },
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Direct Media from D1 BLOB (Zero Credit Card Required!)
app.get('/media/:id', async (c) => {
  const id = c.req.param('id');
  const record = await c.env.DB.prepare('SELECT data_blob, mime_type, filename FROM images WHERE id = ?')
    .bind(id)
    .first<{ data_blob: ArrayBuffer | number[]; mime_type: string; filename: string }>();

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

// Optimized Image Endpoint via wsrv.nl & Cloudflare Edge Cache
app.get('/image/:id', async (c) => {
  const id = c.req.param('id');
  const cache = caches.default;
  const cacheKey = new Request(c.req.url, c.req.raw);

  // Edge Cache Lookup
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    const res = new Response(cachedResponse.body, cachedResponse);
    res.headers.set('X-CDN-Cache', 'HIT');
    return res;
  }

  const directMediaUrl = new URL(\`/media/\${id}\`, c.req.url).toString();

  // Construct wsrv.nl optimization URL
  const wsrvBase = c.env.WSRV_ENDPOINT || 'https://wsrv.nl/';
  const optimizerUrl = new URL(wsrvBase);
  optimizerUrl.searchParams.set('url', directMediaUrl);

  const query = c.req.query();
  for (const [k, v] of Object.entries(query)) {
    optimizerUrl.searchParams.set(k, v);
  }

  if (!optimizerUrl.searchParams.has('output')) {
    optimizerUrl.searchParams.set('output', c.env.DEFAULT_FORMAT || 'webp');
  }
  if (!optimizerUrl.searchParams.has('q')) {
    optimizerUrl.searchParams.set('q', c.env.DEFAULT_QUALITY || '80');
  }

  // Fetch optimized stream from wsrv.nl
  const response = await fetch(optimizerUrl.toString(), {
    headers: { 'User-Agent': 'FlareDrop-CDN-Edge-Worker' },
  });

  if (!response.ok) {
    return c.text(\`Optimization error from wsrv.nl: \${response.statusText}\`, response.status as any);
  }

  const maxAge = c.env.CACHE_MAX_AGE || '31536000';
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', \`public, max-age=\${maxAge}, s-maxage=\${maxAge}, immutable\`);
  headers.set('X-CDN-Cache', 'MISS');
  headers.set('X-Optimized-By', 'FlareDrop-wsrv.nl');

  const edgeResponse = new Response(response.body, { status: response.status, headers });
  c.executionCtx.waitUntil(cache.put(cacheKey, edgeResponse.clone()));

  return edgeResponse;
});

// Upload Media Endpoint into D1 BLOB
app.post('/api/media/upload', async (c) => {
  const authHeader = c.req.header('Authorization')?.replace('Bearer ', '') || c.req.header('x-cdn-auth');
  if (authHeader !== c.env.AUTH_SECRET) {
    return c.json({ error: 'Unauthorized: Invalid API auth key' }, 401);
  }

  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || typeof file === 'string') {
    return c.json({ error: 'File upload requires form-data field "file"' }, 400);
  }

  const fileObj = file as File;
  const fileId = \`img_\${Date.now()}_\${Math.random().toString(36).substring(2, 7)}\`;
  const fileBuffer = await fileObj.arrayBuffer();

  const cdnUrl = new URL(\`/media/\${fileId}\`, c.req.url).toString();
  const optimizedUrl = new URL(\`/image/\${fileId}?output=webp&q=80\`, c.req.url).toString();

  // Save to D1 Database as binary BLOB (Zero Credit Card Required!)
  await c.env.DB.prepare(
    'INSERT INTO images (id, filename, mime_type, size_bytes, data_blob, cdn_url) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(fileId, fileObj.name, fileObj.type || 'image/png', fileObj.size, fileBuffer, cdnUrl)
    .run();

  return c.json({
    success: true,
    image: {
      id: fileId,
      filename: fileObj.name,
      sizeBytes: fileObj.size,
      mimeType: fileObj.type,
      cdnUrl,
      optimizedUrl,
    },
  });
});

export default app;
`;

  const packageJson = `{
  "name": "${config.projectName}",
  "version": "1.0.0",
  "private": true,
  "description": "Zero-Config Cloudflare Personal Media CDN (100% Free Tier, No Credit Card Required)",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "db:init": "wrangler d1 execute ${config.d1DatabaseName} --file=./schema.sql"
  },
  "dependencies": {
    "hono": "^4.7.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250224.0",
    "typescript": "^5.7.0",
    "wrangler": "^3.114.0"
  }
}
`;

  return [
    {
      name: 'README.md',
      path: 'README.md',
      content: readmeMd,
      description: 'GitHub repository documentation with 1-Click Deploy to Cloudflare button (No Credit Card Required)',
    },
    {
      name: 'wrangler.jsonc',
      path: 'wrangler.jsonc',
      content: wranglerJsonc,
      description: 'Cloudflare Worker configuration with 100% Free D1 Database binding and auto-generated secrets',
    },
    {
      name: 'schema.sql',
      path: 'schema.sql',
      content: SCHEMA_SQL,
      description: 'D1 Database SQL schema with binary BLOB storage (auto-injected on deploy)',
    },
    {
      name: 'index.ts',
      path: 'src/index.ts',
      content: workerTs,
      description: 'Production Hono worker script with D1 binary image delivery, one-time owner setup, and wsrv.nl caching',
    },
    {
      name: 'package.json',
      path: 'package.json',
      content: packageJson,
      description: 'Node project dependencies and Wrangler deploy scripts',
    },
  ];
}
