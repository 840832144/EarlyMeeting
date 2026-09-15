# 本人行晨会｜脱敏验收记录

## 2026-09-15 晨会期间原意图恢复

2026-09-15 晨会期间紧急恢复：User要求尽快处理。通过官方SDK只读查询群2今天原消息成功，但消息摘要没有组件ID/版本，不能据此认定原新增行是否成功。STOP_VERIFIED后仅对已持久化的原add意图补试一次，沿用原uuid、sequence、event和行ID；飞书明确成功后由原flush逻辑落盘，ROW_ADDED rows=1，同一消息、原序号，pending=false / queued=0。没有把冲突当成功，没有删除今天状态、重发卡或整卡刷新。重启后真实HTTP101 / CONNECTED，两群MEETING_READY。自动清理469d55e保留，仅今天两份群状态，09:30、权限及AI范围保留。本次是人工恢复，不声称已实现所有未知结果的自动恢复或定位网络根因。Subagents: none。

证据边界：本次取得原接口成功、落盘和连接状态；尚未把恢复后的真实员工提交作为已验收。下方unknown/未就绪描述为人工恢复前快照。

## 2026-09-15 自动清理，仅保留当天本机晨会记录

User在保留范围澄清中明确选择以后自动清理。运行程序按北京时间，启动及跨天执行，先停止并等待旧日worker，再删除已知旧日状态文件；离线仍清理，关机后下次启动补清。当前日期目录整体跳过，包括pending和.next；配置、迁移标记、代码备份及其他文件不删除。对已知旧副本验证schema及createdAt后清理。删除使用逐文件unlink与空目录rmdir，路径必须留在指定运行目录，拒绝链接/重解析点，不递归删除或调用飞书删除接口。

检查：node --test tools/callback-test/meeting-retention.test.cjs tools/callback-test/meeting-recovery.test.cjs，14/14通过；新增4项覆盖当前/配置保留、目录链接防护、离线跨天先停止writer及今日unknown重启不重放。只有虚构数据和临时目录；无真实群模拟点击或模型调用。

现场：STOP_VERIFIED后只备份旧源码并部署4个运行脚本。真实RETENTION_DONE date=2026-09-15 files=11 days=8 errors=0 today_preserved=true，随后HTTP101 / CONNECTED。回查此前9月7日至10日的状态及旧副本已清理，仅剩今天两份状态；群1原1行/pending=false/queued=0，群2原0行/pending=true/kind=add/recovery=unknown/attempts=1/queued=1。配置存在、time=09:30；没有新发消息、布局更新或重放群2请求。次日跨天仅有离线检查，未冒称已取得未来现场证据。

当前故障边界：今天群2新增行的更新接口在8秒后返回客户端ECONNABORTED/TIMEOUT，没有确认平台最终结果；群1稍后新增及保存成功。由此不能认定公司Wi-Fi是必要条件或定位具体网络根因。群2UPDATE_HELD / MEETING_NOT_READY，仍需维护者核对原操作。清理历史不代表故障恢复。Task继续Review；Subagents: none。

## 2026-09-10 两群补发与后续09:30调整

上午User要求补发，检查为NOT_RUNNING、匹配进程0、两个启用群当天均无状态文件；启动后真实HTTP101 / CONNECTED，两群分别CARD_CREATED / MEETING_SENT / MEETING_READY。状态回读均stage=sent、不同message、pending=false、queued=0，单进程持续运行，没有清除旧记录或重复发送。

User随后要求之后改为09:30。只修改本机groups.json顶层time，校验得到time=09:30 / minute=570 / enabled=2 / scheduled=2；工作日、群配置、日期防重与权限不变。同步默认值/示例及操作说明，无新增自动测试。STOP_VERIFIED后两群分别10/4行、无pending或requests；10:12:42真实HTTP101 / CONNECTED，SCHEDULE_CONFIGURED weekdays=1-5 time=09:30，两个群MEETING_RESUMED same_message=true / MEETING_READY，未新发或刷新布局。

下一次按新时间发送为2026-09-11北京时间09:30，尚未到时实测。任务继续TASK-0028 / Review；草稿核实状态不变。Subagents: none。

## 2026-09-09 队列结束唤醒与更新失败恢复

