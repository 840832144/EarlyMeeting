# EarlyMeeting｜Linux 技术接手入口

本轮交付现有晨会服务的 Docker Compose 版本，续接 **TASK-0028 / PR #4**。公司技术负责服务器部署与正式切换。本轮没有停止 User 的 Windows 机器人，没有使用正式群做云端测试，也没有购买服务器或加入采集器。

## 1. 获取完整项目

**当前 main 不是完整应用入口。** 请使用下面的实施分支；实际交接 commit 见本次交付消息及 [验证记录](LINUX_VALIDATION.md)。代码继续走 PR #4 Review，不自动合并。

```bash
git clone --branch codex/task-0028-local-callback --single-branch \
  https://github.com/840832144/EarlyMeeting.git
cd EarlyMeeting
git rev-parse HEAD
cp deploy/linux/.env.example .env
docker compose build
```

需要仓库读取权限、公司服务器登录权限，以及使用 Docker Engine / Compose v2 的权限。技术确认 Docker 服务已经随宿主机启动；Compose 的 `unless-stopped` 只管理容器重启，不代替 Docker 守护进程自启。镜像使用 Node **24.20.0**（Node 24 LTS）、现有锁文件 `npm ci` 和 SDK **1.73.3**。只有一个晨会服务，不依赖数据库、Redis、额外定时系统或 Windows 工具。

## 2. 私下配置和目录

迁移时优先使用第4节导出的现有配置，避免重新录入或改变模型。模板位于 `deploy/linux/config.example/`，空项必须由维护者在公司受控目录填写。`.env` 仅放路径、UID/GID和镜像版本，不放密钥。

| 文件或参数 | 私下配置内容 | 挂载/使用方式 |
| --- | --- | --- |
| `config.json` | 原应用 `app_id`、`app_secret`；迁移包还会原样保留旧 `test_chat_id` / `template_id` 等字段 | `/srv/earlymeeting/config/config.json`，容器 `/config` 只读 |
| `groups.json` | 两个正式群 `chat_id`、原配置开关与日期 | 原样迁移；周一至周五、`Asia/Shanghai`、`09:30`；测试群关闭、预填关闭、个人行 owner/owner |
| `ai.json` | 原 DeepSeek `base_url`、`model`、`api_key`、`enabled` | 只在正式群2 `delivery_ai=true` 时使用；不能拿模板的空模型替换现有模型 |
| 当天状态 | `data/days/<群绑定>/<北京日期>/meeting-state.json`，以及存在时的 `.next` | `/srv/earlymeeting/data` 可写持久挂载；不是镜像内文件 |
| `.env` | `EARLYMEETING_CONFIG_HOST_DIR`、`EARLYMEETING_DATA_HOST_DIR`、`EARLYMEETING_UID/GID`、`EARLYMEETING_IMAGE_TAG` | 默认路径如上、UID/GID 1000:1000；技术可换为本机服务账号 |

以下初始化仅用于**新目录**，不要覆盖已有实例的数据：

```bash
sudo install -d -m 700 -o 1000 -g 1000 /srv/earlymeeting/config /srv/earlymeeting/data
```

使用其他 UID/GID 时同步修改 `.env` 与目录所有者。配置目录权限700、配置文件600；数据目录和其文件只供服务账号及受权维护者访问。不要把 `/srv/earlymeeting` 放进代码仓库或构建目录，不上传配置、状态或迁移包到 Git、Issue、CI artifact。`.dockerignore` 只允许业务源码、锁文件和 Docker 入口进入构建上下文，容器不使用宿主 Docker socket、不暴露端口。

网络沿用**出站 HTTPS/WSS**：服务器需可访问 `open.feishu.cn:443`、飞书长连接入口返回的官方 WSS 目标及现有 `ai.json` 指定的 HTTPS API。WSS 地址由飞书动态返回，不能写死某个 IP；公司有出站白名单时由技术根据官方入口确认。DNS、系统时间和 CA 校验需正常，不关闭 TLS 校验。无需新增公网回调端口、域名、证书或隧道，不修改共享宿主机全局时区。构建时还需访问镜像仓库、Debian包源和 npm 源或公司批准的镜像源。

## 3. 常用启动与维护命令

在仓库根目录执行。**首次迁移先完成第4节；旧 Windows 仍运行时不要执行 `up`。**

```bash
# 离线检查：不连接飞书、不发送、不清理业务数据；需要旧实例已停止
docker compose run --rm --no-deps meeting node meeting.cjs --check --require-today

# 启动真正的晨会业务
docker compose up -d --no-build

# 进程与业务状态分别查看
docker compose ps
docker compose exec -T meeting node meeting.cjs --status
docker compose logs --tail 80 meeting

# 正常停止；等待处理中的请求落盘，尚未开始的队列保留
docker compose stop --timeout 60
docker inspect earlymeeting --format '{{.State.ExitCode}}'

# 重启恢复原卡；配置调整后也使用此命令
docker compose restart meeting
```

