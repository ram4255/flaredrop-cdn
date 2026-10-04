import React, { useState, useRef } from 'react';
import { UploadCloud, Copy, Check, Trash2, Sliders, ExternalLink, Search, Loader2 } from 'lucide-react';
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://flaredrop.workers.dev';

  const filteredAssets = assets.filter((a) =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.filename.toLowerCase().includes(search.toLowerCase()) ||
    a.id.toLowerCase().includes(search.toLowerCase())
  );

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Media Storage &amp; CDN Endpoints
          </h1>
          <p className="mt-1 text-xs text-neutral-400">
            Client-optimized WebP stored directly in Cloudflare D1 with global edge caching (Zero Credit Card Required)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter assets..."
              className="rounded-lg border border-neutral-800 bg-neutral-900 pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-500 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )}
            <span>{isUploading ? 'Optimizing & Uploading...' : 'Upload Media'}</span>
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

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!isUploading) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
          isDragging
            ? 'border-orange-500 bg-orange-950/20'
            : 'border-neutral-800 bg-neutral-900/40 hover:border-neutral-700'
        } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-800/80 text-orange-500">
          {isUploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-orange-400" />
          ) : (
            <UploadCloud className="h-6 w-6" />
          )}
        </div>
        <div className="mt-4">
          <p className="text-sm font-semibold text-white">
            {isUploading ? 'Client-Side Optimizing to WebP & Uploading to D1...' : 'Drop any image file here or click to browse'}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            Automatically converts to compressed WebP client-side, scales dimensions, and stores in Cloudflare D1 SQL
          </p>
        </div>
      </div>

      {/* Asset Table */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Media Library ({filteredAssets.length} {filteredAssets.length === 1 ? 'asset' : 'assets'})
          </div>
          <div className="text-[11px] text-neutral-500 font-mono">
            Origin: {origin}
          </div>
        </div>

        {filteredAssets.length === 0 ? (
          <div className="p-12 text-center text-neutral-500 text-xs">
            No media assets found. Upload an image above to generate your first live CDN endpoint!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950/60 text-[11px] uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Preview</th>
                  <th className="py-3 px-4">Filename &amp; D1 ID</th>
                  <th className="py-3 px-4">Dimensions</th>
                  <th className="py-3 px-4">File Size</th>
                  <th className="py-3 px-4">Live Edge CDN Endpoint</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80">
                {filteredAssets.map((asset) => {
                  const directCdnUrl = `${origin}/cdn/${asset.id}.webp`;
                  const dynamicCdnUrl = `${origin}/cdn/${asset.id}.webp?w=800&q=80`;

                  return (
                    <tr key={asset.id} className="hover:bg-neutral-800/30">
                      {/* Thumbnail */}
                      <td className="py-3 px-4 w-16">
                        <div className="h-12 w-12 rounded-lg overflow-hidden border border-neutral-800 bg-neutral-950 flex items-center justify-center">
                          <img
                            src={asset.thumbnailUrl || asset.url || directCdnUrl}
                            alt={asset.title}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              // If failed to load from cdn, fallback to url
                              if (asset.url && (e.target as HTMLImageElement).src !== asset.url) {
                                (e.target as HTMLImageElement).src = asset.url;
                              }
                            }}
                          />
                        </div>
                      </td>

                      {/* Title & ID */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white truncate max-w-[200px]">
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

                      {/* CDN Endpoints */}
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
                              title="Open Direct Image in New Tab"
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
                              title="Copy Dynamic Query CDN URL"
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
                            title="Open in wsrv.nl image optimizer"
                          >
                            <Sliders className="h-3 w-3 text-orange-400" />
                            <span>Tune</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onDelete(asset.id)}
                            className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-950/40 hover:text-red-400 transition-colors"
                            title="Delete from Cloudflare D1"
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
        )}
      </div>
    </div>
  );
};