Task：TASK-0028；执行者Codex；Subagents: none。User授权先修多人审查1/2并尝试核实3。`meeting-service.cjs`在worker退出时重新检查队列，修复“已排队”后无人处理；200810临时交互拒绝持久化为retrying，原UUID/sequence按1/2/5/15/60秒退避，之后每60秒重试，继续接收其他行至原队列上限。重试前先写unknown，超时不继承上一轮安全重试许可；其他明确拒绝保存错误码并提示，UUID/sequence冲突和无返回继续unknown，不丢弃正文或推进未知结果。重启中的原卡恢复也可继续临时失败，不创建第二个slot/新卡。

最小复核：`node --test tools/callback-test/meeting-recovery.test.cjs`，10/10通过。使用虚构人员、内存状态和无网络API替身，只验证漏唤醒窗口、手填/AI群恢复、退避/停止、拒绝后超时、明确失败/冲突、重启续接、群隔离及未就绪slot恢复；没有模型请求或真实群模拟提交。线上未人为制造拒绝，因此未将离线结果冒称真实飞书拒绝恢复证据。

现场：10:33 STOP_VERIFIED，群1为11行/11行有已保存内容，群2为8行/3行有已保存内容，均queued=0、pending=false；备份三个旧脚本到本机`.local/meeting/code-backup-before-queue-recovery/`后替换service/store/schedule。首次WebSocket握手ETIMEDOUT，SDK自动重连，10:34:26 HTTP101 / CONNECTED；groups=2、scheduled=2、weekdays=1-5、time=09:40，两个正式群均MEETING_RESUMED same_message=true / MEETING_READY，原11/8行、布局14/15保留。没有MEETING_SENT、LAYOUT_UPDATED或汇总刷新，未改网络/权限/凭据/群配置。当前接收程序持续运行；09:40未来定时仍不是到时实测。

第3项：computer-use截图接口报`SetIsBorderRequired failed`，重试/重置后文字可读，但控件点击报`coordinate input geometry is unavailable`。未代填或修改记录。User当前不方便做真实草稿核实，故无结论、待反馈；保留稳定标识补丁，不改交互路线。1/2交Review，3以及原审查4/5未关闭。

以下为历史验收记录。

- Task：TASK-0028；日期：2026-09-07。
- 指定测试群，本机持有数据，同一条卡片；User 直接验收、边验边改。
- 保留现有应用、原模板及发送入口；测试群及两个正式群工作日 09:45 定时，各群独立。Subagents: none。

## 2026-09-09 调整次日起09:40发卡

User要求从明天即2026-09-10开始，两个正式群工作日发送改为北京时间09:40。原代码同时将配置校验、实际触发条件和日志写死09:45，本次统一读取并校验groups.json顶层time，不仅改文案；周一至周五、每群每天一张及逐日恢复逻辑保留。默认示例09:40，旧09:45配置仍可读取。

最小检查通过：9月10日09:39:59未到时、09:40:00到时、周末和禁用群不触发、非法时间拒绝；没有通过检查发送消息。STOP_VERIFIED后无待确认或排队请求，只改本机JSON的time并替换调度脚本与启动文案；代码备份在.local/meeting/code-backup-before-0940。再次真实HTTP101 / CONNECTED、groups=2 scheduled=2 time=09:40；两群今天原卡恢复9/8行且MEETING_READY，没有LAYOUT_UPDATED或MEETING_SENT。未来9:40送达未到时实测，程序需持续运行。Subagents: none。

## 2026-09-09 多人输入反馈、稳定组件标识及提交红框

User反馈：其他人新增行时，正在输入的内容被刷掉。运行代码只有根表单设置element_id，输入框和按钮未设置；name仅用于识别提交字段。服务端仅收到点击提交后的form_value，没有客户端草稿。新增接口为局部insert_before，持久状态追加新行，不清空其他已提交内容；不能从这个事实推断客户端不会刷新。未在员工群模拟点击或采集原始回调。

补丁：个人输入框、按钮、人员展示及静态区域设置稳定且全局唯一的element_id，与人员所在行的位置及其他行revision无关；群1手填交付框也补齐。红色danger提交按钮在保存成功后变为蓝色primary编辑按钮。布局群1 v14、群2 v15；其他处理逻辑和按群AI范围不变。

最小检查：脚本语法通过；其他行新增/保存/编辑/删除后的本行结构、标识、默认内容保持一致；两种交付模式的标识合法且唯一，按钮样式符合要求。本次没有新增组件，原200组件限制保留；20行容量检查发现旧版也会拒绝，既有限制未在本次扩大或绕过。真实两群8/8行渲染预算通过。该检查未模拟客户端缓存，也不构成草稿不丢失的实测。

