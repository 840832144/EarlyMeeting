'use strict';
const MAX_ROWS = 20;
const MAX_CONTENT = 300;
const SECTIONS = {planning:'策划',engineering:'程序'};
const plain = content => ({tag:'plain_text',content});
const callback = value => [{type:'callback',value}];
const label=(content,width)=>({tag:'div',width,margin:'0px',
  text:{tag:'lark_md',content}});
const flow={direction:'horizontal',horizontal_spacing:'8px',vertical_spacing:'4px',
  horizontal_align:'left',vertical_align:'center',padding:'0px',margin:'0px'};

// A horizontal root form keeps identity, content and both actions on one line.
// Avoid extra column wrappers so 20 rows stay within the 200-element budget.
function rowElement(row) {
  return {tag:'form',element_id:row.id,name:row.id,...flow,elements:[
    label(`<at id=${row.owner}></at>`,'80px'),
    {tag:'input',name:`content_${row.id}`,width:'fill',required:false,margin:'0px',
      input_type:'multiline_text',rows:1,auto_resize:true,max_rows:6,
      max_length:MAX_CONTENT,default_value:row.content},
    {tag:'button',name:`save_${row.id}`,type:'primary',size:'small',margin:'0px',
      text:plain('重新保存'),form_action_type:'submit',
      behaviors:callback({op:'save',row:row.id,revision:row.revision})},
    {tag:'button',name:`delete_${row.id}`,type:'default',size:'small',margin:'0px',
      text:plain('删除本行'),form_action_type:'submit',
      behaviors:callback({op:'delete',row:row.id,revision:row.revision})},
  ]};
}

function sectionElements(section,rows) {
  return [
    {tag:'markdown',content:`**${SECTIONS[section]}**`,text_size:'heading-1',margin:'8px 0px 0px 0px'},
    {tag:'column_set',horizontal_spacing:'8px',flex_mode:'none',margin:'0px',columns:[
      {tag:'column',width:'80px',elements:[{tag:'markdown',content:'**人员**'}]},
      {tag:'column',width:'weighted',weight:1,elements:[{tag:'markdown',content:'**晨会内容**'}]},
      {tag:'column',width:'152px',elements:[{tag:'markdown',content:'**操作**'}]},
    ]},
    ...rows.filter(row=>row.section===section).map(rowElement),
    {tag:'button',element_id:`add_${section}`,type:'default',size:'small',
      text:plain('＋ 添加我的一行'),behaviors:callback({op:'add',section})},
  ];
}

function meetingCard(rows = []) {
  return {schema:'2.0',config:{update_multi:true,enable_forward:false},
    header:{template:'blue',title:plain('今日晨会记')},
    body:{vertical_spacing:'4px',elements:[
      ...sectionElements('planning',rows),
      {tag:'hr'},
      ...sectionElements('engineering',rows),
    ]}};
}

function cardBudget(rows) {
  const card=meetingCard(rows);
  let components=0;
  function walk(x) {if(!x||typeof x!=='object')return;if(typeof x.tag==='string')components++;
    for(const value of Object.values(x))walk(value);}
  walk(card);
  const bytes=Buffer.byteLength(JSON.stringify(card));
  return {components,bytes,valid:rows.length<=MAX_ROWS && components<=200 && bytes<=30000};
}
module.exports={meetingCard,rowElement,cardBudget,MAX_ROWS,MAX_CONTENT,SECTIONS};
