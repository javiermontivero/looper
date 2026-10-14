import {soundfonts,discoverCatalog,FAMILIES,mapDrumGroups} from './catalog.js';
import {PRESETS as FM_PRESETS,Synth as FMSynth,playableVelocity} from './synth.js';
export const SAMPLES=[
 {id:'piano',name:'Piano acústico',category:'Instrumentos',engine:'piano'},
 {id:'wurlitzer',name:'Wurlitzer',category:'Instrumentos',engine:'electric',instrument:'WurlitzerEP200'},
 {id:'bass',name:'Bajo acústico',category:'Instrumentos',engine:'soundfont',instrument:'acoustic_bass'},
 {id:'guitar',name:'Guitarra nylon',category:'Instrumentos',engine:'soundfont',instrument:'acoustic_guitar_nylon'},
 {id:'strings',name:'Cuerdas',category:'Instrumentos',engine:'soundfont',instrument:'string_ensemble_1'},
 {id:'drums',name:'Batería acústica',category:'Instrumentos',engine:'drums'},
 {id:'marimba',name:'Marimba / percusión',category:'Instrumentos',engine:'soundfont',instrument:'marimba'}
];
SAMPLES.push(...soundfonts(SAMPLES),{id:'tabla',name:'Tabla india',category:'Instrumentos',engine:'soundfont',instrument:'synth_drum',kit:'Tabla',roles:['rhythm'],percussion:true});
export const PRESETS=[...SAMPLES,...FM_PRESETS.map(p=>({...p,category:'Sinte FM'}))];
export const importSmplr=()=>import('https://cdn.jsdelivr.net/npm/smplr@1.1.0/dist/index.mjs');

let catalogLoading;
export function loadInstrumentCatalog(loadLibrary=importSmplr){
 if(catalogLoading)return catalogLoading;
 catalogLoading=(async()=>{
  const lib=await loadLibrary(),result=await discoverCatalog(lib,PRESETS);
  const ids=new Set(PRESETS.map(p=>p.id)),added=result.presets.filter(p=>!ids.has(p.id));
  SAMPLES.push(...added);PRESETS.push(...added);
  return {added:added.length,issues:result.issues,count:PRESETS.length};
 })().finally(()=>{catalogLoading=null;});
 return catalogLoading;
}

const DRUM_BASE='https://smpldsnds.github.io/hydrogen-drum-samples/';
export const DRUM_NOTES={
 35:'kick',36:'kick',37:'stick',38:'snare',39:'clap',40:'rim',
 41:'floor',42:'closed',43:'floor',44:'pedal',45:'mid',46:'open',
 47:'mid',48:'high',49:'crash',50:'high',51:'ride',53:'bell',55:'splash',56:'cowbell',57:'crash',59:'ride'
};
const DRUM_FILES={
 kick:'h2ogmbd/Kick-Hard',stick:'h2ogmsn/SideStick-Hard',snare:'h2ogmsn/Snare-Hard',
 clap:'h2ogmcp/HandClap',rim:'h2ogmsn/SnareRimshot-Hard',
 floor:'h2ogmft/TomFloor-Hard',mid:'h2ogmmt/Tom2-Hard',high:'h2ogmht/Tom1-Hard',
 closed:'h2ogmhh/HatClosed-Hard',pedal:'h2ogmhh/HatPedal-Hard',open:'h2ogmhh/HatOpen-Hard',
 crash:'h2ogmcy/Crash-Hard',ride:'h2ogmcy/Ride-Hard',bell:'h2ogmcy/Bell-Hard',
 splash:'h2ogmcy/Splash-Hard',cowbell:'h2ogmcb/Cowbell-Hard'
};
export function drumForNote(note){return DRUM_NOTES[note>=60&&note<=83?note-24:note];}

