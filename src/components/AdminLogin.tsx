import React, { useState } from 'react';
import { Lock, ArrowRight, Shield, AlertTriangle, ShieldAlert } from 'lucide-react';
import { AdminUser } from '../types';

interface AdminLoginProps {
  onLoginSuccess: (user: AdminUser, token: string) => void;
  registeredUser: AdminUser | null;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({
  onLoginSuccess,
  registeredUser,
}) => {
  const [email, setEmail] = useState(registeredUser?.email || 'singhramprasad522@gmail.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please provide email and password');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (res.status === 429) {
        setIsRateLimited(true);
        throw new Error(data.error || 'Rate limit triggered. Too many failed attempts. Try again in 15 minutes.');
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid credentials');
      }

      onLoginSuccess(data.user, data.token);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 selection:bg-orange-500/20 selection:text-orange-400">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-600/20">
          <Shield className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          FlareDrop CDN Console
        </h1>
        <p className="text-xs text-neutral-400">
          Owner Access Only · Single-Tenant Personal Media Edge
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md space-y-4">
        {/* Security Info Pill */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-neutral-300 font-medium">Access Control:</span>
            <span className="text-emerald-400 font-mono text-[11px]">Strict Owner Only</span>
          </div>
          <span className="font-mono text-[11px] text-neutral-500">Zero Public Signups</span>
        </div>

        {/* Error / Alert Banner */}
        {error && (
          <div className={`rounded-lg p-3 text-xs font-medium flex items-start gap-2 border ${
            isRateLimited 
              ? 'bg-red-950/60 border-red-700 text-red-200' 
              : 'bg-red-950/40 border-red-800/60 text-red-300'
          }`}>
            {isRateLimited ? (
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            )}
            <div>{error}</div>
          </div>
        )}

        {/* PURE SIGN IN FORM ONLY - NO SIGNUP EXISTS */}
        <form
          onSubmit={handleLoginSubmit}
          className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Owner Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@yourdomain.com"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none transition-colors"
              required
              disabled={isRateLimited}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Master Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none transition-colors"
              required
              disabled={isRateLimited}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || isRateLimited}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-orange-600/20 hover:bg-orange-500 transition-all disabled:opacity-50"
          >
            <span>{isLoading ? 'Verifying Credentials...' : 'Sign In to Dashboard'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {/* Lockout Notice */}
        <div className="text-center pt-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 text-[11px] text-neutral-500 font-mono">
            <Lock className="h-3 w-3 text-orange-500" />
            <span>Private Personal Instance · Public Registration Disabled</span>
          </div>
        </div>
      </div>
    </div>
  );
};
