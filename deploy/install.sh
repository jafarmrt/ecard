#!/usr/bin/env bash
# ==============================================================================
# نصب و مدیریت سامانه کارت ویزیت رویا روی اوبونتو (بدون Docker)
#
# نصب بار اول (روی سرور یا اوبونتوی داخل WSL/ماشین مجازی):
#   git clone https://github.com/jafarmrt/ecard.git
#   sudo bash ecard/deploy/install.sh
#
# پس از نصب، دستور «roya-card» در دسترس است:
#   sudo roya-card update      دریافت آخرین نسخه، پشتیبان، بیلد و راه‌اندازی مجدد
#   sudo roya-card status      وضعیت سرویس و سلامت برنامه
#   sudo roya-card logs        نمایش لاگ زنده
#   sudo roya-card restart     راه‌اندازی مجدد
#   sudo roya-card backup      پشتیبان فوری از پایگاه داده و عکس‌ها
#   sudo roya-card password    تعیین رمز جدید پنل مدیریت
#   sudo roya-card import DIR  انتقال داده و عکس‌های نسخه قبلی (مثلاً /var/www/roya-card)
#
# تنظیمات اختیاری هنگام نصب (به صورت متغیر محیطی، مثلاً sudo env PORT=8080 bash install.sh):
#   PORT           پورت برنامه                               (پیش‌فرض 3000)
#   BRANCH         شاخه گیت                                   (پیش‌فرض main)
#   NODE_MIRROR    آینه دانلود Node.js                       (پیش‌فرض https://nodejs.org/dist)
#   NPM_REGISTRY   آینه npm، اگر registry.npmjs.org در دسترس نبود
# ==============================================================================
set -euo pipefail
umask 027   # پشتیبان‌ها و تنظیمات فقط برای root و کاربر برنامه خواندنی باشند

APP_NAME="roya-card"
APP_USER="roya"
APP_DIR="/opt/roya-card"
STATE_DIR="/var/lib/roya-card"
DATA_DIR="$STATE_DIR/data"
UPLOADS_DIR="$STATE_DIR/uploads"
BACKUP_ROOT="/var/backups/roya-card"
ENV_FILE="/etc/roya-card.env"
CONF_FILE="/etc/roya-card.conf"
SERVICE_FILE="/etc/systemd/system/roya-card.service"
CLI_PATH="/usr/local/bin/roya-card"
REPO_URL_DEFAULT="https://github.com/jafarmrt/ecard.git"
NODE_MIN="22.13.0"

# تنظیماتی که هنگام نصب انتخاب شده‌اند (برای update هم استفاده می‌شوند)
# shellcheck disable=SC1090
[ -f "$CONF_FILE" ] && . "$CONF_FILE"
PORT="${PORT:-3000}"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-$REPO_URL_DEFAULT}"
NODE_MIRROR="${NODE_MIRROR:-https://nodejs.org/dist}"
NPM_REGISTRY="${NPM_REGISTRY:-}"

green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { red "خطا: $*"; exit 1; }

need_root() { [ "$(id -u)" = "0" ] || die "این دستور را با sudo اجرا کنید."; }

as_app() { runuser -u "$APP_USER" -- env HOME="/home/$APP_USER" PATH="$PATH" "$@"; }

version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }

npm_flags() { [ -n "$NPM_REGISTRY" ] && echo "--registry=$NPM_REGISTRY" || true; }

# ------------------------------------------------------------------------------
ensure_packages() {
  local missing=()
  for p in git curl ca-certificates xz-utils; do
    dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    step "نصب پیش‌نیازها: ${missing[*]}"
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${missing[@]}"
  fi
}

