import {playableVelocity} from '../public/synth.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {InstrumentSource,PRESETS,SAMPLES,drumForNote} from '../public/instruments.js';
class Param{setTargetAtTime(){} }
class Node{constructor(){this.gain=new Param();this.threshold={};this.ratio={};this.knee={};this.attack={};this.release={};}connect(n){this.destination=n;}disconnect(){}}
function setup(){
 const context={currentTime:5,createGain:()=>new Node(),createWaveShaper:()=>new Node(),destination:{}};
 const instances=[],statuses=[];
 function factory(ctx,options){
  let resolve,reject;const instance={options,events:[],disposed:false,stops:0,getGroupNames:()=>['kick','snare','closed-hihat','open-hihat'],ready:new Promise((a,b)=>{resolve=a;reject=b;}),
   start(event){this.events.push(event);return ()=>{this.stops++;};},stop(){this.stops++;},dispose(){this.disposed=true;},resolve:()=>resolve(),reject:()=>reject(Error('network'))};
  instances.push(instance);return instance;
 }
 const synth=new InstrumentSource(context,{loadLibrary:async()=>({SplendidGrandPiano:factory,ElectricPiano:factory,Soundfont:factory,Sampler:factory,DrumMachine:factory,DrumAbuse:factory,Mallet:factory,Mellotron:factory,Smolken:factory,Versilian:factory}),onStatus:s=>statuses.push(s)});
 return {synth,instances,statuses,context};
}
const flush=()=>new Promise(setImmediate);
test('sample engine routes into capture bus and plays immediate velocity-sensitive notes',async()=>{
 const {synth,instances,context}=setup();const loading=synth.selectPreset(SAMPLES[0]);await flush();
 const inst=instances[0];assert.equal(inst.options.destination,synth.output);
 synth.noteOn('early',60);assert.equal(inst.events.length,0,'no deferred notes during load');
 inst.resolve();await loading;synth.noteOn('a',60,75,'usb:0');
 assert.equal(inst.events[0].time,context.currentTime);assert.equal(inst.events[0].velocity,playableVelocity(75));
 synth.noteOff('a');assert.equal(inst.stops,1);assert.equal(synth.sampleVoices.size,0);
});
test('sustain and channel-off release samples without affecting other channels',async()=>{
 const {synth,instances}=setup();const p=synth.selectPreset(SAMPLES[1]);await flush();instances[0].resolve();await p;
 synth.pedal('a',true);synth.noteOn('a',60,100,'a');synth.noteOn('b',60,100,'b');
 synth.noteOff('a');assert.equal(synth.sampleVoices.size,2);
 synth.channelOff('b');assert.equal(synth.sampleVoices.size,1);
 synth.pedal('a',false);assert.equal(synth.sampleVoices.size,0);
});
test('stale loading cannot replace the selected instrument; switching to FM disposes samples',async()=>{
 const {synth,instances,statuses}=setup();const p=synth.selectPreset(SAMPLES[0]);await flush();
 const q=synth.selectPreset(PRESETS.find(p=>!p.engine));await q;
 assert.equal(synth.ready,true);assert.equal(instances[0].disposed,true);
 instances[0].resolve();await p;assert.equal(synth.sampler,null);assert.equal(statuses.at(-1),'');
});
test('download failure is visible and a later selection can recover',async()=>{
 const {synth,instances,statuses}=setup();const p=synth.selectPreset(SAMPLES[2]);await flush();
 assert.equal(instances[0].options.kit,'FluidR3_GM');instances[0].reject();assert.equal(await p,false);
 assert.equal(synth.ready,false);assert.match(statuses.at(-1),/No se pudo cargar/);
 const q=synth.selectPreset(SAMPLES[3]);await flush();instances[1].resolve();assert.equal(await q,true);
});
test('sample polyphony stays bounded and stale ended callbacks cannot remove retriggered notes',async()=>{
 const {synth,instances}=setup();const p=synth.selectPreset(SAMPLES[4]);await flush();instances[0].resolve();await p;
 synth.noteOn('x',60);const old=instances[0].events[0];synth.noteOn('x',62);old.onEnded();
 assert.equal(synth.sampleVoices.size,1);
 for(let i=0;i<40;i++)synth.noteOn('key'+i,i+30);assert.equal(synth.sampleVoices.size,24);
 synth.panic();assert.equal(synth.sampleVoices.size,0);
});

