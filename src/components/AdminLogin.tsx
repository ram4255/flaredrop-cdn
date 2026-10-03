import React, { useState } from 'react';
import { Lock, ArrowRight, Zap } from 'lucide-react';
import { AdminUser } from '../types';

interface AdminLoginProps {
  onLoginSuccess: (user: AdminUser) => void;
  registeredUser: AdminUser | null;
  onGoToOnboarding: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({
  onLoginSuccess,
  registeredUser,
  onGoToOnboarding,
}) => {
  const [email, setEmail] = useState(registeredUser?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please provide email and password');
      return;
    }

    if (registeredUser && registeredUser.email.toLowerCase() !== email.toLowerCase()) {
      setError('Unknown admin account for this CDN instance');
      return;
    }

    const user: AdminUser = registeredUser || {
      id: 'admin_1',
      email,
      name: 'System Admin',
      role: 'admin',
      createdAt: new Date().toISOString(),
    };

    onLoginSuccess(user);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 selection:bg-orange-500/20 selection:text-orange-400">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-orange-600 text-white shadow-lg shadow-orange-600/20">
          <Zap className="h-5 w-5 fill-current" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Admin Sign In
        </h1>
        <p className="text-xs text-neutral-400">
          Sign into your FlareDrop Cloudflare CDN Console
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md space-y-4">
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
              placeholder="admin@yourdomain.com"
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

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-orange-600/20 hover:bg-orange-500 transition-all"
          >
            <span>Sign In to Dashboard</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="text-center pt-2">
          <button
            type="button"
            onClick={onGoToOnboarding}
            className="text-xs text-neutral-400 hover:text-white transition-colors"
          >
            New deployment? <span className="text-orange-400 underline decoration-neutral-600">Run First-Deploy Onboarding</span>
          </button>
        </div>
      </div>
    </div>
  );
};