ensure_node() {
  local current=""
  command -v node >/dev/null 2>&1 && current="$(node -v | sed 's/^v//')"
  if [ -n "$current" ] && version_ge "$current" "$NODE_MIN"; then
    green "Node.js $current نصب است."
    return
  fi
  step "نصب Node.js 22 از $NODE_MIRROR"
  local arch
  case "$(uname -m)" in
    x86_64) arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) die "معماری $(uname -m) پشتیبانی نمی‌شود." ;;
  esac
  local tmp sums file
  tmp="$(mktemp -d)"
  sums="$(curl -fsSL "$NODE_MIRROR/latest-v22.x/SHASUMS256.txt")" || die "دسترسی به $NODE_MIRROR ممکن نیست. با NODE_MIRROR یک آینه دیگر بدهید."
  file="$(echo "$sums" | awk '{print $2}' | grep -E "^node-v22\.[0-9]+\.[0-9]+-linux-$arch\.tar\.xz$" | head -n1)"
  [ -n "$file" ] || die "فایل Node.js برای linux-$arch پیدا نشد."
  curl -fSL --progress-bar "$NODE_MIRROR/latest-v22.x/$file" -o "$tmp/$file"
  (cd "$tmp" && echo "$sums" | grep " $file\$" | sha256sum -c - >/dev/null) || die "checksum فایل Node.js درست نیست."
  rm -rf /opt/nodejs && mkdir -p /opt/nodejs
  tar -xJf "$tmp/$file" -C /opt/nodejs --strip-components=1 --no-same-permissions
  chmod -R a+rX /opt/nodejs   # کاربر برنامه باید بتواند node و npm را اجرا کند
  for bin in node npm npx; do ln -sf "/opt/nodejs/bin/$bin" "/usr/local/bin/$bin"; done
  rm -rf "$tmp"
  hash -r
  green "Node.js $(node -v) نصب شد."
}

ensure_user_and_dirs() {
  id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/home/$APP_USER" --shell /usr/sbin/nologin "$APP_USER"
  mkdir -p "$APP_DIR" "$DATA_DIR" "$UPLOADS_DIR" "$BACKUP_ROOT"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$STATE_DIR"
  chmod 750 "$STATE_DIR" "$DATA_DIR" "$UPLOADS_DIR"
}

write_conf() {
  cat > "$CONF_FILE" <<EOF
# تنظیمات نصب سامانه کارت رویا (توسط install.sh ساخته شده)
PORT="$PORT"
BRANCH="$BRANCH"
REPO_URL="$REPO_URL"
NODE_MIRROR="$NODE_MIRROR"
NPM_REGISTRY="$NPM_REGISTRY"
EOF
}

write_env_if_missing() {
  if [ -f "$ENV_FILE" ]; then
    # پورت ممکن است عوض شده باشد
    if grep -q '^PORT=' "$ENV_FILE"; then sed -i "s/^PORT=.*/PORT=$PORT/" "$ENV_FILE"; else echo "PORT=$PORT" >> "$ENV_FILE"; fi
    return
  fi
  step "ساخت فایل تنظیمات $ENV_FILE"
  ADMIN_PASSWORD_GENERATED="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 14)"
  local secret
  secret="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  cat > "$ENV_FILE" <<EOF
# تنظیمات سامانه کارت رویا. پس از تغییر:  sudo roya-card restart
NODE_ENV=production
PORT=$PORT
DATA_DIR=$DATA_DIR
UPLOADS_DIR=$UPLOADS_DIR

# رمز اولیه پنل مدیریت (بعداً از داخل پنل یا با «sudo roya-card password» عوضش کنید)
ADMIN_PASSWORD=$ADMIN_PASSWORD_GENERATED
SESSION_SECRET=$secret

# آدرس عمومی سایت برای لینک‌های vCard و پیش‌نمایش. برای تست خالی بماند.
# PUBLIC_ORIGIN=https://card.royaco.com
EOF
  chown root:"$APP_USER" "$ENV_FILE"
  chmod 640 "$ENV_FILE"
}

write_service() {
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Roya digital business card
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) dist/server.cjs
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$APP_NAME" >/dev/null 2>&1
}

install_cli() {
  install -m 755 "$APP_DIR/deploy/install.sh" "$CLI_PATH"
}

fetch_code() {
  # کد از مخزن گیت. اگر از داخل یک کلون اجرا شده باشد و پوشه نصب خالی باشد، همان کلون کپی می‌شود
  # (برای سروری که به گیت‌هاب دسترسی ندارد).
  if [ ! -d "$APP_DIR/.git" ]; then
    local src_dir
    src_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    if [ -d "$src_dir/.git" ] && [ "$src_dir" != "$APP_DIR" ]; then
      step "کپی کد از $src_dir"
      rm -rf "$APP_DIR" && mkdir -p "$APP_DIR"
      git -c safe.directory='*' clone -q --branch "$BRANCH" "$src_dir" "$APP_DIR"
      local origin_url
      origin_url="$(git -c safe.directory='*' -C "$src_dir" remote get-url origin 2>/dev/null || echo "$REPO_URL")"
      git -C "$APP_DIR" remote set-url origin "$origin_url"
    else
      step "دریافت کد از $REPO_URL"
      rm -rf "$APP_DIR"
      git clone -q --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
    fi
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  fi
}

