import React, { useState } from 'react';
import { Download, Zap, LogOut, Github, Sliders, Image as ImageIcon, Settings, Menu, X, ExternalLink } from 'lucide-react';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: { id: 'media' | 'optimizer' | 'settings' | 'deploy'; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'media', label: 'Gallery Library', icon: ImageIcon },
    { id: 'optimizer', label: 'Optimizer Studio', icon: Sliders },
    { id: 'settings', label: 'Settings & Edge', icon: Settings },
    { id: 'deploy', label: 'GitHub & Deploy', icon: Github },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8">
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
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-600 text-white shadow-sm shadow-orange-600/30">
                <Zap className="h-4 w-4 fill-current" />
              </div>
              <span className="text-base sm:text-sm font-bold tracking-tight">FlareDrop</span>
              <span className="hidden sm:inline text-[11px] font-normal text-neutral-500 font-mono">
                gallery cdn
              </span>
            </a>
          </div>

          {/* Center: Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-neutral-400">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`transition-colors hover:text-white py-1 ${
                  activeTab === item.id
                    ? 'font-bold text-white underline decoration-orange-500 decoration-2 underline-offset-8'
                    : ''
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Right: Actions & User Info */}
          <div className="flex items-center gap-2 sm:gap-3">
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
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="hidden lg:inline truncate max-w-[130px] text-[11px]">{adminUser.email}</span>
                <button
                  type="button"
                  onClick={onLogout}
                  title="Sign out of owner console"
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors"
                >
                  <LogOut className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
              </div>
            )}

            {/* Mobile Menu Hamburger (for quick drawer) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-neutral-800 bg-neutral-950 px-4 py-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 pb-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      activeTab === item.id
                        ? 'bg-orange-600 text-white font-semibold'
                        : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-neutral-900 flex items-center justify-between text-xs text-neutral-400">
              <button
                type="button"
                onClick={() => {
                  onDownloadZip();
                  setMobileMenuOpen(false);
                }}
                disabled={isDownloadingZip}
                className="inline-flex items-center gap-1 text-xs text-neutral-300 hover:text-white"
              >
                <Download className="h-3.5 w-3.5 text-neutral-500" />
                <span>Download Repo (.zip)</span>
              </button>

              {adminUser && (
                <span className="text-[11px] font-mono text-neutral-500 truncate max-w-[150px]">
                  {adminUser.email}
                </span>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Floating Bottom Navigation Bar for Mobile Phones (Native App Feel) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur-lg px-2 py-1 flex items-center justify-around shadow-2xl safe-area-inset-bottom">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg text-[10px] font-medium transition-colors ${
                isActive
                  ? 'text-orange-400 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Icon className={`h-4 w-4 mb-0.5 ${isActive ? 'text-orange-500' : 'text-neutral-400'}`} />
              <span>{item.id === 'media' ? 'Gallery' : item.id === 'optimizer' ? 'Tune' : item.id === 'settings' ? 'Settings' : 'Deploy'}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
