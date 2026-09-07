'use strict';
// Diagnostics only: never sends, updates, or saves a morning-meeting record.
// Uses the official Feishu SDK; credentials exist only in this process.

function safeErrorCode(value) {
  const candidates = [value?.code, value?.cause?.code];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isSafeInteger(c)) return String(c);
    if (typeof c === 'string' && /^(E[A-Z_]{2,35}|[0-9]{1,9})$/.test(c)) return c;
  }
  return 'UNCLASSIFIED';
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
    if (!formCount) output('[FORM_EMPTY] 此次没有表单字段；只证明按钮回调到达，不证明输入内容已传回。');
    return { toast: { type: 'warning', content: '回调测试已收到；本次未保存、未更新晨会记录。' } };
  };
}

function safeLogger(output, state) {
  // SDK debug logs can contain temporary connection tickets and raw callbacks.
  // Whitelist fixed status strings only; never forward raw SDK log arguments.
  function handle(level, args) {
    const text = args.flat(2).filter(x => typeof x === 'string');
    if (text.includes('ws connect success') || text.includes('reconnect success')) {
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
    if (level === 'error' || level === 'warn') {
      state.errors += 1;
      if (state.errors > 5 && state.errors % 10 !== 0) return;
      const numeric = text.map(t => t.match(/\bcode\s*[:=]\s*(\d{1,9})\b/))
        .find(Boolean)?.[1];
      const transport = text.map(t => t.match(/\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ECONNABORTED)\b/))
        .find(Boolean)?.[1];
      output(`[SDK_ERROR] SDK 连接或处理异常；错误码=${numeric || transport || 'UNCLASSIFIED'}。原始日志已隐藏。`);
    }
  }
  return Object.fromEntries(['trace', 'debug', 'info', 'warn', 'error']
    .map(level => [level, (...args) => handle(level, args)]));
}

async function run() {
  const output = text => console.log(text);
  let config;
  try { config = readConfig(process.env); }
  catch (e) { output(`[CONFIG_ERROR] ${e.message}；请重新启动并填写正确值。`); process.exitCode = 1; return; }
  // Do not pass credentials on to any later child processes.
  delete process.env.EARLYMEETING_APP_ID;
  delete process.env.EARLYMEETING_APP_SECRET;
  delete process.env.EARLYMEETING_TEST_CHAT_ID;
  let Lark;
  try { Lark = require('@larksuiteoapi/node-sdk'); }
  catch { output('[SDK_MISSING] 尚未安装官方 SDK，请用 START_TEST.cmd 启动。'); process.exitCode = 1; return; }
  const state = { connected: false, errors: 0 };
  const logger = safeLogger(output, state);
  const dispatcher = new Lark.EventDispatcher({ logger, loggerLevel: Lark.LoggerLevel.debug })
    .register({ 'card.action.trigger': callbackHandler(config.chatId, output) });
  const ws = new Lark.WSClient({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: Lark.Domain.Feishu,
    logger, loggerLevel: Lark.LoggerLevel.debug,
    autoReconnect: true,
  });
  let stopping = false;
  function stop(code) {
    if (stopping) return;
    stopping = true;
    clearTimeout(reminder);
    try { if (typeof ws.close === 'function') ws.close({ force: true }); } catch {}
    output('[STOPPED] 测试程序已停止。');
    process.exit(code);
  }
  process.once('SIGINT', () => stop(0));
  process.once('SIGTERM', () => stop(0));
  process.once('uncaughtException', e => { output(`[FATAL] ${safeErrorCode(e)}；已隐藏原始错误。`); stop(1); });
  process.once('unhandledRejection', e => { output(`[FATAL] ${safeErrorCode(e)}；已隐藏原始错误。`); stop(1); });
  output('[STARTING] 正在连接飞书；STARTING 不代表连接成功。');
  const reminder = setTimeout(() => {
    if (!state.connected) output('[WAITING] 45 秒内未确认连接成功。不要修改防火墙，先反馈此窗口的状态码。');
  }, 45000);
  try { await ws.start({ eventDispatcher: dispatcher }); }
  catch (e) { output(`[CONNECT_FAILED] ${safeErrorCode(e)}；已隐藏原始错误。`); stop(1); }
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
  assert.match(log.at(-1), /字段数=1/); checks++;
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
  console.log(`[SELF_TEST_OK] ${checks} 组离线检查通过（不代表真实飞书或 Windows 验收）。`);
}

if (require.main === module) {
  (process.argv.includes('--self-test') ? selfTest() : run()).catch(() => {
    console.error('[FATAL] 程序异常，已隐藏原始错误。'); process.exitCode = 1;
  });
}
module.exports = {readConfig, callbackHandler, safeLogger, safeErrorCode};
