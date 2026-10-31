#!/bin/sh
# Disks mounted by Docker volumes or hosting platforms (e.g. Liara) are often owned by root.
# Start as root, make the data and uploads folders writable for the "node" user, then drop privileges.
set -e
DATA_DIR="${DATA_DIR:-/app/data}"
UPLOADS_DIR="${UPLOADS_DIR:-/app/public/uploads}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR" "$UPLOADS_DIR"
  chown -R node:node "$DATA_DIR" "$UPLOADS_DIR"
  [ -n "$BACKUP_DIR" ] && mkdir -p "$BACKUP_DIR" && chown -R node:node "$BACKUP_DIR"
  # busybox su (no extra packages needed): run the command as "node"
  exec su node -s /bin/sh -c 'exec "$0" "$@"' -- "$@"
fi
exec "$@"
