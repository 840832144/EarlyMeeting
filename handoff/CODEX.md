# Codex Handoff｜EarlyMeeting 本机卡片回调接管

- Date：2026-09-07
- User decision：Approved
- Owner：User / ChatGPT
- Executor：Codex（等待本机接管）
- Priority：EarlyMeeting 当前首要步骤；不改变其他项目优先级。
- Execution repository：840832144/EarlyMeeting
- Project key proposal：EARLYMEETING；正式登记前按最新治理规则验证。
- Status：Task preparation；没有 canonical ID，不等于 Ready Task。
- 完整范围：[CURRENT_DIRECTION.md](../docs/CURRENT_DIRECTION.md)
- 现场状态：[STATUS.md](../STATUS.md)

## 先完成正式任务准备

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

## Idea Handoff

Idea title: EarlyMeeting｜现有飞书晨会卡片的本机回调接入
Suggested section: Current（User 已批准本轮接管；尚未实现验收）
Value: 复用已成功发送的应用与模板，先补通员工提交的接收通道。
Source: 2026-09-07 User 要求 Codex 介入并废止旧 Git 方向。
Related object: EarlyMeeting；本轮合法登记后的 canonical Task。
Evidence / gate: 先本机连接与真实回调；保存和原卡片更新留待下一范围确认，定时暂不启用。
Duplicate checked: yes（核对 AI-Workspace main@1dd6de3 的 Product Roadmap；正式写入前再次核对）。

Codex 按最新规则更新唯一 Product Roadmap 和必要治理引用，不创建同义产品条目。此 Handoff 不表示 Roadmap 已更新，也不授权改变其他业务项目。
