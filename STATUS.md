# EarlyMeeting｜当前状态

更新时间：2026-09-07。正式 Task：TASK-0028 / EARLYMEETING；User 直接验收、边验边改，等待 Review，不标记 Done。

| 项目 | 状态 |
| --- | --- |
| 当前入口 | [本人行一键操作](tools/callback-test/MEETING.md)、[当前方向](docs/CURRENT_DIRECTION.md)、[Handoff](handoff/CODEX.md) |
| 正式准备 | Registry 14 canonical / 0 collision / valid；同目标仅 TASK-0028，续接未另占号，reservation pending-main |
| 本机 | 桌面 EarlyMeeting-local-callback-test；Node 24.20.0 / SDK 1.73.3；沿用本机 JSON，数据目录 ACL 已限制 |
| 原资产 | 现有应用、原线上模板及模板发送入口保留；动态布局由 EarlyMeeting 代码构建 |
| 发卡 | 16:26:54 HTTP 101 / CONNECTED；16:26:56 空卡片真实发到指定测试群，MEETING_READY |
| 本人行 | 16:27:45 ROW_ADDED rows=1；16:28:03 ROW_SAVED rows=1 / fields=2 / same_message=true |
| UI 修正 | 首版姓名独占一行，User 不接受；已按反馈改成固定三列 1:1:3，内容栏加宽，同一消息及保存内容保留 |
| 最新需求 | 第二列从职位改为自动部门；员工只填晨会内容，新布局已更新到原卡片 |
| 自动部门 | 现有应用读取通讯录返回 99991672（权限不足）；暂显示“部门待同步”，等待 User 配置权限及发布，不猜部门 |
| 多人验收 | User 可邀请同事进入配置的测试群直接填写；新三列布局、另一员工加入、互相不可代改、同时输入保留、手机效果由 User 继续验收 |
| 接收进程 | 晨会模式保持长连接供 User 验收；一键启动不再运行离线自检 |
| 旧连接问题 | 诊断丢弃 SDK 错误细节的缺陷已处理；间歇握手失败的底层网络原因仍未确认 |
| 边界 | 仅指定测试群、受控本机保存；其他群、生产部署、自启与工作日 10:00 调度未启用 |

证据见 [本人行验收摘要](docs/MEETING_ACCEPTANCE.md)。User 要求“不要测试，直接让我验收，边验边改”后，不再追加自动测试或模拟交互。Subagents: none。
