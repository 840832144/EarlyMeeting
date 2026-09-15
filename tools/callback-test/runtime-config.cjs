'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {readConfig}=require('./probe.cjs');
const {readSettings,beijing}=require('./meeting-schedule.cjs');
const {createAi}=require('./meeting-ai.cjs');
const {binding,validate}=require('./meeting-store.cjs');

function paths(env=process.env,base=__dirname) {
  const configDir=path.resolve(env.EARLYMEETING_CONFIG_DIR||path.join(base,'.local'));
  return {configDir,settingsDir:env.EARLYMEETING_CONFIG_DIR?configDir:path.join(base,'.local','meeting'),
    dataDir:path.resolve(env.EARLYMEETING_DATA_DIR||path.join(base,'.local','meeting')),
    fileLogging:env.EARLYMEETING_FILE_LOG!=='0'};
}
function loadRuntime(env=process.env,base=__dirname) {
  const locations=paths(env,base);
  let config;
  if(env.EARLYMEETING_APP_ID||env.EARLYMEETING_APP_SECRET||env.EARLYMEETING_TEST_CHAT_ID) {
    try{config=readConfig(env);}catch{throw new Error('APP_CONFIG_INVALID');}
  }else {
    let c;
    try{c=JSON.parse(fs.readFileSync(path.join(locations.configDir,'config.json'),'utf8').replace(/^\uFEFF/,''));}
    catch{throw new Error('APP_CONFIG_MISSING_OR_INVALID_JSON');}
    if(!/^cli_[A-Za-z0-9_-]+$/.test(c.app_id||'')||typeof c.app_secret!=='string'||!c.app_secret.trim()||/\s/.test(c.app_secret)||
      (c.test_chat_id&&!/^oc_[A-Za-z0-9_-]+$/.test(c.test_chat_id)))throw new Error('APP_CONFIG_INVALID');
    config={appId:c.app_id,appSecret:c.app_secret,chatId:c.test_chat_id||undefined};
  }
  let settings;
  try{settings=readSettings(locations.settingsDir,config,{createIfMissing:false});}
  catch{throw new Error('GROUP_CONFIG_MISSING_OR_INVALID');}
  if(!settings.groups.length)throw new Error('NO_ENABLED_GROUPS');
  try{config.deliveryAi=createAi(locations.settingsDir);}catch{throw new Error('AI_CONFIG_INVALID');}
  // Do not silently switch the company's configured AI group to another mode.
  if(settings.groups.some(g=>g.delivery_ai)&&!config.deliveryAi)throw new Error('AI_CONFIG_REQUIRED');
  return {...locations,config,settings};
}
function inspectStates(runtime,{requireToday=false}={}) {
  const today=beijing().date;
  const groups=runtime.settings.groups.map((g,index)=>{
    const key=binding({...runtime.config,chatId:g.chat_id});
    const directory=path.join(runtime.dataDir,'days',key,today);
    const file=path.join(directory,'meeting-state.json');
    if(!fs.existsSync(file))return {group:index+1,state:'missing',attention:requireToday};
    let s;
    try{s=validate(JSON.parse(fs.readFileSync(file,'utf8')),key);
      if(beijing(s.createdAt).date!==today)throw new Error('STATE_DATE_MISMATCH');}
    catch{throw new Error('TODAY_STATE_INVALID');}
    const partial=fs.existsSync(file+'.next');
    return {group:index+1,state:s.stage,rows:s.rows.length,queued:s.requests?.length||0,
      pending:s.pending?.recovery?.status||(s.pending?'unknown':'none'),
      layoutPending:!!s.layoutPending,summaryPending:!!s.summaryPending,partial,
      attention:partial||s.stage!=='sent'||!!s.layoutPending||!!s.summaryPending||
        (!!s.pending&&s.pending.recovery?.status!=='retrying')};
  });
  return {date:today,time:runtime.settings.time,groups,attention:groups.some(g=>g.attention)};
}
const codes=new Set(['APP_CONFIG_INVALID','APP_CONFIG_MISSING_OR_INVALID_JSON','GROUP_CONFIG_MISSING_OR_INVALID',
  'NO_ENABLED_GROUPS','AI_CONFIG_INVALID','AI_CONFIG_REQUIRED','TODAY_STATE_INVALID']);
function configError(e){return codes.has(e?.message)?e.message:'LOCAL_CONFIG_OR_STATE_ERROR';}
module.exports={paths,loadRuntime,inspectStates,configError};
