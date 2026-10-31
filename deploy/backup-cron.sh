#!/bin/bash
# ==============================================================================
# پشتیبان روزانه سامانه کارت رویا: پایگاه داده SQLite + عکس‌ها و فایل‌ها
#
# خود برنامه هر روز یک نسخه از پایگاه داده در data/backups می‌سازد. این اسکریپت
# همان نسخه را همراه عکس‌ها در یک فایل فشرده جمع می‌کند و اگر BACKUP_REMOTE
# تنظیم شده باشد، آن را به بیرون از سرور هم می‌فرستد (rclone یا rsync).
#
# نمونه crontab (هر شب ساعت ۳):
#   0 3 * * * /var/www/roya-card/deploy/backup-cron.sh >> /var/log/roya-backup.log 2>&1
#
# متغیرها (اختیاری):
#   APP_DIR        مسیر برنامه                    (پیش‌فرض /var/www/roya-card)
#   BACKUP_DIR     محل نگهداری فایل‌های فشرده      (پیش‌فرض /var/backups/roya-card)
#   BACKUP_REMOTE  مقصد بیرون از سرور، مثلاً
#                  rclone:   arvan:roya-backups
#                  rsync:    backup@10.0.0.5:/backups/roya
#   KEEP_DAYS      چند روز نگه داشته شود            (پیش‌فرض ۳۰)
# ==============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/roya-card}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/roya-card}"
KEEP_DAYS="${KEEP_DAYS:-30}"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
UPLOADS_DIR="${UPLOADS_DIR:-$APP_DIR/public/uploads}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$BACKUP_DIR"
echo "[$(date)] شروع پشتیبان‌گیری..."

# نسخه سازگار از پایگاه داده: اگر sqlite3 نصب است همین حالا یک کپی امن می‌گیریم،
# وگرنه آخرین نسخه‌ای که خود برنامه در data/backups ساخته برداشته می‌شود.
if command -v sqlite3 >/dev/null 2>&1 && [ -f "$DATA_DIR/roya.db" ]; then
  sqlite3 "$DATA_DIR/roya.db" ".backup '$WORK/roya.db'"
else
  LATEST=$(ls -1t "$DATA_DIR"/backups/roya-*.db 2>/dev/null | head -n1 || true)
  if [ -z "$LATEST" ]; then
    echo "[$(date)] خطا: نسخه‌ای از پایگاه داده پیدا نشد (sqlite3 نصب نیست و data/backups خالی است)." >&2
    exit 1
  fi
  cp "$LATEST" "$WORK/roya.db"
fi

mkdir -p "$WORK/uploads"
[ -d "$UPLOADS_DIR" ] && cp -a "$UPLOADS_DIR/." "$WORK/uploads/"

ARCHIVE="$BACKUP_DIR/roya_backup_${TIMESTAMP}.tar.gz"
tar -czf "$ARCHIVE" -C "$WORK" roya.db uploads
echo "[$(date)] فایل پشتیبان: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

# ارسال به بیرون از سرور
if [ -n "${BACKUP_REMOTE:-}" ]; then
  if command -v rclone >/dev/null 2>&1 && [[ "$BACKUP_REMOTE" != *@* ]]; then
    rclone copy "$ARCHIVE" "$BACKUP_REMOTE"
  else
    rsync -az "$ARCHIVE" "$BACKUP_REMOTE/"
  fi
  echo "[$(date)] به $BACKUP_REMOTE فرستاده شد."
else
  echo "[$(date)] هشدار: BACKUP_REMOTE تنظیم نشده؛ پشتیبان فقط روی همین سرور است."
fi

find "$BACKUP_DIR" -type f -name "roya_backup_*.tar.gz" -mtime +"$KEEP_DAYS" -delete
echo "[$(date)] پایان. نسخه‌های قدیمی‌تر از $KEEP_DAYS روز پاک شد."
