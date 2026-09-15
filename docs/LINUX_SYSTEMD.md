# 公司服务器：独立 Node + 用户级 systemd

2026-09-15，TASK-0028。公司实际账号没有Docker和Node，有Ubuntu24.04/x86_64及用户级systemd，因此实际部署使用此入口；Docker Compose交付仍保留，两个运行模式不能同时启动。User已让技术确认SSH主机指纹，当前可正常认证登录。

项目目录：`/home/mmog/pythonservice/earlymeeting`。代码、Node、依赖、配置、数据、日志和归档都在该目录内。系统仅登记本应用的用户服务链接，并启用当前账号的linger，使退出SSH后继续运行、开机可启动用户服务；不安装系统Node/Docker，不修改全局代理、防火墙、时区或TLS。

## 首次准备

1. 将现有分支的源码放入空的项目目录；不要覆盖其他项目。使用官方Node24.20.0的Linux x64包，校验官方发布摘要后解压到 `runtime/node-v24.20.0-linux-x64`，`runtime/node` 指向此版本。
2. 私下准备 `config/config.json`、`groups.json`、`ai.json`、`operations.json`。前三份沿用Windows原配置；operations设置9月16日起归档。目录700、文件600。SSH密码文件留在Windows，不上传服务器。
3. 在 `tools/callback-test` 以项目Node安装既有锁文件依赖：

```bash
cd /home/mmog/pythonservice/earlymeeting
export PATH="$PWD/runtime/node/bin:$PATH"
cd tools/callback-test
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
cd ../..
bash deploy/linux/install-systemd.sh
```

安装脚本生成 `config/earlymeeting.service`，登记到当前用户systemd并写 `.runtime-mode` 为systemd，**不启动服务**。已有不同来源同名unit或正在运行时拒绝覆盖。用户服务链接位于账号的 `.config/systemd/user`，真正的unit仍留在项目目录。

首次需 `loginctl show-user "$(id -u)" -p Linger --value` 返回yes；本次已由账号正常权限启用。若其他服务器被策略拒绝，由技术授权处理，不能绕过策略。默认地址选择访问外网曾超时，IPv4 HTTPS已实际连通；仅本服务设置 `NODE_OPTIONS=--dns-result-order=ipv4first`。

## 切换与日常操作

先按[切换步骤](LINUX_HANDOFF.md#4-windows--linux-正式切换)确认旧Windows停止，导出最新当天状态。迁入 `data/days/` 后运行 `bash deploy/linux/manage.sh check`，保留原消息、行、sequence、队列；unknown/pending/partial需要处理，不能清状态重发。核对通过后再启动云端。

```bash
cd /home/mmog/pythonservice/earlymeeting
./start.sh
./status.sh
./logs.sh
# 维护时停止或重启：
./stop.sh
./restart.sh
```

这些入口根据 `.runtime-mode` 自动使用当前用户的 `earlymeeting.service`；不依赖Docker。启动会检查配置/状态，再启用开机启动并启动；停止会等待收尾并取消开机启动，避免人为停服后重启服务器又自行启动。正常进程异常退出会间隔10秒重启，5分钟最多5次；配置或状态长期有问题时需维护者处理后再启动，不无限重试。

`status.sh` 区分服务active、飞书connected、群ready，显示重启次数与归档错误；启动命令返回2表示预检或就绪仍需处理，不代表保存成功。`logs.sh` 查看 `data/logs/operations.log` 和 `service.jsonl`；服务未进入业务入口时可用 `journalctl --user -u earlymeeting.service -n 100 --no-pager` 定位启动问题，不分享完整日志或配置。

正式切换后，Windows `.local/meeting/cloud-active.json` 标记阻止旧的一键启动误开第二个接收实例。回退必须先停云端、迁回**云端最新当天状态**，之后才由维护者移除标记并启动本机；不能只删标记重新启动。这个标记防误操作，不宣称可以阻止有人绕过启动器直接运行Node。

归档从2026-09-16起放在 `data/archives/YYYY-MM-DD/`，规则详见[日志与归档说明](LINUX_OPERATIONS.md)。回退保留云端归档，不能用归档代替运行状态。

## 升级与卸载

先停止服务并保留最新data/config/runtime，将审核后的代码更新到项目目录，以相同锁文件安装依赖；unit路径或环境有变化时重新运行安装脚本，再启动。不要在服务运行时覆盖源码或node_modules；不从旧备份覆盖新业务状态。

移除服务登记可在确认停服后执行 `systemctl --user disable earlymeeting.service`，核对只移除了本应用的unit链接，再执行 `systemctl --user daemon-reload`；不删除其他unit。配置、状态和归档是否删除需另行确认。当前账号linger可能还被其他用户服务依赖，不擅自取消它。

参考：[systemd 用户常驻](https://www.freedesktop.org/software/systemd/man/252/loginctl.html)、[Node24.20.0官方发行页](https://nodejs.org/en/download/archive/v24.20.0)。

实际部署、切换和验证结果见[Linux验证记录](LINUX_VALIDATION.md)。Subagents: none。
