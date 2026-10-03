import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { generateCloudflareTemplates, SCHEMA_SQL } from '../lib/cloudflare-templates';
import { CloudflareDeployConfig } from '../types';

export const app = new Hono();

// Enable CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-cdn-auth'],
}));

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
