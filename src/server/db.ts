import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { INITIAL_PROFILES } from '../data/defaultProfiles.ts';
import { EmployeeProfile, CustomerLead, EmployeeAnalytics } from '../types.ts';
import {
  ValidationError,
  LeadInput,
  MIN_PASSWORD_LENGTH,
  RESERVED_SLUGS,
  isValidIdentifier,
  normalizeSlug,
} from './validation.ts';

// Paths are resolved lazily so tests (and deployments) can point DATA_DIR / UPLOADS_DIR elsewhere.
export function getDataDir(): string {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
}
export function getUploadsDir(): string {
  return path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'public', 'uploads'));
}
function getDbFile(): string {
  return path.join(getDataDir(), 'database.json');
}
function getImagesDir(): string {
  return path.join(getUploadsDir(), 'images');
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Passwords that were hard-coded in earlier versions (source code and docker-compose).
 * They are public, so they are refused even if an old database still stores their hash.
 */
export const KNOWN_DEFAULT_PASSWORDS = new Set(['roya1403', 'admin123', 'roya2026']);

function envAdminPassword(): string | undefined {
  const value = process.env.ADMIN_PASSWORD;
  if (!value) return undefined;
  if (KNOWN_DEFAULT_PASSWORDS.has(value) || value.length < MIN_PASSWORD_LENGTH) {
    console.warn('[Roya DB] ADMIN_PASSWORD is a known default or shorter than 8 characters and is ignored.');
    return undefined;
  }
  return value;
}

const DEFERRED_SAVE_MS = 1500;

export type AnalyticsEvent =
  | 'view'
  | 'nfcTap'
  | 'qrScan'
  | 'call'
  | 'whatsapp'
  | 'catalogDownload'
  | 'vcardDownload'
  | 'mapClick'
  | 'instagram'
  | 'website'
  | 'email';

export const ANALYTICS_EVENTS: AnalyticsEvent[] = [
  'view',
  'nfcTap',
  'qrScan',
  'call',
  'whatsapp',
  'catalogDownload',
  'vcardDownload',
  'mapClick',
  'instagram',
  'website',
  'email',
];

interface DatabaseSchema {
  version: number;
  adminPasswordHash: string;
  adminSalt: string;
  /** Random HMAC key for admin session tokens. Never exported in backups. */
  sessionSecret?: string;
  isPasswordCustomized?: boolean;
  revokedTokens?: string[];
  profiles: EmployeeProfile[];
  leads?: CustomerLead[];
  updatedAt: string;
}

export interface BulkBrandUpdatePayload {
  company?: string;
  website?: string;
  websiteUrl?: string;
  catalogUrl?: string;
  catalogPdfUrl?: string;
  layoutDirection?: 'rtl' | 'ltr';
  instagram?: string;
  instagramUrl?: string;
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function safeEqualString(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function newSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * The signing key comes from SESSION_SECRET when set, otherwise from a random
 * per-installation secret stored in the (git-ignored) database file. It is no
 * longer derived from the password hash, so a leaked hash cannot forge tokens.
 */
function getSigningSecret(data: DatabaseSchema): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  return data.sessionSecret as string;
}

function createSignedToken(data: DatabaseSchema): string {
  const issuedAt = Date.now().toString(36);
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${issuedAt}.${nonce}`;
  const signature = crypto.createHmac('sha256', getSigningSecret(data)).update(payload).digest('hex');
  return `roya_token_${payload}.${signature}`;
}

function verifySignedToken(token: string, data: DatabaseSchema): boolean {
  if (!token || !token.startsWith('roya_token_')) return false;
  if (Array.isArray(data.revokedTokens) && data.revokedTokens.includes(token)) return false;

  const parts = token.slice('roya_token_'.length).split('.');
  if (parts.length !== 3) return false;
  const [issuedAtB36, nonce, signature] = parts;
  const issuedAt = parseInt(issuedAtB36, 36);
  if (isNaN(issuedAt) || Date.now() - issuedAt > SESSION_TTL_MS || issuedAt > Date.now() + 60_000) {
    return false;
  }
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret(data))
    .update(`${issuedAtB36}.${nonce}`)
    .digest('hex');
  return safeEqualHex(signature, expectedSig);
}

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  png: 'png',
  jpeg: 'jpg',
  jpg: 'jpg',
  webp: 'webp',
  gif: 'gif',
};

/** Detects the real image type from the first bytes (ignores the declared MIME type). */
function sniffImageExtension(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buffer.toString('ascii', 0, 3) === 'GIF') return 'gif';
  return null;
}

/**
 * Writes a Base64 data-URL image (avatar / logo) to /uploads/images and returns its public URL.
 * Only raster images are accepted (SVG can carry scripts). Throws ValidationError otherwise.
 */
export function persistBase64Image(dataUrl: string, prefix: 'avatar' | 'logo', identifier = 'staff'): string {
  const match = String(dataUrl).match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) throw new ValidationError('تصویر ارسالی معتبر نیست.');
  const declared = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_TYPES[declared]) {
    throw new ValidationError('فقط تصاویر PNG، JPG، WebP یا GIF پذیرفته می‌شوند.');
  }
  const buffer = Buffer.from(match[2], 'base64');
  const ext = sniffImageExtension(buffer);
  if (!ext) throw new ValidationError('محتوای فایل تصویر معتبر نیست.');

  const dir = getImagesDir();
  fs.mkdirSync(dir, { recursive: true });
  const safeId = identifier.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'staff';
  const fileName = `${prefix}-${safeId}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, fileName), buffer);
  return `/uploads/images/${fileName}`;
}

