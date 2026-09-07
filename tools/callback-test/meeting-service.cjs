'use strict';
const {randomUUID,randomBytes}=require('node:crypto');
const {meetingCard,rowElement,deliveryElement,cardBudget,MAX_ROWS,MAX_CONTENT,SECTIONS}=require('./meeting-card.cjs');
const {hash}=require('./meeting-store.cjs');
const {diagnosis}=require('./probe.cjs');
const toast=(content,type='info')=>({toast:{type,content}});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const isDelivery=kind=>['save_delivery','clear_delivery'].includes(kind);

class MeetingService {
  constructor(config,store,api,output,{delay=250,now=Date.now}={}) {
    Object.assign(this,{config,store,api,output,delay,now});
    this.queue=Promise.resolve();this.stopped=false;this.queued=0;this.fault=false;
  }
  record(code,extra=''){this.output(`[${code}]${extra?' '+extra:''}`);}
  canModify(row,actor,kind) {
    return Boolean(row)&&(row.owner===actor||
      (kind==='save'&&this.config.rowPermissions?.submit==='all')||
      (kind==='delete'&&this.config.rowPermissions?.delete==='all'));
  }
  async prepare() {
    let s=this.store.get();
    if(this.now()-s.createdAt>=13*24*60*60*1000)throw new Error('CARD_EXPIRED_REVIEW');
    if(s.stage==='creating')throw new Error('CARD_CREATE_UNCONFIRMED');
    if(s.stage==='new') {
      if(!cardBudget(s.rows,s.delivery).valid)throw new Error('PREFILL_CARD_SIZE_LIMIT');
      s.stage='creating';this.store.put(s);
      let reply;
      try {reply=await this.api.createCard(meetingCard(s.rows,s.delivery));}
      catch(e){this.record('CARD_CREATE_UNCONFIRMED',diagnosis(e,'SEND'));return false;}
      if(reply?.code!==0) {s.stage='new';this.store.put(s);
        this.record('CARD_CREATE_REJECTED',diagnosis(reply,'SEND'));return false;}
      if(typeof reply.data?.card_id!=='string') {this.record('CARD_CREATE_UNCONFIRMED');return false;}
      s.cardId=reply.data.card_id;s.stage='created';this.store.put(s);this.record('CARD_CREATED');
    }
    if(s.stage==='created') {s.stage='sending';s.sendUuid=randomUUID();s.sendAt=this.now();this.store.put(s);}
    if(s.stage==='sending') {
      if(this.now()-s.sendAt>50*60*1000)throw new Error('MESSAGE_SEND_UNCONFIRMED');
      let reply;
      try{reply=await this.api.sendCard(s.cardId,s.sendUuid);}
      catch(e){this.record('MESSAGE_SEND_UNCONFIRMED',diagnosis(e,'SEND'));return false;}
      if(reply?.code!==0 || reply.data?.chat_id!==this.config.chatId ||
        reply.data?.msg_type!=='interactive' || typeof reply.data?.message_id!=='string') {
        this.record('MESSAGE_SEND_UNCONFIRMED',diagnosis(reply,'SEND'));return false;}
      s.messageId=reply.data.message_id;s.stage='sent';this.store.put(s);this.record('MEETING_SENT',`same_message=true; rows=${s.rows.length}`);
    }else this.record('MEETING_RESUMED',`same_message=true; rows=${s.rows.length}`);
    if(s.pending)await this.flush();
    s=this.store.get();
    if(!s.pending && s.layoutVersion!==11) {
      if(!s.layoutPending) {
        // The only live legacy row was entered as 策划 by the User. Never infer
        // section from a person's identity or unknown department for bulk migration.
        if(s.rows.length>1 && s.rows.some(r=>!r.section))throw new Error('SECTION_ASSIGNMENT_REQUIRED');
        const rows=s.rows.map(previous=>{
          const {role,department,departmentStatus,...row}=previous;
          return {...row,section:row.section||(role==='程序'?'engineering':'planning')};
        });
        s.rows=rows;s.delivery??={content:'',revision:0};
        s.layoutPending={uuid:randomUUID(),sequence:s.sequence+1};this.store.put(s);
      }
      let reply;
      try{reply=await this.api.updateLayout(s.cardId,s.layoutPending,meetingCard(s.rows,s.delivery));}
      catch(e){this.record('LAYOUT_UNCONFIRMED',diagnosis(e,'CALLBACK'));return false;}
      if(reply?.code!==0){this.record('LAYOUT_UNCONFIRMED',diagnosis(reply,'CALLBACK'));return false;}
      s.sequence=s.layoutPending.sequence;s.layoutPending=null;s.layoutVersion=11;this.store.put(s);
      this.record('LAYOUT_UPDATED',`same_message=true; rows=${s.rows.length}`);
    }
    return !this.store.get().pending;
  }
  parse(payload) {
    const e=payload?.event||payload;
    const state=this.store.get();
    if(this.stopped||this.fault||state.stage!=='sent')return {error:'接收程序尚未就绪，请稍后重试。'};
    if(this.now()-state.createdAt>=13*24*60*60*1000)return {error:'本轮卡片已到更新期限，请联系维护者。'};
    if(e?.context?.open_chat_id!==this.config.chatId || e?.context?.open_message_id!==state.messageId)
      return {error:'请使用本群当前晨会卡片。'};
    if(!/^ou_[A-Za-z0-9_-]{1,100}$/.test(e?.operator?.open_id||'') || e?.action?.tag!=='button')
      return {error:'无法核对本次操作，请重新点击按钮。'};
    const value=e.action.value;
    if(!value || !['add','save','delete','save_delivery','clear_delivery'].includes(value.op))return {error:'请使用本轮卡片上的按钮。'};
    const eventId=payload?.header?.event_id;
    // Token is hashed only in memory if the dispatcher supplies no event ID.
    const nonce=typeof eventId==='string'?eventId:e.token;
    if(typeof nonce!=='string'||!nonce||nonce.length>2048)return {error:'缺少回调防重标识，请重新点击。'};
    const request={kind:value.op,owner:e.operator.open_id,
      event:hash(JSON.stringify([state.messageId,nonce,value.op,value.row||'',value.section||'']))};
    if(isDelivery(value.op)) {
      // The User explicitly authorized every member of this configured chat to
      // edit the shared delivery field; personal-row ownership is separate.
      const delivery=state.delivery||{content:'',revision:0};
      if(!Number.isSafeInteger(value.revision)||value.revision!==delivery.revision)
        return {error:'今日交付已被更新，请查看最新内容后再操作。'};
      request.revision=value.revision;
      if(value.op==='clear_delivery')return request;
      const content=e.action.form_value?.delivery_content;
      if(typeof content!=='string'||!content.trim()||content.length>MAX_CONTENT)
        return {error:`请填写今日交付（${MAX_CONTENT}字内），再提交。`};
      request.content=content.trim();return request;
    }
    if(value.op==='add') {
      if(!Object.hasOwn(SECTIONS,value.section||''))return {error:'请选择策划或程序区域下的加号。'};
      request.section=value.section;
    }
    if(value.op==='save'||value.op==='delete') {
      const row=state.rows.find(r=>r.id===value.row);
      if(!this.canModify(row,request.owner,value.op))return {error:'本群仅允许操作本人的行，或该行已删除。'};
      if(!Number.isSafeInteger(value.revision)||value.revision!==row.revision)
        return {error:'该行已更新，请使用最新卡片上的按钮。'};
      Object.assign(request,{row:row.id,revision:value.revision});
      if(value.op==='delete')return request;
      const form=e.action.form_value;
      const content=form?.[`content_${row.id}`];
      if(typeof content!=='string'||!content.trim()||content.length>MAX_CONTENT)
        return {error:`请填写晨会内容（${MAX_CONTENT}字内），再提交。`};
      Object.assign(request,{row:row.id,revision:value.revision,content:content.trim()});
    }
    return request;
  }
  handle(payload) {
    const request=this.parse(payload);
    if(request.error) {this.record('ACTION_REJECTED');return toast(request.error,'warning');}
    const s=this.store.get();
    if(s.events.includes(request.event)){this.record('EVENT_DUPLICATE');return toast('该次操作已处理。');}
    if(s.pending)return toast('上次更新仍待确认，请先检查接收程序。','warning');
    if(request.kind==='add' && s.rows.some(r=>r.owner===request.owner)) {
      const existing=s.rows.find(r=>r.owner===request.owner);
      this.record('ROW_EXISTS',`rows=${s.rows.length}`);return toast(`你已经在${SECTIONS[existing.section]}区有一行了。选错区域可先删除本行，再重新添加。`);
    }
    if(request.kind==='add' && s.rows.length>=MAX_ROWS)return toast('本轮卡片已满 20 人，请联系维护者。','warning');
    if(request.kind==='save' && !cardBudget(s.rows.map(r=>r.id===request.row?
      {...r,content:request.content}:r),s.delivery).valid)
      return toast('本张卡片已接近容量上限，请精简本行内容后保存。','warning');
    if(request.kind==='save_delivery'&&!cardBudget(s.rows,{content:request.content,revision:request.revision}).valid)
      return toast('本张卡片已接近容量上限，请精简交付内容。','warning');
    if(this.queued>=24)return toast('当前操作较多，请稍后重试。','warning');
    this.queued++;
    // ACK first: CardKit may reject updates while a card interaction is in progress.
    this.queue=this.queue.then(async()=>{await wait(this.delay);await this.apply(request);})
      .catch(e=>{this.fault=true;this.record('MEETING_FAULT',diagnosis(e,'CALLBACK'));})
      .finally(()=>{this.queued--;});
    if(isDelivery(request.kind))return toast(request.kind==='clear_delivery'
      ?'正在清空今日交付，请稍候。':'正在提交今日交付，请稍候。');
    return toast(request.kind==='add'?'正在添加你的行，请稍候。':request.kind==='delete'
      ?'正在删除本行；行消失后可在另一个区域重新添加。':'已接收，正在保存本行，请稍候。');
  }
  async apply(request) {
    if(this.fault)return;
    const s=this.store.get();
    if(s.pending){this.record('UPDATE_PENDING');return;}
    if(s.events.includes(request.event)){this.record('EVENT_DUPLICATE');return;}
    if(isDelivery(request.kind)) {
      const previous=s.delivery||{content:'',revision:0};
      if(previous.revision!==request.revision){this.record('STALE_DELIVERY_REJECTED');return;}
      const delivery={content:request.kind==='clear_delivery'?'':request.content,revision:previous.revision+1};
      if(!cardBudget(s.rows,delivery).valid){this.record('CARD_SIZE_LIMIT');return;}
      s.pending={kind:request.kind,delivery,event:request.event,uuid:randomUUID(),sequence:s.sequence+1};
      this.store.put(s);await this.flush();return;
    }
    let row;
    if(request.kind==='add') {
      if(s.rows.some(r=>r.owner===request.owner)){this.record('ROW_EXISTS',`rows=${s.rows.length}`);return;}
      if(s.rows.length>=MAX_ROWS){this.record('ROW_LIMIT');return;}
      row={id:'r'+randomBytes(6).toString('hex'),owner:request.owner,section:request.section,content:'',revision:0};
    }else{
      const previous=s.rows.find(r=>r.id===request.row);
      if(!this.canModify(previous,request.owner,request.kind)||previous.revision!==request.revision){this.record('STALE_SAVE_REJECTED');return;}
      row=request.kind==='delete'?previous:{...previous,content:request.content,revision:previous.revision+1};
    }
    const nextRows=request.kind==='add'?[...s.rows,row]:request.kind==='delete'
      ?s.rows.filter(r=>r.id!==row.id):s.rows.map(r=>r.id===row.id?row:r);
    if(!cardBudget(nextRows,s.delivery).valid){this.record('CARD_SIZE_LIMIT');return;}
    s.pending={kind:request.kind,row,event:request.event,uuid:randomUUID(),sequence:s.sequence+1};
    this.store.put(s);await this.flush();
  }
  async flush() {
    const s=this.store.get(),p=s.pending;
    if(!p)return true;
    let reply;
    try{reply=isDelivery(p.kind)?await this.api.updateDelivery(s.cardId,p,deliveryElement(p.delivery)):
      await this.api.updateRow(s.cardId,p,rowElement(p.row));}
    catch(e){this.record('UPDATE_UNCONFIRMED',diagnosis(e,'CALLBACK'));return false;}
    if(reply?.code!==0) {
      // UUID conflict is NOT proof of a successful update. Keep the exact intent
      // and fail closed rather than incrementing sequence or creating duplicates.
      this.record('UPDATE_UNCONFIRMED',diagnosis(reply,'CALLBACK'));return false;
    }
    if(isDelivery(p.kind))s.delivery=p.delivery;
    else s.rows=p.kind==='add'?[...s.rows,p.row]:p.kind==='delete'
      ?s.rows.filter(r=>r.id!==p.row.id):s.rows.map(r=>r.id===p.row.id?p.row:r);
    s.sequence=p.sequence;s.events=[...s.events,p.event].slice(-256);s.pending=null;
    this.store.put(s);
    if(isDelivery(p.kind)) {
      this.record(p.kind==='clear_delivery'?'DELIVERY_CLEARED':'DELIVERY_SAVED','same_message=true; fields=1');
      return true;
    }
    this.record(p.kind==='add'?'ROW_ADDED':p.kind==='delete'?'ROW_DELETED':'ROW_SAVED',
      `rows=${s.rows.length}; same_message=true; fields=${p.kind==='save'?1:0}`);
    return true;
  }
  async stop(){this.stopped=true;await this.queue;}
}
module.exports={MeetingService};
