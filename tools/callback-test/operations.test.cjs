'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {binding}=require('./meeting-store.cjs');
const {createArchive,readOperations}=require('./meeting-archive.cjs');
const {cleanupHistory}=require('./meeting-retention.cjs');
const {createOperationsLog}=require('./operations-log.cjs');
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'earlymeeting-ops-fixture-'));
  t.after(()=>{
    const resolved=fs.realpathSync(root);
    if(path.dirname(resolved)!==fs.realpathSync(os.tmpdir())||!path.basename(resolved).startsWith('earlymeeting-ops-fixture-'))throw new Error('OUTSIDE_TEMP');
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  const config={appId:'cli_fixture'},groups=[{name:'群一',chat_id:'oc_one',delivery_ai:false},{name:'群二',chat_id:'oc_two',delivery_ai:true}];
  const put=(index,date,content)=>{
    const key=binding({...config,chatId:groups[index].chat_id}),dir=path.join(root,'days',key,date);
    fs.mkdirSync(dir,{recursive:true});
    const row={id:'r123456abcdef',owner:'ou_fixture',section:'planning',content,revision:1,editing:true,
      deliveryResult:{submissionId:randomUUID(),status:'ready',tasks:['交付甲']}};
    const state={version:1,binding:key,stage:'sent',sequence:1,createdAt:Date.parse(date+'T01:00:00Z'),
      cardId:'fixture',messageId:'om_fixture',sendUuid:randomUUID(),sendAt:Date.now(),rows:[row],
      delivery:{content:'共享已提交',revision:1},events:[],
      requests:[{kind:'save',row:row.id,owner:row.owner,revision:1,event:'a'.repeat(64),content:'QUEUED_NOT_SAVED'}],
      pending:{kind:'save',row:{...row,content:'UNKNOWN_NOT_SAVED'},sequence:2,uuid:randomUUID(),event:'a'.repeat(64),recovery:{status:'unknown',attempts:1}}};
    const file=path.join(dir,'meeting-state.json');fs.writeFileSync(file,JSON.stringify(state));
    return {key,dir,file,state};
  };
  return {root,config,groups,put};
}
test('archive starts on the configured date, isolates groups, stores committed content and replaces edited snapshots',t=>{
  const f=fixture(t),date='2026-09-14',a=f.put(0,date,'已提交甲'),b=f.put(1,date,'已提交乙');
  const deferred=createArchive(f.root,f.config,f.groups,{enabled:true,start_date:'2026-09-16'});
  assert.equal(deferred.snapshot(date),0);assert.equal(fs.existsSync(path.join(f.root,'archives')),false);
  const archive=createArchive(f.root,f.config,f.groups,{enabled:true,start_date:date});
  assert.equal(archive.snapshot(date),0);
  const read=key=>JSON.parse(fs.readFileSync(path.join(f.root,'archives',date,key+'.json')));
  assert.equal(read(a.key).records[0].content,'已提交甲');assert.equal(read(b.key).records[0].content,'已提交乙');
  assert.equal(read(a.key).delivery.mode,'manual');assert.equal(read(b.key).delivery.entries[0].tasks[0],'交付甲');
  assert.doesNotMatch(JSON.stringify(read(a.key)),/QUEUED_NOT_SAVED|UNKNOWN_NOT_SAVED/);
  a.state.rows[0].content='再次提交';fs.writeFileSync(a.file,JSON.stringify(a.state));
  archive.snapshot(date);assert.equal(read(a.key).records[0].content,'再次提交');
  const result=cleanupHistory(f.root,'2026-09-15',{beforeRemoveDay:archive.beforeRemoveDay});
  assert.equal(result.errors,0);assert.equal(fs.existsSync(a.file),false);assert.equal(read(a.key).final,true);
  assert.equal(read(a.key).unresolved.pending,true);
});
test('archive write failure blocks cleanup of the source day; retry finalizes then cleans',t=>{
  const f=fixture(t),date='2026-09-14',a=f.put(0,date,'提交已确认');
  const archive=createArchive(f.root,f.config,f.groups,{enabled:true,start_date:date});
  fs.writeFileSync(path.join(f.root,'archives'),'simulate inaccessible destination');
  assert.equal(archive.snapshot(date),1);
  let result=cleanupHistory(f.root,'2026-09-15',{beforeRemoveDay:archive.beforeRemoveDay});
  assert.equal(result.errors,1);assert.equal(fs.existsSync(a.file),true);
  fs.unlinkSync(path.join(f.root,'archives'));
  result=cleanupHistory(f.root,'2026-09-15',{beforeRemoveDay:archive.beforeRemoveDay});
  assert.equal(result.errors,0);assert.equal(fs.existsSync(a.file),false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'archives',date,a.key+'.json'))).records.length,1);
});
test('maintenance logs survive restarts, rotate within a size bound, and exclude raw text/secrets',t=>{
  const f=fixture(t),dir=path.join(f.root,'logs'),file=path.join(dir,'service.jsonl');
  createOperationsLog(dir)('[MEETING_STARTING] SECRET_SENTINEL ou_person');
  createOperationsLog(dir)('[GROUP_2] [ROW_SAVED] rows=3; content=PRIVATE_SENTINEL');
  const records=fs.readFileSync(file,'utf8');assert.equal(records.trim().split('\n').length,2);
  assert.doesNotMatch(records,/SECRET_SENTINEL|ou_person|PRIVATE_SENTINEL/);
  assert.match(records,/ROW_SAVED/);assert.equal(JSON.parse(records.trim().split('\n')[1]).group,2);
  createOperationsLog(dir,{maxBytes:1})('[STOPPED]');
  assert.match(fs.readFileSync(file+'.1','utf8'),/MEETING_STARTING/);
  assert.match(fs.readFileSync(file,'utf8'),/STOPPED/);
  assert.deepEqual(readOperations(f.root),{version:1,archive:{enabled:false}});
  fs.writeFileSync(path.join(f.root,'operations.json'),JSON.stringify({version:1,archive:{enabled:true,start_date:'2026-99-16'}}));
  assert.throws(()=>readOperations(f.root),/OPERATIONS_CONFIG_INVALID/);
});
