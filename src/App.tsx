/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, lazy } from 'react';
import { 
  Radio, 
  Share2, 
  Edit3, 
  MapPin, 
  Phone, 
  Download, 
  Smartphone, 
  Layers, 
  Sparkles, 
  Check, 
  ExternalLink, 
  Info,
  UserCheck,
  Plus,
  ShieldCheck,
  Building,
  Users,
  LayoutDashboard,
  QrCode,
  ArrowRight,
  Database,
  Lock,
  Unlock,
  AlertCircle,
  User
} from 'lucide-react';
import { EmployeeProfile, ViewMode } from './types';
import { api } from './services/api';
import { DigitalCard } from './components/DigitalCard';
import { RoyaLogo } from './components/RoyaLogo';
import { NavigationModal } from './components/NavigationModal';
import { ShareModal } from './components/ShareModal';
import { NfcModal } from './components/NfcModal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { parseCurrentRoute, getDirectCardUrl } from './utils/url';

// Admin-only screens are split into separate chunks so visitors opening a card do not download them.
const HeaderControls = lazy(() => import('./components/HeaderControls').then((m) => ({ default: m.HeaderControls })));
const EditProfileModal = lazy(() => import('./components/EditProfileModal').then((m) => ({ default: m.EditProfileModal })));
const NewProfileModal = lazy(() => import('./components/NewProfileModal').then((m) => ({ default: m.NewProfileModal })));
const LocationSettingsModal = lazy(() => import('./components/LocationSettingsModal').then((m) => ({ default: m.LocationSettingsModal })));
const ProfilePhotoUploader = lazy(() => import('./components/ProfilePhotoUploader').then((m) => ({ default: m.ProfilePhotoUploader })));
const ServerDeployModal = lazy(() => import('./components/ServerDeployModal').then((m) => ({ default: m.ServerDeployModal })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));

// Admins keep a local copy of the staff list for instant start-up and offline use.
// Visitors never receive the full list; they only load the one card they opened.
const getInitialProfiles = (): EmployeeProfile[] => (api.getAdminToken() ? api.getCachedProfiles() : []);

// Helper to find profile by ID, slug, or transliterated English name (same priority as the server)
const findProfileMatch = (list: EmployeeProfile[], identifier: string | null): EmployeeProfile | undefined => {
  if (!identifier) return undefined;
  const clean = identifier.trim().toLowerCase();
  return (
    list.find((p) => p.id.toLowerCase() === clean) ||
    list.find((p) => !!p.slug && p.slug.toLowerCase() === clean) ||
    list.find((p) => !!p.nameEn && p.nameEn.trim().toLowerCase().replace(/\s+/g, '-') === clean)
  );
};

