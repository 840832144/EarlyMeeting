'use strict';
const fs=require('node:fs'),path=require('node:path');
const {beijing,scheduleDue}=require('./meeting-schedule.cjs');
function snapshot(schedule,connection,stopped=false,persisted={}) {
  const today=beijing();
  const groups=schedule.groups.map((g,i)=>{
    const slot=schedule.active.get(g.chat_id);
    if(!slot){
      const saved=persisted.date===today.date?persisted.groups?.find(item=>item.group===i+1):null;
      return {group:i+1,status:saved?.attention?'attention':saved?.state==='sent'||scheduleDue(g,today,schedule.schedule.minute)?'starting':'waiting',
        rows:saved?.rows||0,queued:saved?.queued||0,pending:saved?.pending||'none'};
    }
    const s=slot.service.store?.get();
    const pending=s?.pending?.recovery?.status||(s?.pending?'unknown':'none');
    const attention=slot.service.fault||['unknown','rejected'].includes(pending)||!!s?.layoutPending||!!s?.summaryPending;
    return {group:i+1,status:attention?'attention':slot.ready?'ready':'starting',
      rows:s?.rows?.length||0,queued:s?.requests?.length||0,pending};
  });
  return {version:1,pid:process.pid,updatedAt:Date.now(),running:!stopped,connected:connection.connected&&!stopped,
    date:today.date,groups,ready:!stopped&&connection.connected&&schedule.day===today.date&&
      groups.every(g=>['ready','waiting'].includes(g.status))};
}
function writeStatus(directory,value) {
  const file=path.join(directory,'health.json'),temp=file+'.next';
  fs.writeFileSync(temp,JSON.stringify(value),{mode:0o600});fs.renameSync(temp,file);
}
function health(directory) {
  try{
    const s=JSON.parse(fs.readFileSync(path.join(directory,'health.json'),'utf8'));
    const fresh=Number.isFinite(s.updatedAt)&&Date.now()-s.updatedAt>=0&&Date.now()-s.updatedAt<25000;
    let alive=false;try{process.kill(s.pid,0);alive=true;}catch{}
    return {running:alive&&fresh&&s.running===true,connected:alive&&fresh&&s.connected===true,
      ready:alive&&fresh&&s.ready===true,date:s.date,groups:s.groups};
  }catch{return {running:false,connected:false,ready:false,groups:[]};}
}
module.exports={snapshot,writeStatus,health};
