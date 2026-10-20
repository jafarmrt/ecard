import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import { db, persistBase64ImageIfNeeded } from './src/server/db.ts';
import { EmployeeProfile } from './src/types.ts';

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveRequestOrigin(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'card.royaco.com';
  return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;
}

function findProfileForRequest(req: Request): EmployeeProfile | undefined {
  const queryId = (req.query.id || req.query.card || req.query.profile) as string | undefined;
  const cleanPath = req.path.replace(/^\/+|\/+$/g, '');

  let identifier = queryId;
  if (!identifier && cleanPath) {
    if (cleanPath.startsWith('card/')) {
      identifier = cleanPath.replace(/^card\//, '').trim();
    } else if (
      !cleanPath.includes('.') &&
      !cleanPath.startsWith('api') &&
      !cleanPath.startsWith('uploads') &&
      !cleanPath.startsWith('src') &&
      !cleanPath.startsWith('@')
    ) {
      identifier = cleanPath.trim();
    }
  }

  if (!identifier) return undefined;
  return db.getProfileBySlugOrId(identifier);
}

function injectDynamicOpenGraph(html: string, req: Request): string {
  const profile = findProfileForRequest(req);
  if (!profile) return html;

  const origin = resolveRequestOrigin(req);
  const company = profile.company || 'شرکت رویا طرح داخلی';
  const title = `${profile.name} | ${profile.title} - ${company}`;
  const description = `کارت ویزیت هوشمند ${profile.name} (${profile.title} در ${company}) | تماس مستقیم: ${profile.mobile} | مشاهده اطلاعات تماس، کاتالوگ PDF، مسیریابی و ذخیره در مخاطبین`;
  const cardUrl = `${origin}/${profile.slug || profile.id}`;

  let ogImage = `${origin}/pwa-512x512.png`;
  if (profile.avatarUrl) {
    if (profile.avatarUrl.startsWith('http')) {
      ogImage = profile.avatarUrl;
    } else if (profile.avatarUrl.startsWith('/')) {
      ogImage = `${origin}${profile.avatarUrl}`;
    }
  }

  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeImage = escapeHtml(ogImage);
  const safeUrl = escapeHtml(cardUrl);

  let updated = html
    .replace(/<title>.*?<\/title>/is, `<title>${safeTitle}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${safeDesc}" />`
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:title" content="${safeTitle}" />`
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" content="${safeDesc}" />`
    );

  const extraMeta = [
    `<meta property="og:url" content="${safeUrl}" />`,
    `<meta property="og:image" content="${safeImage}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
    `<meta name="twitter:image" content="${safeImage}" />`,
  ].join('\n    ');

  updated = updated.replace('</head>', `    ${extraMeta}\n  </head>`);
  return updated;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enable trust proxy for Cloud Run and reverse proxy environments
  app.set('trust proxy', 1);

  // JSON and URL-encoded body parsers with generous limits for photos/logos/PDFs
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // ==========================================
  // Rate Limiters for Security & Protection
  // ==========================================
  
  // Rate Limiter for Admin Login (Brute-force protection)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 login requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, default: false },
    message: {
      success: false,
      error: 'تعداد تلاش‌های ناموفق بیش از حد مجاز است. لطفاً ۱۵ دقیقه دیگر مجدداً تلاش فرمایید.',
    },
  });

  // Rate Limiter for PDF & Image Uploads (Spam protection)
  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // Limit each IP to 30 uploads per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, default: false },
    message: {
      success: false,
      error: 'تعداد آپلودها بیش از حد مجاز است. لطفاً چند دقیقه بعد مجدداً اقدام فرمایید.',
    },
  });

  // Rate Limiter for Analytics
  const analyticsLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120, // 120 events per minute
    standardHeaders: false,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, default: false },
  });

  // Create uploads directory if needed
  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Serve static uploads directory
  app.use('/uploads', express.static(uploadsDir));
  app.use('/roya-catalog.pdf', (req, res, next) => {
    const defaultCatalogPath = path.resolve(process.cwd(), 'public', 'roya-catalog.pdf');
    if (fs.existsSync(defaultCatalogPath)) {
      res.sendFile(defaultCatalogPath);
    } else {
      next();
    }
  });

  // Authentication Middleware for Protected Routes
  const requireAdminAuth = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token || !db.validateToken(token)) {
      res.status(401).json({
        success: false,
        error: 'دسترسی غیرمجاز. لطفا ابتدا وارد پنل مدیریت شوید.',
      });
      return;
    }
    next();
  };

  // ==========================================
  // API Routes
  // ==========================================

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Roya Smart Business Card Backend',
      version: '2.2.0',
      database: 'Self-Hosted JSON File Store',
      rateLimiting: 'Active',
      analytics: 'Active',
      timestamp: new Date().toISOString(),
    });
  });

  // Auth: Admin Login (Protected by authLimiter)
  app.post('/api/auth/login', authLimiter, (req, res) => {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ success: false, error: 'رمز عبور الزامی است.' });
      return;
    }

    if (db.verifyPassword(password)) {
      const token = db.createSession();
      res.json({
        success: true,
        token,
        message: 'ورود به پنل مدیریت با موفقیت انجام شد.',
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'رمز عبور مدیریت اشتباه است.',
      });
    }
  });

  // Auth: Check Token Status
  app.post('/api/auth/check', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const isValid = token ? db.validateToken(token) : false;
    res.json({ valid: isValid });
  });

  // Auth: Logout
  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (token) {
      db.destroySession(token);
    }
    res.json({ success: true, message: 'خروج با موفقیت انجام شد.' });
  });

  // Auth: Change Admin Password (Protected)
  app.post('/api/auth/change-password', requireAdminAuth, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const result = db.changePassword(oldPassword, newPassword);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  // Profiles: Get All Profiles (Public)
  app.get('/api/profiles', (req, res) => {
    try {
      const profiles = db.getAllProfiles();
      res.json({ success: true, count: profiles.length, profiles });
    } catch (err) {
      console.error('Error getting profiles:', err);
      res.status(500).json({ success: false, error: 'خطا در دریافت لیست پرسنل از پایگاه داده' });
    }
  });

  // Profiles: Get Single Profile by ID or Custom Slug (Public)
  app.get('/api/profiles/:id', (req, res) => {
    const { id } = req.params;
    const profile = db.getProfileBySlugOrId(id);
    if (!profile) {
      res.status(404).json({ success: false, error: 'پروفایل کارمند یافت نشد.' });
      return;
    }
    res.json({ success: true, profile });
  });

  // Analytics: Record User Interaction Event (Public with Rate Limiting)
  app.post('/api/analytics/:id/event', analyticsLimiter, (req, res) => {
    try {
      const { id } = req.params;
      const { event } = req.body;
      const validEvents = ['view', 'nfcTap', 'qrScan', 'call', 'whatsapp', 'catalogDownload', 'vcardDownload', 'mapClick'];
      
      if (!event || !validEvents.includes(event)) {
        res.status(400).json({ success: false, error: 'نوع رویداد نامعتبر است.' });
        return;
      }

      const result = db.recordAnalyticsEvent(id, event);
      if (result.success) {
        res.json({
          success: true,
          message: 'رویداد آماری با موفقیت ثبت شد.',
          profileId: result.profileId,
          analytics: result.analytics,
        });
      } else {
        res.status(404).json({ success: false, error: 'پروفایل مورد نظر برای ثبت آمار یافت نشد.' });
      }
    } catch (err) {
      console.error('Error logging analytics event:', err);
      res.status(500).json({ success: false, error: 'خطا در ثبت رویداد آماری' });
    }
  });

  // Analytics: Get Aggregated Summary (Protected)
  app.get('/api/analytics/summary', requireAdminAuth, (req, res) => {
    try {
      const profiles = db.getAllProfiles();
      const leads = db.getAllLeads();
      let totalViews = 0;
      let totalNfcTaps = 0;
      let totalQrScans = 0;
      let totalCalls = 0;
      let totalWhatsapps = 0;
      let totalCatalogDownloads = 0;
      let totalVcardDownloads = 0;
      let totalMapClicks = 0;

      profiles.forEach((p) => {
        if (p.analytics) {
          totalViews += p.analytics.views || 0;
          totalNfcTaps += p.analytics.nfcTaps || 0;
          totalQrScans += p.analytics.qrScans || 0;
          totalCalls += p.analytics.callClicks || 0;
          totalWhatsapps += p.analytics.whatsappClicks || 0;
          totalCatalogDownloads += p.analytics.catalogDownloads || 0;
          totalVcardDownloads += p.analytics.vcardDownloads || 0;
          totalMapClicks += p.analytics.mapClicks || 0;
        }
      });

      res.json({
        success: true,
        summary: {
          totalProfiles: profiles.length,
          totalLeads: leads.length,
          totalViews,
          totalNfcTaps,
          totalQrScans,
          totalCalls,
          totalWhatsapps,
          totalCatalogDownloads,
          totalVcardDownloads,
          totalMapClicks,
          totalInteractions: totalCalls + totalWhatsapps + totalCatalogDownloads + totalVcardDownloads + totalMapClicks,
        },
      });
    } catch (err) {
      console.error('Error calculating analytics summary:', err);
      res.status(500).json({ success: false, error: 'خطا در محاسبه آمار کلی' });
    }
  });

  // Customer Leads: Submit Contact Lead from Digital Card (Public with Rate Limiting)
  app.post('/api/leads', analyticsLimiter, (req, res) => {
    try {
      const { profileId, customerName, customerMobile, customerCompany, note } = req.body || {};
      if (!customerName || !String(customerName).trim() || !customerMobile || !String(customerMobile).trim()) {
        res.status(400).json({
          success: false,
          error: 'لطفاً نام و شماره موبایل خود را وارد فرمایید.',
        });
        return;
      }

      const result = db.addLead({
        profileId: String(profileId || ''),
        customerName: String(customerName),
        customerMobile: String(customerMobile),
        customerCompany: customerCompany ? String(customerCompany) : undefined,
        note: note ? String(note) : undefined,
      });

      res.status(201).json({
        success: true,
        lead: result.lead,
        analytics: result.profileAnalytics,
        message: 'اطلاعات تماس شما با موفقیت برای کارشناس ثبت شد.',
      });
    } catch (err) {
      console.error('Error saving customer lead:', err);
      res.status(500).json({ success: false, error: 'خطا در ثبت اطلاعات تماس' });
    }
  });

  // Customer Leads: Get All Leads (Protected)
  app.get('/api/leads', requireAdminAuth, (req, res) => {
    try {
      const leads = db.getAllLeads();
      res.json({ success: true, count: leads.length, leads });
    } catch (err) {
      console.error('Error getting leads:', err);
      res.status(500).json({ success: false, error: 'خطا در دریافت لیست مشتریان' });
    }
  });

  // Customer Leads: Delete Lead (Protected)
  app.delete('/api/leads/:id', requireAdminAuth, (req, res) => {
    try {
      const { id } = req.params;
      const deleted = db.deleteLead(id);
      if (deleted) {
        res.json({ success: true, message: 'رکورد مشتری با موفقیت حذف شد.' });
      } else {
        res.status(404).json({ success: false, error: 'رکورد مورد نظر یافت نشد.' });
      }
    } catch (err) {
      console.error('Error deleting lead:', err);
      res.status(500).json({ success: false, error: 'خطا در حذف رکورد مشتری' });
    }
  });

  // Profiles: Create New Profile (Protected)
  app.post('/api/profiles', requireAdminAuth, (req, res) => {
    try {
      const profileData: EmployeeProfile = req.body;
      if (!profileData.id || !profileData.name) {
        res.status(400).json({ success: false, error: 'شناسه و نام کارمند الزامی است.' });
        return;
      }
      const saved = db.saveProfile(profileData);
      res.status(201).json({ success: true, profile: saved, message: 'کارمند جدید با موفقیت در دیتابیس ثبت شد.' });
    } catch (err) {
      console.error('Error creating profile:', err);
      res.status(500).json({ success: false, error: 'خطا در ثبت اطلاعات در دیتابیس' });
    }
  });

  // Profiles: Atomic Bulk Brand & Organization Update (Protected)
  app.put('/api/profiles/bulk-brand', requireAdminAuth, (req, res) => {
    try {
      const updatedProfiles = db.updateBrandForAll(req.body || {});
      res.json({
        success: true,
        profiles: updatedProfiles,
        message: 'اطلاعات برند، کاتالوگ PDF و جهت چیدمان به صورت یکپارچه برای تمام پرسنل ذخیره شد.',
      });
    } catch (err) {
      console.error('Error in bulk brand update:', err);
      res.status(500).json({ success: false, error: 'خطا در بروزرسانی گروهی اطلاعات برند' });
    }
  });

  // Profiles: Update Profile (Protected)
  app.put('/api/profiles/:id', requireAdminAuth, (req, res) => {
    try {
      const { id } = req.params;
      const profileData: EmployeeProfile = { ...req.body, id };
      const saved = db.saveProfile(profileData);
      res.json({ success: true, profile: saved, message: 'تغییرات با موفقیت در دیتابیس ذخیره شد.' });
    } catch (err) {
      console.error('Error updating profile:', err);
      res.status(500).json({ success: false, error: 'خطا در ویرایش اطلاعات در دیتابیس' });
    }
  });

  // Profiles: Delete Profile (Protected)
  app.delete('/api/profiles/:id', requireAdminAuth, (req, res) => {
    try {
      const { id } = req.params;
      const deleted = db.deleteProfile(id);
      if (deleted) {
        res.json({ success: true, message: 'پروفایل با موفقیت حذف گردید.' });
      } else {
        res.status(404).json({ success: false, error: 'پروفایل مورد نظر یافت نشد.' });
      }
    } catch (err) {
      console.error('Error deleting profile:', err);
      res.status(500).json({ success: false, error: 'خطا در حذف پروفایل از دیتابیس' });
    }
  });

  // Profiles: Reset to Defaults (Protected)
  app.post('/api/profiles/reset', requireAdminAuth, (req, res) => {
    try {
      const profiles = db.resetProfiles();
      res.json({ success: true, profiles, message: 'پایگاه داده به پروفایل‌های پیش‌فرض رویا بازنشانی شد.' });
    } catch (err) {
      console.error('Error resetting profiles:', err);
      res.status(500).json({ success: false, error: 'خطا در بازنشانی پایگاه داده' });
    }
  });

  // Direct VCF Contact Download with Embedded Photo (Public)
  app.get('/api/vcard/:id', (req, res) => {
    const { id } = req.params;
    const profile = db.getProfileBySlugOrId(id);
    if (!profile) {
      res.status(404).send('Profile not found');
      return;
    }

    const origin = resolveRequestOrigin(req);
    const cardUrl = `${origin}/${profile.slug || profile.id}`;
    const cleanMobile = profile.mobile.replace(/\s+/g, '');
    const cleanLandline = profile.landline.replace(/\s+/g, '');
    const lat = profile.mapLocation?.lat ?? 35.775777;
    const lng = profile.mapLocation?.lng ?? 51.4368051;

    const nameParts = profile.name.trim().split(/\s+/);
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    const firstName = nameParts[0] || '';

    // Resolve avatar photo from disk (/uploads/...) or inline base64
    let photoLine = '';
    if (profile.avatarUrl) {
      if (profile.avatarUrl.startsWith('/uploads/')) {
        const localFile = path.resolve(process.cwd(), 'public', profile.avatarUrl.replace(/^\//, ''));
        if (fs.existsSync(localFile)) {
          try {
            const buf = fs.readFileSync(localFile);
            const ext = path.extname(localFile).toLowerCase();
            const imgType = ext === '.png' ? 'PNG' : 'JPEG';
            photoLine = `PHOTO;ENCODING=b;TYPE=${imgType}:${buf.toString('base64')}`;
          } catch {}
        }
      } else if (profile.avatarUrl.startsWith('data:image/')) {
        const match = profile.avatarUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (match) {
          const imgType = match[1].toUpperCase().includes('PNG') ? 'PNG' : 'JPEG';
          photoLine = `PHOTO;ENCODING=b;TYPE=${imgType}:${match[2].replace(/\s+/g, '')}`;
        }
      }
    }

    const noteLines = [
      `کارت ویزیت دیجیتال هوشمند رویا طرح داخلی (ROYA Surface Center)`,
      profile.slogan ? `شعار سازمانی: ${profile.slogan}` : '',
      profile.bio ? `توضیحات: ${profile.bio}` : '',
      `لینک مستقیم کارت: ${cardUrl}`,
    ]
      .filter(Boolean)
      .join(' \\n ');

    const vCardContent = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N;CHARSET=UTF-8:${lastName};${firstName};;;`,
      `FN;CHARSET=UTF-8:${profile.name}`,
      `ORG;CHARSET=UTF-8:${profile.company || 'شرکت رویا طرح داخلی'};${profile.department || 'فروش'}`,
      `TITLE;CHARSET=UTF-8:${profile.title}`,
      `TEL;TYPE=CELL,VOICE,PREF:${cleanMobile}`,
      cleanLandline ? `TEL;TYPE=WORK,VOICE:${cleanLandline}` : '',
      profile.email ? `EMAIL;TYPE=WORK,INTERNET,PREF:${profile.email}` : '',
      photoLine,
      `URL;TYPE=WORK,PREF:${cardUrl}`,
      `URL;TYPE=WORK:${profile.websiteUrl || 'https://www.royaco.com'}`,
      `ADR;TYPE=WORK,POSTAL;CHARSET=UTF-8:;;${profile.address};تهران;تهران;${profile.postalCode || '1939613111'};ایران`,
      `GEO:${lat};${lng}`,
      profile.instagram ? `X-SOCIALPROFILE;TYPE=instagram:https://instagram.com/${profile.instagram.replace(/^@/, '')}` : '',
      `NOTE;CHARSET=UTF-8:${noteLines}`,
      'PRODID:-//ROYA Surface Center//Smart NFC Digital Card 2026//FA',
      `REV:${new Date().toISOString()}`,
      'END:VCARD',
    ]
      .filter(Boolean)
      .join('\r\n');

    const fileName = `contact-${profile.name.replace(/\s+/g, '_')}.vcf`;
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.send('\uFEFF' + vCardContent);
  });

  // Database Backup Export (Protected)
  app.get('/api/backup', requireAdminAuth, (req, res) => {
    const backup = db.exportBackup();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="roya-db-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(backup);
  });

  // Database Restore (Protected)
  app.post('/api/restore', requireAdminAuth, (req, res) => {
    const backupData = req.body;
    const success = db.importBackup(backupData);
    if (success) {
      const newToken = db.createSession();
      res.json({
        success: true,
        profiles: db.getAllProfiles(),
        token: newToken,
        message: 'پشتیبان پایگاه داده با موفقیت بازگردانی شد.',
      });
    } else {
      res.status(400).json({ success: false, error: 'فایل پشتیبان نامعتبر است.' });
    }
  });

  // Image File Upload (Avatar & Logo - Protected by uploadLimiter and requireAdminAuth)
  app.post('/api/upload-image', uploadLimiter, requireAdminAuth, (req, res) => {
    try {
      const { fileData, type, profileId } = req.body;
      if (!fileData || typeof fileData !== 'string' || !fileData.startsWith('data:image/')) {
        res.status(400).json({ success: false, error: 'تصویر ارسالی معتبر نیست.' });
        return;
      }

      const prefix = type === 'logo' ? 'logo' : 'avatar';
      const savedUrl = persistBase64ImageIfNeeded(fileData, prefix, profileId || 'staff');
      if (!savedUrl || savedUrl.startsWith('data:')) {
        res.status(500).json({ success: false, error: 'خطا در ذخیره فایل تصویر روی دیسک سرور' });
        return;
      }

      res.json({
        success: true,
        url: savedUrl,
        message: 'تصویر با موفقیت روی سرور ذخیره شد.',
      });
    } catch (err: any) {
      console.error('Error uploading image:', err);
      res.status(500).json({ success: false, error: err?.message || 'خطا در آپلود تصویر' });
    }
  });

  // PDF File Upload (Catalog & Documents - Protected by uploadLimiter and requireAdminAuth)
  app.post('/api/upload-pdf', uploadLimiter, requireAdminAuth, (req, res) => {
    try {
      const { fileName, fileData, replaceDefault } = req.body;
      if (!fileData) {
        res.status(400).json({ success: false, error: 'محتوای فایل PDF ارسال نشده است.' });
        return;
      }

      // Extract base64 payload
      const base64Data = fileData.replace(/^data:application\/pdf;base64,/, '').replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      if (buffer.length === 0) {
        res.status(400).json({ success: false, error: 'فایل ارسالی خالی است.' });
        return;
      }

      // Sanitize filename
      const rawName = (fileName || 'catalog.pdf').trim();
      const sanitizedName = rawName.replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase();
      const finalCleanName = sanitizedName.endsWith('.pdf') ? sanitizedName : `${sanitizedName}.pdf`;
      const timestamp = Date.now();
      const savedFileName = `catalog-${timestamp}-${finalCleanName}`;
      const targetPath = path.join(uploadsDir, savedFileName);

      fs.writeFileSync(targetPath, buffer);

      // If requested to replace default system catalog, update public/roya-catalog.pdf as well
      if (replaceDefault) {
        const defaultPath = path.resolve(process.cwd(), 'public', 'roya-catalog.pdf');
        try {
          fs.writeFileSync(defaultPath, buffer);
        } catch (e) {
          console.warn('Could not overwrite default roya-catalog.pdf', e);
        }
      }

      const fileUrl = `/uploads/${savedFileName}`;
      res.json({
        success: true,
        url: fileUrl,
        fileName: savedFileName,
        originalName: fileName,
        size: buffer.length,
        message: 'فایل PDF کاتالوگ با موفقیت بارگذاری شد.',
      });
    } catch (err: any) {
      console.error('Error uploading PDF file:', err);
      res.status(500).json({ success: false, error: err?.message || 'خطا در بارگذاری فایل PDF روی سرور' });
    }
  });

  // ==========================================
  // Vite Integration & Static Frontend with Dynamic OpenGraph SSR
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.get('*', async (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
        return next();
      }
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        const htmlWithOg = injectDynamicOpenGraph(template, req);
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(htmlWithOg);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        const rawHtml = fs.readFileSync(indexPath, 'utf-8');
        const htmlWithOg = injectDynamicOpenGraph(rawHtml, req);
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).send(htmlWithOg);
      } else {
        res.status(404).send('Not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Roya Server] Application and API running on http://0.0.0.0:${PORT}`);
    console.log(`[Roya Server] Database location: ${path.resolve(process.cwd(), 'data', 'database.json')}`);
  });
}

startServer().catch((err) => {
  console.error('[Roya Server] Failed to start server:', err);
});
