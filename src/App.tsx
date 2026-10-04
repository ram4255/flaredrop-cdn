/**
 * FlareDrop CDN - Open Source Personal Cloudflare Media CDN
 * Powered by Hono, Cloudflare Workers, D1 Database, and Client + wsrv.nl Optimization
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { MediaStorage } from './components/MediaStorage';
import { WsrvOptimizer } from './components/WsrvOptimizer';
import { SettingsView } from './components/SettingsView';
import { DeployCenter } from './components/DeployCenter';
import { OneTimeSetup } from './components/OneTimeSetup';
import { AdminLogin } from './components/AdminLogin';
import { AdminUser, MediaAsset, CloudflareDeployConfig } from './types';
import { generateCloudflareTemplates } from './lib/cloudflare-templates';
import { downloadRepoZip } from './lib/zip-exporter';
import { optimizeImageClientSide } from './lib/client-optimizer';

export default function App() {
  const [activeTab, setActiveTab] = useState<'media' | 'optimizer' | 'settings' | 'deploy'>('media');

  // Check if one-time onboarding has been completed
  const [isInitialized, setIsInitialized] = useState<boolean>(() => {
    return localStorage.getItem('flaredrop_initialized') === 'true';
  });

  const [adminUser, setAdminUser] = useState<AdminUser | null>(() => {
    const saved = localStorage.getItem('flaredrop_admin_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  // Fresh secret generation function
  const createFreshConfig = (): CloudflareDeployConfig => {
    const randomHex = (bytes = 6) =>
      Array.from({ length: bytes }, () =>
        Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
      ).join('');

    return {
      projectName: 'flaredrop-media-cdn',
      githubRepoUrl: 'https://github.com/ram4255/flaredrop-cdn',
      d1DatabaseName: 'flaredrop_cdn_db',
      d1DatabaseId: `d1_${randomHex(4)}`,
      r2BucketName: `flaredrop-media-store`,
      authSecretKey: `cf_sec_${randomHex(16)}`,
      jwtSecret: `jwt_${randomHex(24)}`,
      wsrvEndpoint: 'https://wsrv.nl/',
      defaultQuality: 80,
      defaultFormat: 'webp',
      cacheMaxAge: 31536000,
    };
  };

  const [config, setConfig] = useState<CloudflareDeployConfig>(createFreshConfig);

  const [assets, setAssets] = useState<MediaAsset[]>(() => {
    const saved = localStorage.getItem('flaredrop_assets');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  // Sync with Cloudflare D1 Backend on mount
  useEffect(() => {
    const syncBackend = async () => {
      try {
        // Check backend setup status
        const statusRes = await fetch('/api/setup/status').catch(() => null);
        if (statusRes && statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.initialized) {
            setIsInitialized(true);
            localStorage.setItem('flaredrop_initialized', 'true');
          }
        }

        // Fetch stored media assets from D1
        const mediaRes = await fetch('/api/media').catch(() => null);
        if (mediaRes && mediaRes.ok) {
          const mediaData = await mediaRes.json();
          if (mediaData.success && Array.isArray(mediaData.items) && mediaData.items.length > 0) {
            setAssets(mediaData.items);
            localStorage.setItem('flaredrop_assets', JSON.stringify(mediaData.items));
            return;
          }
        }
      } catch (err) {
        console.warn('Backend sync warning:', err);
      }
    };

    syncBackend();
  }, []);

  // Sync assets to localStorage
  useEffect(() => {
    localStorage.setItem('flaredrop_assets', JSON.stringify(assets));
  }, [assets]);

  const handleRegenerateSecrets = () => {
    setConfig((prev) => ({
      ...prev,
      ...createFreshConfig(),
      githubRepoUrl: prev.githubRepoUrl,
    }));
  };

  const handleUploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadNotice('Optimizing image client-side to WebP...');

    try {
      // 1. Client-Side Image Optimization & Compression
      const opt = await optimizeImageClientSide(file, {
        maxWidth: 2560,
        maxHeight: 2560,
        quality: 0.82,
        format: 'image/webp',
      });

      setUploadNotice(`Client optimized: ${Math.round(opt.originalSize / 1024)}KB ➔ ${Math.round(opt.optimizedSize / 1024)}KB (${opt.savingsPercent}% savings). Uploading to Cloudflare D1...`);

      // 2. Upload Optimized Image to Cloudflare D1
      const formData = new FormData();
      formData.append('file', opt.blob, opt.filename);
      formData.append('width', opt.width.toString());
      formData.append('height', opt.height.toString());

      const res = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
      }).catch(() => null);

      const origin = window.location.origin;

      if (res && res.ok) {
        const data = await res.json();
        if (data.success && data.asset) {
          const newAsset: MediaAsset = {
            ...data.asset,
            url: data.asset.cdnUrl || `${origin}/cdn/${data.asset.id}.webp`,
            thumbnailUrl: opt.dataUrl,
          };
          setAssets((prev) => [newAsset, ...prev.filter((a) => a.id !== newAsset.id)]);
          setSelectedAsset(newAsset);
          setUploadNotice(`✓ Uploaded to CDN successfully: ${newAsset.cdnUrl}`);
          setTimeout(() => setUploadNotice(null), 4000);
          return;
        }
      }

      // Fallback: local storage
      const id = `img_${Date.now()}`;
      const cdnUrl = `${origin}/cdn/${id}.webp`;
      const fallbackAsset: MediaAsset = {
        id,
        filename: opt.filename,
        title: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        url: opt.dataUrl,
        thumbnailUrl: opt.dataUrl,
        sizeBytes: opt.optimizedSize,
        mimeType: opt.mimeType,
        width: opt.width,
        height: opt.height,
        r2Key: `${id}.webp`,
        cdnUrl,
        optimizedUrl: `${origin}/cdn/${id}.webp?w=800&q=80`,
        createdAt: new Date().toISOString(),
      };

      setAssets((prev) => [fallbackAsset, ...prev]);
      setSelectedAsset(fallbackAsset);
      setUploadNotice(`✓ Stored successfully (${opt.savingsPercent}% compression savings)`);
      setTimeout(() => setUploadNotice(null), 3500);
    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadNotice(`Upload failed: ${err.message}`);
      setTimeout(() => setUploadNotice(null), 4000);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAsset = async (id: string) => {
    try {
      await fetch(`/api/media/${id}`, { method: 'DELETE' }).catch(() => null);
    } catch (e) {
      console.warn('Delete request failed:', e);
    }
    setAssets((prev) => prev.filter((a) => a.id !== id));
    if (selectedAsset?.id === id) {
      setSelectedAsset(null);
    }
  };

  const handleOpenInOptimizer = (asset: MediaAsset) => {
    setSelectedAsset(asset);
    setActiveTab('optimizer');
  };

  // One-time setup completion
  const handleCompleteOneTimeSetup = (user: AdminUser) => {
    setAdminUser(user);
    setIsInitialized(true);
    localStorage.setItem('flaredrop_initialized', 'true');
    localStorage.setItem('flaredrop_admin_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setAdminUser(null);
  };

  const handleDownloadZip = async () => {
    setIsDownloadingZip(true);
    try {
      const templates = generateCloudflareTemplates(config);
      await downloadRepoZip(templates, `${config.projectName}-cloudflare-cdn.zip`);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // 1. One-Time Setup on First Deploy (Only happens once!)
  if (!isInitialized) {
    return (
      <OneTimeSetup
        config={config}
        onComplete={handleCompleteOneTimeSetup}
      />
    );
  }

  // 2. Authentication Login (If owner logged out)
  if (!adminUser) {
    return (
      <AdminLogin
        onLoginSuccess={(user) => setAdminUser(user)}
        registeredUser={adminUser}
        onGoToOnboarding={() => setIsInitialized(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onDownloadZip={handleDownloadZip}
        isDownloadingZip={isDownloadingZip}
        adminUser={adminUser}
        onLogout={handleLogout}
      />

      {uploadNotice && (
        <div className="bg-orange-950/80 border-b border-orange-500/30 px-4 py-2 text-center text-xs font-medium text-orange-200">
          {uploadNotice}
        </div>
      )}

      <main className="flex-1 pb-16">
        {activeTab === 'media' && (
          <MediaStorage
            assets={assets}
            onUpload={handleUploadFile}
            onDelete={handleDeleteAsset}
            onOpenInOptimizer={handleOpenInOptimizer}
            isUploading={isUploading}
          />
        )}

        {activeTab === 'optimizer' && (
          <WsrvOptimizer
            assets={assets}
            selectedAsset={selectedAsset}
            onSelectAsset={(a) => setSelectedAsset(a)}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            config={config}
            adminUser={adminUser}
            onRegenerateSecret={handleRegenerateSecrets}
            onLogout={handleLogout}
          />
        )}

        {activeTab === 'deploy' && (
          <DeployCenter
            config={config}
            onUpdateConfig={(c) => setConfig(c)}
            onRegenerateSecrets={handleRegenerateSecrets}
          />
        )}
      </main>

      <footer className="border-t border-neutral-800 bg-neutral-900/50 py-4 text-center text-xs text-neutral-400">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong className="text-white">FlareDrop CDN</strong> · 100% Free Cloudflare D1 Storage &amp; Edge Delivery
          </div>
          <div className="flex items-center gap-4 text-neutral-400 text-xs">
            <a href="https://wsrv.nl" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
              wsrv.nl Docs
            </a>
            <a href="https://developers.cloudflare.com/d1/" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
              Cloudflare D1 Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
