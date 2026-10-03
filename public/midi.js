export function decode(data){
 if(!data||data.length<2)return null;
 const status=data[0],kind=status&240,channel=status&15;
 if(status<128||status>=240)return null;
 if([128,144,176,224].includes(kind)&&data.length<3)return null;
 const number=data[1],value=data[2]||0;
 if(number>127||value>127)return null;
 if(kind===144)return{type:value?'on':'off',channel,number,value};
 if(kind===128)return{type:'off',channel,number,value};
 if(kind===176)return{type:'cc',channel,number,value};
 if(kind===224)return{type:'bend',channel,value:number+(value<<7)};
 return null;
}
export function matches(mapping,event,device){
 return !!mapping&&mapping.device===device&&mapping.channel===event.channel&&mapping.number===event.number&&((mapping.type==='note'&&(event.type==='on'||event.type==='off'))||(mapping.type==='cc'&&event.type==='cc'));
}
export function learnMapping(action,event,device){
 if(action==='volume'&&event.type!=='cc')return null;
 if(event.type!=='cc'&&event.type!=='on')return null;
 if(event.type==='cc'&&[64,120,121,123].includes(event.number))return null;
 return{device,channel:event.channel,number:event.number,type:event.type==='cc'?'cc':'note'};
}