/** Backwards compatible wrapper: returns the input untouched when it is not a data URL or cannot be stored. */
export function persistBase64ImageIfNeeded(
  dataUrl: string | undefined,
  prefix: 'avatar' | 'logo',
  identifier = 'staff'
): string | undefined {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return dataUrl;
  return persistBase64Image(dataUrl, prefix, identifier);
}

function normalizeProfileImages(profile: EmployeeProfile, strict: boolean): { profile: EmployeeProfile; changed: boolean } {
  let changed = false;
  const key = profile.slug || profile.id || 'staff';
  const convert = (value: string | undefined, prefix: 'avatar' | 'logo') => {
    if (!value || !value.startsWith('data:image/')) return value;
    try {
      const url = persistBase64Image(value, prefix, key);
      changed = true;
      return url;
    } catch (err) {
      if (strict) throw err;
      console.warn(`Could not offload inline ${prefix} for ${key}:`, (err as Error).message);
      return value;
    }
  };
  const avatarUrl = convert(profile.avatarUrl, 'avatar');
  const logoUrl = convert(profile.logoUrl, 'logo');
  return changed ? { profile: { ...profile, avatarUrl, logoUrl }, changed } : { profile, changed };
}

let dbCache: DatabaseSchema | null = null;
let pendingSave: NodeJS.Timeout | null = null;

function initialPassword(): { password: string; generated: boolean } {
  const fromEnv = envAdminPassword();
  if (fromEnv) return { password: fromEnv, generated: false };
  return { password: crypto.randomBytes(9).toString('base64url'), generated: true };
}

