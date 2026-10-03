export type ImageFormat = 'webp' | 'avif' | 'jpg' | 'png' | 'original';
export type FitMode = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

export interface TransformParams {
  width: number;
  height: number;
  quality: number;
  format: ImageFormat;
  fit: FitMode;
  dpr: number;
  blur: number;
  sharp: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'viewer';
  createdAt: string;
}

export interface MediaAsset {
  id: string;
  filename: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  sizeBytes: number;
  mimeType: string;
  width: number;
  height: number;
  r2Key: string;
  cdnUrl: string;
  optimizedUrl: string;
  createdAt: string;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  fullKey?: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CloudflareDeployConfig {
  projectName: string;
  githubRepoUrl: string;
  d1DatabaseName: string;
  d1DatabaseId: string;
  r2BucketName: string;
  authSecretKey: string;
  jwtSecret: string;
  wsrvEndpoint: string;
  defaultQuality: number;
  defaultFormat: ImageFormat;
  cacheMaxAge: number;
}

export interface RepoFile {
  name: string;
  path: string;
  content: string;
  description: string;
}
