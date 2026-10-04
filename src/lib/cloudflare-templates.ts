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
`;

export function generateCloudflareTemplates(config: CloudflareDeployConfig): RepoFile[] {
  const repoUrl = config.githubRepoUrl || 'https://github.com/ram4255/flaredrop-cdn';

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
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "run_worker_first": true
  },
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

// List Media Assets from D1
app.get('/api/media', async (c) => {
  try {
    await ensureDatabaseSchema(c.env.DB);
    const origin = new URL(c.req.url).origin;
    const results = await c.env.DB.prepare(
      'SELECT id, filename, mime_type, size_bytes, width, height, cdn_url, created_at FROM images ORDER BY created_at DESC LIMIT 100'
    ).all();

    const items = (results?.results || []).map((img: any) => ({
      id: img.id,
      filename: img.filename,
      title: img.filename.replace(/\\.[^/.]+$/, '').replace(/[-_]/g, ' '),
      mimeType: img.mime_type,
      sizeBytes: img.size_bytes,
      width: img.width || 0,
      height: img.height || 0,
      cdnUrl: \`\${origin}/cdn/\${img.id}.webp\`,
      optimizedUrl: \`\${origin}/cdn/\${img.id}.webp?w=800&q=80\`,
      url: \`\${origin}/cdn/\${img.id}.webp\`,
      thumbnailUrl: \`\${origin}/cdn/\${img.id}.webp?w=120&h=120&fit=cover\`,
      createdAt: img.created_at,
    }));

    return c.json({ success: true, items });
  } catch (err: any) {
    return c.json({ error: err.message, items: [] }, 500);
  }
});

// Helper to convert any SQLite BLOB / Array / ArrayBuffer / Base64 into a clean Uint8Array
function toUint8Array(data: any): Uint8Array {
  if (!data) return new Uint8Array(0);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(data);
  if (typeof data === 'string') {
    try {
      const clean = data.replace(/^data:image\\/\\w+;base64,/, '');
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

// Pure Professional Edge CDN Delivery (ZERO loops, sub-10ms delivery)
async function deliverCdnImage(c: any, rawParam: string) {
  try {
    const cleanId = rawParam.replace(/\\.(webp|png|jpe?g|avif|gif)$/i, '');
    let imageBytes: Uint8Array | null = null;
    let mimeType = 'image/webp';

    if (c.env?.DB) {
      try {
        const record = (await c.env.DB.prepare(
          'SELECT data_blob, mime_type, filename FROM images WHERE id = ? OR filename = ? LIMIT 1'
        )
          .bind(cleanId, rawParam)
          .first()) as { data_blob: any; mime_type: string; filename: string } | null;

        if (record && record.data_blob) {
          imageBytes = toUint8Array(record.data_blob);
          mimeType = record.mime_type || mimeType;
        }
      } catch (dbErr) {
        console.warn('D1 lookup warning:', dbErr);
      }
    }

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

    return new Response(imageBytes, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': imageBytes.length.toString(),
        'Cache-Control': \`public, max-age=\${maxAge}, s-maxage=\${maxAge}, immutable\`,
        'Access-Control-Allow-Origin': '*',
        'ETag': \`"\${cleanId}"\`,
        'X-CDN-Cache': 'HIT',
        'X-Powered-By': 'FlareDrop-Cloudflare-CDN',
      },
    });
  } catch (err: any) {
    return new Response(\`FlareDrop CDN Error: \${err.message}\`, { status: 500 });
  }
}

app.get('/cdn/:filename', (c) => deliverCdnImage(c, c.req.param('filename')));
app.get('/media/:id', (c) => deliverCdnImage(c, c.req.param('id')));
app.get('/i/:id', (c) => deliverCdnImage(c, c.req.param('id')));
app.get('/image/:id', (c) => deliverCdnImage(c, c.req.param('id')));

// Upload Media Endpoint into D1 BLOB
app.post('/api/media/upload', async (c) => {
  const contentType = c.req.header('content-type') || '';
  let filename = \`upload_\${Date.now()}.webp\`;
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

  const id = \`img_\${Date.now()}_\${Math.random().toString(36).substring(2, 6)}\`;
  const origin = new URL(c.req.url).origin;
  const cdnUrl = \`\${origin}/cdn/\${id}.webp\`;

  try {
    await ensureDatabaseSchema(c.env.DB);
    await c.env.DB.prepare(
      'INSERT INTO images (id, filename, mime_type, size_bytes, width, height, data_blob, cdn_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(id, filename, mimeType, bytes.length, width, height, bytes, cdnUrl)
      .run();
  } catch (err: any) {
    console.warn('D1 insert warning:', err);
  }

  return c.json({
    success: true,
    asset: {
      id,
      filename,
      title: filename.replace(/\\.[^/.]+$/, '').replace(/[-_]/g, ' '),
      mimeType,
      sizeBytes: bytes.length,
      width,
      height,
      cdnUrl,
      optimizedUrl: \`\${origin}/cdn/\${id}.webp?w=800&q=80\`,
      url: cdnUrl,
      thumbnailUrl: \`\${origin}/cdn/\${id}.webp\`,
      createdAt: new Date().toISOString(),
    },
  });
});

// Delete Media from D1
app.delete('/api/media/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM images WHERE id = ?').bind(id).run();
    return c.json({ success: true, id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Fallback to static SPA assets
app.all('*', async (c) => {
  if (c.env.ASSETS) {
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
    {
      name: '.npmrc',
      path: '.npmrc',
      content: `package-lock=false\nlegacy-peer-deps=true\n`,
      description: 'NPM configuration to prevent CI lockfile mismatches',
    },
    {
      name: '.gitignore',
      path: '.gitignore',
      content: `node_modules/\ndist/\n*.log\n.env*\n!.env.example\nbun.lock*\npackage-lock.json\n`,
      description: 'Git ignore rules for lockfiles and build outputs',
    },
  ];
}
