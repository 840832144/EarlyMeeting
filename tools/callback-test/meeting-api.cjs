'use strict';
function createApi(config,Lark,transport=Lark.defaultHttpInstance) {
  const silent=Object.fromEntries(['trace','debug','info','warn','error'].map(k=>[k,()=>{}]));
  // The SDK token manager uses post(), while resource APIs use request().
  const http={request:r=>transport.request({...r,timeout:20000}),
    post:(url,data)=>transport.request({method:'POST',url,data,timeout:20000})};
  const client=new Lark.Client({appId:config.appId,appSecret:config.appSecret,
    domain:Lark.Domain.Feishu,logger:silent,httpInstance:http});
  const call=async promise=>{
    try{return await promise;}catch(e){
      const rejected=e?.response?.data;
      if(rejected&&Number.isInteger(rejected.code)&&rejected.code!==0)return {code:rejected.code};
      throw e;
    }
  };
  return {
    createCard:card=>call(client.cardkit.v1.card.create({data:{type:'card_json',data:JSON.stringify(card)}})),
    updateLayout:(cardId,p,card)=>call(client.cardkit.v1.card.update({path:{card_id:cardId},
      data:{uuid:p.uuid,sequence:p.sequence,card:{type:'card_json',data:JSON.stringify(card)}}})),
    updateRowAndSummary:(cardId,p,element,summary)=>call(client.cardkit.v1.card.batchUpdate({path:{card_id:cardId},
      data:{uuid:p.uuid,sequence:p.sequence,actions:JSON.stringify([
        p.kind==='delete'?{action:'delete_elements',params:{element_ids:[p.row.id]}}:
          {action:'update_element',params:{element_id:p.row.id,element}},
        {action:'update_element',params:{element_id:'delivery_summary',element:summary}},
      ])}})),
    updateSummary:(cardId,p,summary)=>call(client.cardkit.v1.cardElement.update({path:{card_id:cardId,element_id:'delivery_summary'},
      data:{uuid:p.uuid,sequence:p.sequence,element:JSON.stringify(summary)}})),
    updateDelivery:(cardId,p,element)=>call(client.cardkit.v1.cardElement.update({path:{card_id:cardId,element_id:'delivery_form'},
      data:{uuid:p.uuid,sequence:p.sequence,element:JSON.stringify(element)}})),
    sendCard:(cardId,uuid)=>call(client.im.message.create({params:{receive_id_type:'chat_id'},
      data:{receive_id:config.chatId,msg_type:'interactive',uuid,
        content:JSON.stringify({type:'card',data:{card_id:cardId}})}})),
    updateRow:(cardId,p,element)=>p.kind==='add'
      ? call(client.cardkit.v1.cardElement.create({path:{card_id:cardId},data:{type:'insert_before',
        target_element_id:`add_${p.row.section}`,uuid:p.uuid,sequence:p.sequence,elements:JSON.stringify([element])}}))
      : p.kind==='delete'
      ? call(client.cardkit.v1.cardElement.delete({path:{card_id:cardId,element_id:p.row.id},
        data:{uuid:p.uuid,sequence:p.sequence}}))
      : call(client.cardkit.v1.cardElement.update({path:{card_id:cardId,element_id:p.row.id},
        data:{uuid:p.uuid,sequence:p.sequence,element:JSON.stringify(element)}})),
  };
}
module.exports={createApi};
