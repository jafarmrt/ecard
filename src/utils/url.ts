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

export type AppRoute = { kind: 'admin' } | { kind: 'card'; identifier: string } | { kind: 'landing' };

/**
 * Which screen the current URL asks for:
 * /admin (or the old ?admin=1) -> admin panel, /:slug, /card/:slug or ?id=… -> a card, / -> landing page.
 */
export function resolveRoute(): AppRoute {
  if (typeof window === 'undefined') return { kind: 'landing' };
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  const params = new URLSearchParams(window.location.search);
  const adminParam = params.get('admin');
  if (path === 'admin' || path.startsWith('admin/') || adminParam === '1' || adminParam === 'true') {
    if (path !== 'admin') window.history.replaceState(null, '', '/admin');
    return { kind: 'admin' };
  }
  const queryId = params.get('id') || params.get('card') || params.get('profile');
  if (queryId) return { kind: 'card', identifier: queryId.trim() };
  if (path.startsWith('card/')) {
    const id = path.slice(5).trim();
    if (id) return { kind: 'card', identifier: decodeURIComponent(id) };
  }
  if (path && !path.includes('/') && !path.includes('.')) return { kind: 'card', identifier: decodeURIComponent(path) };
  return { kind: 'landing' };
}