User已回复“可以刷新”。STOP_VERIFIED后确认无排队或待确认意图，备份并只替换meeting-card.cjs。第一次后台Windows PowerShell启动未产生新会话；确认无运行进程后使用当前PowerShell启动现有start.ps1，取得HTTP101 / CONNECTED。北京时间10:03，两群分别MEETING_RESUMED rows=8、LAYOUT_UPDATED same_message=true、MEETING_READY；随后Check为RUNNING。未新发消息或代员工提交，权限和09:45不变。

结果：补丁已部署；“A正在输入、B新增/提交/删除后A文字仍在”的真实客户端结果尚未取得，保持Review，不标记缺陷已最终解决。官方文档不承诺element_id保证草稿保留。Subagents: none。

## 2026-09-08 今日交付去除待更新占位

旧显示逻辑将无交付任务但状态pending/failed的人员也纳入汇总，并追加“今日交付待更新”。User要求只处理已提交记录，本次增加非空已提交内容与非空交付结果过滤，移除占位和待更新文案。后台仍保留处理/失败状态及上次真实提交的交付；不读取客户端未提交草稿，也不更改抽取规则。

三脚本语法检查通过，未新增测试、模拟操作或哈希比对。停止后只读状态显示两个正式群原11/10行，待确认及队列均为空；旧渲染占位1处，新渲染0处并保留3人的实际交付。仅替换三个脚本，群配置、凭据及业务记录未手动修改。

真实HTTP101 / CONNECTED，groups=2 scheduled=2 time=09:45；正式群1 AI关闭、正式群2开启，两群原消息恢复。正式群2 DELIVERY_SUMMARY_REFRESHED same_message=true / MEETING_READY，仅调用汇总组件更新，没有整卡刷新、新发消息或新增模型调用。刷新意图、UUID/sequence及摘要版本持久化，准备阶段不启动保存/AI worker，避免恢复时序号冲突；失败保留summaryPending供同意图重试。代码交Review，实测证据仅为状态码、数量及布尔值。Subagents: none。

## 2026-09-08 预计今日的补充识别（历史）

User已确认正式群2原自动交付验收通过，后续补充收录“预计今日”及类似有今天交付意图的工作。此前提示词和证据校验都要求字面“今日交付”，会漏收预计类记录；现同时放宽，并要求模型原文片段保留“预计/争取”等表述，不将预计改成确定交付。具体日期、明天和无今天交付意图的普通工作不自动收录。

四个变更脚本Node语法检查通过，并审查策略刷新与提交/删除标识的关系；未新增测试或模拟员工操作。先STOP_VERIFIED，受影响群原卡无pending、layoutPending或排队意图，保留v13布局及业务记录，仅替换四脚本。规则版本2只重新识别新规则涉及的旧记录，不让每次重启都重复调用。代码备份在受限本机目录。

真实结果：HTTP101 / CONNECTED，groups=2 scheduled=2 time=09:45；正式群1 AI关闭、正式群2 AI开启，原11/10行恢复。正式群2 AI_RECOGNITION_QUEUED rows=1，随后DELIVERY_SUMMARY_UPDATED same_message=true tasks=1 status=ready。仅以数量/布尔回读状态确认：受影响1条、完成1条、预计原话保留true、失败0、待处理0、卡片队列空。未新发消息或重画整卡，不输出真实人员标识、工作内容或模型完整响应。

前轮User解散测试群后已关闭其enabled/schedule并保留本机历史；本轮再次确认关闭状态，未恢复测试群。仅正式群2生效，正式群1保持手填及原卡功能。增量代码交Review，不将单条实测推广为所有语言表述均已验收。Subagents: none。

## 2026-09-08 DeepSeek 自动今日交付：首次启用（历史）

User 在本机填好API Key后，限定先只对正式群2开放。新增每群 `delivery_ai` 开关，默认false；只将配置中的正式群2设为true，保留所有群ID、名称、权限和调度。未开启群继续原v12手填交付，不调用AI，也不生成或投递该群文本到模型。

部署前八脚本语法检查通过；STOP_VERIFIED，逐群确认当天原卡stage=sent、pending/layoutPending/requests为空且实际模式容量有效。v12代码备份在受限目录后替换八个脚本；凭据未复制、未输出，业务状态文件未手工修改。启动真实HTTP101 / CONNECTED，groups=3 scheduled=3 time=09:45；三群均prefill=false、submit=owner、delete=owner，delivery_ai分别false/false/true。

