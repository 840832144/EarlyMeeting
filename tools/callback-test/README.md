# 本机卡片回调联调

正式任务为 AI-Workspace [TASK-0028](https://github.com/840832144/AI-Workspace/blob/codex/earlymeeting-callback-task/tasks/TASK-0028-EARLYMEETING.md)。范围以 [当前方向](../../docs/CURRENT_DIRECTION.md) 为准。此工具保留现有应用、卡片模板和发送流程，只验证长连接与现有测试卡片回调。

## 在当前 Windows 电脑操作

实际测试目录是桌面的 `EarlyMeeting-local-callback-test`。Codex 已备份原 v0.1.0 源文件并原位配置本轮脚本，无需重新下载测试包。

1. 在 `.local/config.json` 填写 `app_id`、`app_secret`、`test_chat_id`，保留英文双引号并保存。使用当前「晨会记录」应用及已成功发送卡片的测试群。只在本机填写，不发聊天。JSON 已限制为当前用户和 SYSTEM 可访问，不进入 Git。后续直接复用，不再逐项询问。缺项显示 `CONFIG_INCOMPLETE`；格式错误显示 `CONFIG_JSON_INVALID`，只修改 JSON，不提交日志或凭据。
2. 双击 `START_TEST.cmd`。`CONFIG_LOADED` 只说明配置加载；`ENDPOINT_OK` 只说明入口请求通过；必须出现 `CONNECTED` 才算实际 WebSocket 握手成功。失败时用 `CHECK_TEST.cmd` 查看脱敏阶段和错误码，保留窗口供 Codex 排查。不要修改全局代理、防火墙或 TLS。
3. 连接后，在飞书客户端的指定测试群中操作已发送的卡片。卡片搭建器和「开发者小助手」的预览会话不能替代指定群验收。若提示应用尚未配置卡片回调，由 User 在现有应用后台「事件与回调 → 回调配置」选择长连接并添加 card.action.trigger；不新建应用。完成后，在现有测试卡片中，将一个文本字段填写为 `EARLYMEETING-CALLBACK-TEST` 后提交。不要使用真实工作内容。`CALLBACK_OK` 表示指定群交互到达，`FORM_CHECK fields=...; marker_matches=...; verified=true` 表示至少一个文本字段与这次约定输入一致；其他字段不因此自动验收。现有独立输入框通过 `INPUT_CHECK source=input_value; marker_matches=1; verified=true` 验收，不把它当成整组表单提交。`FORM_EMPTY` 只证明交互到达，未证明文本传值。提示始终说明「未保存、未更新」。不发送新卡片、不更新公共卡片。
4. 双击 `CHECK_TEST.cmd` 查看当前运行状态。只显示已脱敏的状态行；`NOT_RUNNING` 表示当前接收程序不在运行，旧 `CONNECTED` 行属于上一次运行，不能当成当前连接。
5. 双击 `STOP_TEST.cmd`。`STOP_VERIFIED` 表示本轮进程已退出；也可以在原窗口按 Ctrl+C。停止只请求本目录本轮接收程序退出，不终止其他项目进程。`STOP_PENDING` 时在原窗口按 Ctrl+C，再检查状态。
6. 如需回退，双击 `ROLLBACK_TEST.cmd`：先停止，再恢复 `.local/backup-v0.1.0` 中的原始启动脚本。成功显示 `ROLLBACK_OK`；备份不存在则停止，不覆盖文件。回退保留本机 JSON，但旧 v0.1.0 不使用 JSON，仍会询问输入。重新应用本轮版本时只复制仓库工具文件，绝不能整包复制 `.local` 或任何凭据。

## 证据与实现边界

`.local/status.log` 仅记录固定标签、阶段、允许的错误码/HTTP 状态、字段数量和是否匹配虚构输入；`.local/session.json` 只存本轮进程与停止状态。它们不包含原始 SDK 日志、连接票据、回调对象、字段名/值、群/成员标识或工作内容。Git 只接受人工核验过的 [实测摘要](../../docs/CALLBACK_VALIDATION.md)，不上传 `.local`。

本轮无数据库、消息发送、卡片更新、定时、自启或系统服务。返回 toast 是现有卡片交互的测试反馈，不改变卡片内容。只允许指定测试群；群标识缺失或不匹配时拒绝处理。

## 维护与离线验证

保留现场 Node v24.20.0、SDK 1.73.3、axios 1.20.0，依赖树固定于 package-lock.json。审查后选择复用旧 PR #2 的错误白名单、群校验和 43 组回归；不合并旧分支或恢复其交付路线。旧 v0.1 日志丢弃错误对象、不能区分连接阶段，是已确认诊断缺陷；本轮也复现过入口成功后握手失败。当前 WSClient 使用专属 agent 观察 TCP 错误与 HTTP upgrade，不改变全局 Agent、路由或证书校验；不能把后续一次成功说成间歇根因已消除。

仓库工具目录执行 `npm ci --ignore-scripts --no-audit --no-fund` 后执行 `npm test`。离线测试覆盖错误脱敏、入口成功不冒充握手成功、空表单不冒充传值成功、旧停止请求不影响新运行。Windows 启动/停止与真实飞书回调必须单独验证。

官方依据：[飞书 Node SDK](https://github.com/larksuite/node-sdk) 的 WSClient、EventDispatcher、httpInstance 和 logger；本机已安装 1.73.3 的源码为对应运行证据。禁止全局安装/升级或修改 SDK 源码来试错。
