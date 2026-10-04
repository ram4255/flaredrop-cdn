import React, { useState, useEffect } from 'react';
import {
  Key,
  Copy,
  Check,
  RefreshCw,
  Database,
  Shield,
  LogOut,
  CheckCircle2,
  Zap,
  Plus,
  Trash2,
  Terminal,
  Lock,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { CloudflareDeployConfig, AdminUser, ApiKeyItem } from '../types';

interface SettingsViewProps {
  config: CloudflareDeployConfig;
  adminUser: AdminUser | null;
  authToken?: string | null;
  onRegenerateSecret: () => void;
  onLogout: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  config,
  adminUser,
  authToken,
  onRegenerateSecret,
  onLogout,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Fetch active API keys
  const loadApiKeys = async () => {
    setIsLoadingKeys(true);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch('/api/keys', { headers }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.keys)) {
          setApiKeys(data.keys);
        }
      }
    } catch (e) {
      console.warn('Failed to load API keys:', e);
    } finally {
      setIsLoadingKeys(false);
    }
  };

  useEffect(() => {
    loadApiKeys();
  }, [authToken]);

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setIsCreatingKey(true);
    setKeyError(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch('/api/keys', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: newKeyName.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create API key');
      }

      setNewlyCreatedKey(data.apiKey.fullKey);
      setNewKeyName('');
      loadApiKeys();
    } catch (err: any) {
      setKeyError(err.message || 'Error generating key');
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? Any script using it will stop working immediately.')) {
      return;
    }

    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`/api/keys/${id}`, { method: 'DELETE', headers });
      if (res.ok) {
        setApiKeys((prev) => prev.filter((k) => k.id !== id));
      }
    } catch (e) {
      console.warn('Failed to revoke API key:', e);
    }
  };

  const curlSnippet = `curl -X POST "${window.location.origin}/api/media/upload" \\
  -H "Authorization: Bearer ${newlyCreatedKey || (apiKeys[0]?.keyPrefix ? `${apiKeys[0].keyPrefix}...` : 'fd_live_sk_YOUR_KEY')}" \\
  -F "file=@photo.webp"`;

  return (
    <div className="mx-auto max-w-5xl px-3 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="border-b border-neutral-800 pb-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-1">
          <ShieldCheck className="h-4 w-4" />
          <span>Hardened Personal CDN Architecture</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          Security &amp; API Management Console
        </h1>
        <p className="mt-1 text-xs text-neutral-400">
          Powered by PBKDF2-SHA256, HMAC-SHA256 Edge JWT sessions, Cloudflare D1 SQL, and edge rate limiting.
        </p>
      </div>

      {/* 4-Pillar Security Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="text-white font-semibold flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-orange-500" />
              <span>Password Hashing</span>
            </span>
            <span className="text-emerald-400 text-[10px] font-mono">100k rounds</span>
          </div>
          <div className="text-[11px] text-neutral-300 font-mono">PBKDF2-SHA256</div>
          <p className="text-[10px] text-neutral-500">16-byte cryptographically secure salt + constant-time check</p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="text-white font-semibold flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-orange-500" />
              <span>Session Security</span>
            </span>
            <span className="text-emerald-400 text-[10px] font-mono">7 Days</span>
          </div>
          <div className="text-[11px] text-neutral-300 font-mono">HMAC-SHA256 JWT</div>
          <p className="text-[10px] text-neutral-500">Cryptographically verified at edge in &lt;1ms</p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="text-white font-semibold flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-orange-500" />
              <span>Brute-Force Guard</span>
            </span>
            <span className="text-emerald-400 text-[10px] font-mono">5 Attempts</span>
          </div>
          <div className="text-[11px] text-neutral-300 font-mono">Sliding Window IP</div>
          <p className="text-[10px] text-neutral-500">15-minute freeze on repeated failed logins</p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="text-white font-semibold flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-orange-500" />
              <span>Public CDN Route</span>
            </span>
            <span className="text-emerald-400 text-[10px] font-mono">Global Edge</span>
          </div>
          <div className="text-[11px] text-neutral-300 font-mono">/cdn/:filename</div>
          <p className="text-[10px] text-neutral-500">Cached across 300+ edge cities, sub-10ms delivery</p>
        </div>
      </div>

      {/* Programmatic API Keys Section */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800/80 pb-4">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="h-4 w-4 text-orange-500" />
              <span>Scoped Programmatic Upload Keys</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Generate dedicated API keys for CLI scripts, GitHub Actions, or blog uploaders without exposing your master password.
            </p>
          </div>

          <form onSubmit={handleCreateApiKey} className="flex items-center gap-2">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g., Blog Uploader, CLI"
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none transition-colors w-44"
              required
            />
            <button
              type="submit"
              disabled={isCreatingKey}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-orange-500 transition-colors disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{isCreatingKey ? 'Creating...' : 'Create Key'}</span>
            </button>
          </form>
        </div>

        {keyError && (
          <div className="rounded-lg bg-red-950/40 border border-red-800/60 p-3 text-xs text-red-300">
            {keyError}
          </div>
        )}

        {/* Newly Created Key Alert Banner */}
        {newlyCreatedKey && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>New API Key Generated! Copy it now (it cannot be shown again):</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-neutral-950 p-2.5">
              <code className="font-mono text-xs text-emerald-300 select-all break-all">
                {newlyCreatedKey}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(newlyCreatedKey, 'newKey')}
                className="ml-3 inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-white px-2.5 py-1 rounded bg-emerald-900/40"
              >
                {copiedKey === 'newKey' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedKey === 'newKey' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        {/* API Keys Table */}
        <div className="space-y-2">
          {isLoadingKeys ? (
            <div className="py-4 text-center text-xs text-neutral-500">Loading API keys...</div>
          ) : apiKeys.length === 0 ? (
            <div className="py-6 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
              No programmatic keys created yet. Generate one above to upload from outside the browser.
            </div>
          ) : (
            <div className="space-y-2">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950/70 p-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-white flex items-center gap-2">
                      <span>{key.name}</span>
                      <span className="font-mono text-[10px] text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                        {key.keyPrefix}...
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      Created: {new Date(key.createdAt).toLocaleDateString()} · Status: <span className="text-emerald-400">Active</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRevokeApiKey(key.id)}
                    className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 p-1.5 rounded hover:bg-red-950/30 transition-colors"
                    title="Revoke Key"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Revoke</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* cURL Example Code Snippet */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-orange-400" />
              <span>cURL Programmatic Upload Command</span>
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard(curlSnippet, 'curl')}
              className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1"
            >
              {copiedKey === 'curl' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copiedKey === 'curl' ? 'Copied' : 'Copy cURL'}</span>
            </button>
          </div>
          <pre className="font-mono text-[11px] text-neutral-300 overflow-x-auto p-2 bg-neutral-900/60 rounded-lg">
            {curlSnippet}
          </pre>
        </div>
      </div>

      {/* Change Master Password Section */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Lock className="h-4 w-4 text-orange-500" />
            <span>Update Master Password</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Update your PBKDF2 master password (re-hashes with 100,000 iterations and fresh salt).
          </p>
        </div>

        <ChangePasswordForm authToken={authToken} />
      </div>

      {/* Master Deploy Secret (Gatekeeper) */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="h-4 w-4 text-orange-500" />
              <span>Master Deploy Secret (AUTH_SECRET)</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              The root secret used during first-run deployment claim in <code>wrangler.jsonc</code>
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
          <span className="text-sm font-bold text-white font-mono">{adminUser?.email || 'owner@domain.com'}</span>
          <span className="text-[11px] text-emerald-400 block mt-0.5">✓ Authenticated via HMAC-SHA256 JWT</span>
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

const ChangePasswordForm: React.FC<{ authToken?: string | null }> = ({ authToken }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (newPassword.length < 8) {
      setStatus({ type: 'error', message: 'New password must be at least 8 characters long.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus({ type: 'error', message: 'New passwords do not match.' });
      return;
    }

    setIsSaving(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers,
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update password');
      }

      setStatus({ type: 'success', message: '✓ Master password updated successfully with PBKDF2-SHA256!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Error updating password' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {status && (
        <div
          className={`rounded-lg p-3 text-xs font-medium border ${
            status.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-red-950/40 border-red-800/60 text-red-300'
          }`}
        >
          {status.message}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1">Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1">New Password (8+ chars)</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none"
            required
          />
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-orange-500 transition-colors disabled:opacity-50"
        >
          <span>{isSaving ? 'Updating...' : 'Save New Password'}</span>
        </button>
      </div>
    </form>
  );
};
