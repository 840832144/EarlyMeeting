# EarlyMeeting｜当前状态

2026-09-15 Linux代码与交接完成：按[PR #4指定Linux任务留言](https://github.com/840832144/EarlyMeeting/pull/4#issuecomment-5673785774)完成现有服务Linux适配。技术接手唯一入口：[Linux交接说明](docs/LINUX_HANDOFF.md)，验证结果见[Linux验证记录](docs/LINUX_VALIDATION.md)。完整代码仍在codex/task-0028-local-callback / PR #4，最终代码0d4a70b已通过Ubuntu24.04/Linux CI：17/17，Compose两轮重建、单实例锁和SIGTERM退出通过（禁网虚构数据）。TASK-0028继续Review。公司云端尚未部署，本轮没有停止/更新Windows运行实例或向正式群发测试卡。下方保留此前Windows现场历史。

2026-09-15 晨会期间紧急恢复：User要求尽快处理。通过官方SDK只读查询群2今天原消息成功，但消息摘要没有组件ID/版本，不能据此认定原新增行是否成功。STOP_VERIFIED后仅对已持久化的原add意图补试一次，沿用原uuid、sequence、event和行ID；飞书明确成功后由原flush逻辑落盘，ROW_ADDED rows=1，同一消息、原序号，pending=false / queued=0。没有把冲突当成功，没有删除今天状态、重发卡或整卡刷新。重启后真实HTTP101 / CONNECTED，两群MEETING_READY。自动清理469d55e保留，仅今天两份群状态，09:30、权限及AI范围保留。本次是人工恢复，不声称已实现所有未知结果的自动恢复或定位网络根因。Subagents: none。

当日清理部署时状态（后续恢复见上）：User确认以后自动清理、本机只留当天晨会数据。已部署启动/跨天清理，真实RETENTION_DONE files=11 days=8 errors=0，回查仅剩9月15日两份群状态；配置、09:30和当天记录保留。群1可用，群2今日新增行请求曾在8秒后ECONNABORTED/TIMEOUT，unknown意图及1条队列保留，未自动重放，仍待核对。当前连接正常，此错误不能证明必须公司Wi-Fi；不将清理历史当作保存故障已解决。Task继续Review。

最新运行决定（2026-09-10）：两个正式群已加载工作日北京时间09:30，每群每天一张，下一次为2026-09-11。10:12真实CONNECTED / SCHEDULE_CONFIGURED time=09:30 / 两群MEETING_READY，今天原卡10/4行恢复，无重发或布局刷新。草稿保留仍待核实，Task继续Review。以下保留上次代码修复记录。

历史修复记录（2026-09-09）：TASK-0028 / EARLYMEETING；已修复审查第1项队列结束时漏唤醒、第2项临时拒绝后不能自动恢复，两正式群共用补丁已部署。10项针对性离线检查通过，10:34真实CONNECTED / 两群MEETING_READY，原卡11/8行恢复，未重新发卡或刷新布局。第3项草稿保留：本机UI可读但不可操作，User目前不方便核实，保持待核实，不宣称已解决。仅群2调用AI；09:40规则、本人权限及红/蓝按钮保留。代码交Review，未Done。

| 项目 | 状态 |
| --- | --- |
| 当前入口 | [晨会卡片一键操作](tools/callback-test/MEETING.md)、[当前方向](docs/CURRENT_DIRECTION.md)、[Handoff](handoff/CODEX.md) |
| 正式准备 | Registry 15 canonical / 0 collision / valid；同目标仅 TASK-0028，续接未另占号，reservation pending-main |
| 本机 | 桌面 EarlyMeeting-local-callback-test；Node 24.20.0 / SDK 1.73.3；沿用本机 JSON，数据目录 ACL 受限 |
| 现有资产 | 原应用、原模板及模板发送入口保留；动态布局由 EarlyMeeting 构建 |
| 发卡与保存 | 16:26 真实空卡片已发送；16:27 User 新增一行，16:28 保存原职位和内容，均为同一消息 |
| 最终 UI | 策划、程序标题 24px 加粗；人员 80px、内容 340px、操作区 92px；填写时“提交 / 删除”，提交后普通文字及“编辑 / 删除”，长内容自动换行 |
| 当前布局 | 正式群1 v14、正式群2 v15；今天群2原新增行已补试成功，pending=false / queued=0，无重发或整卡刷新 |
| 并发提交 | 结束时重查队列，避免已接收请求无人处理。200810按1/2/5/15/60秒退避，之后每60秒重试原意图；其他行可继续排队。明确拒绝和未知结果分别提示并保留，详情见操作说明 |
| 今日交付 | 仅正式群2自动识别明确交付和预计今日事项；待处理/失败但没有交付内容的人员不显示，也不显示待更新文案；本次原卡移除1处占位，保留3人的实际交付 |
| 行权限 | 三个群均仅本人编辑、提交、删除个人行；正式群2汇总随源记录变化，其他群保留共享交付权限；群/卡片/版本校验保留 |
| 预填开关 | 三个群均关闭；User 已撤回正式群2预填和全员行操作，保留原卡片与记录 |
| 名单权限 | 名单匹配与 im:chat:readonly 开通流程已暂停，不再等待此权限；本轮不查询成员或改变后台权限 |
| 部门读取 | User 已取消部门列及自动读取，通讯录查询实现已移除，不再依赖或申请部门字段权限 |
| 本机保留 | 仅保留北京时间当天晨会状态；启动/跨天清理旧日和旧副本，今日pending与配置保留，飞书历史消息保留 |
| 当前进程 | 重启后真实HTTP101 / CONNECTED，两群MEETING_READY。单进程，无系统自启 |
| 使用与收尾 | 清理14项针对性检查通过，群2原意图人工补试成功，代码与证据交Review；客户端草稿保留仍待核实 |
| 连接诊断 | 本次重启 HTTP101 / CONNECTED；历史间歇 IPv4 TCP ETIMEDOUT 的具体网络设备/路由原因仍未确认 |
| 定时与群 | 两个正式群周一至周五北京时间09:30每群每天一张；2026-09-15启动后两群已发，测试群关闭 |
| 催交提醒 | 10:15 按指定名单提醒已由 User 暂停；未实施、未启用，未收集名单或读取群成员 |
| 实测边界 | 稳定标识与其他行变更隔离的结构检查通过；STOP_VERIFIED、CONNECTED、两群LAYOUT_UPDATED same_message=true、RUNNING已取得。客户端草稿保留尚未实测；后台拿不到草稿，未代提交 |

详见 [脱敏验收记录](docs/MEETING_ACCEPTANCE.md)。User 要求“不要测试，直接让我验收，边验边改”后不再追加自动测试或模拟交互。Subagents: none。
