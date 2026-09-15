# Linux 一键维护、日志与每日归档

TASK-0028 / PR #4，2026-09-15 User 追加批准：由 Codex 使用公司提供的 SSH 移植，项目放在允许目录 `/home/mmog/pythonservice` 内；增加维护日志、一键启停，从 **2026-09-16（北京时间）** 开始归档每日晨会。原“只留当天”继续适用于运行状态，新增归档单独保留。两个正式群仍为工作日 09:30，每群每天一张，群2 AI 范围不变。

## 部署位置与开关

实际已部署在 `/home/mmog/pythonservice/earlymeeting`，2026-09-15经User确认完成Windows→Linux切换。公司服务器没有Docker，已使用[独立Node + 用户级systemd](LINUX_SYSTEMD.md)，`.runtime-mode` 为 `systemd`。两群原卡接续，无新发卡。

当前systemd路径已在项目内的 `config/earlymeeting.service` 配置，不需要 `.env`。仅在以后选择Docker Compose部署时，才按[通用交接说明](LINUX_HANDOFF.md)设置 `.env`：

```dotenv
EARLYMEETING_CONFIG_HOST_DIR=/home/mmog/pythonservice/earlymeeting/config
EARLYMEETING_DATA_HOST_DIR=/home/mmog/pythonservice/earlymeeting/data
```

UID/GID 填实际维护账号的 `id -u` / `id -g`，配置与数据目录由该账号维护；不要照抄默认1000、不要修改整个父目录权限。日志和归档目录由程序在数据目录内创建。私有目录700、文件600，其他技术人员通过公司批准的维护账号访问，不公开共享凭据。

项目根目录提供以下命令，可直接执行，或用 `bash start.sh` 等方式执行：

| 操作 | 命令 | 结果 |
| --- | --- | --- |
| 启动 | `./start.sh` | 先检查配置和当天状态，再启动；已运行时只报状态，不重建 |
| 停止 | `./stop.sh` | 等待最多60秒，正常退出后显示 `STOP_VERIFIED`；状态和归档保留 |
| 重启 | `./restart.sh` | 先停再启动；非正常退出时暂停，保留数据交维护者检查 |
| 看状态 | `./status.sh` | 分别显示进程、长连接、群就绪、待处理数、归档及清理错误 |
| 看日志 | `./logs.sh` | 输出最近100行维护日志及最近100行运行事件 |
| 停服后迁移检查 | `bash deploy/linux/manage.sh check` | 要求两群当天状态齐全；不连接飞书、不发送卡片 |

启停操作串行执行；相同数据目录的服务仍使用原内核文件锁。退出码0表示该命令成功；启动返回2可能是预检查发现待核实状态，或已启动但连接/群尚未就绪，必须看屏幕提示和 `status.sh`。退出码73表示已有启停操作或实例持锁。不要通过删除锁文件、旧状态、队列或重发卡来消除报错。

当前 `start.sh` 调用已登记的用户级systemd服务，不安装依赖。人工停止会取消该服务开机启动，重新启动会恢复；账号linger及服务enabled已验证，真实服务器重启尚未验证。若以后改用Compose，则使用事先构建的镜像和 `unless-stopped`；不能同时运行两个模式。

## 日志位置与内容

在上述部署路径下：

- `data/logs/operations.log`：启动、停止、重启请求及命令结果，时间和操作账号UID。
- `data/logs/service.jsonl`：业务启动、停止、连接/重连、群就绪、保存及异常事件；时间为北京时间，带进程号、群序号及必要错误码/计数。
- 每份日志保留当前文件加 `.1`、`.2` 两份轮转文件，每份约2MiB上限；重启不清空历史。

不记录密码、App Secret、AI Key、群/人员ID、晨会正文、原始回调、原始错误或完整SDK日志。晨会正文只出现在受控的状态与归档文件中。`OPS_LOG_WRITE_FAILED` 表示磁盘或权限需要处理；日志写入失败不把已经收到的提交丢掉。

`STOPPED` 是程序正常收尾，`STOP_VERIFIED` 是开关确认退出；掉电/强杀可能没有前者，维护者结合下一次启动和服务退出码判断，不把缺失的日志补造为正常停止。当前systemd在程序启动前出错时，用 `journalctl --user -u earlymeeting.service -n 100 --no-pager` 查看启动提示；Compose模式才使用 `docker compose logs --tail 100`。不要公开完整日志。

## 从9月16日起的归档

将 `deploy/linux/config.example/operations.json` 放到受控 `config/operations.json`。它只配置归档，不含密钥：

```json
{"version":1,"archive":{"enabled":true,"start_date":"2026-09-16"}}
```

未配置此文件时兼容旧版本，归档关闭；非法日期或结构会明确拒绝启动。云端已配置该文件；Windows已停止，旧副本保留作为受控回退材料。

归档存到 `data/archives/YYYY-MM-DD/`，每个群各自一对 `.json` 与 `.md` 文件。文件名是已有群绑定标识，不写真实群ID；文件内保留配置群名。JSON方便后续处理，Markdown可阅读。现有状态没有员工姓名文本，人员按飞书 `open_id` 保存，没有为归档新增通讯录权限或编造姓名。

当天约每15秒更新一次快照，停服收尾再补一次；跨天先等待旧日队列工作停止，再写日终归档并清理旧运行状态。服务停机跨天时，下次启动先补归档已有日状态，再清理。9月15日及以前的数据不补归档；没有生成过卡片的日期不造记录，也不为了归档补发卡。

只取已经成功提交的个人正文和今日交付；正在编辑时保留上次成功提交，未提交草稿和待处理/结果未知请求的正文不会混入。待核实请求只记录数量和标记。群2保存当前已有的AI汇总结果，不额外请求AI，也不加入“待更新”占位。归档不改变线上保存流程、行权限或卡片布局。

归档使用临时写入及原子替换，成功后才允许清理对应旧日期。归档失败会显示 `ARCHIVE_WRITE_FAILED` 或 `RETENTION_INCOMPLETE`，保留该日源文件并重试；状态中的 `archive.errors` / `retentionErrors` 便于维护者发现问题。处理磁盘和权限后自动继续，不能手工删除源文件跳过归档。

日终归档不自动清理，按本次User要求保留；磁盘使用由技术维护。它是晨会记录副本，不是可直接恢复运行的队列备份。跨机器切换仍要迁移当天完整运行状态；回退时保留服务器已有归档，不能拿Markdown替代状态、覆盖新的提交或重发卡片。

## 当前执行边界

SSH主机指纹经技术确认后固定在项目known-hosts，后续变化拒绝认证；未改全局SSH信任或TLS。已完成公司目录/账号权限/依赖/出站连接检查、Windows正常停止和两群当天状态迁移，云端真实CONNECTED/READY。应用仅设置IPv4地址优先，不修改全局网络配置。

云端真实员工提交/编辑/删除及AI结果、下一次09:30发送、9月16日归档、真实服务器重启和回退仍待实际发生。本机一键启动已锁定，不能直接开旧端。实测记录见[Linux验证记录](LINUX_VALIDATION.md)。

参考：[Docker 重启策略](https://docs.docker.com/reference/compose-file/services/#restart)、[Paramiko 主机密钥校验](https://docs.paramiko.org/en/stable/api/client.html#paramiko.client.RejectPolicy)。

Subagents: none。
