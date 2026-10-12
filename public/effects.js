export const EFFECTS=[
 {id:'none',name:'Vacío',labels:['—','—'],defaults:[0,0]},
 {id:'volume',name:'Volumen / pan',labels:['Volumen','Panorama'],defaults:[70,50]},
 {id:'lowpass',name:'Filtro suave',labels:['Frecuencia','Resonancia'],defaults:[85,10]},
 {id:'highpass',name:'Filtro de graves',labels:['Frecuencia','Resonancia'],defaults:[5,10]},
 {id:'eq',name:'Ecualizador',labels:['Graves','Agudos'],defaults:[50,50]},
 {id:'delay',name:'Delay',labels:['Tiempo','Mezcla'],defaults:[30,25]},
 {id:'reverb',name:'Reverb',labels:['Duración','Mezcla'],defaults:[35,20]},
 {id:'tremolo',name:'Tremolo',labels:['Velocidad','Profundidad'],defaults:[25,35]},
 {id:'distortion',name:'Distorsión',labels:['Intensidad','Mezcla'],defaults:[20,30]}
];
export const emptyChain=()=>Array.from({length:8},()=>({type:'none',params:[0,0]}));
export function cleanChain(chain){
 return Array.from({length:8},(_,i)=>{
  const s=chain?.[i],def=EFFECTS.find(e=>e.id===s?.type)||EFFECTS[0];
  return {type:def.id,params:def.defaults.map((v,n)=>Number.isFinite(s?.params?.[n])?Math.max(0,Math.min(100,s.params[n])):v)};
 });
}
const smooth=(p,v,c)=>p.setTargetAtTime(v,c.currentTime,.01);
function effect(c,s){
 const input=c.createGain(),output=c.createGain(),nodes=[input,output],stops=[];
 const make=method=>{const n=c[method]();nodes.push(n);return n;};
 let update=()=>{};
 if(s.type==='none')input.connect(output);
 else if(s.type==='volume'){
  const gain=make('createGain'),pan=make('createStereoPanner');input.connect(gain);gain.connect(pan);pan.connect(output);
  update=p=>{smooth(gain.gain,p[0]/70,c);smooth(pan.pan,p[1]/50-1,c);};
 }else if(s.type==='lowpass'||s.type==='highpass'){
  const filter=make('createBiquadFilter');filter.type=s.type;input.connect(filter);filter.connect(output);
  update=p=>{smooth(filter.frequency,Math.min(c.sampleRate*.45,30*Math.pow(600,p[0]/100)),c);smooth(filter.Q,.1+12*p[1]/100,c);};
 }else if(s.type==='eq'){
  const low=make('createBiquadFilter'),high=make('createBiquadFilter');low.type='lowshelf';low.frequency.value=250;high.type='highshelf';high.frequency.value=3000;
  input.connect(low);low.connect(high);high.connect(output);
  update=p=>{smooth(low.gain,(p[0]-50)*.24,c);smooth(high.gain,(p[1]-50)*.24,c);};
 }else if(s.type==='tremolo'){
  const amp=make('createGain'),osc=make('createOscillator'),depth=make('createGain');
  input.connect(amp);amp.connect(output);osc.connect(depth);depth.connect(amp.gain);osc.start();stops.push(osc);
  update=p=>{smooth(osc.frequency,.2+12*p[0]/100,c);smooth(depth.gain,p[1]/200,c);smooth(amp.gain,1-p[1]/200,c);};
 }else{
  const dry=make('createGain'),wet=make('createGain');input.connect(dry);dry.connect(output);wet.connect(output);
  let unit,adjust;
  if(s.type==='delay'){
   unit=c.createDelay(2);nodes.push(unit);const feedback=make('createGain');feedback.gain.value=.32;
   unit.connect(feedback);feedback.connect(unit);adjust=p=>smooth(unit.delayTime,.02+p[0]/100*1.48,c);
  }else if(s.type==='reverb'){
   unit=make('createConvolver');let bucket=-1;
   adjust=p=>{const next=Math.round(p[0]/10);if(next===bucket)return;bucket=next;
    const duration=.15+next*.2,buffer=c.createBuffer(1,Math.ceil(c.sampleRate*duration),c.sampleRate),data=buffer.getChannelData(0);
    let seed=17;for(let i=0;i<data.length;i++){seed=(1664525*seed+1013904223)>>>0;data[i]=(seed/2147483648-1)*Math.pow(1-i/data.length,2);}
    unit.buffer=buffer;
   };
  }else{
   unit=make('createWaveShaper');unit.oversample='none';
   adjust=p=>{const drive=1+p[0]*.2,curve=new Float32Array(1024);for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=Math.tanh(x*drive)/Math.tanh(drive);}unit.curve=curve;};
  }
  input.connect(unit);unit.connect(wet);
  update=p=>{adjust(p);smooth(dry.gain,1-p[1]/100,c);smooth(wet.gain,p[1]/100,c);};
 }
 update(s.params);
 return {input,output,update,dispose(){for(const n of stops)n.stop();for(const n of nodes)n.disconnect();}};
}
export class EffectChain{
 constructor(context,destination){this.context=context;this.input=context.createGain();this.output=context.createGain();this.output.connect(destination);this.units=[];this.settings=emptyChain();this.input.connect(this.output);}
 set(chain){
  const settings=cleanChain(chain);
  if(settings.every((s,i)=>s.type===this.settings[i].type)){
   settings.forEach((s,i)=>{if(s.params.some((v,n)=>v!==this.settings[i].params[n]))this.units.find(u=>u.index===i)?.unit.update(s.params);});this.settings=settings;return;
  }
  this.input.disconnect();for(const u of this.units)u.unit.dispose();this.units=[];
  let previous=this.input;
  settings.forEach((s,index)=>{if(s.type==='none')return;const unit=effect(this.context,s);previous.connect(unit.input);previous=unit.output;this.units.push({index,unit});});
  previous.connect(this.output);this.settings=settings;
 }
 dispose(){this.input.disconnect();this.output.disconnect();for(const u of this.units)u.unit.dispose();}
}
export class Mixer{
 constructor(context,synth){
  this.synth=synth;this.master=new EffectChain(context,synth.compressor);
  this.tracks=Array.from({length:7},()=>new EffectChain(context,this.master.input));
  synth.input.disconnect(synth.compressor);this.selected=-1;synth.input.connect(this.master.input);
 }
 select(slot){if(slot===this.selected)return;this.synth.input.disconnect(this.selected<0?this.master.input:this.tracks[this.selected].input);this.selected=slot;this.synth.input.connect(slot<0?this.master.input:this.tracks[slot].input);}
 set(slot,chain){(slot<0?this.master:this.tracks[slot]).set(chain);}
}
