import React, { useState, useMemo } from 'react';
import { Sliders, Copy, Check, ExternalLink, RefreshCw, Code2, Globe } from 'lucide-react';
import { MediaAsset, TransformParams, ImageFormat, FitMode } from '../types';
import { buildWsrvUrl, formatBytes } from '../lib/wsrv';

interface WsrvOptimizerProps {
  assets: MediaAsset[];
  selectedAsset: MediaAsset | null;
  onSelectAsset: (asset: MediaAsset) => void;
}

export const WsrvOptimizer: React.FC<WsrvOptimizerProps> = ({
  assets,
  selectedAsset,
  onSelectAsset,
}) => {
  const [params, setParams] = useState<TransformParams>({
    width: 800,
    height: 0,
    quality: 80,
    format: 'webp',
    fit: 'cover',
    dpr: 1,
    blur: 0,
    sharp: 0,
  });

  const [externalUrl, setExternalUrl] = useState('https://images.unsplash.com/photo-1579783902614-a3fb3927b675');
  const [useExternal, setUseExternal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeCode, setActiveCode] = useState<'url' | 'wsrv' | 'html' | 'react'>('url');
  const [imageError, setImageError] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://flaredrop.workers.dev';

  const activeSourceUrl = useMemo(() => {
    if (useExternal && externalUrl) return externalUrl;
    if (selectedAsset) return selectedAsset.url;
    return externalUrl;
  }, [useExternal, externalUrl, selectedAsset]);

  const wsrvUrl = useMemo(() => {
    return buildWsrvUrl(activeSourceUrl, params);
  }, [activeSourceUrl, params]);

  // Clean FlareDrop CDN URL format (e.g. https://your-worker.workers.dev/cdn/img_123.webp?w=800&q=80)
  const cleanCdnUrl = useMemo(() => {
    if (useExternal && externalUrl) {
      return buildWsrvUrl(externalUrl, params);
    }

    const currentAsset = selectedAsset || assets[0];
    const assetId = currentAsset ? currentAsset.id : 'image';
    const baseCdn = currentAsset?.cdnUrl || `${origin}/cdn/${assetId}.webp`;
    const cleanBase = baseCdn.split('?')[0];

    const queryParts: string[] = [];
    if (params.width && params.width > 0) queryParts.push(`w=${params.width}`);
    if (params.height && params.height > 0) queryParts.push(`h=${params.height}`);
    if (params.quality && params.quality >= 1 && params.quality <= 100) queryParts.push(`q=${params.quality}`);
    if (params.format && params.format !== 'original') queryParts.push(`output=${params.format}`);
    if (params.fit && params.fit !== 'cover') queryParts.push(`fit=${params.fit}`);
    if (params.dpr && params.dpr > 1) queryParts.push(`dpr=${params.dpr}`);
    if (params.blur && params.blur > 0) queryParts.push(`blur=${params.blur}`);
    if (params.sharp && params.sharp > 0) queryParts.push(`sharp=${params.sharp}`);

    return queryParts.length > 0 ? `${cleanBase}?${queryParts.join('&')}` : cleanBase;
  }, [useExternal, externalUrl, selectedAsset, assets, params, origin]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const htmlSnippet = useMemo(() => {
    const avifUrl = cleanCdnUrl.includes('output=')
      ? cleanCdnUrl.replace(/output=[^&]+/, 'output=avif')
      : (cleanCdnUrl.includes('?') ? `${cleanCdnUrl}&output=avif` : `${cleanCdnUrl}?output=avif`);
    const webpUrl = cleanCdnUrl.includes('output=')
      ? cleanCdnUrl.replace(/output=[^&]+/, 'output=webp')
      : (cleanCdnUrl.includes('?') ? `${cleanCdnUrl}&output=webp` : `${cleanCdnUrl}?output=webp`);

    return `<picture>
  <source type="image/avif" srcset="${avifUrl}" />
  <source type="image/webp" srcset="${webpUrl}" />
  <img 
    src="${cleanCdnUrl}" 
    alt="Optimized media via FlareDrop CDN" 
    loading="lazy" 
    decoding="async" 
    width="${params.width || 800}" 
  />
</picture>`;
  }, [cleanCdnUrl, params.width]);

  const reactSnippet = useMemo(() => {
    return `<img
  src="${cleanCdnUrl}"
  alt="CDN Media"
  loading="lazy"
  className="w-full h-auto object-cover rounded-lg"
/>`;
  }, [cleanCdnUrl]);

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-400 mb-1">
            <span>Pre-Configured Engine</span>
            <span aria-hidden="true">·</span>
            <span>https://wsrv.nl/</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Dynamic Image Optimizer Studio
          </h1>
          <p className="mt-1 text-xs text-neutral-400">
            Tune and transform images on-the-fly using URL query parameters with Cloudflare edge caching.
          </p>
        </div>

        {/* Source Switcher */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setUseExternal(false)}
            className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-colors whitespace-nowrap ${
              !useExternal
                ? 'bg-orange-600 text-white font-semibold shadow-md'
                : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
            }`}
          >
            My Uploaded Assets ({assets.length})
          </button>
          <button
            type="button"
            onClick={() => setUseExternal(true)}
            className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-colors whitespace-nowrap ${
              useExternal
                ? 'bg-orange-600 text-white font-semibold shadow-md'
                : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
            }`}
          >
            Remote Image URL
          </button>
        </div>
      </div>

      {/* Target Selector */}
      {useExternal ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3.5 flex items-center gap-3">
          <Globe className="h-4 w-4 text-neutral-500 shrink-0" />
          <input
            type="url"
            value={externalUrl}
            onChange={(e) => {
              setExternalUrl(e.target.value);
              setImageError(false);
            }}
            placeholder="Paste any public image URL (https://...)"
            className="flex-1 text-xs bg-transparent border-0 focus:outline-none text-white placeholder-neutral-500 font-mono"
          />
        </div>
      ) : assets.length > 0 ? (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs text-neutral-400 whitespace-nowrap mr-1">Select asset:</span>
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => {
                onSelectAsset(asset);
                setImageError(false);
              }}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors whitespace-nowrap ${
                selectedAsset?.id === asset.id
                  ? 'border-orange-500 bg-orange-950/30 font-semibold text-orange-400'
                  : 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              <span>{asset.title}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 text-center text-xs text-neutral-400">
          No uploaded assets yet. Testing with default public URL or enter any custom image URL.
        </div>
      )}

      {/* Grid: Controls and Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Controls Column */}
        <div className="lg:col-span-5 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-orange-500" />
              <span>URL Query Parameters</span>
            </h2>
            <button
              type="button"
              onClick={() =>
                setParams({
                  width: 800,
                  height: 0,
                  quality: 80,
                  format: 'webp',
                  fit: 'cover',
                  dpr: 1,
                  blur: 0,
                  sharp: 0,
                })
              }
              className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Reset</span>
            </button>
          </div>

          {/* Width & Height */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">
                Width (<code className="font-mono text-[11px] text-neutral-300">w=</code>)
              </label>
              <input
                type="number"
                min="0"
                max="3000"
                step="50"
                value={params.width}
                onChange={(e) =>
                  setParams((p) => ({ ...p, width: parseInt(e.target.value, 10) || 0 }))
                }
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">
                Height (<code className="font-mono text-[11px] text-neutral-300">h=</code>)
              </label>
              <input
                type="number"
                min="0"
                max="3000"
                step="50"
                value={params.height}
                onChange={(e) =>
                  setParams((p) => ({ ...p, height: parseInt(e.target.value, 10) || 0 }))
                }
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* Format & Quality */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">
                Format (<code className="font-mono text-[11px] text-neutral-300">output=</code>)
              </label>
              <select
                value={params.format}
                onChange={(e) => setParams((p) => ({ ...p, format: e.target.value as ImageFormat }))}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs text-white"
              >
                <option value="webp">WebP (High compression)</option>
                <option value="avif">AVIF (Next-gen ultra)</option>
                <option value="jpg">JPEG (Legacy)</option>
                <option value="png">PNG (Lossless)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-medium text-neutral-400 mb-1">
                <span>Quality (<code className="font-mono text-[11px] text-neutral-300">q=</code>)</span>
                <span className="font-mono font-bold text-white">
                  {params.quality}%
                </span>
              </div>
              <input
                type="range"
                min="20"
                max="100"
                value={params.quality}
                onChange={(e) =>
                  setParams((p) => ({ ...p, quality: parseInt(e.target.value, 10) }))
                }
                className="w-full accent-orange-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Fit Mode & DPR */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">
                Fit (<code className="font-mono text-[11px] text-neutral-300">fit=</code>)
              </label>
              <select
                value={params.fit}
                onChange={(e) => setParams((p) => ({ ...p, fit: e.target.value as FitMode }))}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs text-white"
              >
                <option value="cover">cover (Center crop)</option>
                <option value="contain">contain (Letterbox)</option>
                <option value="inside">inside (Scale down)</option>
                <option value="outside">outside (Scale up)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">
                DPR (<code className="font-mono text-[11px] text-neutral-300">dpr=</code>)
              </label>
              <div className="flex rounded-lg border border-neutral-700 p-0.5">
                {[1, 2, 3].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setParams((p) => ({ ...p, dpr: val }))}
                    className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
                      params.dpr === val
                        ? 'bg-orange-600 text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {val}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Preview & Code Column */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 min-h-[320px] flex items-center justify-center relative overflow-hidden shadow-lg">
            {imageError ? (
              <div className="text-center p-6 space-y-2">
                <p className="text-xs text-neutral-400">
                  Image preview fallback (wsrv.nl processes public HTTP/HTTPS URLs on deployment)
                </p>
                <img
                  src={activeSourceUrl}
                  alt="Original fallback"
                  className="max-h-64 max-w-full rounded-lg object-contain mx-auto shadow-sm"
                />
              </div>
            ) : (
              <img
                src={useExternal ? wsrvUrl : (selectedAsset?.thumbnailUrl || activeSourceUrl)}
                alt="Optimized preview"
                referrerPolicy="no-referrer"
                onError={() => setImageError(true)}
                className="max-h-72 max-w-full rounded-lg object-contain shadow-sm"
              />
            )}

            <div className="absolute bottom-3 right-3 bg-neutral-900/90 text-white text-[10px] font-mono px-2 py-1 rounded border border-neutral-800">
              FlareDrop Edge · {params.format.toUpperCase()} · Q{params.quality}
            </div>
          </div>

          {/* Snippet Exporter */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 px-4 py-2.5 bg-neutral-950">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setActiveCode('url')}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                    activeCode === 'url'
                      ? 'bg-orange-600 text-white font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  CDN URL
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCode('wsrv')}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                    activeCode === 'wsrv'
                      ? 'bg-orange-600 text-white font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Engine URL
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCode('html')}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                    activeCode === 'html'
                      ? 'bg-orange-600 text-white font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  HTML &lt;picture&gt;
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCode('react')}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                    activeCode === 'react'
                      ? 'bg-orange-600 text-white font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  React / Next.js
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  let text = cleanCdnUrl;
                  if (activeCode === 'wsrv') text = wsrvUrl;
                  if (activeCode === 'html') text = htmlSnippet;
                  if (activeCode === 'react') text = reactSnippet;
                  copyToClipboard(text, activeCode);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
              >
                {copied === activeCode ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>{copied === activeCode ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="p-3 bg-neutral-950 font-mono text-xs text-neutral-200 overflow-x-auto max-h-40">
              <pre>
                <code>
                  {activeCode === 'url' && cleanCdnUrl}
                  {activeCode === 'wsrv' && wsrvUrl}
                  {activeCode === 'html' && htmlSnippet}
                  {activeCode === 'react' && reactSnippet}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
