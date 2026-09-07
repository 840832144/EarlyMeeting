# 本人行晨会：一键启动与验收

正式任务：[TASK-0028](https://github.com/840832144/AI-Workspace/blob/codex/earlymeeting-callback-task/tasks/TASK-0028-EARLYMEETING.md)。User 已批准本人行同卡填写，随后将“职位”改成自动带入“部门”，并要求直接在飞书验收、边验边改。

## 当前操作

实际目录：`C:\Users\admin\Desktop\EarlyMeeting-local-callback-test`。

1. 双击 **START_MEETING.cmd**，保持窗口打开。沿用已经填好的 `.local/config.json`，无需重新输入密钥；出现 **CONNECTED / MEETING_READY** 后打开配置的测试群。
2. 首次启动发送本轮一张空卡片。后续启动恢复同一张及已保存记录，不另发消息，不按日期自动创建新一轮。
3. 点 **＋ 添加我的一行**：人员按真实点击者身份显示，部门按飞书通讯录自动读取，员工只填晨会内容。
4. 点 **保存本行**。提示“正在保存”只表示已接收；本行更新后按钮显示“已保存 · 再保存”。修改后再点该按钮。
5. 同事加入当前测试群后也点加号，创建自己的行。程序不另设员工白名单、不要求员工填密钥；若飞书提示应用无权限，需将其纳入现有应用可用范围。读取部门另受应用通讯录权限范围控制。
6. **CHECK_MEETING.cmd** 只显示运行状态和脱敏状态码；**STOP_MEETING.cmd** 停止本轮进程并保留记录。重新启动继续原卡片。

表头和每行采用“人员｜部门｜晨会内容”三列，宽度比例 1:1:3。当前按最多 20 人设计、内容最多 300 字，同时检查整卡组件数和体积；接近容量上限时需精简内容。逐字输入不发送，点保存后同步。手机、窄窗口以及多人输入保留效果由 User 直接验收。

当前是共享卡片：客户端可能允许点进他人的输入框，服务端根据真实操作者拒绝保存他人行；人员和部门均不接受客户端填写。重复点击加号不会重复建行。

## 自动部门需要的应用权限

当前实际读取返回 **99991672**，尚未取得部门读取权限。卡片因此显示 **部门待同步**；不能用旧职位、聊天截图或猜测代替通讯录结果。权限配置完成后重新启动，会补齐当前记录的部门并更新同一张卡片。

在现有「晨会记录」应用后台 → 权限管理，按需开启：

- 获取通讯录基本信息：`contact:contact.base:readonly`。
- 获取用户组织架构信息：`contact:user.department:readonly`。
- 获取部门基础信息：`contact:department.base:readonly`。

通讯录权限范围需包含本轮员工及其部门；配置后发布修改。权限和发布由 User 决定、操作，不修改组织全局策略。员工不需要逐个提交凭据。只根据实际回调操作者查本人部门，不枚举全公司通讯录；多部门时展示实际读取的部门名称，未设置则如实显示。

CardKit 另需要 `cardkit:card:write`；本轮已真实创建和更新成功，无需重复申请已具备的能力。

## 遇到提示时

| 提示 | 怎么处理 |
| --- | --- |
| ALREADY_RUNNING | 使用已打开窗口；诊断模式与晨会模式互斥，同一应用只运行一个接收程序。 |
| DEPARTMENT_UNAVAILABLE | 检查上述权限、应用发布与通讯录范围；不把空值当成已读取。 |
| UPDATE_UNCONFIRMED / UPDATE_PENDING | 尚未确认保存。保留数据交维护者核对，不删文件或重发卡片。 |
| MESSAGE_SEND_UNCONFIRMED | 50 分钟内重启仅重试同一个请求；超时停止，先核对群里消息。 |
| CARD_CREATE_UNCONFIRMED / MEETING_NOT_READY | 创建或布局状态待核对，不自动重建，不清空数据强行重发。 |
| “只能保存自己创建的那一行” | 回到本人姓名的行填写。 |
| “该行已更新” | 使用最新卡片上的本行再保存，避免旧版本覆盖新内容。 |

CardKit 实体有效期 14 天；本程序在 13 天后停止更新，等待维护者处理，不自动开新轮。工作日北京时间 10:00 定时、自启及系统服务均未启用。

## 本机数据与回退

`.local/meeting/` 只允许当前 Windows 用户与 SYSTEM 访问，保存本轮关联标识、本人已提交内容和读取到的部门名称，以及必要的待确认操作。原始回调、回调 token、应用密钥副本、完整通讯录及 SDK 完整日志均不保存。未提交草稿仅存在于飞书客户端，本机无法恢复。

`status.log` 仅固定状态码、行数、字段数和同消息标志，不包含内容和成员标识。不要上传整个 `.local`、业务内容或完整日志。

回退本人行功能：先 **STOP_MEETING.cmd**，再使用原 **START_TEST.cmd** 进入只验证回调的诊断模式，并使用原模板卡片。原模板和 **SEND_TEST_CARD.cmd** 保留。升级前同名脚本备份在 `.local/backup-v0.2.0/`，供维护者按文件恢复；不删除新卡片或数据。旧 **ROLLBACK_TEST.cmd** 是回退到 v0.1.0 的历史入口，不用于清空晨会记录。

## 维护说明

新版 JSON 2.0 由本仓库构建，未覆盖或发布原线上模板。人员通过飞书人员引用显示姓名，部门通过官方 SDK 的单用户和单部门接口取得。日志不输出这些响应。

一个根表单容纳多行分栏，以控制组件数。飞书可能回传整张表单字段，服务端仅提取实际操作者本人行的内容，忽略其他字段，不保存原始表单。行按钮含行标识和版本，服务端同时检查指定群、指定消息、行归属和版本。

新增用 `cardElement.create(insert_before)` 插入加号前，保存用 `cardElement.update` 替换本人分栏。首次排版修正、切换部门列采用一次原卡片布局迁移，保留已保存记录；正常新增/保存为局部更新。先响应点击，再串行写入，UUID 和递增序号先原子保存后调用 API；只有明确成功才标记完成。结果不明或 UUID 冲突保持待确认，不冒充保存成功。

官方依据：[创建卡片实体](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card/create)、[新增组件](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card-element/create)、[更新组件](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card-element/update)、[表单容器](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/containers/form-container)、[获取单个用户信息](https://open.feishu.cn/document/server-docs/contact-v3/user/get)、[获取单个部门信息](https://open.feishu.cn/document/server-docs/contact-v3/department/get)。

保留 Node 24.20.0 / SDK 1.73.3；不改全局网络设置。User 要求直接验收后，晨会启动不运行离线自检、不追加自动测试或模拟群操作；历史检查不代表最新 UI 已通过。Subagents: none。
