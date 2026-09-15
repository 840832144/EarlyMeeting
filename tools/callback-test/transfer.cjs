'use strict';
// Offline export only. Never stop a service, connect to Feishu, or overwrite a
// destination. The operator stops the old host first and transfers this privately.
const fs=require('node:fs'),path=require('node:path');
const {loadRuntime,inspectStates}=require('./runtime-config.cjs');
const {binding}=require('./meeting-store.cjs');
function checkedFile(file,root) {
  const relative=path.relative(path.resolve(root),path.resolve(file));
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('EXPORT_PATH_INVALID');
  let current=path.resolve(root);
  if(fs.lstatSync(current).isSymbolicLink())throw new Error('EXPORT_LINK_REJECTED');
  for(const part of relative.split(path.sep)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw new Error('EXPORT_LINK_REJECTED');}
  if(!fs.statSync(current).isFile())throw new Error('EXPORT_FILE_INVALID');
  return fs.readFileSync(current);
}
function exportBundle(runtime,destination) {
  const report=inspectStates(runtime,{requireToday:true});
  if(report.groups.some(g=>g.state==='missing'))throw new Error('TODAY_STATE_MISSING');
  const sessionFile=path.join(runtime.dataDir,'session.json');
  const session=JSON.parse(checkedFile(sessionFile,runtime.dataDir));
  if(session.stopped!==true)throw new Error('STOP_OLD_SERVICE_FIRST');
  const target=path.resolve(destination);
  for(const source of [runtime.configDir,runtime.settingsDir,runtime.dataDir]){
    const relative=path.relative(path.resolve(source),target);
    if(!relative||(!relative.startsWith('..')&&!path.isAbsolute(relative)))throw new Error('EXPORT_DESTINATION_INSIDE_SOURCE');
  }
  // A brand new export prevents mixing an earlier snapshot with newer data.
  fs.mkdirSync(target,{mode:0o700});
  const put=(relative,bytes)=>{
    const file=path.join(target,relative);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});
  };
  put('config/config.json',checkedFile(path.join(runtime.configDir,'config.json'),runtime.configDir));
  put('config/groups.json',checkedFile(path.join(runtime.settingsDir,'groups.json'),runtime.settingsDir));
  const ai=path.join(runtime.settingsDir,'ai.json');
  if(fs.existsSync(ai))put('config/ai.json',checkedFile(ai,runtime.settingsDir));
  const operations=path.join(runtime.settingsDir,'operations.json');
  if(fs.existsSync(operations))put('config/operations.json',checkedFile(operations,runtime.settingsDir));
  for(const g of runtime.settings.groups){
    const relative=path.join('days',binding({...runtime.config,chatId:g.chat_id}),report.date);
    for(const name of ['meeting-state.json','meeting-state.json.next']){
      const source=path.join(runtime.dataDir,relative,name);
      if(fs.existsSync(source))put(path.join('data',relative,name),checkedFile(source,runtime.dataDir));
    }
  }
  put('transfer.json',JSON.stringify({version:1,date:report.date,groups:report.groups.length,attention:report.attention}));
  return {exported:true,...report};
}
if(require.main===module){
  try{
    process.umask(0o077);
    const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
    if(args[0]!=='export'||!args.includes('--output')||!value('--output'))throw new Error('EXPORT_ARGUMENTS_INVALID');
    const runtime=args.includes('--windows-root')?loadRuntime({},path.resolve(value('--windows-root'))):loadRuntime();
    console.log(JSON.stringify(exportBundle(runtime,value('--output'))));
  }catch(e){
    const allowed=new Set(['TODAY_STATE_MISSING','STOP_OLD_SERVICE_FIRST','EXPORT_DESTINATION_INSIDE_SOURCE',
      'EXPORT_PATH_INVALID','EXPORT_LINK_REJECTED','EXPORT_FILE_INVALID','EXPORT_ARGUMENTS_INVALID']);
    console.log(`[${allowed.has(e?.message)?e.message:'EXPORT_FAILED'}] 未连接飞书；请检查停止状态、配置、路径及目标是否已存在。`);
    process.exitCode=1;
  }
}
module.exports={exportBundle};