真实结果：GROUP_1/2分别恢复原v12卡片1/11行，无LAYOUT_UPDATED；仅GROUP_3原10行卡片LAYOUT_UPDATED same_message=true。DeepSeek补识别其中8份已提交内容，8份均ready、合计6项交付、pending=0、failed=0；每份结果均完成DELIVERY_SUMMARY_UPDATED same_message=true。最终三个群卡片队列和待确认意图均为空，其他两群无AI结果状态。未新发消息，未读取或上传原始回调、完整日志、真实员工记录或模型完整响应到Git。

当前证据证明群范围隔离、模型真实请求/解析和既有卡片汇总更新成功。尚未观测升级后用户实际编辑重提、删除及多人同时提交，不将代码审查或首次补识别冒称这些交互已经验收；User直接使用中反馈。实现交Review，不标记Done。Subagents: none。

### 同轮接入准备（历史）

User 批准每次提交及编辑后重新提交时，由 DeepSeek 识别明确标记的交付事项，按 @原行人员 + 工作更新同卡汇总。源记录保存与识别分开；成功的新结果替换旧结果，成功空结果移除本人汇总，删除行同步移除。submissionId 防止旧识别返回覆盖新提交；结果在各群原队列内串行合入最新状态，不覆盖异步等待期间新到的请求。仅打开编辑不识别未提交草稿。旧手填交付留在本机历史字段。

最小核对：七个相关 JavaScript 文件 Node 语法检查通过；审查同群多人提交、同人重提、删除期间模型返回、失败与重启恢复的路径，未新增或运行自动测试、压测、哈希比对或模拟员工操作。只读本机状态，确认当天三张卡片分别11/10/1行、pending/layoutPending均为空、排队数量0；新布局容量分别124/115/34元素、15675/15043/3045字节，均在限制内。计数包含 plain_text/lark_md，修正旧文档未计入文本描述的错误。

本机 `.local/meeting/ai.json` 已准备官方接口与模型，等待 User 填写 API Key。仅检查配置是否完整的布尔值，不输出任何凭据。当前运行仍是 v12；尚未调用 DeepSeek、未部署 v13、未重新发卡，不声称模型抽取或新批量更新接口已通过实测。下一步为配置完成后原卡升级并记录脱敏结果。Subagents: none。

## 2026-09-08 普通文字与编辑模式（历史）

按 User 截图提议实现 v12：输入框对应“提交”，成功后用普通文字展示原文并显示“编辑”，再点编辑带回原内容。个人行和今日交付均采用该交互，删除规则不变。普通文字使用 plain_text，员工输入不作为 Markdown 或卡片标签解释；换行保留。编辑操作沿用原队列、归属/版本检查及待确认意图，切换不清空原文。容量同时预留所有行回到输入状态的空间。

最小验证为三个修改脚本 Node 语法检查及编辑/提交、队列、版本和重启路径审查；不新增或运行自动测试、压测、哈希核对，不模拟员工点击。提醒 User 先提交当前草稿后，STOP_VERIFIED，并确认无 pending、layoutPending 或排队请求，避免更换尚未完成意图的渲染方式；仅部署三个脚本，未手动修改业务数据。

真实结果：HTTP101 / CONNECTED；groups=3 scheduled=3 time=09:45；三个群均 prefill=false / submit=owner / delete=owner。测试群及两个正式群分别 MEETING_RESUMED rows=1/11/10、LAYOUT_UPDATED same_message=true、MEETING_READY，没有新发卡。当前证明平台接受新布局并完成原卡更新；新编辑→提交流程由 User 直接使用中反馈，不把布局更新当成真实交互验收。Subagents: none。

## 2026-09-08 并发提交修复

代码审查确认：旧 `handle()` 在 `pending` 存在时直接拒绝其他人的正常提交；失败后旧内存队列的后续操作也可能因 `pending` 被跳过。修复为每群独立的持久队列，并在异步更新成功后重新读取最新状态，防止覆盖等待期间新排入的请求。同一行重复点击不重复入队；入队前预留行数及整卡容量；实际更新仍核对行版本和权限。结果未知时保留当前意图及后续队列，不宣称保存成功。

