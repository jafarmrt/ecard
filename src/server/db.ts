import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { INITIAL_PROFILES } from '../data/defaultProfiles.ts';
import { EmployeeProfile } from '../types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

interface DatabaseSchema {
  version: number;
  adminPasswordHash: string;
  adminSalt: string;
  isPasswordCustomized?: boolean;
  profiles: EmployeeProfile[];
  updatedAt: string;
}

// Helper to hash password
function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

// Active session tokens for admin
const activeSessions = new Set<string>();

// Ensure data directory and database file exist
function ensureDatabase(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const data = JSON.parse(content) as DatabaseSchema;
      if (Array.isArray(data.profiles)) {
        if (data.profiles.length === 0 && INITIAL_PROFILES.length > 0) {
          data.profiles = INITIAL_PROFILES;
          saveDatabase(data);
        }
        return data;
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
    version: 1,
    adminPasswordHash: defaultHash,
    adminSalt: defaultSalt,
    isPasswordCustomized: false,
    profiles: INITIAL_PROFILES,
    updatedAt: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing initial database file:', err);
  }

  return initialDb;
}

function saveDatabase(data: DatabaseSchema): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving database file:', err);
    return false;
  }
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
    const clean = identifier.trim().toLowerCase();
    return data.profiles.find(
      (p) =>
        p.id.toLowerCase() === clean ||
        (p.slug && p.slug.toLowerCase() === clean) ||
        (p.nameEn && p.nameEn.toLowerCase().replace(/\s+/g, '-') === clean)
    );
  },

  recordAnalyticsEvent(
    identifier: string,
    event: 'view' | 'nfcTap' | 'qrScan' | 'call' | 'whatsapp' | 'catalogDownload' | 'vcardDownload' | 'mapClick'
  ): { success: boolean; analytics?: any } {
    const data = ensureDatabase();
    const profile = this.getProfileBySlugOrId(identifier);
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
    return { success: true, analytics: profile.analytics };
  },

  saveProfile(profile: EmployeeProfile): EmployeeProfile {
    const data = ensureDatabase();
    const index = data.profiles.findIndex((p) => p.id === profile.id);
    if (index >= 0) {
      data.profiles[index] = profile;
    } else {
      data.profiles.unshift(profile);
    }
    saveDatabase(data);
    return profile;
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
    data.profiles = INITIAL_PROFILES;
    data.isPasswordCustomized = false;
    saveDatabase(data);
    return data.profiles;
  },

  // Admin Auth
  verifyPassword(password: string): boolean {
    const data = ensureDatabase();
    // Also check environment variable if set
    if (process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
      return true;
    }
    const hash = hashPassword(password, data.adminSalt);
    if (hash === data.adminPasswordHash) {
      return true;
    }
    // Only support default admin passwords if password has not been customized
    if (!data.isPasswordCustomized && (password === 'roya1403' || password === 'admin123' || password === 'roya2026')) {
      return true;
    }
    return false;
  },

  changePassword(oldPassword: string, newPassword: string): { success: boolean; message: string } {
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
    saveDatabase(data);
    return { success: true, message: 'رمز عبور مدیریت با موفقیت تغییر یافت.' };
  },

  createSession(): string {
    const token = 'roya_token_' + crypto.randomBytes(32).toString('hex');
    activeSessions.add(token);
    return token;
  },

  validateToken(token: string): boolean {
    if (!token) return false;
    return activeSessions.has(token);
  },

  destroySession(token: string): void {
    activeSessions.delete(token);
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
    current.profiles = backupData.profiles;
    if (backupData.adminPasswordHash && backupData.adminSalt) {
      current.adminPasswordHash = backupData.adminPasswordHash;
      current.adminSalt = backupData.adminSalt;
    }
    return saveDatabase(current);
  },
};
