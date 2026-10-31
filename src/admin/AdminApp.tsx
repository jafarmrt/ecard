import React, { useCallback, useEffect, useState } from 'react';
import { Users, Inbox, BarChart3, Building2, MapPin, Settings, LogOut, Loader2 } from 'lucide-react';
import { Branch, EmployeeProfile, Organization } from '../types';
import { api } from '../services/api';
import { RoyaLogo } from '../components/RoyaLogo';
import { DigitalCard } from '../components/DigitalCard';
import { NfcModal } from '../components/NfcModal';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { ToastProvider, useToast } from './ui';
import { LoginScreen } from './LoginScreen';
import { StaffTab } from './StaffTab';
import { ProfileFormModal } from './ProfileFormModal';
import { LeadsTab } from './LeadsTab';
import { AnalyticsTab } from './AnalyticsTab';
import { OrganizationTab } from './OrganizationTab';
import { BranchesTab } from './BranchesTab';
import { SystemTab } from './SystemTab';

type Tab = 'staff' | 'leads' | 'analytics' | 'organization' | 'branches' | 'system';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'staff', label: 'کارت‌ها', icon: Users },
  { id: 'leads', label: 'درخواست‌ها', icon: Inbox },
  { id: 'analytics', label: 'آمار', icon: BarChart3 },
  { id: 'organization', label: 'شرکت', icon: Building2 },
  { id: 'branches', label: 'شعبه‌ها', icon: MapPin },
  { id: 'system', label: 'سیستم', icon: Settings },
];

function initialTab(): Tab {
  const fromHash = window.location.hash.replace('#', '') as Tab;
  return TABS.some((t) => t.id === fromHash) ? fromHash : 'staff';
}

const Workspace: React.FC<{ onLoggedOut: () => void }> = ({ onLoggedOut }) => {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [profiles, setProfiles] = useState<EmployeeProfile[]>(() => api.getCachedProfiles());
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ profile: EmployeeProfile | null } | null>(null);
  const [qrProfile, setQrProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    const [list, org, br] = await Promise.all([api.getProfiles(), api.getOrganization(), api.getBranches()]);
    setProfiles(list);
    if (org.success && org.organization) setOrganization(org.organization);
    if (br.success && br.branches) setBranches(br.branches);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    window.history.replaceState(window.history.state, '', `/admin${tab === 'staff' ? '' : `#${tab}`}`);
  }, [tab]);

  useEffect(() => {
    if (!selectedId || !profiles.some((p) => p.id === selectedId)) {
      setSelectedId(profiles.find((p) => p.status !== 'archived')?.id || profiles[0]?.id || null);
    }
  }, [profiles, selectedId]);

  const selected = profiles.find((p) => p.id === selectedId) || null;

  const logout = async () => {
    await api.logoutAdmin();
    api.clearCachedProfiles();
    toast('از پنل خارج شدید.');
    onLoggedOut();
  };

  return (
    <div className="min-h-dvh bg-stone-100 text-stone-900">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-[92px] shrink-0">
              <RoyaLogo size="sm" className="!w-[92px]" logoUrl={organization?.logoUrl || undefined} />
            </div>
            <span className="text-[13.5px] font-black text-stone-800 truncate">پنل کارت‌های دیجیتال</span>
          </div>
          <div className="flex items-center gap-2">
            <PWAInstallButton className="hidden sm:inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-[12.5px] font-bold text-stone-800 cursor-pointer" />
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl text-[12.5px] font-bold text-stone-700 hover:bg-stone-100 cursor-pointer"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              خروج
            </button>
          </div>
        </div>
        <nav aria-label="بخش‌های پنل" className="max-w-6xl mx-auto px-2 sm:px-4 overflow-x-auto">
          <ul className="flex gap-1 min-w-max">
            {TABS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={tab === id ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 min-h-11 px-3 border-b-2 text-[13px] font-bold cursor-pointer transition-colors ${
                    tab === id ? 'border-[#D0192A] text-[#B51221]' : 'border-transparent text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto p-3 sm:p-5">
        {loading && profiles.length === 0 ? (
          <div className="space-y-2" aria-busy="true" aria-label="در حال بارگذاری">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-white border border-stone-200 animate-pulse" />
            ))}
          </div>
        ) : tab === 'staff' ? (
          <div className="grid lg:grid-cols-[1fr_400px] gap-5 items-start">
            <StaffTab
              profiles={profiles}
              branches={branches}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onEdit={(profile) => setEditing({ profile })}
              onOpenQr={setQrProfile}
              onChanged={loadAll}
            />
            {selected && (
              <aside className="hidden lg:block sticky top-32" aria-label="پیش‌نمایش کارت">
                <p className="text-[12px] text-stone-500 mb-2 text-center">پیش‌نمایش: مشتری کارت را این‌طور می‌بیند</p>
                <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-3xl">
                  <DigitalCard profile={selected} onOpenNavigation={() => {}} onOpenShare={() => setQrProfile(selected)} onOpenNfc={() => {}} isAdmin />
                </div>
              </aside>
            )}
          </div>
        ) : tab === 'leads' ? (
          <LeadsTab />
        ) : tab === 'analytics' ? (
          <AnalyticsTab profiles={profiles} />
        ) : tab === 'organization' ? (
          <OrganizationTab
            organization={organization}
            profiles={profiles}
            onSaved={(org, list) => {
              setOrganization(org);
              if (list) setProfiles(list);
              else void loadAll();
            }}
          />
        ) : tab === 'branches' ? (
          <BranchesTab
            branches={branches}
            profiles={profiles}
            onChanged={(br, list) => {
              if (br) setBranches(br);
              if (list) setProfiles(list);
              if (!br || !list) void loadAll();
            }}
          />
        ) : (
          <SystemTab profiles={profiles} onRestored={loadAll} />
        )}
      </main>

      <ProfileFormModal
        open={!!editing}
        profile={editing?.profile || null}
        organization={organization}
        branches={branches}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null);
          setSelectedId(saved.id);
          void loadAll();
        }}
      />
      {qrProfile && (
        <NfcModal
          isOpen
          onClose={() => setQrProfile(null)}
          profile={qrProfile}
          allProfiles={profiles.filter((p) => p.status !== 'archived')}
        />
      )}
    </div>
  );
};

export default function AdminApp() {
  const [auth, setAuth] = useState<'checking' | 'in' | 'out'>('checking');

  useEffect(() => {
    let alive = true;
    api.checkAdminAuth().then((ok) => {
      if (alive) setAuth(ok ? 'in' : 'out');
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    document.title = 'پنل مدیریت کارت‌ها | رویا';
  }, []);

  return (
    <ToastProvider>
      {auth === 'checking' ? (
        <div className="min-h-dvh bg-stone-100 flex items-center justify-center" aria-busy="true">
          <Loader2 className="w-6 h-6 text-[#D0192A] animate-spin" aria-label="در حال بررسی ورود" />
        </div>
      ) : auth === 'out' ? (
        <LoginScreen onLoggedIn={() => setAuth('in')} />
      ) : (
        <Workspace onLoggedOut={() => setAuth('out')} />
      )}
    </ToastProvider>
  );
}