最小验证：修改的 `meeting-service.cjs`、`meeting-store.cjs` 通过 Node 语法检查；完成请求到达、异步返回、原子保存及重启恢复路径的代码审查。未新增或运行自动测试、哈希比对、模拟员工提交或压测，不以语法检查替代并发实测。

本机部署：STOP_VERIFIED 后仅替换两个脚本，代码备份留在受限目录；群配置和业务状态文件未手动修改。真实 HTTP101 / CONNECTED，groups=3 scheduled=3 time=09:45，三个群均 prefill=false / submit=owner / delete=owner；测试群及两个正式群依次 MEETING_RESUMED rows=1/10/9、MEETING_READY，无新发卡。该证据证明原卡恢复及服务可用；修复后真实多人同时提交尚未观测，不记为已验收。Subagents: none。

## 历史增量：本人删除、醒目标题与逐日调度

2026-09-08 恢复群2：User 要求群2恢复群1规则；读取配置确认原群2 all/all、prefill=false，群1默认 owner/owner；现有待确认操作为0。STOP_VERIFIED 后仅修改群2配置为 owner/owner、prefill=false，保留所有群标识、调度和状态文件。重启实际 HTTP101 / CONNECTED、groups=3 scheduled=3 time=09:45；三群 GROUP_OPTIONS 均 prefill=false submit=owner delete=owner，原消息分别 MEETING_RESUMED rows=1/8/6 / MEETING_READY，无重新发卡、自动测试或模拟操作。名单和权限申请流程随 User 最新决定暂停，未读取成员或调整飞书后台权限。Subagents: none。

正式群2预填准备：User 确认仅群2全员可提交/删除，提供策划3人、程序6人名单。新状态支持预建空行，首次创建前将行与发送意图持久化；重启复用原状态，姓名仍属名单原人，其他群保留 owner 权限。已做四个脚本的语法核对和 Git diff 检查；未新增自动测试、未模拟提交/删除、未提前发正式群卡片。只读匹配真实群成员返回 99991672，实际 required_scopes 为 im:chat:readonly / im:chat，仅请求 User 开通只读项，未返回或保存完整成员列表。部署后曾 TCP ETIMEDOUT，自动重连取得 HTTP 101 / CONNECTED、groups=3 scheduled=3，GROUP_1/2 submit=owner delete=owner，GROUP_3 submit=all delete=all；测试群原消息 rows=2 恢复。三个群 prefill=false，名单待匹配，不冒称已预建成功。Subagents: none。

正式群2启用（2026-09-07）：User 在本机填写并回复“添加了”。已有两个群 ID 保持一致，唯一新增群 ID 格式及防重有效；User 修改的本机群名保留。无待确认操作，STOP_VERIFIED 后启用群2，start_date=2026-09-08。实际 HTTP 101 / CONNECTED / SCHEDULE_CONFIGURED groups=3 scheduled=3 time=09:45，测试群原消息 rows=2 / MEETING_READY；今天未向两个正式群补发。没有新增自动测试、模拟交互或成员查询；未来正式群发卡与准点触发未到时实测。原始配置、群名称及 ID 均不进入仓库。Subagents: none。

正式群1启用（2026-09-07）：User 本机填 ID 后明确回复“已入群”。群 ID 格式及配置防重检查通过，正式群1 enabled=true / schedule=true / start_date=2026-09-08；正式群2关闭，测试群保留。STOP_VERIFIED 后重启取得 HTTP 101 / CONNECTED、SCHEDULE_CONFIGURED groups=2 / scheduled=2 / time=09:45、测试群 MEETING_RESUMED same_message=true / rows=2 / MEETING_READY。今天未向正式群补发；没有新增自动测试、模拟交互或群成员查询。正式群实际发送与未来准点触发尚未到时实测，不将配置加载当作发卡成功。凭据、群标识和原始回调未输出或上传。Subagents: none。

同轮新增今日交付：User 明确卡片三部分为策划、程序、今日交付；今日交付为全群共用文本框，编辑向群成员开放。v11 迁移前核对无待确认操作，保留现有两行。实际 STOP_VERIFIED、HTTP 101 / CONNECTED、SCHEDULE_CONFIGURED time=09:45，MEETING_RESUMED rows=2 / LAYOUT_UPDATED same_message=true / MEETING_READY。未新发消息，未自动提交或清空，新增共享交付回调尚未冒称实测通过；由 User 直接使用反馈。

