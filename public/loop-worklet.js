import {LoopCore} from './loop-core.js';
class LoopProcessor extends AudioWorkletProcessor {
  constructor(){
    super();this.core=new LoopCore(sampleRate);this.tick=0;this.lastRevision=-1;this.lastCountBeat=null;
    this.port.onmessage=event=>{
      this.core.command(event.data);
      this.lastRevision=this.core.revision;this.tick=0;const state=this.core.state();this.lastCountBeat=state.countInBeat;this.port.postMessage(state);
    };
  }
  process(inputs,outputs){
    const output=outputs[0]?.[0];if(!output)return true;
    this.core.process(inputs[0]?.[0],output);
    this.tick+=output.length;
    const countBeat=this.core.countInRemaining?Math.min(this.core.countInBeats-1,Math.floor((this.core.countInTotal-this.core.countInRemaining)*this.core.bpm/(60*sampleRate))):null;
    if((this.tick>=sampleRate/5&&!this.core.paused&&(this.core.length||this.core.active>=0))||this.core.revision!==this.lastRevision||countBeat!==this.lastCountBeat){
      this.tick=0;this.lastRevision=this.core.revision;this.lastCountBeat=countBeat;this.port.postMessage(this.core.state());
    }
    return true;
  }
}
registerProcessor('five-track-looper',LoopProcessor);
