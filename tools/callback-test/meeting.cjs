'use strict';
const {safeLogger,diagnosticHttp,diagnosis}=require('./probe.cjs');
const {MeetingSchedule}=require('./meeting-schedule.cjs');
const {createSession}=require('./session.cjs');
const {diagnosticAgent}=require('./transport.cjs');
const {createApi}=require('./meeting-api.cjs');
const {paths,loadRuntime,inspectStates,configError}=require('./runtime-config.cjs');
const {snapshot,writeStatus,health}=require('./runtime-status.cjs');

async function main({env=process.env,base=__dirname,LarkOverride}={}) {
  process.umask(0o077);
  const args=process.argv.slice(2);
  if(args.includes('--status')||args.includes('--healthcheck')) {
    const status=health(paths(env,base).dataDir);console.log(JSON.stringify(status));
    process.exitCode=status.ready?0:1;return;
  }
  let runtime,inspection;
  try{runtime=loadRuntime(env,base);inspection=inspectStates(runtime,{requireToday:args.includes('--require-today')});}
  catch(e){console.log(`[${configError(e)}] 请检查受控配置和当天状态；未连接飞书。`);process.exitCode=1;return;}
  if(args.includes('--check')) {
    console.log(JSON.stringify({config:'valid',...inspection}));process.exitCode=inspection.attention?2:0;return;
  }
  if(inspection.groups.some(g=>g.partial)) {
    console.log('[TODAY_STATE_PARTIAL] 存在未完成的当天状态写入，请先核对；未删除或覆盖。');process.exitCode=1;return;
  }
  const {config,dataDir,settings,fileLogging}=runtime;
  let session;
  try{session=createSession(dataDir,console.log,{fileLogging});}
  catch{console.log('[STATE_DIRECTORY_UNWRITABLE] 请检查状态挂载及目录权限。');process.exitCode=1;return;}
  const output=session.output;
  for(const key of ['EARLYMEETING_APP_ID','EARLYMEETING_APP_SECRET','EARLYMEETING_TEST_CHAT_ID'])delete process.env[key];
  const Lark=LarkOverride||require('@larksuiteoapi/node-sdk');
  const silent=Object.fromEntries(['trace','debug','info','warn','error'].map(k=>[k,()=>{}]));
  const state={connected:false,errors:0,phase:'STARTUP'};
  let schedule;
  try{schedule=new MeetingSchedule(dataDir,config,c=>createApi(c,Lark),output,()=>state.connected,{settings});}
  catch{output('[LOCAL_STATE_INVALID] 数据无法核对，已停止；请勿删除数据重发。');session.finish();process.exitCode=1;return;}
  const agent=diagnosticAgent(output,diagnosis,state);
  let wasConnected=false;
  const logger=safeLogger(line=>{
    output(line);
    if(state.connected&&!wasConnected){wasConnected=true;void schedule.tick();}
    if(!state.connected)wasConnected=false;
  },state);
  const dispatcher=new Lark.EventDispatcher({logger:silent}).register({'card.action.trigger':payload=>schedule.handle(payload)});
  const ws=new Lark.WSClient({appId:config.appId,appSecret:config.appSecret,
    domain:Lark.Domain.Feishu,logger,loggerLevel:Lark.LoggerLevel.debug,autoReconnect:true,
    agent,httpInstance:diagnosticHttp(Lark.defaultHttpInstance,output,state)});
  let stopping=false,heartbeat;
  const report=()=>writeStatus(dataDir,snapshot(schedule,state,stopping,inspectStates(runtime)));
  async function stop(code){
    if(stopping)return;stopping=true;state.stopping=true;clearInterval(heartbeat);
    try{
      report();try{ws.close({force:true});}catch{}
      await schedule.stop();agent.destroy();
      output('[STOPPED] 晨会服务已停止，当天记录与队列保留。');report();session.finish();
    }catch{console.log('[STOP_FAILED] 停止未完成，请保留当天状态并核对。');code=1;}
    process.exit(code);
  }
  session.watchStop(()=>{void stop(0);});
  process.once('SIGINT',()=>{void stop(0);});
  process.once('SIGTERM',()=>{void stop(0);});
  process.once('uncaughtException',()=>{output('[FATAL] 原始错误已隐藏。');void stop(1);});
  process.once('unhandledRejection',()=>{output('[FATAL] 原始错误已隐藏。');void stop(1);});
  output(`[AI_${config.deliveryAi?'CONFIG_READY':'DISABLED'}] 仅按群配置使用现有交付规则。`);
  output('[MEETING_STARTING] 当天同卡填写；定时按 groups.json；关闭时保留队列。');
  schedule.start();report();heartbeat=setInterval(report,5000);
  try{await ws.start({eventDispatcher:dispatcher});}catch(e){output('[CONNECT_FAILED] '+diagnosis(e,state.phase));await stop(1);}
}
if(require.main===module)main().catch(()=>{console.log('[MEETING_FAILED] 原始错误已隐藏。');process.exitCode=1;});
module.exports={main};
