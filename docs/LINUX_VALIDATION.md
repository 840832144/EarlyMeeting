# EarlyMeeting｜Linux交接验证记录

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
