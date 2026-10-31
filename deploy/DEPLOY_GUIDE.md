# راهنمای جامع راه‌اندازی و استقرار سامانه کارت ویزیت هوشمند شرکت رویا طرح داخلی

این راهنما مراحل گام‌به‌گام استقرار سامانه روی سرور اختصاصی لینوکس (Ubuntu / Debian / CentOS) یا سرورهای ابری داخل کشور را توضیح می‌دهد.

---

## ۱. پیش‌نیازهای سرور
- سیستم‌عامل: **Ubuntu 22.04 LTS** یا **24.04 LTS**
- رم: حداقل **1GB** (پیشنهادی: 2GB)
- پردازنده: ۱ هسته
- فضای دیسک: ۱۰ گیگابایت SSD
- وب‌سرور: **Nginx**
- محیط اجرایی: **Node.js 22.13 یا بالاتر** (پایگاه داده SQLite داخلی Node از این نسخه به بعد است)

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
nano .env   # ADMIN_PASSWORD (حداقل ۱۰ کاراکتر) و SESSION_SECRET را پر کنید

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
- اگر رمز را فراموش کردید، روی سرور (بعد از `npm run build`) اجرا کنید: `npm run admin:password -- "رمز-جدید"`
- اگر هنگام اولین اجرا `ADMIN_PASSWORD` تعیین نشده باشد، یک رمز موقت تصادفی در لاگ سرور چاپ می‌شود.
- پایگاه داده در `data/roya.db` (SQLite) و فایل‌های آپلودشده در `public/uploads/` نگه‌داری می‌شوند. هیچ‌کدام در گیت ذخیره نمی‌شوند.
- رمز مدیر حداقل ۱۰ کاراکتر است. ورود با کوکی امن انجام می‌شود و هر دستگاه تا ۳۰ روز وارد می‌ماند. پنل مدیریت در نشانی `/admin` است.
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

---

## ۹. پشتیبان‌گیری و آزمایش بازیابی
- خود برنامه هر روز یک نسخه از پایگاه داده در `data/backups` می‌سازد و ۱۴ نسخه آخر را نگه می‌دارد. با `BACKUP_DIR` در `.env` می‌توانید این پوشه را روی دیسک دیگری بگذارید.
- برای نگهداری بیرون از سرور، `deploy/backup-cron.sh` را در crontab بگذارید و مقصد را با `BACKUP_REMOTE` بدهید (rclone یا rsync):
```bash
sudo crontab -e
# هر شب ساعت ۳:
0 3 * * * BACKUP_REMOTE=arvan:roya-backups /var/www/roya-card/deploy/backup-cron.sh >> /var/log/roya-backup.log 2>&1
```
- ماهی یک بار بازیابی را آزمایش کنید (به سرور اصلی دست نمی‌زند): `npm run verify-backup`
- از پنل، بخش «سیستم»، هم می‌توانید فایل پشتیبان را دانلود کنید. بازیابی از فایل قبل از جایگزینی، تفاوت‌ها را نشان می‌دهد و یک نسخه از اطلاعات فعلی را خودکار نگه می‌دارد.

## ۱۰. به‌روزرسانی به نسخه 3.0.0 (پایگاه داده SQLite)
1. **قبل از هر کار** از `data/database.json` و `public/uploads` یک کپی بگیرید.
2. Node.js را به 22.13 یا بالاتر برسانید: `node -v`
3. کد را به‌روز کنید و بسازید:
```bash
cd /var/www/roya-card
cp data/database.json ~/roya-db-before-v3-$(date +%F).json
git pull
npm ci && npm run build
pm2 restart roya-smart-card   # یا: sudo systemctl restart roya-card
```
4. در اولین اجرا، `data/database.json` خودکار به `data/roya.db` منتقل می‌شود و فایل قدیمی با نام `database.json.imported-تاریخ` کنار آن می‌ماند. در لاگ سرور پیام `Imported N cards` را ببینید.
5. اطلاعات مشترک (نام شرکت، وب‌سایت، اینستاگرام، کاتالوگ) از روی کارت‌ها استخراج می‌شود و در بخش «شرکت» پنل قرار می‌گیرد؛ آدرس‌ها به «شعبه‌ها» می‌روند. یک بار هر دو بخش را نگاه کنید.
6. همه مدیرها یک بار باید دوباره وارد شوند (ورود حالا با کوکی است). اگر رمز فعلی کمتر از ۱۰ کاراکتر است، همچنان کار می‌کند، اما رمز جدید باید ۱۰ کاراکتر یا بیشتر باشد.
7. پنل مدیریت از این نسخه در `/admin` است (`/?admin=1` هم به آن‌جا می‌رود).
