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
 if(action!=='volume'&&event.type==='cc'&&event.value===0)return null;
 if(event.type==='cc'&&[64,120,121,123].includes(event.number))return null;
 return{device,channel:event.channel,number:event.number,type:event.type==='cc'?'cc':'note'};
}

export function buttonDown(event){
 return event.type==='on'||(event.type==='cc'&&event.value>0);
}

// A momentary MIDI button sends a nonzero value on press and zero on release.
// Queue actions so a quick second press cannot overtake AudioWorklet startup.
export class TrackButtons{
 constructor(dispatch,{holdMs=1000,schedule=setTimeout,cancel=clearTimeout,onError=()=>{}}={}){
  this.dispatch=dispatch;this.holdMs=holdMs;this.schedule=schedule;this.cancel=cancel;
  this.onError=onError;this.held=new Map();this.pending=Promise.resolve();this.generation=0;
 }
 enqueue(type,track){
  const generation=this.generation;
  this.pending=this.pending.then(()=>{if(generation===this.generation)return this.dispatch(type,track);}).catch(this.onError);
 }
 suppress(track){this.release(track);this.held.set(track,null);}
 release(track){if(this.held.has(track)){this.cancel(this.held.get(track));this.held.delete(track);}}
 handle(track,down){
  if(!down){this.release(track);return;}
  if(this.held.has(track))return;
  this.enqueue('trigger',track);
  this.held.set(track,this.schedule(()=>{
   if(this.held.has(track)){this.held.set(track,null);this.enqueue('clear',track);}
  },this.holdMs));
 }
 reset(){
  for(const track of this.held.keys())this.release(track);
  this.generation++;
 }
}
