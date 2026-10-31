import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { db, getDataDir, toPublicProfile, ANALYTICS_EVENTS, AnalyticsEvent } from './db.ts';
import {
  decodeImageDataUrl,
  ensureOgImage,
  folderSize,
  getUploadsDir,
  storeImageUpload,
  storePdfUpload,
  vcardPhoto,
} from './uploads.ts';
import { ValidationError, validateLeadInput, RESERVED_SLUGS } from './validation.ts';
import { buildVCard, vcardFileName } from '../utils/vcardBuilder.ts';
import type { Branch, EmployeeProfile, Organization } from '../types.ts';

export const APP_VERSION = '3.0.0';

export function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Public origin for links in OG tags and vCards. PUBLIC_ORIGIN wins over request headers. */
export function resolveRequestOrigin(req: Request): string {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'card.royaco.com';
  return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;
}

/** Returns the card identifier requested by a page URL (or null for non-card pages). */
export function cardIdentifierFromRequest(req: Request): string | null {
  const queryId = (req.query.id || req.query.card || req.query.profile) as string | undefined;
  if (queryId) return String(queryId);
  const cleanPath = req.path.replace(/^\/+|\/+$/g, '');
  if (!cleanPath) return null;
  if (cleanPath.startsWith('card/')) return cleanPath.replace(/^card\//, '').trim() || null;
  if (cleanPath.includes('/') || cleanPath.includes('.')) return null;
  if (/^(api|uploads|src|assets|@)/.test(cleanPath)) return null;
  if (RESERVED_SLUGS.has(cleanPath.toLowerCase())) return null;
  return cleanPath;
}

/** Organisation / branch fields that may be shown on the "card unavailable" page. */
function publicCompanyInfo(org: Organization, branch?: Branch) {
  return {
    company: org.company,
    companyEn: org.companyEn,
    logoUrl: org.logoUrl,
    website: org.website,
    websiteUrl: org.websiteUrl,
    instagram: org.instagram,
    instagramUrl: org.instagramUrl,
    layoutDirection: org.layoutDirection,
    address: branch?.address,
    landline: branch?.landline,
    mapLocation: branch?.mapLocation,
  };
}

export function injectDynamicOpenGraph(html: string, req: Request): { html: string; status: number } {
  const identifier = cardIdentifierFromRequest(req);
  if (!identifier) return { html, status: 200 };
  const result = db.resolvePublicCard(identifier);
  if (result.kind === 'not-found') return { html, status: 404 };
  if (result.kind === 'unavailable') return { html, status: 410 };

  const profile = result.profile;
  const origin = resolveRequestOrigin(req);
  const company = profile.company || 'شرکت رویا طرح داخلی';
  const title = [profile.name, profile.title].filter(Boolean).join(' | ') + ` - ${company}`;
  const description = [
    `کارت ویزیت دیجیتال ${profile.name}`,
    profile.title ? `(${profile.title} در ${company})` : `(${company})`,
    profile.mobile ? `| تماس: ${profile.mobile}` : '',
    '| ذخیره در مخاطبین، کاتالوگ و مسیریابی',
  ]
    .filter(Boolean)
    .join(' ');
  const cardUrl = `${origin}/${profile.slug || profile.id}`;
  const ogImage = `${origin}/api/og/${encodeURIComponent(profile.id)}.png`;

  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeImage = escapeHtml(ogImage);
  const safeUrl = escapeHtml(cardUrl);

  let updated = html
    .replace(/<title>.*?<\/title>/is, `<title>${safeTitle}</title>`)
    .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${safeDesc}" />`)
    .replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${safeTitle}" />`)
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" content="${safeDesc}" />`
    )
    .replace(/<meta\s+property="og:image"[^>]*>\s*/gi, '')
    .replace(/<meta\s+name="twitter:[^"]+"[^>]*>\s*/gi, '');

  const extraMeta = [
    `<meta property="og:url" content="${safeUrl}" />`,
    `<meta property="og:image" content="${safeImage}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<link rel="canonical" href="${safeUrl}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
    `<meta name="twitter:image" content="${safeImage}" />`,
  ].join('\n    ');

  updated = updated.replace('</head>', `    ${extraMeta}\n  </head>`);
  return { html: updated, status: 200 };
}

// ---------------------------------------------------------------------------
// Admin session: HttpOnly cookie (browser) or Bearer token (scripts)
// ---------------------------------------------------------------------------

export const AUTH_COOKIE = 'roya_admin';
const COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function requestToken(req: Request): { token: string | null; viaCookie: boolean } {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return { token: header.substring(7), viaCookie: false };
  const cookie = readCookie(req, AUTH_COOKIE);
  return { token: cookie, viaCookie: Boolean(cookie) };
}

function setAuthCookie(req: Request, res: Response, token: string) {
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_S}${secure}`);
}

