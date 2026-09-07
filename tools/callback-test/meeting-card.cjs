'use strict';
const MAX_ROWS = 20;
const MAX_CONTENT = 300;
const SECTIONS = {planning:'策划',engineering:'程序'};
const plain = content => ({tag:'plain_text',content});
const callback = value => [{type:'callback',value}];

const column=(weight,elements)=>({tag:'column',width:'weighted',weight,
  vertical_align:'top',elements});
const columns=elements=>({tag:'column_set',horizontal_spacing:'12px',flex_mode:'none',columns:elements});
// One root form per section keeps 20 rows (including delete buttons) within
// CardKit's 200-element limit. The server only uses the operator's own field.
function rowElement(row) {
  return {...columns([
    column(1,[{tag:'markdown',content:`<at id=${row.owner}></at>`}]),
    column(4,[{tag:'input',name:`content_${row.id}`,width:'fill',required:false,
        input_type:'multiline_text',rows:2,auto_resize:true,max_rows:6,
        max_length:MAX_CONTENT,default_value:row.content},
      {tag:'button',name:`save_${row.id}`,type:'primary',size:'small',
        text:plain(row.revision ? '已保存 · 再保存' : '保存本行'),
        form_action_type:'submit',behaviors:callback({op:'save',row:row.id,revision:row.revision})},
      {tag:'button',name:`delete_${row.id}`,type:'default',size:'small',text:plain('删除本行'),
        form_action_type:'submit',behaviors:callback({op:'delete',row:row.id,revision:row.revision})}]),
  ]),element_id:row.id};
}

function sectionElements(section,rows) {
  return [
    {tag:'markdown',content:`**${SECTIONS[section]}**`,text_size:'heading-1'},
    {tag:'form',name:`form_${section}`,elements:[
    columns([column(1,[{tag:'markdown',content:'**人员**'}]),column(4,[{tag:'markdown',content:'**晨会内容**'}])]),
    ...rows.filter(row=>row.section===section).map(rowElement),
    {tag:'button',element_id:`add_${section}`,name:`add_${section}`,type:'default',form_action_type:'submit',
      text:plain('＋ 添加我的一行'),behaviors:callback({op:'add',section})},
    ]},
  ];
}

function meetingCard(rows = []) {
  return {schema:'2.0',config:{update_multi:true,enable_forward:false},
    header:{template:'blue',title:plain('今日晨会记')},
    body:{elements:[
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
