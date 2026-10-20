import { EmployeeProfile } from '../types';
import { INITIAL_PROFILES } from '../data/defaultProfiles';

const ADMIN_TOKEN_KEY = 'roya_admin_token';
const PROFILES_CACHE_KEY = 'roya_employee_profiles';

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

  async changeAdminPassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; message?: string; error?: string }> {
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
        return { success: true, message: data.message };
      }
      return { success: false, error: data.error || data.message || 'خطا در تغییر رمز عبور' };
    } catch {
      return { success: false, error: 'خطا در اتصال به سرور' };
    }
  },

  // Profiles CRUD
  async getProfiles(): Promise<EmployeeProfile[]> {
    try {
      const res = await fetch('/api/profiles');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.profiles) && data.profiles.length > 0) {
          try {
            localStorage.setItem(PROFILES_CACHE_KEY, JSON.stringify(data.profiles));
          } catch {}
          return data.profiles;
        }
      }
    } catch (err) {
      console.warn('API fetch failed, falling back to cache/defaults:', err);
    }

    // Fallback to cache or default profiles
    try {
      const cached = localStorage.getItem(PROFILES_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}

    return INITIAL_PROFILES;
  },

  async getProfile(id: string): Promise<EmployeeProfile | null> {
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.profile) return data.profile;
      }
    } catch (err) {
      console.warn(`Failed to fetch profile ${id}:`, err);
    }
    const all = await this.getProfiles();
    return all.find((p) => p.id === id) || null;
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

  async restoreBackup(backupData: any): Promise<{ success: boolean; error?: string }> {
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
        return { success: true };
      }
      return { success: false, error: data.error || 'خطا در بازگردانی پشتیبان' };
    } catch {
      return { success: false, error: 'خطا در اتصال به سرور' };
    }
  },

  // Analytics Tracking
  async trackAnalyticsEvent(
    profileIdOrSlug: string,
    event: 'view' | 'nfcTap' | 'qrScan' | 'call' | 'whatsapp' | 'catalogDownload' | 'vcardDownload' | 'mapClick'
  ): Promise<{ success: boolean; analytics?: any }> {
    try {
      const res = await fetch(`/api/analytics/${encodeURIComponent(profileIdOrSlug)}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
      });
      if (res.ok) {
        return await res.json();
      }
      return { success: false };
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
