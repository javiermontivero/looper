// Sample-clock transport. Captures ONLY synth input; playback never feeds capture.
export class LoopCore {
  constructor(rate, {maxSeconds=60, minSeconds=.25}={}) {
    this.rate=rate;
    this.capacity=Math.ceil(rate*maxSeconds);
    this.minimum=Math.ceil(rate*minSeconds);
    this.length=0;
    this.position=0;
    this.active=-1;
    this.captured=0;
    this.paused=false;
    this.revision=0;
    this.message='';
    this.tracks=Array.from({length:5},()=>({data:null,hasAudio:false,muted:false,gain:1,mode:'empty'}));
  }
  touch(message='') { this.revision++; this.message=message; }
  command(c) {
    if(!c||typeof c.type!=='string')return;
    if(c.type==='pause') {
      this.finish(); this.paused=true; this.touch('Reproducción pausada.'); return;
    }
    if(c.type==='resume') { this.paused=false; this.touch(); return; }
    if(c.type==='reset') {
      for(const t of this.tracks){if(t.data)t.data.fill(0);t.hasAudio=false;t.muted=false;t.gain=1;t.mode='empty';}
      this.length=0;this.position=0;this.active=-1;this.captured=0;this.paused=false;
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
    if(c.type==='clear'){
      if(this.active===i){this.active=-1;this.captured=0;}
      if(t.data)t.data.fill(0);
      t.hasAudio=false;t.mode='empty';t.muted=false;t.gain=1;
      if(!this.tracks.some(track=>track.hasAudio)&&this.active<0){this.length=0;this.position=0;}
      this.touch('Pista borrada.');return;
    }
    if(c.type!=='record')return;
    if(this.active===i){this.finish();return;}
    if(this.active>=0)this.finish();
    if(!t.data){this.touch('No se pudo preparar la memoria de la pista.');return;}
    this.active=i;this.captured=0;this.paused=false;t.muted=false;
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
      this.length=this.captured;this.position=0;
    }
    t.hasAudio=true;t.mode='playing';this.active=-1;this.captured=0;this.touch();
  }
  process(input,output) {
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
      const position=this.position;
      // Tiny boundary fades keep discontinuities from clicking; never alter captured audio.
      const edge=Math.min(Math.ceil(this.rate*.002),Math.floor(this.length/4));
      const envelope=edge?Math.min(1,position/edge,(this.length-1-position)/edge):1;
      let mixed=0;
      for(let i=0;i<this.tracks.length;i++){
        const t=this.tracks[i],target=t.muted?0:1;
        t.gain+=Math.max(-ramp,Math.min(ramp,target-t.gain));
        if(t.hasAudio)mixed+=t.data[position]*t.gain*envelope;
        if(i===this.active){
          t.data[position]=Math.max(-8,Math.min(8,t.data[position]+sample));
        }
      }
      output[frame]=mixed;
      this.position=(position+1)%this.length;
      if(this.active>=0){
        this.captured++;
        // Empty tracks record one whole cycle; overdubs run until explicitly closed.
        if(this.tracks[this.active].mode==='recording'&&this.captured>=this.length)this.finish();
      }
    }
  }
  state() {
    return {length:this.length,position:this.position,seconds:this.length/this.rate,
      elapsed:this.captured/this.rate,active:this.active,paused:this.paused,
      revision:this.revision,message:this.message,
      tracks:this.tracks.map(t=>({hasAudio:t.hasAudio,muted:t.muted,mode:t.mode}))};
  }
}
