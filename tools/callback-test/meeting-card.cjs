'use strict';
const {deliverySummary}=require('./meeting-delivery.cjs');
const MAX_ROWS = 20;
const MAX_CONTENT = 300;
const LAYOUT_VERSION = 13;
const layoutVersion = config => config.deliveryAiEnabled===true?LAYOUT_VERSION:12;
const SECTIONS = {planning:'策划',engineering:'程序'};
const plain = content => ({tag:'plain_text',content});
const callback = value => [{type:'callback',value}];
const label=(content,width)=>({tag:'div',width,margin:'0px',
  text:{tag:'lark_md',content}});
const flow={direction:'horizontal',horizontal_spacing:'8px',vertical_spacing:'4px',
  horizontal_align:'left',vertical_align:'top',padding:'0px',margin:'0px'};
const isEditing=value=>!value.content.trim()||value.editing===true;
const savedText=(content,width)=>({tag:'div',width,margin:'0px',text:plain(content)});

// A horizontal root form keeps identity, content and both actions on one line.
// Avoid extra column wrappers; enforce the full-card budget before accepting work.
function rowElement(row) {
  const editing=isEditing(row);
  return {tag:'form',element_id:row.id,name:row.id,...flow,elements:[
    label(`<at id=${row.owner}></at>`,'80px'),
    editing?{tag:'input',name:`content_${row.id}`,width:'340px',required:false,margin:'0px',
      input_type:'multiline_text',rows:1,auto_resize:true,
      max_length:MAX_CONTENT,default_value:row.content}:savedText(row.content,'340px'),
    {tag:'button',name:`save_${row.id}`,type:'primary',size:'small',margin:'0px',
      text:plain(editing?'提交':'编辑'),form_action_type:'submit',
      behaviors:callback({op:editing?'save':'edit',row:row.id,revision:row.revision})},
    {tag:'button',name:`delete_${row.id}`,type:'default',size:'small',margin:'0px',
      text:plain('删除'),form_action_type:'submit',
      behaviors:callback({op:'delete',row:row.id,revision:row.revision})},
  ]};
}

function sectionElements(section,rows) {
  return [
    {tag:'markdown',content:`**${SECTIONS[section]}**`,text_size:'heading-1',margin:'8px 0px 0px 0px'},
    {tag:'column_set',horizontal_spacing:'8px',flex_mode:'none',margin:'0px',columns:[
      {tag:'column',width:'80px',elements:[{tag:'markdown',content:'**人员**'}]},
      {tag:'column',width:'340px',elements:[{tag:'markdown',content:'**晨会内容**'}]},
      {tag:'column',width:'92px',elements:[{tag:'markdown',content:'**操作**'}]},
    ]},
    ...rows.filter(row=>row.section===section).map(rowElement),
    {tag:'button',element_id:`add_${section}`,type:'default',size:'small',
      text:plain('＋ 添加我的一行'),behaviors:callback({op:'add',section})},
  ];
}

function deliveryElement(rows=[]) {
  return {tag:'markdown',element_id:'delivery_summary',content:deliverySummary(rows),margin:'0px'};
}

function manualDeliveryElement(delivery={content:'',revision:0}) {
  const editing=isEditing(delivery);
  return {tag:'form',element_id:'delivery_form',name:'delivery_form',...flow,elements:[
    editing?{tag:'input',name:'delivery_content',width:'428px',required:false,margin:'0px',
      input_type:'multiline_text',rows:1,auto_resize:true,max_length:MAX_CONTENT,
      default_value:delivery.content}:savedText(delivery.content,'428px'),
    {tag:'button',name:'delivery_submit',type:'primary',size:'small',margin:'0px',
      text:plain(editing?'提交':'编辑'),form_action_type:'submit',
      behaviors:callback({op:editing?'save_delivery':'edit_delivery',revision:delivery.revision})},
    {tag:'button',name:'delivery_delete',type:'default',size:'small',margin:'0px',
      text:plain('删除'),form_action_type:'submit',
      behaviors:callback({op:'clear_delivery',revision:delivery.revision})},
  ]};
}

function meetingCard(rows = [],delivery,autoDelivery=false) {
  return {schema:'2.0',config:{update_multi:true,enable_forward:false},
    header:{template:'blue',title:plain('今日晨会记')},
    body:{vertical_spacing:'4px',elements:[
      ...sectionElements('planning',rows),
      {tag:'hr'},
      ...sectionElements('engineering',rows),
      {tag:'hr'},
      {tag:'markdown',content:'**今日交付**',text_size:'heading-1',margin:'8px 0px 0px 0px'},
      ...(autoDelivery?[deliveryElement(rows)]:[
        {tag:'column_set',horizontal_spacing:'8px',flex_mode:'none',margin:'0px',columns:[
          {tag:'column',width:'428px',elements:[{tag:'markdown',content:'**交付内容**'}]},
          {tag:'column',width:'92px',elements:[{tag:'markdown',content:'**操作**'}]},
        ]},manualDeliveryElement(delivery),
      ]),
    ]}};
}

function cardBudget(rows,delivery,autoDelivery=false) {
  // Feishu counts text descriptors too. Reserve both input and display modes.
  const currentDelivery=delivery||{content:'',revision:0};
  const cards=[meetingCard(rows,delivery,autoDelivery),meetingCard(rows.map(row=>({...row,editing:true})),
    {...currentDelivery,editing:true},autoDelivery),
    meetingCard(rows.map(row=>({...row,content:row.content||'…',editing:false})),
      {...currentDelivery,content:currentDelivery.content||'…',editing:false},autoDelivery)];
  if(autoDelivery)cards.push(
    // Bound a later AI result before accepting the underlying submission.
    meetingCard(rows.map(row=>({...row,editing:true,deliveryResult:{status:'pending',
      tasks:row.content?[row.content+'；'.repeat(20)]:[]}})),delivery,true));
  const sizes=cards.map(card=>{
    let components=0;
    function walk(x) {if(!x||typeof x!=='object')return;
      if(typeof x.tag==='string')components++;
      for(const value of Object.values(x))walk(value);}
    walk(card);return {components,bytes:Buffer.byteLength(JSON.stringify(card))};
  });
  const components=Math.max(...sizes.map(s=>s.components)),bytes=Math.max(...sizes.map(s=>s.bytes));
  return {components,bytes,valid:rows.length<=MAX_ROWS && components<=200 && bytes<=30000};
}
module.exports={meetingCard,rowElement,deliveryElement,manualDeliveryElement,cardBudget,isEditing,layoutVersion,LAYOUT_VERSION,MAX_ROWS,MAX_CONTENT,SECTIONS};