function clearAuthCookie(req: Request, res: Response) {
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

/** A cookie-authenticated change must come from this site (defence in depth on top of SameSite). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = ((req.headers['x-forwarded-host'] as string) || req.get('host') || '').split(',')[0].trim();
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** IPv4 with the last part zeroed (IPv6: first 4 groups) for the audit log. */
function maskedIp(req: Request): string {
  const ip = String(req.ip || '').replace(/^::ffff:/, '');
  if (ip.includes('.')) return ip.split('.').slice(0, 3).concat('0').join('.');
  return ip.split(':').slice(0, 4).join(':') + '::';
}

function sendError(res: Response, err: unknown, fallback: string) {
  if (err instanceof ValidationError) {
    res.status(err.status).json({ success: false, error: err.message });
    return;
  }
  if ((err as any)?.type === 'entity.too.large') {
    res.status(413).json({ success: false, error: 'حجم فایل یا اطلاعات ارسالی بیش از حد مجاز است.' });
    return;
  }
  console.error(fallback, err);
  res.status(500).json({ success: false, error: fallback });
}

/** Inline base64 images inside a profile are optimised and stored as files before saving. */
async function storeInlineImages<T extends Record<string, any>>(body: T, identifier: string): Promise<T> {
  const out: Record<string, any> = { ...body };
  for (const [field, prefix] of [
    ['avatarUrl', 'avatar'],
    ['logoUrl', 'logo'],
  ] as const) {
    const value = out[field];
    if (typeof value === 'string' && value.startsWith('data:image/')) {
      out[field] = await storeImageUpload(decodeImageDataUrl(value), prefix, identifier);
    }
  }
  return out as T;
}

const PROFILE_LABEL_FIELDS: (keyof EmployeeProfile)[] = ['name', 'title', 'slug', 'mobile', 'whatsapp', 'email', 'status', 'branchId'];

function describeChanges(before: EmployeeProfile | undefined, after: EmployeeProfile): string {
  if (!before) return `ایجاد کارت ${after.name}`;
  const changed = PROFILE_LABEL_FIELDS.filter((f) => String(before[f] ?? '') !== String(after[f] ?? ''));
  const others = before.avatarUrl !== after.avatarUrl ? ['avatarUrl'] : [];
  const fields = [...changed, ...others];
  return fields.length ? `تغییر ${fields.join('، ')}` : 'ذخیره بدون تغییر در فیلدهای اصلی';
}

/**
 * Builds the Express app with security headers, uploads and every /api route.
 * Static frontend serving is added by server.ts (Vite in dev, dist/ in production).
 */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Baseline security headers for every response.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), nfc=(self)');
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    next();
  });

  // Body parsers: small by default; binary bodies only where files are uploaded.
  app.use('/api/upload-pdf', express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '31mb' }));
  app.use('/api/upload-image', express.raw({ type: ['image/*'], limit: '10mb' }));
  app.use('/api/upload-pdf', express.json({ limit: '42mb' })); // older clients send base64 JSON
  app.use('/api/upload-image', express.json({ limit: '14mb' }));
  app.use('/api/restore', express.json({ limit: '20mb' }));
  app.use('/api/profiles', express.json({ limit: '6mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  const limiter = (windowMs: number, max: number, error?: string) =>
    rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      validate: { xForwardedForHeader: false, default: false },
      ...(error ? { message: { success: false, error } } : {}),
    });

  const authLimiter = limiter(
    15 * 60 * 1000,
    10,
    'تعداد تلاش‌های ناموفق بیش از حد مجاز است. لطفاً ۱۵ دقیقه دیگر مجدداً تلاش فرمایید.'
  );
  const uploadLimiter = limiter(15 * 60 * 1000, 60, 'تعداد آپلودها بیش از حد مجاز است. لطفاً چند دقیقه بعد مجدداً اقدام فرمایید.');
  const analyticsLimiter = limiter(60 * 1000, 120);
  const leadLimiter = limiter(10 * 60 * 1000, 10, 'تعداد درخواست‌ها زیاد است. لطفاً چند دقیقه بعد دوباره تلاش کنید.');
  const ogLimiter = limiter(60 * 1000, 60);

  // Uploaded files. SVG files from older versions are sandboxed so scripts inside them cannot run.
  const uploadsDir = getUploadsDir();
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use(
    '/uploads',
    express.static(uploadsDir, {
      maxAge: '30d',
      setHeaders: (res, filePath) => {
        if (filePath.toLowerCase().endsWith('.svg')) {
          res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        }
      },
    })
  );

  const requireAdminAuth = (req: Request, res: Response, next: NextFunction): void => {
    const { token, viaCookie } = requestToken(req);
    if (!token || !db.validateToken(token)) {
      res.status(401).json({ success: false, error: 'دسترسی غیرمجاز. لطفا ابتدا وارد پنل مدیریت شوید.' });
      return;
    }
    if (viaCookie && !['GET', 'HEAD'].includes(req.method) && !sameOrigin(req)) {
      res.status(403).json({ success: false, error: 'درخواست از مبدأ نامعتبر.' });
      return;
    }
    next();
  };

  const audit = (req: Request, action: string, entity: string, id?: string | null, summary?: string) =>
    db.audit(action, entity, id, summary, maskedIp(req));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ---------------- Auth ----------------
  app.post('/api/auth/login', authLimiter, (req, res) => {
    const password = req.body?.password;
    if (!password || typeof password !== 'string') {
      res.status(400).json({ success: false, error: 'رمز عبور الزامی است.' });
      return;
    }
    if (db.verifyPassword(password)) {
      setAuthCookie(req, res, db.createSession());
      audit(req, 'login', 'session');
      res.json({ success: true, message: 'ورود به پنل مدیریت با موفقیت انجام شد.' });
    } else {
      audit(req, 'login-failed', 'session');
      res.status(401).json({ success: false, error: 'رمز عبور مدیریت اشتباه است.' });
    }
  });

  app.post('/api/auth/check', (req, res) => {
    const { token } = requestToken(req);
    res.json({ valid: token ? db.validateToken(token) : false });
  });

  app.post('/api/auth/logout', (req, res) => {
    const { token } = requestToken(req);
    if (token) db.destroySession(token);
    clearAuthCookie(req, res);
    res.json({ success: true, message: 'خروج با موفقیت انجام شد.' });
  });

  app.post('/api/auth/change-password', authLimiter, requireAdminAuth, (req, res) => {
    const { oldPassword, newPassword } = req.body || {};
    const result = db.changePassword(String(oldPassword || ''), String(newPassword || ''));
    if (result.success && result.token) {
      setAuthCookie(req, res, result.token);
      audit(req, 'change-password', 'session');
    }
    res.status(result.success ? 200 : 400).json({ success: result.success, message: result.message });
  });

  // ---------------- Organisation & branches ----------------
  app.get('/api/organization', requireAdminAuth, (req, res) => {
    res.json({ success: true, organization: db.getOrganization() });
  });

  app.put('/api/organization', requireAdminAuth, async (req, res) => {
    try {
      const { clearOverrides, ...raw } = req.body || {};
      const fields = await storeInlineImages(raw, 'organization');
      const organization = db.updateOrganization(fields, { clearOverrides: Boolean(clearOverrides) });
      audit(req, 'update', 'organization', null, `تغییر ${Object.keys(fields).join('، ')}${clearOverrides ? ' (برای همه کارت‌ها)' : ''}`);
      res.json({ success: true, organization, profiles: db.getAllProfiles(), message: 'تنظیمات سازمان ذخیره شد.' });
    } catch (err) {
      sendError(res, err, 'خطا در ذخیره تنظیمات سازمان');
    }
  });

  app.get('/api/branches', requireAdminAuth, (req, res) => {
    res.json({ success: true, branches: db.getBranches() });
  });

  app.post('/api/branches', requireAdminAuth, (req, res) => {
    try {
      const branch = db.saveBranch(req.body || {}, 'create');
      audit(req, 'create', 'branch', branch.id, branch.name);
      res.status(201).json({ success: true, branch, branches: db.getBranches() });
    } catch (err) {
      sendError(res, err, 'خطا در ثبت شعبه');
    }
  });

  app.put('/api/branches/:id', requireAdminAuth, (req, res) => {
    try {
      const branch = db.saveBranch({ ...(req.body || {}), id: req.params.id }, 'update');
      audit(req, 'update', 'branch', branch.id, branch.name);
      res.json({ success: true, branch, branches: db.getBranches(), profiles: db.getAllProfiles() });
    } catch (err) {
      sendError(res, err, 'خطا در ویرایش شعبه');
    }
  });

  app.delete('/api/branches/:id', requireAdminAuth, (req, res) => {
    try {
      if (!db.deleteBranch(req.params.id)) {
        res.status(404).json({ success: false, error: 'شعبه یافت نشد.' });
        return;
      }
      audit(req, 'delete', 'branch', req.params.id);
      res.json({ success: true, branches: db.getBranches(), profiles: db.getAllProfiles() });
    } catch (err) {
      sendError(res, err, 'خطا در حذف شعبه');
    }
  });

  // ---------------- Profiles ----------------
  // Full list (with analytics, archived cards included) is for the admin panel only.
  app.get('/api/profiles', requireAdminAuth, (req, res) => {
    const profiles = db.getAllProfiles();
    res.json({ success: true, count: profiles.length, profiles });
  });

  // A single card is public, without internal analytics.
  app.get('/api/profiles/:id', (req, res) => {
    const result = db.resolvePublicCard(req.params.id);
    res.setHeader('Cache-Control', 'no-cache');
    if (result.kind === 'not-found') {
      res.status(404).json({ success: false, error: 'پروفایل کارمند یافت نشد.' });
      return;
    }
    if (result.kind === 'unavailable') {
      res.status(410).json({
        success: false,
        state: result.state,
        name: result.name,
        company: publicCompanyInfo(result.organization, result.branch),
        error: result.state === 'inactive' ? 'این کارت موقتاً غیرفعال است.' : 'این کارت دیگر فعال نیست.',
      });
      return;
    }
    res.json({
      success: true,
      profile: toPublicProfile(result.profile),
      canonicalSlug: result.canonicalSlug,
      replacedFrom: result.replacedFrom ? { name: result.replacedFrom.name } : undefined,
    });
  });

  app.post('/api/profiles', requireAdminAuth, async (req, res) => {
    try {
      const body = await storeInlineImages(req.body || {}, String(req.body?.slug || req.body?.id || 'staff'));
      const saved = db.saveProfile(body as EmployeeProfile, 'create');
      audit(req, 'create', 'profile', saved.id, describeChanges(undefined, saved));
      res.status(201).json({ success: true, profile: saved, message: 'کارمند جدید با موفقیت در دیتابیس ثبت شد.' });
    } catch (err) {
      sendError(res, err, 'خطا در ثبت اطلاعات در دیتابیس');
    }
  });

  app.put('/api/profiles/bulk-brand', requireAdminAuth, (req, res) => {
    try {
      const profiles = db.updateBrandForAll(req.body || {});
      audit(req, 'update', 'organization', null, `ویرایش گروهی برند: ${Object.keys(req.body || {}).join('، ')}`);
      res.json({ success: true, profiles, message: 'اطلاعات برند برای تمام پرسنل ذخیره شد.' });
    } catch (err) {
      sendError(res, err, 'خطا در بروزرسانی گروهی اطلاعات برند');
    }
  });

  app.put('/api/profiles/:id', requireAdminAuth, async (req, res) => {
    try {
      const before = db.getProfileById(req.params.id);
      const body = await storeInlineImages({ ...(req.body || {}), id: req.params.id }, req.params.id);
      const saved = db.saveProfile(body as EmployeeProfile, 'update');
      audit(req, 'update', 'profile', saved.id, describeChanges(before, saved));
      res.json({ success: true, profile: saved, message: 'تغییرات با موفقیت در دیتابیس ذخیره شد.' });
    } catch (err) {
      sendError(res, err, 'خطا در ویرایش اطلاعات در دیتابیس');
    }
  });

  app.post('/api/profiles/:id/archive', requireAdminAuth, (req, res) => {
    try {
      const saved = db.archiveProfile(req.params.id, req.body?.redirectTo || null);
      if (!saved) {
        res.status(404).json({ success: false, error: 'پروفایل مورد نظر یافت نشد.' });
        return;
      }
      audit(req, 'archive', 'profile', saved.id, saved.redirectTo ? `${saved.name}، جایگزین: ${db.getProfileById(saved.redirectTo)?.name || saved.redirectTo}` : `${saved.name}، بدون جایگزین`);
      res.json({ success: true, profile: saved, message: 'کارت بایگانی شد. لینک و NFC آن همچنان کار می‌کند.' });
    } catch (err) {
      sendError(res, err, 'خطا در بایگانی کارت');
    }
  });

  app.post('/api/profiles/:id/restore', requireAdminAuth, (req, res) => {
    const saved = db.restoreProfile(req.params.id);
    if (!saved) {
      res.status(404).json({ success: false, error: 'پروفایل مورد نظر یافت نشد.' });
      return;
    }
    audit(req, 'restore', 'profile', saved.id);
    res.json({ success: true, profile: saved, message: 'کارت دوباره فعال شد.' });
  });

  // DELETE archives by default; ?permanent=1 removes an already archived card for good.
  app.delete('/api/profiles/:id', requireAdminAuth, (req, res) => {
    try {
      if (req.query.permanent === '1') {
        if (!db.deleteProfile(req.params.id)) {
          res.status(404).json({ success: false, error: 'پروفایل مورد نظر یافت نشد.' });
          return;
        }
        audit(req, 'delete', 'profile', req.params.id, 'حذف دائمی');
        res.json({ success: true, message: 'کارت برای همیشه حذف شد.' });
        return;
      }
      const saved = db.archiveProfile(req.params.id, (req.query.redirectTo as string) || null);
      if (!saved) {
        res.status(404).json({ success: false, error: 'پروفایل مورد نظر یافت نشد.' });
        return;
      }
      audit(req, 'archive', 'profile', saved.id);
      res.json({ success: true, profile: saved, archived: true, message: 'کارت بایگانی شد.' });
    } catch (err) {
      sendError(res, err, 'خطا در حذف کارت');
    }
  });

  // ---------------- Analytics ----------------
  app.post('/api/analytics/:id/event', analyticsLimiter, (req, res) => {
    const event = req.body?.event as AnalyticsEvent;
    if (!event || !ANALYTICS_EVENTS.includes(event)) {
      res.status(400).json({ success: false, error: 'نوع رویداد نامعتبر است.' });
      return;
    }
    const result = db.recordAnalyticsEvent(req.params.id, event, {
      source: req.body?.source,
      campaign: req.body?.campaign,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'پروفایل مورد نظر برای ثبت آمار یافت نشد.' });
    }
  });

  app.get('/api/analytics/summary', requireAdminAuth, (req, res) => {
    const profiles = db.getAllProfiles();
    const sum = (key: keyof NonNullable<EmployeeProfile['analytics']>) =>
      profiles.reduce((acc, p) => acc + (Number(p.analytics?.[key]) || 0), 0);
    const totals = {
      totalViews: sum('views'),
      totalNfcTaps: sum('nfcTaps'),
      totalQrScans: sum('qrScans'),
      totalCalls: sum('callClicks'),
      totalWhatsapps: sum('whatsappClicks'),
      totalCatalogDownloads: sum('catalogDownloads'),
      totalVcardDownloads: sum('vcardDownloads'),
      totalMapClicks: sum('mapClicks'),
      totalInstagramClicks: sum('instagramClicks'),
      totalWebsiteClicks: sum('websiteClicks'),
      totalEmailClicks: sum('emailClicks'),
    };
    res.json({
      success: true,
      summary: {
        totalProfiles: profiles.filter((p) => p.status !== 'archived').length,
        totalLeads: db.getAllLeads().length,
        ...totals,
        totalInteractions:
          totals.totalCalls +
          totals.totalWhatsapps +
          totals.totalCatalogDownloads +
          totals.totalVcardDownloads +
          totals.totalMapClicks +
          totals.totalInstagramClicks +
          totals.totalWebsiteClicks +
          totals.totalEmailClicks,
      },
    });
  });

  // Daily numbers for charts. Defaults to the last 30 days.
  app.get('/api/analytics/timeseries', requireAdminAuth, (req, res) => {
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const isDay = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const to = isDay(req.query.to) ? String(req.query.to) : day(new Date());
    const from = isDay(req.query.from) ? String(req.query.from) : day(new Date(Date.now() - 29 * 86400000));
    const profileId = req.query.profileId ? String(req.query.profileId) : undefined;
    res.json({ success: true, from, to, ...db.getTimeSeries({ from, to, profileId }) });
  });

  // ---------------- Leads ----------------
  app.post('/api/leads', leadLimiter, (req, res) => {
    // Honeypot: real visitors never fill the hidden "website" field.
    if (req.body?.website) {
      res.status(201).json({ success: true, message: 'اطلاعات تماس شما با موفقیت برای کارشناس ثبت شد.' });
      return;
    }
    try {
      const input = validateLeadInput(req.body);
      const { lead } = db.addLead({ ...input, source: req.body?.source });
      res.status(201).json({
        success: true,
        lead: { id: lead.id, createdAt: lead.createdAt },
        message: 'اطلاعات تماس شما با موفقیت برای کارشناس ثبت شد.',
      });
    } catch (err) {
      sendError(res, err, 'خطا در ثبت اطلاعات تماس');
    }
  });

  app.get('/api/leads', requireAdminAuth, (req, res) => {
    const leads = db.getAllLeads();
    res.json({ success: true, count: leads.length, leads });
  });

  app.delete('/api/leads/:id', requireAdminAuth, (req, res) => {
    if (db.deleteLead(req.params.id)) {
      audit(req, 'delete', 'lead', req.params.id);
      res.json({ success: true, message: 'رکورد مشتری با موفقیت حذف شد.' });
    } else {
      res.status(404).json({ success: false, error: 'رکورد مورد نظر یافت نشد.' });
    }
  });

  // ---------------- vCard (used by printed NFC / QR links) ----------------
  app.get('/api/vcard/:id', async (req, res, next) => {
    try {
      const result = db.resolvePublicCard(req.params.id);
      if (result.kind !== 'ok') {
        res.status(result.kind === 'not-found' ? 404 : 410).send('Profile not available');
        return;
      }
      const profile = result.profile;
      const photo = await vcardPhoto(profile.avatarUrl);
      const content = buildVCard(profile, { origin: resolveRequestOrigin(req), photo });
      res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${vcardFileName(profile)}"`);
      res.send('﻿' + content);
    } catch (err) {
      next(err);
    }
  });

  // ---------------- Link preview image ----------------
  app.get('/api/og/:file', ogLimiter, async (req, res) => {
    const id = req.params.file.replace(/\.png$/i, '');
    const result = db.resolvePublicCard(id);
    const fallback = () => res.redirect(302, '/pwa-512x512.png');
    if (result.kind !== 'ok') return fallback();
    try {
      const p = result.profile;
      const file = await ensureOgImage({
        id: p.id,
        name: p.name,
        title: p.title,
        company: p.company,
        url: `${resolveRequestOrigin(req)}/${p.slug || p.id}`,
        avatarUrl: p.avatarUrl,
        logoUrl: p.logoUrl,
      });
      if (!file) return fallback();
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(file);
    } catch (err) {
      console.error('[OG] preview image failed', err);
      fallback();
    }
  });

  // ---------------- Backup ----------------
  app.get('/api/backup', requireAdminAuth, (req, res) => {
    audit(req, 'export', 'backup');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="roya-db-backup-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.json(db.exportBackup());
  });

  app.post('/api/restore/preview', requireAdminAuth, (req, res) => {
    res.json({ success: true, preview: db.previewRestore(req.body) });
  });

  app.post('/api/restore', requireAdminAuth, (req, res) => {
    try {
      const result = db.importBackup(req.body);
      if (!result.ok) {
        res.status(400).json({ success: false, error: result.error || 'فایل پشتیبان نامعتبر است.' });
        return;
      }
      audit(req, 'restore', 'backup', null, `نسخه قبلی در ${path.basename(result.safetyCopy || '')}`);
      res.json({
        success: true,
        profiles: db.getAllProfiles(),
        safetyCopy: path.basename(result.safetyCopy || ''),
        message: 'پشتیبان بازگردانی شد. یک نسخه از اطلاعات قبلی هم روی سرور نگه داشته شد.',
      });
    } catch (err) {
      sendError(res, err, 'خطا در بازگردانی پشتیبان');
    }
  });

  // ---------------- System health (admin) ----------------
  app.get('/api/admin/health', requireAdminAuth, (req, res) => {
    const stats = db.stats();
    const dbSize = ['', '-wal', '-shm'].reduce((acc, suffix) => {
      try {
        return acc + fs.statSync(stats.databaseFile + suffix).size;
      } catch {
        return acc;
      }
    }, 0);
    let disk: { free: number; total: number } | null = null;
    try {
      const s = fs.statfsSync(getDataDir());
      disk = { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
    } catch {}
    const snapshots = db.listSnapshots();
    const { databaseFile: _f, ...publicStats } = stats;
    res.json({
      success: true,
      health: {
        version: APP_VERSION,
        node: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        ...publicStats,
        databaseBytes: dbSize,
        uploadsBytes: folderSize(uploadsDir),
        disk,
        lastBackupAt: snapshots[0]?.createdAt || null,
        backups: snapshots.slice(0, 5),
        sessionSecretFromEnv: Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16),
      },
    });
  });

  app.post('/api/admin/snapshot', requireAdminAuth, (req, res) => {
    try {
      const file = db.snapshot('manual');
      db.pruneSnapshots();
      audit(req, 'snapshot', 'backup', null, path.basename(file));
      res.json({ success: true, file: path.basename(file), message: 'نسخه پشتیبان روی سرور ساخته شد.' });
    } catch (err) {
      sendError(res, err, 'خطا در ساخت نسخه پشتیبان');
    }
  });

  app.get('/api/audit', requireAdminAuth, (req, res) => {
    const limit = Number(req.query.limit) || 100;
    const offset = Number(req.query.offset) || 0;
    res.json({ success: true, ...db.getAuditLog(limit, offset) });
  });

  // ---------------- Uploads ----------------
  // Preferred: the raw file as the request body (Content-Type image/*), options in the query string.
  // Older clients: JSON { fileData: "data:image/...;base64,...", type, profileId }.
  app.post('/api/upload-image', uploadLimiter, requireAdminAuth, async (req, res) => {
    try {
      let buffer: Buffer;
      let type: unknown = req.query.type;
      let profileId: unknown = req.query.profileId;
      if (Buffer.isBuffer(req.body)) {
        buffer = req.body;
      } else {
        const { fileData } = req.body || {};
        if (!fileData || typeof fileData !== 'string') throw new ValidationError('تصویر ارسالی معتبر نیست.');
        buffer = decodeImageDataUrl(fileData);
        type = req.body.type ?? type;
        profileId = req.body.profileId ?? profileId;
      }
      const url = await storeImageUpload(buffer, type === 'logo' ? 'logo' : 'avatar', String(profileId || 'staff'));
      res.json({ success: true, url, message: 'تصویر با موفقیت روی سرور ذخیره شد.' });
    } catch (err) {
      sendError(res, err, 'خطا در آپلود تصویر');
    }
  });

  app.post('/api/upload-pdf', uploadLimiter, requireAdminAuth, (req, res) => {
    try {
      let buffer: Buffer;
      let fileName = String(req.query.fileName || '');
      let replaceDefault = req.query.replaceDefault === '1' || req.query.replaceDefault === 'true';
      if (Buffer.isBuffer(req.body)) {
        buffer = req.body;
      } else {
        const { fileData } = req.body || {};
        if (!fileData || typeof fileData !== 'string') throw new ValidationError('محتوای فایل PDF ارسال نشده است.');
        buffer = Buffer.from(fileData.replace(/^data:[^;]+;base64,/, ''), 'base64');
        fileName = req.body.fileName || fileName;
        replaceDefault = Boolean(req.body.replaceDefault) || replaceDefault;
      }
      const stored = storePdfUpload(buffer, fileName, replaceDefault);
      audit(req, 'upload', 'catalog', null, stored.fileName);
      res.json({
        success: true,
        url: stored.url,
        fileName: stored.fileName,
        originalName: fileName,
        size: stored.size,
        message: 'فایل PDF کاتالوگ با موفقیت بارگذاری شد.',
      });
    } catch (err) {
      sendError(res, err, 'خطا در بارگذاری فایل PDF روی سرور');
    }
  });

  // Default catalog: an uploaded replacement wins over the bundled file.
  app.get('/roya-catalog.pdf', (req, res, next) => {
    const uploaded = path.join(uploadsDir, 'roya-catalog.pdf');
    const bundled = path.resolve(process.cwd(), 'public', 'roya-catalog.pdf');
    const file = fs.existsSync(uploaded) ? uploaded : fs.existsSync(bundled) ? bundled : null;
    if (!file) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(file);
  });

  // Unknown API routes return JSON, not the SPA.
  app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'مسیر API یافت نشد.' });
  });

  // JSON error handler (e.g. body too large, malformed JSON).
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ success: false, error: 'اطلاعات ارسالی معتبر نیست.' });
      return;
    }
    sendError(res, err, 'خطای داخلی سرور');
  });

  return app;
}