最新 User 结论：“这回没问题了”，记录当前 UI 用户验收通过；正式代码 Review 仍保留。时间改为工作日北京时间 09:45，本机配置与代码一致。实际 STOP_VERIFIED 后重启取得 HTTP 101 / CONNECTED、SCHEDULE_CONFIGURED groups=1 / scheduled=1 / time=09:45、MEETING_RESUMED rows=2 / MEETING_READY；未再发消息，也没有改动卡片内容。未运行自动测试或模拟操作。10:15 指定名单提醒已由 User 暂停，未加入实现；仅查阅过官方接口文档，没有实际读取群成员或收集名单。

最新 v10 新行提醒：revision=0 时按钮为 danger 红字“未提交”，成功持久化后 revision 增加、变为 primary 蓝字“提交”。实际更新原消息时保留两行，HTTP 101 / CONNECTED、LAYOUT_UPDATED / MEETING_READY 均成功；没有模拟创建或提交，提醒由 User 直接使用。红字不是已提交行未发送草稿的检测器。

最终尺寸调整 v9：内容 340px、操作区 92px，按钮改为“提交 / 删除”，姓名和按钮顶部对齐；超过列宽自动换行增高。实际 STOP_VERIFIED 后重启，HTTP 101 / CONNECTED，MEETING_RESUMED rows=2 / LAYOUT_UPDATED same_message=true / MEETING_READY，原消息和两行保留，未发新消息。未执行自动测试或模拟交互。按查看者隐藏按钮不受当前共享卡片支持，已说明该项未实现；本人提交/删除检查保留。排版最终确认由 User 查看。

User 的标注截图指出 v6 内容框仍独占整行、操作没有落在右侧，v6 排版未通过。原因是水平容器中的 input.width=fill 占满整行；v7 改为 280px 并同步表头列宽。随后 User 明确内容超过列宽后自动换行，v8 保留一行起步与自动增高、取消六行高度上限，姓名和按钮顶部对齐。这里只记录实现及迁移结果，不将 API 更新成功等同于最终排版验收。

最新 UI 反馈后，改为 v6 紧凑布局：姓名、内容与右侧操作排列，“重新保存 / 删除本行”并排，内容框默认一行、行距 4px。User 取消补发，实际仅更新最近原消息。STOP_VERIFIED 后重启，真实 HTTP 101 / CONNECTED、MEETING_RESUMED rows=2 / LAYOUT_UPDATED same_message=true / MEETING_READY；两行保留，没有新消息发送。新 UI 由 User 直接查看，未运行自动测试。

新增真实交互证据（北京时间）：17:25:41 ROW_DELETED rows=1；17:25:43 ROW_ADDED rows=2；17:25:53 及 17:26:28 ROW_SAVED rows=2 / fields=1。这些是 User 实际操作，证明本人删除后可重新添加并保存，未代用户模拟操作。未来 10:00 定时仍未到时实测。

2026-09-07 User 认可两区效果，追加本人删除和标题放大加粗，并明确周一至周五北京时间 10:00、每群每天一张；正式群稍后再发，目前只配置测试群。实现 v0.4.0 / 布局 v5 已覆盖实际运行目录，代码备份仅在本机受限目录。

真实证据：上一进程出现 ROW_ADDED rows=2 / ROW_SAVED fields=1；本次 STOP_VERIFIED 后迁移为按群/日期状态，DAILY_STATE_MIGRATED same_message=true / rows=2。启动曾再次捕获握手前 IPv4 ETIMEDOUT，自动重连后取得 HTTP 101 / CONNECTED。SCHEDULE_CONFIGURED groups=1 / scheduled=1；随后 MEETING_RESUMED rows=2 / LAYOUT_UPDATED same_message=true / MEETING_READY。保留同一消息和两行，未触发新消息发送。

本机群配置 ACL 核对通过，无正式群配置。未自动点击新增、保存或删除，未运行自动测试；新删除回调和未来 10:00 发卡尚未实测，不以额外验收清单阻止交付。每区改为根表单，实际操作者之外字段不保存、不输出。下方各阶段证据为历史快照，以本节与当前操作说明为准。

## 现场证据

以下只记状态及数量，不记录实际员工、群/消息/卡片标识、输入正文、原始回调或完整日志。时间为北京时间。

