import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  UploadCloud,
  Copy,
  Check,
  Trash2,
  Sliders,
  ExternalLink,
  Search,
  Loader2,
  LayoutGrid,
  List,
  Maximize2,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  ArrowUpDown,
  CheckSquare,
  Square,
  Sparkles,
  Info,
  Code2
} from 'lucide-react';
import { MediaAsset } from '../types';
import { formatBytes } from '../lib/wsrv';

interface MediaStorageProps {
  assets: MediaAsset[];
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
  onOpenInOptimizer: (asset: MediaAsset) => void;
  isUploading?: boolean;
}

export const MediaStorage: React.FC<MediaStorageProps> = ({
  assets,
  onUpload,
  onDelete,
  onOpenInOptimizer,
  isUploading = false,
}) => {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [gridDensity, setGridDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [filterFormat, setFilterFormat] = useState<'all' | 'webp' | 'png-jpg' | 'landscape' | 'portrait'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'size-desc' | 'size-asc' | 'name'>('newest');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxAsset, setLightboxAsset] = useState<MediaAsset | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [codeSnippetTab, setCodeSnippetTab] = useState<'direct' | 'dynamic' | 'html' | 'react' | 'markdown'>('direct');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://flaredrop.workers.dev';

  // Keyboard navigation for lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightboxAsset) return;

      if (e.key === 'Escape') {
        setLightboxAsset(null);
      } else if (e.key === 'ArrowLeft') {
        navigateLightbox(-1);
      } else if (e.key === 'ArrowRight') {
        navigateLightbox(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxAsset, assets]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!isUploading && e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  // Filter and sort assets
  const filteredAndSortedAssets = useMemo(() => {
    return assets
      .filter((asset) => {
        // Search filter
        const matchesSearch =
          asset.title.toLowerCase().includes(search.toLowerCase()) ||
          asset.filename.toLowerCase().includes(search.toLowerCase()) ||
          asset.id.toLowerCase().includes(search.toLowerCase());
        if (!matchesSearch) return false;

        // Format filter
        if (filterFormat === 'webp') {
          return asset.mimeType?.includes('webp') || asset.filename.endsWith('.webp');
        }
        if (filterFormat === 'png-jpg') {
          return asset.mimeType?.includes('png') || asset.mimeType?.includes('jpeg') || asset.filename.match(/\.(png|jpe?g)$/i);
        }
        if (filterFormat === 'landscape') {
          return asset.width > asset.height && asset.height > 0;
        }
        if (filterFormat === 'portrait') {
          return asset.height > asset.width && asset.width > 0;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        }
        if (sortBy === 'size-desc') {
          return b.sizeBytes - a.sizeBytes;
        }
        if (sortBy === 'size-asc') {
          return a.sizeBytes - b.sizeBytes;
        }
        if (sortBy === 'name') {
          return a.title.localeCompare(b.title);
        }
        return 0;
      });
  }, [assets, search, filterFormat, sortBy]);

  // Navigate lightbox to next or previous photo
  const navigateLightbox = (direction: -1 | 1) => {
    if (!lightboxAsset) return;
    const currentIndex = filteredAndSortedAssets.findIndex((a) => a.id === lightboxAsset.id);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + direction + filteredAndSortedAssets.length) % filteredAndSortedAssets.length;
    setLightboxAsset(filteredAndSortedAssets[nextIndex]);
  };

  // Toggle selection for batch actions
  const toggleSelectAsset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredAndSortedAssets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedAssets.map((a) => a.id)));
    }
  };

  const handleBatchCopyUrls = () => {
    const urls = filteredAndSortedAssets
      .filter((a) => selectedIds.has(a.id))
      .map((a) => `${origin}/cdn/${a.id}.webp`)
      .join('\n');
    copyToClipboard(urls, 'batch_urls');
  };

  const handleBatchDelete = () => {
    if (confirm(`Are you sure you want to delete ${selectedIds.size} selected assets from Cloudflare D1?`)) {
      selectedIds.forEach((id) => onDelete(id));
      setSelectedIds(new Set());
    }
  };

  // Helper to trigger direct download
  const handleDownloadAsset = (asset: MediaAsset) => {
    const url = asset.cdnUrl || `${origin}/cdn/${asset.id}.webp`;
    const a = document.createElement('a');
    a.href = url;
    a.download = asset.filename || `${asset.id}.webp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Gallery Header & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-400 mb-1">
            <span>Cloudflare D1 Media Storage</span>
            <span aria-hidden="true">·</span>
            <span>Edge Delivery</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>Media Gallery</span>
            <span className="text-xs font-normal font-mono px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
              {filteredAndSortedAssets.length} {filteredAndSortedAssets.length === 1 ? 'photo' : 'photos'}
            </span>
          </h1>
          <p className="mt-1 text-xs text-neutral-400 max-w-2xl">
            High-speed personal CDN gallery stored directly in Cloudflare D1 SQL BLOB with global edge caching.
          </p>
        </div>

        {/* Upload Action Button */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-orange-600/20 hover:bg-orange-500 transition-all whitespace-nowrap disabled:opacity-50"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )}
            <span>{isUploading ? 'Optimizing & Uploading...' : 'Upload Image'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            disabled={isUploading}
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
            className="hidden"
          />
        </div>
      </div>

      {/* Drag & Drop Upload Zone (Compact & Responsive) */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!isUploading) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-5 sm:p-7 text-center transition-all ${
          isDragging
            ? 'border-orange-500 bg-orange-950/20 scale-[0.99]'
            : 'border-neutral-800/80 bg-neutral-900/30 hover:border-neutral-700 hover:bg-neutral-900/50'
        } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <div className="mx-auto flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-neutral-800/80 text-orange-500">
          {isUploading ? (
            <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin text-orange-400" />
          ) : (
            <UploadCloud className="h-5 w-5 sm:h-6 sm:w-6" />
          )}
        </div>
        <div className="mt-2.5">
          <p className="text-xs sm:text-sm font-semibold text-white">
            {isUploading
              ? 'Client-side converting to compressed WebP & storing in D1...'
              : 'Drop image here or click to browse'}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            JPG, PNG, WebP, GIF, AVIF · Client-side WebP compression with zero credit card required
          </p>
        </div>
      </div>

      {/* Gallery Toolbar: Search, Filters, View Modes & Sorting */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-3 sm:p-4 space-y-3 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, filename, or ID..."
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Right Controls: Sort & View Toggle */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-1 text-xs">
              <ArrowUpDown className="h-3 w-3 text-neutral-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-neutral-300 text-xs focus:outline-none cursor-pointer"
              >
                <option value="newest" className="bg-neutral-950 text-white">Newest First</option>
                <option value="oldest" className="bg-neutral-950 text-white">Oldest First</option>
                <option value="size-desc" className="bg-neutral-950 text-white">Largest Size</option>
                <option value="size-asc" className="bg-neutral-950 text-white">Smallest Size</option>
                <option value="name" className="bg-neutral-950 text-white">Name (A-Z)</option>
              </select>
            </div>

            {/* Density Switcher (when in grid mode) */}
            {viewMode === 'grid' && (
              <div className="hidden sm:flex items-center border border-neutral-800 rounded-xl p-0.5 bg-neutral-950">
                <button
                  type="button"
                  onClick={() => setGridDensity('comfortable')}
                  title="Comfortable Grid"
                  className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                    gridDensity === 'comfortable' ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Large
                </button>
                <button
                  type="button"
                  onClick={() => setGridDensity('compact')}
                  title="Compact Grid"
                  className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                    gridDensity === 'compact' ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Compact
                </button>
              </div>
            )}

            {/* View Mode Toggle: Grid vs Table */}
            <div className="flex items-center border border-neutral-800 rounded-xl p-0.5 bg-neutral-950">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Gallery Grid View"
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'grid' ? 'bg-orange-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title="Table List View"
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'table' ? 'bg-orange-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter Chips Bar */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-800/60 overflow-x-auto text-xs">
          <div className="flex items-center gap-1.5 min-w-max">
            <span className="text-neutral-500 text-[11px] mr-1 flex items-center gap-1">
              <Filter className="h-3 w-3" /> Filter:
            </span>
            {(
              [
                { id: 'all', label: `All (${assets.length})` },
                { id: 'webp', label: 'WebP' },
                { id: 'png-jpg', label: 'PNG / JPG' },
                { id: 'landscape', label: 'Landscape' },
                { id: 'portrait', label: 'Portrait' },
              ] as const
            ).map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setFilterFormat(filter.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filterFormat === filter.id
                    ? 'bg-neutral-800 text-white border border-neutral-700 shadow-sm'
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Batch Select Toggle */}
          {filteredAndSortedAssets.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[11px] text-neutral-400 hover:text-white font-medium"
              >
                {selectedIds.size === filteredAndSortedAssets.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating Batch Actions Dock (When items are selected) */}
      {selectedIds.size > 0 && (
        <div className="sticky top-16 z-30 flex items-center justify-between gap-3 rounded-xl border border-orange-500/40 bg-neutral-900/95 backdrop-blur-md px-4 py-2.5 shadow-2xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-600 text-[10px]">
              {selectedIds.size}
            </span>
            <span>assets selected</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBatchCopyUrls}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700 hover:text-white"
            >
              {copiedKey === 'batch_urls' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copiedKey === 'batch_urls' ? 'Copied URLs' : 'Copy All URLs'}</span>
            </button>
            <button
              type="button"
              onClick={handleBatchDelete}
              className="inline-flex items-center gap-1 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-900/60"
            >
              <Trash2 className="h-3 w-3" />
              <span>Delete</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="p-1 text-neutral-400 hover:text-white"
              title="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Gallery Empty State */}
      {filteredAndSortedAssets.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-12 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-800/60 text-neutral-500">
            <LayoutGrid className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-white">No media assets found</h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            {search || filterFormat !== 'all'
              ? 'Try changing your search term or active filter.'
              : 'Drop an image or click the Upload button above to generate your first live Edge CDN endpoint!'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* 1. GALLERY GRID VIEW (Modern DAM / Apple Photos Style) */
        <div
          className={`grid ${
            gridDensity === 'compact'
              ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3.5'
              : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-5'
          }`}
        >
          {filteredAndSortedAssets.map((asset) => {
            const directCdnUrl = `${origin}/cdn/${asset.id}.webp`;
            const isSelected = selectedIds.has(asset.id);

            return (
              <div
                key={asset.id}
                onClick={() => setLightboxAsset(asset)}
                className={`group relative flex flex-col rounded-2xl border bg-neutral-900/60 overflow-hidden transition-all cursor-pointer hover:border-neutral-700 hover:shadow-xl hover:shadow-black/40 ${
                  isSelected ? 'border-orange-500 ring-2 ring-orange-500/30' : 'border-neutral-800/80'
                }`}
              >
                {/* Visual Thumbnail Stage */}
                <div className="relative aspect-square sm:aspect-[4/3] w-full overflow-hidden bg-neutral-950 flex items-center justify-center">
                  <img
                    src={asset.thumbnailUrl || asset.url || directCdnUrl}
                    alt={asset.title}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      if (asset.url && (e.target as HTMLImageElement).src !== asset.url) {
                        (e.target as HTMLImageElement).src = asset.url;
                      }
                    }}
                  />

                  {/* Top Overlay Badges */}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                    {/* Selection Checkbox */}
                    <button
                      type="button"
                      onClick={(e) => toggleSelectAsset(asset.id, e)}
                      className={`pointer-events-auto p-1 rounded-lg backdrop-blur-md transition-all ${
                        isSelected
                          ? 'bg-orange-600 text-white opacity-100'
                          : 'bg-neutral-950/60 text-white opacity-0 group-hover:opacity-100 hover:bg-neutral-900'
                      }`}
                    >
                      {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-md bg-neutral-950/80 backdrop-blur-md text-orange-400 border border-neutral-800">
                        {asset.mimeType?.split('/')[1] || 'webp'}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-neutral-950/80 backdrop-blur-md text-neutral-300 border border-neutral-800">
                        {formatBytes(asset.sizeBytes)}
                      </span>
                    </div>
                  </div>

                  {/* Hover Quick Action Buttons */}
                  <div className="absolute inset-0 bg-neutral-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxAsset(asset);
                      }}
                      title="Inspect Details"
                      className="p-2 rounded-xl bg-neutral-900/90 text-white hover:bg-neutral-800 hover:scale-110 transition-all border border-neutral-700 shadow-lg"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(directCdnUrl, `card_${asset.id}`);
                      }}
                      title="Copy Direct CDN URL"
                      className="p-2 rounded-xl bg-neutral-900/90 text-white hover:bg-neutral-800 hover:scale-110 transition-all border border-neutral-700 shadow-lg"
                    >
                      {copiedKey === `card_${asset.id}` ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenInOptimizer(asset);
                      }}
                      title="Tune in Optimizer Studio"
                      className="p-2 rounded-xl bg-orange-600 text-white hover:bg-orange-500 hover:scale-110 transition-all shadow-lg"
                    >
                      <Sliders className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Card Meta Footer */}
                <div className="p-3 border-t border-neutral-800/80 flex flex-col justify-between gap-1.5 bg-neutral-950/40">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-white truncate max-w-[160px]" title={asset.title}>
                      {asset.title}
                    </h4>
                    <span className="text-[11px] font-mono text-neutral-400 shrink-0 tabular-nums">
                      {asset.width > 0 ? `${asset.width}×${asset.height}` : 'Dynamic'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono pt-1 border-t border-neutral-800/40">
                    <span className="truncate max-w-[120px]">{asset.id}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete ${asset.title} from CDN storage?`)) {
                          onDelete(asset.id);
                        }
                      }}
                      className="text-neutral-500 hover:text-red-400 transition-colors p-0.5"
                      title="Delete asset"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 2. TABLE / DETAILED LIST VIEW */
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950 text-[11px] uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4 w-12">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === filteredAndSortedAssets.length}
                      onChange={handleSelectAll}
                      className="rounded border-neutral-700 bg-neutral-900 text-orange-600 focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Preview</th>
                  <th className="py-3 px-4">Filename &amp; D1 ID</th>
                  <th className="py-3 px-4">Dimensions</th>
                  <th className="py-3 px-4">File Size</th>
                  <th className="py-3 px-4">Live Edge CDN Endpoint</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80">
                {filteredAndSortedAssets.map((asset) => {
                  const directCdnUrl = `${origin}/cdn/${asset.id}.webp`;
                  const dynamicCdnUrl = `${origin}/cdn/${asset.id}.webp?w=800&q=80`;
                  const isSelected = selectedIds.has(asset.id);

                  return (
                    <tr key={asset.id} className={`hover:bg-neutral-800/30 ${isSelected ? 'bg-orange-950/15' : ''}`}>
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleSelectAsset(asset.id, e as any)}
                          className="rounded border-neutral-700 bg-neutral-900 text-orange-600 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Thumbnail with Lightbox trigger */}
                      <td className="py-3 px-4 w-16">
                        <div
                          onClick={() => setLightboxAsset(asset)}
                          className="h-12 w-12 rounded-lg overflow-hidden border border-neutral-800 bg-neutral-950 flex items-center justify-center cursor-pointer hover:opacity-80"
                        >
                          <img
                            src={asset.thumbnailUrl || asset.url || directCdnUrl}
                            alt={asset.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      </td>

                      {/* Title & ID */}
                      <td className="py-3 px-4">
                        <div
                          onClick={() => setLightboxAsset(asset)}
                          className="font-semibold text-white truncate max-w-[200px] cursor-pointer hover:underline"
                        >
                          {asset.title}
                        </div>
                        <div className="font-mono text-[11px] text-neutral-400">
                          {asset.id} · <span className="uppercase text-orange-400">{asset.mimeType?.split('/')[1] || 'webp'}</span>
                        </div>
                      </td>

                      {/* Dimensions */}
                      <td className="py-3 px-4 font-mono text-[11px] text-neutral-300 tabular-nums">
                        {asset.width > 0 ? `${asset.width}×${asset.height}` : 'Dynamic'}
                      </td>

                      {/* File Size */}
                      <td className="py-3 px-4 font-mono text-[11px] text-neutral-300 tabular-nums">
                        {formatBytes(asset.sizeBytes)}
                      </td>

                      {/* Live CDN Endpoints */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1.5">
                          {/* Direct CDN URL */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-neutral-400 w-12">Direct:</span>
                            <code className="text-[11px] font-mono text-emerald-400 truncate max-w-[220px]">
                              {directCdnUrl}
                            </code>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(directCdnUrl, `dir_${asset.id}`)}
                              title="Copy Direct CDN URL"
                              className="p-1 text-neutral-400 hover:text-white"
                            >
                              {copiedKey === `dir_${asset.id}` ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                            <a
                              href={directCdnUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="Open Direct in New Tab"
                              className="p-1 text-neutral-400 hover:text-white"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>

                          {/* Dynamic Transform URL */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-neutral-400 w-12">Dynamic:</span>
                            <code className="text-[11px] font-mono text-orange-400 truncate max-w-[220px]">
                              {dynamicCdnUrl}
                            </code>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(dynamicCdnUrl, `dyn_${asset.id}`)}
                              title="Copy Dynamic CDN URL"
                              className="p-1 text-neutral-400 hover:text-white"
                            >
                              {copiedKey === `dyn_${asset.id}` ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenInOptimizer(asset)}
                            className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700 transition-colors"
                          >
                            <Sliders className="h-3 w-3 text-orange-400" />
                            <span>Tune</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setLightboxAsset(asset)}
                            title="Inspect Details"
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800"
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete ${asset.title} from CDN storage?`)) {
                                onDelete(asset.id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-neutral-800"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. LIGHTBOX & ASSET INSPECTOR MODAL (Full Gallery Experience) */}
      {lightboxAsset && (
        <div className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-neutral-950/95 backdrop-blur-2xl animate-in fade-in duration-200">
          {/* Main Photo Stage */}
          <div className="relative flex-1 flex flex-col items-center justify-center p-4 sm:p-8 min-h-[50vh] lg:min-h-full">
            {/* Top Bar for Stage */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10 pointer-events-none">
              <div className="flex items-center gap-2 pointer-events-auto bg-neutral-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-neutral-800 text-xs text-neutral-300">
                <span className="font-semibold text-white">{lightboxAsset.title}</span>
                <span className="text-neutral-500">·</span>
                <span className="text-neutral-400 font-mono text-[11px]">
                  {filteredAndSortedAssets.findIndex((a) => a.id === lightboxAsset.id) + 1} of {filteredAndSortedAssets.length}
                </span>
              </div>

              {/* Close Button on Mobile / Desktop */}
              <button
                type="button"
                onClick={() => setLightboxAsset(null)}
                className="pointer-events-auto p-2 rounded-xl bg-neutral-900/80 backdrop-blur-md text-neutral-400 hover:text-white border border-neutral-800 transition-colors"
                title="Close (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Previous / Next Arrow Controls */}
            {filteredAndSortedAssets.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => navigateLightbox(-1)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-neutral-900/80 backdrop-blur-md text-white hover:bg-neutral-800 border border-neutral-800 transition-all hover:scale-110 shadow-2xl z-10"
                  title="Previous image (Left arrow)"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => navigateLightbox(1)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-neutral-900/80 backdrop-blur-md text-white hover:bg-neutral-800 border border-neutral-800 transition-all hover:scale-110 shadow-2xl z-10"
                  title="Next image (Right arrow)"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}

            {/* High-Res Image Display */}
            <div className="relative max-w-full max-h-[70vh] lg:max-h-[82vh] flex items-center justify-center">
              <img
                src={lightboxAsset.url || `${origin}/cdn/${lightboxAsset.id}.webp`}
                alt={lightboxAsset.title}
                className="max-h-[70vh] lg:max-h-[82vh] max-w-full object-contain rounded-xl shadow-2xl"
              />
            </div>
          </div>

          {/* Right Inspector & Code Drawer */}
          <div className="w-full lg:w-[420px] border-t lg:border-t-0 lg:border-l border-neutral-800 bg-neutral-900/90 flex flex-col max-h-[50vh] lg:max-h-full overflow-y-auto p-5 space-y-5">
            {/* Inspector Header */}
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Asset Inspector</h3>
                <p className="text-[11px] text-neutral-400">Live Edge Endpoint &amp; Metadata</p>
              </div>

              <button
                type="button"
                onClick={() => setLightboxAsset(null)}
                className="hidden lg:flex p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* CDN Endpoints Box */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-neutral-300 block">Edge CDN Endpoints</span>

              {/* Direct CDN URL */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-emerald-400">Direct Live Edge CDN</span>
                  <a
                    href={`${origin}/cdn/${lightboxAsset.id}.webp`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-400 hover:text-white flex items-center gap-1"
                  >
                    <span>Open</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${origin}/cdn/${lightboxAsset.id}.webp`}
                    className="w-full bg-neutral-900 text-neutral-200 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-neutral-800 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${origin}/cdn/${lightboxAsset.id}.webp`, 'lb_direct')}
                    className="p-1.5 rounded-lg bg-neutral-800 text-neutral-200 hover:text-white shrink-0"
                    title="Copy Direct URL"
                  >
                    {copiedKey === 'lb_direct' ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Dynamic Resizing Endpoint */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-orange-400">Dynamic Transform (800px WebP)</span>
                  <span className="text-[10px] text-neutral-500 font-mono">?w=800&amp;q=80</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${origin}/cdn/${lightboxAsset.id}.webp?w=800&q=80`}
                    className="w-full bg-neutral-900 text-neutral-200 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-neutral-800 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${origin}/cdn/${lightboxAsset.id}.webp?w=800&q=80`, 'lb_dynamic')}
                    className="p-1.5 rounded-lg bg-neutral-800 text-neutral-200 hover:text-white shrink-0"
                    title="Copy Dynamic URL"
                  >
                    {copiedKey === 'lb_dynamic' ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Code Snippet Exporter */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-neutral-300 block">Embed Snippets</span>
              <div className="flex items-center gap-1 border-b border-neutral-800 pb-2">
                {(['html', 'react', 'markdown'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCodeSnippetTab(tab)}
                    className={`px-2.5 py-1 text-xs rounded-lg uppercase font-mono font-medium transition-colors ${
                      codeSnippetTab === tab
                        ? 'bg-orange-600 text-white font-semibold'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="relative rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 font-mono text-[11px] text-neutral-300 overflow-x-auto">
                {codeSnippetTab === 'html' && (
                  <pre><code>{`<picture>
  <source type="image/avif" srcset="${origin}/cdn/${lightboxAsset.id}.webp?w=800&output=avif" />
  <source type="image/webp" srcset="${origin}/cdn/${lightboxAsset.id}.webp?w=800&output=webp" />
  <img src="${origin}/cdn/${lightboxAsset.id}.webp?w=800" alt="${lightboxAsset.title}" loading="lazy" />
</picture>`}</code></pre>
                )}
                {codeSnippetTab === 'react' && (
                  <pre><code>{`<img 
  src="${origin}/cdn/${lightboxAsset.id}.webp?w=800&q=80" 
  alt="${lightboxAsset.title}" 
  loading="lazy" 
  className="w-full h-auto object-cover rounded-xl" 
/>`}</code></pre>
                )}
                {codeSnippetTab === 'markdown' && (
                  <pre><code>{`![${lightboxAsset.title}](${origin}/cdn/${lightboxAsset.id}.webp)`}</code></pre>
                )}

                <button
                  type="button"
                  onClick={() => {
                    let snippet = `<img src="${origin}/cdn/${lightboxAsset.id}.webp?w=800&q=80" alt="${lightboxAsset.title}" />`;
                    if (codeSnippetTab === 'markdown') snippet = `![${lightboxAsset.title}](${origin}/cdn/${lightboxAsset.id}.webp)`;
                    copyToClipboard(snippet, 'lb_snippet');
                  }}
                  className="absolute top-2 right-2 p-1 rounded-md bg-neutral-800 text-neutral-300 hover:text-white"
                  title="Copy Snippet"
                >
                  {copiedKey === 'lb_snippet' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Technical Metadata Grid */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-neutral-300 block">Metadata</span>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="rounded-lg bg-neutral-950 p-2.5 border border-neutral-800">
                  <span className="text-[10px] text-neutral-500 uppercase block">Resolution</span>
                  <span className="text-white font-medium">
                    {lightboxAsset.width > 0 ? `${lightboxAsset.width} × ${lightboxAsset.height} px` : 'Dynamic'}
                  </span>
                </div>
                <div className="rounded-lg bg-neutral-950 p-2.5 border border-neutral-800">
                  <span className="text-[10px] text-neutral-500 uppercase block">File Size</span>
                  <span className="text-white font-medium">{formatBytes(lightboxAsset.sizeBytes)}</span>
                </div>
                <div className="rounded-lg bg-neutral-950 p-2.5 border border-neutral-800">
                  <span className="text-[10px] text-neutral-500 uppercase block">Format</span>
                  <span className="text-orange-400 font-semibold uppercase">{lightboxAsset.mimeType || 'image/webp'}</span>
                </div>
                <div className="rounded-lg bg-neutral-950 p-2.5 border border-neutral-800">
                  <span className="text-[10px] text-neutral-500 uppercase block">Edge Cache</span>
                  <span className="text-emerald-400 font-medium">1 Year Immutable</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  onOpenInOptimizer(lightboxAsset);
                  setLightboxAsset(null);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg hover:bg-orange-500 transition-colors"
              >
                <Sliders className="h-4 w-4" />
                <span>Tune in Optimizer Studio</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadAsset(lightboxAsset)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete ${lightboxAsset.title} from CDN storage?`)) {
                      onDelete(lightboxAsset.id);
                      setLightboxAsset(null);
                    }
                  }}
                  className="flex items-center justify-center gap-1 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-900/50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
