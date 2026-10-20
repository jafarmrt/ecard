#!/bin/bash
# ==============================================================================
# اسکریپت خودکار بک‌آپ‌گیری روزانه از پایگاه داده و تصاویر سامانه کارت ویزیت رویا
# ==============================================================================

BACKUP_DIR="/var/backups/roya-card"
APP_DIR="/var/www/roya-card"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="roya_backup_${TIMESTAMP}.tar.gz"

# ایجاد پوشه بک‌آپ در صورت عدم وجود
mkdir -p "$BACKUP_DIR"

echo "[$(date)] شروع تهیه نسخه پشتیبان..."

# فشرده‌سازی فایل دیتابیس و پوشه آپلودها
tar -czf "${BACKUP_DIR}/${FILENAME}" \
  -C "$APP_DIR" data/database.json public/uploads

if [ $? -eq 0 ]; then
  echo "[$(date)] بک‌آپ با موفقیت در مسیر زیر ایجاد شد:"
  echo "${BACKUP_DIR}/${FILENAME}"
else
  echo "[$(date)] خطا در تهیه نسخه پشتیبان!"
  exit 1
fi

# نگهداری بک‌آپ‌های ۳۰ روز اخیر و پاکسازی فایل‌های قدیمی‌تر
find "$BACKUP_DIR" -type f -name "roya_backup_*.tar.gz" -mtime +30 -delete
echo "[$(date)] عملیات پاکسازی نسخه‌های قدیمی‌تر از ۳۰ روز انجام شد."
