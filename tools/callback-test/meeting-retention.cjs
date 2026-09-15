'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {validate}=require('./meeting-store.cjs');
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&
  new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;

// Only EarlyMeeting's known state filenames are removed. No recursive delete,
// configuration/log deletion, message API, or deletion of today's directory.
function cleanupHistory(directory,today,{beforeRemoveDay}={}) {
  if(!validDate(today))throw new Error('RETENTION_DATE_INVALID');
  const root=path.resolve(directory),result={files:0,days:0,errors:0};
  if(fs.lstatSync(root).isSymbolicLink())throw new Error('RETENTION_ROOT_LINK');
  const realRoot=fs.realpathSync(root);
  function safe(target) {
    const full=path.resolve(target),relative=path.relative(root,full);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('RETENTION_PATH_INVALID');
    let current=root;
    for(const part of relative.split(path.sep)){
      current=path.join(current,part);
      if(fs.lstatSync(current).isSymbolicLink())throw new Error('RETENTION_LINK_SKIPPED');
    }
    const realRelative=path.relative(realRoot,fs.realpathSync(full));
    if(!realRelative||realRelative.startsWith('..')||path.isAbsolute(realRelative))throw new Error('RETENTION_PATH_INVALID');
    return fs.lstatSync(full);
  }
  function attempt(fn){try{fn();}catch{result.errors++;}}
  function removeState(file) {
    if(!fs.existsSync(file))return;
    if(!safe(file).isFile())throw new Error('RETENTION_FILE_INVALID');
    fs.unlinkSync(file);result.files++;
  }
  function removeDatedCopy(file) {
    if(!fs.existsSync(file))return;
    if(!safe(file).isFile())throw new Error('RETENTION_FILE_INVALID');
    const s=JSON.parse(fs.readFileSync(file,'utf8'));
    if(!/^[a-f0-9]{64}$/.test(s.binding||''))throw new Error('RETENTION_STATE_INVALID');
    validate(s,s.binding);
    if(new Date(s.createdAt+8*3600000).toISOString().slice(0,10)<today)removeState(file);
  }
  const days=path.join(root,'days');
  if(fs.existsSync(days))attempt(()=>{
    if(!safe(days).isDirectory())throw new Error('RETENTION_DIRECTORY_INVALID');
    for(const group of fs.readdirSync(days,{withFileTypes:true})){
      if(!/^[a-f0-9]{64}$/.test(group.name))continue;
      attempt(()=>{
        const groupDir=path.join(days,group.name);
        if(!safe(groupDir).isDirectory())throw new Error('RETENTION_DIRECTORY_INVALID');
        for(const date of fs.readdirSync(groupDir,{withFileTypes:true})){
          // Keep today (including all pending/partial writes) and unexpected future dates.
          if(!validDate(date.name)||date.name>=today)continue;
          attempt(()=>{
            const dir=path.join(groupDir,date.name);
            if(!safe(dir).isDirectory())throw new Error('RETENTION_DIRECTORY_INVALID');
            // A failed archive leaves this day's original state intact for retry.
            if(beforeRemoveDay)beforeRemoveDay(dir,group.name,date.name);
            for(const name of ['meeting-state.json','meeting-state.json.next'])removeState(path.join(dir,name));
            safe(dir);
            if(fs.readdirSync(dir).length===0){fs.rmdirSync(dir);result.days++;}
          });
        }
      });
    }
  });
  // These old copies predate per-group/day storage. Inspect only known state
  // schemas/dates; leave unrelated backups, credentials and migration markers.
  for(const name of ['meeting-state.json','meeting-state.json.next'])attempt(()=>removeDatedCopy(path.join(root,name)));
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    if(!/^manual-resend-[a-f0-9]{8}$/.test(entry.name))continue;
    attempt(()=>{
      const dir=path.join(root,entry.name);
      if(!safe(dir).isDirectory())throw new Error('RETENTION_DIRECTORY_INVALID');
      for(const name of ['meeting-state.json','meeting-state.json.next','previous-state.json'])
        attempt(()=>removeDatedCopy(path.join(dir,name)));
      safe(dir);if(fs.readdirSync(dir).length===0)fs.rmdirSync(dir);
    });
  }
  return result;
}
module.exports={cleanupHistory};
