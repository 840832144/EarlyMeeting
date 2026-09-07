'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {MeetingService}=require('./meeting-service.cjs');
const {createStore}=require('./meeting-store.cjs');
const {meetingCard,cardBudget}=require('./meeting-card.cjs');
const config={appId:'cli_fixture',appSecret:'never-logged-fixture',chatId:'oc_fixture'};
test('pinned SDK token + resource adapter preserves message and partial-element API contracts',async()=>{
  const {createApi}=require('./meeting-api.cjs');
  const Lark=require('@larksuiteoapi/node-sdk');const requests=[];
  const transport={request:async r=>{requests.push(r);return r.url.includes('/auth/')
    ?{code:0,tenant_access_token:'offline-token-only',expire:100}:{code:0,data:{card_id:'fixture'}};}};
  const api=createApi({...config,appId:'cli_fixture_sdk'},Lark,transport);
  await api.createCard(meetingCard());await api.sendCard('fixture','offline-uuid');
  await api.updateRow('fixture',{kind:'add',uuid:'offline-add',sequence:1,row:{id:'r123456789abc'}},{tag:'form'});
  await api.updateRow('fixture',{kind:'save',uuid:'offline-save',sequence:2,row:{id:'r123456789abc'}},{tag:'form'});
  assert.ok(requests.some(r=>r.url.includes('/auth/')));
  assert.ok(requests.every(r=>r.timeout===8000));
  const message=requests.find(r=>r.url.endsWith('/im/v1/messages'));
  assert.equal(message.data.receive_id,config.chatId);
  assert.deepEqual(JSON.parse(message.data.content),{type:'card',data:{card_id:'fixture'}});
  const add=requests.find(r=>r.data?.target_element_id==='add_my_row');
  assert.equal(add.data.type,'insert_before');assert.equal(add.data.sequence,1);
  const saveRequest=requests.find(r=>r.method==='PUT');assert.equal(saveRequest.data.sequence,2);
  assert.ok(saveRequest.url.endsWith('/elements/r123456789abc'));
});
function fixture(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'earlymeeting-unit-'));
  t.after(()=>{for(const name of ['meeting-state.json','meeting-state.json.next']) {
    const file=path.join(directory,name);if(fs.existsSync(file))fs.unlinkSync(file);
  }fs.rmdirSync(directory);});
  const calls=[],logs=[];
  const store=createStore(directory,config);
  const api={createCard:async card=>{calls.push({method:'create',card});return {code:0,data:{card_id:'fixture_card'}};},
    sendCard:async(card,uuid)=>{calls.push({method:'send',card,uuid});return {code:0,data:{message_id:'om_fixture',chat_id:config.chatId,msg_type:'interactive'}};},
    updateRow:async(card,p,element)=>{calls.push({method:p.kind,card,p,element});return {code:0};},
    updateLayout:async()=>({code:0}),departmentForOwner:async()=>({status:'ok',name:'虚构部门',code:0})};
  const service=new MeetingService(config,store,api,line=>logs.push(line),{delay:0});
  return {directory,store,api,service,calls,logs};
}
let eventSequence=0;
function action(owner='ou_alpha',value={op:'add'},form) {
  return {header:{event_id:'fixture_'+ ++eventSequence},event:{operator:{open_id:owner},
    context:{open_chat_id:config.chatId,open_message_id:'om_fixture'},
    action:{tag:'button',value,form_value:form},token:'do-not-save-callback-token'}};
}
function save(row,owner=row.owner,content='虚构晨会内容',role='策划') {
  return action(owner,{op:'save',row:row.id,revision:row.revision},
    {[`role_${row.id}`]:role,[`content_${row.id}`]:content});
}
async function submit(f,payload){const reply=f.service.handle(payload);await f.service.queue;return reply;}

