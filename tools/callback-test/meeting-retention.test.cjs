'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {cleanupHistory}=require('./meeting-retention.cjs');
const {MeetingSchedule}=require('./meeting-schedule.cjs');
const {MeetingService}=require('./meeting-service.cjs');
const {binding}=require('./meeting-store.cjs');
const {layoutVersion}=require('./meeting-card.cjs');
const {SUMMARY_VERSION}=require('./meeting-delivery.cjs');
const {randomUUID}=require('node:crypto');
const today='2026-09-15',group='a'.repeat(64);
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'earlymeeting-retention-fixture-'));
  t.after(()=>{
    const target=fs.realpathSync(root),parent=fs.realpathSync(os.tmpdir());
    if(path.dirname(target)!==parent||!path.basename(target).startsWith('earlymeeting-retention-fixture-'))
      throw new Error('TEST_CLEANUP_OUTSIDE_TEMP');
    fs.rmSync(target,{recursive:true,force:true});
  });
  const put=(relative,text)=>{const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);return file;};
  return {root,put};
}
function oldState(){return {version:1,binding:group,stage:'new',sequence:0,createdAt:Date.parse('2026-09-07T00:00:00Z'),rows:[],events:[],requests:[],pending:null};}

test('remove old daily/legacy/manual copies; keep today including pending writes and all config',t=>{
  const f=fixture(t),old=JSON.stringify(oldState());
  const removed=[f.put(`days/${group}/2026-09-14/meeting-state.json`,old),
    f.put(`days/${group}/2026-09-14/meeting-state.json.next`,'partial'),
    f.put('meeting-state.json',old),f.put('manual-resend-1234abcd/meeting-state.json',old),
    f.put('manual-resend-1234abcd/previous-state.json',old)];
  const kept=[f.put(`days/${group}/${today}/meeting-state.json`,'today pending'),
    f.put(`days/${group}/${today}/meeting-state.json.next`,'today partial'),
    f.put(`days/${group}/2026-09-16/meeting-state.json`,'future'),
    f.put('groups.json','config'),f.put('ai.json','config'),f.put('daily-migration.json','marker'),
    f.put('code-backup/meeting-service.cjs','code'),f.put('status.log','codes only')];
  const contents=kept.map(file=>fs.readFileSync(file,'utf8'));
  assert.deepEqual(cleanupHistory(f.root,today),{files:5,days:1,errors:0});
  assert.ok(removed.every(file=>!fs.existsSync(file)));
  assert.deepEqual(kept.map(file=>fs.readFileSync(file,'utf8')),contents);
  assert.deepEqual(cleanupHistory(f.root,today),{files:0,days:0,errors:0});
});

test('refuse directory junctions and unknown filenames instead of deleting outside the approved tree',t=>{
  const f=fixture(t),outside=fixture(t);
  const target=outside.put('meeting-state.json','must survive');
  fs.mkdirSync(path.join(f.root,'days',group),{recursive:true});
  fs.symlinkSync(outside.root,path.join(f.root,'days',group,'2026-09-14'),'junction');
  const unknown=f.put(`days/${group}/2026-09-13/notes.txt`,'not owned');
  const result=cleanupHistory(f.root,today);
  assert.equal(result.files,0);assert.equal(result.errors,1);
  assert.equal(fs.readFileSync(target,'utf8'),'must survive');assert.ok(fs.existsSync(unknown));
  assert.throws(()=>cleanupHistory(f.root,'2026-99-15'),/DATE_INVALID/);
});

test('rollover stops old workers before cleanup, even when offline; never sends to catch up old days',async t=>{
  const f=fixture(t),now=Date.now(),date=new Date(now+8*3600000).toISOString().slice(0,10);
  const oldDate=new Date(now+8*3600000-86400000).toISOString().slice(0,10);
  const old=f.put(`days/${group}/${oldDate}/meeting-state.json`,'old');
  const current=f.put(`days/${group}/${date}/meeting-state.json`,'current');
  let stopped=false;
  const schedule=Object.assign(Object.create(MeetingSchedule.prototype),{directory:f.root,day:oldDate,cleanedDay:oldDate,cleanupRetryAt:0,
    groups:[],active:new Map([['fixture',{service:{stop:async()=>{
      assert.ok(fs.existsSync(old));await Promise.resolve();fs.writeFileSync(old,'last old write');stopped=true;
    }}}]]),connected:()=>false,output:()=>{},stopped:false,work:null});
  await schedule.tick();
  assert.equal(stopped,true);assert.equal(fs.existsSync(old),false);assert.ok(fs.existsSync(current));
  assert.equal(schedule.day,date);assert.equal(schedule.cleanedDay,date);assert.equal(schedule.active.size,0);
});

test('maintenance restart preserves today unknown intent and never replays it',async t=>{
  const config={appId:'cli_fixture',chatId:'oc_fixture'},uuid=randomUUID();
  const row={id:'r000000000001',owner:'ou_fixture',section:'planning',content:'',revision:0};
  let state={version:1,binding:binding(config),createdAt:Date.now(),stage:'sent',sequence:0,cardId:'fixture',messageId:'om_fixture',
    sendUuid:randomUUID(),sendAt:Date.now(),layoutVersion:layoutVersion(config),summaryVersion:SUMMARY_VERSION,
    rows:[],delivery:{content:'',revision:0},events:[],requests:[{kind:'add',owner:row.owner,section:row.section,event:'a'.repeat(64)}],
    pending:{kind:'add',row,event:'a'.repeat(64),uuid,sequence:1,recovery:{status:'unknown',attempts:1}}};
  const before=structuredClone(state),store={get:()=>structuredClone(state),put:next=>{state=structuredClone(next);}};
  const api=new Proxy({},{get:()=>()=>{assert.fail('Unconfirmed update must not be replayed');}});
  const service=new MeetingService(config,store,api,()=>{},{ai:null});t.after(()=>service.stop());
  assert.equal(await service.prepare(),false);assert.deepEqual(state,before);
});
