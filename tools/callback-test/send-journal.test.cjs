'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createSendJournal}=require('./send-journal.cjs');
const {binding,createStore}=require('./meeting-store.cjs');
const {MeetingSchedule,beijing}=require('./meeting-schedule.cjs');
const {randomUUID}=require('node:crypto');
const config={appId:'cli_fixture',appSecret:'fixture'},groups=[{chat_id:'oc_fixture',schedule:true,start_date:'2026-01-01'}];
const key=binding({...config,chatId:groups[0].chat_id}),start=Date.parse('2026-09-21T01:30:00Z');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'earlymeeting-send-'));
  t.after(()=>{assert.equal(path.dirname(fs.realpathSync(root)),fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('earlymeeting-send-'));fs.rmSync(root,{recursive:true,force:true});});
  let wall=start,mono=0;const messages=[];
  const make=()=>createSendJournal(root,config,groups,s=>messages.push(s),{now:()=>wall,monotonic:()=>mono});
  return {root,make,messages,advance:(w,m=w)=>{wall+=w;mono+=m;}};
}
const fresh=()=>({stage:'new',createdAt:start});
test('durable intent blocks duplicate and uncertain retry across restart; confirmed original resumes',t=>{
  const f=fixture(t),j=f.make();assert.equal(j.reserve(key,'2026-09-21',fresh()),true);
  assert.equal(f.make().reserve(key,'2026-09-21',fresh()),false);
  const sent={...fresh(),stage:'sent',messageId:'om_fixture'};
  assert.equal(j.confirm(key,'2026-09-21',sent),true);
  assert.equal(f.make().resume(key,'2026-09-21',sent),true);
  assert.equal(f.make().reserve(key,'2026-09-21',fresh()),false);
  assert.equal(f.make().resume(key,'2026-09-21',{...sent,messageId:'om_wrong'}),false);
});
test('wall-clock jump freezes sending, persists across restart and does not self-clear on clock correction',t=>{
  const f=fixture(t),j=f.make();f.advance(91*86400000,1000);
  assert.equal(j.check(),false);assert.equal(j.status(),'CLOCK_MISMATCH');
  f.advance(-91*86400000,1000);assert.equal(f.make().check(),false);
});
test('normal midnight and weekend uptime accepted; backward time and long offline gaps require review',t=>{
  const f=fixture(t),j=f.make();
  for(let i=0;i<96;i++){f.advance(3600000);assert.equal(j.check(),true);}
  assert.equal(f.make().check(),true);
  f.advance(-300000,1000);assert.equal(j.check(),false);
  const g=fixture(t);g.make();g.advance(40*3600000);assert.equal(g.make().check(),false);
});
test('legacy successful log prevents sending after daily state loss and detects historical date jump',t=>{
  const f=fixture(t);fs.mkdirSync(path.join(f.root,'logs'));
  const event={at:'2026-09-21T09:30:00+08:00',event:'MEETING_SENT',group:1};
  fs.writeFileSync(path.join(f.root,'logs/service.jsonl'),JSON.stringify(event)+'\n');
  assert.equal(f.make().reserve(key,'2026-09-21',fresh()),false);
  const g=fixture(t);fs.mkdirSync(path.join(g.root,'logs'));
  fs.writeFileSync(path.join(g.root,'logs/service.jsonl'),[event,{...event,at:'2026-12-21T17:00:00+08:00'}].map(JSON.stringify).join('\n'));
  assert.equal(g.make().status(),'CLOCK_HISTORY_MISMATCH');
});
test('damaged or partial journal and mismatched state dates fail closed',t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'send-journal.json'),'{');assert.equal(f.make().check(),false);
  const g=fixture(t);g.make();fs.writeFileSync(path.join(g.root,'send-journal.json.next'),'{');assert.equal(g.make().check(),false);
  const h=fixture(t);assert.equal(h.make().reserve(key,'2026-09-21',{...fresh(),createdAt:start-86400000}),false);
  const missing=fixture(t);missing.make();fs.unlinkSync(path.join(missing.root,'send-journal.json'));
  assert.equal(missing.make().check(),false);
});
test('scheduler frozen by journal keeps existing confirmed card usable; no send or historical cleanup',async t=>{
  const f=fixture(t),today=beijing().date;
  const dir=path.join(f.root,'days',key,today);fs.mkdirSync(dir,{recursive:true});
  const store=createStore(dir,{...config,chatId:groups[0].chat_id}),s=store.get();
  Object.assign(s,{stage:'sent',cardId:'fixture_card',messageId:'om_fixture',sendUuid:randomUUID(),sendAt:Date.now()});store.put(s);
  const old=path.join(f.root,'days',key,'2026-01-01');fs.mkdirSync(old,{recursive:true});
  fs.writeFileSync(path.join(old,'meeting-state.json'),'preserve');
  fs.writeFileSync(path.join(f.root,'send-journal.json'),JSON.stringify({version:1,observedAt:Date.now(),blocked:'CLOCK_MISMATCH',entries:[]}));
  let calls=0;
  const schedule=new MeetingSchedule(f.root,config,()=>({createCard:()=>{calls++;},sendCard:()=>{calls++;}}),()=>{},()=>true,
    {settings:{groups,time:'09:30',minute:570}});
  await schedule.run();assert.equal(calls,0);assert.equal(schedule.active.get('oc_fixture').ready,true);
  assert.equal(fs.existsSync(path.join(old,'meeting-state.json')),true);await schedule.stop();
});
test('scheduler blocks known send when current-day state is missing',async t=>{
  const f=fixture(t),today=beijing().date;
  fs.writeFileSync(path.join(f.root,'send-journal.json'),JSON.stringify({version:1,observedAt:Date.now(),blocked:null,
    entries:[{binding:key,date:today,status:'sent',messageId:'om_fixture'}]}));
  // A persisted new state represents a interrupted/local-loss reconstruction.
  const dir=path.join(f.root,'days',key,today);fs.mkdirSync(dir,{recursive:true});
  const store=createStore(dir,{...config,chatId:'oc_fixture'});store.put(store.get());
  let calls=0;const schedule=new MeetingSchedule(f.root,config,()=>({createCard:()=>{calls++;},sendCard:()=>{calls++;}}),()=>{},()=>true,
    {settings:{groups,time:'09:30',minute:570}});
  await schedule.run();assert.equal(calls,0);await schedule.stop();
});
test('normal two-group sends confirm separate receipts; restart resumes without sending again',async t=>{
  const f=fixture(t),today=beijing().date,gs=[...groups,{...groups[0],chat_id:'oc_second'}];
  for(const g of gs){
    const c={...config,chatId:g.chat_id},dir=path.join(f.root,'days',binding(c),today);
    fs.mkdirSync(dir,{recursive:true});const store=createStore(dir,c);store.put(store.get());
  }
  let creates=0,sends=0;
  const api=c=>({createCard:async()=>({code:0,data:{card_id:'fixture_'+ ++creates}}),
    sendCard:async()=>({code:0,data:{chat_id:c.chatId,msg_type:'interactive',message_id:'om_fixture_'+ ++sends}})});
  const make=()=>new MeetingSchedule(f.root,config,api,()=>{},()=>true,{settings:{groups:gs,time:'09:30',minute:570}});
  const first=make();await first.run();await first.run();await first.stop();
  const second=make();await second.run();assert.equal(creates,2);assert.equal(sends,2);
  assert.ok([...second.active.values()].every(s=>s.ready));await second.stop();
  const journal=JSON.parse(fs.readFileSync(path.join(f.root,'send-journal.json')));
  assert.equal(journal.entries.length,2);assert.ok(journal.entries.every(e=>e.status==='sent'&&e.date===today));
});
