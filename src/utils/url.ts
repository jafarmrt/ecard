import { EmployeeProfile } from '../types';

/**
 * Universal URL Helper for Roya Business Cards
 */
export function getBaseOrigin(): string {
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }
  return 'https://card.royaco.com';
}

/**
 * Generates the direct, standalone mobile card URL for an employee.
 * Uses clean path e.g. https://.../amir-tajik or http://IP:PORT/amir-tajik
 */
export function getDirectCardUrl(profile: EmployeeProfile): string {
  const origin = getBaseOrigin();
  const slug = (profile.slug || profile.id).trim();
  return `${origin}/${slug}`;
}

/**
 * Generates an alternative query-param based URL for legacy NFC tags or QR codes
 */
export function getQueryCardUrl(profile: EmployeeProfile): string {
  const origin = getBaseOrigin();
  return `${origin}/?id=${profile.id}&view=card`;
}

/**
 * Parses the current URL to detect if a specific employee card is requested
 * and whether the view should be standalone customer card mode.
 */
export function parseCurrentRoute(profiles: EmployeeProfile[]): {
  targetProfileId: string | null;
  isStandalone: boolean;
  isAdminMode: boolean;
} {
  if (typeof window === 'undefined') {
    return { targetProfileId: null, isStandalone: false, isAdminMode: false };
  }

  try {
    const pathname = window.location.pathname.replace(/^\/+|\/+$/g, ''); // strip leading/trailing slashes
    const searchParams = new URLSearchParams(window.location.search);

    const queryId = searchParams.get('id') || searchParams.get('card') || searchParams.get('profile');
    const viewParam = searchParams.get('view') || searchParams.get('mode');
    const isAdminRequested = searchParams.get('admin') === 'true' || searchParams.get('admin') === '1';

    // 1. Check if pathname specifies a route
    // Allowed patterns:
    // "" -> Home / Workspace (unless view=card)
    // "card/:slugOrId" -> Standalone card
    // ":slugOrId" -> Standalone card (if matches a profile or if not a known asset)
    let pathIdentifier: string | null = null;
    let isCardPath = false;

    if (pathname.startsWith('card/')) {
      pathIdentifier = pathname.replace(/^card\//, '').trim();
      isCardPath = true;
    } else if (pathname && !pathname.includes('.') && pathname !== 'api' && pathname !== 'uploads') {
      pathIdentifier = pathname.trim();
      isCardPath = true;
    }

    const identifier = queryId || pathIdentifier;

    // Find matching profile in list
    let matchedProfile: EmployeeProfile | undefined;
    if (identifier) {
      const clean = identifier.toLowerCase();
      matchedProfile = profiles.find((p) => {
        const pId = p.id.toLowerCase();
        const pSlug = (p.slug || '').toLowerCase();
        const pEnName = (p.nameEn || '').toLowerCase().replace(/\s+/g, '-');
        return pId === clean || (pSlug && pSlug === clean) || (pEnName && pEnName === clean);
      });
    }

    // Determine standalone view:
    // It's standalone if:
    // - view param is 'card', 'standalone', 'mobile', or 'vcard'
    // - OR accessed via path like /amir-tajik or /card/amir-tajik
    // - AND admin is NOT explicitly requested via ?admin=true
    const isStandalone = !isAdminRequested && (
      viewParam === 'card' || 
      viewParam === 'standalone' || 
      viewParam === 'mobile' || 
      (isCardPath && (!!matchedProfile || !isAdminRequested))
    );

    return {
      targetProfileId: matchedProfile ? matchedProfile.id : (identifier || null),
      isStandalone,
      isAdminMode: isAdminRequested,
    };
  } catch (err) {
    console.warn('Error parsing current route:', err);
    return { targetProfileId: null, isStandalone: false, isAdminMode: false };
  }
}
