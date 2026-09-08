'use strict';
const {randomUUID,randomBytes}=require('node:crypto');
const {meetingCard,rowElement,deliveryElement,cardBudget,isEditing,LAYOUT_VERSION,MAX_ROWS,MAX_CONTENT,SECTIONS}=require('./meeting-card.cjs');
const {hash,MAX_REQUESTS,requestTarget}=require('./meeting-store.cjs');
const {extractDelivery}=require('./meeting-delivery.cjs');
const {diagnosis}=require('./probe.cjs');
const toast=(content,type='info')=>({toast:{type,content}});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

class MeetingService {
  constructor(config,store,api,output,{delay=250,now=Date.now,ai=config.deliveryAi||null}={}) {
    Object.assign(this,{config,store,api,output,delay,now,ai});
    this.queue=Promise.resolve();this.stopped=false;this.processing=false;this.fault=false;
    this.aiWork=Promise.resolve();this.aiRunning=false;this.aiAttempted=new Set();
  }
  record(code,extra=''){this.output(`[${code}]${extra?' '+extra:''}`);}
  canModify(row,actor,kind) {
    return Boolean(row)&&(row.owner===actor||
      (['save','edit'].includes(kind)&&this.config.rowPermissions?.submit==='all')||
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
    if(this.ai&&!s.pending&&!s.layoutPending&&s.rows.some(row=>row.content&&!row.deliveryResult)) {
      s.rows=s.rows.map(row=>row.content&&!row.deliveryResult?{...row,deliveryResult:{submissionId:randomUUID(),
        status:'pending',tasks:extractDelivery(row.content)}}:row);
      this.store.put(s);
    }
    if(!s.pending && s.layoutVersion!==LAYOUT_VERSION) {
      if(!s.layoutPending) {
        // The only live legacy row was entered as 策划 by the User. Never infer
        // section from a person's identity or unknown department for bulk migration.
        if(s.rows.length>1 && s.rows.some(r=>!r.section))throw new Error('SECTION_ASSIGNMENT_REQUIRED');
        const rows=s.rows.map(previous=>{
          const {role,department,departmentStatus,...row}=previous;
          return {...row,section:row.section||(role==='程序'?'engineering':'planning')};
        });
        s.rows=rows;
        s.layoutPending={uuid:randomUUID(),sequence:s.sequence+1};this.store.put(s);
      }
      let reply;
      try{reply=await this.api.updateLayout(s.cardId,s.layoutPending,meetingCard(s.rows,s.delivery));}
      catch(e){this.record('LAYOUT_UNCONFIRMED',diagnosis(e,'CALLBACK'));return false;}
      if(reply?.code!==0){this.record('LAYOUT_UNCONFIRMED',diagnosis(reply,'CALLBACK'));return false;}
      s.sequence=s.layoutPending.sequence;s.layoutPending=null;s.layoutVersion=LAYOUT_VERSION;this.store.put(s);
      this.record('LAYOUT_UPDATED',`same_message=true; rows=${s.rows.length}`);
    }
    if(this.store.get().pending)return false;
    this.pump();
    this.pumpAi();
    return true;
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
    if(['save_delivery','clear_delivery','edit_delivery'].includes(value?.op))
      return {error:'今日交付已改为自动汇总，请编辑本人的晨会记录。'};
    if(!value || !['add','save','edit','delete'].includes(value.op))return {error:'请使用本轮卡片上的按钮。'};
    const eventId=payload?.header?.event_id;
    // Token is hashed only in memory if the dispatcher supplies no event ID.
    const nonce=typeof eventId==='string'?eventId:e.token;
    if(typeof nonce!=='string'||!nonce||nonce.length>2048)return {error:'缺少回调防重标识，请重新点击。'};
    const request={kind:value.op,owner:e.operator.open_id,
      event:hash(JSON.stringify([state.messageId,nonce,value.op,value.row||'',value.section||'']))};
    if(value.op==='add') {
      if(!Object.hasOwn(SECTIONS,value.section||''))return {error:'请选择策划或程序区域下的加号。'};
      request.section=value.section;
    }
    if(['save','edit','delete'].includes(value.op)) {
      const row=state.rows.find(r=>r.id===value.row);
      if(!this.canModify(row,request.owner,value.op))return {error:'本群仅允许操作本人的行，或该行已删除。'};
      if(!Number.isSafeInteger(value.revision)||value.revision!==row.revision)
        return {error:'该行已更新，请使用最新卡片上的按钮。'};
      Object.assign(request,{row:row.id,revision:value.revision});
      if(value.op==='delete')return request;
      if(value.op==='edit')return isEditing(row)?{error:'本行已在编辑中，请填写后提交。'}:request;
      if(!isEditing(row))return {error:'请先点击本行的“编辑”，再修改提交。'};
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
    // A persisted pending intent is normal while the FIFO worker awaits Feishu.
    // Only a stopped worker with that intent means the result is unconfirmed.
    if(s.pending&&!this.processing)return toast('上次保存结果待确认，队列已保留；请联系维护者处理后再提交。','warning');
    const requests=s.requests||[];
    if(requests.some(r=>r.event===request.event||requestTarget(r)===requestTarget(request)))
      return toast('这一行已有操作排队或正在保存，请等本行刷新后再操作。','warning');
    if(request.kind==='add' && s.rows.some(r=>r.owner===request.owner)) {
      const existing=s.rows.find(r=>r.owner===request.owner);
      this.record('ROW_EXISTS',`rows=${s.rows.length}`);return toast(`你已经在${SECTIONS[existing.section]}区有一行了。选错区域可先删除本行，再重新添加。`);
    }
    if(request.kind==='add' && s.rows.length+requests.filter(r=>r.kind==='add').length>=MAX_ROWS)
      return toast('本轮卡片已满 20 人，请联系维护者。','warning');
    if(requests.length>=MAX_REQUESTS)return toast('当前排队已满，请稍后重新提交。','warning');
    if(!this.queueFits(s,[...requests,request]))
      return toast('本张卡片已接近容量上限，请精简内容后重新提交。','warning');
    // Persist only validated fields, never the callback body/token. ACK after
    // this write so an accepted request survives restart or an uncertain update.
    s.requests=[...requests,request];
    try{this.store.put(s);}catch{
      this.fault=true;this.record('QUEUE_WRITE_FAILED');
      return toast('本次未能加入队列，请保留输入并联系维护者。','warning');
    }
    this.record('ACTION_QUEUED',`waiting=${s.requests.length}`);
    this.pump();
    if(request.kind==='edit')return toast('正在打开编辑，请等输入框出现后修改并提交。');
    return toast(request.kind==='add'?'添加已排队，请等待你的行出现。':request.kind==='delete'
      ?'删除已排队，请等该行消失。':'已排队，请勿重复点击；本行刷新后才表示保存完成。');
  }
  queueFits(state,requests) {
    let rows=state.rows;
    // Reserve capacity for every accepted edit, including the in-flight one.
    // The placeholder has the same byte length as a generated row ID; it is
    // only used for size estimation, never saved or sent to Feishu.
    for(const r of requests) {
      if(r.kind==='delivery_result')rows=rows.map(row=>row.id===r.row&&row.deliveryResult?.submissionId===r.result.submissionId
        ?{...row,deliveryResult:r.result}:row);
      else if(r.kind==='add')rows=[...rows,{id:'r000000000000',owner:r.owner,section:r.section,content:'',revision:0}];
      else if(r.kind==='delete')rows=rows.filter(row=>row.id!==r.row);
      else rows=rows.map(row=>row.id===r.row?this.changedRow(row,r,'00000000-0000-0000-0000-000000000000'):row);
    }
    return cardBudget(rows).valid;
  }
  changedRow(row,request,submissionId) {
    if(request.kind==='edit')return {...row,editing:true,revision:row.revision+1};
    return {...row,content:request.content,editing:false,revision:row.revision+1,
      deliveryResult:this.ai?{submissionId,status:'pending',tasks:row.deliveryResult?.tasks||extractDelivery(row.content)}:undefined};
  }
  pumpAi() {
    if(!this.ai||this.aiRunning||this.stopped||this.fault||!this.nextAiRow())return;
    this.aiRunning=true;
    this.aiWork=this.runAi().catch(()=>this.record('AI_WORKER_PAUSED'))
      .finally(()=>{this.aiRunning=false;this.pumpAi();});
  }
  nextAiRow() {
    const s=this.store.get();
    return s.rows.find(r=>r.deliveryResult?.status==='pending'&&!this.aiAttempted.has(r.deliveryResult.submissionId)&&
      !(s.requests||[]).some(q=>q.kind==='delivery_result'&&q.row===r.id));
  }
  async runAi() {
    while(!this.stopped&&!this.fault) {
      const row=this.nextAiRow();
      if(!row)return;
      const submissionId=row.deliveryResult.submissionId;this.aiAttempted.add(submissionId);
      let tasks=row.deliveryResult.tasks,status='ready';
      try{tasks=await this.ai.extract(row.content);}catch(e){status='failed';
        const reason=['AI_CONNECTION_FAILED','AI_REQUEST_FAILED','AI_OUTPUT_INVALID'].includes(e?.message)||/^AI_HTTP_[1-5][0-9]{2}$/.test(e?.message||'')
          ?e.message:'AI_REQUEST_FAILED';
        this.record('AI_EXTRACTION_FAILED',`reason=${reason}`);}
      if(this.stopped)return;
      if((this.store.get().requests||[]).length>=MAX_REQUESTS)await this.queue;
      const s=this.store.get();
      if(this.stopped||this.fault||(s.requests||[]).length>=MAX_REQUESTS)return;
      if(s.rows.find(r=>r.id===row.id)?.deliveryResult?.submissionId!==submissionId)continue;
      const result={submissionId,status,tasks};
      s.requests=[...(s.requests||[]),{kind:'delivery_result',row:row.id,owner:row.owner,
        event:hash('delivery:'+submissionId),result}];
      this.store.put(s);this.pump();
    }
  }
  pump() {
    if(this.processing||this.fault||!(this.store.get().requests||[]).length)return;
    this.processing=true;
    this.queue=this.drain()
      .catch(e=>{this.fault=true;this.record('MEETING_FAULT',diagnosis(e,'CALLBACK'));})
      .finally(()=>{this.processing=false;this.pumpAi();});
  }
  async drain() {
    while(!this.fault) {
      const s=this.store.get(),request=s.requests?.[0];
      if(s.pending){this.record('QUEUE_PAUSED',`waiting=${s.requests?.length||0}`);return;}
      if(!request)return;
      // ACK first, then serialize updates to this card; other groups have their own worker.
      await wait(this.delay);
      if(!await this.apply(request))return;
    }
  }
  finishRequest(request,code) {
    const s=this.store.get();
    s.requests=(s.requests||[]).filter(r=>r.event!==request.event);
    this.store.put(s);this.record(code);return true;
  }
  async apply(request) {
    if(this.fault)return false;
    const s=this.store.get();
    if(s.pending){this.record('QUEUE_PAUSED',`waiting=${s.requests?.length||0}`);return false;}
    if(s.events.includes(request.event))return this.finishRequest(request,'EVENT_DUPLICATE');
    let row;
    if(request.kind==='delivery_result') {
      const previous=s.rows.find(r=>r.id===request.row);
      if(previous?.deliveryResult?.submissionId!==request.result.submissionId)
        return this.finishRequest(request,'STALE_AI_RESULT_IGNORED');
      row={...previous,deliveryResult:request.result};
    }else if(request.kind==='add') {
      if(s.rows.some(r=>r.owner===request.owner))return this.finishRequest(request,'ROW_EXISTS');
      if(s.rows.length>=MAX_ROWS)return this.finishRequest(request,'ROW_LIMIT');
      row={id:'r'+randomBytes(6).toString('hex'),owner:request.owner,section:request.section,content:'',revision:0};
    }else{
      const previous=s.rows.find(r=>r.id===request.row);
      if(!this.canModify(previous,request.owner,request.kind)||previous.revision!==request.revision)
        return this.finishRequest(request,'STALE_SAVE_REJECTED');
      row=request.kind==='delete'?previous:this.changedRow(previous,request,randomUUID());
    }
    const nextRows=request.kind==='add'?[...s.rows,row]:request.kind==='delete'
      ?s.rows.filter(r=>r.id!==row.id):s.rows.map(r=>r.id===row.id?row:r);
    if(!cardBudget(nextRows).valid)return this.finishRequest(request,'CARD_SIZE_LIMIT');
    s.pending={kind:request.kind,row,event:request.event,uuid:randomUUID(),sequence:s.sequence+1};
    this.store.put(s);return this.flush();
  }
  async flush() {
    let s=this.store.get();const p=s.pending;
    if(!p)return true;
    const nextRows=p.kind==='add'?[...s.rows,p.row]:p.kind==='delete'
      ?s.rows.filter(row=>row.id!==p.row.id):s.rows.map(row=>row.id===p.row.id?p.row:row);
    let reply;
    try{reply=p.kind==='delivery_result'?await this.api.updateSummary(s.cardId,p,deliveryElement(nextRows)):
      ['save','delete'].includes(p.kind)?await this.api.updateRowAndSummary(s.cardId,p,rowElement(p.row),deliveryElement(nextRows)):
        await this.api.updateRow(s.cardId,p,rowElement(p.row));}
    catch(e){this.record('UPDATE_UNCONFIRMED',diagnosis(e,'CALLBACK'));return false;}
    if(reply?.code!==0) {
      // UUID conflict is NOT proof of a successful update. Keep the exact intent
      // and fail closed rather than incrementing sequence or creating duplicates.
      this.record('UPDATE_UNCONFIRMED',diagnosis(reply,'CALLBACK'));return false;
    }
    // New callbacks may append requests while the API call is in flight. Merge
    // into the latest state so completing one update cannot erase those requests.
    s=this.store.get();
    if(s.pending?.uuid!==p.uuid||s.pending.sequence!==p.sequence)throw new Error('PENDING_CHANGED');
    s.rows=p.kind==='add'?[...s.rows,p.row]:p.kind==='delete'
      ?s.rows.filter(r=>r.id!==p.row.id):s.rows.map(r=>r.id===p.row.id?p.row:r);
    s.sequence=p.sequence;s.events=[...s.events,p.event].slice(-256);s.pending=null;
    s.requests=(s.requests||[]).filter(r=>r.event!==p.event);
    this.store.put(s);
    this.pumpAi();
    if(p.kind==='delivery_result') {
      this.record('DELIVERY_SUMMARY_UPDATED',`same_message=true; tasks=${p.row.deliveryResult.tasks.length}; status=${p.row.deliveryResult.status}`);
      return true;
    }
    this.record(p.kind==='edit'?'ROW_EDITING':p.kind==='add'?'ROW_ADDED':p.kind==='delete'?'ROW_DELETED':'ROW_SAVED',
      `rows=${s.rows.length}; same_message=true; fields=${p.kind==='save'?1:0}`);
    return true;
  }
  async stop(){this.stopped=true;await this.aiWork;await this.queue;}
}
module.exports={MeetingService};
