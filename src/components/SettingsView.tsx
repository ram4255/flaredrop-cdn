import React, { useState } from 'react';
import { Key, Copy, Check, RefreshCw, Database, Shield, LogOut, CheckCircle2, Zap } from 'lucide-react';
import { CloudflareDeployConfig, AdminUser } from '../types';

interface SettingsViewProps {
  config: CloudflareDeployConfig;
  adminUser: AdminUser | null;
  onRegenerateSecret: () => void;
  onLogout: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  config,
  adminUser,
  onRegenerateSecret,
  onLogout,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="border-b border-neutral-800 pb-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-1">
          <CheckCircle2 className="h-4 w-4" />
          <span>100% Free Tier · Zero Credit Card Required</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
          Personal CDN Settings &amp; Edge Config
        </h1>
        <p className="mt-1 text-xs text-neutral-400">
          Powered exclusively by Cloudflare D1 Serverless SQL and global edge caches.
        </p>
      </div>

      {/* Cloudflare Edge Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* D1 Database */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="flex items-center gap-1.5 text-white font-semibold">
              <Database className="h-4 w-4 text-orange-500" />
              <span>D1 SQL Database</span>
            </span>
            <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              <span>Free Tier</span>
            </span>
          </div>
          <div className="font-mono text-xs text-neutral-300 font-semibold truncate">
            {config.d1DatabaseName}
          </div>
          <p className="text-[11px] text-neutral-500">
            Stores media binary BLOBs and metadata without credit card.
          </p>
        </div>

        {/* Global Cache */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="flex items-center gap-1.5 text-white font-semibold">
              <Zap className="h-4 w-4 text-orange-500" />
              <span>Cloudflare Cache API</span>
            </span>
            <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              <span>Sub-10ms</span>
            </span>
          </div>
          <div className="font-mono text-xs text-neutral-300 font-semibold truncate">
            caches.default
          </div>
          <p className="text-[11px] text-neutral-500">
            Sub-millisecond global PoP delivery with 1-year immutable caching.
          </p>
        </div>

        {/* wsrv.nl Proxy */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="flex items-center gap-1.5 text-white font-semibold">
              <Shield className="h-4 w-4 text-orange-500" />
              <span>Image Optimizer</span>
            </span>
            <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              <span>Pre-Set</span>
            </span>
          </div>
          <div className="font-mono text-xs text-orange-400 font-semibold truncate">
            {config.wsrvEndpoint}
          </div>
          <p className="text-[11px] text-neutral-500">
            Automatic dynamic on-the-fly resizing and WebP/AVIF output.
          </p>
        </div>
      </div>

      {/* Secret API Key Box */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="h-4 w-4 text-orange-500" />
              <span>Personal Secret Key (AUTH_SECRET)</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Used to authorize programmatic media uploads via curl, scripts, or apps
            </p>
          </div>

          <button
            type="button"
            onClick={onRegenerateSecret}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5 text-orange-400" />
            <span>Generate New Secret</span>
          </button>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <code className="font-mono text-xs text-orange-400 truncate max-w-xl">
            {config.authSecretKey}
          </code>
          <button
            type="button"
            onClick={() => copyToClipboard(config.authSecretKey, 'secret')}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white px-2 py-1 rounded"
          >
            {copiedKey === 'secret' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedKey === 'secret' ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Account Info & Logout */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 flex items-center justify-between">
        <div>
          <span className="text-xs text-neutral-400 block">Personal Instance Owner</span>
          <span className="text-sm font-bold text-white font-mono">{adminUser?.email || 'Admin'}</span>
          <span className="text-[11px] text-neutral-500 block mt-0.5">Single-tenant personal deployment</span>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/50 bg-red-950/20 px-3.5 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-900/30 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );
};