export default function App() {
  const initialProfiles = getInitialProfiles();
  const initialRoute = parseCurrentRoute(initialProfiles);
  const matchedInitial = findProfileMatch(initialProfiles, initialRoute.targetProfileId);

  const [profiles, setProfiles] = useState<EmployeeProfile[]>(initialProfiles);
  const [currentProfileId, setCurrentProfileId] = useState<string>(() => {
    if (matchedInitial) return matchedInitial.id;
    if (initialRoute.targetProfileId) return initialRoute.targetProfileId;
    return initialProfiles[0]?.id || '';
  });
  const [viewMode, setViewMode] = useState<ViewMode>('mobile-mockup');
  const [isStandaloneView, setIsStandaloneView] = useState<boolean>(() => initialRoute.isStandalone);
  
  // Full loading flag: true while initial load is happening if we don't have valid cached profiles
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(() => !matchedInitial);
  const [cardNotFound, setCardNotFound] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminWorkspaceActive, setAdminWorkspaceActive] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Modals state
  const [isNavModalOpen, setIsNavModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isNfcModalOpen, setIsNfcModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isNewProfileModalOpen, setIsNewProfileModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);

  // Helper to show brief toast notification
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Switch to standalone card view
  const handleSwitchToStandalone = (profile?: EmployeeProfile) => {
    const p = profile || currentProfile;
    setIsStandaloneView(true);
    if (typeof window !== 'undefined' && window.history?.pushState) {
      window.history.pushState({ profileId: p.id }, '', `/${p.slug || p.id}`);
    }
  };

  // Switch back to workspace
  const handleSwitchToWorkspace = () => {
    setIsStandaloneView(false);
    if (typeof window !== 'undefined' && window.history?.pushState) {
      window.history.pushState({}, '', '/');
    }
  };

  // Loads the full staff list for the admin panel.
  const loadAdminProfiles = async (): Promise<EmployeeProfile[]> => {
    const list = await api.getProfiles();
    setProfiles((prev) => {
      // Keep a card that was opened directly but is missing from an offline cache.
      const extra = prev.filter((p) => !list.some((x) => x.id === p.id));
      return list.length > 0 ? list : extra;
    });
    return list;
  };

  const handleAdminLoggedIn = async () => {
    setIsAdmin(true);
    const list = await loadAdminProfiles();
    setCurrentProfileId((prev) => (list.some((p) => p.id === prev) ? prev : list[0]?.id || prev));
  };

  const handleAdminLogout = async () => {
    await api.logoutAdmin();
    api.clearCachedProfiles();
    setIsAdmin(false);
    if (!isStandaloneView) {
      setProfiles([]);
    } else {
      setProfiles((prev) => prev.filter((p) => p.id === currentProfileId).map(({ analytics, ...rest }) => rest as EmployeeProfile));
    }
  };

  // Initial load: admin check first, then either the full list (admin) or just the requested card (visitor).
  useEffect(() => {
    let isMounted = true;
    const targetId = initialRoute.targetProfileId;

    async function loadInitialData() {
      let isAuth = false;
      try {
        isAuth = await api.checkAdminAuth();
      } catch {
        isAuth = false;
      }
      if (!isMounted) return;
      setIsAdmin(isAuth);

      let list: EmployeeProfile[] = [];
      if (isAuth) {
        list = await loadAdminProfiles();
        if (!isMounted) return;
      } else {
        api.clearCachedProfiles();
      }

      if (targetId) {
        const matched = findProfileMatch(list, targetId);
        if (matched) {
          setCurrentProfileId(matched.id);
          setCardNotFound(false);
        } else {
          const single = await api.getProfile(targetId);
          if (!isMounted) return;
          if (single && single !== 'not-found') {
            setProfiles((prev) => [single, ...prev.filter((p) => p.id !== single.id)]);
            setCurrentProfileId(single.id);
            setCardNotFound(false);
          } else {
            setCardNotFound(true);
          }
        }
      } else if (list.length > 0) {
        setCurrentProfileId((prevId) => (list.some((p) => p.id === prevId) ? prevId : list[0].id));
      }

      setIsInitialLoading(false);
      if (initialRoute.isAdminMode && !isAuth) setIsAdminModalOpen(true);
    }

    loadInitialData();

    // Listen to browser Back/Forward navigation
    const handlePopState = () => {
      setProfiles((currentList) => {
        const route = parseCurrentRoute(currentList);
        if (route.targetProfileId) {
          const matched = findProfileMatch(currentList, route.targetProfileId);
          if (matched) {
            setCurrentProfileId(matched.id);
            setCardNotFound(false);
          } else {
            const wanted = route.targetProfileId;
            api.getProfile(wanted).then((single) => {
              if (single && single !== 'not-found') {
                setProfiles((prev) => [single, ...prev.filter((p) => p.id !== single.id)]);
                setCurrentProfileId(single.id);
                setCardNotFound(false);
              } else {
                setCardNotFound(true);
              }
            });
          }
        } else {
          setCardNotFound(false);
          if (currentList.length > 0) {
            setCurrentProfileId((prev) => currentList.some((p) => p.id === prev) ? prev : currentList[0].id);
          }
        }
        setIsStandaloneView(route.isStandalone);
        return currentList;
      });
    };

    const handleAnalyticsUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{
        profileId: string;
        analytics: EmployeeProfile['analytics'];
      }>;
      if (!customEvent.detail?.profileId || !customEvent.detail?.analytics) return;
      const { profileId, analytics } = customEvent.detail;
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === profileId || p.slug === profileId ? { ...p, analytics } : p
        )
      );
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('roya:analytics-updated', handleAnalyticsUpdated);
    return () => {
      isMounted = false;
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('roya:analytics-updated', handleAnalyticsUpdated);
    };
  }, []);

  const currentProfile = profiles.find((p) => p.id === currentProfileId) || profiles[0];

  // Dynamically update document title to current employee's name
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (currentProfile && !isInitialLoading && !cardNotFound) {
        document.title = `${currentProfile.name} | کارت ویزیت هوشمند رویا طرح داخلی`;
      } else if (isInitialLoading) {
        document.title = 'در حال بارگذاری کارت ویزیت... | رویا';
      } else {
        document.title = 'کارت ویزیت هوشمند دیجیتال رویا طرح داخلی';
      }
    }
  }, [currentProfile?.name, isInitialLoading, cardNotFound]);

  // Update profile handler (persists to server API)
  const handleUpdateProfile = async (updated: EmployeeProfile) => {
    if (!isAdmin) {
      setIsAdminModalOpen(true);
      showToast('دسترسی فقط برای مدیر مجاز است. لطفاً ابتدا وارد پنل مدیریت شوید.');
      return;
    }

    // Save first, then update the UI with what the server actually stored.
    const res = await api.updateProfile(updated);
    if (res.success && res.profile) {
      setProfiles((prev) => {
        const next = prev.map((p) => (p.id === res.profile!.id ? res.profile! : p));
        try {
          localStorage.setItem('roya_employee_profiles', JSON.stringify(next));
        } catch {}
        return next;
      });
      showToast('تغییرات با موفقیت در پایگاه داده سرور ذخیره شد.');
      return true;
    }
    showToast(res.error || 'خطا در ذخیره در سرور. تغییرات ذخیره نشد.');
    return false;
  };

  // Update GPS location handler
  const handleUpdateLocation = async (updatedLocation: EmployeeProfile['mapLocation'], newAddress?: string) => {
    if (!isAdmin) {
      setIsAdminModalOpen(true);
      showToast('تنظیم موقعیت مکانی نیاز به ورود مدیر دارد.');
      return;
    }

    const updated: EmployeeProfile = {
      ...currentProfile,
      mapLocation: updatedLocation,
      ...(newAddress ? { address: newAddress } : {}),
    };
    await handleUpdateProfile(updated);
  };

  // Add new profile handler
  const handleAddNewProfile = async (newProfile: EmployeeProfile) => {
    if (!isAdmin) {
      setIsAdminModalOpen(true);
      showToast('ایجاد کارمند جدید فقط توسط مدیر سامانه امکان‌پذیر است.');
      return;
    }

    const res = await api.createProfile(newProfile);
    if (res.success && res.profile) {
      const saved = res.profile;
      setProfiles((prev) => {
        const next = [saved, ...prev.filter((p) => p.id !== saved.id)];
        try {
          localStorage.setItem('roya_employee_profiles', JSON.stringify(next));
        } catch {}
        return next;
      });
      setCurrentProfileId(saved.id);
      showToast('کارمند جدید با موفقیت به پایگاه داده سرور اضافه شد.');
      return true;
    }
    showToast(res.error || 'خطا در ذخیره کارمند جدید روی سرور');
    return false;
  };

  // Delete profile handler
  const handleDeleteProfile = async (id: string) => {
    if (!isAdmin) {
      setIsAdminModalOpen(true);
      showToast('حذف پروفایل فقط توسط مدیر مجاز است.');
      return;
    }

    if (profiles.length <= 1) {
      showToast('حداقل یک پروفایل باید در سامانه وجود داشته باشد.');
      return;
    }

    const res = await api.deleteProfile(id);
    if (res.success) {
      const nextProfile = profiles.find((p) => p.id !== id) || profiles[0];
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      setCurrentProfileId(nextProfile.id);
      showToast('پروفایل با موفقیت از پایگاه داده سرور حذف گردید.');
    } else {
      showToast(res.error || 'خطا در حذف از سرور');
    }
  };

  // Reset database handler
  const handleResetToDefault = async () => {
    if (!isAdmin) {
      setIsAdminModalOpen(true);
      showToast('بازنشانی پایگاه داده نیاز به دسترسی ادمین دارد.');
      return;
    }

    const res = await api.resetProfiles();
    if (res.success && res.profiles) {
      setProfiles(res.profiles);
      setCurrentProfileId(res.profiles[0].id);
      showToast('پایگاه داده به تنظیمات اولیه رویا بازنشانی شد.');
    } else {
      showToast(res.error || 'خطا در بازنشانی پایگاه داده');
    }
    setIsEditModalOpen(false);
  };

  // Standalone / Customer Public View (for QR codes and NFC scans)
  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-4 selection:bg-red-600 selection:text-white font-sans">
        <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mb-5 relative shadow-xs">
          <div className="absolute inset-0 rounded-full border-2 border-red-600/30 border-t-red-600 animate-spin" />
          <Sparkles className="w-6 h-6 text-red-600 animate-pulse" />
        </div>
        <div className="mb-2">
          <RoyaLogo size="md" />
        </div>
        <h3 className="text-sm font-bold text-stone-800 mt-4 mb-1">
          در حال فراخوانی کارت ویزیت هوشمند...
        </h3>
        <p className="text-xs text-stone-500 font-sans">
          شرکت رویا طرح داخلی
        </p>
        <div className="w-full max-w-[220px] mt-6 space-y-2">
          <div className="h-2 bg-stone-200/60 rounded-full w-3/4 mx-auto animate-pulse" />
          <div className="h-2 bg-stone-200/60 rounded-full w-1/2 mx-auto animate-pulse" />
        </div>
      </div>
    );
  }

  if (isStandaloneView) {
    return (
      <div className="min-h-screen bg-stone-100/90 text-stone-900 flex flex-col items-center justify-center p-3 sm:p-6 selection:bg-red-600 selection:text-white font-sans">
        
        {/* Floating Toast Notification */}
        {toastMessage && (
          <div className="fixed top-5 z-50 px-4 py-2 bg-slate-900/90 text-amber-300 text-xs rounded-full shadow-lg border border-amber-500/30 flex items-center gap-2 animate-in fade-in duration-200">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Admin Bar to easily return to Workspace */}
        {isAdmin && (
          <div className="w-full max-w-[440px] mb-3 p-2.5 bg-slate-900/95 text-slate-200 border border-slate-700/90 rounded-2xl shadow-lg flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-white">نمای زنده مشتری ({currentProfile?.name || 'مدیریت'})</span>
            </div>
            <button
              onClick={handleSwitchToWorkspace}
              className="py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>بازگشت به میز مدیریت</span>
            </button>
          </div>
        )}

        {/* Main Content: Not Found OR DigitalCard */}
        {cardNotFound || !currentProfile ? (
          <main className="w-full max-w-[440px] my-auto bg-white rounded-3xl shadow-xl border border-stone-200/80 p-8 flex flex-col items-center justify-center min-h-[420px] text-center animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-5 text-amber-600">
              <User className="w-8 h-8 opacity-60" />
            </div>
            <div className="mb-3">
              <RoyaLogo size="sm" />
            </div>
            <h3 className="text-lg font-bold text-stone-900 mt-2 mb-2">
              کارت ویزیت مورد نظر یافت نشد
            </h3>
            <p className="text-xs text-stone-500 max-w-[280px] leading-relaxed mb-6">
              متأسفانه کارمند یا کارت ویزیت درخواست شده در سامانه وجود ندارد یا هنوز ثبت نگردیده است.
            </p>
            <button
              onClick={() => {
                setCardNotFound(false);
                handleSwitchToWorkspace();
              }}
              className="py-2.5 px-6 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-2xl transition-colors cursor-pointer shadow-sm"
            >
              {isAdmin ? 'بازگشت به میز مدیریت' : 'صفحه اصلی'}
            </button>
          </main>
        ) : (
          <main className="w-full max-w-[440px] my-auto animate-in fade-in duration-300">
            <DigitalCard
              profile={currentProfile}
              onOpenNavigation={() => setIsNavModalOpen(true)}
              onOpenShare={() => setIsShareModalOpen(true)}
              onOpenNfc={() => setIsNfcModalOpen(true)}
              isStandalone={true}
              isAdmin={isAdmin}
            />
          </main>
        )}

        {/* Modals for Standalone View */}
        <NavigationModal
          isOpen={isNavModalOpen}
          onClose={() => setIsNavModalOpen(false)}
          profile={currentProfile}
          onOpenLocationSettings={isAdmin ? () => setIsLocationModalOpen(true) : undefined}
        />

        <LocationSettingsModal
          isOpen={isLocationModalOpen}
          onClose={() => setIsLocationModalOpen(false)}
          profile={currentProfile}
          onSaveLocation={handleUpdateLocation}
        />

        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          profile={currentProfile}
        />

        <NfcModal
          isOpen={isNfcModalOpen}
          onClose={() => setIsNfcModalOpen(false)}
          profile={currentProfile}
          allProfiles={profiles}
        />

        <AdminLoginModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          isAdmin={isAdmin}
          onAuthSuccess={() => {
            void handleAdminLoggedIn();
            showToast('با موفقیت به عنوان مدیر وارد شدید.');
          }}
          onLogout={() => {
            void handleAdminLogout();
            showToast('از پنل مدیریت خارج شدید.');
          }}
          onOpenDeployModal={() => setIsDeployModalOpen(true)}
        />

        {isAdmin && (
          <ServerDeployModal
            isOpen={isDeployModalOpen}
            onClose={() => setIsDeployModalOpen(false)}
          />
        )}
      </div>
    );
  }

  // Public home page: visitors only see the brand; the staff list is for the admin.
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-4 font-sans text-stone-900">
        <main className="w-full max-w-[420px] bg-white rounded-3xl shadow-xl border border-stone-200/80 p-8 flex flex-col items-center justify-center min-h-[380px] text-center">
          <div className="mb-4">
            <RoyaLogo size="md" />
          </div>
          <h1 className="text-base font-bold text-stone-900 mt-2 mb-2">کارت ویزیت دیجیتال رویا طرح داخلی</h1>
          <p className="text-sm text-stone-600 max-w-[300px] leading-relaxed mb-6">
            برای دیدن کارت هر کارشناس، کد QR یا کارت NFC او را اسکن کنید یا لینکی را که برایتان فرستاده باز کنید.
          </p>
          <a
            href="https://www.royaco.com"
            className="py-3 px-6 bg-[#D0192A] hover:bg-[#B51221] text-white text-sm font-bold rounded-2xl transition-colors shadow-sm"
          >
            ورود به وب‌سایت رویا
          </a>
          <button
            type="button"
            onClick={() => setIsAdminModalOpen(true)}
            className="mt-6 text-xs text-stone-500 hover:text-stone-800 underline underline-offset-4 flex items-center gap-1.5 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>ورود مدیر سامانه</span>
          </button>
        </main>

        <AdminLoginModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          isAdmin={isAdmin}
          onAuthSuccess={() => {
            void handleAdminLoggedIn();
            showToast('با موفقیت به عنوان مدیر وارد شدید.');
          }}
          onLogout={() => {
            void handleAdminLogout();
          }}
        />
      </div>
    );
  }

  // If no profiles exist in the system yet, show empty state
  if (!currentProfile) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-4 font-sans text-stone-900">
        <div className="w-full max-w-[420px] bg-white rounded-3xl shadow-xl border border-stone-200/80 p-8 flex flex-col items-center justify-center min-h-[380px] text-center animate-in fade-in duration-300">
          <div className="mb-4">
            <RoyaLogo size="md" />
          </div>
          <h3 className="text-base font-bold text-stone-900 mt-2 mb-2">
            سامانه کارت ویزیت دیجیتال رویا طرح داخلی
          </h3>
          <p className="text-xs text-stone-500 max-w-[280px] leading-relaxed mb-6">
            در حال حاضر کارمندی در سامانه تعریف نشده است. جهت ثبت کارت ویزیت پرسنل، وارد پنل مدیریت شوید.
          </p>
          <button
            onClick={() => setIsAdminModalOpen(true)}
            className="py-2.5 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-2xl transition-colors cursor-pointer shadow-sm flex items-center gap-2"
          >
            <Lock className="w-4 h-4" />
            <span>ورود مدیر و افزودن کارمند</span>
          </button>
        </div>

        <AdminLoginModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          isAdmin={isAdmin}
          onAuthSuccess={() => {
            void handleAdminLoggedIn();
            setIsNewProfileModalOpen(true);
            showToast('با موفقیت به عنوان مدیر وارد شدید.');
          }}
          onLogout={() => {
            void handleAdminLogout();
          }}
        />

        {isAdmin && (
          <NewProfileModal
            isOpen={isNewProfileModalOpen}
            onClose={() => setIsNewProfileModalOpen(false)}
            onAddProfile={handleAddNewProfile}
            onSave={handleAddNewProfile}
          />
        )}
      </div>
    );
  }

  // Full Admin & Sales Team Management Dashboard
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950 font-sans">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-slate-900/95 text-amber-300 text-xs font-medium rounded-2xl shadow-xl border border-amber-500/40 flex items-center gap-2 animate-in fade-in duration-200">
          <Database className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Controls Header for Sales Team / Admin */}
      <HeaderControls
        profiles={profiles}
        currentProfile={currentProfile}
        onSelectProfile={(p) => setCurrentProfileId(p.id)}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        onOpenEditModal={() => {
          if (isAdmin) {
            setIsEditModalOpen(true);
          } else {
            setIsAdminModalOpen(true);
            showToast('برای ویرایش کارت، لطفاً ابتدا وارد پنل مدیریت شوید.');
          }
        }}
        onOpenNfcModal={() => setIsNfcModalOpen(true)}
        onOpenShareModal={() => setIsShareModalOpen(true)}
        onOpenNewProfileModal={() => {
          if (isAdmin) {
            setIsNewProfileModalOpen(true);
          } else {
            setIsAdminModalOpen(true);
            showToast('برای افزودن کارمند جدید، لطفاً ابتدا وارد پنل مدیریت شوید.');
          }
        }}
        onOpenLocationModal={() => {
          if (isAdmin) {
            setIsLocationModalOpen(true);
          } else {
            setIsAdminModalOpen(true);
            showToast('برای تنظیم لوکیشن، لطفاً ابتدا وارد پنل مدیریت شوید.');
          }
        }}
        isAdmin={isAdmin}
        onOpenAdminModal={() => setIsAdminModalOpen(true)}
        onOpenDeployModal={() => setIsDeployModalOpen(true)}
        onSwitchToStandalone={() => handleSwitchToStandalone(currentProfile)}
        adminWorkspaceActive={adminWorkspaceActive}
        onToggleAdminWorkspace={setAdminWorkspaceActive}
      />

      {/* Main Workspace Layout with responsive Master-Detail split */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6 gap-6 items-start">
        
        {isAdmin && adminWorkspaceActive ? (
          /* ADMIN MASTER DASHBOARD WORKSPACE (DESKTOP OPTIMIZED) */
          <>
            {/* Left: Comprehensive Admin Management Center */}
            <div className="flex-1 w-full min-w-0">
              <AdminDashboard
                profiles={profiles}
                currentProfile={currentProfile}
                onSelectProfile={(p) => setCurrentProfileId(p.id)}
                onOpenEditModal={() => setIsEditModalOpen(true)}
                onOpenNewProfileModal={() => setIsNewProfileModalOpen(true)}
                onOpenLocationModal={() => setIsLocationModalOpen(true)}
                onOpenShareModal={() => setIsShareModalOpen(true)}
                onOpenNfcModal={() => setIsNfcModalOpen(true)}
                onOpenDeployModal={() => setIsDeployModalOpen(true)}
                onUpdateProfile={handleUpdateProfile}
                onReplaceAllProfiles={(updatedList) => {
                  setProfiles(updatedList);
                  if (updatedList.length > 0 && !updatedList.some((p) => p.id === currentProfileId)) {
                    setCurrentProfileId(updatedList[0].id);
                  }
                }}
                onDeleteProfile={handleDeleteProfile}
                onResetToDefault={handleResetToDefault}
                onLogout={() => {
                  void handleAdminLogout();
                  showToast('از پنل مدیریت خارج شدید.');
                }}
                showToast={showToast}
                onSwitchToVisitorView={() => handleSwitchToStandalone(currentProfile)}
              />
            </div>

            {/* Right: Live Interactive Mobile Card Preview */}
            <div className="w-full lg:w-[410px] shrink-0 sticky top-20 flex flex-col items-center">
              <div className="w-full mb-2 flex items-center justify-between px-2 text-xs text-slate-400">
                <span className="font-bold text-slate-300 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                  پیش‌نمایش زنده کارت
                </span>
                <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                  Live Preview
                </span>
              </div>

              {/* Ambient phone frame */}
              <div className="w-full bg-slate-900 rounded-[44px] p-3 sm:p-3.5 shadow-2xl ring-1 ring-slate-700/60 border-4 border-slate-800">
                {/* Dynamic Island bar */}
                <div className="flex justify-center mb-2">
                  <div className="w-24 h-3.5 bg-slate-950 rounded-full flex items-center justify-center gap-1.5 border border-slate-800">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                    <div className="w-2.5 h-1 bg-slate-800 rounded-full" />
                  </div>
                </div>

                {/* Card Screen */}
                <div className="bg-white rounded-[32px] overflow-hidden max-h-[75vh] overflow-y-auto scrollbar-thin">
                  <DigitalCard
                    profile={currentProfile}
                    onOpenNavigation={() => setIsNavModalOpen(true)}
                    onOpenShare={() => setIsShareModalOpen(true)}
                    onOpenNfc={() => setIsNfcModalOpen(true)}
                    onUpdateAvatar={(url) => handleUpdateProfile({ ...currentProfile, avatarUrl: url })}
                    onUpdateLogo={(url) => handleUpdateProfile({ ...currentProfile, logoUrl: url })}
                    isAdmin={isAdmin}
                  />
                </div>

                {/* Bottom Home Indicator */}
                <div className="flex justify-center pt-2.5 pb-0.5">
                  <div className="w-28 h-1 bg-slate-700 rounded-full" />
                </div>
              </div>
            </div>
          </>
        ) : (
          /* STANDARD / VISITOR TEAM VIEW */
          <>
            {/* Left / Secondary Control & Team Panel (Desktop Only) */}
            <aside className="hidden lg:flex flex-col w-80 bg-slate-900/90 backdrop-blur-md rounded-3xl p-5 border border-slate-800 shadow-xl self-start sticky top-20">
              
              {/* Admin Login Prompt Card for Visitors */}
              {!isAdmin && (
                <div className="mb-4 p-4 bg-slate-800/80 border border-slate-700/80 rounded-2xl">
                  <div className="flex items-center gap-2 text-amber-400 mb-1.5 font-bold text-xs">
                    <Lock className="w-3.5 h-3.5" />
                    <span>پنل مدیریت و امنیت</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                    جهت ساخت کارمند جدید، تغییر لوگو، آپلود کاتالوگ یا ویرایش کارت‌ها، وارد پنل مدیریت شوید.
                  </p>
                  <button
                    onClick={() => setIsAdminModalOpen(true)}
                    className="w-full py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>ورود به پنل مدیریت</span>
                  </button>
                </div>
              )}

              {/* Dedicated Visual Logo, Avatar & PDF Catalog Upload Widget (Admin Only) */}
              {isAdmin && (
                <ProfilePhotoUploader
                  profile={currentProfile}
                  onUpdateAvatar={(url) => handleUpdateProfile({ ...currentProfile, avatarUrl: url })}
                  onRemoveAvatar={() => handleUpdateProfile({ ...currentProfile, avatarUrl: undefined })}
                  onUpdateLogo={(url) => handleUpdateProfile({ ...currentProfile, logoUrl: url })}
                  onUpdateCatalogPdf={(url) => handleUpdateProfile({ ...currentProfile, catalogPdfUrl: url })}
                  onOpenEditModal={() => setIsEditModalOpen(true)}
                />
              )}

              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-bold text-white">جدول کارشناسان فروش رویا</h2>
                </div>
                <span className="text-[11px] bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded-full border border-slate-700">
                  {profiles.length} نفر
                </span>
              </div>

              {/* Profile List / Table */}
              <div className="mt-3 space-y-2 max-h-[260px] overflow-y-auto pr-0.5">
                {profiles.map((p) => {
                  const isSelected = p.id === currentProfile.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setCurrentProfileId(p.id)}
                      className={`w-full text-right p-2.5 rounded-2xl transition-all flex items-center justify-between border ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/40 text-white shadow-xs'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <div className={`w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center text-xs font-bold shrink-0 ${
                          isSelected ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-700 text-slate-300'
                        }`}>
                          {p.avatarUrl ? (
                            <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            p.name.slice(0, 1)
                          )}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-xs font-bold truncate">{p.name}</span>
                          <span className="text-[10.5px] text-slate-400 truncate">{p.title}</span>
                        </div>
                      </div>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Add Employee CTA */}
              <button
                onClick={() => {
                  if (isAdmin) {
                    setIsNewProfileModalOpen(true);
                  } else {
                    setIsAdminModalOpen(true);
                    showToast('برای افزودن کارمند جدید، لطفاً ابتدا وارد پنل مدیریت شوید.');
                  }
                }}
                className="mt-3 w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {isAdmin ? <Plus className="w-4 h-4 text-amber-400" /> : <Lock className="w-3.5 h-3.5 text-amber-400/80" />}
                <span>{isAdmin ? 'افزودن کارمند جدید' : 'افزودن کارمند (ورود مدیر)'}</span>
              </button>

              {/* Direct Mobile Card Preview button */}
              <button
                onClick={() => setIsStandaloneView(true)}
                className="mt-2 w-full py-2.5 px-3 bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 text-red-400 hover:text-red-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>پیش‌نمایش کارت تکی (محتوای QR)</span>
              </button>

              {/* Database & Server Status Panel */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1.5">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-emerald-400" />
                    پایگاه داده:
                  </span>
                  <span className="font-mono text-emerald-400 font-semibold">Self-Hosted Server</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    وضعیت دسترسی:
                  </span>
                  <span className="font-semibold text-slate-300">
                    {isAdmin ? (
                      <span className="text-emerald-400">ادمین تایید شده</span>
                    ) : (
                      <span className="text-amber-400">حالت نمایشی (مهمان)</span>
                    )}
                  </span>
                </div>
              </div>
            </aside>

            {/* Center Stage: Phone / Card Presentation */}
            <main className="flex-1 flex flex-col items-center justify-center min-h-[680px]">
              {viewMode === 'mobile-mockup' ? (
                /* Mobile Device Mockup Frame */
                <div className="relative my-auto flex flex-col items-center animate-in fade-in duration-300">
                  {/* Ambient device wrapper */}
                  <div className="relative w-full max-w-[460px] bg-slate-900 rounded-[50px] p-3 sm:p-4 shadow-2xl ring-1 ring-slate-700/60 border-4 border-slate-800 slate-card-shadow">
                    {/* Top Speaker / Dynamic Island bar */}
                    <div className="flex justify-center mb-2.5">
                      <div className="w-28 h-4 bg-slate-950 rounded-full flex items-center justify-center gap-2 border border-slate-800">
                        <div className="w-2 h-2 rounded-full bg-slate-800" />
                        <div className="w-3 h-1 bg-slate-800 rounded-full" />
                      </div>
                    </div>

                    {/* Scrollable Screen Content */}
                    <div className="bg-white rounded-[38px] overflow-hidden max-h-[84vh] overflow-y-auto scrollbar-thin">
                      <DigitalCard
                        profile={currentProfile}
                        onOpenNavigation={() => setIsNavModalOpen(true)}
                        onOpenShare={() => setIsShareModalOpen(true)}
                        onOpenNfc={() => setIsNfcModalOpen(true)}
                        onUpdateAvatar={(url) => handleUpdateProfile({ ...currentProfile, avatarUrl: url })}
                        onUpdateLogo={(url) => handleUpdateProfile({ ...currentProfile, logoUrl: url })}
                        isAdmin={isAdmin}
                      />
                    </div>

                    {/* Bottom Home Indicator */}
                    <div className="flex justify-center pt-3 pb-1">
                      <div className="w-32 h-1 bg-slate-700 rounded-full" />
                    </div>
                  </div>

                  {/* Quick helper badges under mobile view */}
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5 bg-slate-900/90 px-3.5 py-1.5 rounded-full border border-slate-800 text-slate-300 shadow-sm">
                      <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                      پشتیبانی از تگ و کارت NFC
                    </span>
                    <span className="flex items-center gap-1.5 bg-slate-900/90 px-3.5 py-1.5 rounded-full border border-slate-800 text-slate-300 shadow-sm">
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      ذخیره مستقیم دفترچه تلفن (.vcf)
                    </span>
                  </div>
                </div>
              ) : (
                /* Standalone Card View (Direct Web View as Seen on Phone) */
                <div className="w-full max-w-lg mx-auto py-2 sm:py-6 animate-in fade-in duration-300">
                  <DigitalCard
                    profile={currentProfile}
                    onOpenNavigation={() => setIsNavModalOpen(true)}
                    onOpenShare={() => setIsShareModalOpen(true)}
                    onOpenNfc={() => setIsNfcModalOpen(true)}
                    onUpdateAvatar={(url) => handleUpdateProfile({ ...currentProfile, avatarUrl: url })}
                    onUpdateLogo={(url) => handleUpdateProfile({ ...currentProfile, logoUrl: url })}
                    isAdmin={isAdmin}
                  />
                </div>
              )}
            </main>
          </>
        )}
      </div>

      {/* Modals with matching Professional Polish theme */}
      <OfflineIndicator />

      <NavigationModal
        isOpen={isNavModalOpen}
        onClose={() => setIsNavModalOpen(false)}
        profile={currentProfile}
        onOpenLocationSettings={isAdmin ? () => setIsLocationModalOpen(true) : undefined}
      />

      <LocationSettingsModal
        isOpen={isAdmin && isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        profile={currentProfile}
        onSaveLocation={handleUpdateLocation}
      />

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        profile={currentProfile}
      />

      <NfcModal
        isOpen={isNfcModalOpen}
        onClose={() => setIsNfcModalOpen(false)}
        profile={currentProfile}
        allProfiles={profiles}
      />

      <EditProfileModal
        isOpen={isAdmin && isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        profile={currentProfile}
        onSave={handleUpdateProfile}
        onResetToDefault={handleResetToDefault}
        onDelete={handleDeleteProfile}
        canDelete={profiles.length > 1}
      />

      <NewProfileModal
        isOpen={isAdmin && isNewProfileModalOpen}
        onClose={() => setIsNewProfileModalOpen(false)}
        onAddProfile={handleAddNewProfile}
      />

      <AdminLoginModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        isAdmin={isAdmin}
        onAuthSuccess={() => {
          void handleAdminLoggedIn();
          showToast('ورود مدیر سامانه با موفقیت تایید شد.');
        }}
        onLogout={() => {
          void handleAdminLogout();
          showToast('از پنل مدیریت خارج شدید.');
        }}
        onOpenDeployModal={() => setIsDeployModalOpen(true)}
      />

      <ServerDeployModal
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
      />
    </div>
  );
}
