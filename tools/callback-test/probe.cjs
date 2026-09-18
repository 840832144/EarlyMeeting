'use strict';
// Diagnostics only: never sends, updates, or saves a morning-meeting record.
// Uses the official Feishu SDK; credentials exist only in this process.

// Never print raw errors, URLs, request headers, bodies, or SDK log arguments.
// Only finite labels and bounded numeric status/error codes may leave this module.
const NETWORK_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
  'ECONNABORTED', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'EPROTO', 'EACCES', 'EPERM',
  'ERR_NETWORK', 'ERR_BAD_REQUEST', 'ERR_BAD_RESPONSE', 'ERR_INVALID_URL',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_SSL_WRONG_VERSION_NUMBER', 'ERR_TLS_HANDSHAKE_TIMEOUT'
]);
const ERROR_TYPES = new Set(['Error', 'TypeError', 'SyntaxError', 'RangeError', 'AxiosError', 'AggregateError']);
const PHASES = new Set(['STARTUP', 'ENDPOINT', 'WEBSOCKET', 'CONNECTED', 'CALLBACK', 'SEND']);
function numericCode(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 9999999999) return String(value);
  if (typeof value === 'string' && /^\d{1,10}$/.test(value)) return value;
  return undefined;
}
function statusCode(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 100 && n <= 599 ? String(n) : undefined;
}
function errorFacts(value) {
  const facts = {code: undefined, network: undefined, http: undefined, type: undefined, reason: undefined};
  const seen = new Set();
  function textFacts(text) {
    if (typeof text !== 'string') return;
    text = text.slice(0, 8192); // Analyze only; never echo this text.
    facts.http ||= text.match(/(?:status(?: code)?|server response)[:=]?\s+(\d{3})\b/i)?.[1];
    facts.code ||= text.match(/\bcode\s*[:=]\s*(\d{1,10})\b/i)?.[1];
    for (const token of text.match(/[A-Z][A-Z_]{2,60}/g) || []) {
      if (NETWORK_CODES.has(token)) { facts.network ||= token; facts.code ||= token; break; }
    }
    if (/system busy/i.test(text)) facts.reason ||= 'SYSTEM_BUSY';
    if (/app not online/i.test(text)) facts.reason ||= 'APP_NOT_ONLINE';
    if (/self[- ]signed|unable to verify.*certificate|certificate.*(?:expired|not yet valid|issuer)/i.test(text)) facts.reason ||= 'TLS_CERTIFICATE';
    if (/(?:read properties of (?:undefined|null)|destructure property)/i.test(text)) facts.reason ||= 'RESPONSE_SHAPE_ERROR';
    if (/unexpected token|not valid JSON/i.test(text)) facts.reason ||= 'NON_JSON_RESPONSE';
    if (/timeout|timed out/i.test(text)) facts.reason ||= 'TIMEOUT';
  }
  function walk(item, depth) {
    if (depth > 6 || item == null) return;
    if (typeof item === 'string') { textFacts(item); return; }
    if (typeof item !== 'object' || seen.has(item)) return;
    seen.add(item);
    if (Array.isArray(item)) { item.slice(0, 20).forEach(x => walk(x, depth + 1)); return; }
    if (ERROR_TYPES.has(item.name)) facts.type ||= item.name;
    const code = numericCode(item.code);
    if (code !== undefined && code !== '0' && numericCode(facts.code) === undefined) facts.code = code;
    if (typeof item.code === 'string' && NETWORK_CODES.has(item.code)) { facts.network ||= item.code; facts.code ||= item.code; }
    facts.http ||= statusCode(item.status) || statusCode(item.statusCode);
    textFacts(item.message); textFacts(item.msg);
    // Only inspect SDK/HTTP error structure, not config/request/header/payload fields.
    for (const key of ['cause', 'errors', 'response', 'data']) walk(item[key], depth + 1);
  }
  walk(value, 0);
  if (facts.http && !statusCode(facts.http)) facts.http = undefined;
  return facts;
}
function safeErrorCode(value) { return errorFacts(value).code || 'UNCLASSIFIED'; }
function diagnosis(value, phase) {
  const f = errorFacts(value);
  const safePhase = PHASES.has(phase) ? phase : 'STARTUP';
  // These business-code names come from the official ws-client/enum.ts.
  if (safePhase === 'ENDPOINT') {
    const names = {'1':'SYSTEM_BUSY', '403':'ENDPOINT_FORBIDDEN', '514':'ENDPOINT_AUTH_FAILED',
      '1000040343':'ENDPOINT_INTERNAL_ERROR', '1000040350':'CONNECTION_LIMIT'};
    f.reason ||= names[f.code];
  }
  if (f.http === '407') f.reason = 'PROXY_AUTH_REQUIRED';
  return `phase=${safePhase}; http=${f.http || 'UNREPORTED'}; code=${f.code || 'UNREPORTED'}; network=${f.network || 'UNREPORTED'}; type=${f.type || 'UNREPORTED'}; reason=${f.reason || 'UNREPORTED'}`;
}
function diagnosticHttp(original, output, state) {
  if (!original || typeof original.request !== 'function') throw new Error('SDK_HTTP_UNAVAILABLE');
  // Delegate to the SDK's own HTTP instance; no additional request, proxy or TLS changes.
  return {
    async request(options) {
      state.phase = 'ENDPOINT';
      output('[CONNECT_STAGE] phase=ENDPOINT；正在请求飞书长连接入口。');
      let result;
      try { result = await original.request(options); }
      catch (e) { output('[CONNECT_DIAG] ' + diagnosis(e, 'ENDPOINT')); throw e; }
      if (result && typeof result === 'object' && Number(result.code) === 0 && result.code !== undefined &&
          typeof result.data?.URL === 'string' && result.data.URL.startsWith('wss://') &&
          result.data.ClientConfig && typeof result.data.ClientConfig === 'object') {
        state.phase = 'WEBSOCKET';
        output('[ENDPOINT_OK] 长连接入口返回成功；尚未确认 WebSocket 已连接。');
      } else {
        output('[CONNECT_DIAG] ' + diagnosis(result, 'ENDPOINT'));
        if (!result || typeof result !== 'object' || result.code === undefined || Number(result.code) === 0) {
          output('[RESPONSE_SHAPE_ERROR] 入口返回结构不符合 SDK 预期；未输出响应内容。');
        }
      }
      return result; // Preserve the SDK response and its error/retry behavior.
    }
  };
}

