import { EmployeeProfile, CustomerLead } from '../types';

const ADMIN_TOKEN_KEY = 'roya_admin_token';
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

export const api = {
  // Admin Token Management
  getAdminToken(): string | null {
    try {
      return localStorage.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(ADMIN_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setAdminToken(token: string, remember: boolean = true) {
    try {
      if (remember) {
        localStorage.setItem(ADMIN_TOKEN_KEY, token);
      } else {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      }
    } catch (e) {
      console.warn('Could not store admin token', e);
    }
  },

  clearAdminToken() {
    try {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch (e) {
      console.warn('Could not remove admin token', e);
    }
  },

  async checkAdminAuth(): Promise<boolean> {
    const token = this.getAdminToken();
    if (!token) return false;
    try {
      const res = await fetch('/api/auth/check', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        this.clearAdminToken();
        return false;
      }
      const data = await res.json();
      if (!data.valid) {
        this.clearAdminToken();
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  async loginAdmin(password: string, remember: boolean = true): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        this.setAdminToken(data.token, remember);
        return { success: true };
      }
      return { success: false, error: data.error || 'رمز عبور نادرست است.' };
    } catch (err) {
      return { success: false, error: 'خطا در برقراری ارتباط با سرور' };
    }
  },

  async logoutAdmin(): Promise<void> {
    const token = this.getAdminToken();
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch {
        // ignore error on logout
      }
    }
    this.clearAdminToken();
  },

  async changeAdminPassword(
    oldPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const token = this.getAdminToken();
    if (!token) return { success: false, error: 'احراز هویت انجام نشده است.' };
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.token) {
          const isLocal = !!localStorage.getItem(ADMIN_TOKEN_KEY);
          this.setAdminToken(data.token, isLocal);
        }
        return { success: true, message: data.message };
      }
      return { success: false, error: data.error || data.message || 'خطا در تغییر رمز عبور' };
    } catch {
      return { success: false, error: 'خطا در اتصال به سرور' };
    }
  },

  // Profiles CRUD
  /** Full list for the admin panel (requires a valid admin token). Falls back to the admin's local cache when offline. */
  async getProfiles(): Promise<EmployeeProfile[]> {
    const token = this.getAdminToken();
    if (!token) return [];
    try {
      const res = await fetch('/api/profiles', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.profiles)) {
          updateCachedProfiles(data.profiles);
          return data.profiles;
        }
      }
    } catch (err) {
      console.warn('API fetch failed, falling back to cache:', err);
    }
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
   * Public single card. Returns 'not-found' only when the server says so; on a
   * network error the last copy of this card seen on this device is used.
   */
  async getProfile(id: string): Promise<EmployeeProfile | null | 'not-found'> {
    const cacheKey = `${CARD_CACHE_PREFIX}${String(id).toLowerCase()}`;
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(id)}`);
      if (res.status === 404) {
        try {
          localStorage.removeItem(cacheKey);
        } catch {}
        return 'not-found';
      }
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.profile) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify(data.profile));
          } catch {}
          return data.profile;
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch profile ${id}:`, err);
    }
    try {
      const cached = localStorage.getItem(cacheKey);
      return cached ? (JSON.parse(cached) as EmployeeProfile) : null;
    } catch {
      return null;
    }
  },

  async createProfile(profile: EmployeeProfile): Promise<{ success: boolean; profile?: EmployeeProfile; error?: string }> {
    const token = this.getAdminToken();
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, profile: data.profile };
      }
      return { success: false, error: data.error || 'خطا در ایجاد پروفایل' };
    } catch (err) {
      return { success: false, error: 'خطا در برقراری ارتباط با سرور دیتابیس' };
    }
  },

  async updateProfile(profile: EmployeeProfile): Promise<{ success: boolean; profile?: EmployeeProfile; error?: string }> {
    const token = this.getAdminToken();
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(profile.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, profile: data.profile };
      }
      return { success: false, error: data.error || 'خطا در به‌روزرسانی پروفایل' };
    } catch (err) {
      return { success: false, error: 'خطا در برقراری ارتباط با سرور دیتابیس' };
    }
  },

  async updateBrandForAll(brandUpdates: {
    company?: string;
    website?: string;
    websiteUrl?: string;
    catalogUrl?: string;
    catalogPdfUrl?: string;
    layoutDirection?: 'rtl' | 'ltr';
    instagram?: string;
    instagramUrl?: string;
  }): Promise<{ success: boolean; profiles?: EmployeeProfile[]; message?: string; error?: string }> {
    const token = this.getAdminToken();
    try {
      const res = await fetch('/api/profiles/bulk-brand', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(brandUpdates),
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.profiles)) {
        updateCachedProfiles(data.profiles);
        return { success: true, profiles: data.profiles, message: data.message };
      }
      return { success: false, error: data.error || 'خطا در بروزرسانی گروهی اطلاعات برند' };
    } catch {
      return { success: false, error: 'خطا در برقراری ارتباط با سرور دیتابیس' };
    }
  },

  async deleteProfile(id: string): Promise<{ success: boolean; error?: string }> {
    const token = this.getAdminToken();
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true };
      }
      return { success: false, error: data.error || 'خطا در حذف پروفایل' };
    } catch (err) {
      return { success: false, error: 'خطا در برقراری ارتباط با سرور دیتابیس' };
    }
  },

  async resetProfiles(): Promise<{ success: boolean; profiles?: EmployeeProfile[]; error?: string }> {
    const token = this.getAdminToken();
    try {
      const res = await fetch('/api/profiles/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (Array.isArray(data.profiles)) {
          updateCachedProfiles(data.profiles);
        }
        return { success: true, profiles: data.profiles };
      }
      return { success: false, error: data.error || 'خطا در بازنشانی پایگاه داده' };
    } catch (err) {
      return { success: false, error: 'خطا در اتصال به سرور' };
    }
  },

  // Export DB Backup URL
  getBackupDownloadUrl(): string {
    return '/api/backup';
  },

  // Authenticated Backup Download (Fixes 401 Unauthorized on direct navigation)
  async downloadBackup(): Promise<{ success: boolean; error?: string }> {
    const token = this.getAdminToken();
    if (!token) {
      return { success: false, error: 'لطفاً ابتدا وارد پنل مدیریت شوید.' };
    }
    try {
      const res = await fetch('/api/backup', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
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

  async restoreBackup(backupData: any): Promise<{ success: boolean; profiles?: EmployeeProfile[]; error?: string }> {
    const token = this.getAdminToken();
    try {
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(backupData),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.token) {
          const isLocal = !!localStorage.getItem(ADMIN_TOKEN_KEY);
          this.setAdminToken(data.token, isLocal);
        }
        if (Array.isArray(data.profiles)) {
          updateCachedProfiles(data.profiles);
        }
        return { success: true, profiles: data.profiles };
      }
      return { success: false, error: data.error || 'خطا در بازگردانی پشتیبان' };
    } catch {
      return { success: false, error: 'خطا در اتصال به سرور' };
    }
  },

  // Analytics Tracking
  async trackAnalyticsEvent(profileIdOrSlug: string, event: AnalyticsEventName): Promise<{ success: boolean }> {
    try {
      const res = await fetch(`/api/analytics/${encodeURIComponent(profileIdOrSlug)}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
        keepalive: true, // still delivered when the tap opens another app (tel:, WhatsApp, ...)
      });
      return { success: res.ok };
    } catch {
      return { success: false };
    }
  },

  async getAnalyticsSummary(): Promise<{ success: boolean; summary?: any; error?: string }> {
    const token = this.getAdminToken();
    if (!token) return { success: false, error: 'احراز هویت انجام نشده است.' };
    try {
      const res = await fetch('/api/analytics/summary', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        return await res.json();
      }
      return { success: false, error: 'خطا در دریافت آمار' };
    } catch {
      return { success: false, error: 'خطا در ارتباط با سرور' };
    }
  },

  // Customer Leads (Two-way Contact Exchange)
  async submitLead(payload: {
    profileId: string;
    customerName: string;
    customerMobile: string;
    customerCompany?: string;
    note?: string;
    /** Honeypot: must stay empty. */
    website?: string;
  }): Promise<{ success: boolean; lead?: Pick<CustomerLead, 'id' | 'createdAt'>; message?: string; error?: string }> {
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, lead: data.lead, message: data.message };
      }
      return { success: false, error: data.error || 'خطا در ثبت اطلاعات تماس' };
    } catch {
      return { success: false, error: 'خطا در برقراری ارتباط با سرور' };
    }
  },

  async getLeads(): Promise<{ success: boolean; leads?: CustomerLead[]; error?: string }> {
    const token = this.getAdminToken();
    if (!token) return { success: false, error: 'احراز هویت انجام نشده است.' };
    try {
      const res = await fetch('/api/leads', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, leads: data.leads || [] };
      }
      return { success: false, error: data.error || 'خطا در دریافت لیست مشتریان' };
    } catch {
      return { success: false, error: 'خطا در ارتباط با سرور' };
    }
  },

  async deleteLead(id: string): Promise<{ success: boolean; error?: string }> {
    const token = this.getAdminToken();
    if (!token) return { success: false, error: 'احراز هویت انجام نشده است.' };
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true };
      }
      return { success: false, error: data.error || 'خطا در حذف رکورد مشتری' };
    } catch {
      return { success: false, error: 'خطا در ارتباط با سرور' };
    }
  },

  // Upload Avatar or Logo Image to Server
  async uploadImage(
    fileData: string,
    type: 'avatar' | 'logo',
    profileId?: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    const token = this.getAdminToken();
    try {
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ fileData, type, profileId }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.url) {
        return { success: true, url: data.url };
      }
      return { success: false, error: data.error || 'خطا در آپلود تصویر' };
    } catch {
      return { success: true, url: fileData };
    }
  },

  // Upload PDF Catalog to Server
  async uploadPdf(
    fileData: string,
    fileName: string,
    replaceDefault: boolean = false
  ): Promise<{ success: boolean; url?: string; fileName?: string; size?: number; error?: string }> {
    const token = this.getAdminToken();
    try {
      const res = await fetch('/api/upload-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fileData,
          fileName,
          replaceDefault,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        return {
          success: true,
          url: data.url,
          fileName: data.fileName,
          size: data.size,
        };
      }
      return { success: false, error: data.error || 'خطا در آپلود فایل PDF' };
    } catch (err: any) {
      console.error('Upload PDF failed:', err);
      // Fallback: return data url as usable local URL
      return {
        success: true,
        url: fileData,
        fileName: fileName,
      };
    }
  },
};
