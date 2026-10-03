import test from 'node:test';
import assert from 'node:assert/strict';
import {Synth,PRESETS,SAMPLES} from '../public/instruments.js';
class Param{setTargetAtTime(){} }
class Node{constructor(){this.gain=new Param();this.threshold={};this.ratio={};this.knee={};this.attack={};this.release={};}connect(n){this.destination=n;}disconnect(){}}
function setup(){
 const context={currentTime:5,createGain:()=>new Node(),createDynamicsCompressor:()=>new Node(),destination:{}};
 const instances=[],statuses=[];
 function factory(ctx,options){
  let resolve,reject;const instance={options,events:[],disposed:false,stops:0,ready:new Promise((a,b)=>{resolve=a;reject=b;}),
   start(event){this.events.push(event);return ()=>{this.stops++;};},stop(){this.stops++;},dispose(){this.disposed=true;},resolve:()=>resolve(),reject:()=>reject(Error('network'))};
  instances.push(instance);return instance;
 }
 const synth=new Synth(context,{loadLibrary:async()=>({SplendidGrandPiano:factory,ElectricPiano:factory,Soundfont:factory}),onStatus:s=>statuses.push(s)});
 return {synth,instances,statuses,context};
}
const flush=()=>new Promise(setImmediate);
test('sample engine routes into capture bus and plays immediate velocity-sensitive notes',async()=>{
 const {synth,instances,context}=setup();const loading=synth.selectPreset(SAMPLES[0]);await flush();
 const inst=instances[0];assert.equal(inst.options.destination,synth.input);
 synth.noteOn('early',60);assert.equal(inst.events.length,0,'no deferred notes during load');
 inst.resolve();await loading;synth.noteOn('a',60,75,'usb:0');
 assert.equal(inst.events[0].time,context.currentTime);assert.equal(inst.events[0].velocity,75);
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
