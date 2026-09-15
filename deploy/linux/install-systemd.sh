#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
[[ "$root" =~ ^/[a-zA-Z0-9_./-]+$ ]] || { echo '[PROJECT_PATH_INVALID] 请使用不含空格或特殊字符的路径。'; exit 1; }
[[ -x "$root/runtime/node/bin/node" && -d "$root/config" && -d "$root/data" ]] || {
  echo '[RUNTIME_NOT_PREPARED] 请先准备独立Node、配置及数据目录。'; exit 1;
}
if systemctl --user is-active --quiet earlymeeting.service; then
  echo '[SERVICE_RUNNING] 运行中不重新安装服务；先安排维护窗口。'; exit 1
fi
unit="$root/config/earlymeeting.service"
existing=$(systemctl --user show earlymeeting.service --property=FragmentPath --value 2>/dev/null || true)
[[ -z "$existing" || "$existing" = "$unit" ]] || {
  echo '[UNIT_NAME_CONFLICT] 已有同名服务属于其他位置；未覆盖。'; exit 1;
}
cat > "$unit.next" <<EOF
[Unit]
Description=EarlyMeeting morning meeting service
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
WorkingDirectory=$root/tools/callback-test
Environment=TZ=Asia/Shanghai
Environment=NODE_OPTIONS=--dns-result-order=ipv4first
Environment=EARLYMEETING_CONFIG_DIR=$root/config
Environment=EARLYMEETING_DATA_DIR=$root/data
Environment=EARLYMEETING_LOG_DIR=$root/data/logs
Environment=EARLYMEETING_FILE_LOG=0
ExecStartPre=$root/runtime/node/bin/node $root/tools/callback-test/meeting.cjs --check
ExecStart=/usr/bin/flock --exclusive --nonblock --conflict-exit-code 73 --no-fork $root/data/service.lock $root/runtime/node/bin/node $root/tools/callback-test/meeting.cjs
Restart=on-failure
RestartSec=10
TimeoutStopSec=60
KillMode=control-group
UMask=0077
NoNewPrivileges=true
StandardOutput=journal
StandardError=journal
SyslogIdentifier=earlymeeting

[Install]
WantedBy=default.target
EOF
mv -- "$unit.next" "$unit"
systemd-analyze --user verify "$unit"
systemctl --user link "$unit"
systemctl --user daemon-reload
printf 'systemd\n' > "$root/.runtime-mode"
if [[ "$(loginctl show-user "$(id -u)" -p Linger --value)" != yes ]]; then
  echo '[LINGER_REQUIRED] 请技术允许此账号退出SSH后及开机时继续运行用户服务。'
fi
echo '[SERVICE_INSTALLED_NOT_STARTED] 用户服务已登记，尚未启用或启动。'