`--check` 返回0表示配置和状态检查通过；返回1表示配置/状态格式或权限问题；返回2表示当天缺少迁移状态或存在需核对的意图。它是离线检查，**不证明飞书连通或生产保存成功**。迁移当天返回 `missing` 时不要删数据或去掉 `--require-today` 来绕过核对。全新启用、当天从未发过卡的情况，由负责人明确确认后才用不带 `--require-today` 的检查。

`--status` 输出的 `running`、`connected` 和 `ready` 分别代表程序活跃、长连接建立、各群就绪；按群只显示编号、行数、队列数量和 pending 状态，不输出人员或正文。状态最多延迟5秒，超过25秒未更新按未就绪处理。正常看到 `CONNECTED` 和两个 `MEETING_READY`，并且 `ready=true`；9:30前尚未创建当天卡片的群可为 `waiting`。`unhealthy` 不等于容器自动重启；健康检查用于提示，SDK负责断线重连。

| 提示 | 处理 |
| --- | --- |
| `APP_CONFIG_*` / `GROUP_CONFIG_*` / `AI_CONFIG_REQUIRED` | 检查受控JSON、空字段与启用群；AI群缺配置会明确失败，不静默换模型或规则 |
| `STATE_DIRECTORY_UNWRITABLE` | 检查挂载目录和 `.env` 中 UID/GID；不要把容器改为特权模式 |
| 退出码73 | 相同数据目录已有实例持有锁；先查旧实例，**不要删除 service.lock** |
| `connected=false` / `ETIMEDOUT` | 检查服务器出站网络与官方WSS目标，等待自动重连；不据此断言必须公司Wi-Fi |
| `pending=retrying` | 仅明确200810临时拒绝按现有退避机制重试原请求；其他请求仍持久排队 |
| `pending=unknown/rejected`、`UPDATE_HELD` | 保留今天的原意图、UUID和序号，交维护者核对。不得改序号、清队列或发新卡当作修复 |
| `TODAY_STATE_PARTIAL`、layout/summary pending | 保留 `.next` 和原状态，先核对中断写入；不要直接覆盖或重放 |
| `RETENTION_INCOMPLETE` | 清理稍后重试，检查文件权限/链接；当天目录保留，不手工递归清空 |

镜像升级：在停机前构建新的独立镜像标签，保留上一标签。维护窗口中先停止服务，再修改 `.env` 的 `EARLYMEETING_IMAGE_TAG`，执行 `docker compose up -d --no-build`。同一持久目录继续恢复当天原卡。不要 `down -v`、删除宿主数据目录或使用空卷“解决”启动问题。

代码回退使用上一个镜像标签，并继续挂载**最新**数据；不要恢复升级前的旧业务快照。本次状态格式仍为version1，与原Windows实现兼容。后续若状态格式改变，先按对应版本的迁移说明操作。

日志只走脱敏输出。Compose本地日志驱动限制为2MB×2，不默认保存原始请求/回调或无限增长日志。状态目录的 `session.json` / `health.json` / `stop.json` / `service.lock` 属于本机进程文件，不能作为跨机器锁迁移。

每天按北京时间清理旧日状态，启动时补清；断网仍可清理，先等待旧日worker停止。当天的消息ID、版本、UUID/sequence、已接收队列和待确认意图保留；配置不清理，飞书历史消息不删除。临时迁移包在确认交接后由技术清除，不建立长期晨会正文备份制度。

## 4. Windows → Linux 正式切换

建议晨会结束后安排短维护窗口。本轮Codex没有执行以下生产切换。

1. 技术先完成拉取、镜像构建、服务器目录和出站网络准备。保持原应用权限、机器人群成员及回调订阅；长连接模式不需修改公网回调地址。
2. 请群成员暂停提交，正在输入的内容先自行提交或复制留底。维护者在旧Windows目录双击 `STOP_MEETING.cmd`，再用 `CHECK_MEETING.cmd` 确認 `NOT_RUNNING`；日志应有 `STOP_VERIFIED`。不能仅关闭窗口后假定停止。
3. 使用**新分支中的**导出工具，读取旧运行目录；导出不停止服务，未正常停止会拒绝。示例在新仓库根目录用PowerShell执行：

```powershell
node .\tools\callback-test\transfer.cjs export `
  --windows-root 'C:\Users\admin\Desktop\EarlyMeeting-local-callback-test' `
  --output 'C:\Users\admin\Desktop\EarlyMeeting-private-transfer'
```

目标必须不存在。工具只导出 `config/config.json`、`groups.json`、存在时的 `ai.json`，以及两个启用群**北京时间当天**的状态文件；保持字节内容，排除旧PID、session、STOP、锁、日志及历史数据。存在unknown/pending会原样保留并提示attention；不复制或解析客户端草稿。不要运行旧备份导出工具代替此工具。

