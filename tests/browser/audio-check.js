import {loadTone,createAudioRuntime} from '../../public/tone-runtime.js';
import {EffectChain,EFFECTS,emptyChain} from '../../public/effects.js';
import {AudioEngine} from '../../public/audio-engine.js';
import {InstrumentSource,PRESETS} from '../../public/instruments.js';
import {EffectChain as ReferenceChain} from './reference-effects.js';

const results=document.querySelector('#results');
function assert(ok,message){if(!ok)throw Error(message);}
function errorBetween(a,b){
 let max=0,energy=0;
 for(let i=0;i<a.length;i++){assert(Number.isFinite(a[i]),'non-finite sample');max=Math.max(max,Math.abs(a[i]-b[i]));energy+=a[i]*a[i];}
 return {max,rms:Math.sqrt(energy/a.length)};
}
async function compare(Tone,settings,rate,edit){
 const raw=new OfflineAudioContext(4,rate*3,rate),audio=createAudioRuntime(Tone,raw);
 const merge=raw.createChannelMerger(4);merge.connect(raw.destination);
 const currentSplit=raw.createChannelSplitter(2),referenceSplit=raw.createChannelSplitter(2);
 for(let c=0;c<2;c++){currentSplit.connect(merge,c,c);referenceSplit.connect(merge,c,c+2);}
 const current=new EffectChain(audio,currentSplit),reference=new ReferenceChain(raw,referenceSplit);
 const source=raw.createBufferSource(),buffer=raw.createBuffer(2,rate,rate);
 for(let c=0;c<2;c++){const samples=buffer.getChannelData(c);for(let i=0;i<samples.length;i++)samples[i]=.1*Math.sin(2*Math.PI*(c?733:220)*i/rate);}
 source.buffer=buffer;source.connect(current.input);source.connect(reference.input);
 current.set(settings);reference.set(settings);
 source.start(.1);
 // Pause the offline render to exercise real parameter automation mid-stream.
 if(edit)raw.suspend(.5).then(()=>{
  try{current.set(edit);reference.set(edit);}finally{raw.resume();}
 });
 const output=await raw.startRendering();
 let max=0;
 for(let c=0;c<2;c++){const diff=errorBetween(output.getChannelData(c),output.getChannelData(c+2));max=Math.max(max,diff.max);assert(diff.rms>1e-6,'silent effect output');}
 current.dispose();reference.dispose();audio.context.dispose();
 assert(max<2e-4,'DSP differs from pre-refactor: peak error '+max);
 return max;
}
document.querySelector('#run').onclick=async()=>{
 const button=document.querySelector('#run');button.disabled=true;results.textContent='';
 const log=line=>results.textContent+=line+'\n';
 try{
  const Tone=await loadTone();log('Tone.js '+Tone.version);
  let count=0,failures=0;
  for(const rate of [44100,48000]){
   for(const def of EFFECTS){
    const chain=emptyChain();chain[0]={type:def.id,params:[...def.defaults]};
    const edit=structuredClone(chain);edit[0].params=[67,41];
    try{const max=await compare(Tone,chain,rate,edit);count++;log('PASS '+rate+' Hz '+def.id+' + parámetros · diferencia '+max.toExponential(2));}catch(error){failures++;log('FAIL '+rate+' Hz '+def.id+' '+error.stack);}
   }
   const chain=EFFECTS.slice(1).map(def=>({type:def.id,params:[...def.defaults]}));
   try{await compare(Tone,chain,rate,[...chain].reverse());count++;log('PASS '+rate+' Hz cadena completa + reordenar');}catch(error){failures++;log('FAIL cadena '+error.stack);}
  }
  // The source contract works with any native output; no samples or permissions.
  const raw=new OfflineAudioContext(2,48000,48000),audio=createAudioRuntime(Tone,raw),engine=new AudioEngine(audio);
  engine.mixer.select(3);
  const signal=raw.createOscillator();signal.frequency.value=220;
  engine.setSource({output:signal});signal.start(.01);signal.stop(.4);
  const buffer=await raw.startRendering();
  assert(buffer.getChannelData(0).some(v=>Math.abs(v)>.01),'source not audible through mixer');
  engine.dispose();count++;log('PASS fuente independiente → pista → master');
  // Existing FM patch still runs through the new engine without duplicate velocity.
  const fmRaw=new OfflineAudioContext(2,48000,48000),fmEngine=new AudioEngine(createAudioRuntime(Tone,fmRaw));
  const instrument=new InstrumentSource(fmRaw);
  fmEngine.setSource(instrument);await instrument.selectPreset(PRESETS.find(p=>p.id==='velvet'));
  instrument.noteOn('test',60,1);
  const fmBuffer=await fmRaw.startRendering();
  assert(fmBuffer.getChannelData(0).some(v=>Math.abs(v)>.001),'FM silent');
  instrument.dispose();fmEngine.dispose();count++;log('PASS FM → bus seco → master');
  assert(failures===0,failures+' comprobaciones fallaron');log('COMPLETE: '+count+' comprobaciones de audio reales');
 }catch(error){log('FAIL '+error.stack);}
 finally{button.disabled=false;}
};
