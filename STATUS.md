# EarlyMeeting｜当前状态

更新时间：2026-09-07。TASK-0028 / EARLYMEETING；策划/程序已获 User 明确验收，新增今日交付直接供使用，正式代码等待 Review，不标记 Done。

| 项目 | 状态 |
| --- | --- |
| 当前入口 | [晨会卡片一键操作](tools/callback-test/MEETING.md)、[当前方向](docs/CURRENT_DIRECTION.md)、[Handoff](handoff/CODEX.md) |
| 正式准备 | Registry 14 canonical / 0 collision / valid；同目标仅 TASK-0028，续接未另占号，reservation pending-main |
| 本机 | 桌面 EarlyMeeting-local-callback-test；Node 24.20.0 / SDK 1.73.3；沿用本机 JSON，数据目录 ACL 受限 |
| 现有资产 | 原应用、原模板及模板发送入口保留；动态布局由 EarlyMeeting 构建 |
| 发卡与保存 | 16:26 真实空卡片已发送；16:27 User 新增一行，16:28 保存原职位和内容，均为同一消息 |
| 最终 UI | 策划、程序标题 24px 加粗；人员 80px、内容 340px、操作区 92px，提交/删除并排；内容默认一行，达列宽自动换行增高 |
| 当前布局 | v11 三个同级区域：策划、程序、今日交付；真实 LAYOUT_UPDATED / MEETING_READY，保留最近原消息及两行 |
| 今日交付 | 全群共同编辑一个文本框，交付内容/操作两列；群成员可提交或清空，个人行仍限本人，版本检查防止旧内容覆盖新内容 |
| 按钮可见性 | 当前共享模式不支持按查看者分别隐藏，未实现隐藏他人按钮；仅本人可提交/删除由服务端强制校验 |
| 部门读取 | User 已取消部门列及自动读取，通讯录查询实现已移除，不再依赖或申请部门字段权限 |
| 当前进程 | HTTP 101 / CONNECTED，单进程接收并调度；无自动测试或系统自启 |
| 使用与收尾 | User 明确“这回没问题了”，卡片 UI 验收通过；不追加复杂测试或验收清单，正式代码等待 Review |
| 连接诊断 | 本次重启捕获 IPv4 TCP ETIMEDOUT，随后自动重连取得 HTTP 101；可定位为握手前 TCP 超时，具体网络设备/路由原因仍未确认 |
| 定时与群 | 测试群、正式群1、正式群2 enabled=1 / scheduled=1；两个正式群均从 2026-09-08 开始，周一至周五北京时间 09:45 每群每天一张，按群/日期防重；保留 User 修改的本机群名，真实名称及 ID 不进入仓库 |
| 催交提醒 | 10:15 按指定名单提醒已由 User 暂停；未实施、未启用，未收集名单或读取群成员 |
| 实测边界 | 重启后 HTTP 101 / CONNECTED / SCHEDULE_CONFIGURED groups=3 scheduled=3 time=09:45；测试群原消息两行恢复，没有补发今天的正式群卡片；未来准点触发及正式群发送未到时实测 |

详见 [脱敏验收记录](docs/MEETING_ACCEPTANCE.md)。User 要求“不要测试，直接让我验收，边验边改”后不再追加自动测试或模拟交互。Subagents: none。
