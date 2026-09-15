#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
cd "$root"
action=${1:-status}
if [[ $# -gt 1 || ! "$action" =~ ^(start|stop|restart|status|logs|check)$ ]]; then
  echo '用法：deploy/linux/manage.sh start|stop|restart|status|logs|check'; exit 1
fi
command -v docker >/dev/null || { echo '[DOCKER_UNAVAILABLE] 请技术先提供 Docker/Compose。'; exit 1; }
docker compose version >/dev/null
data=${EARLYMEETING_DATA_HOST_DIR:-}
if [[ -z "$data" && -f .env ]]; then
  data=$(sed -n 's/^EARLYMEETING_DATA_HOST_DIR=//p' .env | tail -n 1)
  data=${data%$'\r'}; data=${data#\"}; data=${data%\"}; data=${data#\'}; data=${data%\'}
fi
data=${data:-/srv/earlymeeting/data}
[[ "$data" = /* && -d "$data" && -w "$data" && ! -L "$data" ]] || {
  echo '[STATE_DIRECTORY_UNWRITABLE] 请检查 .env 指定的数据目录。'; exit 1;
}
[[ ! -L "$data/logs" ]] || { echo '[LOG_DIRECTORY_LINK] 日志目录不能是符号链接。'; exit 1; }
mkdir -p -- "$data/logs"
audit="$data/logs/operations.log"
audit_event() {
  local event=$1 code=$2
  for file in "$audit" "$audit.1" "$audit.2"; do [[ ! -L "$file" ]] || return 1; done
  if [[ -f "$audit" ]] && (( $(wc -c < "$audit") >= 2097152 )); then
    [[ ! -f "$audit.1" ]] || mv -f -- "$audit.1" "$audit.2"
    mv -- "$audit" "$audit.1"
  fi
  printf '%s action=%s event=%s exit=%s operator_uid=%s\n' \
    "$(TZ=Asia/Shanghai date '+%Y-%m-%dT%H:%M:%S%:z')" "$action" "$event" "$code" "$(id -u)" >> "$audit"
}
running() { [[ -n "$(docker compose ps --status running -q meeting)" ]]; }
status() {
  docker compose ps -a meeting
  if running; then docker compose exec -T meeting node meeting.cjs --status
  else echo '[NOT_RUNNING] 晨会容器未运行。'; return 1; fi
}
if [[ "$action" = status ]]; then status; exit $?; fi
if [[ "$action" = logs ]]; then
  for file in "$audit" "$data/logs/service.jsonl"; do
    [[ ! -L "$file" ]] || { echo '[LOG_FILE_LINK] 日志文件不能是符号链接。'; exit 1; }
    [[ ! -f "$file" ]] || { printf '\n%s\n' "$(basename -- "$file")"; tail -n 100 -- "$file"; }
  done
  exit 0
fi
# Serialize human start/stop commands as well as the service's kernel lock.
[[ ! -L "$data/control.lock" ]] || exit 1
exec 9>"$data/control.lock"
flock -n 9 || { echo '[OPERATION_BUSY] 已有启停操作进行中。'; exit 73; }
audit_event requested 0
finish() { code=$?; audit_event finished "$code" || echo '[OPS_LOG_WRITE_FAILED] 操作结果日志未写入。'; }
trap finish EXIT
stop() {
  docker compose stop --timeout 60 meeting
  if running; then echo '[STOP_UNCONFIRMED] 容器仍在运行。'; return 1; fi
  local cid
  cid=$(docker compose ps -a -q meeting)
  if [[ -n "$cid" ]]; then
    local code
    code=$(docker inspect --format '{{.State.ExitCode}}' "$cid")
    if [[ "$code" != 0 ]]; then
      echo "[STOP_NEEDS_REVIEW] 容器已退出，退出码=$code；保留状态并检查日志。"; return 2
    fi
  fi
  echo '[STOP_VERIFIED] 服务已停止，记录、队列、归档及日志保留。'
}
start() {
  if running; then
    echo '[ALREADY_RUNNING] 不重建正在运行的实例。'; status; return $?
  fi
  docker compose run --rm --no-deps meeting node meeting.cjs --check
  docker compose up -d --no-build meeting
  for (( attempt=0; attempt<30; attempt++ )); do
    if docker compose exec -T meeting node meeting.cjs --healthcheck >/dev/null 2>&1; then
      echo '[START_READY] 长连接及各群就绪。'; status; return 0
    fi
    sleep 1
  done
  echo '[START_NOT_READY] 已启动，但连接或群状态尚未就绪；服务保留运行，请查看状态和日志。'
  status || true
  return 2
}
case "$action" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  check) docker compose run --rm --no-deps meeting node meeting.cjs --check --require-today ;;
esac
