'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {readConfig, diagnosis} = require('./probe.cjs');

function loadSendConfig(directory) {
  const local = JSON.parse(fs.readFileSync(path.join(directory,'config.json'),'utf8').replace(/^\uFEFF/,''));
  const config = readConfig({EARLYMEETING_APP_ID:local.app_id,
    EARLYMEETING_APP_SECRET:local.app_secret,EARLYMEETING_TEST_CHAT_ID:local.test_chat_id});
  if (typeof local.template_id !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(local.template_id)) {
    throw new Error('TEMPLATE_CONFIG_INVALID');
  }
  return {...config,templateId:local.template_id};
}

async function sendOnce(config, directory, createMessage, output) {
  const lockPath=path.join(directory,'send.lock');
  let lock;
  try {lock=fs.openSync(lockPath,'wx');}
  catch {output('[SEND_BUSY] 发送操作正在进行或上次未正常退出；未发送。');return false;}
  const statePath=path.join(directory,'send-state.json');
  try {
    // Do not store IDs or credentials here. Bind retries to the same destination
    // and template, and reuse UUID after an ambiguous result instead of duplicating.
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify([
      config.appId,config.chatId,config.templateId])).digest('hex');
    let state;
    if (fs.existsSync(statePath)) {
      try {state=JSON.parse(fs.readFileSync(statePath,'utf8'));}
      catch {output('[SEND_STATE_INVALID] 无法核对上次发送结果；未发送。');return false;}
      if (state.fingerprint !== fingerprint || typeof state.uuid !== 'string' ||
          !/^[a-f0-9-]{36}$/.test(state.uuid) || !Number.isFinite(state.createdAt) ||
          !['pending','sent'].includes(state.status) || state.createdAt > Date.now()) {
        output('[SEND_STATE_CONFLICT] 上次请求与当前配置不一致；未发送。');return false;
      }
      if (state.status==='sent') {
        output('[SEND_ALREADY_DONE] 本轮测试卡片已发送；请使用群中已有卡片。');return true;
      }
      // Feishu's message UUID deduplication window is one hour. Fail closed
      // before it expires; another deliberate test round needs separate review.
      if (Date.now()-state.createdAt > 50*60*1000) {
        output('[SEND_RESULT_UNKNOWN] 已超出安全重试时间；先核对群内卡片，不自动重发。');return false;
      }
    } else {
      state={uuid:crypto.randomUUID(),fingerprint,createdAt:Date.now(),status:'pending'};
      fs.writeFileSync(statePath,JSON.stringify(state));
    }
    const request={params:{receive_id_type:'chat_id'},data:{receive_id:config.chatId,
      msg_type:'interactive',uuid:state.uuid,
      content:JSON.stringify({type:'template',data:{template_id:config.templateId}})}};
    let reply;
    try {reply=await createMessage(request);}
    catch(error) {output('[SEND_UNCONFIRMED] '+diagnosis(error,'SEND'));return false;}
    if (reply?.code!==0 || typeof reply.data?.message_id!=='string' ||
        reply.data?.chat_id!==config.chatId || reply.data?.msg_type!=='interactive') {
      output('[SEND_UNCONFIRMED] '+diagnosis(reply,'SEND'));return false;
    }
    state.status='sent';fs.writeFileSync(statePath,JSON.stringify(state));
    output('[SEND_OK] 已由现有应用向指定测试群发送一张模板卡片；未输出内部标识。');
    return true;
  } finally {fs.closeSync(lock);fs.unlinkSync(lockPath);}
}

async function main() {
  const directory=path.join(__dirname,'.local');
  let config;
  try {config=loadSendConfig(directory);}
  catch {console.log('[SEND_CONFIG_INVALID] 请检查本机 JSON 三项配置及 template_id；内容未输出。');process.exitCode=1;return;}
  if (process.argv.includes('--check')) {
    console.log('[SEND_CONFIG_OK] 现有应用、指定测试群及模板配置齐全；未发送。');return;
  }
  const Lark=require('@larksuiteoapi/node-sdk');
  const logger=Object.fromEntries(['trace','debug','info','warn','error'].map(k=>[k,()=>{}]));
  const client=new Lark.Client({appId:config.appId,appSecret:config.appSecret,
    domain:Lark.Domain.Feishu,logger,loggerLevel:Lark.LoggerLevel.error});
  process.exitCode=await sendOnce(config,directory,r=>client.im.message.create(r),console.log)?0:1;
}
if(require.main===module) main().catch(()=>{console.log('[SEND_FAILED] 发送过程停止；原始错误已隐藏。');process.exitCode=1;});
module.exports={loadSendConfig,sendOnce};
