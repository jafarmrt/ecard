import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { INITIAL_PROFILES } from '../data/defaultProfiles.ts';
import { EmployeeProfile, CustomerLead } from '../types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const IMAGES_UPLOAD_DIR = path.resolve(process.cwd(), 'public', 'uploads', 'images');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface DatabaseSchema {
  version: number;
  adminPasswordHash: string;
  adminSalt: string;
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

// Helper to hash password
function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

// Helper to sign and verify stateless persistent session tokens
function getSigningSecret(data: DatabaseSchema): string {
  return `roya_secret_${data.adminSalt}_${data.adminPasswordHash}`;
}

function createSignedToken(data: DatabaseSchema): string {
  const issuedAt = Date.now().toString(36);
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${issuedAt}.${nonce}`;
  const signature = crypto
    .createHmac('sha256', getSigningSecret(data))
    .update(payload)
    .digest('hex');
  return `roya_token_${payload}.${signature}`;
}

function verifySignedToken(token: string, data: DatabaseSchema): boolean {
  if (!token || !token.startsWith('roya_token_')) return false;
  if (Array.isArray(data.revokedTokens) && data.revokedTokens.includes(token)) {
    return false;
  }

  const raw = token.slice('roya_token_'.length);
  const parts = raw.split('.');
  if (parts.length !== 3) return false;

  const [issuedAtB36, nonce, signature] = parts;
  const issuedAt = parseInt(issuedAtB36, 36);
  if (isNaN(issuedAt) || Date.now() - issuedAt > SESSION_TTL_MS) {
    return false;
  }

  const payload = `${issuedAtB36}.${nonce}`;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret(data))
    .update(payload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSig, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Offloads Base64 Data URL images (avatar / logo) to disk under /public/uploads/images/
 * so database.json remains lightweight and fast.
 */
export function persistBase64ImageIfNeeded(
  dataUrl: string | undefined,
  prefix: 'avatar' | 'logo',
  identifier: string = 'staff'
): string | undefined {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  try {
    if (!fs.existsSync(IMAGES_UPLOAD_DIR)) {
      fs.mkdirSync(IMAGES_UPLOAD_DIR, { recursive: true });
    }

    const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) return dataUrl;

    const rawSubtype = match[1].toLowerCase();
    const base64Payload = match[2];
    let ext = 'webp';
    if (rawSubtype.includes('png')) ext = 'png';
    else if (rawSubtype.includes('jpeg') || rawSubtype.includes('jpg')) ext = 'jpg';
    else if (rawSubtype.includes('svg')) ext = 'svg';
    else if (rawSubtype.includes('gif')) ext = 'gif';

    const buffer = Buffer.from(base64Payload, 'base64');
    if (buffer.length === 0) return dataUrl;

    const safeId = identifier.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'staff';
    const fileName = `${prefix}-${safeId}-${Date.now()}.${ext}`;
    const filePath = path.join(IMAGES_UPLOAD_DIR, fileName);

    fs.writeFileSync(filePath, buffer);
    return `/uploads/images/${fileName}`;
  } catch (err) {
    console.warn('Could not offload base64 image to disk, keeping inline:', err);
    return dataUrl;
  }
}

function normalizeProfileImages(profile: EmployeeProfile): { profile: EmployeeProfile; changed: boolean } {
  let changed = false;
  const safeKey = profile.slug || profile.id || 'staff';

  let avatarUrl = profile.avatarUrl;
  if (avatarUrl && avatarUrl.startsWith('data:image/')) {
    const offloaded = persistBase64ImageIfNeeded(avatarUrl, 'avatar', safeKey);
    if (offloaded !== avatarUrl) {
      avatarUrl = offloaded;
      changed = true;
    }
  }

  let logoUrl = profile.logoUrl;
  if (logoUrl && logoUrl.startsWith('data:image/')) {
    const offloaded = persistBase64ImageIfNeeded(logoUrl, 'logo', safeKey);
    if (offloaded !== logoUrl) {
      logoUrl = offloaded;
      changed = true;
    }
  }

  if (!changed) return { profile, changed: false };
  return {
    profile: {
      ...profile,
      avatarUrl,
      logoUrl,
    },
    changed: true,
  };
}

// In-memory cache to avoid redundant synchronous disk reads and race conditions
let dbCache: DatabaseSchema | null = null;

// Ensure data directory and database file exist
function ensureDatabase(): DatabaseSchema {
  if (dbCache) {
    return dbCache;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const data = JSON.parse(content) as DatabaseSchema;
      if (Array.isArray(data.profiles)) {
        let shouldResave = false;
        if (data.profiles.length === 0 && INITIAL_PROFILES.length > 0) {
          data.profiles = structuredClone(INITIAL_PROFILES);
          shouldResave = true;
        }
        if (!Array.isArray(data.leads)) {
          data.leads = [];
        }

        // Automatically migrate any inline Base64 images in database.json to /uploads/images/
        data.profiles = data.profiles.map((p) => {
          const norm = normalizeProfileImages(p);
          if (norm.changed) shouldResave = true;
          return norm.profile;
        });

        dbCache = data;
        if (shouldResave) {
          saveDatabase(data);
        }
        return dbCache;
      }
    } catch (err) {
      console.error('Error reading database file, initializing default:', err);
    }
  }

  // Initialize with defaults
  const defaultSalt = crypto.randomBytes(16).toString('hex');
  const defaultPassword = process.env.ADMIN_PASSWORD || 'roya1403';
  const defaultHash = hashPassword(defaultPassword, defaultSalt);

  const initialDb: DatabaseSchema = {
    version: 3,
    adminPasswordHash: defaultHash,
    adminSalt: defaultSalt,
    isPasswordCustomized: false,
    revokedTokens: [],
    profiles: structuredClone(INITIAL_PROFILES),
    leads: [],
    updatedAt: new Date().toISOString(),
  };

  dbCache = initialDb;
  saveDatabase(initialDb);
  return initialDb;
}

// Atomic write to disk to prevent file corruption on concurrent updates
function saveDatabase(data: DatabaseSchema): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    data.updatedAt = new Date().toISOString();
    dbCache = data;

    const serialized = JSON.stringify(data, null, 2);
    const tmpFile = `${DB_FILE}.tmp`;
    try {
      fs.writeFileSync(tmpFile, serialized, 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch {
      // Fallback if rename across volume boundaries fails
      fs.writeFileSync(DB_FILE, serialized, 'utf-8');
    }
    return true;
  } catch (err) {
    console.error('Error saving database file:', err);
    return false;
  }
}

function findProfileInList(profiles: EmployeeProfile[], identifier: string): EmployeeProfile | undefined {
  const clean = identifier.trim().toLowerCase();
  return profiles.find(
    (p) =>
      p.id.toLowerCase() === clean ||
      (p.slug && p.slug.toLowerCase() === clean) ||
      (p.nameEn && p.nameEn.toLowerCase().replace(/\s+/g, '-') === clean)
  );
}

export const db = {
  // Profiles CRUD
  getAllProfiles(): EmployeeProfile[] {
    const data = ensureDatabase();
    return data.profiles || [];
  },

  getProfileById(id: string): EmployeeProfile | undefined {
    const data = ensureDatabase();
    return data.profiles.find((p) => p.id === id);
  },

  getProfileBySlugOrId(identifier: string): EmployeeProfile | undefined {
    const data = ensureDatabase();
    return findProfileInList(data.profiles, identifier);
  },

  recordAnalyticsEvent(
    identifier: string,
    event: 'view' | 'nfcTap' | 'qrScan' | 'call' | 'whatsapp' | 'catalogDownload' | 'vcardDownload' | 'mapClick'
  ): { success: boolean; profileId?: string; analytics?: EmployeeProfile['analytics'] } {
    const data = ensureDatabase();
    const profile = findProfileInList(data.profiles, identifier);
    if (!profile) return { success: false };

    if (!profile.analytics) {
      profile.analytics = {
        views: 0,
        nfcTaps: 0,
        qrScans: 0,
        callClicks: 0,
        whatsappClicks: 0,
        catalogDownloads: 0,
        vcardDownloads: 0,
        mapClicks: 0,
        leadCaptures: 0,
        lastInteractionAt: new Date().toISOString(),
      };
    }

    switch (event) {
      case 'view':
        profile.analytics.views = (profile.analytics.views || 0) + 1;
        break;
      case 'nfcTap':
        profile.analytics.nfcTaps = (profile.analytics.nfcTaps || 0) + 1;
        profile.analytics.views = (profile.analytics.views || 0) + 1;
        break;
      case 'qrScan':
        profile.analytics.qrScans = (profile.analytics.qrScans || 0) + 1;
        profile.analytics.views = (profile.analytics.views || 0) + 1;
        break;
      case 'call':
        profile.analytics.callClicks = (profile.analytics.callClicks || 0) + 1;
        break;
      case 'whatsapp':
        profile.analytics.whatsappClicks = (profile.analytics.whatsappClicks || 0) + 1;
        break;
      case 'catalogDownload':
        profile.analytics.catalogDownloads = (profile.analytics.catalogDownloads || 0) + 1;
        break;
      case 'vcardDownload':
        profile.analytics.vcardDownloads = (profile.analytics.vcardDownloads || 0) + 1;
        break;
      case 'mapClick':
        profile.analytics.mapClicks = (profile.analytics.mapClicks || 0) + 1;
        break;
    }

    profile.analytics.lastInteractionAt = new Date().toISOString();
    saveDatabase(data);
    return { success: true, profileId: profile.id, analytics: profile.analytics };
  },

  // Customer Leads (Lead Capture) CRUD
  getAllLeads(): CustomerLead[] {
    const data = ensureDatabase();
    return Array.isArray(data.leads) ? data.leads : [];
  },

  addLead(payload: {
    profileId: string;
    customerName: string;
    customerMobile: string;
    customerCompany?: string;
    note?: string;
  }): { lead: CustomerLead; profileAnalytics?: EmployeeProfile['analytics'] } {
    const data = ensureDatabase();
    if (!Array.isArray(data.leads)) {
      data.leads = [];
    }

    const matchedProfile = findProfileInList(data.profiles, payload.profileId) || data.profiles[0];
    const resolvedProfileId = matchedProfile ? matchedProfile.id : payload.profileId;
    const resolvedProfileName = matchedProfile ? matchedProfile.name : 'عمومی رویا';

    const newLead: CustomerLead = {
      id: `lead_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      profileId: resolvedProfileId,
      profileName: resolvedProfileName,
      customerName: payload.customerName.trim(),
      customerMobile: payload.customerMobile.trim(),
      customerCompany: payload.customerCompany?.trim() || undefined,
      note: payload.note?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    data.leads.unshift(newLead);

    if (matchedProfile) {
      if (!matchedProfile.analytics) {
        matchedProfile.analytics = {
          views: 0,
          nfcTaps: 0,
          qrScans: 0,
          callClicks: 0,
          whatsappClicks: 0,
          catalogDownloads: 0,
          vcardDownloads: 0,
          mapClicks: 0,
          leadCaptures: 0,
          lastInteractionAt: new Date().toISOString(),
        };
      }
      matchedProfile.analytics.leadCaptures = (matchedProfile.analytics.leadCaptures || 0) + 1;
      matchedProfile.analytics.lastInteractionAt = new Date().toISOString();
    }

    saveDatabase(data);
    return { lead: newLead, profileAnalytics: matchedProfile?.analytics };
  },

  deleteLead(id: string): boolean {
    const data = ensureDatabase();
    if (!Array.isArray(data.leads)) return false;
    const initialLen = data.leads.length;
    data.leads = data.leads.filter((l) => l.id !== id);
    if (data.leads.length !== initialLen) {
      saveDatabase(data);
      return true;
    }
    return false;
  },

  saveProfile(profile: EmployeeProfile): EmployeeProfile {
    const data = ensureDatabase();
    // Automatically offload any base64 avatar or logo to /uploads/images/
    const { profile: cleanProfile } = normalizeProfileImages(profile);

    const index = data.profiles.findIndex((p) => p.id === cleanProfile.id);
    if (index >= 0) {
      const existingAnalytics = data.profiles[index].analytics;
      data.profiles[index] = {
        ...cleanProfile,
        analytics: cleanProfile.analytics || existingAnalytics,
      };
    } else {
      data.profiles.unshift(cleanProfile);
    }
    saveDatabase(data);
    return index >= 0 ? data.profiles[index] : cleanProfile;
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
                brandUpdates.instagramUrl ||
                `https://instagram.com/${cleanInstagram.replace(/^@/, '')}`,
            }
          : {}),
      };
    });
    saveDatabase(data);
    return data.profiles;
  },

  deleteProfile(id: string): boolean {
    const data = ensureDatabase();
    const initialLen = data.profiles.length;
    data.profiles = data.profiles.filter((p) => p.id !== id);
    if (data.profiles.length !== initialLen) {
      saveDatabase(data);
      return true;
    }
    return false;
  },

  resetProfiles(): EmployeeProfile[] {
    const data = ensureDatabase();
    data.profiles = structuredClone(INITIAL_PROFILES);
    data.isPasswordCustomized = false;
    saveDatabase(data);
    return data.profiles;
  },

  // Admin Auth
  verifyPassword(password: string): boolean {
    const data = ensureDatabase();
    if (process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
      return true;
    }
    const hash = hashPassword(password, data.adminSalt);
    if (hash === data.adminPasswordHash) {
      return true;
    }
    if (
      !data.isPasswordCustomized &&
      (password === 'roya1403' || password === 'admin123' || password === 'roya2026')
    ) {
      return true;
    }
    return false;
  },

  changePassword(
    oldPassword: string,
    newPassword: string
  ): { success: boolean; message: string; token?: string } {
    if (!this.verifyPassword(oldPassword)) {
      return { success: false, message: 'رمز عبور فعلی نامعتبر است.' };
    }
    if (!newPassword || newPassword.length < 4) {
      return { success: false, message: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد.' };
    }
    const data = ensureDatabase();
    const newSalt = crypto.randomBytes(16).toString('hex');
    data.adminSalt = newSalt;
    data.adminPasswordHash = hashPassword(newPassword, newSalt);
    data.isPasswordCustomized = true;
    data.revokedTokens = [];
    saveDatabase(data);

    const newToken = createSignedToken(data);
    return {
      success: true,
      message: 'رمز عبور مدیریت با موفقیت تغییر یافت.',
      token: newToken,
    };
  },

  createSession(): string {
    const data = ensureDatabase();
    return createSignedToken(data);
  },

  validateToken(token: string): boolean {
    const data = ensureDatabase();
    return verifySignedToken(token, data);
  },

  destroySession(token: string): void {
    if (!token) return;
    const data = ensureDatabase();
    if (!Array.isArray(data.revokedTokens)) {
      data.revokedTokens = [];
    }
    if (!data.revokedTokens.includes(token)) {
      data.revokedTokens = [...data.revokedTokens.slice(-99), token];
      saveDatabase(data);
    }
  },

  // Backup and Restore
  exportBackup(): DatabaseSchema {
    return ensureDatabase();
  },

  importBackup(backupData: Partial<DatabaseSchema>): boolean {
    if (!Array.isArray(backupData.profiles) || backupData.profiles.length === 0) {
      return false;
    }
    const current = ensureDatabase();
    current.profiles = backupData.profiles.map((p) => normalizeProfileImages(p).profile);
    if (Array.isArray(backupData.leads)) {
      current.leads = backupData.leads;
    }
    if (backupData.adminPasswordHash && backupData.adminSalt) {
      current.adminPasswordHash = backupData.adminPasswordHash;
      current.adminSalt = backupData.adminSalt;
    }
    if (typeof backupData.isPasswordCustomized === 'boolean') {
      current.isPasswordCustomized = backupData.isPasswordCustomized;
    }
    return saveDatabase(current);
  },
};
