# TASK-0028｜本机回调实测摘要

日期：2026-09-07，Asia/Shanghai。业务分支：`codex/task-0028-local-callback`。正式任务：[TASK-0028](https://github.com/840832144/AI-Workspace/blob/codex/earlymeeting-callback-task/tasks/TASK-0028-EARLYMEETING.md)。本页只保留脱敏结果，不包含原始日志或回调。

## 环境与来源

- User 已确认实际目录为 Windows 桌面 `EarlyMeeting-local-callback-test`；本轮在同一电脑原位运行。
- 接管前版本 v0.1.0；Node v24.20.0；飞书官方 SDK 1.73.3；axios 1.20.0。未升级运行时或现场依赖，未改全局代理、防火墙、TLS 或系统服务。
- PR #1/#2 均 CLOSED / Superseded；本轮以 PR #3@b18e393 为方向。旧诊断代码仅选择性复用。
- User 追加要求改为本机 JSON 配置。`.local/config.json` 由 User 自行填写，ACL 仅当前用户与 SYSTEM，Git 忽略；只检查配置完整性，不读取值到工具输出。

## 本轮实际结果

| 验证项 | 结果 | 可复核证据边界 |
| --- | --- | --- |
| 本机配置加载 | 通过 | CONFIG_LOADED，凭据未回显 |
| 长连接入口 | 通过 | 15:13:25 北京时间 ENDPOINT_OK |
| 真实 WebSocket | 通过，但存在间歇失败 | 15:13:25 CONNECTED；15:18–15:19 入口成功后握手失败；15:21:38 HTTP 101 / CONNECTED |
| 真实卡片交互 | 待 User 在现有测试卡片操作 | 接收程序持续运行；未伪造回调 |
| 真实表单传值 | 待实测 | 需固定虚构输入 marker_matches > 0；其他字段不自动验收 |
| 一键停止 | 通过 | 更新接收程序前两次 STOP_VERIFIED，原启动会话退出码 0；停止后才启动下一份 |

## 已定位与未确认

已确认旧 v0.1 的日志缺陷：只从字符串提取少数错误码，忽略错误对象、HTTP 状态和嵌套平台错误；`SDK_ERROR / UNCLASSIFIED` 不能定位故障阶段。当前修订按 STARTUP / ENDPOINT / WEBSOCKET / CONNECTED / CALLBACK 分阶段，并从白名单提取 HTTP 状态、允许的网络码、数字平台码和有限原因标签，保留原始 SDK 请求与响应语义。

15:18–15:19 的重新启动中复现了入口成功后 WebSocket 握手失败，约 21 秒后由 SDK 报错，官方 SDK 的 error 监听器丢弃底层错误对象，仅输出固定字符串。这解释了旧提示为何无法定位，但底层失败原因仍待捕获。使用 WSClient 正式 agent 扩展点新增当前连接专属观察器，保留默认 HTTPS 选项、证书校验与 SDK 目标，不修改全局网络配置、不修改 SDK 源码。观察器记录 TCP family、有限错误码和 HTTP upgrade 状态，忽略地址、端口、URL 与票据。15:21:38 带观察器启动拿到 HTTP 101 / CONNECTED；一次成功不证明间歇问题消失。

User 在真实测试群点击卡片后，界面明确提示「该应用尚未配置卡片回调」。这是已定位的应用回调配置缺口，与 WebSocket 握手失败分开记录；User 在现有应用后台配置长连接和 card.action.trigger。未由 Codex 自动修改应用权限或发布版本。

User 提供的模板截图含下拉框和带箭头的输入框。按飞书官方协议分别识别 action.form_value 与 action.input_value；不假设自定义字段名，不把独立输入通过写成整组表单通过。

## 离线验证

- 43 组原诊断回归通过。
- 6 项新增 Node 测试通过：虚构表单匹配及隐私、嵌套 HTTP/平台错误脱敏、入口成功不代替握手、旧停止请求不停止新会话，另含独立输入匹配及真实 loopback TLS 错误脱敏。
- Windows PowerShell 启动及控制脚本解析通过；现场 CHECK_TEST 为 RUNNING，UTF-8 中文显示已校正。
- 固定依赖 npm ci 成功；不执行第三方安装脚本。依赖锁文件只含公开 npm registry 地址。
- `.local/config.json` 确认为 Git 忽略。提交前仍需检查整个 diff、链接与脱敏摘要。

## 后续验收

在现有测试卡片中完成一次虚构文本提交，核对实际表单，再停止并验证进程退出。未通过的项保留待实测，不标记 Done。Review 前不合并 main。Subagents: none。

## 官方依据

- [飞书卡片回调协议](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-callback-communication)及 [飞书官方 CLI 字段说明](https://github.com/larksuite/cli/blob/main/skills/lark-im/references/lark-im-card-action-reply.md)：独立 input_value 与表单 form_value 分别核对，接收服务启动不能替代应用后台回调配置。
- [Node net.Socket 连接事件](https://nodejs.org/api/net.html#event-connectionattemptfailed)：观察单次连接失败及 address family；输出不包含 IP/端口。
- 首次 loopback 回归因 fixture 未释放服务端 socket 超时，已修正 teardown 并增加超时边界；目标程序未受其测试数据影响。Windows OpenSSL 的该合成错误为 EPROTO，加入有限错误码白名单后 6/6 通过。