test('empty card, two simultaneous owners, repeated plus, independent full-form saves',async t=>{
  const f=fixture(t);assert.equal(await f.service.prepare(),true);
  assert.equal(f.calls[0].card.body.elements.find(e=>e.tag==='form').elements.filter(e=>/^r[a-f0-9]{12}$/.test(e.element_id||'')).length,0);
  const first=action();f.service.handle(first);f.service.handle(first);
  f.service.handle(action('ou_beta'));await f.service.queue;
  assert.equal(f.store.get().rows.length,2);
  assert.equal(f.calls.filter(c=>c.method==='add').length,2);
  assert.match((await submit(f,action())).toast.content,/已经有一行/);
  let rows=f.store.get().rows;
  f.service.handle(save(rows[0]));f.service.handle(save(rows[1],'ou_beta','虚构程序工作','程序'));
  await f.service.queue;rows=f.store.get().rows;
  assert.deepEqual(rows.map(r=>[r.department,r.content,r.revision]),[['虚构部门','虚构晨会内容',1],['虚构部门','虚构程序工作',1]]);
  for(const call of f.calls.filter(c=>['add','save'].includes(c.method))){
    assert.equal(call.card,'fixture_card');assert.equal(call.element.element_id,call.p.row.id);
    assert.equal(call.element.tag,'column_set');
    const fields=call.element.columns.flatMap(c=>c.elements);
    assert.equal(fields.filter(e=>e.tag==='input').length,1);
    assert.equal(fields.at(-1).form_action_type,'submit');
  }
  assert.deepEqual(f.calls.filter(c=>['add','save'].includes(c.method)).map(c=>c.p.sequence),[1,2,3,4]);
  assert.equal(f.calls.filter(c=>c.method==='send').length,1);
});
test('wrong owner/group/message, malformed action, standalone input and stale versions rejected',async t=>{
  const f=fixture(t);await f.service.prepare();await submit(f,action());
  const row=f.store.get().rows[0];
  const foreignGroup=save(row);foreignGroup.event.context.open_chat_id='oc_other';
  const foreignMessage=save(row);foreignMessage.event.context.open_message_id='om_other';
  const input=save(row);input.event.action.form_value=undefined;input.event.action.input_value='not a form';
  const malformed=save(row);malformed.event.action.tag='input';
  const missingId=save(row);delete missingId.header;delete missingId.event.token;
  for(const payload of [save(row,'ou_beta'),foreignGroup,foreignMessage,input,malformed,missingId,
    save(row,row.owner,'','策划'),save(row,row.owner,'x'.repeat(301),'策划')]) {
    assert.equal((await submit(f,payload)).toast.type,'warning');
  }
  assert.equal(f.calls.filter(c=>c.method==='save').length,0);
  const stale=save(row);await submit(f,save(row));
  assert.equal((await submit(f,stale)).toast.type,'warning');
  assert.equal(f.store.get().rows[0].revision,1);
});
test('restart resumes original message and saved rows, event replay does not send or append',async t=>{
  const f=fixture(t);await f.service.prepare();const payload=action();await submit(f,payload);
  await submit(f,save(f.store.get().rows[0]));
  const again=new MeetingService(config,createStore(f.directory,config),f.api,x=>f.logs.push(x),{delay:0});
  assert.equal(await again.prepare(),true);again.handle(payload);await again.queue;
  assert.equal(f.calls.filter(c=>c.method==='send').length,1);
  assert.equal(f.calls.filter(c=>c.method==='add').length,1);
  assert.match(f.logs.join('\n'),/MEETING_RESUMED/);
});
test('ambiguous update keeps exact intent; restart retry reuses UUID and sequence',async t=>{
  const f=fixture(t);await f.service.prepare();const actual=f.api.updateRow;
  f.api.updateRow=async(card,p,element)=>{f.calls.push({method:'uncertain',p});throw new Error('RAW-SECRET-payload');};
  await submit(f,action());const pending=f.store.get().pending;
  assert.equal(f.store.get().rows.length,0);assert.ok(pending);
  assert.equal((await submit(f,action('ou_beta'))).toast.type,'warning');
  f.api.updateRow=actual;
  const again=new MeetingService(config,createStore(f.directory,config),f.api,x=>f.logs.push(x),{delay:0});
  assert.equal(await again.prepare(),true);
  const retry=f.calls.find(c=>c.method==='add');assert.equal(retry.p.uuid,pending.uuid);assert.equal(retry.p.sequence,pending.sequence);
  assert.equal(createStore(f.directory,config).get().rows.length,1);
  assert.doesNotMatch(f.logs.join('\n'),/RAW-SECRET|payload|ou_alpha|fixture_card/);
});
test('UUID conflict remains unconfirmed, never treated as successful save',async t=>{
  const f=fixture(t);await f.service.prepare();await submit(f,action());
  f.api.updateRow=async()=>({code:200770,msg:'internal private details'});
  await submit(f,save(f.store.get().rows[0]));
  assert.equal(f.store.get().rows[0].content,'');assert.ok(f.store.get().pending);
  assert.doesNotMatch(f.logs.join('\n'),/ROW_SAVED|private details/);
});
test('ambiguous send retries only original UUID inside window and never creates second card',async t=>{
  const f=fixture(t);const original=f.api.sendCard;let uuid;
  f.api.sendCard=async(card,id)=>{uuid=id;throw new Error('private-token');};
  assert.equal(await f.service.prepare(),false);
  f.api.sendCard=original;assert.equal(await f.service.prepare(),true);
  assert.equal(f.calls.find(c=>c.method==='send').uuid,uuid);
  assert.equal(f.calls.filter(c=>c.method==='create').length,1);
  const s=f.store.get();s.stage='sending';s.sendAt=Date.now()-51*60000;f.store.put(s);
  await assert.rejects(f.service.prepare(),/MESSAGE_SEND_UNCONFIRMED/);
});
test('unconfirmed creation and corrupt/config-mismatched stores fail closed',async t=>{
  const f=fixture(t);f.api.createCard=async()=>{throw new Error('transport');};
  assert.equal(await f.service.prepare(),false);
  await assert.rejects(f.service.prepare(),/CARD_CREATE_UNCONFIRMED/);
  assert.throws(()=>createStore(f.directory,{...config,chatId:'oc_other'}),/LOCAL_STATE_INVALID/);
  fs.writeFileSync(path.join(f.directory,'meeting-state.json'),'{broken');
  assert.throws(()=>createStore(f.directory,config));
});
test('20 members fit the documented 200-component and 30KB card limits',async t=>{
  const f=fixture(t);await f.service.prepare();
  for(let i=0;i<20;i++)f.service.handle(action('ou_person_'+i));await f.service.queue;
  assert.equal(f.store.get().rows.length,20);
  const rows=f.store.get().rows.map(r=>({...r,role:'策划',content:'测试'.repeat(100),revision:1}));
  const budget=cardBudget(rows);assert.equal(budget.valid,true,JSON.stringify(budget));assert.ok(budget.components<200);
  assert.equal((await submit(f,action('ou_extra'))).toast.type,'warning');
  const card=meetingCard(rows);const names=[];
  function collect(x){if(!x||typeof x!=='object')return;if(x.name)names.push(x.name);Object.values(x).forEach(collect);}
  collect(card);
  assert.equal(names.length,new Set(names).size);
});
test('logs exclude business text and identities; disk has only submitted fields and needed state',async t=>{
  const f=fixture(t);await f.service.prepare();await submit(f,action());
  const payload=save(f.store.get().rows[0],undefined,'<script>fiction-only</script>');
  payload.event.extra='never-store-raw-event';await submit(f,payload);
  const disk=fs.readFileSync(path.join(f.directory,'meeting-state.json'),'utf8');
  assert.doesNotMatch(disk,/never-store-raw-event|callback-token|appSecret|never-logged-fixture/);
  assert.doesNotMatch(f.logs.join('\n'),/fiction-only|ou_alpha|oc_fixture|om_fixture|fixture_card/);
  assert.equal(f.calls.find(c=>c.method==='save').element.columns[2].elements[0].default_value,'<script>fiction-only</script>');
  await f.service.stop();assert.equal(f.service.handle(action()).toast.type,'warning');
});
