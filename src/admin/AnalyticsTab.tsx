import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { EmployeeProfile } from '../types';
import { api } from '../services/api';
import { Button, Section, formatNumber, smallSelect, useToast } from './ui';

type Day = { day: string; views: number; visitors: number; interactions: number; leads: number };

const SOURCE_LABEL: Record<string, string> = { nfc: 'کارت NFC', qr: 'کد QR', link: 'لینک مستقیم' };
const DEVICE_LABEL: Record<string, string> = { ios: 'آیفون', android: 'اندروید', desktop: 'کامپیوتر', other: 'سایر' };

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

const StatTile: React.FC<{ label: string; value: number; hint?: string }> = ({ label, value, hint }) => (
  <div className="bg-white border border-stone-200 rounded-2xl p-3.5">
    <p className="text-[12px] text-stone-600 font-medium">{label}</p>
    <p className="text-[22px] font-black text-stone-900 mt-0.5 tabular-nums">{formatNumber(value)}</p>
    {hint && <p className="text-[11px] text-stone-500">{hint}</p>}
  </div>
);

/** Daily views as a single-series bar chart, with a per-bar tooltip. */
const DailyChart: React.FC<{ days: Day[] }> = ({ days }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.views));
  const height = 140;
  const shown = hover !== null ? days[hover] : null;
  return (
    <figure className="mt-1">
      <figcaption className="flex items-center justify-between text-[12px] text-stone-600 mb-2 min-h-5">
        <span className="font-bold text-stone-800">بازدید روزانه</span>
        {shown ? (
          <span className="tabular-nums">
            {new Date(shown.day).toLocaleDateString('fa-IR', { weekday: 'short', day: 'numeric', month: 'long' })}: {formatNumber(shown.views)} بازدید،{' '}
            {formatNumber(shown.visitors)} بازدیدکننده، {formatNumber(shown.leads)} درخواست
          </span>
        ) : (
          <span>بیشترین: {formatNumber(max)}</span>
        )}
      </figcaption>
      <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        <div className="absolute inset-x-0 bottom-0 border-t border-stone-300" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-stone-200" aria-hidden="true" />
        <div className="absolute inset-0 flex items-end gap-[2px]" dir="ltr">
          {days.map((d, i) => {
            const h = d.views ? Math.max(3, Math.round((d.views / max) * (height - 4))) : 0;
            return (
              <button
                key={d.day}
                type="button"
                className="flex-1 h-full flex items-end cursor-default focus-visible:outline-2 focus-visible:outline-[#D0192A]"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${new Date(d.day).toLocaleDateString('fa-IR')}: ${formatNumber(d.views)} بازدید`}
              >
                <span
                  className={`w-full rounded-t-[4px] transition-colors ${hover === i ? 'bg-[#9E111E]' : 'bg-[#D0192A]'}`}
                  style={{ height: h }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex justify-between text-[11px] text-stone-500 mt-1 tabular-nums" dir="ltr">
        <span>{days[0] && new Date(days[0].day).toLocaleDateString('fa-IR', { day: 'numeric', month: 'short' })}</span>
        <span>{days.at(-1) && new Date(days.at(-1)!.day).toLocaleDateString('fa-IR', { day: 'numeric', month: 'short' })}</span>
      </div>
    </figure>
  );
};

export const AnalyticsTab: React.FC<{ profiles: EmployeeProfile[] }> = ({ profiles }) => {
  const toast = useToast();
  const [period, setPeriod] = useState(30);
  const [profileId, setProfileId] = useState('');
  const [days, setDays] = useState<Day[]>([]);
  const [bySource, setBySource] = useState<{ source: string; device: string; n: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const to = new Date();
    const from = new Date(Date.now() - (period - 1) * 86400000);
    const res = await api.getTimeSeries({ from: isoDay(from), to: isoDay(to), profileId: profileId || undefined });
    setLoading(false);
    if (res.success) {
      setDays(res.days || []);
      setBySource(res.bySource || []);
    } else toast(res.error || 'دریافت آمار انجام نشد.', 'error');
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, profileId]);

  const totals = useMemo(
    () =>
      days.reduce(
        (acc, d) => ({
          views: acc.views + d.views,
          visitors: acc.visitors + d.visitors,
          interactions: acc.interactions + d.interactions,
          leads: acc.leads + d.leads,
        }),
        { views: 0, visitors: 0, interactions: 0, leads: 0 }
      ),
    [days]
  );

  const sources = useMemo(() => {
    const map = new Map<string, number>();
    const devices = new Map<string, number>();
    for (const r of bySource) {
      map.set(r.source || 'link', (map.get(r.source || 'link') || 0) + r.n);
      devices.set(r.device || 'other', (devices.get(r.device || 'other') || 0) + r.n);
    }
    const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
    const dTotal = [...devices.values()].reduce((a, b) => a + b, 0) || 1;
    return {
      sources: [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n, pct: n / total })),
      devices: [...devices.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n, pct: n / dTotal })),
    };
  }, [bySource]);

  const ranking = profiles
    .filter((p) => p.status !== 'archived')
    .map((p) => {
      const a = p.analytics;
      const interactions =
        (a?.callClicks || 0) + (a?.whatsappClicks || 0) + (a?.vcardDownloads || 0) + (a?.catalogDownloads || 0) + (a?.mapClicks || 0);
      return { p, views: a?.views || 0, interactions, leads: a?.leadCaptures || 0, saves: a?.vcardDownloads || 0 };
    })
    .sort((a, b) => b.views - a.views);

  return (
    <div className="space-y-4">
      <Section
        title="آمار بازدید"
        description="هر بازدید یک بار در هر نشست مرورگر شمرده می‌شود. ربات‌ها و بازدید خود مدیر شمرده نمی‌شوند."
        actions={
          <>
            <select aria-label="کارت" className={smallSelect} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              <option value="">همه کارت‌ها</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select aria-label="بازه زمانی" className={smallSelect} value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
              <option value={7}>۷ روز اخیر</option>
              <option value={30}>۳۰ روز اخیر</option>
              <option value={90}>۹۰ روز اخیر</option>
            </select>
            <Button size="sm" onClick={() => void load()} disabled={loading} aria-label="به‌روزرسانی آمار">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <StatTile label="بازدید" value={totals.views} />
          <StatTile label="بازدیدکننده" value={totals.visitors} hint="تعداد افراد در هر روز" />
          <StatTile label="تماس، واتساپ و ذخیره" value={totals.interactions} />
          <StatTile label="درخواست تماس" value={totals.leads} />
        </div>
        {days.length > 0 && <DailyChart days={days} />}

        {sources.sources.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-4 mt-5">
            {[
              { title: 'از کجا آمده‌اند', rows: sources.sources, labels: SOURCE_LABEL },
              { title: 'با چه دستگاهی', rows: sources.devices, labels: DEVICE_LABEL },
            ].map((block) => (
              <div key={block.title}>
                <h3 className="text-[12.5px] font-bold text-stone-800 mb-2">{block.title}</h3>
                <ul className="space-y-1.5">
                  {block.rows.map((r) => (
                    <li key={r.k} className="text-[12.5px]">
                      <div className="flex justify-between text-stone-700">
                        <span>{block.labels[r.k] || r.k}</span>
                        <span className="tabular-nums">
                          {formatNumber(r.n)} ({formatNumber(Math.round(r.pct * 100))}٪)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-stone-100 mt-1 overflow-hidden">
                        <div className="h-full rounded-full bg-[#D0192A]" style={{ width: `${Math.max(2, r.pct * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="مقایسه کارت‌ها" description="جمع کل از ابتدای راه‌اندازی.">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-stone-600 text-[12px] border-b border-stone-200">
                <th className="text-start font-bold py-2">کارمند</th>
                <th className="text-start font-bold py-2">بازدید</th>
                <th className="text-start font-bold py-2">تماس و ذخیره</th>
                <th className="text-start font-bold py-2">ذخیره مخاطب</th>
                <th className="text-start font-bold py-2">درخواست</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.p.id} className="border-b border-stone-100">
                  <td className="py-2 font-bold text-stone-900">{r.p.name}</td>
                  <td className="py-2 tabular-nums">{formatNumber(r.views)}</td>
                  <td className="py-2 tabular-nums">{formatNumber(r.interactions)}</td>
                  <td className="py-2 tabular-nums">{formatNumber(r.saves)}</td>
                  <td className="py-2 tabular-nums">{formatNumber(r.leads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
};
