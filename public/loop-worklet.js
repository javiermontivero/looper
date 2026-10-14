import {LoopCore} from './loop-core.js';
class LoopProcessor extends AudioWorkletProcessor {
  constructor(){
    super();this.core=new LoopCore(sampleRate);this.trackOutputs=[];this.tick=0;this.lastRevision=-1;this.lastCountBeat=null;
    this.port.onmessage=event=>{
      const m=event.data;
      if(m.type==='snapshot'){
       if(this.core.active>=0||this.core.pending>=0){this.port.postMessage({type:'snapshot-cancel',id:m.id});return;}
       const snapshot={version:1,rate:sampleRate,bpm:this.core.bpm,referenceBpm:this.core.referenceBpm,transport:this.core.transport,
        tracks:this.core.tracks.map(t=>({hasAudio:t.hasAudio,muted:t.muted,bars:t.bars,audioLength:t.hasAudio?t.audioLength:0}))};
       this.snapshotJob={id:m.id,revision:this.core.revision,track:0,offset:0,snapshot};
       this.port.postMessage({type:'snapshot-start',id:m.id,snapshot});return;
      }
      this.core.command(m);
      this.lastRevision=this.core.revision;this.tick=0;const state=this.core.state();if(m.type==='restore')state.restored=true;this.lastCountBeat=state.countInBeat;this.port.postMessage(state);
    };
  }
  copySnapshot(){
   const job=this.snapshotJob;if(!job)return;
   if(job.revision!==this.core.revision){this.port.postMessage({type:'snapshot-cancel',id:job.id});this.snapshotJob=null;return;}
   while(job.track<job.snapshot.tracks.length){
    const length=job.snapshot.tracks[job.track].audioLength;
    if(job.offset>=length){job.track++;job.offset=0;continue;}
    const end=Math.min(length,job.offset+4096),data=this.core.tracks[job.track].data.slice(job.offset,end);
    this.port.postMessage({type:'snapshot-chunk',id:job.id,track:job.track,offset:job.offset,data},[data.buffer]);job.offset=end;return;
   }
   this.port.postMessage({type:'snapshot-end',id:job.id});this.snapshotJob=null;
  }
  process(inputs,outputs){
    const output=outputs[0]?.[0];if(!output)return true;
    // Reuse the routing array; no slice/map allocations on every audio quantum.
    this.trackOutputs.length=outputs.length-1;
    for(let i=1;i<outputs.length;i++)this.trackOutputs[i-1]=outputs[i][0];
    this.core.process(inputs[0]?.[0],output,outputs.length>1?this.trackOutputs:undefined);
    this.copySnapshot();
    this.tick+=output.length;
    const countBeat=this.core.countInRemaining?Math.min(this.core.countInBeats-1,Math.floor((this.core.countInTotal-this.core.countInRemaining)*this.core.bpm/(60*sampleRate))):null;
    if((this.tick>=sampleRate/15&&!this.core.paused&&(this.core.length||this.core.active>=0))||this.core.revision!==this.lastRevision||countBeat!==this.lastCountBeat){
      this.tick=0;this.lastRevision=this.core.revision;this.lastCountBeat=countBeat;this.port.postMessage(this.core.state());
    }
    return true;
  }
}
registerProcessor('five-track-looper',LoopProcessor);