function readConfig(env) {
  const appId = (env.EARLYMEETING_APP_ID || '').trim();
  const appSecret = (env.EARLYMEETING_APP_SECRET || '').trim();
  const chatId = (env.EARLYMEETING_TEST_CHAT_ID || '').trim();
  if (!/^cli_[A-Za-z0-9_-]+$/.test(appId)) throw new Error('APP_ID_FORMAT');
  if (!appSecret || /\s/.test(appSecret)) throw new Error('APP_SECRET_FORMAT');
  if (!/^oc_[A-Za-z0-9_-]+$/.test(chatId)) throw new Error('TEST_CHAT_ID_FORMAT');
  return { appId, appSecret, chatId };
}

const TEST_MARKER = 'EARLYMEETING-CALLBACK-TEST';
function callbackHandler(allowedChatId, output) {
  let received = 0;
  return async (payload) => {
    const event = payload?.event || payload;
    if (!event || typeof event !== 'object') {
      output('[CALLBACK_INVALID] 回调结构不符，未处理。');
      return { toast: { type: 'error', content: '测试回调结构不符；未保存。' } };
    }
    if (event.context?.open_chat_id !== allowedChatId) {
      output('[CALLBACK_BLOCKED] 不是指定测试群，或回调没有群标识；未处理。');
      return { toast: { type: 'error', content: '仅限指定测试群；未保存。' } };
    }
    if (typeof event.operator?.open_id !== 'string' || !event.operator.open_id ||
        !event.action || typeof event.action !== 'object' || Array.isArray(event.action)) {
      output('[CALLBACK_INVALID] 缺少操作人或交互信息；未处理。');
      return { toast: { type: 'error', content: '回调缺少必要信息；未保存。' } };
    }
    const form = event.action.form_value;
    const formCount = form && typeof form === 'object' && !Array.isArray(form)
      ? Object.keys(form).length : 0;
    received += 1;
    // Deliberately do not log field names, values, names, IDs, tokens, or payloads.
    output(`[CALLBACK_OK] 收到第 ${received} 次卡片交互；表单字段数=${formCount}。未保存，未更新群记录。`);
    const inputPresent = typeof event.action.input_value === 'string';
    if (!formCount && !inputPresent) output('[FORM_EMPTY] 此次没有表单字段或独立输入值；只证明交互到达，不证明文本已传回。');
    if (inputPresent) {
      const matched = event.action.input_value.trim() === TEST_MARKER;
      output(`[INPUT_CHECK] source=input_value; fields=1; marker_matches=${matched ? 1 : 0}; verified=${matched}。独立输入框，不等于整组表单。`);
    }
    if (formCount) {
      // Inspect in memory only. Never output keys, values, or identities.
      const matched = Object.values(form).filter(value =>
        typeof value === 'string' && value.trim() === TEST_MARKER).length;
      output(`[FORM_CHECK] fields=${formCount}; marker_matches=${matched}; verified=${matched > 0}。仅核对虚构测试文字。`);
    }
    return { toast: { type: 'warning', content: '回调测试已收到；本次未保存、未更新晨会记录。' } };
  };
}