function ensureDatabase(): DatabaseSchema {
  if (dbCache) return dbCache;

  const dbFile = getDbFile();
  fs.mkdirSync(getDataDir(), { recursive: true });

  if (fs.existsSync(dbFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(dbFile, 'utf-8')) as DatabaseSchema;
      if (Array.isArray(data.profiles)) {
        let shouldResave = false;
        if (!Array.isArray(data.leads)) data.leads = [];
        if (!data.sessionSecret) {
          data.sessionSecret = newSecret();
          shouldResave = true;
        }
        data.profiles = data.profiles.map((p) => {
          const norm = normalizeProfileImages(p, false);
          if (norm.changed) shouldResave = true;
          return norm.profile;
        });
        dbCache = data;
        if (shouldResave) writeToDisk(data);
        return dbCache;
      }
      throw new Error('profiles array missing');
    } catch (err) {
      // Never silently replace an unreadable database: keep a copy for recovery.
      const brokenCopy = `${dbFile}.corrupt-${Date.now()}`;
      try {
        fs.copyFileSync(dbFile, brokenCopy);
      } catch {}
      console.error(`[Roya DB] Could not read database (copy kept at ${brokenCopy}):`, err);
    }
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const { password, generated } = initialPassword();
  if (generated) {
    console.warn('==================================================================');
    console.warn('[Roya DB] New database created. Temporary admin password:');
    console.warn(`[Roya DB]   ${password}`);
    console.warn('[Roya DB] Log in and change it from the admin panel, or set ADMIN_PASSWORD.');
    console.warn('==================================================================');
  }
  const initialDb: DatabaseSchema = {
    version: 4,
    adminPasswordHash: hashPassword(password, salt),
    adminSalt: salt,
    sessionSecret: newSecret(),
    isPasswordCustomized: false,
    revokedTokens: [],
    profiles: structuredClone(INITIAL_PROFILES),
    leads: [],
    updatedAt: new Date().toISOString(),
  };
  dbCache = initialDb;
  writeToDisk(initialDb);
  return initialDb;
}

function writeToDisk(data: DatabaseSchema): boolean {
  try {
    fs.mkdirSync(getDataDir(), { recursive: true });
    const dbFile = getDbFile();
    const serialized = JSON.stringify(data, null, 2);
    const tmpFile = `${dbFile}.tmp`;
    try {
      fs.writeFileSync(tmpFile, serialized, 'utf-8');
      fs.renameSync(tmpFile, dbFile);
    } catch {
      fs.writeFileSync(dbFile, serialized, 'utf-8');
    }
    return true;
  } catch (err) {
    console.error('[Roya DB] Error saving database file:', err);
    return false;
  }
}

/**
 * Persist the database. Admin changes are written immediately; high-frequency
 * analytics events are batched (deferred) so a busy card does not rewrite the
 * whole file on every page view.
 */
function saveDatabase(data: DatabaseSchema, opts: { defer?: boolean } = {}): boolean {
  data.updatedAt = new Date().toISOString();
  dbCache = data;
  if (opts.defer) {
    if (!pendingSave) {
      pendingSave = setTimeout(() => {
        pendingSave = null;
        if (dbCache) writeToDisk(dbCache);
      }, DEFERRED_SAVE_MS);
      pendingSave.unref?.();
    }
    return true;
  }
  if (pendingSave) {
    clearTimeout(pendingSave);
    pendingSave = null;
  }
  return writeToDisk(data);
}

/**
 * Find a profile by id, then by slug, then by the dashed English name.
 * Matching in priority passes keeps an existing card's id / slug from being
 * shadowed by another profile.
 */
function findProfileInList(profiles: EmployeeProfile[], identifier: string): EmployeeProfile | undefined {
  const clean = String(identifier || '').trim().toLowerCase();
  if (!clean) return undefined;
  return (
    profiles.find((p) => p.id.toLowerCase() === clean) ||
    profiles.find((p) => p.slug && p.slug.toLowerCase() === clean) ||
    profiles.find((p) => p.nameEn && p.nameEn.trim().toLowerCase().replace(/\s+/g, '-') === clean)
  );
}

function emptyAnalytics(): EmployeeAnalytics {
  return {
    views: 0,
    nfcTaps: 0,
    qrScans: 0,
    callClicks: 0,
    whatsappClicks: 0,
    catalogDownloads: 0,
    vcardDownloads: 0,
    mapClicks: 0,
    instagramClicks: 0,
    websiteClicks: 0,
    emailClicks: 0,
    leadCaptures: 0,
  };
}

/** Fields that are safe to show to anyone who opens a card. */
export function toPublicProfile(profile: EmployeeProfile): EmployeeProfile {
  const { analytics: _analytics, ...rest } = profile;
  return rest as EmployeeProfile;
}

