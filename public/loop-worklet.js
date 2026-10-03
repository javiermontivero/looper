import {LoopCore} from './loop-core.js';
class LoopProcessor extends AudioWorkletProcessor {
  constructor(){
    super();this.core=new LoopCore(sampleRate);this.tick=0;this.lastRevision=-1;
    this.port.onmessage=event=>{
      this.core.command(event.data);
      this.lastRevision=this.core.revision;this.tick=0;this.port.postMessage(this.core.state());
    };
  }
  process(inputs,outputs){
    const output=outputs[0]?.[0];if(!output)return true;
    this.core.process(inputs[0]?.[0],output);
    this.tick+=output.length;
    if((this.tick>=sampleRate/5&&!this.core.paused&&(this.core.length||this.core.active>=0))||this.core.revision!==this.lastRevision){
      this.tick=0;this.lastRevision=this.core.revision;this.port.postMessage(this.core.state());
    }
    return true;
  }
}
registerProcessor('five-track-looper',LoopProcessor);
