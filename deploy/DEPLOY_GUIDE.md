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

# نصب پکیج‌ها و بیلد فرانت‌اند و بک‌اند
npm install
npm run build
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
- **رمز عبور پیش‌فرض مدیریت:** `roya1403`
- جهت تغییر رمز عبور در سرور، می‌توانید در فایل `.env` متغیر `ADMIN_PASSWORD=your_secure_password` را قرار دهید یا مستقیماً از داخل پنل مدیریت سایت اقدام به تغییر نمایید.
- دیتابیس در مسیر `/var/www/roya-card/data/database.json` ذخیره می‌شود و با هر تغییر در پنل کاربری، بلافاصله روی دیسک ماندگار می‌گردد.
