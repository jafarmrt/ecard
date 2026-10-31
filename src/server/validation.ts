/**
 * Shared server-side validation helpers (pure functions, unit tested).
 */
import { toEnglishDigits, normalizeIranMobile } from '../utils/phone.ts';

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
  note?: string;
}

export const LEAD_LIMITS = {
  name: 80,
  company: 120,
  note: 1000,
};

function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
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
  const company = cleanText(body?.customerCompany, LEAD_LIMITS.company);
  const note = cleanText(body?.note, LEAD_LIMITS.note);
  return {
    profileId: cleanText(body?.profileId, 64),
    customerName: cleanText(rawName, LEAD_LIMITS.name),
    customerMobile: mobile,
    customerCompany: company || undefined,
    note: note || undefined,
  };
}

export const MIN_PASSWORD_LENGTH = 8;
