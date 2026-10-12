// Musical roles deliberately mix sample libraries and synthesis engines.
export const SOUND_ROLES=[
 {id:'rhythm',name:'Base rítmica',presets:['drums','marimba']},
 {id:'bass',name:'Bajos',presets:['bass','sub','rubber']},
 {id:'accompaniment',name:'Acompañamiento',presets:['piano','wurlitzer','guitar','velvet','organ','pluck']},
 {id:'background',name:'Fondos',presets:['strings','night','halo','haze','organ']},
 {id:'melody',name:'Melodías',presets:['piano','wurlitzer','guitar','strings','glass','neon','arcade','reed']},
 {id:'texture',name:'Acentos y texturas',presets:['marimba','glass','pluck','halo','arcade']}
];
export function buildRoles(presets){
 return SOUND_ROLES.map(role=>{
  const ids=[...new Set([...role.presets,...presets.filter(p=>p.roles?.includes(role.id)).map(p=>p.id)])];
  return {...role,presets:ids.map(id=>presets.find(p=>p.id===id)).filter(Boolean)};
 }).filter(role=>role.presets.length);
}
export class SoundBrowser{
 constructor(presets,{presetId,roleId,remembered={}}={}){
  this.presets=presets;this.roles=buildRoles(presets);this.remembered={};
  for(const role of this.roles){
   const saved=Object.entries(remembered||{}).find(([key,id])=>key.split(':')[0]===role.id&&role.presets.some(p=>p.id===id));
   this.remembered[role.id]=saved?.[1]||role.presets[0].id;
  }
  const saved=this.roles.findIndex(r=>r.id===roleId?.split(':')[0]&&r.presets.some(p=>p.id===presetId));
  this.roleIndex=saved>=0?saved:Math.max(0,this.roles.findIndex(r=>r.presets.some(p=>p.id===presetId)));
  this.choose(presetId);
 }
 get role(){return this.roles[this.roleIndex];}
 get preset(){return this.role.presets.find(p=>p.id===this.remembered[this.role.id])||this.role.presets[0];}
 choose(id){
  if(!this.role.presets.some(p=>p.id===id)){
   const index=this.roles.findIndex(r=>r.presets.some(p=>p.id===id));if(index<0)return false;
   this.roleIndex=index;
  }
  this.remembered[this.role.id]=id;return true;
 }
 selectRole(index){if(!Number.isInteger(index)||!this.roles[index])return false;const changed=this.roleIndex!==index;this.roleIndex=index;return changed;}
 step(control,direction){
  if(!direction)return false;
  const delta=Math.sign(direction);
  if(control==='role')return this.selectRole(Math.max(0,Math.min(this.roles.length-1,this.roleIndex+delta)));
  if(control==='sound'){
   const list=this.role.presets,current=list.indexOf(this.preset),index=Math.max(0,Math.min(list.length-1,current+delta));
   return index!==current&&this.choose(list[index].id);
  }
  return false;
 }
}
 // Interpret accumulating absolute CC values as one navigation step per message.
export class RelativePots{
 constructor(){this.previous=new Map();}
 reset(){this.previous.clear();}
 step(key,value){
  if(!Number.isInteger(value)||value<0||value>127)return 0;
  const previous=this.previous.get(key);this.previous.set(key,value);
  if(previous===undefined)return 0;
  return Math.sign(value-previous)||(value===127?1:value===0?-1:0);
 }
}
