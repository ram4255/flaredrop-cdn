/**
 * Client-Side Image Optimization Utility
 * 
 * Performs client-side image transformation, format conversion (WebP),
 * and dimension scaling before storing directly into Cloudflare D1 CDN.
 */

export interface OptimizationResult {
  blob: Blob;
  dataUrl: string;
  originalSize: number;
  optimizedSize: number;
  savingsBytes: number;
  savingsPercent: number;
  width: number;
  height: number;
  mimeType: string;
  filename: string;
}

export interface OptimizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0
  format?: 'image/webp' | 'image/jpeg' | 'image/png';
}

export async function optimizeImageClientSide(
  file: File,
  options: OptimizeOptions = {}
): Promise<OptimizationResult> {
  const {
    maxWidth = 2560,
    maxHeight = 2560,
    quality = 0.82,
    format = 'image/webp',
  } = options;

  const originalSize = file.size;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format'));
      img.onload = () => {
        let { width, height } = img;

        // Scale down if dimensions exceed maximum constraints
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Unable to create 2D canvas context'));
          return;
        }

        // Apply high-quality bicubic smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to optimized format (WebP by default)
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas blob generation failed'));
              return;
            }

            const optimizedSize = blob.size;
            const savingsBytes = Math.max(0, originalSize - optimizedSize);
            const savingsPercent = originalSize > 0
              ? Math.max(0, Math.round(((originalSize - optimizedSize) / originalSize) * 100))
              : 0;

            const baseName = file.name.replace(/\.[^/.]+$/, '');
            const ext = format === 'image/webp' ? 'webp' : format === 'image/jpeg' ? 'jpg' : 'png';
            const optimizedFilename = `${baseName}.${ext}`;

            const dataUrl = canvas.toDataURL(format, quality);

            resolve({
              blob,
              dataUrl,
              originalSize,
              optimizedSize,
              savingsBytes,
              savingsPercent,
              width,
              height,
              mimeType: format,
              filename: optimizedFilename,
            });
          },
          format,
          quality
        );
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}
