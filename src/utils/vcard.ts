import { EmployeeProfile } from '../types';
import { buildVCard, vcardFileName } from './vcardBuilder';

/**
 * Loads an avatar URL (local /uploads/... path, data:image/... or remote URL)
 * and renders it onto a 180x180 square canvas exported as raw JPEG Base64
 * for universal compatibility with iOS Contacts, Android Contacts, macOS & Outlook.
 */
export async function prepareAvatarJpegBase64(avatarUrl?: string): Promise<string | null> {
  if (!avatarUrl || typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => resolve(null), 1500);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      clearTimeout(timeoutId);
      try {
        const size = 180;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        // Fill white background for transparent PNG/WebP avatars
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);

        // Center-crop square
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

        const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        const base64 = jpegDataUrl.replace(/^data:image\/jpeg;base64,/, '').trim();
        resolve(base64 || null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timeoutId);
      resolve(null);
    };
    img.src = avatarUrl;
  });
}

/**
 * vCard 3.0 string for a profile, with an optional embedded JPEG photo.
 * Delegates to the shared builder so the browser and server output match.
 */
export function generateVCardString(profile: EmployeeProfile, photoJpegBase64?: string | null): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://card.royaco.com';
  return buildVCard(profile, {
    origin,
    photo: photoJpegBase64 ? { type: 'JPEG', base64: photoJpegBase64 } : null,
  });
}

function triggerVcfDownload(vcardContent: string, profile: EmployeeProfile): boolean {
  try {
    const bom = '\uFEFF';
    const blob = new Blob([bom + vcardContent], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;

    link.download = vcardFileName(profile);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 2000);

    return true;
  } catch (error) {
    console.error('Error downloading vCard:', error);
    return false;
  }
}

/**
 * Initiates direct download of UTF-8 encoded .vcf file with embedded avatar photo
 */
export async function downloadVCard(profile: EmployeeProfile): Promise<boolean> {
  try {
    const photoBase64 = await prepareAvatarJpegBase64(profile.avatarUrl);
    const vcardContent = generateVCardString(profile, photoBase64);
    return triggerVcfDownload(vcardContent, profile);
  } catch (error) {
    console.error('Error preparing vCard with photo, falling back to text vCard:', error);
    const fallbackContent = generateVCardString(profile, null);
    return triggerVcfDownload(fallbackContent, profile);
  }
}

/**
 * Share contact using Web Share API
 */
export async function shareContact(profile: EmployeeProfile): Promise<boolean> {
  const currentHost = typeof window !== 'undefined' ? window.location.origin : '';
  const currentUrl = `${currentHost}/${profile.slug || profile.id}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${profile.name} | ${profile.title} | ${profile.company}`,
        text: `کارت ویزیت دیجیتال هوشمند ${profile.name} (${profile.title} شرکت رویا طرح داخلی)`,
        url: currentUrl,
      });
      return true;
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  }
  return false;
}