function safeLogger(output, state) {
  function handle(level, args) {
    const text = args.flat(4).filter(x => typeof x === 'string');
    if (text.includes('ws connect success') || text.includes('reconnect success')) {
      state.phase = 'CONNECTED';
      if (!state.connected) {
        state.connected = true;
        output('[CONNECTED] 已与飞书建立长连接。保持本窗口打开，再去配置卡片回调。');
      }
      return;
    }
    if (text.includes('client closed') || text.includes('reconnect')) {
      state.connected = false;
      output('[RECONNECTING] 连接已断开或正在重连，请等待 CONNECTED。');
      return;
    }
    if (level !== 'error' && level !== 'warn') return;
    state.errors = (state.errors || 0) + 1;
    if (state.errors > 5 && state.errors % 10 !== 0) return;
    // Fixed notices must remain recognizable even when the SDK omits an error object.
    const notices = {'ws connect failed':'WS_HANDSHAKE_FAILED', 'new WebSocket error':'WS_CONSTRUCTOR_FAILED',
      'ws error':'WS_RUNTIME_ERROR', 'connect failed':'CONNECT_FAILED', 'system busy':'SYSTEM_BUSY',
      'send data failed':'WS_SEND_FAILED'};
    let notice = 'SDK_ERROR';
    for (const t of text) if (notices[t]) { notice = notices[t]; break; }
    if (notice === 'WS_HANDSHAKE_FAILED' || notice === 'WS_CONSTRUCTOR_FAILED') state.phase = 'WEBSOCKET';
    output(`[SDK_ERROR] notice=${notice}; ${diagnosis(args, state.phase)}；原始日志已隐藏。`);
  }
  return Object.fromEntries(['trace', 'debug', 'info', 'warn', 'error']
    .map(level => [level, (...args) => handle(level, args)]));
}

