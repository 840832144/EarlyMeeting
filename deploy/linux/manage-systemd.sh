#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
action=${1:-status}
[[ $# -le 1 && "$action" =~ ^(start|stop|restart|status|logs|check)$ ]] || exit 1
data="$root/data"; unit="$root/config/earlymeeting.service"
node="$root/runtime/node/bin/node"; entry="$root/tools/callback-test/meeting.cjs"
[[ -d "$data" && ! -L "$data" && -w "$data" && -x "$node" && -f "$unit" ]] || {
  echo '[RUNTIME_NOT_PREPARED] 请检查项目目录及安装步骤。'; exit 1;
}
[[ ! -L "$data/logs" ]] || exit 1
mkdir -p "$data/logs"
audit="$data/logs/operations.log"
audit_event() {
  local event=$1 code=$2
  for file in "$audit" "$audit.1" "$audit.2"; do [[ ! -L "$file" ]] || return 1; done
  if [[ -f "$audit" ]] && (( $(wc -c < "$audit") >= 2097152 )); then
    [[ ! -f "$audit.1" ]] || mv -f -- "$audit.1" "$audit.2"
    mv -- "$audit" "$audit.1"
  fi
  printf '%s action=%s event=%s exit=%s operator_uid=%s runtime=systemd\n' \
    "$(TZ=Asia/Shanghai date '+%Y-%m-%dT%H:%M:%S%:z')" "$action" "$event" "$code" "$(id -u)" >> "$audit"
}
app() {
  env TZ=Asia/Shanghai NODE_OPTIONS=--dns-result-order=ipv4first \
    EARLYMEETING_CONFIG_DIR="$root/config" EARLYMEETING_DATA_DIR="$data" \
    EARLYMEETING_FILE_LOG=0 EARLYMEETING_LOG_DIR="$data/logs" "$node" "$entry" "$@"
}
active() { systemctl --user is-active --quiet earlymeeting.service; }
status() {
  printf 'runtime=systemd linger=%s\n' "$(loginctl show-user "$(id -u)" -p Linger --value)"
  systemctl --user show earlymeeting.service --property=ActiveState,SubState,UnitFileState,ExecMainStatus,NRestarts --no-pager
  app --status
}
if [[ "$action" = status ]]; then status; exit $?; fi
if [[ "$action" = logs ]]; then
  for file in "$audit" "$data/logs/service.jsonl"; do
    [[ ! -L "$file" ]] || exit 1
    [[ ! -f "$file" ]] || { printf '\n%s\n' "$(basename -- "$file")"; tail -n 100 -- "$file"; }
  done
  exit 0
fi
[[ ! -L "$data/control.lock" ]] || exit 1
exec 9>"$data/control.lock"
flock -n 9 || { echo '[OPERATION_BUSY] 已有启停操作进行中。'; exit 73; }
audit_event requested 0
finish() { code=$?; audit_event finished "$code" || echo '[OPS_LOG_WRITE_FAILED] 操作结果日志未写入。'; }
trap finish EXIT
stop() {
  systemctl --user stop earlymeeting.service
  if active || ! flock -n "$data/service.lock" true; then
    echo '[STOP_UNCONFIRMED] 服务仍在运行或同一数据目录仍被占用。'; return 1
  fi
  local code
  code=$(systemctl --user show earlymeeting.service --property=ExecMainStatus --value)
  systemctl --user disable earlymeeting.service
  systemctl --user link "$unit"
  systemctl --user daemon-reload
  if [[ "$code" != 0 ]]; then echo "[STOP_NEEDS_REVIEW] 服务退出码=$code；请检查状态。"; return 2; fi
  echo '[STOP_VERIFIED] 已停止且取消开机启动；当天状态、归档和日志保留。'
}
start() {
  if active; then echo '[ALREADY_RUNNING] 未重启或重建。'; status; return $?; fi
  app --check
  [[ "$(loginctl show-user "$(id -u)" -p Linger --value)" = yes ]] || {
    echo '[LINGER_REQUIRED] 账号尚未允许后台常驻，请技术处理后再启动。'; return 1;
  }
  systemctl --user reset-failed earlymeeting.service 2>/dev/null || true
  systemctl --user enable --now "$unit"
  for (( attempt=0; attempt<30; attempt++ )); do
    if app --healthcheck >/dev/null 2>&1; then echo '[START_READY] 长连接及各群就绪。'; status; return 0; fi
    sleep 1
  done
  echo '[START_NOT_READY] 尚未就绪；请查看状态和日志。服务未被自动清空或重发。'
  status || true
  return 2
}
case "$action" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  check) flock -n -E 73 "$data/service.lock" bash -c 'exec "$@"' _ \
    env TZ=Asia/Shanghai EARLYMEETING_CONFIG_DIR="$root/config" EARLYMEETING_DATA_DIR="$data" "$node" "$entry" --check --require-today ;;
esac
