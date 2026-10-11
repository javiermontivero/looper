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
  const sounds=ids.map(id=>presets.find(p=>p.id===id)).filter(Boolean),pages=[];
  for(let start=0;start<sounds.length;start+=64){
   const number=start/64+1;
   pages.push({id:number===1?role.id:role.id+':'+number,presets:sounds.slice(start,start+64)});
  }
  return {...role,presets:sounds,pages};
 }).filter(role=>role.pages.length);
}
// One MIDI step of hysteresis avoids alternating at a boundary; endpoints always work.
export function potIndex(value,length,current=-1){
 if(!Number.isFinite(value)||length<1)return current;
 const v=Math.max(0,Math.min(127,value)),width=128/length,hysteresis=Math.min(1,Math.max(0,(width-1)/2));
 if(v===0)return 0;if(v===127)return length-1;
 if(current>=0&&current<length&&v>=current*width-hysteresis&&v<(current+1)*width+hysteresis)return current;
 return Math.min(length-1,Math.floor(v/width));
}
export class SoundBrowser{
 constructor(presets,{presetId,roleId,remembered={},rememberedPages={}}={}){
  remembered=remembered||{};rememberedPages=rememberedPages||{};
  this.presets=presets;this.roles=buildRoles(presets);
  this.remembered={};this.rememberedPages={};
  for(const role of this.roles){
   this.rememberedPages[role.id]=Number.isInteger(rememberedPages[role.id])&&role.pages[rememberedPages[role.id]]?rememberedPages[role.id]:0;
   for(const page of role.pages)this.remembered[page.id]=page.presets.some(p=>p.id===remembered[page.id])?remembered[page.id]:page.presets[0].id;
  }
  const saved=this.roles.findIndex(r=>r.id===roleId?.split(':')[0]&&r.presets.some(p=>p.id===presetId));
  this.roleIndex=saved>=0?saved:Math.max(0,this.roles.findIndex(r=>r.presets.some(p=>p.id===presetId)));
  this.choose(presetId);
 }
 get role(){return this.roles[this.roleIndex];}
 get pageIndex(){return this.rememberedPages[this.role.id];}
 get page(){return this.role.pages[this.pageIndex];}
 get preset(){return this.page.presets.find(p=>p.id===this.remembered[this.page.id])||this.page.presets[0];}
 choose(id){
  if(!this.role.presets.some(p=>p.id===id)){
   const index=this.roles.findIndex(r=>r.presets.some(p=>p.id===id));if(index<0)return false;
   this.roleIndex=index;
  }
  this.rememberedPages[this.role.id]=this.role.pages.findIndex(page=>page.presets.some(p=>p.id===id));
  this.remembered[this.page.id]=id;return true;
 }
 selectRole(index){if(!Number.isInteger(index)||!this.roles[index])return false;const changed=this.roleIndex!==index;this.roleIndex=index;return changed;}
 selectPage(index){if(!Number.isInteger(index)||!this.role.pages[index])return false;const changed=this.pageIndex!==index;this.rememberedPages[this.role.id]=index;return changed;}
 turnRole(value){return this.selectRole(potIndex(value,this.roles.length,this.roleIndex));}
 turnPage(value){return this.selectPage(potIndex(value,this.role.pages.length,this.pageIndex));}
 turnSound(value){
  const list=this.page.presets,current=list.indexOf(this.preset),index=potIndex(value,list.length,current);
  if(index===current||!list[index])return false;return this.choose(list[index].id);
 }
}
