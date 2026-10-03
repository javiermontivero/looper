export class Looper {
  static async create(context,source,destination,onState,onError){
    if(!context.audioWorklet)throw new Error('La grabación necesita HTTPS confiable y AudioWorklet. El sintetizador sigue disponible.');
    await context.audioWorklet.addModule(new URL('./loop-worklet.js',import.meta.url));
    return new Looper(context,source,destination,onState,onError);
  }
  constructor(context,source,destination,onState,onError){
    this.context=context;this.prepared=new Set();this.hasAudio=false;this.active=-1;
    this.node=new AudioWorkletNode(context,'five-track-looper',{
      numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit'
    });
    this.node.port.onmessage=event=>{
      this.state=event.data;this.hasAudio=this.state.tracks.some(t=>t.hasAudio)||this.state.active>=0;
      this.active=this.state.active;onState(this.state);
    };
    this.node.onprocessorerror=()=>{this.failed=true;source.disconnect(this.node);this.node.disconnect();onError('El motor de grabación se detuvo. El sintetizador sigue disponible; recargá para iniciar una sesión nueva.');};
    source.connect(this.node);this.node.connect(destination);
  }
  command(type,track){
    if(this.failed)throw new Error('El motor de grabación no está disponible.');
    if(type==='record'&&!this.prepared.has(track)){
      const data=new Float32Array(Math.ceil(this.context.sampleRate*60));
      this.node.port.postMessage({type:'prepare',track,data},[data.buffer]);
      this.prepared.add(track);
    }
    this.node.port.postMessage({type,track});
  }
}
