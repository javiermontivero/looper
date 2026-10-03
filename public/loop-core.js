// Sample-clock transport. Captures ONLY synth input; playback never feeds capture.
export class LoopCore {
  constructor(rate, {maxSeconds=60, minSeconds=.25}={}) {
    this.rate=rate;
    this.capacity=Math.ceil(rate*maxSeconds);
    this.minimum=Math.ceil(rate*minSeconds);
    this.length=0;
    this.position=0;
    this.bpm=120;this.referenceBpm=120;this.speed=1;
    this.active=-1;
    this.captured=0;
    this.paused=false;
    this.revision=0;
    this.message='';this.renderTracks=[];this.edge=0;
    this.tracks=Array.from({length:5},()=>({data:null,length:0,position:0,edge:0,hasAudio:false,muted:false,gain:1,mode:'empty'}));
  }
  touch(message='') { this.revision++; this.message=message; this.renderTracks=this.tracks.filter(t=>t.hasAudio||t.mode==='recording'||t.mode==='overdub'); this.edge=Math.min(Math.ceil(this.rate*.002),Math.floor(this.length/4)); }
  command(c) {
    if(!c||typeof c.type!=='string')return;
    if(c.type==='tempo'){
      if(!Number.isFinite(c.value)||c.value<40||c.value>240)return;
      if(this.active>=0){this.touch('Cerrá la grabación para cambiar el tempo.');return;}
      this.bpm=c.value;
      if(!this.length)this.referenceBpm=this.bpm;
      this.speed=this.bpm/this.referenceBpm;this.touch();return;
    }
    if(c.type==='pause') {
      this.finish(); this.paused=true; this.touch('Reproducción pausada.'); return;
    }
    if(c.type==='resume') { this.paused=false; this.touch(); return; }
    if(c.type==='reset') {
      for(const t of this.tracks){if(t.data)t.data.fill(0);t.hasAudio=false;t.length=0;t.position=0;t.edge=0;t.muted=false;t.gain=1;t.mode='empty';}
      this.length=0;this.position=0;this.active=-1;this.captured=0;this.paused=false;
      this.referenceBpm=this.bpm;this.speed=1;
      this.touch('Sesión vacía. La próxima grabación define el ciclo.');return;
    }
    if(c.type==='stop'){this.finish();return;}
    const i=c.track;
    if(!Number.isInteger(i)||i<0||i>=this.tracks.length)return;
    const t=this.tracks[i];
    if(c.type==='prepare'){
      if(!t.data&&c.data instanceof Float32Array&&c.data.length===this.capacity)t.data=c.data;
      return;
    }
    if(c.type==='mute'){
      if(!t.hasAudio)return;
      t.muted=!t.muted;this.touch();return;
    }
    if(c.type==='double'){
      if(!t.hasAudio)return;
      if(this.active>=0){this.touch('Cerrá la grabación antes de duplicar.');return;}
      if(t.length*2>this.capacity){this.touch('La pista no cabe duplicada: máximo 60 s de audio original.');return;}
      t.data.set(t.data.subarray(0,t.length),t.length);
      t.length*=2;
      t.edge=Math.min(Math.ceil(this.rate*.002),Math.floor(t.length/4));
      this.touch();return;
    }
    if(c.type==='clear'){
      if(this.active===i){this.active=-1;this.captured=0;}
      if(t.data)t.data.fill(0);
      t.hasAudio=false;t.length=0;t.position=0;t.edge=0;t.mode='empty';t.muted=false;t.gain=1;
      if(!this.tracks.some(track=>track.hasAudio)&&this.active<0){this.length=0;this.position=0;this.referenceBpm=this.bpm;this.speed=1;}
      this.touch('Pista borrada.');return;
    }
    if(c.type!=='record')return;
    if(this.active===i){this.finish();return;}
    if(this.active>=0)this.finish();
    if(!t.data){this.touch('No se pudo preparar la memoria de la pista.');return;}
    this.active=i;this.captured=0;this.paused=false;t.muted=false;
    if(!t.hasAudio){t.length=this.length;t.position=this.position;t.edge=this.edge;}
    t.mode=t.hasAudio?'overdub':'recording';
    this.touch();
  }
  finish() {
    if(this.active<0)return;
    const t=this.tracks[this.active];
    if(!this.length){
      if(this.captured<this.minimum){
        if(t.data)t.data.fill(0);t.hasAudio=false;t.mode='empty';
        this.active=-1;this.captured=0;this.touch('Grabá al menos un cuarto de segundo.');return;
      }
      this.length=this.captured;this.position=0;this.referenceBpm=this.bpm;this.speed=1;
      t.length=this.length;t.position=0;t.edge=Math.min(Math.ceil(this.rate*.002),Math.floor(t.length/4));
    }
    t.hasAudio=true;t.mode='playing';this.active=-1;this.captured=0;this.touch();
  }
  process(input,output) {
    if(this.paused||(!this.length&&this.active<0)){output.fill(0);return;}
    const ramp=1/Math.max(1,this.rate*.005);
    for(let frame=0;frame<output.length;frame++){
      output[frame]=0;
      if(this.paused)continue;
      const sample=Number.isFinite(input?.[frame])?input[frame]:0;
      if(!this.length){
        if(this.active>=0){
          this.tracks[this.active].data[this.captured++]=sample;
          if(this.captured===this.capacity){this.finish();this.touch('Límite de 60 segundos: el ciclo quedó cerrado.');}
        }
        continue;
      }
      let mixed=0;
      const recording=this.active>=0?this.tracks[this.active]:null;
      for(const t of this.renderTracks){
        const target=t.muted?0:1;
        if(t.gain!==target)t.gain+=Math.max(-ramp,Math.min(ramp,target-t.gain));
        const position=t.position,index=Math.floor(position),fraction=position-index;
        const edge=t.edge;
        const envelope=position<edge?position/edge:position>=t.length-edge?Math.max(0,(t.length-1-position)/edge):1;
        if(t.hasAudio){
          // Linear resampling: tempo changes speed and pitch, without stretching DSP.
          const value=t.data[index]*(1-fraction)+t.data[(index+1)%t.length]*fraction;
          mixed+=value*t.gain*envelope;
        }
        if(t===recording){
          // Integrate input over source-clock cells. Covers every cell at fast tempos
          // and avoids multiplying overdub gain at slow tempos. Never feeds playback back.
          let cursor=position;
          const step=t.mode==='recording'?Math.min(this.speed,t.length-this.captured):this.speed;
          const end=cursor+step;
          while(cursor<end){
            const cell=Math.floor(cursor),next=Math.min(end,cell+1),i=cell%t.length;
            t.data[i]=Math.max(-8,Math.min(8,t.data[i]+sample*(next-cursor)));
            cursor=next;
          }
        }
        t.position=(position+this.speed)%t.length;
      }
      output[frame]=mixed;
      this.position=(this.position+this.speed)%this.length;
      if(this.active>=0){
        this.captured+=this.speed;
        if(this.tracks[this.active].mode==='recording'&&this.captured>=this.tracks[this.active].length-1e-7)this.finish();
      }
    }
  }
  state() {
    return {length:this.length,position:this.position,seconds:this.length/this.rate,
      bpm:this.bpm,referenceBpm:this.referenceBpm,speed:this.speed,
      elapsed:this.captured/this.rate/this.speed,active:this.active,paused:this.paused,
      revision:this.revision,message:this.message,
      tracks:this.tracks.map(t=>({hasAudio:t.hasAudio,muted:t.muted,mode:t.mode,length:t.length,multiple:this.length?t.length/this.length:0,canDouble:t.hasAudio&&this.active<0&&t.length*2<=this.capacity}))};
  }
}