function validateProfileForSave(profile: EmployeeProfile, others: EmployeeProfile[]): EmployeeProfile {
  const id = String(profile.id || '').trim();
  if (!id || !isValidIdentifier(id)) {
    throw new ValidationError('شناسه کارمند فقط می‌تواند شامل حروف انگلیسی، عدد، خط تیره و زیرخط باشد.');
  }
  if (!String(profile.name || '').trim()) {
    throw new ValidationError('نام کارمند الزامی است.');
  }

  const slug = normalizeSlug(profile.slug);
  const taken = (value: string) =>
    others.some(
      (p) => p.id.toLowerCase() === value || (p.slug && p.slug.toLowerCase() === value)
    );

  if (RESERVED_SLUGS.has(id.toLowerCase())) {
    throw new ValidationError(`شناسه «${id}» رزرو شده است و نمی‌توان از آن استفاده کرد.`);
  }
  if (taken(id.toLowerCase())) {
    throw new ValidationError(`شناسه «${id}» قبلاً برای کارمند دیگری استفاده شده است.`, 409);
  }
  if (slug) {
    if (RESERVED_SLUGS.has(slug)) {
      throw new ValidationError(`آدرس «${slug}» رزرو شده است. لطفاً آدرس دیگری انتخاب کنید.`);
    }
    if (taken(slug)) {
      throw new ValidationError(`آدرس «${slug}» قبلاً برای کارمند دیگری ثبت شده است. لطفاً آدرس دیگری انتخاب کنید.`, 409);
    }
  }
  return { ...profile, id, slug: slug || undefined, name: profile.name.trim() };
}

