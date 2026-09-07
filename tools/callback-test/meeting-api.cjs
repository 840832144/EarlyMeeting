'use strict';
function createApi(config,Lark,transport=Lark.defaultHttpInstance) {
  const silent=Object.fromEntries(['trace','debug','info','warn','error'].map(k=>[k,()=>{}]));
  // The SDK token manager uses post(), while resource APIs use request().
  const http={request:r=>transport.request({...r,timeout:8000}),
    post:(url,data)=>transport.request({method:'POST',url,data,timeout:8000})};
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
    async departmentForOwner(owner) {
      const user=await call(client.contact.v3.user.get({path:{user_id:owner},
        params:{user_id_type:'open_id',department_id_type:'open_department_id'}}));
      if(user?.code!==0)return {status:'unavailable',code:user?.code||0,phase:'USER'};
      const ids=user.data?.user?.department_ids;
      if(!Array.isArray(ids))return {status:'unavailable',code:0,phase:'USER_FIELD'};
      if(!ids.length)return {status:'empty',name:'未设置部门',code:0};
      if(ids.length>10)return {status:'unavailable',code:0,phase:'DEPARTMENT_COUNT'};
      const names=[];
      for(const id of [...new Set(ids)]) {
        if(typeof id!=='string'||id.length>100)return {status:'unavailable',code:0,phase:'DEPARTMENT_ID'};
        const reply=await call(client.contact.v3.department.get({path:{department_id:id},
          params:{department_id_type:'open_department_id',user_id_type:'open_id'}}));
        if(reply?.code!==0)return {status:'unavailable',code:reply?.code||0,phase:'DEPARTMENT'};
        const name=reply.data?.department?.name;
        if(typeof name!=='string'||!name.trim())return {status:'unavailable',code:0,phase:'DEPARTMENT_NAME'};
        names.push(name.trim());
      }
      const name=[...new Set(names)].join('、');
      if(name.length>160)return {status:'unavailable',code:0,phase:'DEPARTMENT_LENGTH'};
      return {status:'ok',name,code:0};
    },
    createCard:card=>call(client.cardkit.v1.card.create({data:{type:'card_json',data:JSON.stringify(card)}})),
    updateLayout:(cardId,p,card)=>call(client.cardkit.v1.card.update({path:{card_id:cardId},
      data:{uuid:p.uuid,sequence:p.sequence,card:{type:'card_json',data:JSON.stringify(card)}}})),
    sendCard:(cardId,uuid)=>call(client.im.message.create({params:{receive_id_type:'chat_id'},
      data:{receive_id:config.chatId,msg_type:'interactive',uuid,
        content:JSON.stringify({type:'card',data:{card_id:cardId}})}})),
    updateRow:(cardId,p,element)=>p.kind==='add'
      ? call(client.cardkit.v1.cardElement.create({path:{card_id:cardId},data:{type:'insert_before',
        target_element_id:'add_my_row',uuid:p.uuid,sequence:p.sequence,elements:JSON.stringify([element])}}))
      : call(client.cardkit.v1.cardElement.update({path:{card_id:cardId,element_id:p.row.id},
        data:{uuid:p.uuid,sequence:p.sequence,element:JSON.stringify(element)}})),
  };
}
module.exports={createApi};
