'use strict';
const fs=require('node:fs'),path=require('node:path');
const {binding}=require('./meeting-store.cjs');
const day=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
const MAX_GAP=36*3600000,DRIFT=120000;
const reasons=new Set(['CLOCK_HISTORY_MISMATCH','DUPLICATE_SEND_LOG','CLOCK_MISMATCH',
  'MESSAGE_LOG_MISMATCH','STATE_DATE_MISMATCH','SEND_ALREADY_RECORDED','SEND_RESULT_UNKNOWN','JOURNAL_DATE_AHEAD']);

// Separate from daily data/rotating diagnostic logs: never prune send receipts.
// The service lock remains the single-writer boundary.
function createSendJournal(directory,config,groups,output,{now=Date.now,monotonic=()=>Number(process.hrtime.bigint()/1000000n)}={}) {
  const file=path.join(directory,'send-journal.json');
  const marker=path.join(directory,'send-journal.required');
  let state,invalid=false,lastWall=now(),lastMono=monotonic();
  function save(){
    const fd=fs.openSync(file+'.next','w',0o600);
    try{fs.writeFileSync(fd,JSON.stringify(state));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(file+'.next',file);
  }
  try {
    if(fs.existsSync(file+'.next'))throw new Error('PARTIAL_JOURNAL');
    if(fs.existsSync(file)) {
      state=JSON.parse(fs.readFileSync(file,'utf8'));
      if(state.version!==1||!Number.isSafeInteger(state.observedAt)||state.observedAt<=0||
        !Array.isArray(state.entries)||!(state.blocked===null||reasons.has(state.blocked))||
        state.entries.some(e=>!e||! /^[a-f0-9]{64}$/.test(e.binding)||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||
          new Date(e.date+'T00:00:00Z').toISOString().slice(0,10)!==e.date||
          !['reserved','sent'].includes(e.status)||!(e.messageId===null||typeof e.messageId==='string'))||
        new Set(state.entries.map(e=>e.binding+e.date)).size!==state.entries.length)throw new Error('INVALID_JOURNAL');
    }else {
      if(fs.existsSync(marker))throw new Error('JOURNAL_MISSING');
      state={version:1,observedAt:lastWall,blocked:null,entries:[]};
      // Upgrade: import actual successful sends before trusting missing day files.
      let previous=null;
      for(const name of ['service.jsonl.2','service.jsonl.1','service.jsonl']) {
        const log=path.join(directory,'logs',name);
        if(!fs.existsSync(log))continue;
        for(const line of fs.readFileSync(log,'utf8').split('\n').filter(Boolean)) {
          const event=JSON.parse(line),at=Date.parse(event.at);
          if(!Number.isFinite(at))continue;
          if(previous!==null&&(at<previous-DRIFT||at-previous>MAX_GAP))state.blocked='CLOCK_HISTORY_MISMATCH';
          previous=at;
          if(event.event!=='MEETING_SENT')continue;
          const g=groups[event.group-1];
          if(!g)throw new Error('LOG_GROUP_MISMATCH');
          const key=binding({...config,chatId:g.chat_id}),date=day(at);
          if(state.entries.some(e=>e.binding===key&&e.date===date))state.blocked='DUPLICATE_SEND_LOG';
          else state.entries.push({binding:key,date,status:'sent',messageId:null});
        }
      }
      if(previous!==null)state.observedAt=previous;
      save();
    }
    if(!fs.existsSync(marker))fs.writeFileSync(marker,'1\n',{flag:'wx',mode:0o600});
  }catch{invalid=true;output('[SEND_GUARD_BLOCKED] reason=JOURNAL_INVALID');}
  function block(reason){
    if(!state.blocked){state.blocked=reason;save();output(`[SEND_GUARD_BLOCKED] reason=${reason}`);}
    return false;
  }
  function check(){
    if(invalid)return false;
    if(state.blocked)return false;
    const wall=now(),mono=monotonic();
    if(state.entries.some(e=>e.date>day(wall)))return block('JOURNAL_DATE_AHEAD');
    if(wall<state.observedAt-DRIFT||wall-state.observedAt>MAX_GAP||
      Math.abs((wall-lastWall)-(mono-lastMono))>DRIFT)return block('CLOCK_MISMATCH');
    lastWall=wall;lastMono=mono;
    if(wall-state.observedAt>=60000){state.observedAt=wall;save();}
    return true;
  }
  function find(key,date){return state.entries.find(e=>e.binding===key&&e.date===date);}
  function resume(key,date,s){
    // Existing confirmed cards can still receive submissions while sending is held.
    if(invalid||s.stage!=='sent'||day(s.createdAt)!==date)return false;
    let e=find(key,date);
    if(e?.messageId&&e.messageId!==s.messageId){block('MESSAGE_LOG_MISMATCH');return false;}
    if(!e){e={binding:key,date,status:'sent',messageId:s.messageId};state.entries.push(e);}
    else Object.assign(e,{status:'sent',messageId:s.messageId});
    save();return true;
  }
  function reserve(key,date,s){
    if(!check())return false;
    if(date!==day(now())||day(s.createdAt)!==date)return block('STATE_DATE_MISMATCH');
    if(find(key,date))return block('SEND_ALREADY_RECORDED');
    // Uncertain legacy sends require reconciliation; never mint a new send intent.
    if(s.stage!=='new')return block('SEND_RESULT_UNKNOWN');
    state.entries.push({binding:key,date,status:'reserved',messageId:null});save();return true;
  }
  if(!invalid&&state?.blocked)output(`[SEND_GUARD_BLOCKED] reason=${state.blocked}`);
  return {check,resume,reserve,status:()=>invalid?'JOURNAL_INVALID':state.blocked,
    confirm:(key,date,s)=>resume(key,date,s)};
}
module.exports={createSendJournal};
