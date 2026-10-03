import React from 'react';
import { Download, Zap, LogOut, Github, Settings } from 'lucide-react';
import { AdminUser } from '../types';

interface HeaderProps {
  activeTab: 'media' | 'optimizer' | 'settings' | 'deploy';
  setActiveTab: (tab: 'media' | 'optimizer' | 'settings' | 'deploy') => void;
  adminUser: AdminUser | null;
  onLogout: () => void;
  onDownloadZip: () => void;
  isDownloadingZip: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  adminUser,
  onLogout,
  onDownloadZip,
  isDownloadingZip,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-neutral-950/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('media');
            }}
            className="flex items-center gap-2.5 text-sm font-bold tracking-tight text-white transition-opacity hover:opacity-90"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-600 text-white shadow-sm shadow-orange-600/20">
              <Zap className="h-4 w-4 fill-current" />
            </div>
            <span>FlareDrop</span>
            <span className="hidden sm:inline text-[11px] font-normal text-neutral-500 font-mono">
              personal cdn
            </span>
          </a>
        </div>

        {/* Center: Navigation Links */}
        <nav className="flex items-center gap-6 text-xs font-medium text-neutral-400">
          <button
            onClick={() => setActiveTab('media')}
            className={`transition-colors hover:text-white ${
              activeTab === 'media'
                ? 'font-bold text-white underline decoration-orange-500 decoration-2 underline-offset-8'
                : ''
            }`}
          >
            Media Library
          </button>
          <button
            onClick={() => setActiveTab('optimizer')}
            className={`transition-colors hover:text-white ${
              activeTab === 'optimizer'
                ? 'font-bold text-white underline decoration-orange-500 decoration-2 underline-offset-8'
                : ''
            }`}
          >
            Optimizer Studio
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`transition-colors hover:text-white ${
              activeTab === 'settings'
                ? 'font-bold text-white underline decoration-orange-500 decoration-2 underline-offset-8'
                : ''
            }`}
          >
            Settings &amp; Edge
          </button>
          <button
            onClick={() => setActiveTab('deploy')}
            className={`transition-colors hover:text-white ${
              activeTab === 'deploy'
                ? 'font-bold text-white underline decoration-orange-500 decoration-2 underline-offset-8'
                : ''
            }`}
          >
            GitHub Repo &amp; Deploy
          </button>
        </nav>

        {/* Right: Actions & User */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onDownloadZip}
            disabled={isDownloadingZip}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5 text-neutral-400" />
            <span>{isDownloadingZip ? 'Archiving...' : 'Download Repo ZIP'}</span>
          </button>

          {adminUser && (
            <div className="flex items-center gap-2 pl-2 border-l border-neutral-800 text-xs text-neutral-400 font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="hidden md:inline truncate max-w-[130px]">{adminUser.email}</span>
              <button
                type="button"
                onClick={onLogout}
                title="Log out"
                className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