build_app() {
  step "نصب وابستگی‌ها و بیلد (چند دقیقه)"
  # shellcheck disable=SC2046
  as_app bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund $(npm_flags) && npm run build && npm prune --omit=dev --no-audit --no-fund $(npm_flags)"
}

health_check() {
  local i
  for i in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

snapshot_db() {
  # نسخه سازگار از پایگاه داده SQLite (حتی وقتی برنامه در حال اجراست) + عکس‌ها
  local stamp dest
  stamp="$(date +%Y%m%d_%H%M%S)"
  dest="$BACKUP_ROOT/$stamp"
  mkdir -p "$dest"
  if [ -f "$DATA_DIR/roya.db" ]; then
    node --no-warnings -e "new (require('node:sqlite').DatabaseSync)(process.argv[1]).exec(\"VACUUM INTO '\" + process.argv[2].replace(/'/g, \"''\") + \"'\")" \
      "$DATA_DIR/roya.db" "$dest/roya.db"
  fi
  [ -f "$DATA_DIR/database.json" ] && cp -a "$DATA_DIR/database.json" "$dest/"
  tar -czf "$dest/uploads.tar.gz" -C "$UPLOADS_DIR" . 2>/dev/null || true
  ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | tail -n +31 | xargs -r rm -rf   # فقط ۳۰ نسخه آخر
  echo "$dest"
}

lan_ip() { hostname -I 2>/dev/null | awk '{print $1}'; }

# ------------------------------------------------------------------------------
cmd_install() {
  need_root
  grep -qi ubuntu /etc/os-release 2>/dev/null || yellow "هشدار: این اسکریپت برای اوبونتو نوشته شده است."
  command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ] || die "systemd فعال نیست. در WSL، systemd را فعال کنید (راهنما: deploy/LOCAL_TEST.md)."
  ensure_packages
  ensure_node
  ensure_user_and_dirs
  fetch_code
  write_conf
  write_env_if_missing
  build_app
  write_service
  install_cli
  step "راه‌اندازی سرویس"
  systemctl restart "$APP_NAME"
  if health_check; then
    green ""
    green "نصب کامل شد."
    green "  آدرس:        http://$(lan_ip):$PORT"
    green "  پنل مدیریت:  http://$(lan_ip):$PORT/admin"
    if [ -n "${ADMIN_PASSWORD_GENERATED:-}" ]; then
      green "  رمز پنل:     $ADMIN_PASSWORD_GENERATED"
      yellow "  این رمز را یادداشت کنید. در $ENV_FILE هم ذخیره است."
    fi
    green "  به‌روزرسانی بعدی:  sudo roya-card update"
  else
    die "برنامه بالا نیامد. لاگ را ببینید:  journalctl -u $APP_NAME -n 50"
  fi
}

cmd_update() {
  need_root
  [ -d "$APP_DIR/.git" ] || die "برنامه نصب نیست. اول install.sh را اجرا کنید."
  local force="${1:-}"
  step "بررسی نسخه جدید ($BRANCH)"
  as_app git -C "$APP_DIR" fetch -q origin "$BRANCH"
  local old new
  old="$(as_app git -C "$APP_DIR" rev-parse HEAD)"
  new="$(as_app git -C "$APP_DIR" rev-parse "origin/$BRANCH")"
  if [ "$old" = "$new" ] && [ "$force" != "--force" ]; then
    green "برنامه به‌روز است ($(as_app git -C "$APP_DIR" log -1 --format='%h %s'))."
    return
  fi
  as_app git -C "$APP_DIR" log --oneline "$old..$new" | head -n 20 || true
  step "پشتیبان قبل از به‌روزرسانی"
  local backup
  backup="$(snapshot_db)"
  green "پشتیبان: $backup"
  as_app git -C "$APP_DIR" reset -q --hard "$new"
  ensure_node
  if ! build_app; then
    red "بیلد نسخه جدید شکست خورد؛ برگشت به نسخه قبل."
    as_app git -C "$APP_DIR" reset -q --hard "$old"
    build_app
    systemctl restart "$APP_NAME"
    die "به‌روزرسانی انجام نشد. برنامه با نسخه قبلی در حال اجراست."
  fi
  install_cli
  write_service
  systemctl restart "$APP_NAME"
  if health_check; then
    green "به‌روزرسانی کامل شد: $(as_app git -C "$APP_DIR" log -1 --format='%h %s')"
  else
    red "نسخه جدید بالا نیامد؛ برگشت به نسخه قبل و پایگاه داده پشتیبان."
    systemctl stop "$APP_NAME"
    as_app git -C "$APP_DIR" reset -q --hard "$old"
    build_app
    if [ -f "$backup/roya.db" ]; then
      rm -f "$DATA_DIR/roya.db-wal" "$DATA_DIR/roya.db-shm"
      install -o "$APP_USER" -g "$APP_USER" -m 640 "$backup/roya.db" "$DATA_DIR/roya.db"
    fi
    systemctl start "$APP_NAME"
    health_check && yellow "برنامه با نسخه قبلی برگشت." || red "برنامه بالا نیامد. لاگ: journalctl -u $APP_NAME -n 50"
    exit 1
  fi
}

