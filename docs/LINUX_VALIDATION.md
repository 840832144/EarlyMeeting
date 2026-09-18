# EarlyMeeting｜Linux交接验证记录

## 2026-09-15 公司云端正式切换（当前）

- 授权：技术确认SSH主机指纹；User明确回复“可以，现在切换”。先正常停止Windows，取得STOP_VERIFIED，再私下导出两群当天配置与完整状态；没有同时启动两台。
- 实际运行代码：`de8b267`。公司Ubuntu24.04/x86_64，项目内Node24.20.0 / 既有SDK1.73.3，用户级systemd；公司无Docker，未安装系统Docker/Node。目录 `/home/mmog/pythonservice/earlymeeting`。
- 首次启动：START_READY；重新建立独立SSH连接后再次只读回查，服务active/running、enabled、linger=yes、NRestarts=0、ExecMainStatus=0；running/connected/ready均true。
- 两群状态：group1 rows=8、group2 rows=2；均ready，queued=0、pending=none；归档配置enabled、startDate=2026-09-16、errors=0，retentionErrors=0。行数是切换时快照，不代表之后不能变化。
- 通过私密文件对照，原messageId/cardId在两群均保持相同，仅输出布尔结果与数量。云端脱敏事件MEETING_RESUMED=2、MEETING_READY=2、CONNECTED=1；MEETING_SENT=0、CARD_CREATED=0。没有新建、重发卡片或模拟正式群操作。
- Windows正常启动入口实跑返回exit1 / CLOUD_ACTIVE，未启动旧服务；`.local/meeting/cloud-active.json` 防误开标记已保留。旧运行副本和当天切换包仅保存在受限本机目录，不上传Git。
- 维护日志已在实际服务器生成并可读取。官方Node包安装、npm锁文件安装、systemd unit验证及链接、原配置检查均通过；Feishu长连接已实际建立，DeepSeek IPv4 HTTPS只读连通，无额外生产AI测试。
- 最新代码的[Linux CI 34927676289](https://github.com/840832144/EarlyMeeting/actions/runs/34927676289)成功：20项相关检查、Compose镜像构建、两轮禁网启停/重建、持久日志检查；systemd脚本语法通过。CI与真实生产启动证据分开，不用禁网结果证明真实回调。
- **仍未验证**：云端员工真实提交/编辑/删除及AI汇总、明日09:30每群一张、9月16日真实归档、服务器重启后恢复、实际回退。既有客户端草稿保留问题仍未取得真实核实结果。本次不声称所有并发或结果未知问题已解决。
- TASK-0028：Review，未Done。Subagents: none。

以下是前阶段CI和交接快照；其中“未部署/未切换/指纹待确认”只描述当时状态，已由上方当前记录替代。

## 本次Linux维护增量实跑

- 环境：Ubuntu24.04 GitHub Actions；真实Node24.20.0镜像与Docker Compose。仅虚构配置，容器禁网，没有生产App Secret或AI Key。
- `start.sh` 对已有unknown待确认状态返回2，并确认业务容器未启动；没有清状态重发。
- 两轮Compose启动及重建均进入真正的 `meeting.cjs`；禁网时不冒称已连接。`stop.sh` 返回 `STOP_VERIFIED`，容器退出0，session正常停止。
- 原消息、sequence、unknown意图和队列持久保留；第二次重建后两次启动/停止事件都保留在 `data/logs/service.jsonl`，操作日志有停止结果，密钥哨兵未出现。
- 明确通过标记：`SIGTERM_AND_PERSISTENCE_OK`、`OFFLINE_COMPOSE_CYCLE_1_OK`、`OFFLINE_COMPOSE_CYCLE_2_OK`、`PERSISTENT_LOG_AND_MAINTENANCE_SWITCH_OK`。
- 归档的20项检查中，新增三项针对生效日期、两群隔离、已提交/未知结果区分、更新覆盖、先归档再清理、归档失败后重试、日志保留/轮转/脱敏；没有模拟真实员工或调用生产AI。
- 未验证：公司Linux镜像构建/权限/网络、现场连接和真实卡片提交、Windows→Linux切换/回退、服务器重启自启、9月16日真实归档与09:30定时发送。

2026-09-15 本轮新增验证：一键维护、持久日志、分群已提交记录归档。Windows暂存源码中20项针对性检查通过（10队列、4清理、3运行、3维护/归档）；覆盖生效日期、群隔离、未确认正文排除、归档失败保留源数据后可重试、日志重启保留/轮转/脱敏，以及迁移保留operations配置。运行代码[06c1305](https://github.com/840832144/EarlyMeeting/commit/06c1305a30e4a06187f58da6024e069a30e5a18e)在[Linux CI 34926919423](https://github.com/840832144/EarlyMeeting/actions/runs/34926919423)通过同一20项检查，并通过下述容器实跑；以下17/17是前轮证据。SSH仅完成无认证握手；严格主机校验拒绝未知密钥，密码未发送，未取得服务器环境信息。Windows实例和正式群未操作。

- 日期：2026-09-15。
- 正式任务：TASK-0028，Review；部署规格来自[PR #4指定留言](https://github.com/840832144/EarlyMeeting/pull/4#issuecomment-5673785774)。
- 实施基线：c15d02e；Linux代码：b4e4c9b、cf81084、**0d4a70b80df26b425ef0144e3642bdc35ace9b11**。其后的交接提交仅更新文档及治理引用。
- 完整接手入口：[LINUX_HANDOFF.md](LINUX_HANDOFF.md)。当前main不是完整运行入口。
- 最终代码CI：[Linux handoff / 34922786869](https://github.com/840832144/EarlyMeeting/actions/runs/34922786869)，结论Success。

## 实际执行与证据

本机为Windows / Node24.20.0，没有可用Docker命令或已安装的WSL Linux发行版；没有为验证改变本机系统环境。Linux实测使用GitHub Actions的Ubuntu24.04一次性环境和真实Docker/Compose，**运行容器强制禁网、只使用虚构配置和状态**。未读取或上传现有应用密钥、员工正文或生产状态。

| 验证对象 | 已取得结果 | 证明范围 |
| --- | --- | --- |
| 生产镜像构建 | Node24.20.0-bookworm-slim、`npm ci --omit=dev --ignore-scripts`成功；现有SDK1.73.3锁文件保留 | Dockerfile可以在Linux构建，不代表公司镜像仓库/网络已可用 |
| 配置与检查入口 | 配置正确/缺失/空值、AI配置缺失、参数拼错均有明确状态；离线检查不启动业务、不输出密钥 | 技术可在连接前检查受控输入；配置检查不是凭据有效性验证 |
| 状态与迁移导出 | 停机后导出保留当天原UUID、序号、消息和队列；活动服务及重复目标拒绝；不带进程文件 | 虚构状态的字节保留通过，未执行真实Windows→公司服务器传输 |
| 既有队列和清理 | 10项队列/恢复检查、4项当天清理检查继续通过 | 既有失败分级、隔离及日界线逻辑未因路径改造倒退；不等于真实多人客户端验收 |
| Linux运行检查 | 新增3项运行风险检查通过；总计**17/17** | 覆盖配置、迁移、健康区分，含断网时仍显示磁盘unknown意图 |
| 实际容器启动 | Compose启动`node meeting.cjs`，出现MEETING_STARTING；禁网时running=true、connected=false、ready=false | 已启动真正业务入口，没有以probe替代，也没有冒称连接飞书 |
| 单实例 | 同一持久目录的第二个容器命令被flock拒绝，退出73 | 仅证明同一Linux宿主/共用目录互斥，不保证另一台Windows停机 |
| SIGTERM和重建 | 两轮Compose启动/正常停止/force-recreate均通过；退出0、session.stopped=true；原消息和unknown意图保留、无新发卡 | CI虚构状态下持久挂载及退出有效；不代表真实生产回调已在云端完成 |

两轮容器检查的明确输出为 `SIGTERM_AND_PERSISTENCE_OK`、`OFFLINE_COMPOSE_CYCLE_1_OK`、`OFFLINE_COMPOSE_CYCLE_2_OK`。CI无生产凭据且network_mode为none，因此不可能用正式群消息作为测试替身。应用当前状态文件结构仍为version1，没有修改现有业务行、权限、AI抽取提示词或失败恢复规则。

## 本轮未执行

- 没有登录公司服务器、修改网络安全设置、开放端口或安装系统服务。
- 没有停止、重启、替换或热更User正在使用的Windows机器人。
- 没有在正式群发卡、模拟员工点击、调用现有DeepSeek Key，或重新启用已关闭测试群。
- 没有实际进行跨机器切换/回退、公司云端原卡新增/编辑/提交/删除、群2AI汇总、服务器重启自启、未来工作日09:30准点发送。

## 技术接手后的四项确认

1. 公司Linux完成实际启动，配置错误能定位，服务器到飞书/WSS及现有AI接口可达。
2. 获授权的正常使用中，在当天原卡完成填写、编辑和保存；两群隔离、本人权限与群2AI规则保持。
3. 完成生产重启/重建及维护窗口切换，保留当天原卡与记录，每群每天一张；按北京时间清理旧日，配置与当天pending保留。
4. 技术按交接文档独立执行启动、停止、状态查询、升级和回退，并记录实际结果。

公司环境验证尚未发生，本轮状态为**代码与交接完成、等待Review和技术部署**，不写成“云端已上线”。未知结果通用自动恢复和客户端草稿保留仍沿用原证据边界。没有新增长期产品方向或Future Task；Subagents: none。