// Instrument source: owns voices and downloads, never monitor/recorder routing.
export class InstrumentSource{
 constructor(context,{loadLibrary=importSmplr,onStatus=()=>{}}={}){
  this.context=context;this.output=context.createGain();this.fm=new FMSynth(context,this.output);
  this.preset=FM_PRESETS[0];this.loadLibrary=loadLibrary;this.onStatus=onStatus;
  this.sampleVoices=new Map();this.sampleSustain=new Set();this.sampleBends=new Map();
  this.ready=true;this.selection=0;this.serial=0;this.loading=Promise.resolve();
 }
 get voices(){return this.fm.voices;}
 async selectPreset(p){
  const selection=++this.selection;this.panic();this.preset=p;this.fm.preset=p;
  this.controller?.abort();this.sampler?.dispose();this.sampler=null;this.drumMap=null;
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
    const options={destination:this.output,volume:85,storage};
    if(p.engine==='piano'){
     instrument=lib.SplendidGrandPiano(this.context,{...options,
      notesToLoad:{notes:Array.from({length:21},(_,i)=>36+i*3),fallback:'nearest'}});
    }else if(p.engine==='electric')instrument=lib.ElectricPiano(this.context,{...options,instrument:p.instrument});
    else if(p.engine==='drums')instrument=lib.Sampler(this.context,{...options,
     preset:{samples:{baseUrl:DRUM_BASE,formats:['ogg','m4a'],map:DRUM_FILES},defaults:{loop:false,ampRelease:0.02},
      groups:[{regions:Object.entries(DRUM_NOTES).map(([key,sample])=>({sample,keyRange:[Number(key),Number(key)],pitch:Number(key)}))}]}});
    else if(p.engine==='soundfont')instrument=lib.Soundfont(this.context,{...options,instrument:p.instrument,kit:p.kit||'FluidR3_GM'});
    else{
     const factory=FAMILIES.find(f=>f.engine===p.engine)?.factory;
     if(!factory||typeof lib[factory]!=='function')throw Error('Instrumento no soportado');
     instrument=lib[factory](this.context,{...options,...(p.engine==='abuse'?{source:{kind:'machine',machine:p.instrument}}:{instrument:p.instrument})});
    }
    this.sampler=instrument;
    await instrument.ready;
    if(selection!==this.selection){instrument.dispose();return false;}
    if(['machine','abuse'].includes(p.engine)){
     const groups=instrument.getGroupNames?.()||instrument.getSampleNames?.()||[];
     this.drumMap=mapDrumGroups(groups);
     if(!Object.keys(this.drumMap).length)throw Error('Kit vacío');
    }
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
  if(!this.preset.engine)return this.fm.noteOn(key,note,velocity,channel);
  velocity=playableVelocity(velocity);if(!velocity){this.noteOff(key);return;}
  const namedKit=['machine','abuse'].includes(this.preset.engine);
  const percussion=this.preset.engine==='drums'||namedKit||this.preset.percussion;
  const drum=this.preset.engine==='drums'?drumForNote(note):namedKit?this.drumMap?.[note]:this.preset.percussion&&note>=60&&note<=88?'tabla':null;
  if(percussion){
   if(!drum)return;
   if(['closed','pedal','open'].includes(drum)||/hat|^chh$|^ohh$/i.test(drum)){
    for(const [oldKey,v] of this.sampleVoices)if(v.channel===channel&&(['closed','pedal','open'].includes(v.drum)||/hat|^chh$|^ohh$/i.test(v.drum||'')))this.stopSample(oldKey);
   }
   // Each drum hit owns a voice; releasing/retriggering the pad preserves its tail.
   key='drum:'+ ++this.serial;note=this.preset.engine==='drums'?(note>=60&&note<=83?note-24:note):namedKit?drum:note;
  }
  this.stopSample(key);
  if(this.sampleVoices.size>=24)this.stopSample(this.sampleVoices.keys().next().value);
  const voice={channel,drum,held:true,stop:()=>{},id:++this.serial};
  this.sampleVoices.set(key,voice);
  voice.stop=this.sampler.start({note,velocity,time:this.context.currentTime,stopId:voice.id,
   detune:drum?0:this.sampleBends.get(channel)||0,
   onEnded:()=>{if(this.sampleVoices.get(key)===voice)this.sampleVoices.delete(key);}});
 }
 stopSample(key){
  const voice=this.sampleVoices.get(key);if(!voice)return;
  voice.stop();this.sampleVoices.delete(key);
 }
 noteOff(key){
  this.fm.noteOff(key);
  const voice=this.sampleVoices.get(key);if(!voice)return;
  voice.held=false;if(!this.sampleSustain.has(voice.channel))this.stopSample(key);
 }
 pedal(channel,down){
  this.fm.pedal(channel,down);
  if(down)this.sampleSustain.add(channel);
  else{this.sampleSustain.delete(channel);for(const [key,v] of this.sampleVoices)if(v.channel===channel&&!v.held&&!v.drum)this.stopSample(key);}
 }
 bend(channel,value){
  this.fm.bend(channel,value);
  // smplr's public API applies detune at note-on; FM supports continuous bends.
  this.sampleBends.set(channel,(value-8192)/8192*200);
 }
 channelOff(channel){
  this.fm.channelOff(channel);this.sampleSustain.delete(channel);
  for(const [key,v] of this.sampleVoices)if(v.channel===channel)this.stopSample(key);
 }
 dispose(){
  ++this.selection;this.ready=false;this.controller?.abort();this.panic();
  this.sampler?.dispose();this.sampler=null;this.fm.dispose();this.output.disconnect();
 }
 panic(){
  this.fm.panic();
  for(const key of this.sampleVoices.keys())this.stopSample(key);
  this.sampler?.stop();this.sampleSustain.clear();this.sampleBends.clear();
 }
}
