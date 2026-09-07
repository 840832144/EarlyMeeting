# 晨会卡片：添加、保存、删除与定时发送

正式任务：[TASK-0028](https://github.com/840832144/AI-Workspace/blob/codex/earlymeeting-callback-task/tasks/TASK-0028-EARLYMEETING.md)。实际目录：`C:\Users\admin\Desktop\EarlyMeeting-local-callback-test`。保留现有「晨会记录」应用、原模板和原发送入口，不需要部门或通讯录读取权限。

## 日常操作

1. 双击 **START_MEETING.cmd**，保持电脑开机、联网，程序持续运行。沿用本机凭据 JSON，不用重新输入密钥。
2. 在当天卡片的 **策划** 或 **程序** 区域点 **＋ 添加我的一行**。分区标题为 24px 加粗，姓名自动带入；填写晨会内容后点 **保存本行**。
3. 选错区域时，点本人行的 **删除本行**；行消失后到正确区域重新添加。删除会移除该行已保存内容，新行从空内容开始。仅本人可保存和删除，每人每卡最多一行。
4. **CHECK_MEETING.cmd** 查看状态，**STOP_MEETING.cmd** 停止。重启恢复当天同一卡片与已保存记录，不重复发消息。

每张卡片最多 20 行、每行最多 300 字，同时受整卡容量限制。输入时不保存，按钮变为“已保存 · 再保存”后才完成同步。他人可能能点入客户端输入框，但无法保存或删除你的行。

## 工作日 10:00 与多个群

当前本机仅启用「晨会记录测试」群。正式项目群等 User 确定后，将现有机器人加入目标群，再配置其群 ID。员工加入群即可操作；若飞书提示无应用权限，再由 User 调整现有应用可用范围，不给员工配置密钥。

每个启用定时的群在 **周一至周五、北京时间 10:00** 独立发送当天一张空卡片，全天在这一张上填写。按北京时间计算，不受 Windows 显示时区影响。当天 10:00 后才启动或恢复连接，会补发当天缺少的卡片；不补发过去日期，不在周末自动发送。当天已发送则继续使用，重启也不重发。旧日期卡片保留展示，填写使用当天卡片。

电脑关机、睡眠、断网或程序停止时无法准点发送或处理填写。没有设置 Windows 自启、系统服务或改变全局网络配置。原测试卡片已归入今天，不因启用定时再补发；下一次正常发送为 **2026-09-08 10:00**。

多群配置在本机 **.local/meeting/groups.json**，凭据仍在 **.local/config.json**。修改后停止并重新启动。参考 [groups.example.json](groups.example.json)，示例正式群默认关闭，不包含真实标识。

| 字段 | 含义 |
| --- | --- |
| name | 本机便于识别的群名 |
| chat_id | 现有机器人已加入的群 ID，仅填在本机 |
| enabled | 是否接收该群当天卡片的操作 |
| schedule | 是否在工作日 10:00 给该群发当天卡片 |
| start_date | 定时开始的北京时间日期，YYYY-MM-DD |

第二个项目群只需增加一个配置，各群独立保存日期、消息和内容。重复启用同一群 ID 会拒绝启动。`timezone`、`time`、`weekdays` 固定为当前批准的北京时间、10:00、周一至周五。

## 遇到提示时

- **ALREADY_RUNNING**：使用现有进程，同一应用只运行一份；诊断与晨会模式互斥。
- **已经在某区有一行**：继续填写已有行，或删除本人行后换区添加。
- **只能保存或删除自己创建的那一行**：操作本人姓名的行。
- **该行已更新**：使用最新卡片上的按钮。
- **UPDATE_UNCONFIRMED / UPDATE_PENDING / MEETING_NOT_READY**：结果尚未确认，保留本机数据交维护者核对，不删文件强行重发。
- **MESSAGE_SEND_UNCONFIRMED**：50 分钟内重启只重试同一请求；超时先核对群消息。
- **LOCAL_STATE_INVALID**：核对本机群配置和状态文件，不上传凭据或原始文件。

## 维护者说明

一个官方 SDK 长连接服务所有配置群，回调核对实际群、当天消息、操作者、行归属与版本。每区一个根表单、每行两列分栏，服务端只取实际操作者所点行的内容字段，其余回传字段不保存、不输出。客户端不设置必填以便删除空行；保存仍由服务端校验本人内容非空及长度。

新增用 `cardElement.create(insert_before)`，保存用 `cardElement.update`，删除用 `cardElement.delete`。布局 v5 一次更新原消息并保留已保存行；后续操作只改对应行。

`.local/meeting/` 仅当前 Windows 用户与 SYSTEM 可访问。状态按 `days/<应用与群的哈希>/<北京时间日期>/meeting-state.json` 独立保存。首次升级复制并核对原状态，保留原卡片、消息和两行记录；原文件作为历史备份，不再作为运行状态。不要删除该目录来“重新发送”。

发送 UUID、更新 UUID、递增序号和意图先原子保存再请求飞书。结果不明确或 UUID 冲突保持待确认，不冒充成功。各群单独处理失败；定时失败不盲目另建卡片，核对后重启从同一状态恢复。输出仅状态码与数量，不保留原始回调、完整 SDK 日志、回调 token 或通讯录。

升级前代码在本机 `.local/meeting/code-backup-v0.3.0/`。旧程序不识别逐日状态，不能直接覆盖当前数据继续运行；回退先停止并核对当天消息与状态。原 START_TEST.cmd / SEND_TEST_CARD.cmd 仅用于历史模板诊断。

官方依据：[表单容器](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/containers/form-container)、[字号](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/content-components/rich-text)、[删除组件](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card-element/delete)。

User 要求只做核心功能、使用中反馈；本次不增加自动测试或模拟员工操作，历史测试结果不代表新功能全量验证。Node 24.20.0 / SDK 1.73.3 不变。Subagents: none。
