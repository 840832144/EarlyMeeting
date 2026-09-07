'use strict';
const path=require('node:path');
const {readConfig,safeLogger,diagnosticHttp,diagnosis}=require('./probe.cjs');
const {createStore}=require('./meeting-store.cjs');
const {MeetingService}=require('./meeting-service.cjs');
const {createSession}=require('./session.cjs');
const {diagnosticAgent}=require('./transport.cjs');
const {createApi}=require('./meeting-api.cjs');
async function main() {
  const session=createSession(path.join(__dirname,'.local','meeting'));
  const output=session.output;
  let config;
  try{config=readConfig(process.env);}catch{output('[CONFIG_ERROR] 请检查本机配置。');session.finish();return;}
  for(const key of ['EARLYMEETING_APP_ID','EARLYMEETING_APP_SECRET','EARLYMEETING_TEST_CHAT_ID'])delete process.env[key];
  const Lark=require('@larksuiteoapi/node-sdk');
  const silent=Object.fromEntries(['trace','debug','info','warn','error'].map(k=>[k,()=>{}]));
  const api=createApi(config,Lark);
  let service;
  try{service=new MeetingService(config,createStore(path.join(__dirname,'.local','meeting'),config),api,output);}
  catch{output('[LOCAL_STATE_INVALID] 本轮数据无法核对，已停止；请勿删除数据重发。');session.finish();return;}
  const state={connected:false,errors:0,phase:'STARTUP'};
  const agent=diagnosticAgent(output,diagnosis,state);
  let starting=false,ready=false;
  const logger=safeLogger(line=>{
    output(line);
    if(state.connected&&!starting){starting=true;setTimeout(async()=>{
      try{ready=await service.prepare();if(ready)output('[MEETING_READY] 请在测试群点击“＋ 添加我的一行”。');}
      catch{output('[MEETING_NOT_READY] 本轮状态需要核对；未自动重建卡片。');}
    },0);}
  },state);
  const dispatcher=new Lark.EventDispatcher({logger:silent}).register({
    'card.action.trigger':payload=>ready?service.handle(payload):{toast:{type:'warning',content:'程序尚未就绪，请稍后重试。'}},
  });
  const ws=new Lark.WSClient({appId:config.appId,appSecret:config.appSecret,
    domain:Lark.Domain.Feishu,logger,loggerLevel:Lark.LoggerLevel.debug,autoReconnect:true,
    agent,httpInstance:diagnosticHttp(Lark.defaultHttpInstance,output,state)});
  let stopping=false;
  async function stop(code){
    if(stopping)return;stopping=true;state.stopping=true;ready=false;
    try{ws.close({force:true});}catch{}
    await service.stop();agent.destroy();output('[STOPPED] 晨会程序已停止，已有记录保留在本机。');session.finish();process.exit(code);
  }
  session.watchStop(()=>{void stop(0);});
  process.once('SIGINT',()=>{void stop(0);});process.once('SIGTERM',()=>{void stop(0);});
  process.once('uncaughtException',()=>{output('[FATAL] 原始错误已隐藏。');void stop(1);});
  process.once('unhandledRejection',()=>{output('[FATAL] 原始错误已隐藏。');void stop(1);});
  output('[MEETING_STARTING] 本轮指定测试群；保存本人行并更新同一条消息；定时关闭。');
  try{await ws.start({eventDispatcher:dispatcher});}catch(e){output('[CONNECT_FAILED] '+diagnosis(e,state.phase));await stop(1);}
}
if(require.main===module)main().catch(()=>{console.log('[MEETING_FAILED] 原始错误已隐藏。');process.exitCode=1;});
