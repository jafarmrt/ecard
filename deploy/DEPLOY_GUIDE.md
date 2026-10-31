# راهنمای جامع راه‌اندازی و استقرار سامانه کارت ویزیت هوشمند شرکت رویا طرح داخلی

این راهنما مراحل گام‌به‌گام استقرار سامانه روی سرور اختصاصی لینوکس (Ubuntu / Debian / CentOS) یا سرورهای ابری داخل کشور را توضیح می‌دهد.

---

## ۱. پیش‌نیازهای سرور
- سیستم‌عامل: **Ubuntu 22.04 LTS** یا **24.04 LTS**
- رم: حداقل **1GB** (پیشنهادی: 2GB)
- پردازنده: ۱ هسته
- فضای دیسک: ۱۰ گیگابایت SSD
- وب‌سرور: **Nginx**
- محیط اجرایی: **Node.js 20 LTS** یا **22 LTS**

---

## ۲. نصب Node.js و ابزارهای لازم
دستورات زیر را در ترمینال سرور اجرا نمایید:

```bash
# به‌روزرسانی مخازن لینوکس
sudo apt update && sudo apt upgrade -y

# نصب Node.js 22 LTS از NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx git certbot python3-certbot-nginx

# نصب ابزار مدیریت پروسه PM2
sudo npm install -g pm2
```

---

## ۳. انتقال کدها و بیلد پروژه
```bash
# ایجاد پوشه پروژه در وب‌سرور
sudo mkdir -p /var/www/roya-card
sudo chown -R $USER:$USER /var/www/roya-card

# کپی فایل‌های پروژه به مسیر /var/www/roya-card (یا کلون از گیت‌هاب)
cd /var/www/roya-card

# تنظیم رمز مدیر و کلید نشست (فقط بار اول)
cp .env.example .env
nano .env   # ADMIN_PASSWORD (حداقل ۸ کاراکتر) و SESSION_SECRET را پر کنید

# نصب پکیج‌ها و بیلد فرانت‌اند و بک‌اند
npm ci
npm run build
```

برای ساخت SESSION_SECRET تصادفی:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## ۴. اجرای سرویس با PM2 (روش پیشنهادی ۱)
```bash
# راه‌اندازی سرویس
pm2 start deploy/ecosystem.config.cjs

# ذخیره وضعیت برای راه‌اندازی خودکار پس از ریبوت سرور
pm2 save
pm2 startup
```

### یا اجرا با Systemd Service (روش پیشنهادی ۲):
```bash
sudo cp deploy/roya-card.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now roya-card
```

---

## ۵. تنظیم وب‌سرور Nginx و فعال‌سازی SSL (HTTPS رایگان)
```bash
# کپی کانفیگ Nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/roya-card.conf

# فعال‌سازی کانفیگ
sudo ln -s /etc/nginx/sites-available/roya-card.conf /etc/nginx/sites-enabled/

# تست صحت تنظیمات Nginx
sudo nginx -t

# دریافت گواهی‌نامه SSL رایگان با Certbot
sudo certbot --nginx -d card.royainterior.com

# راه‌اندازی مجدد Nginx
sudo systemctl restart nginx
```

---

## ۶. اجرای سریع با Docker (اختیاری)
اگر ترجیح می‌دهید سامانه را از طریق داکر اجرا کنید:
```bash
cd /var/www/roya-card/deploy
docker compose up -d --build
```

---

## ۷. رمز عبور مدیریت و تنظیمات امنیتی
- رمز پیش‌فرض وجود ندارد. رمز مدیر را در فایل `.env` با `ADMIN_PASSWORD` تعیین کنید یا بعد از ورود از پنل مدیریت عوض کنید.
- رمزهای قدیمی و عمومی `roya1403`، `admin123` و `roya2026` دیگر پذیرفته نمی‌شوند، حتی اگر در دیتابیس قدیمی ذخیره شده باشند.
- اگر رمز را فراموش کردید، روی سرور اجرا کنید: `npm run admin:password -- "رمز-جدید"`
- اگر هنگام اولین اجرا `ADMIN_PASSWORD` تعیین نشده باشد، یک رمز موقت تصادفی در لاگ سرور چاپ می‌شود.
- دیتابیس در `data/database.json` و فایل‌های آپلودشده در `public/uploads/` نگه‌داری می‌شوند. هیچ‌کدام در گیت ذخیره نمی‌شوند؛ از آن‌ها بکاپ بگیرید (`deploy/backup-cron.sh`).
- فایل بکاپی که از پنل گرفته می‌شود دیگر رمز یا کلید نشست ندارد.

## ۸. به‌روزرسانی سروری که نسخه قبلی روی آن نصب است
از نسخه 2.3.0 فایل `data/database.json` از گیت حذف شده تا داده واقعی و کلیدها در مخزن نباشند. یک بار به این ترتیب به‌روزرسانی کنید تا داده‌ها حفظ شوند:
```bash
cd /var/www/roya-card
cp data/database.json ~/roya-db-backup-$(date +%F).json   # بکاپ
git checkout -- data/database.json                         # تا git pull خطا ندهد
git pull
cp ~/roya-db-backup-$(date +%F).json data/database.json    # برگرداندن داده واقعی

cp .env.example .env && nano .env   # ADMIN_PASSWORD و SESSION_SECRET
npm ci && npm run build
pm2 restart roya-smart-card   # یا: sudo systemctl restart roya-card
```
- بعد از این به‌روزرسانی همه مدیرها یک بار از پنل خارج می‌شوند و باید دوباره وارد شوند.
- در Docker هم فایل `.env` را کنار `package.json` بسازید؛ `docker-compose.yml` آن را می‌خواند.
