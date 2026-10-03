import React, { useState } from 'react';
import { Lock, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';
import { AdminUser, CloudflareDeployConfig } from '../types';

interface OneTimeSetupProps {
  config: CloudflareDeployConfig;
  onComplete: (user: AdminUser) => void;
}

export const OneTimeSetup: React.FC<OneTimeSetupProps> = ({
  config,
  onComplete,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const admin: AdminUser = {
        id: `admin_${Date.now()}`,
        email: email.trim(),
        name: 'CDN Owner',
        role: 'admin',
        createdAt: new Date().toISOString(),
      };
      onComplete(admin);
      setIsSubmitting(false);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 selection:bg-orange-500/20 selection:text-orange-400">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-600/20">
          <Zap className="h-6 w-6 fill-current" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Setup Your Personal CDN
        </h1>
        <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
          One-time owner setup for your private Cloudflare CDN instance. Runs 100% on Cloudflare's free tier with zero credit card required.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md space-y-4">
        {/* Pre-configured Infrastructure Pill */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3.5 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-neutral-300 font-medium">D1 Database:</span>
            <span className="text-emerald-400 font-mono text-[11px]">Auto-Created (No Card Required)</span>
          </div>
          <span className="font-mono text-[11px] text-neutral-500">Free Tier</span>
        </div>

        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl space-y-4"
        >
          {error && (
            <div className="rounded-lg bg-red-950/40 border border-red-800/60 p-3 text-xs text-red-300 font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Admin Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@yourdomain.com"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none transition-colors"
              required
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
              placeholder="••••••••"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none transition-colors"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-orange-600/20 hover:bg-orange-500 transition-all disabled:opacity-50"
          >
            <span>{isSubmitting ? 'Initializing CDN...' : 'Complete Setup & Launch CDN'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <p className="text-center text-[11px] text-neutral-500">
          This setup runs only once on your deployment. Public registrations are permanently disabled.
        </p>
      </div>
    </div>
  );
};
