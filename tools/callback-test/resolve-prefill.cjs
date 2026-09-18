'use strict';
// Optional one-time roster setup. No WebSocket, message writes, or raw logging.
const fs=require('node:fs');
const path=require('node:path');
const Lark=require('@larksuiteoapi/node-sdk');
const {MAX_ROWS,SECTIONS}=require('./meeting-card.cjs');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
async function main() {
  const directory=path.join(__dirname,'.local','meeting');
  const request=read(path.join(directory,'prefill-request.json'));
  const groups=read(path.join(directory,'groups.json'));
  if(!/^oc_[A-Za-z0-9_-]+$/.test(request.chat_id||'')||
    groups.groups.filter(g=>g.chat_id===request.chat_id&&g.enabled).length!==1)
    throw new Error('ROSTER_GROUP_INVALID');
  const desired=Object.keys(SECTIONS).flatMap(section=>{
    if(!Array.isArray(request[section]))throw new Error('ROSTER_NAMES_INVALID');
    return request[section].map((name,index)=>({section,index,name}));
  });
  if(!desired.length||desired.length>MAX_ROWS||desired.some(x=>typeof x.name!=='string'||!x.name.trim())||
    new Set(desired.map(x=>x.name.trim())).size!==desired.length)throw new Error('ROSTER_NAMES_INVALID');
  const config=read(path.join(__dirname,'.local','config.json'));
  const silent=Object.fromEntries(['trace','debug','info','warn','error'].map(k=>[k,()=>{}]));
  const transport=Lark.defaultHttpInstance;
  const http={request:r=>transport.request({...r,timeout:8000}),
    post:(url,data)=>transport.request({method:'POST',url,data,timeout:8000})};
  const client=new Lark.Client({appId:config.app_id,appSecret:config.app_secret,
    domain:Lark.Domain.Feishu,logger:silent,httpInstance:http});
  const matches=new Map(desired.map(x=>[x.name.trim(),new Set()]));
  let pageToken,complete=false;
  const seenTokens=new Set();
  for(let page=0;page<100;page++) {
    const reply=await client.im.chatMembers.get({path:{chat_id:request.chat_id},
      params:{member_id_type:'open_id',page_size:100,check_security_conf:true,...(pageToken?{page_token:pageToken}:{})}});
    if(reply?.code!==0) {
      console.log(JSON.stringify({status:'ROSTER_READ_REJECTED',code:Number.isInteger(reply?.code)?reply.code:null}));
      process.exitCode=1;return;
    }
    if(!Array.isArray(reply.data?.items)||reply.data.trigger_security_conf_limit)
      throw new Error('ROSTER_READ_INCOMPLETE');
    for(const item of reply.data.items) {
      const set=matches.get(typeof item.name==='string'?item.name.trim():'');
      if(set&&typeof item.member_id==='string'&&/^ou_[A-Za-z0-9_-]{1,100}$/.test(item.member_id))set.add(item.member_id);
    }
    if(!reply.data.has_more){complete=true;break;}
    pageToken=reply.data.page_token;
    if(typeof pageToken!=='string'||!pageToken||seenTokens.has(pageToken))throw new Error('ROSTER_PAGE_INVALID');
    seenTokens.add(pageToken);
  }
  if(!complete)throw new Error('ROSTER_READ_INCOMPLETE');
  const unresolved=desired.filter(x=>matches.get(x.name.trim()).size!==1)
    .map(x=>({section:x.section,index:x.index+1,matches:matches.get(x.name.trim()).size}));
  if(unresolved.length){console.log(JSON.stringify({status:'ROSTER_NEEDS_SELECTION',unresolved}));process.exitCode=1;return;}
  const prefill={enabled:true,planning:[],engineering:[]};
  for(const item of desired)prefill[item.section].push({name:item.name.trim(),open_id:[...matches.get(item.name.trim())][0]});
  const ids=Object.keys(SECTIONS).flatMap(s=>prefill[s].map(x=>x.open_id));
  if(new Set(ids).size!==ids.length)throw new Error('ROSTER_DUPLICATE_ID');
  const target=path.join(directory,'prefill-resolved.json');
  // Exclusive output avoids silently replacing a prior approved roster.
  fs.writeFileSync(target,JSON.stringify({chat_id:request.chat_id,prefill},null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:'ROSTER_MATCHED',planning:prefill.planning.length,engineering:prefill.engineering.length}));
}
if(require.main===module)main().catch(error=>{
  const code=error?.response?.data?.code;
  const scopes=[...new Set((String(error?.response?.data?.msg||'').match(/\b(?:im|contact):[a-z0-9:_]+\b/g)||[]))];
  const safe=['ROSTER_GROUP_INVALID','ROSTER_NAMES_INVALID','ROSTER_READ_INCOMPLETE','ROSTER_PAGE_INVALID','ROSTER_DUPLICATE_ID'];
  console.log(JSON.stringify({status:safe.includes(error?.message)?error.message:'ROSTER_SETUP_FAILED',
    code:Number.isInteger(code)?code:null,required_scopes:scopes}));process.exitCode=1;
});