| 时间 / 动作 | 结果及边界 |
| --- | --- |
| 本机目录 | ACL protected=true / allow rules=2 / unexpected=0，仅当前用户与 SYSTEM |
| 首次入口 | SDK token manager 需要 post()，适配器遗漏导致创建请求之前的 TypeError；已补齐接口，按空状态条件修复未发请求的创建标记，没有重复发送 |
| 重启入口 | 对既有目录重设 ACL 失败；改为首次设置、后续只验证，未改全局安全策略 |
| 16:26:54 | HTTP 101 / CONNECTED |
| 16:26:55～56 | CARD_CREATED / MEETING_SENT rows=0 / MEETING_READY，新版空卡片真实发到指定测试群 |
| 16:27:45 | ROW_ADDED rows=1 / same_message=true，User 实际点加号新增本人行 |
| 16:28:03 | ROW_SAVED rows=1 / fields=2 / same_message=true；当时为职位和内容共同提交，User 截图可见保存状态 |
| User UI 反馈 | 首版姓名独占一行、三列未对齐；首版 UI 未通过，不能用 API 成功代替排版验收 |
| 16:32:15 | MEETING_RESUMED rows=1 / LAYOUT_UPDATED same_message=true；固定三列 1:1:3，原消息和保存行保留 |
| 后续需求 | User 将第二列改为自动部门；现有应用 READ 返回 99991672，当前显示“部门待同步”，等待 User 配置必要权限并发布 |
| 部门列迁移 | 真实 LAYOUT_UPDATED / MEETING_READY，继续同一消息；现阶段部门读取未通过，不猜名称 |
| User 只开启①和③后 | READ code=0，但 department_ids 字段未返回（USER_FIELD）；官方字段权限明确需要 contact:user.department:readonly，或既有等价历史授权。本应用当前①③不足以自动识别员工所属部门 |

## 当前验收口径

最终收尾要求：User 仅需核心功能，明确不增加复杂或多余的测试、验收流程。当前两区域实现直接供使用，已完成的现场事实如下记录；后文多人、手机等未运行项只说明证据边界，不是交付前置或另行验收清单。不追加模拟测试，有实际问题再按反馈修改。

最终 User 决定已取消第二列及自动部门读取，改为策划 / 程序两区域，每区各两列与加号。代码已删除通讯录查询，部门权限不再是阻塞，不继续申请②。真实 MEETING_RESUMED rows=1 / LAYOUT_UPDATED same_message=true / MEETING_READY 已取得；原唯一记录按 User 原手填策划归入策划区，原内容保留。每行改回独立表单，正常新增位置由点击区域决定。

本次启动曾捕获 TCP_ATTEMPT_FAILED family=4 / ETIMEDOUT，随后自动重连取得 HTTP 101 / CONNECTED。证据支持握手前 IPv4 TCP 超时，尚不能归因到具体网络设备、代理或路由；未修改全局网络配置。

当前待验收为最终两区排版、另一员工新增/保存、跨区重复点击、本人归属及草稿保留。以下部门权限讨论仅保留演变证据，不是当前下一步。

User 明确“不要测试，直接让我验收，边验边改”。其后不再追加自动测试或模拟交互，晨会启动入口已移除离线自检。另一员工可由 User 邀入测试群直接验收。

User 希望不申请需审核的用户组织架构权限，当前等待选择：保留自动引用并申请②，或改为首次手填部门后记住。在选择前保留“部门待同步”，不擅自将手填冒充自动引用，不绕过审核。

待 User 实际确认：新三列布局、自动部门权限生效及正确显示、另一员工新增和保存、重复加号防重、拒绝代改、同时输入草稿保留及手机表现。未通过项继续修改，不标记完整业务完成。未提交草稿仅由客户端持有，本机无法恢复。

旧阶段两次独立输入只证明原回调接通；16:28 的 fields=2 是旧职位/内容共同提交证据，不能用它声称新部门读取成功。当前部门自动引用后只接收一个本人内容字段。间歇握手失败的底层网络原因仍未确认。

## 历史离线记录

在 User 要求停止自动测试之前，43 组诊断自检与 18 项检查曾通过，覆盖 SDK 适配、并发、防重、归属/群/消息校验、重启恢复、结果未知及脱敏。后续 UI 与部门改动未重新运行这些检查，旧结果不当作最新提交的全量测试结果。

当前仅保留本轮一张卡片；重启不开新日期、不启用调度。结果不明时保留待确认操作、阻止后续覆盖，不把 UUID 冲突当成功，不删本机数据重置防重。CardKit 组件数和体积限制仍适用。
