'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {sendOnce}=require('./send.cjs');
const config={appId:'cli_test',appSecret:'PRIVATE_SECRET',chatId:'oc_test',templateId:'template_demo'};
test('send retry reuses UUID, targets only configured group/template and does not repeat success',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'earlymeeting-send-'));
  const requests=[];const log=[];const emit=t=>log.push(t);
  try {
    assert.equal(await sendOnce(config,directory,async r=>{requests.push(r);throw {code:'ETIMEDOUT',message:'PRIVATE_TOKEN'};},emit),false);
    const create=async r=>{requests.push(r);return {code:0,data:{message_id:'om_test',chat_id:'oc_test',msg_type:'interactive'}};};
    assert.equal(await sendOnce(config,directory,create,emit),true);
    assert.equal(requests[0].data.uuid,requests[1].data.uuid);
    assert.equal(requests[1].data.receive_id,'oc_test');
    assert.deepEqual(JSON.parse(requests[1].data.content),{type:'template',data:{template_id:'template_demo'}});
    assert.equal(await sendOnce(config,directory,create,emit),true);
    assert.equal(requests.length,2);
    assert.doesNotMatch(log.join('\n'),/PRIVATE_|oc_test|om_test|template_demo/);
    assert.doesNotMatch(fs.readFileSync(path.join(directory,'send-state.json'),'utf8'),/PRIVATE_|oc_test|om_test|template_demo/);
    assert.equal(await sendOnce({...config,chatId:'oc_changed'},directory,create,emit),false);
    assert.equal(requests.length,2);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('ambiguous expired result and concurrent send fail closed',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'earlymeeting-send-'));
  let count=0;const log=[];
  const fail=async()=>{count++;throw {code:'ETIMEDOUT'};};
  try {
    await sendOnce(config,directory,fail,t=>log.push(t));
    const file=path.join(directory,'send-state.json');const state=JSON.parse(fs.readFileSync(file));
    state.createdAt=Date.now()-60*60*1000;fs.writeFileSync(file,JSON.stringify(state));
    assert.equal(await sendOnce(config,directory,fail,t=>log.push(t)),false);assert.equal(count,1);
    fs.writeFileSync(path.join(directory,'send.lock'),'');
    assert.equal(await sendOnce(config,directory,fail,t=>log.push(t)),false);assert.equal(count,1);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
