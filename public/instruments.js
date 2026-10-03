import {PRESETS as FM_PRESETS,Synth as FMSynth} from './synth.js';
export const SAMPLES=[
 {id:'piano',name:'Piano acústico',category:'Instrumentos',engine:'piano'},
 {id:'wurlitzer',name:'Wurlitzer',category:'Instrumentos',engine:'electric',instrument:'WurlitzerEP200'},
 {id:'bass',name:'Bajo acústico',category:'Instrumentos',engine:'soundfont',instrument:'acoustic_bass'},
 {id:'guitar',name:'Guitarra nylon',category:'Instrumentos',engine:'soundfont',instrument:'acoustic_guitar_nylon'},
 {id:'strings',name:'Cuerdas',category:'Instrumentos',engine:'soundfont',instrument:'string_ensemble_1'},
 {id:'marimba',name:'Marimba / percusión',category:'Instrumentos',engine:'soundfont',instrument:'marimba'}
];
export const PRESETS=[...SAMPLES,...FM_PRESETS.map(p=>({...p,category:'Sinte FM'}))];
const importSmplr=()=>import('https://cdn.jsdelivr.net/npm/smplr@1.1.0/dist/index.mjs');

// Stable input bus: both engines feed the exact same live monitor and loop capture.
export class Synth extends FMSynth{
 constructor(context,{loadLibrary=importSmplr,onStatus=()=>{}}={}){
  super(context);this.loadLibrary=loadLibrary;this.onStatus=onStatus;
  this.sampleVoices=new Map();this.sampleSustain=new Set();this.sampleBends=new Map();
  this.ready=true;this.selection=0;this.serial=0;this.loading=Promise.resolve();
 }
 async selectPreset(p){
  const selection=++this.selection;this.panic();this.preset=p;
  this.controller?.abort();this.sampler?.dispose();this.sampler=null;
  if(!p.engine){this.ready=true;this.onStatus('');return true;}
  this.ready=false;this.onStatus('Cargando '+p.name+'…');
  // Serialize loading to avoid decoding several instruments at once on mobile.
  this.loading=this.loading.catch(()=>{}).then(async()=>{
   if(selection!==this.selection)return false;
   let instrument,timeout;
   try{
    const lib=await this.loadLibrary();
    if(selection!==this.selection)return false;
    const controller=new AbortController();this.controller=controller;
    timeout=globalThis.setTimeout(()=>controller.abort(),90000);
    // The upstream Wurlitzer ab6mp Ogg is not decodable in Chromium; its M4A works.
    const storage={fetch:url=>fetch(
     String(url).endsWith('/wurlitzer-ep200/samples/ab6mp.ogg')?String(url).replace(/\.ogg$/,'.m4a'):url,
     {signal:controller.signal})};
    const options={destination:this.input,volume:85,storage};
    if(p.engine==='piano'){
     instrument=lib.SplendidGrandPiano(this.context,{...options,
      notesToLoad:{notes:Array.from({length:21},(_,i)=>36+i*3),fallback:'nearest'}});
    }else if(p.engine==='electric')instrument=lib.ElectricPiano(this.context,{...options,instrument:p.instrument});
    else instrument=lib.Soundfont(this.context,{...options,instrument:p.instrument,kit:'FluidR3_GM'});
    this.sampler=instrument;
    await instrument.ready;
    if(selection!==this.selection){instrument.dispose();return false;}
    this.ready=true;this.onStatus('');return true;
   }catch(error){
    instrument?.dispose();
    if(selection===this.selection){this.sampler=null;this.onStatus('No se pudo cargar '+p.name+'. Revisá Internet o elegí un Sinte FM.');}
    return false;
   }finally{globalThis.clearTimeout(timeout);}
  });
  return this.loading;
 }
 noteOn(key,note,velocity=100,channel='local'){
  if(!this.ready)return; // Never queue notes to sound unexpectedly after a download.
  if(!this.preset.engine)return super.noteOn(key,note,velocity,channel);
  this.stopSample(key);
  if(this.sampleVoices.size>=24)this.stopSample(this.sampleVoices.keys().next().value);
  const voice={channel,held:true,stop:()=>{},id:++this.serial};
  this.sampleVoices.set(key,voice);
  voice.stop=this.sampler.start({note,velocity,time:this.context.currentTime,stopId:voice.id,
   detune:this.sampleBends.get(channel)||0,
   onEnded:()=>{if(this.sampleVoices.get(key)===voice)this.sampleVoices.delete(key);}});
 }
 stopSample(key){
  const voice=this.sampleVoices.get(key);if(!voice)return;
  voice.stop();this.sampleVoices.delete(key);
 }
 noteOff(key){
  super.noteOff(key);
  const voice=this.sampleVoices.get(key);if(!voice)return;
  voice.held=false;if(!this.sampleSustain.has(voice.channel))this.stopSample(key);
 }
 pedal(channel,down){
  super.pedal(channel,down);
  if(down)this.sampleSustain.add(channel);
  else{this.sampleSustain.delete(channel);for(const [key,v] of this.sampleVoices)if(v.channel===channel&&!v.held)this.stopSample(key);}
 }
 bend(channel,value){
  super.bend(channel,value);
  // smplr's public API applies detune at note-on; FM supports continuous bends.
  this.sampleBends.set(channel,(value-8192)/8192*200);
 }
 channelOff(channel){
  super.channelOff(channel);this.sampleSustain.delete(channel);
  for(const [key,v] of this.sampleVoices)if(v.channel===channel)this.stopSample(key);
 }
 panic(){
  super.panic();
  if(this.sampleVoices){for(const key of this.sampleVoices.keys())this.stopSample(key);}
  this.sampler?.stop();this.sampleSustain?.clear();this.sampleBends?.clear();
 }
}
