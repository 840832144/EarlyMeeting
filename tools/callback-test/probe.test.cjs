'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {callbackHandler, diagnosticHttp, safeLogger, TEST_MARKER} = require('./probe.cjs');
const {createSession} = require('./session.cjs');
const {diagnosticAgent} = require('./transport.cjs');
const {diagnosis} = require('./probe.cjs');

test('actual local TLS failure is diagnosed without leaking request headers or path', {timeout:5000}, async () => {
  const net = require('node:net');
  const https = require('node:https');
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('error',()=>{});
    socket.once('data',()=>socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const log=[]; const agent=diagnosticAgent(text=>log.push(text),diagnosis,{});
  try {
    await new Promise(resolve=>{
      const request=https.get({host:'127.0.0.1',port:server.address().port,
        path:'/PRIVATE_PATH',headers:{Authorization:'PRIVATE_AUTH'},agent},()=>{});
      request.setTimeout(2000,()=>request.destroy(new Error('TEST_TIMEOUT')));
      request.once('error',resolve);
    });
    assert.match(log.join('\n'), /TRANSPORT_DIAG.*phase=WEBSOCKET.*(?:EPROTO|ERR_SSL_WRONG_VERSION_NUMBER)/);
    assert.doesNotMatch(log.join('\n'), /PRIVATE_|127\.0\.0\.1/);
    assert.equal(agent.options.rejectUnauthorized,https.globalAgent.options.rejectUnauthorized);
  } finally {agent.destroy();for(const socket of sockets) socket.destroy();await new Promise(resolve=>server.close(resolve));}
});

test('form acceptance needs the synthetic marker; values and identifiers never leave memory', async () => {
  const log = [];
  const handle = callbackHandler('oc_test', text => log.push(text));
  const base = {context:{open_chat_id:'oc_test'},operator:{open_id:'ou_test'}};
  const response = await handle({...base,action:{form_value:{private_field:TEST_MARKER}}});
  assert.match(log.at(-1), /fields=1; marker_matches=1; verified=true/);
  assert.equal(response.card, undefined);
  await handle({...base,action:{form_value:{private_field:'PRIVATE_WORK'}}});
  assert.match(log.at(-1), /verified=false/);
  await handle({...base,action:{value:{key:'PRIVATE_VALUE'}}});
  assert.match(log.at(-1), /FORM_EMPTY/);
  assert.doesNotMatch(log.join('\n'), /private_field|PRIVATE_|oc_test|ou_test|EARLYMEETING-CALLBACK-TEST/);
});

test('endpoint failure keeps HTTP and platform code while withholding request and body', async () => {
  const log=[]; const state={};
  const err = Object.assign(new Error('PRIVATE_ERROR'),{code:'ERR_BAD_REQUEST',
    response:{status:400,data:{code:514,AppSecret:'PRIVATE_SECRET'}},config:{url:'PRIVATE_URL'}});
  const http=diagnosticHttp({request:async()=>{throw err;}},text=>log.push(text),state);
  await assert.rejects(http.request({}), value=>value===err);
  assert.match(log.at(-1), /phase=ENDPOINT; http=400; code=514/);
  assert.doesNotMatch(log.join('\n'), /PRIVATE_/);
});

test('standalone input is verified separately from form submission', async () => {
  const log=[];const handle=callbackHandler('oc_test',text=>log.push(text));
  const base={context:{open_chat_id:'oc_test'},operator:{open_id:'ou_test'}};
  const response=await handle({...base,action:{tag:'input',input_value:TEST_MARKER}});
  assert.match(log.at(-1), /INPUT_CHECK.*marker_matches=1; verified=true/);
  assert.equal(response.card,undefined);
  assert.ok(!log.some(text=>text.includes('FORM_CHECK') || text.includes('FORM_EMPTY')));
  await handle({...base,action:{tag:'input',input_value:'PRIVATE_WORK'}});
  assert.match(log.at(-1), /verified=false/);
  assert.doesNotMatch(log.join('\n'), /PRIVATE_WORK|oc_test|ou_test|EARLYMEETING-CALLBACK-TEST/);
});

test('SDK ready and endpoint success cannot masquerade as a connected WebSocket', async () => {
  const log=[];const state={connected:false};const emit=text=>log.push(text);
  safeLogger(emit,state).info('[ws]','ws client ready');
  const reply={code:0,data:{URL:'wss://example.invalid?ticket=PRIVATE',ClientConfig:{}}};
  await diagnosticHttp({request:async()=>reply},emit,state).request({});
  assert.equal(state.connected,false); assert.equal(state.phase,'WEBSOCKET');
  safeLogger(emit,state).debug('[ws]','ws connect success');
  assert.equal(state.connected,true);
  safeLogger(emit,state).info('[ws]','reconnect');assert.equal(state.connected,false);
  assert.doesNotMatch(log.join('\n'), /ticket|PRIVATE/);
});

test('stale stop request cannot stop a later run; current request completes cleanup', async () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'earlymeeting-session-'));
  const session=createSession(directory,()=>{});
  let stopped=false;
  try {
    fs.writeFileSync(path.join(directory,'stop.json'),JSON.stringify({runId:'old-run'}));
    session.watchStop(()=>{stopped=true;session.finish();});
    await new Promise(resolve=>setTimeout(resolve,400));
    assert.equal(stopped,false);
    fs.writeFileSync(path.join(directory,'stop.json'),JSON.stringify({runId:session.runId}));
    await new Promise(resolve=>setTimeout(resolve,400));
    assert.equal(stopped,true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'session.json'))).stopped,true);
  } finally {session.finish();fs.rmSync(directory,{recursive:true,force:true});}
});
