'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {loadRuntime,inspectStates}=require('./runtime-config.cjs');
const {createStore,binding}=require('./meeting-store.cjs');
const {beijing}=require('./meeting-schedule.cjs');
const {exportBundle}=require('./transfer.cjs');
const {snapshot,writeStatus,health}=require('./runtime-status.cjs');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'earlymeeting-runtime-'));
  t.after(()=>{const p=fs.realpathSync(root);assert.equal(path.dirname(p),fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(p).startsWith('earlymeeting-runtime-'));fs.rmSync(p,{recursive:true,force:true});});
  const config=path.join(root,'config'),data=path.join(root,'data');
  fs.mkdirSync(config);fs.mkdirSync(data);
  const write=(name,value)=>fs.writeFileSync(path.join(config,name),JSON.stringify(value));
  write('config.json',{app_id:'cli_fixture',app_secret:'SECRET_MUST_NOT_APPEAR'});
  write('groups.json',{version:1,timezone:'Asia/Shanghai',time:'09:30',weekdays:[1,2,3,4,5],groups:[
    {name:'fixture',chat_id:'oc_fixture',enabled:true,schedule:true,start_date:'2026-01-01',delivery_ai:false}]});
  const env={EARLYMEETING_CONFIG_DIR:config,EARLYMEETING_DATA_DIR:data};
  const runtime=loadRuntime(env),key=binding({...runtime.config,chatId:'oc_fixture'});
  const dir=path.join(data,'days',key,beijing().date);fs.mkdirSync(dir,{recursive:true});
  const store=createStore(dir,{...runtime.config,chatId:'oc_fixture'}),s=store.get();
  Object.assign(s,{stage:'sent',cardId:'fixture_card',messageId:'om_fixture_message',sendUuid:randomUUID(),sendAt:Date.now()});store.put(s);
  return {root,config,data,write,env,runtime,store,dir};
}
test('configuration check is offline, rejects missing secrets/AI and reports today pending without printing content',t=>{
  const f=fixture(t);
  const run=(args=['--check','--require-today'])=>spawnSync(process.execPath,[path.join(__dirname,'meeting.cjs'),...args],
    {env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,...f.env},encoding:'utf8'});
  let r=run();assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/"config":"valid"/);
  r=run(['--chek']);assert.equal(r.status,1);assert.match(r.stdout,/ARGUMENTS_INVALID/);
  assert.doesNotMatch(r.stdout,/MEETING_STARTING/);
  const s=f.store.get();s.pending={kind:'add',row:{id:'r123456abcdef',owner:'ou_fixture',section:'planning',content:'',revision:0},
    sequence:1,uuid:randomUUID(),event:'a'.repeat(64),recovery:{status:'unknown',attempts:1}};
  f.store.put(s);r=run();assert.equal(r.status,2);assert.match(r.stdout,/"pending":"unknown"/);
  assert.doesNotMatch(r.stdout,/SECRET_MUST_NOT_APPEAR|ou_fixture|fixture_message|r123456abcdef/);
  const g=JSON.parse(fs.readFileSync(path.join(f.config,'groups.json')));g.groups[0].delivery_ai=true;f.write('groups.json',g);
  r=run();assert.equal(r.status,1);assert.match(r.stdout,/AI_CONFIG_REQUIRED/);
  f.write('config.json',{app_id:'cli_fixture',app_secret:''});r=run();assert.equal(r.status,1);assert.match(r.stdout,/APP_CONFIG_INVALID/);
  assert.equal(fs.existsSync(path.join(f.data,'session.json')),false);
});
test('stopped-host export preserves today intent exactly, excludes process files, refuses active service and overwrite',t=>{
  const f=fixture(t),s=f.store.get();
  s.pending={kind:'add',row:{id:'r123456abcdef',owner:'ou_fixture',section:'planning',content:'',revision:0},
    sequence:1,uuid:randomUUID(),event:'a'.repeat(64),recovery:{status:'unknown',attempts:1}};
  s.requests=[{kind:'add',owner:'ou_fixture',section:'planning',event:'a'.repeat(64)}];f.store.put(s);
  fs.writeFileSync(path.join(f.data,'session.json'),JSON.stringify({pid:process.pid,stopped:false}));
  const out=path.join(f.root,'bundle');assert.throws(()=>exportBundle(f.runtime,out),/STOP_OLD_SERVICE_FIRST/);
  fs.writeFileSync(path.join(f.data,'session.json'),JSON.stringify({stopped:true}));
  const result=exportBundle(f.runtime,out);assert.equal(result.attention,true);
  const imported=loadRuntime({EARLYMEETING_CONFIG_DIR:path.join(out,'config'),EARLYMEETING_DATA_DIR:path.join(out,'data')});
  assert.deepEqual(inspectStates(imported,{requireToday:true}),inspectStates(f.runtime,{requireToday:true}));
  const relative=path.relative(f.data,path.join(f.dir,'meeting-state.json'));
  assert.deepEqual(fs.readFileSync(path.join(out,'data',relative)),fs.readFileSync(path.join(f.data,relative)));
  assert.equal(fs.existsSync(path.join(out,'data','session.json')),false);
  assert.throws(()=>exportBundle(f.runtime,out));
});
test('health distinguishes a running process, connection, and a blocked group; checks partial writes',t=>{
  const f=fixture(t),g={chat_id:'oc_fixture',schedule:true,start_date:'2026-01-01'};
  const service={store:f.store,fault:false};
  const schedule={groups:[g],active:new Map([[g.chat_id,{service,ready:true}]]),day:beijing().date,schedule:{minute:570}};
  let s=snapshot(schedule,{connected:false});writeStatus(f.data,s);
  assert.equal(health(f.data).running,true);assert.equal(health(f.data).ready,false);
  s=snapshot(schedule,{connected:true});writeStatus(f.data,s);assert.equal(health(f.data).ready,true);
  const state=f.store.get();state.pending={kind:'add',row:{id:'r123456abcdef',owner:'ou_fixture',section:'planning',content:'',revision:0},
    sequence:1,uuid:randomUUID(),event:'a'.repeat(64),recovery:{status:'unknown',attempts:1}};f.store.put(state);
  s=snapshot(schedule,{connected:true});assert.equal(s.groups[0].status,'attention');assert.equal(s.ready,false);
  schedule.active.clear();s=snapshot(schedule,{connected:false},false,inspectStates(f.runtime));
  assert.equal(s.groups[0].pending,'unknown');assert.equal(s.groups[0].status,'attention');assert.equal(s.ready,false);
  fs.writeFileSync(path.join(f.dir,'meeting-state.json.next'),'unfinished');
  assert.equal(inspectStates(f.runtime).groups[0].partial,true);
});
