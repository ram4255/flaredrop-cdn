import { TransformParams } from '../types';

/**
 * Builds an optimized image URL using wsrv.nl.
 * wsrv.nl accepts any public HTTP/HTTPS image URL.
 */
export function buildWsrvUrl(sourceUrl: string, params: Partial<TransformParams>): string {
  if (!sourceUrl) return '';

  const cleanUrl = sourceUrl.trim();

  // If it's a data URL or blob, wsrv.nl cannot reach it over internet. Return source URL directly.
  if (cleanUrl.startsWith('data:') || cleanUrl.startsWith('blob:') || cleanUrl.startsWith('/')) {
    return cleanUrl;
  }

  const searchParams = new URLSearchParams();
  searchParams.set('url', cleanUrl);

  if (params.width && params.width > 0) {
    searchParams.set('w', params.width.toString());
  }
  if (params.height && params.height > 0) {
    searchParams.set('h', params.height.toString());
  }
  if (params.format && params.format !== 'original') {
    searchParams.set('output', params.format);
  }
  if (params.quality && params.quality >= 1 && params.quality <= 100) {
    searchParams.set('q', params.quality.toString());
  }
  if (params.fit && params.fit !== 'cover') {
    searchParams.set('fit', params.fit);
  }
  if (params.dpr && params.dpr > 1) {
    searchParams.set('dpr', params.dpr.toString());
  }
  if (params.blur && params.blur > 0) {
    searchParams.set('blur', params.blur.toString());
  }
  if (params.sharp && params.sharp > 0) {
    searchParams.set('sharp', params.sharp.toString());
  }

  return `https://wsrv.nl/?${searchParams.toString()}`;
}

export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
