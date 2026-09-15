'use strict';
// Synthetic CI data only. The container used with it has --network none.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createStore,binding}=require('/app/meeting-store.cjs');
const {beijing}=require('/app/meeting-schedule.cjs');
const root='/fixture',json=(p,v)=>fs.writeFileSync(p,JSON.stringify(v));
const config={appId:'cli_offline_ci',appSecret:'SECRET_OFFLINE_SENTINEL'};
const today=beijing().date;
if(process.argv[2]==='init'){
  fs.mkdirSync(path.join(root,'config'),{recursive:true});fs.mkdirSync(path.join(root,'data'),{recursive:true});
  json(path.join(root,'config/config.json'),{app_id:config.appId,app_secret:config.appSecret});
  json(path.join(root,'config/ai.json'),{enabled:true,base_url:'https://api.deepseek.com',model:'offline-fixture',api_key:'AI_OFFLINE_SENTINEL'});
  json(path.join(root,'config/groups.json'),{version:1,timezone:'Asia/Shanghai',time:'09:30',weekdays:[1,2,3,4,5],
    groups:[1,2].map(i=>({name:'fixture',chat_id:'oc_offline_'+i,enabled:true,schedule:true,start_date:'2026-01-01',delivery_ai:i===2}))});
  for(const i of [1,2]){
    const cfg={...config,chatId:'oc_offline_'+i,deliveryAiEnabled:i===2};
    const dir=path.join(root,'data/days',binding(cfg),today);fs.mkdirSync(dir,{recursive:true});
    const store=createStore(dir,cfg),s=store.get();Object.assign(s,{stage:'sent',cardId:'card_offline_'+i,messageId:'om_offline_'+i,sendUuid:randomUUID(),sendAt:Date.now()});
    if(i===2){s.pending={kind:'add',row:{id:'r123456abcdef',owner:'ou_offline',section:'planning',content:'',revision:0},
      sequence:1,uuid:randomUUID(),event:'a'.repeat(64),recovery:{status:'unknown',attempts:1}};
      s.requests=[{kind:'add',owner:'ou_offline',section:'planning',event:'a'.repeat(64)}];}
    store.put(s);
    const old=path.join(root,'data/days',binding(cfg),'2020-01-01');fs.mkdirSync(old);json(path.join(old,'meeting-state.json'),{});
  }
  console.log('FIXTURE_READY');
}else {
  const status=JSON.parse(fs.readFileSync(path.join(root,'data/health.json')));
  assert.equal(status.running,false);assert.equal(status.connected,false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data/session.json'))).stopped,true);
  for(const i of [1,2]){
    const key=binding({...config,chatId:'oc_offline_'+i});
    const s=JSON.parse(fs.readFileSync(path.join(root,'data/days',key,today,'meeting-state.json')));
    assert.equal(s.messageId,'om_offline_'+i);assert.equal(s.sequence,0);
    assert.equal(fs.existsSync(path.join(root,'data/days',key,'2020-01-01')),false);
    if(i===2){assert.equal(s.pending.recovery.attempts,1);assert.equal(s.pending.recovery.status,'unknown');assert.equal(s.requests.length,1);}
  }
  console.log('SIGTERM_AND_PERSISTENCE_OK');
}
