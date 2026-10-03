# FlareDrop CDN ⚡

> Open-Source, Zero-Configuration Personal Image & Media CDN built with **Hono** for **Cloudflare Workers** & **D1 Database**, featuring automated edge image optimization via **wsrv.nl**.
> **100% Free Tier · Zero Credit Card Required** (Runs entirely on Cloudflare's free D1 database without payment setup).

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/singhramprasad522/flaredrop-cdn)

Deploy your own high-speed media CDN to Cloudflare in **1 click**. No credit card needed, no manual database configuration, zero egress fees, and sub-10ms global edge cache delivery.

---

## 🚀 1-Click Deployment (No Credit Card Needed)

Click the **Deploy to Cloudflare Workers** button above. Cloudflare will automatically:
1. Fork/clone this repository to your GitHub account.
2. Automatically provision your **Cloudflare D1 Database** (`flaredrop_cdn_db`) on the 100% free tier.
3. Automatically execute and inject the database schema (`schema.sql`).
4. Deploy the **Hono Edge Engine** to 300+ global Cloudflare data centers.
5. On your first visit to your deployed worker URL, a **one-time owner setup** prompts you to create your master password.

> **Why D1 Storage over R2?**
> Cloudflare R2 requires a credit card / billing setup to activate, even on the free tier. FlareDrop CDN uses **Cloudflare D1 Database** natively for both image metadata and binary BLOB delivery, ensuring **anyone** can deploy for free without providing a credit card. (Optional R2 bucket can still be bound if desired).

---

## 🛠️ Local Development & Manual Deploy

\`\`\`bash
# 1. Clone repository
git clone https://github.com/singhramprasad522/flaredrop-cdn.git
cd flaredrop-cdn

# 2. Install dependencies
npm install

# 3. Start local development server (Vite + Hono)
npm run dev

# 4. Deploy directly via Cloudflare Wrangler CLI
npx wrangler deploy
\`\`\`

---

## 🗄️ Cloudflare D1 Database (Auto-Created on Boot)

The D1 SQLite database is initialized automatically with \`schema.sql\` on worker boot:

\`\`\`sql
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
\`\`\`

---

## 🖼️ Dynamic Image Optimization with \`wsrv.nl\`

All media endpoints support dynamic query parameters powered by the global [wsrv.nl](https://wsrv.nl/) proxy:

- **Resize Width & WebP**: \`GET /image/:id?w=800&output=webp&q=80\`
- **Square Crop AVIF**: \`GET /image/:id?w=600&h=600&fit=cover&output=avif\`
- **Retina 2x Scale**: \`GET /image/:id?w=400&dpr=2\`
- **Monochrome Filter**: \`GET /image/:id?w=1200&filt=greyscale\`
- **Direct Raw Stream (D1)**: \`GET /media/:id\`

---

## 🔐 Auto-Generated Security

- **AUTH_SECRET**: Cryptographic token auto-generated on every deployment.
- **JWT_SECRET**: Auto-generated 256-bit token for admin session signing.
- **CORS_ORIGIN**: Permissive \`*\` or lock to your custom domain.

---

## 📡 API Endpoints

### Upload Media to D1
\`\`\`bash
curl -X POST https://YOUR_WORKER.workers.dev/api/media/upload \\
  -H "Authorization: Bearer YOUR_AUTH_SECRET" \\
  -F "file=@my-photo.png"
\`\`\`

### D1 Database Health
\`\`\`bash
curl https://YOUR_WORKER.workers.dev/api/health
\`\`\`

---

## 📄 License

MIT Open Source License. Built with Vite, React, Hono, Cloudflare Workers, D1 Database, and wsrv.nl.
