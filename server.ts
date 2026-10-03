import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { app } from './src/server/app';

// In production, serve the built Vite static assets
app.use('/*', serveStatic({ root: './dist' }));

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
console.log(`Starting FlareDrop CDN server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});
