import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { db, getUploadsDir, toPublicProfile, persistBase64Image, ANALYTICS_EVENTS, AnalyticsEvent } from './db.ts';
import { ValidationError, validateLeadInput } from './validation.ts';
import { buildVCard, vcardFileName } from '../utils/vcardBuilder.ts';
import { EmployeeProfile } from '../types.ts';

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
  return cleanPath;
}

export function injectDynamicOpenGraph(html: string, req: Request): { html: string; status: number } {
  const identifier = cardIdentifierFromRequest(req);
  if (!identifier) return { html, status: 200 };
  const profile = db.getProfileBySlugOrId(identifier);
  if (!profile) return { html, status: 404 };

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

  let ogImage = `${origin}/pwa-512x512.png`;
  if (profile.avatarUrl?.startsWith('http')) ogImage = profile.avatarUrl;
  else if (profile.avatarUrl?.startsWith('/')) ogImage = `${origin}${profile.avatarUrl}`;

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
    );

  const extraMeta = [
    `<meta property="og:url" content="${safeUrl}" />`,
    `<meta property="og:image" content="${safeImage}" />`,
    `<link rel="canonical" href="${safeUrl}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
    `<meta name="twitter:image" content="${safeImage}" />`,
  ].join('\n    ');

  updated = updated.replace('</head>', `    ${extraMeta}\n  </head>`);
  return { html: updated, status: 200 };
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  return header && header.startsWith('Bearer ') ? header.substring(7) : null;
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

const MAX_PDF_BYTES = 30 * 1024 * 1024;

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
    next();
  });

  // Body size limits: small by default, larger only where files are uploaded.
  app.use('/api/upload-pdf', express.json({ limit: '45mb' }));
  app.use('/api/upload-image', express.json({ limit: '10mb' }));
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
  const uploadLimiter = limiter(15 * 60 * 1000, 30, 'تعداد آپلودها بیش از حد مجاز است. لطفاً چند دقیقه بعد مجدداً اقدام فرمایید.');
  const analyticsLimiter = limiter(60 * 1000, 120);
  const leadLimiter = limiter(10 * 60 * 1000, 10, 'تعداد درخواست‌ها زیاد است. لطفاً چند دقیقه بعد دوباره تلاش کنید.');

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
    const token = bearerToken(req);
    if (!token || !db.validateToken(token)) {
      res.status(401).json({ success: false, error: 'دسترسی غیرمجاز. لطفا ابتدا وارد پنل مدیریت شوید.' });
      return;
    }
    next();
  };

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
      res.json({ success: true, token: db.createSession(), message: 'ورود به پنل مدیریت با موفقیت انجام شد.' });
    } else {
      res.status(401).json({ success: false, error: 'رمز عبور مدیریت اشتباه است.' });
    }
  });

  app.post('/api/auth/check', (req, res) => {
    const token = bearerToken(req);
    res.json({ valid: token ? db.validateToken(token) : false });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = bearerToken(req);
    if (token) db.destroySession(token);
    res.json({ success: true, message: 'خروج با موفقیت انجام شد.' });
  });

  app.post('/api/auth/change-password', authLimiter, requireAdminAuth, (req, res) => {
    const { oldPassword, newPassword } = req.body || {};
    const result = db.changePassword(String(oldPassword || ''), String(newPassword || ''));
    res.status(result.success ? 200 : 400).json(result);
  });

  // ---------------- Profiles ----------------
  // Full list (with analytics) is for the admin panel only.
  app.get('/api/profiles', requireAdminAuth, (req, res) => {
    const profiles = db.getAllProfiles();
    res.json({ success: true, count: profiles.length, profiles });
  });

  // A single card is public, without internal analytics.
  app.get('/api/profiles/:id', (req, res) => {
    const profile = db.getProfileBySlugOrId(req.params.id);
    if (!profile) {
      res.status(404).json({ success: false, error: 'پروفایل کارمند یافت نشد.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ success: true, profile: toPublicProfile(profile) });
  });

  app.post('/api/profiles', requireAdminAuth, (req, res) => {
    try {
      const saved = db.saveProfile(req.body as EmployeeProfile, 'create');
      res.status(201).json({ success: true, profile: saved, message: 'کارمند جدید با موفقیت در دیتابیس ثبت شد.' });
    } catch (err) {
      sendError(res, err, 'خطا در ثبت اطلاعات در دیتابیس');
    }
  });

  app.put('/api/profiles/bulk-brand', requireAdminAuth, (req, res) => {
    try {
      const profiles = db.updateBrandForAll(req.body || {});
      res.json({
        success: true,
        profiles,
        message: 'اطلاعات برند، کاتالوگ PDF و جهت چیدمان به صورت یکپارچه برای تمام پرسنل ذخیره شد.',
      });
    } catch (err) {
      sendError(res, err, 'خطا در بروزرسانی گروهی اطلاعات برند');
    }
  });

  app.put('/api/profiles/:id', requireAdminAuth, (req, res) => {
    try {
      const saved = db.saveProfile({ ...(req.body || {}), id: req.params.id } as EmployeeProfile, 'update');
      res.json({ success: true, profile: saved, message: 'تغییرات با موفقیت در دیتابیس ذخیره شد.' });
    } catch (err) {
      sendError(res, err, 'خطا در ویرایش اطلاعات در دیتابیس');
    }
  });

  app.delete('/api/profiles/:id', requireAdminAuth, (req, res) => {
    if (db.deleteProfile(req.params.id)) {
      res.json({ success: true, message: 'پروفایل با موفقیت حذف گردید.' });
    } else {
      res.status(404).json({ success: false, error: 'پروفایل مورد نظر یافت نشد.' });
    }
  });

  app.post('/api/profiles/reset', requireAdminAuth, (req, res) => {
    const profiles = db.resetProfiles();
    res.json({ success: true, profiles, message: 'پایگاه داده به پروفایل‌های پیش‌فرض رویا بازنشانی شد.' });
  });

  // ---------------- Analytics ----------------
  app.post('/api/analytics/:id/event', analyticsLimiter, (req, res) => {
    const event = req.body?.event as AnalyticsEvent;
    if (!event || !ANALYTICS_EVENTS.includes(event)) {
      res.status(400).json({ success: false, error: 'نوع رویداد نامعتبر است.' });
      return;
    }
    const result = db.recordAnalyticsEvent(req.params.id, event);
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
        totalProfiles: profiles.length,
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

  // ---------------- Leads ----------------
  app.post('/api/leads', leadLimiter, (req, res) => {
    // Honeypot: real visitors never fill the hidden "website" field.
    if (req.body?.website) {
      res.status(201).json({ success: true, message: 'اطلاعات تماس شما با موفقیت برای کارشناس ثبت شد.' });
      return;
    }
    try {
      const input = validateLeadInput(req.body);
      const { lead } = db.addLead(input);
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
      res.json({ success: true, message: 'رکورد مشتری با موفقیت حذف شد.' });
    } else {
      res.status(404).json({ success: false, error: 'رکورد مورد نظر یافت نشد.' });
    }
  });

  // ---------------- vCard (used by printed NFC / QR links) ----------------
  app.get('/api/vcard/:id', (req, res) => {
    const profile = db.getProfileBySlugOrId(req.params.id);
    if (!profile) {
      res.status(404).send('Profile not found');
      return;
    }
    let photo: { type: 'JPEG' | 'PNG'; base64: string } | null = null;
    const avatar = profile.avatarUrl || '';
    if (avatar.startsWith('/uploads/')) {
      const ext = path.extname(avatar).toLowerCase();
      const localFile = path.resolve(uploadsDir, avatar.replace(/^\/uploads\//, ''));
      // Only JPEG/PNG are understood by every contacts app; keep the file inside uploads/.
      if ((ext === '.jpg' || ext === '.jpeg' || ext === '.png') && localFile.startsWith(uploadsDir) && fs.existsSync(localFile)) {
        photo = { type: ext === '.png' ? 'PNG' : 'JPEG', base64: fs.readFileSync(localFile).toString('base64') };
      }
    }
    const content = buildVCard(profile, { origin: resolveRequestOrigin(req), photo });
    const fileName = vcardFileName(profile);
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send('﻿' + content);
  });

  // ---------------- Backup ----------------
  app.get('/api/backup', requireAdminAuth, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="roya-db-backup-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.json(db.exportBackup());
  });

  app.post('/api/restore', requireAdminAuth, (req, res) => {
    if (db.importBackup(req.body)) {
      res.json({ success: true, profiles: db.getAllProfiles(), message: 'پشتیبان پایگاه داده با موفقیت بازگردانی شد.' });
    } else {
      res.status(400).json({ success: false, error: 'فایل پشتیبان نامعتبر است.' });
    }
  });

  // ---------------- Uploads ----------------
  app.post('/api/upload-image', uploadLimiter, requireAdminAuth, (req, res) => {
    try {
      const { fileData, type, profileId } = req.body || {};
      if (!fileData || typeof fileData !== 'string') {
        throw new ValidationError('تصویر ارسالی معتبر نیست.');
      }
      const url = persistBase64Image(fileData, type === 'logo' ? 'logo' : 'avatar', String(profileId || 'staff'));
      res.json({ success: true, url, message: 'تصویر با موفقیت روی سرور ذخیره شد.' });
    } catch (err) {
      sendError(res, err, 'خطا در آپلود تصویر');
    }
  });

  app.post('/api/upload-pdf', uploadLimiter, requireAdminAuth, (req, res) => {
    try {
      const { fileName, fileData, replaceDefault } = req.body || {};
      if (!fileData || typeof fileData !== 'string') {
        throw new ValidationError('محتوای فایل PDF ارسال نشده است.');
      }
      const buffer = Buffer.from(fileData.replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (buffer.length === 0) throw new ValidationError('فایل ارسالی خالی است.');
      if (buffer.length > MAX_PDF_BYTES) throw new ValidationError('حجم فایل PDF نباید بیشتر از ۳۰ مگابایت باشد.', 413);
      if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new ValidationError('فایل ارسالی PDF معتبر نیست.');
      }

      const rawName = String(fileName || 'catalog.pdf').trim();
      const sanitized = rawName.replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase().slice(0, 80);
      const finalName = sanitized.endsWith('.pdf') ? sanitized : `${sanitized}.pdf`;
      const savedFileName = `catalog-${Date.now()}-${finalName}`;
      fs.writeFileSync(path.join(uploadsDir, savedFileName), buffer);

      if (replaceDefault) {
        // Kept for older links that point at /roya-catalog.pdf.
        fs.writeFileSync(path.join(uploadsDir, 'roya-catalog.pdf'), buffer);
      }

      res.json({
        success: true,
        url: `/uploads/${savedFileName}`,
        fileName: savedFileName,
        originalName: fileName,
        size: buffer.length,
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
