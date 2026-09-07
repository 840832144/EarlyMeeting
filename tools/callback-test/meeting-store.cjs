'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {MAX_ROWS,MAX_CONTENT,SECTIONS}=require('./meeting-card.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function binding(config){return hash(JSON.stringify([config.appId,config.chatId]));}
const clone = value => JSON.parse(JSON.stringify(value));
function validRow(row) {
  return row && /^r[a-f0-9]{12}$/.test(row.id) && /^ou_[A-Za-z0-9_-]{1,100}$/.test(row.owner) &&
    (row.role===undefined||(typeof row.role==='string' && row.role.length<=24)) &&
    (row.section===undefined||Object.hasOwn(SECTIONS,row.section)) &&
    (row.department===undefined||(typeof row.department==='string' && row.department.length<=160)) &&
    (row.departmentStatus===undefined||['ok','empty','unavailable'].includes(row.departmentStatus)) &&
    typeof row.content==='string' && row.content.length<=MAX_CONTENT &&
    Number.isSafeInteger(row.revision) && row.revision>=0;
}
function validDelivery(delivery) {
  return delivery && typeof delivery.content==='string' && delivery.content.length<=MAX_CONTENT &&
    Number.isSafeInteger(delivery.revision) && delivery.revision>=0;
}
function validate(state,fingerprint) {
  if (!state || state.version!==1 || state.binding!==fingerprint ||
      !['new','creating','created','sending','sent'].includes(state.stage) ||
      !Number.isSafeInteger(state.sequence) || state.sequence<0 ||
      !Number.isFinite(state.createdAt) || state.createdAt>Date.now() ||
      !Array.isArray(state.rows) || state.rows.length>MAX_ROWS || !state.rows.every(validRow) ||
      new Set(state.rows.map(r=>r.id)).size!==state.rows.length ||
      new Set(state.rows.map(r=>r.owner)).size!==state.rows.length ||
      !Array.isArray(state.events) || state.events.length>256 ||
      !state.events.every(e=>/^[a-f0-9]{64}$/.test(e))) throw new Error('LOCAL_STATE_INVALID');
  if (['created','sending','sent'].includes(state.stage) && !/^[A-Za-z0-9_-]{1,100}$/.test(state.cardId||''))
    throw new Error('LOCAL_STATE_INVALID');
  if (['sending','sent'].includes(state.stage) &&
      (!/^[a-f0-9-]{36}$/.test(state.sendUuid||'') || !Number.isFinite(state.sendAt))) throw new Error('LOCAL_STATE_INVALID');
  if(state.stage==='sent' && !/^om_[A-Za-z0-9_-]+$/.test(state.messageId||''))throw new Error('LOCAL_STATE_INVALID');
  if(state.delivery!==undefined && !validDelivery(state.delivery))throw new Error('LOCAL_STATE_INVALID');
  if(state.pending && (!(['add','save','delete'].includes(state.pending.kind)?validRow(state.pending.row):
      ['save_delivery','clear_delivery'].includes(state.pending.kind)&&validDelivery(state.pending.delivery)) ||
    state.pending.sequence!==state.sequence+1 || !/^[a-f0-9-]{36}$/.test(state.pending.uuid||'') ||
    !/^[a-f0-9]{64}$/.test(state.pending.event||'')))throw new Error('LOCAL_STATE_INVALID');
  if(state.layoutPending && (state.layoutPending.sequence!==state.sequence+1 ||
    !/^[a-f0-9-]{36}$/.test(state.layoutPending.uuid||'') || state.pending))throw new Error('LOCAL_STATE_INVALID');
  return state;
}
function createStore(directory,config) {
  // Windows launcher protects this directory with an inheritable user/SYSTEM ACL.
  // All private IDs and submitted fields stay here; no callback body/token is kept.
  if(!fs.statSync(directory).isDirectory())throw new Error('LOCAL_DIRECTORY_REQUIRED');
  const file=path.join(directory,'meeting-state.json');
  const fingerprint=binding(config);
  // Only a new group/day state gets roster rows. Once persisted, restarts and
  // retries keep that snapshot, including any rows the group has deleted.
  const initial=()=>({version:1,layoutVersion:11,binding:fingerprint,stage:'new',createdAt:Date.now(),
    sequence:0,rows:config.prefill?.enabled?Object.keys(SECTIONS).flatMap(section=>
      config.prefill[section].map(member=>({id:'r'+crypto.randomBytes(6).toString('hex'),
        owner:member.open_id,section,content:'',revision:0}))):[],
    delivery:{content:'',revision:0},events:[],pending:null});
  let current=fs.existsSync(file)?validate(JSON.parse(fs.readFileSync(file,'utf8')),fingerprint):initial();
  return {get:()=>clone(current),
    put(next) {
      validate(next,fingerprint);
      const temp=file+'.next';
      const fd=fs.openSync(temp,'w',0o600);
      try{fs.writeFileSync(fd,JSON.stringify(next));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      fs.renameSync(temp,file);
      current=clone(next);
    }};
}
module.exports={createStore,validate,binding,hash};
