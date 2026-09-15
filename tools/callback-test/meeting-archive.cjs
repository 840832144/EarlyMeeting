'use strict';
const fs=require('node:fs'),path=require('node:path');
const {binding,validate}=require('./meeting-store.cjs');
const {deliveryEntries}=require('./meeting-delivery.cjs');
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function readOperations(configDir) {
  const file=path.join(configDir,'operations.json');
  if(!fs.existsSync(file))return {version:1,archive:{enabled:false}};
  let value;try{value=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{throw new Error('OPERATIONS_CONFIG_INVALID');}
  if(value?.version!==1||typeof value.archive?.enabled!=='boolean'||
    (value.archive.enabled&&!validDate(value.archive.start_date)))throw new Error('OPERATIONS_CONFIG_INVALID');
  return value;
}
function atomicWrite(file,text) {
  for(const target of [file,file+'.next'])
    if(fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink())throw new Error('ARCHIVE_FILE_LINK');
  const fd=fs.openSync(file+'.next','w',0o600);
  try{fs.writeFileSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(file+'.next',file);
  // Persist the rename before old runtime state can be cleaned on Linux.
  if(process.platform!=='win32') {
    const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
  }
}
function project(state,date,group,{final=false,partial=false}={}) {
  const submitted=state.stage==='sent'?state.rows.filter(row=>row.content.trim()):[];
  return {version:1,date,timezone:'Asia/Shanghai',group:group?.name||'未配置群',final,
    rule:'仅最后一次成功提交；不含客户端草稿或队列正文',
    records:submitted.map(row=>({section:row.section,person_open_id:row.owner,content:row.content,revision:row.revision})),
    delivery:group?.delivery_ai===true?{mode:'ai',entries:deliveryEntries(submitted)}:
      {mode:'manual',content:state.stage==='sent'?state.delivery?.content||'':''},
    unresolved:{queued:state.requests?.length||0,pending:!!state.pending,
      layout:!!state.layoutPending,summary:!!state.summaryPending,partial}};
}
function markdown(value) {
  // Literal text only: Markdown/HTML in employee content must not become markup.
  const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/([\\`*_{}\[\]()#!|~])/g,'\\$1');
  const lines=[`# ${escape(value.group)} · ${value.date} 晨会记录`,'',
    `状态：${value.final?'日终归档':'当天快照'}；北京时间。仅收录已成功提交的内容。`,
    '人员保留飞书 open_id；没有额外查询通讯录或编造姓名。',''];
  for(const [key,title] of [['planning','策划'],['engineering','程序']]) {
    lines.push(`## ${title}`,'');
    const records=value.records.filter(r=>r.section===key);
    for(const r of records)lines.push(`### @${escape(r.person_open_id)}`,'',escape(r.content),'');
    if(!records.length)lines.push('暂无已提交记录。','');
  }
  lines.push('## 今日交付','');
  if(value.delivery.mode==='ai')for(const row of value.delivery.entries)
    lines.push(`@${escape(row.owner)} ${row.tasks.map(escape).join('；')}`,'');
  else lines.push(escape(value.delivery.content),'');
  if(Object.values(value.unresolved).some(Boolean))lines.push('维护提示：日终仍有未确认请求；本文件不把这些请求列为已提交。','');
  return lines.join('\n');
}
function createArchive(dataDir,config,groups,options,output=()=>{}) {
  if(!options?.enabled)return null;
  if(!validDate(options.start_date))throw new Error('OPERATIONS_CONFIG_INVALID');
  const root=path.join(dataDir,'archives'),known=new Map(groups.map(g=>[binding({...config,chatId:g.chat_id}),g]));
  const cache=new Map();let lastErrors=0;
  function save(directory,key,date,{final=false}={}) {
    if(date<options.start_date)return;
    if(!validDate(date)||!/^[a-f0-9]{64}$/.test(key))throw new Error('ARCHIVE_SOURCE_INVALID');
    const file=path.join(directory,'meeting-state.json');
    if(!fs.existsSync(file)) {
      if(fs.existsSync(file+'.next'))throw new Error('ARCHIVE_STATE_PARTIAL');
      return;
    }
    for(const dir of [dataDir,path.join(dataDir,'days'),path.dirname(directory),directory])
      if(fs.lstatSync(dir).isSymbolicLink())throw new Error('ARCHIVE_SOURCE_LINK');
    if(fs.lstatSync(file).isSymbolicLink())throw new Error('ARCHIVE_SOURCE_LINK');
    const state=validate(JSON.parse(fs.readFileSync(file,'utf8')),key);
    if(new Date(state.createdAt+8*3600000).toISOString().slice(0,10)!==date)throw new Error('ARCHIVE_DATE_MISMATCH');
    const value=project(state,date,known.get(key),{final,partial:fs.existsSync(file+'.next')});
    const text=JSON.stringify(value,null,2)+'\n',cacheKey=key+'/'+date;
    if(cache.get(cacheKey)===text)return;
    const day=path.join(root,date);
    for(const dir of [root,day]) {
      fs.mkdirSync(dir,{recursive:true,mode:0o700});
      if(fs.lstatSync(dir).isSymbolicLink())throw new Error('ARCHIVE_DIRECTORY_LINK');
    }
    // JSON is canonical; both files must finish before retention removes the source.
    atomicWrite(path.join(day,key+'.json'),text);
    atomicWrite(path.join(day,key+'.md'),markdown(value));
    cache.set(cacheKey,text);
    while(cache.size>Math.max(4,known.size*3))cache.delete(cache.keys().next().value);
    output(`[ARCHIVE_${final?'FINALIZED':'UPDATED'}] rows=${value.records.length}`);
  }
  return {save,
    snapshot(date) {
      let errors=0;
      for(const [key] of known)try{save(path.join(dataDir,'days',key,date),key,date);}catch{errors++;}
      if(errors&&errors!==lastErrors)output(`[ARCHIVE_WRITE_FAILED] errors=${errors}; 待重试；源记录保留。`);
      if(!errors&&lastErrors)output('[ARCHIVE_RECOVERED] 归档写入已恢复。');
      lastErrors=errors;return errors;
    },
    beforeRemoveDay(directory,key,date){save(directory,key,date,{final:true});},
    status(){return {enabled:true,startDate:options.start_date,errors:lastErrors};}
  };
}
module.exports={readOperations,createArchive,project};
