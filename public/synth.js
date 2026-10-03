import {safetyCurve} from './latency.js';
export const PRESETS=[
{id:'velvet',name:'Velvet EP',category:'Teclas',description:'Piano eléctrico suave, con brillo al tocar más fuerte.',ratio:1,index:2.3,attack:.008,decay:1.4,sustain:.14,release:.65,tone:5200},
{id:'glass',name:'Glass Keys',category:'Teclas',description:'Campanas claras y una caída larga y brillante.',ratio:3.5,index:2.8,attack:.003,decay:2.1,sustain:.05,release:1.3,tone:8500},
{id:'organ',name:'Sunday Organ',category:'Teclas',description:'Un órgano redondo que acompaña sin ocupar todo.',ratio:2,index:.8,attack:.015,decay:.3,sustain:.8,release:.12,tone:4000},
{id:'pluck',name:'Soft Pluck',category:'Teclas',description:'Ataque de cuerda y una cola corta, para pequeñas figuras.',ratio:2,index:1.9,attack:.003,decay:.5,sustain:.02,release:.25,tone:3800},
{id:'sub',name:'Sub Floor',category:'Bajos',description:'Un bajo profundo y limpio. Probalo una o dos octavas abajo.',ratio:1,index:.3,attack:.01,decay:.3,sustain:.7,release:.15,tone:700},
{id:'rubber',name:'Rubber Bass',category:'Bajos',description:'Ataque elástico y cuerpo cálido para marcar el pulso.',ratio:1,index:3.4,attack:.005,decay:.35,sustain:.25,release:.18,tone:1700},
{id:'night',name:'Night Air',category:'Pads',description:'Acordes que aparecen despacio y se quedan un rato.',ratio:1,index:.8,attack:1.1,decay:1.5,sustain:.65,release:2,tone:2400},
{id:'halo',name:'Halo',category:'Pads',description:'Un halo de armónicos suaves, abierto y luminoso.',ratio:2,index:1.1,attack:.65,decay:1,sustain:.6,release:1.6,tone:4800},
{id:'haze',name:'Slow Haze',category:'Pads',description:'Una textura oscura para notas largas y espacios amplios.',ratio:.5,index:1.5,attack:1.6,decay:2,sustain:.55,release:2.5,tone:1400},
{id:'neon',name:'Neon Line',category:'Leads',description:'Una voz definida que responde al pitch bend de tu teclado.',ratio:2,index:2,attack:.008,decay:.25,sustain:.55,release:.25,tone:5000},
{id:'arcade',name:'Arcade',category:'Leads',description:'Un timbre brillante y juguetón, con bordes digitales.',ratio:4,index:1.5,attack:.004,decay:.2,sustain:.45,release:.16,tone:6500},
{id:'reed',name:'Warm Reed',category:'Leads',description:'Un aire de instrumento de viento, cálido y expresivo.',ratio:1,index:1.8,attack:.07,decay:.3,sustain:.65,release:.3,tone:2800}
];
export const frequency=note=>440*2**((note-69)/12);
export class Synth {
 constructor(context){this.context=context;this.voices=new Map();this.sustain=new Set();this.bends=new Map();this.preset=PRESETS[0];this.maxVoices=32;this.input=context.createGain();this.master=context.createGain();this.master.gain.value=.65;this.compressor=context.createWaveShaper();this.compressor.curve=safetyCurve();this.compressor.oversample='none';this.input.connect(this.compressor);this.compressor.connect(this.master);this.master.connect(context.destination);}
 // Direct diagnostic click goes to monitor only, never into recorded audio.
 testClick(){
  const c=this.context,t=c.currentTime,osc=c.createOscillator(),amp=c.createGain();
  osc.frequency.value=1000;amp.gain.setValueAtTime(.08,t);amp.gain.exponentialRampToValueAtTime(.0001,t+.035);
  osc.connect(amp);amp.connect(this.master);osc.onended=()=>{osc.disconnect();amp.disconnect();};
  osc.start(t);osc.stop(t+.04);
 }
 volume(value){this.master.gain.setTargetAtTime(Math.max(0,Math.min(1,value)),this.context.currentTime,.015);}
 noteOn(key,note,velocity=100,channel='local'){
  this.stop(key,true);if(this.voices.size>=this.maxVoices)this.stop(this.voices.keys().next().value,true);
  const c=this.context,p=this.preset,t=c.currentTime,hz=frequency(note),v=Math.max(1,Math.min(127,velocity))/127;
  const carrier=c.createOscillator(),mod=c.createOscillator(),depth=c.createGain(),amp=c.createGain(),filter=c.createBiquadFilter();
  carrier.frequency.value=hz;mod.frequency.value=hz*p.ratio;
  carrier.detune.value=mod.detune.value=this.bends.get(channel)||0;
  depth.gain.setValueAtTime(hz*p.index*(.35+.65*v),t);depth.gain.exponentialRampToValueAtTime(Math.max(.1,hz*p.index*.14),t+p.attack+p.decay);
  filter.type='lowpass';filter.frequency.value=Math.min(c.sampleRate*.45,p.tone*(.5+.5*v));filter.Q.value=.5;
  const peak=.18*v; amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(peak,t+p.attack);amp.gain.exponentialRampToValueAtTime(Math.max(.0001,peak*p.sustain),t+p.attack+p.decay);
  mod.connect(depth);depth.connect(carrier.frequency);carrier.connect(filter);filter.connect(amp);amp.connect(this.input);mod.start(t);carrier.start(t);
  const voice={carrier,mod,depth,amp,filter,channel,note,release:p.release,held:true,released:false};
  carrier.onended=()=>{for(const n of [carrier,mod,depth,amp,filter])n.disconnect();if(this.voices.get(key)===voice)this.voices.delete(key);};
  this.voices.set(key,voice);
 }
 noteOff(key){const v=this.voices.get(key);if(!v)return;v.held=false;if(!this.sustain.has(v.channel))this.stop(key);}
 stop(key,immediate=false){const v=this.voices.get(key);if(!v||(!immediate&&v.released))return;v.released=true;const t=this.context.currentTime,r=immediate?.008:v.release;if(typeof v.amp.gain.cancelAndHoldAtTime==='function')v.amp.gain.cancelAndHoldAtTime(t);else{const level=v.amp.gain.value;v.amp.gain.cancelScheduledValues(t);v.amp.gain.setValueAtTime(level,t);}v.amp.gain.linearRampToValueAtTime(0,t+r);v.carrier.stop(t+r+.01);v.mod.stop(t+r+.01);if(immediate)this.voices.delete(key);}
 pedal(channel,down){if(down)this.sustain.add(channel);else{this.sustain.delete(channel);for(const [key,v] of this.voices)if(v.channel===channel&&!v.held)this.stop(key);}}
 bend(channel,value){const cents=(value-8192)/8192*200;this.bends.set(channel,cents);for(const v of this.voices.values())if(v.channel===channel){v.carrier.detune.setTargetAtTime(cents,this.context.currentTime,.008);v.mod.detune.setTargetAtTime(cents,this.context.currentTime,.008);}}
 channelOff(channel){this.sustain.delete(channel);for(const [key,v] of this.voices)if(v.channel===channel)this.stop(key,true);}
 panic(){for(const key of [...this.voices.keys()])this.stop(key,true);this.sustain.clear();this.bends.clear();}
}
