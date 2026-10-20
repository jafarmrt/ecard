import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import { db } from './src/server/db.ts';
import { EmployeeProfile } from './src/types.ts';

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

  // Rate Limiter for PDF Uploads (Spam protection)
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
      version: '2.1.0',
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
        res.json({ success: true, message: 'رویداد آماری با موفقیت ثبت شد.', analytics: result.analytics });
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

  // Direct VCF Contact Download (Public)
  app.get('/api/vcard/:id', (req, res) => {
    const { id } = req.params;
    const profile = db.getProfileBySlugOrId(id);
    if (!profile) {
      res.status(404).send('Profile not found');
      return;
    }

    const cleanMobile = profile.mobile.replace(/\s+/g, '');
    const cleanLandline = profile.landline.replace(/\s+/g, '');
    const lat = profile.mapLocation?.lat ?? 35.7757770;
    const lng = profile.mapLocation?.lng ?? 51.4368051;

    const vCardContent = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN;CHARSET=UTF-8:${profile.name}`,
      `N;CHARSET=UTF-8:${profile.name};;;;`,
      `ORG;CHARSET=UTF-8:${profile.company};${profile.department || 'فروش'}`,
      `TITLE;CHARSET=UTF-8:${profile.title}`,
      `TEL;TYPE=CELL,VOICE:${cleanMobile}`,
      cleanLandline ? `TEL;TYPE=WORK,VOICE:${cleanLandline}` : '',
      `EMAIL;TYPE=WORK,INTERNET:${profile.email}`,
      `URL;TYPE=WORK:${profile.websiteUrl || 'https://www.royaco.com'}`,
      `ADR;TYPE=WORK;CHARSET=UTF-8:;;${profile.address};;;;`,
      `GEO:${lat};${lng}`,
      `NOTE;CHARSET=UTF-8:${profile.companyEn} - ${profile.slogan || 'طراحی و اجرای دکوراسیون داخلی'}`,
      'END:VCARD',
    ]
      .filter(Boolean)
      .join('\r\n');

    const fileName = `contact-${profile.name.replace(/\s+/g, '_')}.vcf`;
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
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
      res.json({ success: true, message: 'پشتیبان پایگاه داده با موفقیت بازگردانی شد.' });
    } else {
      res.status(400).json({ success: false, error: 'فایل پشتیبان نامعتبر است.' });
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
  // Vite Integration & Static Frontend
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
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
