# EarlyMeeting

飞书群内晨会记录。保留现有「晨会记录」应用、原卡片模板和发送入口；同一张卡片分为策划、程序、今日交付三个区域。策划/程序填写本人记录；正式群1手填今日交付，正式群2按已提交记录用现有DeepSeek配置汇总。

## 当前入口

- **[Linux技术接手与Windows→Linux切换](docs/LINUX_HANDOFF.md)**：Docker Compose完整部署入口位于`codex/task-0028-local-callback` / PR #4，当前main不是完整应用；现由Codex按新增授权推进生产移植，服务器身份核验及切换仍待完成。
- **[一键启停、维护日志与每日归档](docs/LINUX_OPERATIONS.md)**：9月16日起归档，当前尚未部署公司服务器。
- [Linux验证结果与未验证项](docs/LINUX_VALIDATION.md)

- [当前方向与范围](docs/CURRENT_DIRECTION.md)
- [本人行晨会：一键启动与 User 验收](tools/callback-test/MEETING.md)
- [状态与证据边界](STATUS.md)
- [Codex 接管与正式任务准备](handoff/CODEX.md)
- [TASK-0028 本机一键操作说明](tools/callback-test/README.md)
- [本机实测摘要](docs/CALLBACK_VALIDATION.md)

2026-09-07 User 明确决定：让 Codex 介入，之前 Git 内容作废，先推进当前本机回调方向。此前 PR #1 的开发案及 PR #2 的独立诊断包交付路线均不再作为执行依据；旧提交仅保留历史和可审查的代码参考，不删除历史、不强推、不清空用户本机目录。

长连接与本人行填写已接通，策划/程序提交后显示文字、编辑后可重提；今日交付在正式群1手填、正式群2按已提交记录自动汇总。当前启用两个正式群，测试群关闭；周一至周五北京时间09:30每群每天一张；当前Windows实例持续使用，Linux版本由Codex继续移植，正式切换待完成。10:15催交提醒暂停。多人输入反馈的稳定组件标识补丁已热更，提交红框、编辑蓝框；真实客户端草稿保留仍待使用反馈，不把接口成功当作缺陷已解决。正式代码等待Review。

本仓库保存业务实现、测试和脱敏交接；AI-Workspace 保持正式 Task、治理与协调真相源。应用凭据、真实群/成员标识、工作内容、运行数据和完整日志不得提交 Git。
