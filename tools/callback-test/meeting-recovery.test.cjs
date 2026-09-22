'use strict';
// Only the reproduced queue/recovery risks; no network, credentials or real rows.
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {MeetingService}=require('./meeting-service.cjs');
const {binding,validate}=require('./meeting-store.cjs');
const {layoutVersion}=require('./meeting-card.cjs');
const {SUMMARY_VERSION}=require('./meeting-delivery.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clone=structuredClone;
function fixture(t,{autoDelivery=false,output=()=>{},retryDelays=[5,10,20],store:previous}={}) {
  const config={appId:'cli_fixture',chatId:'oc_fixture',deliveryAiEnabled:autoDelivery};
  let state={version:1,binding:binding(config),stage:'sent',sequence:0,createdAt:Date.now(),
    cardId:'fixture',messageId:'om_fixture',sendUuid:randomUUID(),sendAt:Date.now(),
    layoutVersion:layoutVersion(config),summaryVersion:SUMMARY_VERSION,
    rows:[1,2,3].map(n=>({id:'r'+String(n).padStart(12,'0'),owner:'ou_fixture'+n,
      section:n===3?'engineering':'planning',content:'',revision:0})),
    delivery:{content:'',revision:0},events:[],requests:[],pending:null};
  const store=previous||{get:()=>clone(state),put:next=>{validate(next,binding(config));state=clone(next);}};
  const calls=[],logs=[];
  const api={updateRow:async(_card,intent)=>{calls.push(clone(intent));return {code:0};},
    updateLayout:async()=>({code:0}),updateSummary:async()=>({code:0})};
  api.updateRowAndSummary=(...args)=>api.updateRow(...args);
  const service=new MeetingService(config,store,api,line=>{logs.push(line);output(line);},
    {delay:0,retryDelays,ai:null});
  t.after(()=>service.stop());
  let event=0;
  const payload=n=>{
    const row=store.get().rows[n-1];
    return {header:{event_id:'fixture_'+ ++event},event:{operator:{open_id:row.owner},
      context:{open_chat_id:config.chatId,open_message_id:'om_fixture'},
      action:{tag:'button',value:{op:'save',row:row.id,revision:row.revision},
        form_value:{['content_'+row.id]:'fixture '+n}}}};
  };
  return {service,store,api,calls,logs,payload};
}
async function until(predicate) {
  for(let n=0;n<200;n++){if(predicate())return;await sleep(5);}
  assert.fail('Expected queue state was not reached');
}
function afterMicrotasks(depth,fn){if(depth===0)fn();else queueMicrotask(()=>afterMicrotasks(depth-1,fn));}

for(const autoDelivery of [false,true])test(`one owner may add in both sections and add again in ${autoDelivery?'AI':'manual'} group`,async t=>{
  const f=fixture(t,{autoDelivery});
  const add=section=>{const p=f.payload(1);p.event.action={tag:'button',value:{op:'add',section}};return p;};
  const engineering=add('engineering'),planning=add('planning');
  assert.match(f.service.handle(engineering).toast.content,/已排队/);
  f.service.handle(engineering); // Same event while in flight must not append twice.
  assert.match(f.service.handle(planning).toast.content,/已排队/);
  await until(()=>f.store.get().requests.length===0);
  assert.equal(f.store.get().rows.length,5);
  f.service.handle(engineering);assert.equal(f.store.get().rows.length,5);
  assert.match(f.service.handle(add('planning')).toast.content,/已排队/);
  await until(()=>f.store.get().rows.length===6);
  const row=f.store.get().rows[5],other=f.payload(6);
  other.event.operator.open_id='ou_not_owner';
  assert.equal(f.service.handle(other).toast.type,'warning');
  f.service.handle(f.payload(6));await until(()=>f.store.get().rows[5].content==='fixture 6');
  assert.equal(f.store.get().rows[0].content,'');
  const remove=f.payload(6);remove.event.action={tag:'button',value:{op:'delete',row:row.id,revision:1}};
  f.service.handle(remove);await until(()=>f.store.get().rows.length===5);
  assert.equal(f.store.get().rows.filter(r=>r.owner===row.owner).length,3);
  await f.service.stop();
  const resumed=fixture(t,{autoDelivery,store:f.store});
  assert.equal(await resumed.service.prepare(),true);
  assert.equal(resumed.store.get().rows.length,5);
});

test('new callback at worker completion cannot remain stranded',async t=>{
  for(const depth of [3,4]) {
    let injected=false,ack;
    const f=fixture(t,{output:line=>{
      if(line.includes('[ROW_SAVED]')&&!injected){injected=true;
        afterMicrotasks(depth,()=>{ack=f.service.handle(f.payload(2));});}
    }});
    f.service.handle(f.payload(1));
    await until(()=>f.store.get().rows.filter(r=>r.content).length===2);
    assert.match(ack.toast.content,/已排队/);
    assert.equal(f.store.get().requests.length,0);assert.equal(f.calls.length,2);
  }
});

for(const autoDelivery of [false,true])test(`temporary refusal resumes FIFO in ${autoDelivery?'AI':'manual'} group`,async t=>{
  const f=fixture(t,{autoDelivery,retryDelays:[25,25]});
  let blocked=true;
  f.api.updateRow=async(_card,p)=>{f.calls.push(clone(p));return {code:blocked?200810:0};};
  f.service.handle(f.payload(1));f.service.handle(f.payload(2));await f.service.queue;
  assert.equal(f.store.get().pending.recovery.status,'retrying');
  assert.match(f.service.handle(f.payload(3)).toast.content,/已排队/);
  assert.match(f.service.handle(f.payload(1)).toast.content,/自动重试/);
  blocked=false;
  await until(()=>f.store.get().rows.every(r=>r.content));
  assert.equal(f.store.get().requests.length,0);assert.equal(f.store.get().pending,null);
  assert.deepEqual(f.calls.map(p=>p.sequence),[1,1,2,3]);
  assert.equal(f.calls[0].uuid,f.calls[1].uuid);
  assert.deepEqual(f.store.get().rows.map(r=>r.content),['fixture 1','fixture 2','fixture 3']);
});

test('bounded backoff survives repeated refusals and is cancelled on stop',async t=>{
  const f=fixture(t,{retryDelays:[5,10,25]});
  f.api.updateRow=async(_card,p)=>{f.calls.push(clone(p));return {code:200810};};
  f.service.handle(f.payload(1));
  await until(()=>f.calls.length>=4);
  await f.service.stop();
  const n=f.calls.length;await sleep(40);assert.equal(f.calls.length,n);
  assert.equal(f.store.get().requests.length,1);
  assert.equal(f.store.get().rows[0].content,'');
  assert.ok(f.logs.some(line=>line.includes('delay_ms=25')));
  assert.equal(new Set(f.calls.map(p=>p.uuid)).size,1);
});

test('timeout after known refusal clears retry permission; no spin or skip',async t=>{
  const f=fixture(t);let attempts=0;
  f.api.updateRow=async()=>{if(++attempts===1)return {code:200810};throw new Error('ETIMEDOUT');};
  f.service.handle(f.payload(1));f.service.handle(f.payload(2));
  await until(()=>!f.service.processing&&f.store.get().pending?.recovery.status==='unknown');
  await sleep(50);assert.equal(attempts,2);
  assert.equal(f.store.get().requests.length,2);assert.equal(f.store.get().sequence,0);
  assert.match(f.service.handle(f.payload(3)).toast.content,/待确认/);
});

test('explicit rejection and UUID/sequence ambiguity remain distinguishable and durable',async t=>{
  for(const code of [200860,200770,300317]) {
    const f=fixture(t);let calls=0;
    f.api.updateRow=async()=>{calls++;return {code};};
    f.service.handle(f.payload(1));f.service.handle(f.payload(2));await f.service.queue;
    assert.equal(f.store.get().pending.recovery.status,code===200860?'rejected':'unknown');
    assert.match(f.service.handle(f.payload(3)).toast.content,code===200860?/拒绝更新/:/待确认/);
    await sleep(30);assert.equal(calls,1);assert.equal(f.store.get().requests.length,2);
  }
});

test('restart resumes the same persisted update without create/send or duplicate rows',async t=>{
  const first=fixture(t,{retryDelays:[60000]});
  first.api.updateRow=async()=>({code:200810});
  first.service.handle(first.payload(1));first.service.handle(first.payload(2));await first.service.queue;
  const intent=first.store.get().pending;await first.service.stop();
  const second=fixture(t,{store:first.store});
  assert.equal(await second.service.prepare(),true);
  await until(()=>second.store.get().requests.length===0);
  assert.equal(second.calls[0].uuid,intent.uuid);assert.equal(second.calls[0].sequence,intent.sequence);
  assert.equal(second.store.get().rows.length,3);assert.equal(second.store.get().rows[1].content,'fixture 2');
});

test('still-busy update at startup becomes ready and recovers autonomously',async t=>{
  const first=fixture(t);first.api.updateRow=async()=>({code:200810});
  first.service.handle(first.payload(1));await first.service.queue;await first.service.stop();
  const second=fixture(t,{store:first.store});let calls=0;
  second.api.updateRow=async()=>({code:++calls===1?200810:0});
  assert.equal(await second.service.prepare(),true);
  await until(()=>second.store.get().requests.length===0);
  assert.equal(calls,2);assert.equal(second.store.get().rows[0].content,'fixture 1');
});

test('one group in cooldown does not delay the other group',async t=>{
  const busy=fixture(t,{retryDelays:[60000]}),healthy=fixture(t);
  busy.api.updateRow=async()=>({code:200810});
  busy.service.handle(busy.payload(1));healthy.service.handle(healthy.payload(1));
  await until(()=>healthy.store.get().rows[0].content);
  assert.equal(busy.store.get().rows[0].content,'');
  assert.equal(healthy.store.get().requests.length,0);
});

test('not-ready schedule slot resumes a busy update before layout migration',async t=>{
  const {MeetingSchedule,beijing}=require('./meeting-schedule.cjs');
  const f=fixture(t,{retryDelays:[5]});
  f.api.updateRow=async()=>({code:200810});
  f.service.handle(f.payload(1));await f.service.queue;await f.service.stop();
  const state=f.store.get();state.layoutVersion=1;f.store.put(state);
  const resumed=fixture(t,{store:f.store});let blocked=true;
  resumed.api.updateRow=async()=>({code:blocked?200810:0});
  assert.equal(await resumed.service.prepare(),false);
  const slot={service:resumed.service,ready:false};
  const scheduler=Object.assign(Object.create(MeetingSchedule.prototype),{day:beijing().date,
    active:new Map([['oc_fixture',slot]]),groups:[{chat_id:'oc_fixture'}],output:()=>{},connected:()=>true,
    cleanedDay:beijing().date,cleanupRetryAt:0});
  scheduler.sendJournal={check:()=>true}; // This fixture isolates an existing update queue; no send path.
  blocked=false;await sleep(15);await scheduler.run();
  assert.equal(slot.ready,true);assert.equal(scheduler.active.size,1);
  assert.equal(f.store.get().rows[0].content,'fixture 1');
  assert.equal(f.store.get().pending,null);assert.equal(f.store.get().layoutVersion,14);
});

test('transport timeout retries the same add intent and then drains queued saves',async t=>{
  const f=fixture(t,{retryDelays:[20]});let attempts=0;
  f.api.updateRow=async(_card,p)=>{
    f.calls.push(clone(p));
    if(++attempts===1)throw Object.assign(new Error('private response omitted'),{code:'ECONNABORTED'});
    return {code:0};
  };
  const add=f.payload(1);add.event.operator.open_id='ou_fixture4';
  add.event.action={tag:'button',value:{op:'add',section:'engineering'}};
  f.service.handle(add);await f.service.queue;
  assert.equal(f.store.get().pending.recovery.status,'retrying');
  assert.match(f.service.handle(f.payload(2)).toast.content,/已排队/);
  await until(()=>f.store.get().requests.length===0);
  assert.equal(f.store.get().rows.length,4);
  assert.equal(f.store.get().rows[1].content,'fixture 2');
  assert.equal(f.calls[0].uuid,f.calls[1].uuid);
  assert.equal(f.calls[0].sequence,f.calls[1].sequence);
  assert.deepEqual(f.calls[0].row,f.calls[1].row);
});

test('transport retries are bounded and UUID conflicts never acknowledge success',async t=>{
  for(const lastReply of ['timeout',200770,300317]) {
    const f=fixture(t);let calls=0;
    f.api.updateRow=async()=>{
      calls++;
      if(calls===1||lastReply==='timeout')throw Object.assign(new Error('not logged'),{code:'ECONNRESET'});
      return {code:lastReply};
    };
    f.service.handle(f.payload(1));f.service.handle(f.payload(2));
    await until(()=>calls>1&&!f.service.processing&&f.store.get().pending?.recovery.status==='unknown');
    await sleep(40);
    assert.equal(calls,lastReply==='timeout'?3:2);
    assert.equal(f.store.get().sequence,0);assert.equal(f.store.get().requests.length,2);
    assert.equal(f.store.get().rows[0].content,'');
  }
});

test('persisted transport retry survives restart without resetting its budget',async t=>{
  const first=fixture(t,{retryDelays:[60000]});
  first.api.updateRow=async()=>{throw Object.assign(new Error('not logged'),{code:'ETIMEDOUT'});};
  first.service.handle(first.payload(1));await first.service.queue;await first.service.stop();
  const intent=first.store.get().pending;
  const second=fixture(t,{store:first.store});
  assert.equal(await second.service.prepare(),true);
  assert.equal(second.store.get().pending,null);
  assert.equal(second.calls[0].uuid,intent.uuid);
  assert.equal(second.calls[0].recovery.transportFailures,1);
  assert.equal(second.store.get().rows[0].content,'fixture 1');
});
