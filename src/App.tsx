/**
 * FlareDrop CDN - Open Source Personal Cloudflare Media CDN
 * Powered by Hono, Cloudflare Workers, D1 Database, R2 Storage, and wsrv.nl
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
      githubRepoUrl: 'https://github.com/singhramprasad522/flaredrop-cdn',
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
      } catch (e) {}
    }
    return [];
  });

  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

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

  const handleUploadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const id = `img_${Date.now()}`;
        const ext = file.name.split('.').pop() || 'png';
        const r2Key = `${id}.${ext}`;
        const cdnUrl = `https://your-worker.workers.dev/media/${id}`;
        const optimizedUrl = `https://wsrv.nl/?url=${encodeURIComponent(cdnUrl)}&output=webp&q=80`;

        const newAsset: MediaAsset = {
          id,
          filename: file.name,
          title: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
          url: dataUrl,
          thumbnailUrl: dataUrl,
          sizeBytes: file.size,
          mimeType: file.type || 'image/png',
          width: img.width,
          height: img.height,
          r2Key,
          cdnUrl,
          optimizedUrl,
          createdAt: new Date().toISOString(),
        };

        setAssets((prev) => [newAsset, ...prev]);
        setSelectedAsset(newAsset);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteAsset = (id: string) => {
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

  // 2. If logged out, only the personal owner can log in
  if (!adminUser) {
    return (
      <AdminLogin
        onLoginSuccess={(user) => setAdminUser(user)}
        registeredUser={JSON.parse(localStorage.getItem('flaredrop_admin_user') || 'null')}
        onGoToOnboarding={() => {
          localStorage.removeItem('flaredrop_initialized');
          setIsInitialized(false);
        }}
      />
    );
  }

  // 3. Authenticated Personal CDN Dashboard
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-orange-500/20 selection:text-orange-400">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        adminUser={adminUser}
        onLogout={handleLogout}
        onDownloadZip={handleDownloadZip}
        isDownloadingZip={isDownloadingZip}
      />

      {/* Main Content */}
      <main className="flex-1 pb-16">
        {activeTab === 'media' && (
          <MediaStorage
            assets={assets}
            onUpload={handleUploadFile}
            onDelete={handleDeleteAsset}
            onOpenInOptimizer={handleOpenInOptimizer}
          />
        )}

        {activeTab === 'optimizer' && (
          <WsrvOptimizer
            assets={assets}
            selectedAsset={selectedAsset}
            onSelectAsset={setSelectedAsset}
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
            onUpdateConfig={setConfig}
            onRegenerateSecrets={handleRegenerateSecrets}
          />
        )}
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-neutral-800 bg-neutral-950 py-6 text-xs text-neutral-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">FlareDrop CDN</span>
            <span aria-hidden="true">·</span>
            <span>Open Source Personal Cloudflare Media CDN</span>
          </div>

          <div className="flex items-center gap-5">
            <a
              href="https://wsrv.nl/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-white transition-colors"
            >
              wsrv.nl Docs
            </a>
            <a
              href="https://developers.cloudflare.com/d1/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-white transition-colors"
            >
              Cloudflare D1 Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