test('acoustic drum notes, central octave, tails, hi-hat choke and panic',async()=>{
 const {synth,instances}=setup();const p=synth.selectPreset(SAMPLES.find(p=>p.id==='drums'));
 await flush();const inst=instances[0];inst.resolve();await p;
 assert.equal(Object.keys(inst.options.preset.samples.map).length,16);
 assert.equal(drumForNote(36),'kick');assert.equal(drumForNote(60),'kick');
 assert.equal(drumForNote(62),'snare');assert.equal(drumForNote(66),'closed');
 synth.noteOn('pad',36,70,'usb');synth.noteOff('pad');
 assert.equal(inst.stops,0,'release must not truncate drum tail');
 synth.noteOn('pad',36,95,'usb');assert.equal(synth.sampleVoices.size,2,'repeated hits overlap');
 synth.bend('usb',16383);synth.noteOn('hat',46,100,'usb');
 synth.noteOn('closed',42,100,'usb');assert.equal(inst.stops,1,'closed hat chokes open hat');
 assert.equal(inst.events.at(-1).detune,0);assert.equal(inst.events.at(-1).note,42);
 const count=inst.events.length;synth.noteOn('unmapped',100);assert.equal(inst.events.length,count);
 synth.pedal('usb',true);synth.pedal('usb',false);assert.equal(inst.stops,1);
 inst.events[0].onEnded();assert.equal(synth.sampleVoices.size,2);
 synth.panic();assert.equal(synth.sampleVoices.size,0);
});

test('soft sample strikes are lifted once and zero velocity never creates a voice',async()=>{
 const {synth,instances}=setup();const p=synth.selectPreset(SAMPLES[0]);await flush();instances[0].resolve();await p;
 synth.noteOn('soft',60,1);synth.noteOn('medium',60,64);synth.noteOn('strong',60,127);
 const velocities=instances[0].events.map(e=>e.velocity);
 assert.equal(velocities[0],36);assert.equal(velocities[1],playableVelocity(64));assert.equal(velocities[2],127);
 synth.noteOn('soft',60,0);assert.equal(instances[0].events.length,3);assert.equal(synth.sampleVoices.has('soft'),false);
});

test('every additional sampler routes to the live bus with correct bank or source',async()=>{
 for(const engine of ['electric','machine','abuse','mallet','mellotron','smolken','versilian','soundfont']){
  const {synth,instances}=setup();
  const loading=synth.selectPreset({id:'test',name:'Test',engine,instrument:'test',kit:'MusyngKite'});
  await flush();const inst=instances[0];assert.equal(inst.options.destination,synth.output);
  if(engine==='abuse')assert.deepEqual(inst.options.source,{kind:'machine',machine:'test'});
  else assert.equal(inst.options.instrument,'test');
  if(engine==='soundfont')assert.equal(inst.options.kit,'MusyngKite');
  inst.resolve();assert.equal(await loading,true);synth.noteOn('key',60,80,'usb');
  assert.equal(inst.events[0].note,['machine','abuse'].includes(engine)?'kick':60);
  synth.panic();assert.equal(synth.sampleVoices.size,0);
 }
});
test('named drum kits preserve tails, choke hats and ignore unmapped keys',async()=>{
 const {synth,instances}=setup();const loading=synth.selectPreset({id:'kit',name:'Kit',engine:'abuse',instrument:'roland-tr-808'});
 await flush();const inst=instances[0];inst.resolve();await loading;
 synth.noteOn('kick',60,100);synth.noteOff('kick');assert.equal(inst.stops,0);
 synth.noteOn('open',70,100);synth.noteOn('closed',66,100);assert.equal(inst.stops,1);
 assert.equal(inst.events.at(-1).note,'closed-hihat');
 const count=inst.events.length;synth.noteOn('unused',2,100);assert.equal(inst.events.length,count);
 synth.panic();
});

test('disposing during download cannot resurrect a source or retain its sampler',async()=>{
 const {synth,instances}=setup();const loading=synth.selectPreset(SAMPLES[0]);await flush();
 const instance=instances[0];synth.dispose();
 assert.equal(synth.ready,false);assert.equal(instance.disposed,true);
 instance.resolve();assert.equal(await loading,false);assert.equal(synth.sampler,null);
 synth.noteOn('late',60);assert.equal(instance.events.length,0);
});
