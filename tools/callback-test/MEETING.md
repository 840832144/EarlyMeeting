# 策划 / 程序晨会：一键启动与验收

正式任务：[TASK-0028](https://github.com/840832144/AI-Workspace/blob/codex/earlymeeting-callback-task/tasks/TASK-0028-EARLYMEETING.md)。当前按 User 最终决定：同一张卡片分“策划”“程序”两个区域，各有“人员、晨会内容”两列和“＋ 添加我的一行”。部门列和自动通讯录读取已取消。

## 怎么使用

实际目录：`C:\Users\admin\Desktop\EarlyMeeting-local-callback-test`。

1. 双击 **START_MEETING.cmd**，保持窗口打开。沿用已填好的 `.local/config.json`，无需重新输入密钥。出现 **CONNECTED / MEETING_READY** 后打开指定测试群。
2. 首次启动发送本轮一张空卡片；后续启动恢复原卡片和已保存记录，不重复发消息，不按日期自动开新轮。
3. 在“策划”或“程序”区域点 **＋ 添加我的一行**。姓名自动带入，员工填写自己的晨会内容，点击 **保存本行**。
4. “正在保存”只表示接收；本行更新后按钮显示“已保存 · 再保存”。需要修改时仍保存本人行。默认每人每张卡片一行，重复或跨区点击加号会提示回到已有行，不重复创建或擅自移动。
5. 同事加入当前测试群即可点击对应区域的加号。程序没有单独员工白名单，也不要求同事提供密钥。若飞书提示无权使用应用，由 User 将其纳入现有应用可用范围。
6. **CHECK_MEETING.cmd** 显示运行状态及脱敏状态码；**STOP_MEETING.cmd** 停止并保留记录。重启继续同一张卡片。

两个区域都使用人员 / 内容 1:4 列宽。当前最多 20 人、每行内容最多 300 字，并检查整卡组件数和体积；接近上限时提示精简。逐字输入不发送，点保存后同步。手机、窄窗口及多人同时输入的实际效果由 User 验收。

当前共享卡片客户端可能允许点进他人输入框，但服务端根据真实操作者拒绝保存他人行；姓名不可代选。每一行使用独立表单，仅回传本人所操作行的内容。

## 权限与边界

现有应用、原线上模板和模板发送入口保留。新版布局由本仓库构建；不重新创建应用，不覆盖或发布原模板。

“策划 / 程序”由点击哪个区域决定，不从员工档案推断；已删除通讯录查询实现，因此不需要申请“获取用户组织架构信息”等部门读取权限。已在应用后台开启的其他权限由 User 管理，程序不会擅自撤销。

仅处理配置的测试群和本轮消息。工作日北京时间 10:00 定时、自启、系统服务、其他群及生产部署均未启用。CardKit 实体有效期为 14 天，本程序在 13 天后停止继续更新并交维护者处理，不自动新开一轮。

## 遇到提示时

| 提示 | 怎么处理 |
| --- | --- |
| ALREADY_RUNNING | 使用已打开窗口；诊断模式与晨会模式互斥，同一应用只运行一个接收程序。 |
| UPDATE_UNCONFIRMED / UPDATE_PENDING | 尚未确认保存；保留本机数据交维护者核对，不删文件或重新发卡。 |
| MESSAGE_SEND_UNCONFIRMED | 50 分钟内重启仅重试同一个请求；超时停止，先核对群里消息。 |
| CARD_CREATE_UNCONFIRMED / MEETING_NOT_READY | 创建或布局状态待核对，不自动重建，不清空数据强行重发。 |
| “只能保存自己创建的那一行” | 回到本人姓名的行填写。 |
| “该行已更新” | 使用最新卡片上的本人行重新保存，避免旧页面覆盖新内容。 |
| “已经在某区有一行” | 在已有行继续填写；不自动跨区移动。 |

## 本机数据与回退

`.local/meeting/` 仅当前 Windows 用户与 SYSTEM 可访问，保存本轮关联标识、本人内容、区域和最小待确认操作。不保存原始回调、回调 token、应用密钥副本、员工通讯录或 SDK 完整日志。未提交草稿仅在飞书客户端，本机无法恢复。

`status.log` 仅固定状态码、行数、字段数及同消息标志，不包含内容或成员标识。不要上传整个 `.local`、业务数据或完整日志。

回退本人行功能：先 **STOP_MEETING.cmd**，再使用原 **START_TEST.cmd** 和原模板卡片进行诊断。原 **SEND_TEST_CARD.cmd** 保留。升级前同名脚本备份在 `.local/backup-v0.2.0/`，供维护者按文件恢复，不删除新卡片或数据。旧 **ROLLBACK_TEST.cmd** 是回退到 v0.1.0 的历史入口，不用于清空晨会记录。

## 维护依据

姓名用飞书人员引用按真实操作者显示；不读取通讯录。每行一个根表单，内含两列分栏，保存按钮携带行标识和版本。服务端校验指定群、消息、实际操作者、行归属和版本；新增位置只能为已定义的策划或程序区域。

新增用 `cardElement.create(insert_before)` 插入所选区域的加号前，保存用 `cardElement.update` 替换本人表单。布局迁移一次更新原卡片并保留已保存行；当前唯一旧记录按 User 原先手填“策划”放入策划区，批量未知旧记录不会猜分区。正常新增/保存只改对应行。

先响应点击，再串行更新，UUID 和递增序号先原子保存后调用 API。只有明确成功才标记完成；结果不明或 UUID 冲突保持待确认，不冒充保存成功。重启重用本轮卡片及待确认请求，不产生第二条消息。

官方依据：[创建卡片实体](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card/create)、[新增组件](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card-element/create)、[更新组件](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card-element/update)、[表单容器](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/containers/form-container)。

保留 Node 24.20.0 / SDK 1.73.3，不改全局网络配置。User 要求直接验收后，晨会启动不运行离线自检，不追加自动测试或模拟群操作；历史检查不代表最新 UI 已通过。Subagents: none。
