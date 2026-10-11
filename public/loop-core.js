// Sample-clock transport. Only live instrument input is captured.
const emptyTrack=()=>({data:null,length:0,position:0,edge:0,hasAudio:false,muted:false,gain:1,mode:'empty'});
export class LoopCore {
 constructor(rate,{maxSeconds=60,minSeconds=.25,countInBeats=16}={}){
  this.rate=rate;this.capacity=Math.ceil(rate*maxSeconds);this.minimum=Math.ceil(rate*minSeconds);
  this.length=0;this.baseLength=rate*16;this.position=0;this.bpm=120;this.referenceBpm=120;this.speed=1;
  this.active=-1;this.pending=-1;this.closingAt=0;this.captured=0;this.paused=false;
  this.tracks=[emptyTrack()];this.renderTracks=[];this.revision=0;this.message='';
  this.countInBeats=countInBeats;this.countInRemaining=0;this.countInTotal=0;
  this.metronome=false;this.beatPhase=1;
  this.click=new Float32Array(Math.ceil(rate*.02));
  for(let i=0;i<this.click.length;i++){const t=i/rate;this.click[i]=.18*Math.sin(2*Math.PI*1000*t)*Math.min(1,t/.001)*Math.exp(-t*240);}
  this.clickIndex=this.click.length;
 }
 touch(message=''){this.revision++;this.message=message;this.renderTracks=this.tracks.filter(t=>t.hasAudio);}
 recalculate(){
  this.length=Math.max(0,...this.tracks.map(t=>t.length));
  if(!this.length&&this.active<0){this.baseLength=this.rate*60/this.bpm*32;this.position=0;this.referenceBpm=this.bpm;this.speed=1;}
  else if(this.length)this.position%=this.length;
 }
 cancelPending(){
  if(this.pending<0)return;
  const t=this.tracks[this.pending];t.mode=t.hasAudio?'playing':'empty';
  this.pending=-1;this.countInRemaining=0;this.countInTotal=0;this.clickIndex=this.click.length;
 }
 armFirst(i){
  if(!this.countInBeats){this.start(i);return;}
  this.pending=i;this.paused=false;this.tracks[i].mode='armed';
  this.countInTotal=this.countInRemaining=Math.round(this.rate*60/this.bpm*this.countInBeats);
  this.beatPhase=1;this.clickIndex=this.click.length;this.touch();
 }
 start(i){
  this.countInRemaining=0;this.countInTotal=0;
  this.pending=-1;this.active=i;this.captured=0;this.closingAt=0;this.paused=false;
  const t=this.tracks[i];t.muted=false;t.mode=t.hasAudio?'overdub':'recording';
  if(!t.hasAudio){t.length=0;t.position=0;}
  this.touch();
 }
 requestFinish(){if(this.active<0){this.cancelPending();this.touch();}else this.finish();}
 captureLimit(){return this.capacity;}
 command(c){
  if(!c||typeof c.type!=='string')return;
  if(c.type==='add'){if(this.tracks.length<16){this.tracks.push(emptyTrack());this.touch();}return;}
  if(c.type==='metronome'){if(typeof c.value==='boolean'){this.metronome=c.value;if(!this.countInRemaining){this.beatPhase=1;this.clickIndex=this.click.length;}this.touch();}return;}
  if(c.type==='tempo'){
   if(!Number.isFinite(c.value)||c.value<40||c.value>240)return;
   if(this.active>=0||this.pending>=0){this.touch('Cerrá o cancelá la grabación para cambiar el tempo.');return;}
   this.bpm=c.value;if(!this.length){this.referenceBpm=this.bpm;this.baseLength=this.rate*60/this.bpm*32;}
   this.speed=this.bpm/this.referenceBpm;this.touch();return;
  }
  if(c.type==='pause'){this.cancelPending();this.finish();this.paused=true;this.metronome=false;this.touch();return;}
  if(c.type==='resume'){this.paused=false;this.touch();return;}
  if(c.type==='reset'){
   this.countInRemaining=0;this.countInTotal=0;this.clickIndex=this.click.length;
   this.tracks=[emptyTrack()];this.active=-1;this.pending=-1;this.closingAt=0;this.captured=0;
   this.length=0;this.baseLength=this.rate*60/this.bpm*32;this.position=0;this.paused=false;this.referenceBpm=this.bpm;this.speed=1;
   this.metronome=false;this.beatPhase=1;this.touch();return;
  }
  if(c.type==='stop'){this.requestFinish();return;}
  const i=c.track;if(!Number.isInteger(i)||i<0||i>=this.tracks.length)return;
  const t=this.tracks[i];
  if(c.type==='prepare'){if(!t.data&&c.data instanceof Float32Array&&c.data.length===this.capacity)t.data=c.data;return;}
  if(c.type==='mute'){if(t.hasAudio){t.muted=!t.muted;this.touch();}return;}
  if(c.type==='clear'){
   if(this.pending===i)this.cancelPending();
   if(this.active===i){this.active=-1;this.captured=0;this.closingAt=0;}
   this.tracks[i]=emptyTrack();this.recalculate();if(!this.length&&this.pending>=0&&!this.countInRemaining)this.armFirst(this.pending);this.touch();return;
  }
  if(c.type!=='record'&&c.type!=='trigger')return;
  if(this.pending===i){this.cancelPending();this.touch();return;}
  if(this.active===i){this.requestFinish();return;}
  if(c.type==='trigger'&&t.hasAudio){
   if(this.paused){this.paused=false;for(const other of this.tracks)if(other.hasAudio)other.muted=other!==t;}
   else t.muted=!t.muted;
   this.touch();return;
  }
  if(!t.data){this.touch('No se pudo preparar la memoria de la pista.');return;}
  if(this.active>=0){this.touch('Cerrá la toma actual antes de grabar otra pista.');return;}
  this.cancelPending();this.paused=false;
  if(!this.length)this.armFirst(i);
  else if(this.position<1e-7)this.start(i);
  else{this.pending=i;t.mode='armed';this.touch();}
 }
 finish(){
  if(this.active<0)return;
  const t=this.tracks[this.active],first=!this.tracks.some(t=>t.hasAudio);
  if(!t.hasAudio){
   if(this.captured<this.minimum){
    t.data.fill(0);t.length=0;t.mode='empty';this.active=-1;this.captured=0;this.closingAt=0;
    this.recalculate();this.touch('Grabá al menos un cuarto de segundo.');return;
   }
   t.length=Math.round(this.captured);
   if(first){this.baseLength=this.rate*60/this.bpm*32;this.position=0;this.referenceBpm=this.bpm;this.speed=1;}
   t.position=first?0:this.captured%t.length;
   t.edge=Math.min(Math.ceil(this.rate*.002),Math.floor(t.length/4));
  }
  t.hasAudio=true;t.mode='playing';this.active=-1;this.captured=0;this.closingAt=0;
  this.recalculate();this.touch();
 }
 process(input,output){
  if(!this.metronome&&!this.countInRemaining&&(this.paused||(!this.length&&this.active<0))){output.fill(0);return;}
  const ramp=1/Math.max(1,this.rate*.005);
  for(let frame=0;frame<output.length;frame++){
   let click=0;
   if(this.metronome||this.countInRemaining>0){
    if(this.beatPhase>=1-1e-12){this.beatPhase=Math.max(0,this.beatPhase-1);this.clickIndex=0;}
    if(this.clickIndex<this.click.length)click=this.click[this.clickIndex++];
    this.beatPhase+=this.bpm/(60*this.rate);
   }
   output[frame]=click;if(this.paused)continue;
   if(this.countInRemaining>0){
    if(--this.countInRemaining===0){const track=this.pending;this.start(track);if(!this.metronome)this.clickIndex=this.click.length;}
    continue;
   }
   const sample=Number.isFinite(input?.[frame])?input[frame]:0;
   if(!this.length){
    if(this.active>=0){
     this.tracks[this.active].data[this.captured++]=sample;
     if(this.captured>=this.capacity)this.finish();
    }
    continue;
   }
   const recording=this.active>=0?this.tracks[this.active]:null;
   let mixed=0;
   for(const t of this.renderTracks){
    const target=t.muted?0:1;
    if(t.gain!==target)t.gain+=Math.max(-ramp,Math.min(ramp,target-t.gain));
    const position=t.position;
    if(t.gain>0){
     const index=Math.floor(position),fraction=position-index,edge=t.edge;
     const envelope=position<edge?position/edge:position>=t.length-edge?Math.max(0,(t.length-1-position)/edge):1;
     mixed+=(t.data[index]*(1-fraction)+t.data[(index+1)%t.length]*fraction)*t.gain*envelope;
    }
    if(t===recording)this.write(t,position,this.speed,sample,true);
    t.position=(position+this.speed)%t.length;
   }
   output[frame]+=mixed;
   let appending=false;
   if(recording){
    let step=this.speed;
    if(!recording.hasAudio){
     appending=true;
     const end=this.closingAt||this.captureLimit();
     step=Math.min(step,end-this.captured);
     this.write(recording,this.captured,step,sample,false);
     this.captured+=step;
     recording.length=Math.ceil(this.captured);this.length=Math.max(this.length,recording.length);
     this.position=this.captured;
    }else this.captured+=step;
   }
   if(!appending)this.position+=this.speed;
   if(recording&&!recording.hasAudio&&this.captured>=(this.closingAt||this.captureLimit())-1e-7)this.finish();
   // Keep the end open while extending a fresh take, rather than wrap/overwrite it.
   if(!appending||this.active<0){
    if(this.length&&this.position>=this.length-1e-7){
     this.position%=this.length;
     if(this.pending>=0)this.start(this.pending);
    }
   }
  }
 }
 write(t,start,step,sample,wrap){
  const end=start+step;let cursor=start;
  while(cursor<end){
   const cell=Math.floor(cursor),next=Math.min(end,cell+1),index=wrap?cell%t.length:cell;
   t.data[index]=Math.max(-8,Math.min(8,t.data[index]+sample*(next-cursor)));cursor=next;
  }
 }
 state(){
  return {length:this.length,baseLength:this.baseLength,position:this.position,seconds:this.length/this.rate,
   baseSeconds:this.baseLength/this.rate/this.speed,metronome:this.metronome,bpm:this.bpm,referenceBpm:this.referenceBpm,speed:this.speed,
   elapsed:this.captured/this.rate/this.speed,active:this.active,pending:this.pending,closing:this.closingAt>0,paused:this.paused,
   countInRemaining:this.countInRemaining,countInTotal:this.countInTotal,
   countInBeat:this.countInRemaining?Math.min(this.countInBeats-1,Math.floor((this.countInTotal-this.countInRemaining)*this.bpm/(60*this.rate))):null,
   revision:this.revision,message:this.message,
   tracks:this.tracks.map(t=>({hasAudio:t.hasAudio,muted:t.muted,mode:t.mode,length:t.length,multiple:this.baseLength?t.length/this.baseLength:0}))};
 }
}
