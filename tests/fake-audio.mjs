// Structural doubles, not a DSP implementation. Real rendering: tests/browser/.
export class Param{
 constructor(value=0){this.value=value;this.events=[];}
 setTargetAtTime(value,time,constant){this.value=value;this.events.push({value,time,constant});}
 setValueAtTime(value,time){this.value=value;this.events.push({value,time});}
 exponentialRampToValueAtTime(value,time){this.value=value;this.events.push({value,time});}
 linearRampToValueAtTime(value,time){this.value=value;this.events.push({value,time});}
 cancelAndHoldAtTime(){}
}
export class Node{
 constructor(context){this.context=context;this.links=[];for(const p of ['gain','pan','frequency','Q','delayTime'])this[p]=new Param();}
 connect(node){this.links.push(node);}
 disconnect(node){if(node&&!this.links.includes(node))throw new DOMException('Not connected','InvalidAccessError');this.links=node?this.links.filter(n=>n!==node):[];}
 start(time){this.started=time;}
 stop(time){this.stopped=time??true;}
}
export function fakeAudio(){
 const rawContext={sampleRate:8000,currentTime:3,state:'running',resume:async()=>{},close:async()=>{rawContext.closed=true;}};
 rawContext.destination=new Node(rawContext);
 for(const type of ['Gain','Oscillator','BiquadFilter','WaveShaper','Convolver','StereoPanner','Delay'])rawContext['create'+type]=()=>new Node(rawContext);
 rawContext.createBuffer=(channels,length)=>{const data=new Float32Array(length);return {getChannelData:()=>data};};
 const created=[];
 class Unit{
  constructor(options){this.options=options;this.input=this.output=new Node(options.context.rawContext);created.push(this);
   for(const p of ['gain','pan','frequency','Q','delayTime'])this[p]=this.output[p];
   this.gain.value=options.gain??1;this.oversample=options.oversample;this.curve=options.curve;
  }
  connect(node){this.output.connect(node.input||node);}
  dispose(){this.output.disconnect();this.disposed=true;}
  start(t){this.started=t;}
 }
 const Tone={Context:class{
  constructor(options){Object.assign(this,options);this.rawContext=options.context;}
  dispose(){this.rawContext.close();}
 },setContext(context){Tone.activeContext=context;}};
 for(const type of ['Gain','Panner','BiquadFilter','Oscillator','Delay','Convolver','WaveShaper'])Tone[type]=class extends Unit{};
 const context=new Tone.Context({context:rawContext,lookAhead:0});
 return {Tone,context,rawContext,created};
}
