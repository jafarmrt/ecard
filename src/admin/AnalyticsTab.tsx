import React, { useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { EmployeeProfile } from '../types';
import { api, RangeTotals } from '../services/api';
import { copyToClipboard } from '../utils/clipboard';
import { getDirectCardUrl } from '../utils/url';
import { jalaliMonthRange } from '../utils/jalali';
import { Button, Field, Section, formatNumber, inputClass, smallSelect, useToast } from './ui';

type Day = { day: string; views: number; visitors: number; interactions: number; leads: number };

const SOURCE_LABEL: Record<string, string> = { nfc: 'کارت NFC', qr: 'کد QR', link: 'لینک مستقیم' };
const DEVICE_LABEL: Record<string, string> = { ios: 'آیفون', android: 'اندروید', desktop: 'کامپیوتر', other: 'سایر' };

/** Period choices: the last N days, or a Jalali month (this month so far, or a whole earlier month). */
type Period = 'd7' | 'd30' | 'd90' | 'm0' | 'm-1' | 'm-2';

function periodQuery(period: Period): { days?: number; from?: string; to?: string } {
  if (period.startsWith('d')) return { days: Number(period.slice(1)) };
  const { from, to } = jalaliMonthRange(Number(period.slice(1)));
  return { from, to };
}

function periodLabel(period: Period): string {
  if (period.startsWith('d')) return `${formatNumber(Number(period.slice(1)))} روز اخیر`;
  const offset = Number(period.slice(1));
  return `${offset === 0 ? 'این ماه' : ''} ${jalaliMonthRange(offset).label}`.trim();
}

/** "۱۲٪ بیشتر از دوره قبل" (or less / same); nothing when there is no earlier data. */
function delta(now: number, before?: number): { text: string; tone: string } | null {
  if (before === undefined || (before === 0 && now === 0)) return null;
  if (before === 0) return { text: 'دوره قبل صفر بود', tone: 'text-stone-500' };
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { text: 'مثل دوره قبل', tone: 'text-stone-500' };
  return pct > 0
    ? { text: `${formatNumber(pct)}٪ بیشتر از دوره قبل`, tone: 'text-emerald-700' }
    : { text: `${formatNumber(-pct)}٪ کمتر از دوره قبل`, tone: 'text-red-700' };
}

const StatTile: React.FC<{ label: string; value: number; hint?: string; before?: number }> = ({ label, value, hint, before }) => {
  const d = delta(value, before);
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-3.5">
      <p className="text-[12px] text-stone-600 font-medium">{label}</p>
      <p className="text-[22px] font-black text-stone-900 mt-0.5 tabular-nums">{formatNumber(value)}</p>
      {d ? <p className={`text-xs font-bold ${d.tone}`}>{d.text}</p> : hint && <p className="text-xs text-stone-500">{hint}</p>}
    </div>
  );
};

