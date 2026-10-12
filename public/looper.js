export class Looper {
  static async create(context,source,destination,onState,onError,onSnapshot){
    if(!context.audioWorklet)throw new Error('La grabación necesita HTTPS confiable y AudioWorklet. El sintetizador sigue disponible.');
    await context.audioWorklet.addModule(new URL('./loop-worklet.js',import.meta.url));
    return new Looper(context,source,destination,onState,onError,onSnapshot);
  }
  constructor(context,source,destination,onState,onError,onSnapshot){
    this.context=context;this.trackCount=1;this.prepared=new Set();this.hasAudio=false;this.active=-1;
    this.node=new AudioWorkletNode(context,'five-track-looper',{
      numberOfInputs:1,numberOfOutputs:8,outputChannelCount:Array(8).fill(1),channelCount:1,channelCountMode:'explicit'
    });
    this.node.port.onmessage=event=>{
      if(event.data.type?.startsWith('snapshot-')){onSnapshot?.(event.data);return;}
      this.state=event.data;this.hasAudio=this.state.tracks.some(t=>t.hasAudio)||this.state.active>=0||this.state.pending>=0;
      this.active=this.state.active;onState(this.state);if(this.state.restored){this.restored?.();this.restored=null;}
    };
    this.node.onprocessorerror=()=>{this.failed=true;source.disconnect(this.node);this.node.disconnect();onError('El motor de grabación se detuvo. El sintetizador sigue disponible; recargá para iniciar una sesión nueva.');};
    source.connect(this.node);this.node.connect(destination.master.input,0);this.mixer=destination;
  }
  route(notes){for(let i=0;i<7;i++){try{this.node.disconnect(i+1);}catch{}if(notes[i])this.node.connect(this.mixer.tracks[notes[i]-31].input,i+1);}}
  snapshot(id){this.node.port.postMessage({type:'snapshot',id});}
  restore(snapshot){
   this.trackCount=snapshot.tracks.length;this.prepared.clear();
   snapshot.tracks.forEach((t,i)=>{if(t.data)this.prepared.add(i);});
   return new Promise(resolve=>{this.restored=resolve;this.node.port.postMessage({type:'restore',snapshot},snapshot.tracks.filter(t=>t.data).map(t=>t.data.buffer));});
  }
  command(type,track,value){
    if(this.failed)throw new Error('El motor de grabación no está disponible.');
    // Track additions are synchronous here; worklet state messages arrive later.
    if(type==='add'){if(this.trackCount>=7)return;this.trackCount++;}
    if(type==='reset')this.trackCount=1;
    if((type==='record'||type==='trigger')&&!this.prepared.has(track)){
      const data=new Float32Array(Math.ceil(this.context.sampleRate*60));
      this.node.port.postMessage({type:'prepare',track,data},[data.buffer]);
      this.prepared.add(track);
    }
    if(type==='clear')this.prepared.delete(track);
    if(type==='reset')this.prepared.clear();
    this.node.port.postMessage({type,track,value});
  }
}
