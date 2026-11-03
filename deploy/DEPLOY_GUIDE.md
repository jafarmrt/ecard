# راهنمای نصب سامانه کارت ویزیت رویا روی سرور اوبونتو

نصب و به‌روزرسانی با یک اسکریپت انجام می‌شود (`deploy/install.sh`). Docker، PM2 یا تنظیم دستی لازم نیست.
برای تست روی کامپیوتر شخصی، [LOCAL_TEST.md](LOCAL_TEST.md) را ببینید.

## پیش‌نیازها
- Ubuntu 22.04 یا 24.04 (سرور یا دسکتاپ)، حداقل ۱ گیگ رم و ۵ گیگ فضای خالی
- دسترسی sudo
- دسترسی سرور به `github.com`، `nodejs.org` و `registry.npmjs.org` (اگر یکی بسته بود، بخش «سرور بدون اینترنت آزاد» را ببینید)

Node.js 22، کاربر سیستمی و سرویس systemd را خود اسکریپت نصب و تنظیم می‌کند.

## نصب (بار اول)

```bash
git clone https://github.com/jafarmrt/ecard.git
sudo bash ecard/deploy/install.sh
```

در پایان، آدرس برنامه و رمز پنل مدیریت چاپ می‌شود، مثلاً:

```
نصب کامل شد.
  آدرس:        http://192.168.1.20:3000
  پنل مدیریت:  http://192.168.1.20:3000/admin
  رمز پنل:     xxxxxxxxxxxxxx
```

پوشه `ecard` که کلون کردید بعد از نصب لازم نیست و می‌توانید پاکش کنید.

## به‌روزرسانی (هر بار که نسخه جدید آمد)

```bash
sudo roya-card update
```

این دستور به ترتیب: نسخه جدید را از گیت‌هاب می‌گیرد، از پایگاه داده و عکس‌ها پشتیبان می‌گیرد، بیلد می‌کند و برنامه را دوباره راه می‌اندازد.
اگر نسخه جدید بالا نیاید، **خودکار به نسخه قبلی و داده قبلی برمی‌گردد**.

## دستورهای روزمره

| دستور | کار |
|---|---|
| `sudo roya-card status` | وضعیت سرویس، نسخه نصب‌شده و سلامت |
| `sudo roya-card logs` | لاگ زنده (خروج با Ctrl+C) |
| `sudo roya-card restart` | راه‌اندازی مجدد |
| `sudo roya-card backup` | پشتیبان فوری |
| `sudo roya-card password` | تعیین رمز جدید پنل (اگر فراموش شد) |
| `sudo roya-card import /مسیر/نسخه/قدیم` | انتقال داده و عکس‌های نسخه قبلی |

## محل فایل‌ها

| چه چیزی | کجا |
|---|---|
| کد برنامه | `/opt/roya-card` |
| پایگاه داده (SQLite) | `/var/lib/roya-card/data/roya.db` |
| عکس‌ها و کاتالوگ آپلودی | `/var/lib/roya-card/uploads` |
| تنظیمات (رمز، پورت، آدرس سایت) | `/etc/roya-card.env` |
| پشتیبان‌های اسکریپت (۳۰ نسخه آخر) | `/var/backups/roya-card` |

داده‌ها جدا از کد هستند، پس به‌روزرسانی هیچ‌وقت به آن‌ها دست نمی‌زند.
پس از تغییر `/etc/roya-card.env` دستور `sudo roya-card restart` را بزنید.

## انتقال داده از نسخه قدیمی

اگر نسخه قبلی برنامه روی همین سرور (مثلاً `/var/www/roya-card`) یا یک کپی از آن دارید:

```bash
sudo roya-card import /var/www/roya-card
```

`data/roya.db` یا `data/database.json` و پوشه `public/uploads` از آن‌جا برداشته می‌شوند. قبل از جایگزینی از داده فعلی پشتیبان گرفته می‌شود.
اگر نسخه قدیم با PM2 یا سرویس دیگری روی پورت ۳۰۰۰ اجراست، اول آن را خاموش کنید (`pm2 delete all` یا `sudo systemctl disable --now roya-card` قدیمی).

## دامنه و HTTPS (روی سرور اصلی)

برنامه روی پورت ۳۰۰۰ اجرا می‌شود. برای دامنه و SSL، Nginx را جلوی آن بگذارید:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp /opt/roya-card/deploy/nginx.conf /etc/nginx/sites-available/roya-card.conf
sudo nano /etc/nginx/sites-available/roya-card.conf     # نام دامنه را اصلاح کنید
sudo ln -s /etc/nginx/sites-available/roya-card.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d card.royaco.com
```

سپس در `/etc/roya-card.env` خط `PUBLIC_ORIGIN=https://card.royaco.com` را فعال کنید و `sudo roya-card restart` بزنید.

## سرور بدون اینترنت آزاد

- **Node.js یا npm در دسترس نیست:** آینه داخلی بدهید:
  ```bash
  sudo env NODE_MIRROR=https://آینه/nodejs/dist NPM_REGISTRY=https://آینه/npm/ bash ecard/deploy/install.sh
  ```
  این تنظیمات ذخیره می‌شوند و `update` هم از همان آینه‌ها استفاده می‌کند.
- **گیت‌هاب در دسترس نیست:** پوشه `ecard` را از جای دیگری روی سرور کپی کنید و همان `sudo bash ecard/deploy/install.sh` را بزنید؛ کد از همان پوشه نصب می‌شود.

## امنیت و رمز
- رمز پیش‌فرض وجود ندارد. رمز اولیه هنگام نصب ساخته و چاپ می‌شود؛ بعد از ورود، از پنل عوضش کنید.
- رمزهای قدیمی و عمومی `roya1403`، `admin123` و `roya2026` پذیرفته نمی‌شوند.
- رمز مدیر حداقل ۱۰ کاراکتر است. پنل مدیریت در `/admin` است.
- برنامه با کاربر محدود `roya` اجرا می‌شود، نه root.

## پشتیبان‌گیری
- خود برنامه هر روز یک نسخه از پایگاه داده در `/var/lib/roya-card/data/backups` می‌سازد.
- `roya-card update` و `roya-card import` قبل از هر تغییر پشتیبان می‌گیرند (`/var/backups/roya-card`).
- برای نگهداری بیرون از سرور، `deploy/backup-cron.sh` را در crontab بگذارید:
  ```bash
  sudo crontab -e
  0 3 * * * APP_DIR=/opt/roya-card DATA_DIR=/var/lib/roya-card/data UPLOADS_DIR=/var/lib/roya-card/uploads BACKUP_REMOTE=backup@10.0.0.5:/backups/roya /opt/roya-card/deploy/backup-cron.sh >> /var/log/roya-backup.log 2>&1
  ```
- از پنل، بخش «سیستم»، هم می‌توانید فایل پشتیبان را دانلود و بازیابی کنید.

## Docker (اختیاری)
`deploy/Dockerfile` و `deploy/docker-compose.yml` هم هستند، اما Docker Hub از ایران معمولاً در دسترس نیست؛ برای سرور داخلی روش بالا ساده‌تر است.
