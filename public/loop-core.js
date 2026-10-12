// Sample-clock transport. Only live instrument input is captured.
const emptyTrack=()=>({data:null,length:0,audioLength:0,bars:0,pendingBars:0,changeAt:0,position:0,edge:0,hasAudio:false,muted:false,gain:1,mode:'empty'});
export class LoopCore {
 constructor(rate,{maxSeconds=60,minSeconds=.25,countInBeats=8}={}){
  this.rate=rate;this.capacity=Math.ceil(rate*maxSeconds);this.minimum=Math.ceil(rate*minSeconds);
  this.transport=0;this.recordStart=0;this.pendingAt=0;this.lastBeat=-1;this.length=0;this.baseLength=rate*8;this.position=0;this.bpm=120;this.referenceBpm=120;this.speed=1;
  this.active=-1;this.pending=-1;this.closingAt=0;this.captured=0;this.paused=false;
  this.tracks=[emptyTrack()];this.renderTracks=[];this.nextChange=Infinity;this.revision=0;this.message='';
  this.countInBeats=countInBeats;this.countInRemaining=0;this.countInTotal=0;
  this.metronome=false;this.beatPhase=1;
  this.click=new Float32Array(Math.ceil(rate*.02));
  for(let i=0;i<this.click.length;i++){const t=i/rate;this.click[i]=.18*Math.sin(2*Math.PI*1000*t)*Math.min(1,t/.001)*Math.exp(-t*240);}
  this.clickIndex=this.click.length;
 }
 touch(message=''){this.revision++;this.message=message;this.renderTracks=this.tracks.filter(t=>t.hasAudio);this.nextChange=Math.min(Infinity,...this.renderTracks.filter(t=>t.pendingBars).map(t=>t.changeAt));}
 get barLength(){return this.rate*240/this.referenceBpm;}
 phase(length){const p=this.transport%length;return p<1e-7||length-p<1e-7?0:p;}
 boundary(length){return (Math.floor((this.transport+1e-7)/length)+1)*length;}
 roundedBars(samples){let bars=1;while(bars*this.barLength<samples-this.speed-1e-7)bars*=2;return bars;}
 recalculate(){
  this.length=Math.max(0,...this.tracks.filter(t=>t.hasAudio).map(t=>t.length));
  if(!this.length&&this.active<0){this.baseLength=this.rate*60/this.bpm*16;this.transport=0;this.position=0;this.referenceBpm=this.bpm;this.speed=1;this.lastBeat=-1;}
  else this.position=this.length?this.phase(this.length):this.transport;
  for(const t of this.renderTracks)t.position=this.phase(t.length);
 }
 resize(t,bars){
  t.bars=bars;t.length=bars*this.barLength;t.pendingBars=0;t.changeAt=0;
  this.recalculate();this.touch();
 }
 applyChanges(){
  if(this.transport<this.nextChange-1e-7)return;
  for(const t of this.renderTracks)if(t.pendingBars&&this.transport>=t.changeAt-1e-7)this.resize(t,t.pendingBars);
 }
 cancelPending(){
  if(this.pending<0)return;
  const t=this.tracks[this.pending];t.mode=t.hasAudio?'playing':'empty';
  this.pending=-1;this.pendingAt=0;this.countInRemaining=0;this.countInTotal=0;this.clickIndex=this.click.length;
 }
 armFirst(i){
  if(!this.countInBeats){this.start(i);return;}
  this.pending=i;this.paused=false;this.tracks[i].mode='armed';
  this.countInTotal=this.countInRemaining=Math.round(this.rate*60/this.bpm*this.countInBeats);
  this.beatPhase=1;this.clickIndex=this.click.length;this.touch();
 }
 start(i,origin=this.transport){
  this.countInRemaining=0;this.countInTotal=0;
  if(!this.length){this.transport=0;origin=0;this.referenceBpm=this.bpm;this.speed=1;this.lastBeat=-1;}
  this.recordStart=origin;this.pending=-1;this.active=i;this.captured=Math.max(0,this.transport-origin);this.closingAt=0;this.paused=false;
  const t=this.tracks[i];t.muted=false;t.mode=t.hasAudio?'overdub':'recording';
  if(!t.hasAudio){t.length=0;t.position=0;}
  this.touch();
 }
 requestFinish(){if(this.active<0){this.cancelPending();this.touch();}else this.finish();}
 captureLimit(){return this.capacity;}
 command(c){
  if(!c||typeof c.type!=='string')return;
  if(c.type==='add'){if(this.tracks.length<16){this.tracks.push(emptyTrack());this.touch();}return;}
  if(c.type==='metronome'){if(typeof c.value==='boolean'){this.metronome=c.value;if(!this.countInRemaining){this.clickIndex=this.click.length;}this.touch();}return;}
  if(c.type==='tempo'){
   if(!Number.isFinite(c.value)||c.value<40||c.value>240)return;
   if(this.active>=0||this.pending>=0){this.touch('Cerrá o cancelá la grabación para cambiar el tempo.');return;}
   this.bpm=c.value;if(!this.length){this.referenceBpm=this.bpm;this.baseLength=this.rate*60/this.bpm*16;}
   this.speed=this.bpm/this.referenceBpm;this.touch();return;
  }
  if(c.type==='pause'){this.cancelPending();this.finish();this.paused=true;this.metronome=false;this.touch();return;}
  if(c.type==='resume'){this.paused=false;this.touch();return;}
  if(c.type==='reset'){
   this.countInRemaining=0;this.countInTotal=0;this.clickIndex=this.click.length;
   this.transport=0;this.lastBeat=-1;this.tracks=[emptyTrack()];this.active=-1;this.pending=-1;this.closingAt=0;this.captured=0;
   this.length=0;this.baseLength=this.rate*60/this.bpm*16;this.position=0;this.paused=false;this.referenceBpm=this.bpm;this.speed=1;
   this.metronome=false;this.beatPhase=1;this.touch();return;
  }
  if(c.type==='stop'){this.requestFinish();return;}
  const i=c.track;if(!Number.isInteger(i)||i<0||i>=this.tracks.length)return;
  const t=this.tracks[i];
  if(c.type==='prepare'){if(!t.data&&c.data instanceof Float32Array&&c.data.length===this.capacity)t.data=c.data;return;}
  if(c.type==='shorten'||c.type==='lengthen'){
   if(!t.hasAudio)return;
   if(this.active>=0||this.pending>=0){this.touch('Cerrá o cancelá la grabación para cambiar la duración.');return;}
   const bars=Math.max(1,Math.min(128,(t.pendingBars||t.bars)*(c.type==='shorten'?.5:2)));
   if(bars===t.bars){t.pendingBars=0;t.changeAt=0;this.touch();return;}
   const shared=Math.max(bars,t.bars)*this.barLength;
   if(this.phase(shared)===0)this.resize(t,bars);
   else{t.pendingBars=bars;t.changeAt=this.boundary(shared);this.touch();}
   return;
  }
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
  if(this.tracks.some(t=>t.pendingBars)){this.touch('Esperá a que se aplique el cambio de duración.');return;}
  if(t.hasAudio&&t.length>this.capacity){this.touch('El overdub admite ciclos de hasta 60 s de audio original. Acortá el ciclo para grabar.');return;}
  this.cancelPending();this.paused=false;
  if(!this.length)this.armFirst(i);
  else if(this.position<1e-7)this.start(i);
  else{this.pending=i;this.pendingAt=this.boundary(this.length);t.mode='armed';this.touch();}
 }
 finish(){
  if(this.active<0)return;
  const t=this.tracks[this.active],first=!this.tracks.some(t=>t.hasAudio);
  if(!t.hasAudio){
   if(this.captured<this.minimum){
    t.data.fill(0);t.length=0;t.mode='empty';this.active=-1;this.captured=0;this.closingAt=0;
    this.recalculate();this.touch('Grabá al menos un cuarto de segundo.');return;
   }
   t.audioLength=Math.ceil(this.captured);
   t.bars=this.roundedBars(this.captured);t.length=t.bars*this.barLength;
   if(first)this.baseLength=this.barLength*8;
   if(t.length>this.length){this.transport-=this.recordStart;this.lastBeat=Math.floor((this.transport-this.speed+1e-7)/(this.barLength/4));}
   t.position=this.phase(t.length);
   t.edge=Math.ceil(this.rate*.002);
  }
  t.hasAudio=true;t.mode='playing';this.active=-1;this.captured=0;this.closingAt=0;
  this.recalculate();this.touch();
 }
 process(input,output){
  if(!this.metronome&&!this.countInRemaining&&(this.paused||(!this.length&&this.active<0))){output.fill(0);return;}
  const ramp=1/Math.max(1,this.rate*.005);
  for(let frame=0;frame<output.length;frame++){
   output[frame]=0;if(this.paused)continue;
   if(this.countInRemaining>0){
    if(this.beatPhase>=1-1e-12){this.beatPhase=Math.max(0,this.beatPhase-1);this.clickIndex=0;}
    if(this.clickIndex<this.click.length)output[frame]=this.click[this.clickIndex++];
    this.beatPhase+=this.bpm/(60*this.rate);
    if(--this.countInRemaining===0){this.start(this.pending);this.clickIndex=this.click.length;}
    continue;
   }
   this.applyChanges();
   const beat=Math.floor((this.transport+1e-7)/(this.barLength/4));
   if(beat!==this.lastBeat){this.lastBeat=beat;if(this.metronome)this.clickIndex=0;}
   if(this.metronome&&this.clickIndex<this.click.length)output[frame]=this.click[this.clickIndex++];
   const sample=Number.isFinite(input?.[frame])?input[frame]:0;
   const recording=this.active>=0?this.tracks[this.active]:null;
   for(const t of this.renderTracks){
    const target=t.muted?0:1;
    if(t.gain!==target)t.gain+=Math.max(-ramp,Math.min(ramp,target-t.gain));
    const position=this.phase(t.length);
    if(t.gain>0){
     const index=Math.floor(position),fraction=position-index;
     const end=Math.min(t.audioLength,t.length),edge=Math.min(t.edge,end/4);
     const envelope=edge?Math.max(0,Math.min(1,position/edge,(end-1-position)/edge)):1;
     const first=index<end?(t.data[index]||0):0;
     const next=index+1<end?(t.data[index+1]||0):0;
     output[frame]+=(first*(1-fraction)+next*fraction)*t.gain*envelope;
    }
    if(t===recording)this.write(t,position,this.speed,sample,true);
   }
   if(recording){
    if(!recording.hasAudio){
     const step=Math.min(this.speed,this.capacity-this.captured);
     this.write(recording,this.captured,step,sample,false);this.captured+=step;
    }else this.captured+=this.speed;
   }
   this.transport+=this.speed;
   this.position=this.length?this.phase(this.length):this.transport;
   for(const t of this.renderTracks)t.position=this.phase(t.length);
   if(recording&&!recording.hasAudio&&this.captured>=this.capacity-1e-7)this.finish();
   this.applyChanges();
   if(this.pending>=0&&this.transport>=this.pendingAt-1e-7)this.start(this.pending,this.pendingAt);
  }
 }
 write(t,start,step,sample,wrap){
  const end=start+step;let cursor=start;
  while(cursor<end){
   const cell=Math.floor(cursor),next=Math.min(end,cell+1);
   const index=wrap?Math.floor(cell%t.length):cell;
   if(index>=0&&index<t.data.length){
    t.data[index]=Math.max(-8,Math.min(8,t.data[index]+sample*(next-cursor)));
    t.audioLength=Math.max(t.audioLength,index+1);
   }
   cursor=next;
  }
 }
 state(){
  return {length:this.length,baseLength:this.baseLength,position:this.position,seconds:this.length/this.rate,
   baseSeconds:this.baseLength/this.rate/this.speed,metronome:this.metronome,bpm:this.bpm,referenceBpm:this.referenceBpm,speed:this.speed,
   elapsed:this.captured/this.rate/this.speed,active:this.active,pending:this.pending,closing:this.closingAt>0,paused:this.paused,
   countInRemaining:this.countInRemaining,countInTotal:this.countInTotal,
   countInBeat:this.countInRemaining?Math.min(this.countInBeats-1,Math.floor((this.countInTotal-this.countInRemaining)*this.bpm/(60*this.rate))):null,
   revision:this.revision,message:this.message,
   tracks:this.tracks.map(t=>({hasAudio:t.hasAudio,muted:t.muted,mode:t.mode,length:t.length,audioLength:t.audioLength,bars:t.bars,pendingBars:t.pendingBars,canOverdub:t.length<=this.capacity,multiple:this.baseLength?t.length/this.baseLength:0}))};
 }
}