cmd_status() {
  systemctl --no-pager status "$APP_NAME" | head -n 5 || true
  [ -d "$APP_DIR/.git" ] && echo "نسخه: $(git -c safe.directory='*' -C "$APP_DIR" log -1 --format='%h %s (%cr)')"
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    green "سلامت: OK   آدرس: http://$(lan_ip):$PORT"
  else
    red "سلامت: پاسخ نمی‌دهد"
  fi
}

cmd_password() {
  need_root
  local pw="${1:-}"
  if [ -z "$pw" ]; then
    read -r -s -p "رمز جدید (حداقل ۱۰ کاراکتر): " pw; echo
  fi
  as_app bash -c "cd '$APP_DIR' && set -a && . '$ENV_FILE' && set +a && node dist/admin-password.cjs \"\$0\"" "$pw"
}

cmd_import() {
  # انتقال داده نسخه قبلی (پوشه‌ای که data/ و public/uploads/ نسخه قدیم را دارد)
  need_root
  local src="${1:-}"
  [ -n "$src" ] && [ -d "$src" ] || die "مسیر نسخه قبلی را بدهید، مثلاً:  sudo roya-card import /var/www/roya-card"
  local db_src=""
  if [ -f "$src/data/roya.db" ]; then db_src="$src/data/roya.db"
  elif [ -f "$src/data/database.json" ]; then db_src="$src/data/database.json"
  elif [ -f "$src/roya.db" ]; then db_src="$src/roya.db"
  elif [ -f "$src/database.json" ]; then db_src="$src/database.json"
  else die "در $src فایل roya.db یا database.json پیدا نشد."; fi
  step "پشتیبان از داده فعلی"
  green "پشتیبان: $(snapshot_db)"
  systemctl stop "$APP_NAME"
  rm -f "$DATA_DIR"/roya.db "$DATA_DIR"/roya.db-wal "$DATA_DIR"/roya.db-shm "$DATA_DIR"/database.json
  if [[ "$db_src" == *.db ]]; then
    node --no-warnings -e "new (require('node:sqlite').DatabaseSync)(process.argv[1]).exec(\"VACUUM INTO '\" + process.argv[2].replace(/'/g, \"''\") + \"'\")" "$db_src" "$DATA_DIR/roya.db"
  else
    cp "$db_src" "$DATA_DIR/database.json"   # در اولین اجرا خودکار به SQLite منتقل می‌شود
  fi
  local up_src=""
  for d in "$src/public/uploads" "$src/uploads"; do [ -d "$d" ] && up_src="$d" && break; done
  [ -n "$up_src" ] && cp -a "$up_src/." "$UPLOADS_DIR/"
  chown -R "$APP_USER:$APP_USER" "$DATA_DIR" "$UPLOADS_DIR"
  systemctl start "$APP_NAME"
  health_check && green "داده از $db_src منتقل شد${up_src:+ (عکس‌ها از $up_src)}." || die "برنامه بالا نیامد. لاگ: journalctl -u $APP_NAME -n 50"
}

usage() {
  awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0" | grep -v '^====' 
}

case "${1:-install}" in
  install) cmd_install ;;
  update) cmd_update "${2:-}" ;;
  status) cmd_status ;;
  logs) journalctl -u "$APP_NAME" -f -n 100 ;;
  restart) need_root; systemctl restart "$APP_NAME"; health_check && green "OK" || die "برنامه بالا نیامد." ;;
  backup) need_root; green "پشتیبان: $(snapshot_db)" ;;
  password) cmd_password "${2:-}" ;;
  import) cmd_import "${2:-}" ;;
  -h|--help|help) usage ;;
  *) usage; exit 1 ;;
esac
