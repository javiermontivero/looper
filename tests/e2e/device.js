// Test hardware boundary only. No application module imports or private hooks.
// Native Web Audio, worklets, workers, IndexedDB, Tone and smplr remain real.
export function installDevice({sampleRate=48000}={}){
 const input={id:'minicontrol',name:'MiniControl de prueba',state:'connected',type:'input',onmidimessage:null};
 const other={...input,id:'other',name:'Otro teclado'};
 const access={inputs:new Map([[input.id,input],[other.id,other]]),outputs:new Map(),onstatechange:null};
 const NativeContext=window.AudioContext,connect=AudioNode.prototype.connect;
 const contexts=[],listeners=new Set();let lastTime=0;
 const ready=[];
 class TestAudioContext extends NativeContext{
  constructor(options){
   super({...options,sampleRate});const context=this,edges=[];
   const observed={context,edges,node:null};contexts.push(observed);
   ready.push(this.audioWorklet.addModule('/__e2e__/meter.js').then(()=>{
    const node=new AudioWorkletNode(context,'output-meter',{numberOfInputs:1,numberOfOutputs:0,channelCount:2});
    observed.node=node;for(const [source,output] of edges)connect.call(source,node,output);
    node.port.onmessage=event=>{lastTime=event.data.time;for(const listener of listeners)listener(event.data);};
   }).catch(error=>{if(context.state!=='closed')throw error;}));
  }
 }
 AudioNode.prototype.connect=function(destination,output=0,input=0){
  const observed=contexts.find(o=>o.context.destination===destination);
  if(observed){observed.edges.push([this,output]);if(observed.node)connect.call(this,observed.node,output);}
  return connect.apply(this,arguments);
 };
 window.AudioContext=TestAudioContext;
 Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>access});
 window.__device={
  async ready(){await Promise.all(ready);},
  send(data,id='minicontrol'){const port=access.inputs.get(id);if(port?.state==='connected')port.onmidimessage?.({data:new Uint8Array(data),receivedTime:performance.now(),timeStamp:performance.now()});},
  disconnect(id='minicontrol'){const port=access.inputs.get(id);port.state='disconnected';access.onstatechange?.({port});},
  reconnect(id='minicontrol'){const port=access.inputs.get(id);port.state='connected';access.onstatechange?.({port});},
  async pulses(seconds){
   await this.ready();let frame=0,last=-Infinity,peak=0;const starts=[];
   const collect=data=>{for(const value of data.samples){peak=Math.max(peak,Math.abs(value));if(Math.abs(value)>.001){if(frame-last>sampleRate*.05)starts.push(frame);last=frame;}frame++;}};
   listeners.add(collect);await new Promise(resolve=>setTimeout(resolve,seconds*1000));listeners.delete(collect);
   return {starts,peak,rate:sampleRate,frames:frame};
  },
  async capture(seconds=.35){
   await this.ready();const parts=[];const collect=data=>parts.push(data);listeners.add(collect);
   await new Promise(resolve=>setTimeout(resolve,seconds*1000));listeners.delete(collect);
   const data=parts.flatMap(a=>Array.from(a.samples)),left=parts.flatMap(a=>Array.from(a.left)),right=parts.flatMap(a=>Array.from(a.right));
   return {samples:data,left,right,rate:sampleRate,time:lastTime,contexts:contexts.length};
  }
 };
}
