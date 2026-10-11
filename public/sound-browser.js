// Musical roles deliberately mix sample libraries and synthesis engines.
export const SOUND_ROLES=[
 {id:'rhythm',name:'Base rítmica',presets:['drums','marimba']},
 {id:'bass',name:'Bajos',presets:['bass','sub','rubber']},
 {id:'accompaniment',name:'Acompañamiento',presets:['piano','wurlitzer','guitar','velvet','organ','pluck']},
 {id:'background',name:'Fondos',presets:['strings','night','halo','haze','organ']},
 {id:'melody',name:'Melodías',presets:['piano','wurlitzer','guitar','strings','glass','neon','arcade','reed']},
 {id:'texture',name:'Acentos y texturas',presets:['marimba','glass','pluck','halo','arcade']}
];
// One MIDI step of hysteresis avoids alternating at a boundary; endpoints always work.
export function potIndex(value,length,current=-1){
 if(!Number.isFinite(value)||length<1)return current;
 const v=Math.max(0,Math.min(127,value)),width=128/length;
 if(v===0)return 0;if(v===127)return length-1;
 if(current>=0&&current<length&&v>=current*width-1&&v<(current+1)*width+1)return current;
 return Math.min(length-1,Math.floor(v/width));
}
export class SoundBrowser{
 constructor(presets,{presetId,roleId,remembered={}}={}){
  this.presets=presets;this.roles=SOUND_ROLES.map(r=>({...r,presets:r.presets.map(id=>presets.find(p=>p.id===id)).filter(Boolean)})).filter(r=>r.presets.length);
  this.remembered={};
  for(const r of this.roles)this.remembered[r.id]=r.presets.some(p=>p.id===remembered?.[r.id])?remembered[r.id]:r.presets[0].id;
  const saved=this.roles.findIndex(r=>r.id===roleId&&r.presets.some(p=>p.id===presetId));
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
 turnRole(value){return this.selectRole(potIndex(value,this.roles.length,this.roleIndex));}
 turnSound(value){
  const list=this.role.presets,current=list.indexOf(this.preset),index=potIndex(value,list.length,current);
  if(index===current||!list[index])return false;return this.choose(list[index].id);
 }
}
