# EarlyMeeting｜当前状态

更新时间：2026-09-07。TASK-0028 / EARLYMEETING；User 直接验收、边验边改，交付等待 Review，不标记 Done。

| 项目 | 状态 |
| --- | --- |
| 当前入口 | [两区域一键操作](tools/callback-test/MEETING.md)、[当前方向](docs/CURRENT_DIRECTION.md)、[Handoff](handoff/CODEX.md) |
| 正式准备 | Registry 14 canonical / 0 collision / valid；同目标仅 TASK-0028，续接未另占号，reservation pending-main |
| 本机 | 桌面 EarlyMeeting-local-callback-test；Node 24.20.0 / SDK 1.73.3；沿用本机 JSON，数据目录 ACL 受限 |
| 现有资产 | 原应用、原模板及模板发送入口保留；动态布局由 EarlyMeeting 构建 |
| 发卡与保存 | 16:26 真实空卡片已发送；16:27 User 新增一行，16:28 保存原职位和内容，均为同一消息 |
| 最终 UI | 策划、程序标题 24px 加粗；人员 80px、内容 340px、操作区 92px，提交/删除并排；内容默认一行，达列宽自动换行增高 |
| 当前布局 | v10 已真实 LAYOUT_UPDATED / MEETING_READY，保留最近原消息及两行；新行红色“未提交”，成功后蓝色“提交” |
| 按钮可见性 | 当前共享模式不支持按查看者分别隐藏，未实现隐藏他人按钮；仅本人可提交/删除由服务端强制校验 |
| 部门读取 | User 已取消部门列及自动读取，通讯录查询实现已移除，不再依赖或申请部门字段权限 |
| 当前进程 | HTTP 101 / CONNECTED，单进程接收并调度；无自动测试或系统自启 |
| 使用与收尾 | User 只需核心功能，直接使用、有问题再改；不追加复杂测试或验收清单，提交等待 Review |
| 连接诊断 | 本次重启捕获 IPv4 TCP ETIMEDOUT，随后自动重连取得 HTTP 101；可定位为握手前 TCP 超时，具体网络设备/路由原因仍未确认 |
| 定时与群 | 测试群 scheduled=1；周一至周五北京时间 10:00 每群每天一张，按群/日期防重；正式群尚未接入 |
| 实测边界 | User 真实删除、重新添加和保存已返回成功；新紧凑 UI 直接供 User 查看；尚未到下一次 10:00，多群正式发送未冒称实测通过 |

详见 [脱敏验收记录](docs/MEETING_ACCEPTANCE.md)。User 要求“不要测试，直接让我验收，边验边改”后不再追加自动测试或模拟交互。Subagents: none。
