'use strict';
const {randomUUID,randomBytes}=require('node:crypto');
const {meetingCard,rowElement,deliveryElement,manualDeliveryElement,cardBudget,isEditing,layoutVersion,MAX_ROWS,MAX_CONTENT,SECTIONS}=require('./meeting-card.cjs');
const {hash,MAX_REQUESTS,requestTarget}=require('./meeting-store.cjs');
const {extractDelivery,hasEstimatedToday,SUMMARY_VERSION}=require('./meeting-delivery.cjs');
const {diagnosis}=require('./probe.cjs');
const toast=(content,type='info')=>({toast:{type,content}});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const isDelivery=kind=>['save_delivery','clear_delivery','edit_delivery'].includes(kind);

class MeetingService {
  constructor(config,store,api,output,{delay=250,now=Date.now,retryDelays=[1000,2000,5000,15000,60000],ai=config.deliveryAiEnabled===true?config.deliveryAi||null:null}={}) {
    Object.assign(this,{config,store,api,output,delay,now,ai});
    this.autoDelivery=config.deliveryAiEnabled===true;
    this.layoutVersion=layoutVersion(config);
    this.queue=Promise.resolve();this.stopped=false;this.processing=false;this.fault=false;this.preparing=false;
    this.aiWork=Promise.resolve();this.aiRunning=false;this.aiAttempted=new Set();
    this.retryDelays=retryDelays;this.retryTimer=null;
  }
  record(code,extra=''){this.output(`[${code}]${extra?' '+extra:''}`);}
  canModify(row,actor,kind) {
    return Boolean(row)&&(row.owner===actor||
      (['save','edit'].includes(kind)&&this.config.rowPermissions?.submit==='all')||
      (kind==='delete'&&this.config.rowPermissions?.delete==='all'));
  }
  retryPreparationDue() {
    const s=this.store.get();
    return this.preparing&&!this.stopped&&!this.fault&&s.stage==='sent'&&
      s.pending?.recovery?.status==='retrying'&&s.pending.recovery.nextAt<=this.now();
  }
  async prepare() {
    this.preparing=true;
    let s=this.store.get();
    if(this.now()-s.createdAt>=13*24*60*60*1000)throw new Error('CARD_EXPIRED_REVIEW');
    if(s.stage==='creating')throw new Error('CARD_CREATE_UNCONFIRMED');
    if(s.stage==='new') {
      if(!cardBudget(s.rows,s.delivery,this.autoDelivery).valid)throw new Error('PREFILL_CARD_SIZE_LIMIT');
      s.stage='creating';this.store.put(s);
      let reply;
      try {reply=await this.api.createCard(meetingCard(s.rows,s.delivery,this.autoDelivery));}
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
    const needsRecognition=row=>row.content&&(!row.deliveryResult||
      (row.deliveryResult.policyVersion!==this.ai?.policyVersion&&
        (hasEstimatedToday(row.content)||row.content.includes('今天交付'))));
    if(this.ai&&!s.pending&&!s.layoutPending&&!s.summaryPending&&s.rows.some(needsRecognition)) {
      const affected=s.rows.filter(needsRecognition).length;
      s.rows=s.rows.map(row=>needsRecognition(row)?{...row,deliveryResult:{submissionId:randomUUID(),
        policyVersion:this.ai.policyVersion,status:'pending',tasks:row.deliveryResult?.tasks||extractDelivery(row.content)}}:row);
      this.store.put(s);
      this.record('AI_RECOGNITION_QUEUED',`rows=${affected}`);
    }
    if(!s.pending&&!s.summaryPending && s.layoutVersion!==this.layoutVersion) {
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
      try{reply=await this.api.updateLayout(s.cardId,s.layoutPending,meetingCard(s.rows,s.delivery,this.autoDelivery));}
      catch(e){this.record('LAYOUT_UNCONFIRMED',diagnosis(e,'CALLBACK'));return false;}
      if(reply?.code!==0){this.record('LAYOUT_UNCONFIRMED',diagnosis(reply,'CALLBACK'));return false;}
      s.sequence=s.layoutPending.sequence;s.layoutPending=null;s.layoutVersion=this.layoutVersion;this.store.put(s);
      this.record('LAYOUT_UPDATED',`same_message=true; rows=${s.rows.length}`);
    }
    s=this.store.get();
    if(this.autoDelivery&&!s.pending&&!s.layoutPending&&(s.summaryVersion!==SUMMARY_VERSION||s.summaryPending)) {
      if(!s.summaryPending){s.summaryPending={uuid:randomUUID(),sequence:s.sequence+1};this.store.put(s);}
      const intent=s.summaryPending;
      let reply;
      try{reply=await this.api.updateSummary(s.cardId,intent,deliveryElement(s.rows));}
      catch(e){this.record('SUMMARY_REFRESH_UNCONFIRMED',diagnosis(e,'CALLBACK'));return false;}
      if(reply?.code!==0){this.record('SUMMARY_REFRESH_UNCONFIRMED',diagnosis(reply,'CALLBACK'));return false;}
      s=this.store.get();
      if(s.summaryPending?.uuid!==intent.uuid||s.summaryPending.sequence!==intent.sequence)throw new Error('PENDING_CHANGED');
      s.sequence=intent.sequence;s.summaryVersion=SUMMARY_VERSION;s.summaryPending=null;this.store.put(s);
      this.record('DELIVERY_SUMMARY_REFRESHED','same_message=true');
    }
    // A known temporary rejection can recover without recreating the schedule
    // slot. Do not make a card with unfinished layout/summary migrations ready.
    s=this.store.get();
    if(s.summaryPending||s.layoutPending||s.layoutVersion!==this.layoutVersion||
      (this.autoDelivery&&s.summaryVersion!==SUMMARY_VERSION)||
      (s.pending&&s.pending.recovery?.status!=='retrying'))return false;
    this.preparing=false;
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
    if(this.autoDelivery&&isDelivery(value?.op))
      return {error:'今日交付已改为自动汇总，请编辑本人的晨会记录。'};
    if(!value || !['add','save','edit','delete','save_delivery','clear_delivery','edit_delivery'].includes(value.op))return {error:'请使用本轮卡片上的按钮。'};
    const eventId=payload?.header?.event_id;
    // Token is hashed only in memory if the dispatcher supplies no event ID.
    const nonce=typeof eventId==='string'?eventId:e.token;
    if(typeof nonce!=='string'||!nonce||nonce.length>2048)return {error:'缺少回调防重标识，请重新点击。'};
    const request={kind:value.op,owner:e.operator.open_id,
      event:hash(JSON.stringify([state.messageId,nonce,value.op,value.row||'',value.section||'']))};
    if(isDelivery(value.op)) {
      const delivery=state.delivery||{content:'',revision:0};
      if(!Number.isSafeInteger(value.revision)||value.revision!==delivery.revision)
        return {error:'今日交付已被更新，请查看最新内容后再操作。'};
      request.revision=value.revision;
      if(value.op==='clear_delivery')return request;
      if(value.op==='edit_delivery')return isEditing(delivery)?{error:'今日交付已在编辑中，请在输入框填写后提交。'}:request;
      if(!isEditing(delivery))return {error:'请先点击今日交付的“编辑”，再修改提交。'};
      const content=e.action.form_value?.delivery_content;
      if(typeof content!=='string'||!content.trim()||content.length>MAX_CONTENT)
        return {error:`请填写今日交付（${MAX_CONTENT}字内），再提交。`};
      request.content=content.trim();return request;
    }
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
    // Backoff is normal queueing, not an unknown result. Keep accepting other
    // rows up to the existing durable queue limit while recovery is scheduled.
    if(s.pending&&!this.processing&&s.pending.recovery?.status!=='retrying')
      return toast(s.pending.recovery?.status==='rejected'
        ?`飞书拒绝更新（${s.pending.recovery.code}），提交已保留但尚未保存；请联系维护者。`
        :'上次保存结果待确认，队列已保留；请联系维护者处理后再提交。','warning');
    const requests=s.requests||[];
    if(requests.some(r=>r.event===request.event||requestTarget(r)===requestTarget(request)))
      return toast(s.pending?.recovery?.status==='retrying'
        ?'飞书暂时忙，已保留提交并自动重试；本行刷新后才表示保存完成。'
        :'这一行已有操作排队或正在保存，请等本行刷新后再操作。','warning');
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
    if(['edit','edit_delivery'].includes(request.kind))return toast('正在打开编辑，请等输入框出现后修改并提交。');
    if(isDelivery(request.kind))return toast(request.kind==='clear_delivery'
      ?'清空已排队，请等今日交付刷新。':'已排队，今日交付刷新后才表示提交完成。');
    return toast(request.kind==='add'?'添加已排队，请等待你的行出现。':request.kind==='delete'
      ?'删除已排队，请等该行消失。':'已排队，请勿重复点击；本行刷新后才表示保存完成。');
  }
  queueFits(state,requests) {
    let rows=state.rows,delivery=state.delivery||{content:'',revision:0};
    // Reserve capacity for every accepted edit, including the in-flight one.
    // The placeholder has the same byte length as a generated row ID; it is
    // only used for size estimation, never saved or sent to Feishu.
    for(const r of requests) {
      if(isDelivery(r.kind))delivery={content:r.kind==='edit_delivery'?delivery.content:r.kind==='clear_delivery'?'':r.content,
        editing:r.kind!=='save_delivery',revision:delivery.revision+1};
      else if(r.kind==='delivery_result')rows=rows.map(row=>row.id===r.row&&row.deliveryResult?.submissionId===r.result.submissionId
        ?{...row,deliveryResult:r.result}:row);
      else if(r.kind==='add')rows=[...rows,{id:'r000000000000',owner:r.owner,section:r.section,content:'',revision:0}];
      else if(r.kind==='delete')rows=rows.filter(row=>row.id!==r.row);
      else rows=rows.map(row=>row.id===r.row?this.changedRow(row,r,'00000000-0000-0000-0000-000000000000'):row);
    }
    return cardBudget(rows,delivery,this.autoDelivery).valid;
  }
  changedRow(row,request,submissionId) {
    if(request.kind==='edit')return {...row,editing:true,revision:row.revision+1};
    return {...row,content:request.content,editing:false,revision:row.revision+1,
      deliveryResult:this.ai?{submissionId,policyVersion:this.ai.policyVersion,status:'pending',
        tasks:row.deliveryResult?.tasks||extractDelivery(row.content)}:undefined};
  }
  pumpAi() {
    if(!this.ai||this.aiRunning||this.stopped||this.fault||this.preparing||!this.nextAiRow())return;
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
      const result={submissionId,policyVersion:this.ai.policyVersion,status,tasks};
      s.requests=[...(s.requests||[]),{kind:'delivery_result',row:row.id,owner:row.owner,
        event:hash('delivery:'+submissionId),result}];
      this.store.put(s);this.pump();
    }
  }
  pump() {
    if(this.processing||this.fault||this.preparing||this.stopped)return;
    const s=this.store.get();
    if(s.pending) {
      const recovery=s.pending.recovery;
      if(recovery?.status!=='retrying')return;
      if(recovery.nextAt>this.now()) {
        if(!this.retryTimer) {
          this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.pump();},recovery.nextAt-this.now());
          this.retryTimer.unref?.();
        }
        return;
      }
    }else if(!(s.requests||[]).length)return;
    clearTimeout(this.retryTimer);this.retryTimer=null;
    this.processing=true;
    this.queue=this.drain()
      .catch(e=>{this.fault=true;this.record('MEETING_FAULT',diagnosis(e,'CALLBACK'));})
      .finally(()=>{
        this.processing=false;
        // handle()/AI can enqueue after drain's final empty read but before
        // this finally. Recheck both queues; pump's pending guard prevents spin.
        this.pump();this.pumpAi();
      });
  }
  async drain() {
    while(!this.fault&&!this.stopped) {
      const s=this.store.get(),request=s.requests?.[0];
      if(s.pending) {
        if(s.pending.recovery?.status!=='retrying'||s.pending.recovery.nextAt>this.now())return;
        if(!await this.flush())return;
        continue;
      }
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
    if(isDelivery(request.kind)) {
      if(this.autoDelivery)return this.finishRequest(request,'MANUAL_DELIVERY_DISABLED');
      const previous=s.delivery||{content:'',revision:0};
      if(previous.revision!==request.revision)return this.finishRequest(request,'STALE_DELIVERY_REJECTED');
      const delivery={content:request.kind==='edit_delivery'?previous.content:request.kind==='clear_delivery'?'':request.content,
        editing:request.kind!=='save_delivery',revision:previous.revision+1};
      if(!cardBudget(s.rows,delivery,false).valid)return this.finishRequest(request,'CARD_SIZE_LIMIT');
      s.pending={kind:request.kind,delivery,event:request.event,uuid:randomUUID(),sequence:s.sequence+1};
      this.store.put(s);return this.flush();
    }
    let row;
    if(request.kind==='delivery_result') {
      if(!this.autoDelivery)return this.finishRequest(request,'AUTO_DELIVERY_DISABLED');
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
    if(!cardBudget(nextRows,s.delivery,this.autoDelivery).valid)return this.finishRequest(request,'CARD_SIZE_LIMIT');
    s.pending={kind:request.kind,row,event:request.event,uuid:randomUUID(),sequence:s.sequence+1};
    this.store.put(s);return this.flush();
  }
  async flush() {
    let s=this.store.get();const p=s.pending;
    if(!p)return true;
    const attempts=(p.recovery?.attempts||0)+1;
    // Persist 'unknown' before each network attempt: a process crash or timeout
    // must never inherit the previous known-rejection retry permission.
    s.pending.recovery={status:'unknown',attempts};this.store.put(s);
    const nextRows=isDelivery(p.kind)?s.rows:p.kind==='add'?[...s.rows,p.row]:p.kind==='delete'
      ?s.rows.filter(row=>row.id!==p.row.id):s.rows.map(row=>row.id===p.row.id?p.row:row);
    let reply;
    try{reply=isDelivery(p.kind)?await this.api.updateDelivery(s.cardId,p,manualDeliveryElement(p.delivery)):
      p.kind==='delivery_result'?await this.api.updateSummary(s.cardId,p,deliveryElement(nextRows)):
      this.autoDelivery&&['save','delete'].includes(p.kind)?await this.api.updateRowAndSummary(s.cardId,p,rowElement(p.row),deliveryElement(nextRows)):
        await this.api.updateRow(s.cardId,p,rowElement(p.row));}
    catch(e){this.record('UPDATE_UNCONFIRMED',diagnosis(e,'CALLBACK'));return false;}
    if(reply?.code!==0) {
      // UUID conflict is NOT proof of a successful update. Keep the exact intent
      // and fail closed rather than incrementing sequence or creating duplicates.
      s=this.store.get();
      if(s.pending?.uuid!==p.uuid||s.pending.sequence!==p.sequence)throw new Error('PENDING_CHANGED');
      const code=Number.isSafeInteger(reply?.code)?reply.code:null;
      const retrying=code===200810;
      const unknown=code===null||[200770,300317].includes(code);
      const recovery={status:retrying?'retrying':unknown?'unknown':'rejected',attempts};
      if(code!==null)recovery.code=code;
      if(retrying)recovery.nextAt=this.now()+this.retryDelays[Math.min(attempts-1,this.retryDelays.length-1)];
      s.pending.recovery=recovery;this.store.put(s);
      this.record(retrying?'UPDATE_RETRY_SCHEDULED':unknown?'UPDATE_UNCONFIRMED':'UPDATE_REJECTED',
        `code=${code===null?'missing':code}; attempts=${attempts}${retrying?`; delay_ms=${recovery.nextAt-this.now()}`:''}`);
      return false;
    }
    // New callbacks may append requests while the API call is in flight. Merge
    // into the latest state so completing one update cannot erase those requests.
    s=this.store.get();
    if(s.pending?.uuid!==p.uuid||s.pending.sequence!==p.sequence)throw new Error('PENDING_CHANGED');
    if(isDelivery(p.kind))s.delivery=p.delivery;
    else s.rows=p.kind==='add'?[...s.rows,p.row]:p.kind==='delete'
      ?s.rows.filter(r=>r.id!==p.row.id):s.rows.map(r=>r.id===p.row.id?p.row:r);
    s.sequence=p.sequence;s.events=[...s.events,p.event].slice(-256);s.pending=null;
    s.requests=(s.requests||[]).filter(r=>r.event!==p.event);
    this.store.put(s);
    this.pumpAi();
    if(isDelivery(p.kind)) {
      this.record(p.kind==='edit_delivery'?'DELIVERY_EDITING':p.kind==='clear_delivery'?'DELIVERY_CLEARED':'DELIVERY_SAVED',
        `same_message=true; fields=${p.kind==='edit_delivery'?0:1}`);
      return true;
    }
    if(p.kind==='delivery_result') {
      this.record('DELIVERY_SUMMARY_UPDATED',`same_message=true; tasks=${p.row.deliveryResult.tasks.length}; status=${p.row.deliveryResult.status}`);
      return true;
    }
    this.record(p.kind==='edit'?'ROW_EDITING':p.kind==='add'?'ROW_ADDED':p.kind==='delete'?'ROW_DELETED':'ROW_SAVED',
      `rows=${s.rows.length}; same_message=true; fields=${p.kind==='save'?1:0}`);
    return true;
  }
  async stop(){
    this.stopped=true;clearTimeout(this.retryTimer);this.retryTimer=null;
    await this.aiWork;await this.queue;
    // In-flight update completes; not-yet-started requests remain durable for
    // restart. A long retry cooldown must not prevent graceful shutdown.
  }
}
module.exports={MeetingService};
