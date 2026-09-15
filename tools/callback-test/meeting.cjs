'use strict';
const path=require('node:path');
const {readConfig,safeLogger,diagnosticHttp,diagnosis}=require('./probe.cjs');
const {MeetingSchedule}=require('./meeting-schedule.cjs');
const {createSession}=require('./session.cjs');
const {diagnosticAgent}=require('./transport.cjs');
const {createApi}=require('./meeting-api.cjs');
const {createAi}=require('./meeting-ai.cjs');
async function main() {
  const session=createSession(path.join(__dirname,'.local','meeting'));
  const output=session.output;
  let config;
  try{config=readConfig(process.env);}catch{output('[CONFIG_ERROR] 请检查本机配置。');session.finish();return;}
  try{config.deliveryAi=createAi(path.join(__dirname,'.local','meeting'));
    output(config.deliveryAi?'[AI_CONFIG_READY] 仅对群配置中开启 delivery_ai 的群启用识别。':'[AI_DISABLED] 已开启自动交付的群使用本机明确标记规则，其他群保持手填。');}
  catch{config.deliveryAi=null;output('[AI_CONFIG_INVALID] AI配置无效；已开启自动交付的群使用本机规则，其他群保持手填。');}
  for(const key of ['EARLYMEETING_APP_ID','EARLYMEETING_APP_SECRET','EARLYMEETING_TEST_CHAT_ID'])delete process.env[key];
  const Lark=require('@larksuiteoapi/node-sdk');
  const silent=Object.fromEntries(['trace','debug','info','warn','error'].map(k=>[k,()=>{}]));
  const state={connected:false,errors:0,phase:'STARTUP'};
  let schedule;
  try{schedule=new MeetingSchedule(path.join(__dirname,'.local','meeting'),config,c=>createApi(c,Lark),output,()=>state.connected);}
  catch{output('[LOCAL_STATE_INVALID] 本轮数据无法核对，已停止；请勿删除数据重发。');session.finish();return;}
  const agent=diagnosticAgent(output,diagnosis,state);
  let wasConnected=false;
  const logger=safeLogger(line=>{
    output(line);
    if(state.connected&&!wasConnected){wasConnected=true;void schedule.tick();}
    if(!state.connected)wasConnected=false;
  },state);
  const dispatcher=new Lark.EventDispatcher({logger:silent}).register({
    'card.action.trigger':payload=>schedule.handle(payload),
  });
  const ws=new Lark.WSClient({appId:config.appId,appSecret:config.appSecret,
    domain:Lark.Domain.Feishu,logger,loggerLevel:Lark.LoggerLevel.debug,autoReconnect:true,
    agent,httpInstance:diagnosticHttp(Lark.defaultHttpInstance,output,state)});
  let stopping=false;
  async function stop(code){
    if(stopping)return;stopping=true;state.stopping=true;
    try{ws.close({force:true});}catch{}
    await schedule.stop();agent.destroy();output('[STOPPED] 晨会程序已停止，已有记录保留在本机。');session.finish();process.exit(code);
  }
  session.watchStop(()=>{void stop(0);});
  process.once('SIGINT',()=>{void stop(0);});process.once('SIGTERM',()=>{void stop(0);});
  process.once('uncaughtException',()=>{output('[FATAL] 原始错误已隐藏。');void stop(1);});
  process.once('unhandledRejection',()=>{output('[FATAL] 原始错误已隐藏。');void stop(1);});
  output('[MEETING_STARTING] 仅处理本机配置群；当天同卡填写；定时按 groups.json。');
  schedule.start();
  try{await ws.start({eventDispatcher:dispatcher});}catch(e){output('[CONNECT_FAILED] '+diagnosis(e,state.phase));await stop(1);}
}
if(require.main===module)main().catch(()=>{console.log('[MEETING_FAILED] 原始错误已隐藏。');process.exitCode=1;});