/** From opening the card to leaving a number: how many visitors take each next step. */
const Funnel: React.FC<{ totals: RangeTotals }> = ({ totals }) => {
  const steps = [
    { label: 'بازدید کارت', n: totals.views },
    { label: 'تماس، واتساپ یا لینک', n: totals.interactions },
    { label: 'ذخیره در مخاطبین', n: totals.saves },
    { label: 'درخواست تماس', n: totals.leads },
  ];
  const max = Math.max(1, totals.views);
  return (
    <div className="mt-5">
      <h3 className="text-[12.5px] font-bold text-stone-800 mb-2">از بازدید تا درخواست</h3>
      <ul className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={s.label} className="text-[12.5px]">
            <div className="flex justify-between text-stone-700">
              <span>{s.label}</span>
              <span className="tabular-nums">
                {formatNumber(s.n)}
                {i > 0 && totals.views > 0 && ` (${formatNumber(Math.round((s.n / totals.views) * 100))}٪ بازدیدها)`}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-stone-100 mt-1 overflow-hidden">
              <div className="h-full rounded-full bg-[#D0192A]" style={{ width: `${s.n ? Math.max(1.5, (s.n / max) * 100) : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-stone-500 mt-1.5">یک بازدیدکننده می‌تواند چند بار تماس بگیرد، پس عدد مرحله دوم گاهی از بازدید بیشتر می‌شود.</p>
    </div>
  );
};

/** Builds a tracked link (?c=…) for an ad, a fair or a printed brochure. */
const CampaignLinkBuilder: React.FC<{ profiles: EmployeeProfile[] }> = ({ profiles }) => {
  const toast = useToast();
  const active = profiles.filter((p) => (p.status || 'active') === 'active');
  const [profileId, setProfileId] = useState(active[0]?.id || '');
  const [name, setName] = useState('');
  const code = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
  const profile = active.find((p) => p.id === profileId);
  const url = profile && code ? `${getDirectCardUrl(profile)}?c=${code}` : '';
  return (
    <div className="grid sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-stone-200">
      <Field label="کارت" htmlFor="cl-profile">
        <select id="cl-profile" className={inputClass} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="نام کمپین (انگلیسی)" htmlFor="cl-name" hint="مثلاً expo-1405 یا instagram-ad. فقط حروف انگلیسی، عدد و خط تیره.">
        <input id="cl-name" dir="ltr" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="expo-1405" />
      </Field>
      {url && (
        <div className="sm:col-span-2 flex flex-wrap gap-2 items-center">
          <input readOnly dir="ltr" aria-label="لینک کمپین" className={`${inputClass} flex-1 min-w-[220px] text-[12.5px]`} value={url} onFocus={(e) => e.target.select()} />
          <Button size="sm" onClick={async () => toast((await copyToClipboard(url)) ? 'لینک کمپین کپی شد.' : url)}>
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            کپی
          </Button>
        </div>
      )}
    </div>
  );
};

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
      <div className="flex justify-between text-xs text-stone-500 mt-1 tabular-nums" dir="ltr">
        <span>{days[0] && new Date(days[0].day).toLocaleDateString('fa-IR', { day: 'numeric', month: 'short' })}</span>
        <span>{days.at(-1) && new Date(days.at(-1)!.day).toLocaleDateString('fa-IR', { day: 'numeric', month: 'short' })}</span>
      </div>
    </figure>
  );
};

export const AnalyticsTab: React.FC<{ profiles: EmployeeProfile[] }> = ({ profiles }) => {
  const toast = useToast();
  const [period, setPeriod] = useState<Period>('d30');
  const [totals, setTotals] = useState<RangeTotals | null>(null);
  const [previous, setPrevious] = useState<RangeTotals | null>(null);
  const [byCampaign, setByCampaign] = useState<{ campaign: string; views: number; interactions: number; leads: number }[]>([]);
  const [profileId, setProfileId] = useState('');
  const [days, setDays] = useState<Day[]>([]);
  const [bySource, setBySource] = useState<{ source: string; device: string; n: number }[]>([]);
  const [byProfile, setByProfile] = useState<{ profileId: string; views: number; interactions: number; saves: number; leads: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    // The server counts days in Tehran time; it picks the range from the number of days.
    const res = await api.getTimeSeries({ ...periodQuery(period), profileId: profileId || undefined });
    setLoading(false);
    if (res.success) {
      setDays(res.days || []);
      setBySource(res.bySource || []);
      setByProfile(res.byProfile || []);
      setTotals(res.totals || null);
      setPrevious(res.previous || null);
      setByCampaign(res.byCampaign || []);
    } else toast(res.error || 'دریافت آمار انجام نشد.', 'error');
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, profileId]);

  const shown: RangeTotals = totals || { views: 0, visitors: 0, interactions: 0, saves: 0, leads: 0 };

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

  // Same period as the numbers above, so the cards can be compared for "this month".
  const ranking = profiles
    .filter((p) => p.status !== 'archived' && (!profileId || p.id === profileId))
    .map((p) => {
      const r = byProfile.find((x) => x.profileId === p.id);
      const views = r?.views || 0;
      const leads = r?.leads || 0;
      return { p, views, interactions: r?.interactions || 0, leads, saves: r?.saves || 0, rate: views ? leads / views : 0 };
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
            <select aria-label="بازه زمانی" className={smallSelect} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              {(['d7', 'd30', 'd90', 'm0', 'm-1', 'm-2'] as Period[]).map((p) => (
                <option key={p} value={p}>
                  {periodLabel(p)}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => void load()} disabled={loading} aria-label="به‌روزرسانی آمار">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <StatTile label="بازدید" value={shown.views} before={previous?.views} />
          <StatTile label="بازدیدکننده" value={shown.visitors} hint="تعداد افراد در هر روز" before={previous?.visitors} />
          <StatTile label="تماس، واتساپ و ذخیره" value={shown.interactions} before={previous?.interactions} />
          <StatTile label="درخواست تماس" value={shown.leads} before={previous?.leads} />
        </div>
        {days.length > 0 && <DailyChart days={days} />}
        {shown.views > 0 && <Funnel totals={shown} />}

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

      <Section title="مقایسه کارت‌ها" description={`در همان بازه بالا (${periodLabel(period)}).`}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-stone-600 text-[12px] border-b border-stone-200">
                <th className="text-start font-bold py-2">کارمند</th>
                <th className="text-start font-bold py-2">بازدید</th>
                <th className="text-start font-bold py-2">تماس و ذخیره</th>
                <th className="text-start font-bold py-2">ذخیره مخاطب</th>
                <th className="text-start font-bold py-2">درخواست</th>
                <th className="text-start font-bold py-2">درخواست به بازدید</th>
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
                  <td className="py-2 tabular-nums">{r.views ? `${formatNumber(Math.round(r.rate * 100))}٪` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="لینک‌های کمپین"
        description="برای آگهی، نمایشگاه یا بروشور یک لینک جدا بسازید تا معلوم شود هر کدام چند بازدید و درخواست آورده است."
      >
        {byCampaign.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-stone-600 text-[12px] border-b border-stone-200">
                  <th className="text-start font-bold py-2">کمپین</th>
                  <th className="text-start font-bold py-2">بازدید</th>
                  <th className="text-start font-bold py-2">تماس و ذخیره</th>
                  <th className="text-start font-bold py-2">درخواست</th>
                </tr>
              </thead>
              <tbody>
                {byCampaign.map((c) => (
                  <tr key={c.campaign} className="border-b border-stone-100">
                    <td className="py-2 font-bold text-stone-900">
                      <span dir="ltr">{c.campaign}</span>
                    </td>
                    <td className="py-2 tabular-nums">{formatNumber(c.views)}</td>
                    <td className="py-2 tabular-nums">{formatNumber(c.interactions)}</td>
                    <td className="py-2 tabular-nums">{formatNumber(c.leads)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-stone-500">در این بازه هنوز بازدیدی از لینک کمپین ثبت نشده است.</p>
        )}
        <CampaignLinkBuilder profiles={profiles} />
      </Section>
    </div>
  );
};
