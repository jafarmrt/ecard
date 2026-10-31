import { EmployeeProfile } from '../types';

/**
 * Pure vCard 3.0 builder shared by the browser ("save contact" button) and the
 * server (/api/vcard/:id used by printed NFC/QR links), so both always produce
 * the same contact. No DOM or Node APIs are used here.
 */

export function toEnglishDigits(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** Escape a text value per RFC 6350 / 2426 (backslash, comma, semicolon, newline). */
export function escapeVCardText(value: string | undefined | null): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .trim();
}

function cleanPhone(value: string | undefined): string {
  return toEnglishDigits(value).replace(/[^\d+]/g, '');
}

function absoluteUrl(value: string | undefined, origin: string): string {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith('/')) return `${origin}${v}`;
  // Bare domains such as "www.royaco.com"; reject free text with spaces.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v)) return `https://${v}`;
  return '';
}

export interface VCardPhoto {
  type: 'JPEG' | 'PNG';
  base64: string;
}

export interface VCardOptions {
  /** Site origin used for the card URL, e.g. https://card.royaco.com */
  origin: string;
  photo?: VCardPhoto | null;
  now?: Date;
}

export function getCardUrl(profile: EmployeeProfile, origin: string): string {
  return `${origin}/${profile.slug || profile.id}`;
}

export function buildVCard(profile: EmployeeProfile, opts: VCardOptions): string {
  const origin = opts.origin.replace(/\/+$/, '');
  const cardUrl = getCardUrl(profile, origin);
  const name = String(profile.name || '').trim();
  const nameParts = name.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ');

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N;CHARSET=UTF-8:${escapeVCardText(lastName)};${escapeVCardText(firstName)};;;`,
    `FN;CHARSET=UTF-8:${escapeVCardText(name)}`,
  ];

  const company = profile.company || '';
  if (company || profile.department) {
    lines.push(`ORG;CHARSET=UTF-8:${escapeVCardText(company)};${escapeVCardText(profile.department)}`);
  }
  if (profile.title) lines.push(`TITLE;CHARSET=UTF-8:${escapeVCardText(profile.title)}`);

  const mobile = cleanPhone(profile.mobile);
  const landline = cleanPhone(profile.landline);
  if (mobile) lines.push(`TEL;TYPE=CELL,VOICE,PREF:${mobile}`);
  if (landline) lines.push(`TEL;TYPE=WORK,VOICE:${landline}`);
  if (profile.email) lines.push(`EMAIL;TYPE=INTERNET,WORK,PREF:${escapeVCardText(profile.email)}`);

  if (opts.photo?.base64) {
    lines.push(`PHOTO;ENCODING=b;TYPE=${opts.photo.type}:${opts.photo.base64.replace(/\s+/g, '')}`);
  }

  lines.push(`URL;TYPE=WORK,PREF:${cardUrl}`);
  const site = absoluteUrl(profile.websiteUrl || profile.website, origin);
  if (site && site !== cardUrl) lines.push(`URL;TYPE=WORK:${site}`);

  if (profile.address) {
    // ADR: PO box; extended; street; locality; region; postal code; country
    lines.push(
      `ADR;TYPE=WORK,POSTAL;CHARSET=UTF-8:;;${escapeVCardText(profile.address)};;;${escapeVCardText(
        toEnglishDigits(profile.postalCode)
      )};${escapeVCardText('ایران')}`
    );
    lines.push(`LABEL;TYPE=WORK;CHARSET=UTF-8:${escapeVCardText(profile.address)}`);
  }

  const lat = Number(profile.mapLocation?.lat);
  const lng = Number(profile.mapLocation?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    lines.push(`GEO:${lat};${lng}`);
  }

  const instagram = absoluteUrl(profile.instagramUrl, origin) ||
    (profile.instagram ? `https://instagram.com/${profile.instagram.replace(/^@/, '').trim()}` : '');
  if (instagram) lines.push(`X-SOCIALPROFILE;TYPE=instagram:${instagram}`);

  const note = [
    profile.company ? `کارت ویزیت دیجیتال ${profile.company}` : 'کارت ویزیت دیجیتال',
    profile.slogan || '',
    profile.bio || '',
    `لینک کارت: ${cardUrl}`,
  ]
    .filter(Boolean)
    .map(escapeVCardText)
    .join('\\n');
  lines.push(`NOTE;CHARSET=UTF-8:${note}`);
  lines.push(`REV:${(opts.now || new Date()).toISOString()}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function vcardFileName(profile: EmployeeProfile): string {
  const base = (profile.nameEn || profile.slug || profile.id || 'contact').trim().replace(/\s+/g, '_');
  return `${base.replace(/[^A-Za-z0-9_.-]/g, '') || 'contact'}.vcf`;
}
