#!/bin/bash
# ==============================================================================
# آزمایش بازیابی: آخرین فایل پشتیبان را باز می‌کند و بدون دست زدن به سرور اصلی
# چک می‌کند پایگاه داده سالم است و چند کارت دارد. ماهی یک بار اجرا کنید.
#
#   npm run verify-backup                         # آخرین فایل در /var/backups/roya-card
#   npm run verify-backup -- /path/to/file.tar.gz
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/roya-card}"
FILE="${1:-$(ls -1t "$BACKUP_DIR"/roya_backup_*.tar.gz 2>/dev/null | head -n1 || true)}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "فایل پشتیبانی پیدا نشد." >&2
  exit 1
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
tar -xzf "$FILE" -C "$WORK"

node --no-warnings -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[1], { readOnly: true });
const ok = db.prepare("PRAGMA integrity_check").get();
if (Object.values(ok)[0] !== "ok") { console.error("پایگاه داده خراب است:", ok); process.exit(1); }
const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
console.log(`سالم است. کارت: ${count("profiles")}، شعبه: ${count("branches")}، درخواست: ${count("leads")}، رویداد آمار: ${count("events")}`);
' "$WORK/roya.db"

IMAGES=$(find "$WORK/uploads" -type f 2>/dev/null | wc -l)
echo "عکس و فایل: $IMAGES"
echo "فایل بررسی‌شده: $FILE"