4. 通过公司批准的SSH/SFTP等私密渠道将整个导出包交给技术。不要发到群聊或Git。技术把包放在受控路径，例如 `/srv/earlymeeting-transfer/incoming`。以下命令仅针对尚未启用的新目录；目标已有 `data/days` 时先停止并确认其归属，不覆盖：

```bash
set -e
test ! -e /srv/earlymeeting/data/days
sudo cp -a /srv/earlymeeting-transfer/incoming/config/. /srv/earlymeeting/config/
sudo cp -a /srv/earlymeeting-transfer/incoming/data/. /srv/earlymeeting/data/
sudo chown -R 1000:1000 /srv/earlymeeting/config /srv/earlymeeting/data
sudo find /srv/earlymeeting/config /srv/earlymeeting/data -type d -exec chmod 700 {} +
sudo find /srv/earlymeeting/config /srv/earlymeeting/data -type f -exec chmod 600 {} +
docker compose run --rm --no-deps meeting node meeting.cjs --check --require-today
```

5. 核对两个群均为当天原状态；若发现missing、unknown、rejected、partial、layout/summary pending，保留文件并由维护者先处理，不清空重发。**如果传输跨了北京时间午夜，必须重新核对当天状态，不能直接使用昨天的包恢复今天。**
6. 再次确认Windows已停止，**仅启动云端**：`docker compose up -d --no-build`。观察CONNECTED、两群MEETING_READY和状态中的ready。单机文件锁只保护共用同一目录的本机进程，不能证明另一台Windows已经停机。
7. 在负责人授权的正常使用中完成原卡新增/填写/编辑/提交，观察群2自动交付；本轮不新增专用测试群或卡片。确认原消息继续使用、记录保留，再恢复群成员提交。下一次工作日9:30是否每群仅发一张，需要到时观察。

## 5. 从 Linux 回退到 Windows

先请群成员暂停提交，**先停云端**，确认正常退出后导出云端最新状态。不要直接拿切换前Windows备份启动：云端可能已接收新记录。

```bash
docker compose stop --timeout 60
docker inspect earlymeeting --format '{{.State.ExitCode}}'
sudo install -d -m 700 -o 1000 -g 1000 /srv/earlymeeting-transfer
# rollback-latest 必须不存在；容器只有这一份临时导出额外挂载
docker compose run --rm --no-deps \
  -v /srv/earlymeeting-transfer:/export meeting \
  node transfer.cjs export --output /export/rollback-latest
```

确认返回 `exported=true`，将包通过私密渠道带回Windows。确认旧端仍NOT_RUNNING；若源或目标当天存在 `.next`，先由维护者核对未完成写入。将云端包中的最新文件覆盖回对应旧端位置，**只使用这次云端最新包**：

| 包内位置 | Windows旧运行目录内的位置 |
| --- | --- |
| `config/config.json` | `.local/config.json` |
| `config/groups.json`、`config/ai.json` | `.local/meeting/` 同名文件 |
| `data/days/` 下当天两个群目录 | `.local/meeting/days/` 对应群绑定和当天目录 |

迁移工具不带进程文件；不要复制云端PID、session或锁。先核对当天原卡、两群配置和队列，再双击旧端 `START_MEETING.cmd`。云端保持停止，直到下次明确切换。回退后若出现unknown等提示，保留最新状态，不用旧文件覆盖。

## 6. 不用 Compose 时的直接 Node 入口

本轮交接以Compose为准，没有另做systemd体系。技术仍可用 Node24执行同一个业务入口；需要自己承担进程常驻、日志限额与启动顺序：

```bash
cd tools/callback-test
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
export EARLYMEETING_CONFIG_DIR=/srv/earlymeeting/config
export EARLYMEETING_DATA_DIR=/srv/earlymeeting/data
export EARLYMEETING_FILE_LOG=0 TZ=Asia/Shanghai
node meeting.cjs --check --require-today
flock -n -E 73 -F /srv/earlymeeting/data/service.lock node meeting.cjs
```

直接Node模式也只能运行一份；不能同时启动Compose。不要使用 `probe.cjs` 代替晨会服务。

## 验证与已知边界

见 [Linux 验证记录](LINUX_VALIDATION.md)。Docker健康检查、离线检查和已有Windows成功记录均不等于公司云端上线。公司服务器连通、原卡真实回调/编辑/保存、群2实际AI结果、跨机器正式切换/回退、下次9:30准点发送均由技术在获授权的实际使用中确认。未知结果通用自动恢复、客户端草稿保留仍是既有边界，云迁移没有宣称解决。

维护参考：[Compose服务定义](https://docs.docker.com/reference/compose-file/services/)、[构建上下文与.dockerignore](https://docs.docker.com/build/concepts/context/#dockerignore-files)、[Node支持周期](https://nodejs.org/en/about/previous-releases)。