async function run() {
  const path = require('node:path');
  const {createSession} = require('./session.cjs');
  const session = createSession(path.join(__dirname, '.local'));
  const output = session.output;
  let config;
  try { config = readConfig(process.env); }
  catch (e) { output(`[CONFIG_ERROR] ${e.message}；请重新启动并填写正确值。`); session.finish(); process.exitCode = 1; return; }
  // Do not pass credentials on to any later child processes.
  delete process.env.EARLYMEETING_APP_ID;
  delete process.env.EARLYMEETING_APP_SECRET;
  delete process.env.EARLYMEETING_TEST_CHAT_ID;
  let Lark;
  try { Lark = require('@larksuiteoapi/node-sdk'); }
  catch { output('[SDK_MISSING] 尚未安装官方 SDK，请用 START_TEST.cmd 启动。'); session.finish(); process.exitCode = 1; return; }
  const state = { connected: false, errors: 0, phase: 'STARTUP' };
  if (!Lark.defaultHttpInstance || typeof Lark.defaultHttpInstance.request !== 'function') {
    output('[SDK_HTTP_UNAVAILABLE] 已安装 SDK 未暴露所需诊断入口；停止连接，不升级或修改依赖。');
    session.finish(); process.exitCode = 1; return;
  }
  const logger = safeLogger(output, state);
  const {diagnosticAgent} = require('./transport.cjs');
  const agent = diagnosticAgent(output, diagnosis, state);
  const dispatcher = new Lark.EventDispatcher({ logger, loggerLevel: Lark.LoggerLevel.debug })
    .register({ 'card.action.trigger': callbackHandler(config.chatId, output) });
  const ws = new Lark.WSClient({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: Lark.Domain.Feishu,
    logger, loggerLevel: Lark.LoggerLevel.debug,
    autoReconnect: true,
    agent,
    httpInstance: diagnosticHttp(Lark.defaultHttpInstance, output, state),
  });
  let stopping = false;
  let reminder;
  function stop(code) {
    if (stopping) return;
    stopping = true;
    state.stopping = true;
    clearTimeout(reminder);
    try { if (typeof ws.close === 'function') ws.close({ force: true }); } catch {}
    agent.destroy();
    output('[STOPPED] 测试程序已停止。');
    session.finish();
    process.exit(code);
  }
  session.watchStop(stop);
  process.once('SIGINT', () => stop(0));
  process.once('SIGTERM', () => stop(0));
  process.once('uncaughtException', e => { output('[FATAL] ' + diagnosis(e, state.phase)); stop(1); });
  process.once('unhandledRejection', e => { output('[FATAL] ' + diagnosis(e, state.phase)); stop(1); });
  output('[PROBE_VERSION] 0.2.0；仅改进连接诊断，不保存、不更新、不定时发送。');
  output('[STARTING] 正在连接飞书；STARTING 不代表连接成功。');
  reminder = setTimeout(() => {
    if (!state.connected) output('[WAITING] ' + diagnosis(null, state.phase) + '；45 秒内未确认连接，按 Ctrl+C 停止并反馈从 CONNECT_STAGE 开始的状态行。');
  }, 45000);
  try { await ws.start({ eventDispatcher: dispatcher }); }
  catch (e) { output('[CONNECT_FAILED] ' + diagnosis(e, state.phase)); stop(1); }
}

