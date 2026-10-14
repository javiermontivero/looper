import {loadTone,createAudioRuntime} from './tone-runtime.js';
import {Mixer} from './effects.js';
import {safetyCurve} from './latency.js';

// Owns the graph, not the instrument. A source exposes a native output AudioNode
// in this context. Capture stays dry regardless of selected track or effects.
export class AudioEngine{
 static async create({loadLibrary=loadTone,Context=globalThis.AudioContext}={}){
  const raw=new Context({latencyHint:'interactive'});
  // Resume inside the user gesture, before waiting for the library download.
  const resumed=raw.resume();
  let runtime;
  try{
   const [Tone]=await Promise.all([loadLibrary(),resumed]);
   runtime=createAudioRuntime(Tone,raw);
   return new AudioEngine(runtime);
  }catch(error){
   if(runtime)runtime.context.dispose();else await raw.close();
   throw error;
  }
 }
 constructor(audio){
  this.audio=audio;this.context=audio.rawContext;
  const {Tone,context}=audio;
  this.bus=new Tone.Gain({context,gain:1});
  this.capture=this.bus.output;
  this.safety=new Tone.WaveShaper({context,mapping:safetyCurve()});
  this.master=new Tone.Gain({context,gain:.65});
  this.safety.connect(this.master);this.master.connect(this.context.destination);
  this.mixer=new Mixer(audio,this.capture,this.safety);
  this.clicks=new Set();
 }
 setSource(source){
  if(source===this.source)return;
  if(source&&source.output?.context!==this.context)throw Error('La fuente debe usar el mismo AudioContext.');
  if(this.source){
   try{this.source.output.disconnect(this.bus.input);}
   catch(error){if(error.name!=='InvalidAccessError')throw error;} // source may already be disposed
  }
  this.source=source;
  source?.output.connect(this.bus.input);
 }
 volume(value){this.master.gain.setTargetAtTime(Math.max(0,Math.min(1,value)),this.context.currentTime,.015);}
 // Diagnostic click bypasses capture, track/master effects and safety, as before.
 testClick(){
  const c=this.context,t=c.currentTime,osc=c.createOscillator(),amp=c.createGain();
  const dispose=()=>{osc.disconnect();amp.disconnect();this.clicks.delete(voice);};
  const voice={osc,dispose};this.clicks.add(voice);
  osc.frequency.value=1000;amp.gain.setValueAtTime(.08,t);amp.gain.exponentialRampToValueAtTime(.0001,t+.035);
  osc.connect(amp);amp.connect(this.master.input);osc.onended=dispose;
  osc.start(t);osc.stop(t+.04);
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;
  this.setSource(null);
  for(const voice of this.clicks){voice.osc.onended=null;voice.osc.stop();voice.dispose();}
  this.mixer.dispose();this.bus.dispose();this.safety.dispose();this.master.dispose();
  this.audio.context.dispose();
 }
}
