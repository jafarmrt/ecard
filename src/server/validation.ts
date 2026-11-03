/**
 * Shared server-side validation helpers (pure functions, unit tested).
 */
import { toEnglishDigits, normalizeIranMobile } from '../utils/phone.ts';
import { LEAD_TOPICS } from '../utils/leadTopics.ts';

export { toEnglishDigits, normalizeIranMobile };

export class ValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ValidationError';
    this.status = status;
  }
}

/** Slugs that would collide with application routes or static folders. */
export const RESERVED_SLUGS = new Set([
  'api',
  'admin',
  'card',
  'uploads',
  'assets',
  'src',
  'public',
  'static',
  'login',
  'logout',
  'sw',
  'workbox',
  'manifest',
  'favicon',
  'index',
  'node_modules',
  'edit',
]);

/** Lower-case a slug and strip every character outside a-z, 0-9, dash and underscore. */
export function normalizeSlug(input: string | undefined | null): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function isValidIdentifier(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value);
}

export interface LeadInput {
  profileId: string;
  customerName: string;
  customerMobile: string;
  customerCompany?: string;
  topic?: string;
  note?: string;
  consent?: boolean;
}

export const LEAD_LIMITS = {
  name: 80,
  company: 120,
  note: 1000,
};

function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

/**
 * Validate and normalise a public lead submission.
 * Throws ValidationError with a Persian message on invalid input.
 */
export function validateLeadInput(body: any): LeadInput {
  const rawName = String(body?.customerName ?? '').trim();
  if (rawName.length < 2) {
    throw new ValidationError('لطفاً نام خود را وارد فرمایید.');
  }
  if (rawName.length > LEAD_LIMITS.name) {
    throw new ValidationError(`نام حداکثر می‌تواند ${LEAD_LIMITS.name} کاراکتر باشد.`);
  }
  const mobile = normalizeIranMobile(String(body?.customerMobile ?? ''));
  if (!mobile) {
    throw new ValidationError('شماره موبایل معتبر نیست. نمونه صحیح: 09121234567');
  }
  if (body?.consent !== true) {
    throw new ValidationError('برای ثبت درخواست، لطفاً اجازه تماس کارشناس را تأیید کنید.');
  }
  const topic = cleanText(body?.topic, 60);
  if (topic && !(LEAD_TOPICS as readonly string[]).includes(topic)) {
    throw new ValidationError('موضوع درخواست معتبر نیست.');
  }
  const company = cleanText(body?.customerCompany, LEAD_LIMITS.company);
  const note = cleanText(body?.note, LEAD_LIMITS.note);
  return {
    profileId: cleanText(body?.profileId, 64),
    customerName: cleanText(rawName, LEAD_LIMITS.name),
    customerMobile: mobile,
    customerCompany: company || undefined,
    topic: topic || undefined,
    note: note || undefined,
    consent: true,
  };
}

export const MIN_PASSWORD_LENGTH = 10;

export const SELF_EDIT_TEXT_FIELDS = ['whatsapp', 'instagram', 'email'] as const;

/** Instagram handle from "@name", "name" or an instagram.com link; '' when blank. */
export function normalizeInstagramHandle(input: unknown): string {
  let value = toEnglishDigits(String(input ?? '')).trim();
  if (!value) return '';
  const fromUrl = value.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i);
  if (fromUrl) value = fromUrl[1];
  value = value.replace(/^@/, '').replace(/\/+$/, '');
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(value)) {
    throw new ValidationError('آیدی اینستاگرام معتبر نیست. نمونه صحیح: royaco یا ‎@royaco');
  }
  return value;
}

/** WhatsApp number: Iranian mobiles become 09xxxxxxxxx, other countries +<digits>; '' when blank. */
export function normalizeWhatsapp(input: unknown): string {
  const raw = toEnglishDigits(String(input ?? '')).trim();
  if (!raw) return '';
  const iran = normalizeIranMobile(raw);
  if (iran) return iran;
  const compact = raw.replace(/[\s\-().]/g, '');
  const match = compact.match(/^(?:\+|00)([1-9]\d{7,14})$/);
  if (!match) throw new ValidationError('شماره واتساپ معتبر نیست. نمونه صحیح: 09121234567');
  return `+${match[1]}`;
}

export function normalizeEmail(input: unknown): string {
  const value = String(input ?? '').trim().toLowerCase();
  if (!value) return '';
  if (value.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new ValidationError('ایمیل معتبر نیست.');
  return value;
}

/**
 * Text fields an employee sent from their private edit link. Only fields that
 * are present are returned; unknown fields are ignored.
 */
export function validateSelfEditInput(body: any): { whatsapp?: string; instagram?: string; email?: string } {
  const out: { whatsapp?: string; instagram?: string; email?: string } = {};
  if (body?.whatsapp !== undefined) out.whatsapp = normalizeWhatsapp(body.whatsapp);
  if (body?.instagram !== undefined) out.instagram = normalizeInstagramHandle(body.instagram);
  if (body?.email !== undefined) out.email = normalizeEmail(body.email);
  return out;
}
