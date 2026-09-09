'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createStore,binding,validate,hash}=require('./meeting-store.cjs');
const {MeetingService}=require('./meeting-service.cjs');
const {MAX_ROWS,SECTIONS}=require('./meeting-card.cjs');

// Fixed UTC+8, independent of the Windows clock's display timezone.
function beijing(now=Date.now()) {
  const d=new Date(now+8*60*60*1000);
  return {date:d.toISOString().slice(0,10),weekday:d.getUTCDay(),minute:d.getUTCHours()*60+d.getUTCMinutes()};
}
const json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function readSettings(directory,config) {
  const file=path.join(directory,'groups.json');
  if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({version:1,timezone:'Asia/Shanghai',time:'09:40',
    weekdays:[1,2,3,4,5],groups:[{name:'测试群',chat_id:config.chatId,enabled:true,schedule:false,
      start_date:beijing().date}]},null,2),{flag:'wx',mode:0o600});
  const c=json(file);
  if(c.version!==1||c.timezone!=='Asia/Shanghai'||typeof c.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.time)||
    JSON.stringify(c.weekdays)!=='[1,2,3,4,5]'||!Array.isArray(c.groups)||c.groups.length>20)
    throw new Error('GROUP_CONFIG_INVALID');
  for(const g of c.groups) {
    if(typeof g.enabled!=='boolean'||typeof g.schedule!=='boolean'||typeof g.name!=='string'||
      typeof g.chat_id!=='string'||(g.enabled&&!/^oc_[A-Za-z0-9_-]+$/.test(g.chat_id))||
      !/^\d{4}-\d{2}-\d{2}$/.test(g.start_date)||
      !Number.isFinite(Date.parse(g.start_date+'T00:00:00Z'))||
      new Date(g.start_date+'T00:00:00Z').toISOString().slice(0,10)!==g.start_date)
      throw new Error('GROUP_CONFIG_INVALID');
    if(g.row_permissions!==undefined && (!g.row_permissions ||
      !['owner','all'].includes(g.row_permissions.submit) ||
      !['owner','all'].includes(g.row_permissions.delete)))throw new Error('GROUP_PERMISSIONS_INVALID');
    if(g.delivery_ai!==undefined&&typeof g.delivery_ai!=='boolean')throw new Error('GROUP_AI_INVALID');
    if(g.prefill!==undefined) {
      const p=g.prefill;
      if(!p||typeof p.enabled!=='boolean'||Object.keys(SECTIONS).some(section=>
        !Array.isArray(p[section])||p[section].some(member=>!member||typeof member.open_id!=='string'||
          !/^ou_[A-Za-z0-9_-]{1,100}$/.test(member.open_id||'')||
          (member.name!==undefined&&typeof member.name!=='string'))))throw new Error('PREFILL_CONFIG_INVALID');
      const members=Object.keys(SECTIONS).flatMap(section=>p[section]);
      if(members.length>MAX_ROWS||new Set(members.map(m=>m.open_id)).size!==members.length||
        (p.enabled&&members.length===0))throw new Error('PREFILL_ROSTER_INVALID');
    }
  }
  const enabled=c.groups.filter(g=>g.enabled);
  if(new Set(enabled.map(g=>g.chat_id)).size!==enabled.length)throw new Error('GROUP_CONFIG_DUPLICATE');
  const [hour,minute]=c.time.split(':').map(Number);
  return {groups:enabled,time:c.time,minute:hour*60+minute};
}
function readGroups(directory,config) {return readSettings(directory,config).groups;}
function scheduleDue(group,today,minute) {
  return group.schedule&&today.weekday>=1&&today.weekday<=5&&today.minute>=minute&&today.date>=group.start_date;
}
function dayDirectory(directory,config,date) {return path.join(directory,'days',binding(config),date);}
function migrateLegacy(directory,config,output) {
  const oldFile=path.join(directory,'meeting-state.json'),marker=path.join(directory,'daily-migration.json');
  if(fs.existsSync(marker)) {
    const m=json(marker);
    if(m.version!==1||m.binding!==binding(config))throw new Error('LEGACY_BINDING_CHANGED');
    return;
  }
  if(!fs.existsSync(oldFile))return;
  const raw=fs.readFileSync(oldFile,'utf8'),s=validate(JSON.parse(raw),binding(config));
  const date=beijing(s.createdAt).date,dir=dayDirectory(directory,config,date),target=path.join(dir,'meeting-state.json');
  fs.mkdirSync(dir,{recursive:true});
  if(fs.existsSync(target)) {
    if(hash(fs.readFileSync(target,'utf8'))!==hash(raw))throw new Error('DAILY_MIGRATION_CONFLICT');
  }else fs.copyFileSync(oldFile,target,fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(marker,JSON.stringify({version:1,binding:binding(config),date}),{flag:'wx',mode:0o600});
  output(`[DAILY_STATE_MIGRATED] same_message=true; rows=${s.rows.length}`);
}

class MeetingSchedule {
  constructor(directory,config,apiFactory,output,connected) {
    Object.assign(this,{directory,config,apiFactory,output,connected});
    this.schedule=readSettings(directory,config);this.groups=this.schedule.groups;
    migrateLegacy(directory,config,output);
    this.active=new Map();this.day=null;this.stopped=false;this.work=null;
  }
  start() {
    this.output(`[SCHEDULE_CONFIGURED] groups=${this.groups.length}; scheduled=${this.groups.filter(g=>g.schedule).length}; weekdays=1-5; time=${this.schedule.time}; timezone=Asia/Shanghai`);
    this.groups.forEach((g,index)=>this.output(`[GROUP_${index+1}] [GROUP_OPTIONS] prefill=${Boolean(g.prefill?.enabled)}; planning=${g.prefill?.planning.length||0}; engineering=${g.prefill?.engineering.length||0}; submit=${g.row_permissions?.submit||'owner'}; delete=${g.row_permissions?.delete||'owner'}; delivery_ai=${g.delivery_ai===true}`));
    this.timer=setInterval(()=>{void this.tick();},15000);
    void this.tick();
  }
  tick() {
    if(this.stopped||!this.connected()||this.work)return this.work||Promise.resolve();
    this.work=this.run().catch(()=>{this.output('[SCHEDULE_STATE_ERROR] 本机状态待核对；未自动清空或重发。');})
      .finally(()=>{this.work=null;});
    return this.work;
  }
  async run() {
    const today=beijing();
    if(this.day!==today.date) {
      for(const slot of this.active.values())await slot.service.stop();
      this.active.clear();this.day=today.date;
    }
    for(let i=0;i<this.groups.length;i++) {
      if(this.stopped)return;
      const g=this.groups[i];
      if(this.active.has(g.chat_id)) {
        const existing=this.active.get(g.chat_id);
        // Resume only a known rejected update of the existing card. Never
        // retry an uncertain create/send by constructing a fresh service.
        if(!existing.ready&&existing.service.retryPreparationDue?.()) {
          try {
            existing.ready=await existing.service.prepare();
            if(existing.ready)this.output(`[GROUP_${i+1}] [MEETING_READY] 本群原卡片已恢复。`);
          }catch {
            existing.service.fault=true;
            this.output(`[GROUP_${i+1}] [MEETING_NOT_READY] 本群恢复失败，已保留提交待核对。`);
          }
        }
        continue;
      }
      const config={...this.config,chatId:g.chat_id,prefill:g.prefill,rowPermissions:g.row_permissions,
        deliveryAiEnabled:g.delivery_ai===true,deliveryAi:g.delivery_ai===true?this.config.deliveryAi:null};
      const dir=dayDirectory(this.directory,config,today.date);
      const exists=fs.existsSync(path.join(dir,'meeting-state.json'));
      const due=scheduleDue(g,today,this.schedule.minute);
      if(!exists&&!due)continue;
      const output=line=>this.output(`[GROUP_${i+1}] ${line}`);
      let slot;
      try {
        fs.mkdirSync(dir,{recursive:true});
        const service=new MeetingService(config,createStore(dir,config),this.apiFactory(config),output);
        // Keep one slot even after an uncertain request: a timer tick must not
        // create another card. Restart resumes this same persisted journal.
        slot={service,ready:false};this.active.set(g.chat_id,slot);
        slot.ready=await service.prepare();
        output(slot.ready?'[MEETING_READY] 本群当天卡片可填写。':'[MEETING_NOT_READY] 请检查状态后重启，保留本机数据。');
      }catch {
        // A bad group/state must not prevent other configured groups from working.
        if(!slot)this.active.set(g.chat_id,{service:{stop:async()=>{}},ready:false});
        output('[MEETING_NOT_READY] 本群状态待核对；未自动重建卡片。');
      }
    }
  }
  handle(payload) {
    const event=payload?.event||payload,slot=this.active.get(event?.context?.open_chat_id);
    if(this.stopped||!this.connected()||this.day!==beijing().date||!slot?.ready)
      return {toast:{type:'warning',content:'请使用本群今天的晨会卡片；程序需保持运行。'}};
    return slot.service.handle(payload);
  }
  async stop() {
    this.stopped=true;clearInterval(this.timer);
    if(this.work)await this.work;
    for(const slot of this.active.values())await slot.service.stop();
  }
}
module.exports={MeetingSchedule,beijing,readGroups,readSettings,scheduleDue};
