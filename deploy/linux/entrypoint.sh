#!/bin/sh
set -eu
umask 077
if [ ! -d "$EARLYMEETING_DATA_DIR" ] || [ ! -w "$EARLYMEETING_DATA_DIR" ]; then
  echo '[STATE_DIRECTORY_UNWRITABLE] 状态挂载不可写；请检查目录及UID/GID。'
  exit 1
fi
# Keep this lock file: unlinking a live lock lets another process lock a new inode.
# --no-fork makes Node receive SIGTERM directly (Compose init forwards it).
exec flock --exclusive --nonblock --conflict-exit-code 73 --no-fork \
  "$EARLYMEETING_DATA_DIR/service.lock" "$@"
