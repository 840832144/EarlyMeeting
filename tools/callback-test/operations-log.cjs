'use strict';
const fs=require('node:fs'),path=require('node:path');
const {errorFacts}=require('./probe.cjs');
const beijingTime=()=>new Date(Date.now()+8*3600000).toISOString().replace('Z','+08:00');

// Only event labels and bounded facts are stored, never the raw line or SDK data.
function logEntry(line) {
  const labels=[...String(line).matchAll(/\[([A-Z][A-Z0-9_]{0,63})\]/g)].map(m=>m[1]);
  const group=labels.find(s=>/^GROUP_\d{1,2}$/.test(s));
  const entry={at:beijingTime(),pid:process.pid,event:labels.find(s=>!/^GROUP_/.test(s))||'STATUS'};
  if(group)entry.group=Number(group.slice(6));
  for(const key of ['rows','waiting','fields','tasks','files','days','errors','attempts','delay_ms']) {
    const match=String(line).match(new RegExp('\\b'+key+'=(\\d{1,10})(?!\\d)'));
    if(match)entry[key]=Number(match[1]);
  }
  const facts=errorFacts(String(line));
  for(const [key,value] of Object.entries(facts))if(value!==undefined)entry[key]=value;
  return entry;
}
function createOperationsLog(directory,{maxBytes=2*1024*1024}={}) {
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  if(fs.lstatSync(directory).isSymbolicLink())throw new Error('LOG_DIRECTORY_LINK');
  const file=path.join(directory,'service.jsonl');let failed=false;
  return line=>{
    try {
      for(const name of [file,file+'.1',file+'.2'])
        if(fs.existsSync(name)&&fs.lstatSync(name).isSymbolicLink())throw new Error('LOG_FILE_LINK');
      if(fs.existsSync(file)&&fs.statSync(file).size>=maxBytes) {
        if(fs.existsSync(file+'.2'))fs.unlinkSync(file+'.2');
        if(fs.existsSync(file+'.1'))fs.renameSync(file+'.1',file+'.2');
        fs.renameSync(file,file+'.1');
      }
      fs.appendFileSync(file,JSON.stringify(logEntry(line))+'\n',{mode:0o600});failed=false;
    }catch {
      // Logging failure must not discard a received submission or kill its worker.
      if(!failed)console.error('[OPS_LOG_WRITE_FAILED] 维护日志写入失败；请检查磁盘与权限。');
      failed=true;
    }
  };
}
module.exports={createOperationsLog,logEntry};
