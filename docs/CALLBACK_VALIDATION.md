# TASK-0028｜本机回调实测摘要

日期：2026-09-07，Asia/Shanghai。业务分支：`codex/task-0028-local-callback`。正式任务：[TASK-0028](https://github.com/840832144/AI-Workspace/blob/codex/earlymeeting-callback-task/tasks/TASK-0028-EARLYMEETING.md)。本页只保留脱敏结果，不包含原始日志或回调。

## 环境与来源

- User 已确认实际目录为 Windows 桌面 `EarlyMeeting-local-callback-test`；本轮在同一电脑原位运行。
- 接管前版本 v0.1.0；Node v24.20.0；飞书官方 SDK 1.73.3；axios 1.20.0。未升级运行时或现场依赖，未改全局代理、防火墙、TLS 或系统服务。
- PR #1/#2 均 CLOSED / Superseded；本轮以 PR #3@b18e393 为方向。旧诊断代码仅选择性复用。
- User 追加要求改为本机 JSON 配置。`.local/config.json` 由 User 自行填写，ACL 仅当前用户与 SYSTEM，Git 忽略；只检查配置完整性，不读取值到工具输出。
- User 随后要求“一键发送”。沿用现有应用、已配置测试群和截图确认的现有模板，新增手动补发入口；模板 ID 只补入本机 JSON，原三项配置保留，ACL 回读通过。没有发布或修改模板。

## 本轮实际结果

| 验证项 | 结果 | 可复核证据边界 |
| --- | --- | --- |
| 本机配置加载 | 通过 | CONFIG_LOADED，凭据未回显 |
| 长连接入口 | 通过 | 15:13:25 北京时间 ENDPOINT_OK |
| 真实 WebSocket | 通过，但存在间歇失败 | 15:13:25 CONNECTED；15:18–15:19 入口成功后握手失败；15:21:38 HTTP 101 / CONNECTED |
| 一键发送及防重 | 通过 | SEND_CONFIG_OK；官方 SDK 返回 code=0，群/消息类型核验通过；再次执行为 SEND_ALREADY_DONE，没有再次请求发送。User 截图确认应用在测试群发出新模板卡片 |
| 真实卡片交互 | 通过 | 15:41:10、15:41:14 北京时间，两次指定测试群 CALLBACK_OK；User 截图收到“未保存、未更新”的测试 toast |
| 独立输入真实传值 | 通过 | 两次 INPUT_CHECK source=input_value、fields=1、marker_matches=1、verified=true；只比较固定虚构文字，未落盘正文 |
| 三列整组表单传值 | 未通过验收 | 两次 form_value 字段数均为 0；人员/职位没有随本次输入框提交共同到达，不能将独立输入验收等同于完整表单 |
| 一键停止 | 通过 | 15:42:27 STOPPED，控制器 STOP_VERIFIED，复查 NOT_RUNNING；此前两次停止验证也通过 |

## 已定位与未确认

已确认旧 v0.1 的日志缺陷：只从字符串提取少数错误码，忽略错误对象、HTTP 状态和嵌套平台错误；`SDK_ERROR / UNCLASSIFIED` 不能定位故障阶段。当前修订按 STARTUP / ENDPOINT / WEBSOCKET / CONNECTED / CALLBACK 分阶段，并从白名单提取 HTTP 状态、允许的网络码、数字平台码和有限原因标签，保留原始 SDK 请求与响应语义。

15:18–15:19 的重新启动中复现了入口成功后 WebSocket 握手失败，约 21 秒后由 SDK 报错，官方 SDK 的 error 监听器丢弃底层错误对象，仅输出固定字符串。这解释了旧提示为何无法定位，但底层失败原因仍待捕获。使用 WSClient 正式 agent 扩展点新增当前连接专属观察器，保留默认 HTTPS 选项、证书校验与 SDK 目标，不修改全局网络配置、不修改 SDK 源码。观察器记录 TCP family、有限错误码和 HTTP upgrade 状态，忽略地址、端口、URL 与票据。15:21:38 带观察器启动拿到 HTTP 101 / CONNECTED；一次成功不证明间歇问题消失。

User 在真实测试群点击卡片后，界面明确提示「该应用尚未配置卡片回调」。User 先确认 App ID 与本机完全一致，再刷新后台并保存长连接方式。补发的新卡片仍出现同一提示，快捷配置页显示「该应用不存在」，本机没有收到回调。这只能证明卡片回调尚未可用，不能据此断言应用已删除或凭据错误；同一应用的实际 API 发送已经成功。

已纠正操作说明遗漏：保存订阅方式不替代添加 card.action.trigger 及发布生效检查。User 先反馈审核通过，随后明确发现尚未添加回调。补充添加新版卡片回传交互及发布步骤后，15:41:10 / 15:41:14 接收程序实际收到交互并匹配虚构文字，User 截图显示程序返回的测试 toast。因此已确认本次卡片无回调的关键缺口是缺少回调订阅。未由 Codex 自动修改应用权限、创建新应用或发布版本；快捷配置页“应用不存在”的跳转原因未独立定位，不能归因为应用被删除。

User 提供的模板截图含下拉框和带箭头的输入框。实测为独立 action.input_value，form_value 字段数 0。现有单行控件尚未形成三列表单，也没有多人汇总区。本轮保留模板，不为达成测试指标擅自改动它；下一范围需评审表单容器及同一张卡片汇总更新。

## 离线验证

- 43 组原诊断回归通过。
- 8 项新增 Node 测试通过：虚构表单匹配及隐私、嵌套 HTTP/平台错误脱敏、入口成功不代替握手、旧停止请求不停止新会话、独立输入匹配、真实 loopback TLS 错误脱敏，以及发送目标/模板绑定、同 UUID 重试、成功防重、过期/并发停止。
- Windows PowerShell 启动及控制脚本解析通过；现场 CHECK_TEST 为 RUNNING，UTF-8 中文显示已校正。
- 固定依赖 npm ci 成功；不执行第三方安装脚本。依赖锁文件只含公开 npm registry 地址。
- `.local/config.json` 确认为 Git 忽略。提交前仍需检查整个 diff、链接与脱敏摘要。

## 后续验收

连接、真实卡片交互、独立文本、防重发送及停止已有现场证据；完整三列表单和间歇握手的底层网络原因仍未验收。本轮提交 Review，不标记 Done，不合并 main。接收程序已停止；需要继续联调时双击 START_TEST.cmd。下一步先审阅本修复与 [多人汇总范围说明](CURRENT_DIRECTION.md#后续产品目标澄清)，再决定模板/存储/更新范围。Subagents: none。

## 官方依据

- [飞书卡片回调协议](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-callback-communication)及 [飞书官方 CLI 字段说明](https://github.com/larksuite/cli/blob/main/skills/lark-im/references/lark-im-card-action-reply.md)：独立 input_value 与表单 form_value 分别核对，接收服务启动不能替代应用后台回调配置。
- [Node net.Socket 连接事件](https://nodejs.org/api/net.html#event-connectionattemptfailed)：观察单次连接失败及 address family；输出不包含 IP/端口。
- [飞书添加回调流程](https://open.feishu.cn/document/event-subscription-guide/callback-subscription/add-callback)：核对回调订阅与应用发布生效；[官方消息 UUID](https://larksuite.github.io/oapi-sdk-java/com/lark/oapi/service/im/v1/model/CreateMessageReqBody.Builder.html)用于发送请求防重。
- 首次 loopback 回归因 fixture 未释放服务端 socket 超时，已修正 teardown 并增加超时边界；目标程序未受其测试数据影响。Windows OpenSSL 的该合成错误为 EPROTO，加入有限错误码白名单后 6/6 通过。
