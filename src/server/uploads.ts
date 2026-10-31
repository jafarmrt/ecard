/**
 * File handling: image/PDF validation, image optimisation, social preview
 * images and removal of files that no card uses any more.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp, { type OverlayOptions } from 'sharp';
import { ValidationError } from './validation.ts';

export function getUploadsDir(): string {
  return path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'public', 'uploads'));
}
export function getImagesDir(): string {
  return path.join(getUploadsDir(), 'images');
}
function getOgDir(): string {
  return path.join(getUploadsDir(), 'og');
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_BYTES = 30 * 1024 * 1024;

const ALLOWED_DECLARED_TYPES = new Set(['png', 'jpeg', 'jpg', 'webp', 'gif']);

/** Detects the real image type from the first bytes (ignores the declared MIME type). */
export function sniffImageExtension(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buffer.toString('ascii', 0, 3) === 'GIF') return 'gif';
  return null;
}

export function isPdf(buffer: Buffer): boolean {
  return buffer.length > 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function safeName(identifier: string): string {
  return identifier.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase().slice(0, 40) || 'staff';
}

function uniqueSuffix(): string {
  return `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

/** Decodes a `data:image/...;base64,` URL after checking type and magic bytes. */
export function decodeImageDataUrl(dataUrl: string): Buffer {
  const match = String(dataUrl).match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) throw new ValidationError('تصویر ارسالی معتبر نیست.');
  if (!ALLOWED_DECLARED_TYPES.has(match[1].toLowerCase())) {
    throw new ValidationError('فقط تصاویر PNG، JPG، WebP یا GIF پذیرفته می‌شوند.');
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (!sniffImageExtension(buffer)) throw new ValidationError('محتوای فایل تصویر معتبر نیست.');
  return buffer;
}

/**
 * Stores an inline (base64) image exactly as sent. Only used for data that
 * arrives inside a profile or an old backup; new uploads go through
 * `storeImageUpload`, which also optimises the file.
 */
export function persistBase64Image(dataUrl: string, prefix: 'avatar' | 'logo', identifier = 'staff'): string {
  const buffer = decodeImageDataUrl(dataUrl);
  const ext = sniffImageExtension(buffer)!;
  const dir = getImagesDir();
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${prefix}-${safeName(identifier)}-${uniqueSuffix()}.${ext}`;
  fs.writeFileSync(path.join(dir, fileName), buffer);
  return `/uploads/images/${fileName}`;
}

/**
 * Validates, auto-rotates, resizes and converts an uploaded image to WebP.
 * Metadata (EXIF, including GPS position from phone photos) is removed.
 */
export async function storeImageUpload(
  buffer: Buffer,
  prefix: 'avatar' | 'logo',
  identifier = 'staff'
): Promise<string> {
  if (!buffer?.length) throw new ValidationError('فایل تصویر خالی است.');
  if (buffer.length > MAX_IMAGE_BYTES) throw new ValidationError('حجم تصویر نباید بیشتر از ۱۰ مگابایت باشد.', 413);
  if (!sniffImageExtension(buffer)) {
    throw new ValidationError('فقط تصاویر PNG، JPG، WebP یا GIF پذیرفته می‌شوند.');
  }
  const maxSize = prefix === 'logo' ? 1000 : 800;
  let output: Buffer;
  try {
    output = await sharp(buffer, { animated: false, limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 90 })
      .toBuffer();
  } catch {
    throw new ValidationError('فایل تصویر خراب است یا قابل خواندن نیست.');
  }
  const dir = getImagesDir();
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${prefix}-${safeName(identifier)}-${uniqueSuffix()}.webp`;
  fs.writeFileSync(path.join(dir, fileName), output);
  return `/uploads/images/${fileName}`;
}

export function storePdfUpload(
  buffer: Buffer,
  originalName: string,
  replaceDefault: boolean
): { url: string; fileName: string; size: number } {
  if (!buffer?.length) throw new ValidationError('فایل ارسالی خالی است.');
  if (buffer.length > MAX_PDF_BYTES) throw new ValidationError('حجم فایل PDF نباید بیشتر از ۳۰ مگابایت باشد.', 413);
  if (!isPdf(buffer)) throw new ValidationError('فایل ارسالی PDF معتبر نیست.');
  const dir = getUploadsDir();
  fs.mkdirSync(dir, { recursive: true });
  const rawName = String(originalName || 'catalog.pdf').trim();
  const sanitized = rawName.replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase().slice(0, 80);
  const finalName = sanitized.endsWith('.pdf') ? sanitized : `${sanitized}.pdf`;
  const fileName = `catalog-${Date.now()}-${finalName}`;
  fs.writeFileSync(path.join(dir, fileName), buffer);
  if (replaceDefault) {
    // Kept for older links that point at /roya-catalog.pdf.
    fs.writeFileSync(path.join(dir, 'roya-catalog.pdf'), buffer);
  }
  return { url: `/uploads/${fileName}`, fileName, size: buffer.length };
}

/** Resolves a public `/uploads/...` URL to a file inside the uploads folder (or null). */
export function localUploadPath(url: string | undefined): string | null {
  if (!url || !url.startsWith('/uploads/')) return null;
  const root = getUploadsDir();
  const file = path.resolve(root, decodeURIComponent(url.slice('/uploads/'.length).split('?')[0]));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return null;
  return file;
}

/** JPEG photo for vCards: every contacts app understands JPEG, not WebP. */
export async function vcardPhoto(url: string | undefined): Promise<{ type: 'JPEG'; base64: string } | null> {
  const file = localUploadPath(url);
  if (!file) return null;
  try {
    const jpeg = await sharp(file).rotate().resize(320, 320, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer();
    return { type: 'JPEG', base64: jpeg.toString('base64') };
  } catch {
    return null;
  }
}

/**
 * Deletes uploaded images and catalogue PDFs that no card, branch or the
 * organisation refers to any more. Files younger than `minAgeMs` are kept so
 * an upload that is about to be saved is never removed.
 */
export function cleanupOrphanUploads(referenced: Set<string>, minAgeMs = 24 * 60 * 60 * 1000): string[] {
  const removed: string[] = [];
  const now = Date.now();
  const candidates: { dir: string; urlPrefix: string; match: (n: string) => boolean }[] = [
    { dir: getImagesDir(), urlPrefix: '/uploads/images/', match: () => true },
    { dir: getUploadsDir(), urlPrefix: '/uploads/', match: (n) => /^catalog-.*\.pdf$/i.test(n) },
  ];
  for (const { dir, urlPrefix, match } of candidates) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!match(name)) continue;
      const full = path.join(dir, name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (!stat.isFile() || now - stat.mtimeMs < minAgeMs) continue;
      if (referenced.has(urlPrefix + name)) continue;
      try {
        fs.unlinkSync(full);
        removed.push(urlPrefix + name);
      } catch {}
    }
  }
  return removed;
}

export function folderSize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) total += folderSize(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    } catch {}
  }
  return total;
}

// ---------------------------------------------------------------------------
// Social preview image (1200x630) for WhatsApp / Telegram link previews.
// ---------------------------------------------------------------------------

function fontFile(weight: 'Bold' | 'Regular'): string | null {
  const candidates = [
    path.join(process.cwd(), 'node_modules', 'vazirmatn', 'fonts', 'ttf', `Vazirmatn-${weight}.ttf`),
    path.join(__dirnameSafe(), '..', 'node_modules', 'vazirmatn', 'fonts', 'ttf', `Vazirmatn-${weight}.ttf`),
  ];
  return candidates.find((f) => fs.existsSync(f)) || null;
}

function __dirnameSafe(): string {
  try {
    return typeof __dirname === 'string' ? __dirname : process.cwd();
  } catch {
    return process.cwd();
  }
}

function escapeMarkup(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function renderText(text: string, opts: { size: number; bold?: boolean; color: string; width: number }) {
  const file = fontFile(opts.bold ? 'Bold' : 'Regular');
  if (!file || !text) return null;
  const buffer = await sharp({
    text: {
      text: `<span foreground="${opts.color}">${escapeMarkup(text)}</span>`,
      font: `Vazirmatn ${opts.bold ? 'Bold ' : ''}${opts.size}`,
      fontfile: file,
      rgba: true,
      dpi: 72,
      width: opts.width,
      align: 'right',
      wrap: 'word',
    },
  })
    .png()
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width || 0, height: meta.height || 0 };
}

export interface OgCardInput {
  id: string;
  name: string;
  title?: string;
  company?: string;
  url: string;
  avatarUrl?: string;
  logoUrl?: string;
}

/** Returns the path of a cached PNG preview, generating it when the card changed. */
export async function ensureOgImage(input: OgCardInput): Promise<string | null> {
  if (!fontFile('Bold')) return null;
  const key = crypto
    .createHash('sha1')
    .update(JSON.stringify([input.name, input.title, input.company, input.url, input.avatarUrl, input.logoUrl, 3]))
    .digest('hex')
    .slice(0, 12);
  const dir = getOgDir();
  const file = path.join(dir, `${safeName(input.id)}-${key}.png`);
  if (fs.existsSync(file)) return file;

  const W = 1200;
  const H = 630;
  const brand = '#D0192A';
  const layers: OverlayOptions[] = [];

  layers.push({ input: Buffer.from(`<svg width="${W}" height="16"><rect width="${W}" height="16" fill="${brand}"/></svg>`), top: H - 16, left: 0 });

  // Avatar (left side) or a brand-coloured circle with the first letter.
  const avatarFile = localUploadPath(input.avatarUrl);
  const size = 300;
  const circle = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
  if (avatarFile) {
    try {
      const avatar = await sharp(avatarFile)
        .rotate()
        .resize(size, size, { fit: 'cover' })
        .composite([{ input: circle, blend: 'dest-in' }])
        .png()
        .toBuffer();
      layers.push({ input: avatar, top: Math.round((H - size) / 2), left: 90 });
    } catch {}
  }
  if (layers.length === 1) {
    layers.push({
      input: Buffer.from(
        `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#F4F4F5"/></svg>`
      ),
      top: Math.round((H - size) / 2),
      left: 90,
    });
  }

  const logoFile = localUploadPath(input.logoUrl) || path.join(process.cwd(), 'public', 'roya-logo.svg');
  if (fs.existsSync(logoFile)) {
    try {
      const logo = await sharp(logoFile, { density: 200 }).resize({ height: 110, fit: 'inside' }).png().toBuffer();
      const meta = await sharp(logo).metadata();
      layers.push({ input: logo, top: 60, left: W - 80 - (meta.width || 0) });
    } catch {}
  }

  const textWidth = 680;
  const right = W - 80;
  let y = 230;
  const blocks = [
    await renderText(input.name, { size: 64, bold: true, color: '#111111', width: textWidth }),
    await renderText(input.title || '', { size: 34, color: '#3F3F46', width: textWidth }),
    await renderText(input.company || '', { size: 30, color: brand, width: textWidth }),
  ];
  for (const block of blocks) {
    if (!block) continue;
    layers.push({ input: block.buffer, top: y, left: right - block.width });
    y += block.height + 18;
  }
  const urlText = await renderText(input.url.replace(/^https?:\/\//, ''), { size: 26, color: '#71717A', width: textWidth });
  if (urlText) layers.push({ input: urlText.buffer, top: H - 90, left: right - urlText.width });

  fs.mkdirSync(dir, { recursive: true });
  // Drop older previews of the same card.
  for (const old of fs.readdirSync(dir)) {
    if (old.startsWith(`${safeName(input.id)}-`) && old !== path.basename(file)) {
      try {
        fs.unlinkSync(path.join(dir, old));
      } catch {}
    }
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: '#FFFFFF' } })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toFile(file);
  return file;
}
