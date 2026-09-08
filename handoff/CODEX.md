# Codex Handoff｜EarlyMeeting 本机卡片回调接管

- Date：2026-09-08
- User decision：Approved
- Owner：User / ChatGPT
- Executor：Codex（已在目标 Windows 本机接管）
- Priority：EarlyMeeting 当前首要步骤；不改变其他项目优先级。
- Execution repository：840832144/EarlyMeeting
- Project key：EARLYMEETING，已通过正式 allocator 验证。
- Status：Review — 仅正式群2已启用 DeepSeek 自动交付；正式 [TASK-0028](https://github.com/840832144/AI-Workspace/blob/codex/earlymeeting-callback-task/tasks/TASK-0028-EARLYMEETING.md)，未标记 Done。
- 完整范围：[CURRENT_DIRECTION.md](../docs/CURRENT_DIRECTION.md)
- 现场状态：[STATUS.md](../STATUS.md)

## 先完成正式任务准备

本 Gate 已完成：AI-Workspace main@1dd6de3 完整 Registry 为 13 canonical / 0 collision / valid；全部远端目标防重无同目标 Task；独立 worktree 由 Approved Candidate / remote-CAS allocator 分配 TASK-0028，重建后为 14 canonical / 0 collision / valid。准备 commit a68b663 已推送；reservation pending-main，Review 后才合并并 finalize。没有复用其他任务预约。

## 当前三区域实现与唯一下一步

最新交付：User 填好本机 API Key 后明确仅正式群2开放。已按群增加默认false的 delivery_ai 开关；只有正式群2切换v13自动交付，测试群和正式群1保持v12手填交付，不调用AI。八脚本语法检查通过，STOP_VERIFIED且各群无待确认/排队意图后部署；HTTP101 / CONNECTED，原卡保留1/11/10行，仅GROUP_3 LAYOUT_UPDATED。该群8份已提交记录全部识别ready、合计6项交付，失败及待处理0，三群卡片队列均空；未重发卡片或模拟员工操作。

本机持续运行新接收程序；原v12代码备份位于 `.local/meeting/code-backup-before-auto-delivery/`。正式群2编辑后重提会重新识别并替换/移除本人汇总，删除行同步移除；尚无升级后真实重提/删除回调证据，直接使用中反馈。唯一下一步：正式Review，未标记Done。操作与凭据入口见 [MEETING.md](../tools/callback-test/MEETING.md)，证据见 [MEETING_ACCEPTANCE.md](../docs/MEETING_ACCEPTANCE.md)。Subagents: none。下方接入准备及全群手填为历史。

2026-09-08 当前 v13 增量：User 指定先用 DeepSeek，每次个人记录成功提交及编辑后重新提交均抽取明确标记的今日交付；按原行本人 @ 汇总，有新结果则替换、成功空结果则移除，删除个人行同步移除。保留策划/程序行与编辑交互，取消交付手填框；旧手填字段只留本机历史，不归给猜测的人员。模型调用与保存队列分开，结果按 submissionId 校验后排入原群队列，丢弃过期或已删除行的结果。失败保留已保存记录与旧汇总并显示待更新。各群隔离和09:45规则不变。

已准备本机 `.local/meeting/ai.json`，DeepSeek 官方 endpoint / deepseek-v4-flash 已配置，只等 User 本机填写 API Key；尚未调用模型、部署 v13 或声称验收。唯一下一步：本机配置完成后，确认旧版队列无待确认项，备份并升级现有卡片，取得仅状态码及数量的实际结果，提交等待 Review。具体操作见 [MEETING.md](../tools/callback-test/MEETING.md)。不发送新消息，不模拟员工点击，不运行额外测试。Subagents: none。下方 v12 和共享文本框叙述为历史。

2026-09-08 最新交付 v12：按 User 截图提议，未提交时按钮为“提交”；成功后普通文字及“编辑”，点编辑恢复带原文的输入框。个人行本人权限、今日交付本群共享、删除、独立队列与09:45保留。编辑切换也持久化并递增版本，防止旧回调覆盖；成功保存后关闭编辑。三脚本语法检查通过；确认没有待确认意图或排队请求后更新代码，三群原卡真实 LAYOUT_UPDATED / MEETING_READY、rows=1/11/10，无重新发卡或模拟员工操作。新交互待实际使用反馈，Task Review。备份位于本机 `.local/meeting/code-backup-before-edit-mode/`，有 edit 意图或打开编辑状态时不能直接回退旧代码。Subagents: none。

2026-09-08 并发修复已部署：正常更新不再挡住其他人的提交；有效请求最小字段先入本群持久队列再回应，依次更新对应组件。更新成功时合入最新状态，防止覆盖异步等待中新收到的请求；同一行重复点击提示等待，结果未知保留当前意图和后续队列。按群隔离、本人权限、行版本、09:45、预填关闭和提醒暂停保留。两个脚本语法检查通过；STOP_VERIFIED 后真实 HTTP101 / CONNECTED，原三群恢复1/10/9行，没有重新发卡或模拟操作。尚无修复后真实并发提交证据，交 Review，不标记 Done。操作与恢复入口见 [MEETING.md](../tools/callback-test/MEETING.md)，细节见 [脱敏证据](../docs/MEETING_ACCEPTANCE.md)。Subagents: none。

User 新增长期开发要求：提前推演多人并发、重复操作、处理中到达的新请求及失败/重启恢复；验证直接针对具体风险，减少无关测试、重复检查和哈希比对。已写入本机全局 `~/.codex/AGENTS.md`，供后续开发及其他会话遵守。唯一下一步是正式 Review；以下为历史迭代快照。

2026-09-08 当前决定：User 要求正式群2恢复成群1规则，并确认现有卡片直接生效。已仅修改本机群2配置为 prefill=false、submit=owner、delete=owner；群名、ID、记录、今日交付和工作日09:45调度保留。当前程序以短暂重启加载配置，HTTP101 / CONNECTED，三群原消息恢复1/8/6行，未重新发卡；今日交付仍全群共用。预填名单匹配及新增只读权限流程已暂停，不再等待权限或运行 resolver；可选代码保留但不启用。没有自动测试、模拟交互或全局网络变更。Task Review，等待正式代码 Review。Subagents: none。

两个正式群已启用：User 完成群2本机填写及添加后，群2沿用群1规则 enabled=true / schedule=true / start_date=2026-09-08。重启后 HTTP 101 / CONNECTED、groups=3 / scheduled=3 / time=09:45，测试群原消息两行恢复；两个正式群明天开始，今天未补发。User 已修改本机显示群名，本次按旧配置的既有群 ID 排除并识别唯一新增群，保留用户命名，不依赖固定“正式群1/2”文字识别。10:15 提醒继续暂停。最外层“编辑群配置.cmd”可直接打开配置，真实群名及 ID 不进入仓库。未来准点发送未到时实测，Task 继续 Review。Subagents: none。

最新实现 v11：策划、程序、今日交付三个同级区域。今日交付为全群共用的一个文本框，内容/操作两列，所有群成员可提交或清空，个人行归属检查不变。共享内容与 revision 随按群/日期状态保存；独立版本检查、相同意图恢复与串行更新沿用现有机制。现场 HTTP 101 / CONNECTED、time=09:45、MEETING_RESUMED rows=2 / LAYOUT_UPDATED / MEETING_READY，原两行和消息保留，未模拟提交或清空。新增区直接供 User 使用，正式交付等待 Review。Subagents: none。

当前 User 决定：本轮卡片效果已明确验收通过；工作日发卡改为北京时间 09:45，每群每天一张，仍只有测试群启用。10:15 按指定名单 @ 未提交人员的提醒已由 User 暂停，不实施、不读取群成员、不收集名单，作为以后看需求的 Idea 留档，不新建 Task。正式实现继续等待 Review。以下为此前迭代快照。

当前最新为布局 v10：在 v9 排列上增加新行红色“未提交”按钮（revision=0，官方 danger 红字样式）；首次提交成功后变为蓝色“提交”。不监听未发送草稿、不模拟新行；依然只更新最近原消息。此前尺寸、隐藏他人按钮的限制与本人操作校验不变。

当前最新布局 v9：姓名 80px、内容 340px、操作区 92px；“提交 / 删除”短按钮并排，内容默认一行、达列宽自动换行增高，姓名与按钮顶部对齐。已真实连接并 LAYOUT_UPDATED / MEETING_READY，保留最近原消息及两行，未重新发送。User 要求按查看者隐藏他人按钮，当前 JSON 2.0 共享模式不提供该能力，明确未实现；只允许本人操作的校验保留。不改独享卡片或增加复杂架构，等待 User 查看与 Review。下方为此前迭代记录。Subagents: none。

后续标注截图明确姓名、内容和操作必须同一行：v6 的 fill 宽度导致输入独占整行，排版未通过。现为 v8，姓名 80px、内容 280px、按钮在右侧，表头同步；内容默认一行，达列宽自动换行增高，未设置六行上限，其他区域顶部对齐。只更新最近原消息，不补发，不提前记验收通过。

最新 UI 增量：布局 v6 已热更新最近一条卡片，保留两行；“重新保存 / 删除本行”并排放右侧操作区域，内容框默认一行、记录间距 4px。采用每行水平根表单保留 20 行元素预算。User 已取消补发，本次未新发消息。真实 HTTP 101 / CONNECTED / LAYOUT_UPDATED / MEETING_READY；前次 User 的删除、再添加及保存已取得成功状态。新 UI 等 User 直接查看，不把条件式“没问题就通过”记作验收通过；不追加自动测试。代码备份在本机 .local/meeting/code-backup-compact-v04。Subagents: none。

### 当前交付 v0.4.0（优先于下方历史快照）

User 已认可两区效果，追加本人删除、24px 加粗分区标题及多群工作日北京时间 10:00 每群每天一张。已按 Registry / 远端防重续接 TASK-0028；准备 commit AI-Workspace@96e5fa6。正式群尚未指定，本机仅测试群 enabled=1 / scheduled=1；Group JSON 与按群/日期状态位于受限 .local/meeting，应用密钥未复制。

现有测试卡片已迁移并真实更新，保留原消息与两行记录。HTTP 101 / CONNECTED、SCHEDULE_CONFIGURED、MEETING_RESUMED rows=2 / LAYOUT_UPDATED / MEETING_READY 已取得；今天未重复发卡。删除核对操作者与行版本，只删除本人行，成功后可换区添加；程序单进程处理多个配置群，逐日 UUID 与状态防重，10:00 后启动补当天缺卡，不补历史日期。

操作入口仍为桌面 START_MEETING.cmd，详见 [操作说明](../tools/callback-test/MEETING.md)。程序必须持续运行才能定时和接收填写；未设置自启、系统服务或更改全局网络安全配置。重启前代码已备份，原单卡状态保留为历史文件，旧版不能直接接管新的逐日状态。

唯一下一步：现有增量交 ChatGPT Review；User 在测试群直接使用，有问题再改，正式群由 User 稍后指定。未运行新增自动测试或模拟员工操作，未冒称删除回调或未来 10:00 实测通过。不标记 Done。Subagents: none。

### 上一轮两区域交付（历史）

User 最终批准：同一张卡片按“策划 / 程序”分两个区域，各有“人员、晨会内容”两列与“＋ 添加我的一行”。姓名由真实操作者带入；点哪个区就在该区创建本人行，默认每人每张卡片只一行。User 取消部门列及自动读取，通讯录查询已删除，不继续申请部门字段权限。10:00 定时关闭，按 User 要求直接验收、边验边改。

正式 Task 已重新 fetch、防重、Registry 校验并续接 TASK-0028，14 canonical / 0 collision / valid，reservation pending-main。两仓库各在原隔离分支继续，没有另占任务编号，也未修改 Document Assistant。

当前入口：tools/callback-test/START_MEETING.cmd；实际目录为 User 桌面 EarlyMeeting-local-callback-test。凭据沿用受控 JSON；.local/meeting 仅当前用户及 SYSTEM，保存本人内容、区域、关联及最小待确认操作，不保存原始回调、完整日志或通讯录。

现场：16:26 空卡片实发；16:27 User 新增一行，16:28 保存原职位/内容。按 User UI 反馈先修正三列，再根据最新决定切为两区域；真实 MEETING_RESUMED rows=1 / LAYOUT_UPDATED same_message=true / MEETING_READY 已取得。原唯一记录按 User 原手填“策划”放入策划区，内容保留；每行采用独立根表单。接收程序保持连接供 User 验收。

本次重启捕获 IPv4 TCP ETIMEDOUT，之后自动重连取得 HTTP 101；已定位握手前超时阶段，但具体网络设备、代理或路由根因仍未确认，未改全局网络配置。

唯一下一步：User 与同事直接使用，发现实际问题再由 Codex 修改；现有核心实现提交等待 Review，不另加多人/手机/压力测试或验收清单，不标记 Done。详见 [操作说明](../tools/callback-test/MEETING.md) 与 [脱敏证据](../docs/MEETING_ACCEPTANCE.md)。User 要求停止后没有再运行自动测试，旧离线记录不当作最新 UI 已通过。Subagents: none。

## 前一诊断阶段证据（历史，不代表当前范围）

- 业务分支：codex/task-0028-local-callback，基于新 PR #3@b18e393；旧 PR #1/#2 已关闭且未合并。
- User 确认桌面 EarlyMeeting-local-callback-test 是实际目录，v0.1.0 / Node v24.20.0 / SDK 1.73.3。旧源文件已原位备份。
- User 追加授权本机 JSON：已创建受 ACL 限制且 Git 忽略的 .local/config.json；User 自行填写，启动无需反复输入。
- 2026-09-07 15:13:25 北京时间真实 ENDPOINT_OK / CONNECTED；未升级 Node/SDK或更改全局网络安全配置。后续重启复现过入口成功后握手失败，当前增加专属 transport 观察器并再次取得 HTTP 101 / CONNECTED；间歇底层根因尚未确认。
- 离线 43 组既有回归与 8 项新增测试通过。User 追加“一键发送”已实现，现有应用/指定群/现有模板实发一张成功，再次执行防重通过。发送仅用于本轮手动测试，未更新原卡片或启用定时。
- User 最终确认此前漏加回调；补充新版 card.action.trigger 及发布步骤后，15:41:10、15:41:14 两次真实 CALLBACK_OK / INPUT_CHECK verified=true；User 截图收到测试 toast。form_value 字段数 0，仅独立文本验收通过，完整三列表单未验收。15:42:27 STOP_VERIFIED / NOT_RUNNING。详见 [脱敏实测摘要](../docs/CALLBACK_VALIDATION.md)。
- 一键启动、手动发卡、检查、停止、回滚见 [操作说明](../tools/callback-test/README.md)。不保存工作内容、不更新公共卡片、不启用定时。Subagents: none。
- 当前唯一下一步：ChatGPT Review 本轮最小修复、两次真实独立输入及停止证据。保留完整三列表单与间歇网络根因未验收；再审阅 [多人汇总范围说明](../docs/CURRENT_DIRECTION.md#后续产品目标澄清)，不自动启用保存或公共卡片更新。

## 原接管 Gate（已执行，保留依据）

本轮 Review 追加需求：User 明确要求空卡片通过“＋添加我的一行”动态新增本人行，姓名自动带入，职位与内容在该行填写和保存；替换此前底部统一填写区建议。规格见 [后续产品目标澄清](../docs/CURRENT_DIRECTION.md#后续产品目标澄清)。已防重并续接既有 Roadmap Backlog，没有新建 Task、修改线上模板或启用业务保存/共享更新。示意仅用于确认交互，真实动态行及多人并发仍需实测。Subagents: none。

1. 安全同步 AI-Workspace 与 EarlyMeeting 最新 main，读取 Global/Project AGENTS、最新 Task/Registry、Status、Handoff 和本文件；保护未提交修改。确认本机是否为 User 实际运行测试的 Windows 环境。
2. 旧 PR #1/#2 及其交接已被 User 作废，不按旧 MVP 继续，也不把「Codex 继续暂停」当成当前指令。检查旧 PR 的 Superseded/closed 状态；只引用历史代码，不直接合并旧分支。
3. 运行最新 Task Registry scan/validate，完成目标防重和有效 project_key 核对。已有同目标 active Task 时按治理规则更新/继续；没有时在独立非 main linked worktree 通过 remote-CAS allocator 合法登记。禁止猜编号、手改 Registry 或跳过冲突 Gate。
4. 将 CURRENT_DIRECTION.md 的本轮范围、非目标、交付、验收、安全和证据边界纳入唯一正式 Task，引用业务规格而不复制旧案。完成必要的 Registry、Status 与 Handoff 更新并推送；发现活动范围、分支或锁冲突时先停止实施。

只有上述准备通过且 canonical Task 为有效执行状态后，才进入本机修复。无需重新询问已经确认的「保留应用/模板、先本机回调」方向；凭据、安全策略、外部权限与其他确实缺失的授权仍由 User 决定。

## 登记到正式 Task 的实施目标

Goal：复现并定位当前连接失败，在 User 本机接通现有应用的长连接，收到现有测试卡片的真实提交与表单字段。

Scope：环境及旧工具审查、最小连接修复、安全诊断、指定测试群回调接收、离线及本机验证、一键启动/检查/停止与回滚。

Non-goals：本轮不保存工作内容、不更新公共群消息、不启用 10:00 定时，不重建应用，不转多维表格，不购买/部署公网服务，不扩展管理或 AI 功能。

Deliverables：本仓库独立实现分支中的最小修复、测试、中文逐步使用说明、脱敏实测证据、更新后的 STATUS 与 Handoff。

Acceptance：连接和回调分别有真实证据；表单实际传值；失败可定位；停止有效；隐私不泄露。离线检查不替代本机或飞书实测。

Validation：先核对 User 实际目录和版本；UNCLASSIFIED 不代表某个已确定根因，旧 v0.1.1 不是必用修复基线。测试 SDK/运行时假设时使用官方证据并记录版本；不得用自动重装全部环境代替诊断。

Safety：凭据只经本机受控输入，不读回到模型输出；不传原始日志、群/成员标识或员工内容；不改全局防火墙、TLS 或代理。不要导入旧工程中的 .env。测试反馈必须明确未保存、未更新。

Handoff：完成后返回 canonical Task 路径、业务 branch/commit、根因及证据、离线/现场结果分别列示、剩余阻塞和唯一下一步，交 ChatGPT Review 与 User 验收。没有实施证据不得标记 Done。

## 初始 Idea Handoff（历史）

Idea title: EarlyMeeting｜现有飞书晨会卡片的本机回调接入
Suggested section: Current（User 已批准本轮接管；尚未实现验收）
Value: 复用已成功发送的应用与模板，先补通员工提交的接收通道。
Source: 2026-09-07 User 要求 Codex 介入并废止旧 Git 方向。
Related object: EarlyMeeting；本轮合法登记后的 canonical Task。
Evidence / gate: 先本机连接与真实回调；保存和原卡片更新留待下一范围确认，定时暂不启用。
Duplicate checked: yes（核对 AI-Workspace main@1dd6de3 的 Product Roadmap；正式写入前再次核对）。

Codex 按最新规则更新唯一 Product Roadmap 和必要治理引用，不创建同义产品条目。此 Handoff 不表示 Roadmap 已更新，也不授权改变其他业务项目。
