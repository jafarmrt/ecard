import type { AuditEntry, Branch, CustomerLead, EmployeeProfile, Organization } from '../types';

/**
 * Admin sessions use an HttpOnly cookie set by the server, so no secret is
 * stored in the browser. `ADMIN_HINT_KEY` only remembers that this device was
 * logged in, to show the right screen while the session is checked.
 */
const ADMIN_HINT_KEY = 'roya_admin_hint';
const LEGACY_TOKEN_KEY = 'roya_admin_token';
const PROFILES_CACHE_KEY = 'roya_employee_profiles';
const CARD_CACHE_PREFIX = 'roya_card_';

function updateCachedProfiles(profiles: EmployeeProfile[]) {
  try {
    if (Array.isArray(profiles) && profiles.length > 0) {
      localStorage.setItem(PROFILES_CACHE_KEY, JSON.stringify(profiles));
    }
  } catch {
    // ignore storage errors
  }
}

function setHint(on: boolean) {
  try {
    if (on) localStorage.setItem(ADMIN_HINT_KEY, '1');
    else localStorage.removeItem(ADMIN_HINT_KEY);
    // Tokens from version 2.x are no longer used.
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    sessionStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {}
}

type Json = Record<string, any>;

/** fetch wrapper for the admin API: sends the session cookie and parses JSON errors. */
async function call<T extends Json = Json>(
  url: string,
  init: RequestInit & { json?: unknown } = {},
  fallbackError = 'خطا در ارتباط با سرور'
): Promise<T & { ok: boolean; status: number; error?: string }> {
  const { json, headers, ...rest } = init;
  try {
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...rest,
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(headers || {}),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    const data = (await res.json().catch(() => ({}))) as Json;
    if (res.status === 401) setHint(false);
    const ok = res.ok && data.success !== false;
    return { ...(data as T), ok, status: res.status, error: ok ? undefined : data.error || data.message || fallbackError };
  } catch {
    return { ok: false, status: 0, error: fallbackError } as T & { ok: boolean; status: number; error?: string };
  }
}

export type AnalyticsEventName =
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

export type PublicCardResponse =
  | { kind: 'ok'; profile: EmployeeProfile; canonicalSlug?: string; replacedFrom?: { name: string } }
  | { kind: 'unavailable'; state: 'inactive' | 'archived'; name: string; company: Partial<EmployeeProfile> & { company?: string } }
  | { kind: 'not-found' }
  | { kind: 'offline'; profile: EmployeeProfile | null };

export interface SystemHealth {
  version: string;
  node: string;
  uptimeSeconds: number;
  schemaVersion: number;
  profiles: number;
  archivedProfiles: number;
  branches: number;
  leads: number;
  events: number;
  passwordCustomized: boolean;
  databaseBytes: number;
  uploadsBytes: number;
  disk: { free: number; total: number } | null;
  lastBackupAt: string | null;
  backups: { name: string; size: number; createdAt: string }[];
  sessionSecretFromEnv: boolean;
}

export interface RestorePreview {
  valid: boolean;
  error?: string;
  format?: 'legacy' | 'current';
  incoming: { profiles: number; leads: number; branches: number };
  current: { profiles: number; leads: number; branches: number };
  added: string[];
  removed: string[];
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const bytes = atob(match[2]);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type: match[1] });
}

