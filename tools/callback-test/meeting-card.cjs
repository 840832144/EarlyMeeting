'use strict';
const MAX_ROWS = 20;
const MAX_CONTENT = 300;
const MAX_ROLE = 24;
const plain = content => ({tag:'plain_text',content});
const callback = value => [{type:'callback',value}];
const textEscape=value=>value.replace(/[&<>*_\[\]`~]/g,c=>'&#'+c.charCodeAt(0)+';');

const column=(weight,elements)=>({tag:'column',width:'weighted',weight,
  vertical_align:'top',elements});
const columns=elements=>({tag:'column_set',horizontal_spacing:'12px',flex_mode:'none',columns:elements});
// A shared form keeps 20 three-column rows within the 200-component limit.
// A row button identifies the only pair of fields the server may persist.
function rowElement(row) {
  return { ...columns([
    column(1,[{tag:'markdown',content:`<at id=${row.owner}></at>`}]),
    column(1,[{tag:'markdown',content:textEscape(row.department||'部门待同步')}]),
    column(3,[{tag:'input',name:`content_${row.id}`,width:'fill',
        input_type:'multiline_text',rows:2,auto_resize:true,max_rows:6,
        max_length:MAX_CONTENT,default_value:row.content},
      {tag:'button',name:`save_${row.id}`,type:'primary',size:'small',
        text:plain(row.revision ? '已保存 · 再保存' : '保存本行'),
        form_action_type:'submit',behaviors:callback({op:'save',row:row.id,revision:row.revision})}]),
  ]),element_id:row.id};
}

function meetingCard(rows = []) {
  return {schema:'2.0',config:{update_multi:true,enable_forward:false},
    header:{template:'blue',title:plain('今日晨会记')},
    body:{elements:[
      {tag:'markdown',content:'每人添加一行，填写后点“保存本行”。'},
      {tag:'form',name:'meeting_form',element_id:'meeting_form',elements:[
        columns([column(1,[{tag:'markdown',content:'**人员**'}]),
          column(1,[{tag:'markdown',content:'**部门**'}]),column(3,[{tag:'markdown',content:'**晨会内容**'}])]),
        ...rows.map(rowElement),
        {tag:'button',element_id:'add_my_row',name:'add_my_row',type:'default',form_action_type:'submit',
          text:plain('＋ 添加我的一行'),behaviors:callback({op:'add'})},
      ]},
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
module.exports={meetingCard,rowElement,cardBudget,MAX_ROWS,MAX_CONTENT,MAX_ROLE};