async function selfTest() {
  const assert = require('node:assert/strict');
  let checks = 0;
  const log = [];
  const emit = s => log.push(s);
  const cfg = readConfig({ EARLYMEETING_APP_ID: ' cli_demo ', EARLYMEETING_APP_SECRET: 'demo-secret', EARLYMEETING_TEST_CHAT_ID: 'oc_demo' });
  assert.equal(cfg.appId, 'cli_demo'); checks++;
  assert.throws(() => readConfig({}), /APP_ID_FORMAT/); checks++;
  assert.throws(() => readConfig({EARLYMEETING_APP_ID:'cli_demo', EARLYMEETING_APP_SECRET:'x y', EARLYMEETING_TEST_CHAT_ID:'oc_demo'}), /APP_SECRET_FORMAT/); checks++;
  const handle = callbackHandler('oc_demo', emit);
  const event = {context: {open_chat_id: 'oc_demo'}, operator: {open_id: 'ou_demo'}, action: {form_value: {todo: 'PRIVATE_TEST_TEXT'}}};
  const result = await handle(event);
  assert.equal(result.toast.type, 'warning'); assert.equal(result.card, undefined); checks++;
  assert.ok(log.some(line => /字段数=1/.test(line))); checks++;
  assert.equal((await handle({event})).toast.type, 'warning'); checks++;
  assert.equal((await handle({...event, context: {open_chat_id:'oc_other'}})).toast.type, 'error'); checks++;
  assert.equal((await handle({...event, operator:{}})).toast.type, 'error'); checks++;
  assert.equal((await handle(null)).toast.type, 'error'); checks++;
  await handle({...event, action: {value:{action:'test'}}}); assert.match(log.at(-1), /FORM_EMPTY/); checks++;
  const state = {connected:false, errors:0}; const logger = safeLogger(emit,state);
  logger.info('[ws]', 'ws client ready'); assert.equal(state.connected,false); checks++;
  logger.debug('[ws]', 'ws connect success'); assert.equal(state.connected,true); checks++;
  logger.debug('[ws]', 'get connect config success, ws url: wss://example.invalid?ticket=PRIVATE_TICKET');
  logger.debug('[ws]', 'receive message data: PRIVATE_PAYLOAD');
  logger.error('[ws]', 'code: 12345, PRIVATE_ERROR_DETAIL'); assert.match(log.at(-1), /12345/); checks++;
  logger.error({config:{headers:{Authorization:'Bearer PRIVATE_AUTH'}}});
  logger.info('[ws]', 'reconnect'); assert.equal(state.connected,false); checks++;
  assert.equal(safeErrorCode({code:'ETIMEDOUT'}),'ETIMEDOUT'); checks++;
  assert.equal(safeErrorCode({code:'PRIVATE_SECRET'}),'UNCLASSIFIED'); checks++;
  assert.equal(log.join('\n').includes('PRIVATE_'),false);
  assert.equal(log.join('\n').includes('ou_demo'),false);
  assert.equal(log.join('\n').includes('oc_demo'),false); checks++;
  const extra = async (fn) => { await fn(); checks++; };
  await extra(() => assert.equal(safeErrorCode(new Error('Request failed with status code 400')), 'UNCLASSIFIED'));
  await extra(() => assert.match(diagnosis(new Error('Request failed with status code 400'), 'ENDPOINT'), /http=400/));
  await extra(() => assert.equal(errorFacts(new Error('code: 1000040350, private text')).code, '1000040350'));
  await extra(() => assert.match(diagnosis({code:1000040350}, 'ENDPOINT'), /CONNECTION_LIMIT/));
  await extra(() => assert.match(diagnosis({code:514}, 'ENDPOINT'), /ENDPOINT_AUTH_FAILED/));
  await extra(() => assert.equal(safeErrorCode({response:{data:{code:514},status:400}}), '514'));
  await extra(() => assert.equal(errorFacts({response:{status:407}}).reason, undefined));
  await extra(() => assert.match(diagnosis({response:{status:407}}, 'ENDPOINT'), /PROXY_AUTH_REQUIRED/));
  await extra(() => assert.equal(safeErrorCode({cause:{code:'CERT_HAS_EXPIRED'}}), 'CERT_HAS_EXPIRED'));
  await extra(() => assert.match(diagnosis(new Error('self signed certificate: PRIVATE_CERT'), 'ENDPOINT'), /TLS_CERTIFICATE/));
  await extra(() => assert.equal(safeErrorCode({code:'EPRIVATE_SECRET'}), 'UNCLASSIFIED'));
  await extra(() => assert.equal(safeErrorCode({code:'12345678901'}), 'UNCLASSIFIED'));
  await extra(() => assert.match(diagnosis(new TypeError("Cannot read properties of undefined (reading 'URL')"), 'ENDPOINT'), /RESPONSE_SHAPE_ERROR/));
  await extra(() => assert.equal(errorFacts({errors:[{cause:{code:'ENOTFOUND'}}]}).code, 'ENOTFOUND'));
  await extra(() => { const circular = {}; circular.cause = circular; assert.equal(safeErrorCode(circular),'UNCLASSIFIED'); });
  const log2=[]; const state2={connected:false,errors:0,phase:'ENDPOINT'}; const logger2=safeLogger(x=>log2.push(x),state2);
  await extra(() => { logger2.error(['[ws]', {response:{status:400,data:{code:514}},config:{data:'PRIVATE_SECRET'}}]); assert.match(log2.at(-1), /http=400; code=514/); });
  await extra(() => { logger2.error(['[ws]', 'ws connect failed']); assert.match(log2.at(-1), /notice=WS_HANDSHAKE_FAILED; phase=WEBSOCKET/); });
  await extra(() => { logger2.error(['[ws]', 'system busy']); assert.match(log2.at(-1), /notice=SYSTEM_BUSY/); });
  await extra(() => { logger2.info('[ws]', 'ws client ready'); assert.equal(state2.connected,false); });
  const validReply={code:0,data:{URL:'wss://example.invalid?ticket=PRIVATE_TICKET',ClientConfig:{PingInterval:30}}};
  let requests=0; const opts={data:{AppID:'PRIVATE_APP',AppSecret:'PRIVATE_SECRET'}};
  const http=diagnosticHttp({request:async o=>{requests++;assert.equal(o,opts);return validReply;}},x=>log2.push(x),state2);
  await extra(async () => { assert.equal(await http.request(opts),validReply); assert.equal(requests,1); assert.equal(state2.phase,'WEBSOCKET'); assert.equal(state2.connected,false); assert.match(log2.at(-1),/ENDPOINT_OK/); });
  await extra(async () => {
    const bad={code:514,msg:'PRIVATE_ERROR'};
    const h=diagnosticHttp({request:async()=>bad},x=>log2.push(x),state2);
    assert.equal(await h.request({}),bad); assert.match(log2.at(-1),/ENDPOINT_AUTH_FAILED/); assert.equal(state2.phase,'ENDPOINT');
  });
  await extra(async () => {
    const err=Object.assign(new Error('PRIVATE_RESPONSE'),{code:'ERR_BAD_REQUEST',response:{status:400,data:{code:1000040350}},config:opts});
    const h=diagnosticHttp({request:async()=>{throw err;}},x=>log2.push(x),state2);
    await assert.rejects(h.request({}),e=>e===err); assert.match(log2.at(-1),/http=400; code=1000040350; network=ERR_BAD_REQUEST/);
  });
  await extra(async () => {
    const h=diagnosticHttp({request:async()=>'<html>PRIVATE_BODY</html>'},x=>log2.push(x),state2);
    assert.equal(await h.request({}),'<html>PRIVATE_BODY</html>'); assert.match(log2.at(-1),/RESPONSE_SHAPE_ERROR/);
  });
  await extra(() => assert.throws(()=>diagnosticHttp({},emit,state2),/SDK_HTTP_UNAVAILABLE/));
  await extra(() => { const f=diagnosis({response:{status:400,data:{code:514}},message:'PRIVATE_MSG',request:opts},'PRIVATE_PHASE'); assert.match(f,/phase=STARTUP/); assert.equal(f.includes('PRIVATE_'),false); });
  await extra(() => { assert.equal(log2.join('\n').includes('PRIVATE_'),false); assert.equal(log2.join('\n').includes('wss://'),false); });
  console.log(`[SELF_TEST_OK] ${checks} 组离线检查通过（不代表真实飞书或 Windows 验收）。`);
}

if (require.main === module) {
  (process.argv.includes('--self-test') ? selfTest() : run()).catch(() => {
    console.error('[FATAL] 程序异常，已隐藏原始错误。'); process.exitCode = 1;
  });
}
module.exports = {readConfig, callbackHandler, safeLogger, safeErrorCode, errorFacts, diagnosis, diagnosticHttp, TEST_MARKER};
