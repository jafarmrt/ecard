/**
 * Client-side High-Performance Image Optimizer
 * Converts user-uploaded images to optimized WebP format with resizing
 */

export interface OptimizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'image/webp' | 'image/jpeg';
}

export async function optimizeImage(
  fileOrDataUrl: File | string,
  options: OptimizeOptions = {}
): Promise<{ dataUrl: string; width: number; height: number; sizeBytes: number; format: string }> {
  const {
    maxWidth = 500,
    maxHeight = 500,
    quality = 0.85,
    format = 'image/webp',
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      // Calculate target aspect-ratio scaled dimensions
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
        reject(new Error('Canvas context not available'));
        return;
      }

      // Smooth resizing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Check browser WebP support, fallback to jpeg if necessary
      let outputFormat = format;
      let dataUrl = canvas.toDataURL(outputFormat, quality);

      if (!dataUrl.startsWith(`data:${outputFormat}`)) {
        outputFormat = 'image/jpeg';
        dataUrl = canvas.toDataURL(outputFormat, quality);
      }

      // Approximate byte size from base64
      const base64Length = dataUrl.length - (dataUrl.indexOf(',') + 1);
      const sizeBytes = Math.round((base64Length * 3) / 4);

      resolve({
        dataUrl,
        width,
        height,
        sizeBytes,
        format: outputFormat,
      });
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for optimization'));
    };

    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}