export const db = {
  getAllProfiles(): EmployeeProfile[] {
    return ensureDatabase().profiles || [];
  },

  getProfileById(id: string): EmployeeProfile | undefined {
    return ensureDatabase().profiles.find((p) => p.id === id);
  },

  getProfileBySlugOrId(identifier: string): EmployeeProfile | undefined {
    return findProfileInList(ensureDatabase().profiles, identifier);
  },

  recordAnalyticsEvent(
    identifier: string,
    event: AnalyticsEvent
  ): { success: boolean; profileId?: string; analytics?: EmployeeProfile['analytics'] } {
    const data = ensureDatabase();
    const profile = findProfileInList(data.profiles, identifier);
    if (!profile) return { success: false };
    const a = (profile.analytics = { ...emptyAnalytics(), ...(profile.analytics || {}) });

    switch (event) {
      case 'view':
        a.views += 1;
        break;
      case 'nfcTap':
        a.nfcTaps += 1;
        a.views += 1;
        break;
      case 'qrScan':
        a.qrScans += 1;
        a.views += 1;
        break;
      case 'call':
        a.callClicks += 1;
        break;
      case 'whatsapp':
        a.whatsappClicks += 1;
        break;
      case 'catalogDownload':
        a.catalogDownloads += 1;
        break;
      case 'vcardDownload':
        a.vcardDownloads += 1;
        break;
      case 'mapClick':
        a.mapClicks += 1;
        break;
      case 'instagram':
        a.instagramClicks = (a.instagramClicks || 0) + 1;
        break;
      case 'website':
        a.websiteClicks = (a.websiteClicks || 0) + 1;
        break;
      case 'email':
        a.emailClicks = (a.emailClicks || 0) + 1;
        break;
    }
    a.lastInteractionAt = new Date().toISOString();
    saveDatabase(data, { defer: true });
    return { success: true, profileId: profile.id };
  },

  getAllLeads(): CustomerLead[] {
    const data = ensureDatabase();
    return Array.isArray(data.leads) ? data.leads : [];
  },

  /** Expects input already validated by validateLeadInput(). */
  addLead(payload: LeadInput): { lead: CustomerLead } {
    const data = ensureDatabase();
    if (!Array.isArray(data.leads)) data.leads = [];

    // Only attribute the lead when the card really exists; never guess.
    const matchedProfile = payload.profileId ? findProfileInList(data.profiles, payload.profileId) : undefined;

    const newLead: CustomerLead = {
      id: `lead_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      profileId: matchedProfile ? matchedProfile.id : '',
      profileName: matchedProfile ? matchedProfile.name : 'نامشخص (کارت یافت نشد)',
      customerName: payload.customerName,
      customerMobile: payload.customerMobile,
      customerCompany: payload.customerCompany,
      note: payload.note,
      createdAt: new Date().toISOString(),
    };
    data.leads.unshift(newLead);

    if (matchedProfile) {
      const a = (matchedProfile.analytics = { ...emptyAnalytics(), ...(matchedProfile.analytics || {}) });
      a.leadCaptures = (a.leadCaptures || 0) + 1;
      a.lastInteractionAt = new Date().toISOString();
    }
    saveDatabase(data);
    return { lead: newLead };
  },

  deleteLead(id: string): boolean {
    const data = ensureDatabase();
    if (!Array.isArray(data.leads)) return false;
    const before = data.leads.length;
    data.leads = data.leads.filter((l) => l.id !== id);
    if (data.leads.length === before) return false;
    saveDatabase(data);
    return true;
  },

  /**
   * Create or update a profile. Validates id / slug uniqueness and stores
   * inline images on disk. Throws ValidationError for invalid input.
   */
  saveProfile(input: EmployeeProfile, mode: 'create' | 'update' | 'upsert' = 'upsert'): EmployeeProfile {
    const data = ensureDatabase();
    const index = data.profiles.findIndex((p) => p.id === input.id);
    if (mode === 'create' && index >= 0) {
      throw new ValidationError('کارمندی با این شناسه قبلاً ثبت شده است.', 409);
    }
    if (mode === 'update' && index < 0) {
      throw new ValidationError('پروفایل کارمند یافت نشد.', 404);
    }

    const others = data.profiles.filter((_, i) => i !== index);
    const validated = validateProfileForSave(input, others);
    const { profile: clean } = normalizeProfileImages(validated, true);

    if (index >= 0) {
      // Analytics are owned by the server; never overwrite them from a client payload.
      const saved = { ...clean, analytics: data.profiles[index].analytics };
      data.profiles[index] = saved;
      saveDatabase(data);
      return saved;
    }
    const created = { ...clean, analytics: emptyAnalytics() };
    data.profiles.unshift(created);
    saveDatabase(data);
    return created;
  },

  updateBrandForAll(brandUpdates: BulkBrandUpdatePayload): EmployeeProfile[] {
    const data = ensureDatabase();
    data.profiles = data.profiles.map((p) => {
      const cleanWebsite = brandUpdates.website ?? p.website;
      const cleanInstagram = brandUpdates.instagram ?? p.instagram;
      return {
        ...p,
        ...(brandUpdates.company !== undefined ? { company: brandUpdates.company } : {}),
        ...(brandUpdates.website !== undefined
          ? {
              website: cleanWebsite,
              websiteUrl:
                brandUpdates.websiteUrl ||
                (cleanWebsite.startsWith('http') ? cleanWebsite : `https://${cleanWebsite}`),
            }
          : {}),
        ...(brandUpdates.catalogUrl !== undefined ? { catalogUrl: brandUpdates.catalogUrl } : {}),
        ...(brandUpdates.catalogPdfUrl !== undefined ? { catalogPdfUrl: brandUpdates.catalogPdfUrl } : {}),
        ...(brandUpdates.layoutDirection !== undefined ? { layoutDirection: brandUpdates.layoutDirection } : {}),
        ...(brandUpdates.instagram !== undefined
          ? {
              instagram: cleanInstagram,
              instagramUrl:
                brandUpdates.instagramUrl || `https://instagram.com/${cleanInstagram.replace(/^@/, '')}`,
            }
          : {}),
      };
    });
    saveDatabase(data);
    return data.profiles;
  },

  deleteProfile(id: string): boolean {
    const data = ensureDatabase();
    const before = data.profiles.length;
    data.profiles = data.profiles.filter((p) => p.id !== id);
    if (data.profiles.length === before) return false;
    saveDatabase(data);
    return true;
  },

  /** Restores the bundled sample profiles. Leaves the admin password untouched. */
  resetProfiles(): EmployeeProfile[] {
    const data = ensureDatabase();
    data.profiles = structuredClone(INITIAL_PROFILES).map((p) => ({ ...p, analytics: emptyAnalytics() }));
    saveDatabase(data);
    return data.profiles;
  },

  verifyPassword(password: string): boolean {
    if (typeof password !== 'string' || !password) return false;
    if (KNOWN_DEFAULT_PASSWORDS.has(password)) return false;
    const data = ensureDatabase();
    // ADMIN_PASSWORD is an operator-controlled secret (environment / .env file).
    const envPassword = envAdminPassword();
    if (envPassword && safeEqualString(password, envPassword)) return true;
    return safeEqualHex(hashPassword(password, data.adminSalt), data.adminPasswordHash);
  },

  /** Sets a new admin password, rotates the session key and returns a fresh token. */
  setPassword(newPassword: string): string {
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`رمز عبور جدید باید حداقل ${MIN_PASSWORD_LENGTH} کاراکتر باشد.`);
    }
    if (KNOWN_DEFAULT_PASSWORDS.has(newPassword)) {
      throw new ValidationError('این رمز عبور قبلاً عمومی بوده و قابل استفاده نیست.');
    }
    const data = ensureDatabase();
    data.adminSalt = crypto.randomBytes(16).toString('hex');
    data.adminPasswordHash = hashPassword(newPassword, data.adminSalt);
    data.isPasswordCustomized = true;
    data.sessionSecret = newSecret(); // logs out every existing session
    data.revokedTokens = [];
    saveDatabase(data);
    return createSignedToken(data);
  },

  changePassword(oldPassword: string, newPassword: string): { success: boolean; message: string; token?: string } {
    if (!this.verifyPassword(oldPassword)) {
      return { success: false, message: 'رمز عبور فعلی نامعتبر است.' };
    }
    try {
      const token = this.setPassword(newPassword);
      return { success: true, message: 'رمز عبور مدیریت با موفقیت تغییر یافت.', token };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  },

  createSession(): string {
    return createSignedToken(ensureDatabase());
  },

  validateToken(token: string): boolean {
    return verifySignedToken(token, ensureDatabase());
  },

  destroySession(token: string): void {
    if (!token || !this.validateToken(token)) return;
    const data = ensureDatabase();
    const revoked = Array.isArray(data.revokedTokens) ? data.revokedTokens : [];
    // Revoked tokens only need to be remembered until they would expire anyway.
    const now = Date.now();
    const stillValid = revoked.filter((t) => {
      const issued = parseInt(t.slice('roya_token_'.length).split('.')[0] || '', 36);
      return !isNaN(issued) && now - issued <= SESSION_TTL_MS;
    });
    data.revokedTokens = [...stillValid, token];
    saveDatabase(data);
  },

  /** Backup without any credential material (password hash, salt, session key). */
  exportBackup(): Pick<DatabaseSchema, 'version' | 'profiles' | 'leads' | 'updatedAt'> {
    const data = ensureDatabase();
    return {
      version: data.version,
      profiles: data.profiles,
      leads: data.leads || [],
      updatedAt: data.updatedAt,
    };
  },

  /** Restores profiles and leads. Credentials in old backup files are ignored on purpose. */
  importBackup(backupData: Partial<DatabaseSchema>): boolean {
    if (!backupData || !Array.isArray(backupData.profiles) || backupData.profiles.length === 0) return false;
    const valid = backupData.profiles.every(
      (p) => p && typeof p.id === 'string' && isValidIdentifier(p.id) && typeof p.name === 'string'
    );
    if (!valid) return false;
    const current = ensureDatabase();
    current.profiles = backupData.profiles.map((p) => normalizeProfileImages(p, false).profile);
    if (Array.isArray(backupData.leads)) current.leads = backupData.leads;
    return saveDatabase(current);
  },

  /** Write any batched analytics to disk (called on shutdown). */
  flush(): void {
    if (pendingSave) {
      clearTimeout(pendingSave);
      pendingSave = null;
    }
    if (dbCache) writeToDisk(dbCache);
  },

  /** Test helper: drop the in-memory cache so the next call re-reads from disk. */
  _resetCacheForTests(): void {
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = null;
    dbCache = null;
  },
};
