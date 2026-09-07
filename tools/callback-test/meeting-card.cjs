'use strict';
const MAX_ROWS = 20;
const MAX_CONTENT = 300;
const SECTIONS = {planning:'策划',engineering:'程序'};
const plain = content => ({tag:'plain_text',content});
const callback = value => [{type:'callback',value}];

const column=(weight,elements)=>({tag:'column',width:'weighted',weight,
  vertical_align:'top',elements});
const columns=elements=>({tag:'column_set',horizontal_spacing:'12px',flex_mode:'none',columns:elements});
// Two columns allow one independent form per row, within CardKit's element limit.
function rowElement(row) {
  return {tag:'form',element_id:row.id,name:row.id,elements:[columns([
    column(1,[{tag:'markdown',content:`<at id=${row.owner}></at>`}]),
    column(4,[{tag:'input',name:`content_${row.id}`,width:'fill',required:true,
        input_type:'multiline_text',rows:2,auto_resize:true,max_rows:6,
        max_length:MAX_CONTENT,default_value:row.content},
      {tag:'button',name:`save_${row.id}`,type:'primary',size:'small',
        text:plain(row.revision ? '已保存 · 再保存' : '保存本行'),
        form_action_type:'submit',behaviors:callback({op:'save',row:row.id,revision:row.revision})}]),
  ])]};
}

function sectionElements(section,rows) {
  return [
    {tag:'markdown',content:`### ${SECTIONS[section]}`},
    columns([column(1,[{tag:'markdown',content:'**人员**'}]),column(4,[{tag:'markdown',content:'**晨会内容**'}])]),
    ...rows.filter(row=>row.section===section).map(rowElement),
    {tag:'button',element_id:`add_${section}`,type:'default',
      text:plain('＋ 添加我的一行'),behaviors:callback({op:'add',section})},
  ];
}

function meetingCard(rows = []) {
  return {schema:'2.0',config:{update_multi:true,enable_forward:false},
    header:{template:'blue',title:plain('今日晨会记')},
    body:{elements:[
      {tag:'markdown',content:'在所属区域添加本人行，填写后点“保存本行”。'},
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