export const api = {
  // ---------------- Session ----------------
  /** True when this device was logged in recently (the server still decides). */
  hasAdminHint(): boolean {
    try {
      return localStorage.getItem(ADMIN_HINT_KEY) === '1';
    } catch {
      return false;
    }
  },

  async checkAdminAuth(): Promise<boolean> {
    const data = await call<{ valid?: boolean }>('/api/auth/check', { method: 'POST' });
    const valid = Boolean(data.ok && data.valid);
    setHint(valid);
    return valid;
  },

  async loginAdmin(password: string): Promise<{ success: boolean; error?: string }> {
    const data = await call('/api/auth/login', { method: 'POST', json: { password } }, 'رمز عبور نادرست است.');
    if (data.ok) setHint(true);
    return { success: data.ok, error: data.error };
  },

  async logoutAdmin(): Promise<void> {
    await call('/api/auth/logout', { method: 'POST' });
    setHint(false);
  },

  async changeAdminPassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const data = await call<{ message?: string }>(
      '/api/auth/change-password',
      { method: 'POST', json: { oldPassword, newPassword } },
      'خطا در تغییر رمز عبور'
    );
    return { success: data.ok, message: data.message, error: data.error };
  },

  // ---------------- Profiles ----------------
  /** Full list for the admin panel. Falls back to this device's cache when offline. */
  async getProfiles(): Promise<EmployeeProfile[]> {
    const data = await call<{ profiles?: EmployeeProfile[] }>('/api/profiles');
    if (data.ok && Array.isArray(data.profiles)) {
      updateCachedProfiles(data.profiles);
      return data.profiles;
    }
    if (data.status === 401) return [];
    return this.getCachedProfiles();
  },

  getCachedProfiles(): EmployeeProfile[] {
    try {
      const cached = localStorage.getItem(PROFILES_CACHE_KEY);
      const parsed = cached ? JSON.parse(cached) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  clearCachedProfiles() {
    try {
      localStorage.removeItem(PROFILES_CACHE_KEY);
    } catch {}
  },

  /**
   * Public card as a visitor sees it. Archived cards may come back as their
   * replacement (`replacedFrom`), inactive ones as `unavailable`. On a network
   * error the last copy of the card seen on this device is returned.
   */
  async getPublicCard(id: string): Promise<PublicCardResponse> {
    const cacheKey = `${CARD_CACHE_PREFIX}${String(id).toLowerCase()}`;
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) {
        try {
          localStorage.removeItem(cacheKey);
        } catch {}
        return { kind: 'not-found' };
      }
      if (res.status === 410) {
        try {
          localStorage.removeItem(cacheKey);
        } catch {}
        return { kind: 'unavailable', state: data.state, name: data.name || '', company: data.company || {} };
      }
      if (res.ok && data.success && data.profile) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data.profile));
        } catch {}
        return { kind: 'ok', profile: data.profile, canonicalSlug: data.canonicalSlug, replacedFrom: data.replacedFrom };
      }
    } catch (err) {
      console.warn(`Failed to fetch profile ${id}:`, err);
    }
    try {
      const cached = localStorage.getItem(cacheKey);
      return { kind: 'offline', profile: cached ? (JSON.parse(cached) as EmployeeProfile) : null };
    } catch {
      return { kind: 'offline', profile: null };
    }
  },

  /** Compatibility wrapper used by older screens. */
  async getProfile(id: string): Promise<EmployeeProfile | null | 'not-found'> {
    const result = await this.getPublicCard(id);
    if (result.kind === 'ok') return result.profile;
    if (result.kind === 'offline') return result.profile;
    return 'not-found';
  },

  async createProfile(profile: EmployeeProfile): Promise<{ success: boolean; profile?: EmployeeProfile; error?: string }> {
    const data = await call<{ profile?: EmployeeProfile }>('/api/profiles', { method: 'POST', json: profile }, 'خطا در ایجاد پروفایل');
    return { success: data.ok, profile: data.profile, error: data.error };
  },

  async updateProfile(profile: EmployeeProfile): Promise<{ success: boolean; profile?: EmployeeProfile; error?: string }> {
    const data = await call<{ profile?: EmployeeProfile }>(
      `/api/profiles/${encodeURIComponent(profile.id)}`,
      { method: 'PUT', json: profile },
      'خطا در به‌روزرسانی پروفایل'
    );
    return { success: data.ok, profile: data.profile, error: data.error };
  },

  /** Archives a card (links keep working: they open `redirectTo` or the company page). */
  async archiveProfile(id: string, redirectTo?: string): Promise<{ success: boolean; profile?: EmployeeProfile; error?: string }> {
    const data = await call<{ profile?: EmployeeProfile }>(
      `/api/profiles/${encodeURIComponent(id)}/archive`,
      { method: 'POST', json: { redirectTo: redirectTo || '' } },
      'خطا در بایگانی کارت'
    );
    return { success: data.ok, profile: data.profile, error: data.error };
  },

  async restoreProfile(id: string): Promise<{ success: boolean; profile?: EmployeeProfile; error?: string }> {
    const data = await call<{ profile?: EmployeeProfile }>(
      `/api/profiles/${encodeURIComponent(id)}/restore`,
      { method: 'POST' },
      'خطا در فعال‌سازی کارت'
    );
    return { success: data.ok, profile: data.profile, error: data.error };
  },

  /** Permanently deletes an archived card. */
  async deleteProfile(id: string): Promise<{ success: boolean; error?: string }> {
    const data = await call(`/api/profiles/${encodeURIComponent(id)}?permanent=1`, { method: 'DELETE' }, 'خطا در حذف پروفایل');
    return { success: data.ok, error: data.error };
  },

  // ---------------- Organisation & branches ----------------
  async getOrganization(): Promise<{ success: boolean; organization?: Organization; error?: string }> {
    const data = await call<{ organization?: Organization }>('/api/organization');
    return { success: data.ok, organization: data.organization, error: data.error };
  },

  async updateOrganization(
    fields: Partial<Organization>,
    clearOverrides = false
  ): Promise<{ success: boolean; organization?: Organization; profiles?: EmployeeProfile[]; message?: string; error?: string }> {
    const data = await call<{ organization?: Organization; profiles?: EmployeeProfile[]; message?: string }>(
      '/api/organization',
      { method: 'PUT', json: { ...fields, clearOverrides } },
      'خطا در ذخیره تنظیمات سازمان'
    );
    if (data.ok && data.profiles) updateCachedProfiles(data.profiles);
    return { success: data.ok, organization: data.organization, profiles: data.profiles, message: data.message, error: data.error };
  },

  async getBranches(): Promise<{ success: boolean; branches?: Branch[]; error?: string }> {
    const data = await call<{ branches?: Branch[] }>('/api/branches');
    return { success: data.ok, branches: data.branches, error: data.error };
  },

  async saveBranch(
    branch: Partial<Branch>,
    mode: 'create' | 'update'
  ): Promise<{ success: boolean; branches?: Branch[]; profiles?: EmployeeProfile[]; error?: string }> {
    const url = mode === 'create' ? '/api/branches' : `/api/branches/${encodeURIComponent(String(branch.id))}`;
    const data = await call<{ branches?: Branch[]; profiles?: EmployeeProfile[] }>(
      url,
      { method: mode === 'create' ? 'POST' : 'PUT', json: branch },
      'خطا در ذخیره شعبه'
    );
    return { success: data.ok, branches: data.branches, profiles: data.profiles, error: data.error };
  },

  async deleteBranch(id: string): Promise<{ success: boolean; branches?: Branch[]; profiles?: EmployeeProfile[]; error?: string }> {
    const data = await call<{ branches?: Branch[]; profiles?: EmployeeProfile[] }>(
      `/api/branches/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      'خطا در حذف شعبه'
    );
    return { success: data.ok, branches: data.branches, profiles: data.profiles, error: data.error };
  },

  /** Kept for the brand settings screen: updates the organisation for every card. */
  async updateBrandForAll(brandUpdates: Partial<Organization>): Promise<{
    success: boolean;
    profiles?: EmployeeProfile[];
    message?: string;
    error?: string;
  }> {
    const result = await this.updateOrganization(brandUpdates, true);
    return { success: result.success, profiles: result.profiles, message: result.message, error: result.error };
  },

  // ---------------- Backup & system ----------------
  async downloadBackup(): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/backup', { credentials: 'same-origin' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error || 'خطا در دریافت فایل پشتیبان از سرور' };
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roya-db-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 2000);
      return { success: true };
    } catch {
      return { success: false, error: 'خطا در برقراری ارتباط با سرور' };
    }
  },

  async previewRestore(backupData: unknown): Promise<{ success: boolean; preview?: RestorePreview; error?: string }> {
    const data = await call<{ preview?: RestorePreview }>('/api/restore/preview', { method: 'POST', json: backupData });
    return { success: data.ok, preview: data.preview, error: data.error };
  },

  async restoreBackup(
    backupData: unknown
  ): Promise<{ success: boolean; profiles?: EmployeeProfile[]; safetyCopy?: string; message?: string; error?: string }> {
    const data = await call<{ profiles?: EmployeeProfile[]; safetyCopy?: string; message?: string }>(
      '/api/restore',
      { method: 'POST', json: backupData },
      'خطا در بازگردانی پشتیبان'
    );
    if (data.ok && Array.isArray(data.profiles)) updateCachedProfiles(data.profiles);
    return { success: data.ok, profiles: data.profiles, safetyCopy: data.safetyCopy, message: data.message, error: data.error };
  },

  async getSystemHealth(): Promise<{ success: boolean; health?: SystemHealth; error?: string }> {
    const data = await call<{ health?: SystemHealth }>('/api/admin/health');
    return { success: data.ok, health: data.health, error: data.error };
  },

  async createServerBackup(): Promise<{ success: boolean; file?: string; message?: string; error?: string }> {
    const data = await call<{ file?: string; message?: string }>('/api/admin/snapshot', { method: 'POST' });
    return { success: data.ok, file: data.file, message: data.message, error: data.error };
  },

  async getAuditLog(limit = 100, offset = 0): Promise<{ success: boolean; entries?: AuditEntry[]; total?: number; error?: string }> {
    const data = await call<{ entries?: AuditEntry[]; total?: number }>(`/api/audit?limit=${limit}&offset=${offset}`);
    return { success: data.ok, entries: data.entries, total: data.total, error: data.error };
  },

  // ---------------- Analytics ----------------
  async trackAnalyticsEvent(
    profileIdOrSlug: string,
    event: AnalyticsEventName,
    extra: { source?: string; campaign?: string } = {}
  ): Promise<{ success: boolean }> {
    try {
      const res = await fetch(`/api/analytics/${encodeURIComponent(profileIdOrSlug)}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, ...extra }),
        keepalive: true, // still delivered when the tap opens another app (tel:, WhatsApp, ...)
      });
      return { success: res.ok };
    } catch {
      return { success: false };
    }
  },

  async getAnalyticsSummary(): Promise<{ success: boolean; summary?: any; error?: string }> {
    const data = await call<{ summary?: any }>('/api/analytics/summary', {}, 'خطا در دریافت آمار');
    return { success: data.ok, summary: data.summary, error: data.error };
  },

  async getTimeSeries(params: { from?: string; to?: string; profileId?: string } = {}): Promise<{
    success: boolean;
    days?: { day: string; views: number; visitors: number; interactions: number; leads: number }[];
    bySource?: { source: string; device: string; n: number }[];
    error?: string;
  }> {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
    const data = await call<{ days?: any[]; bySource?: any[] }>(`/api/analytics/timeseries${query ? `?${query}` : ''}`);
    return { success: data.ok, days: data.days, bySource: data.bySource, error: data.error };
  },

  // ---------------- Leads ----------------
  async submitLead(payload: {
    profileId: string;
    customerName: string;
    customerMobile: string;
    customerCompany?: string;
    topic?: string;
    note?: string;
    consent: boolean;
    source?: string;
    /** Honeypot: must stay empty. */
    website?: string;
  }): Promise<{ success: boolean; lead?: Pick<CustomerLead, 'id' | 'createdAt'>; message?: string; error?: string }> {
    const data = await call<{ lead?: Pick<CustomerLead, 'id' | 'createdAt'>; message?: string }>(
      '/api/leads',
      { method: 'POST', json: payload },
      'خطا در ثبت اطلاعات تماس'
    );
    return { success: data.ok, lead: data.lead, message: data.message, error: data.error };
  },

  async getLeads(): Promise<{ success: boolean; leads?: CustomerLead[]; error?: string }> {
    const data = await call<{ leads?: CustomerLead[] }>('/api/leads', {}, 'خطا در دریافت لیست مشتریان');
    return { success: data.ok, leads: data.leads || [], error: data.error };
  },

  async deleteLead(id: string): Promise<{ success: boolean; error?: string }> {
    const data = await call(`/api/leads/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'خطا در حذف رکورد مشتری');
    return { success: data.ok, error: data.error };
  },

  // ---------------- Uploads (raw file body, no base64) ----------------
  async uploadImage(
    file: Blob | string,
    type: 'avatar' | 'logo',
    profileId?: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    const blob = typeof file === 'string' ? dataUrlToBlob(file) : file;
    if (!blob) return { success: false, error: 'تصویر انتخاب‌شده معتبر نیست.' };
    const query = new URLSearchParams({ type, profileId: profileId || 'staff' }).toString();
    const data = await call<{ url?: string }>(
      `/api/upload-image?${query}`,
      { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg' } },
      'خطا در آپلود تصویر'
    );
    return { success: data.ok && Boolean(data.url), url: data.url, error: data.error };
  },

  async uploadPdf(
    file: Blob | string,
    fileName: string,
    replaceDefault: boolean = false
  ): Promise<{ success: boolean; url?: string; fileName?: string; size?: number; error?: string }> {
    const blob = typeof file === 'string' ? dataUrlToBlob(file) : file;
    if (!blob) return { success: false, error: 'فایل PDF معتبر نیست.' };
    const query = new URLSearchParams({ fileName, replaceDefault: replaceDefault ? '1' : '0' }).toString();
    const data = await call<{ url?: string; fileName?: string; size?: number }>(
      `/api/upload-pdf?${query}`,
      { method: 'POST', body: blob, headers: { 'Content-Type': 'application/pdf' } },
      'خطا در آپلود فایل PDF'
    );
    return { success: data.ok, url: data.url, fileName: data.fileName, size: data.size, error: data.error };
  },
};
