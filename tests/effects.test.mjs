import test from 'node:test';
import assert from 'node:assert/strict';
import {EFFECTS,cleanChain,emptyChain,EffectChain,Mixer} from '../public/effects.js';
class Param{constructor(){this.value=0;}setTargetAtTime(v){this.value=v;}}
class Node{
 constructor(){this.links=[];for(const name of ['gain','pan','frequency','Q','delayTime'])this[name]=new Param();}
 connect(node){this.links.push(node);}disconnect(node){this.links=node?this.links.filter(n=>n!==node):[];}start(){}stop(){this.stopped=true;}
}
const context=()=>({sampleRate:8000,currentTime:0,createGain:()=>new Node(),createStereoPanner:()=>new Node(),createBiquadFilter:()=>new Node(),createDelay:()=>new Node(),createOscillator:()=>new Node(),createConvolver:()=>new Node(),createWaveShaper:()=>new Node(),createBuffer:(n,length)=>({getChannelData:()=>new Float32Array(length)})});
test('all effects instantiate offline, expose two params and dispose old nodes',()=>{
 const c=context(),chain=new EffectChain(c,{});
 assert.equal(chain.units.length,0);assert.equal(emptyChain().length,8);
 for(const def of EFFECTS.slice(1)){
  const settings=emptyChain();settings[0]={type:def.id,params:[...def.defaults]};chain.set(settings);
  assert.equal(chain.units.length,1);assert.equal(def.labels.length,2);
  const same=chain.units[0].unit;settings[0].params=[99,3];chain.set(settings);assert.equal(chain.units[0].unit,same,'parameter edits reuse audio nodes');
 }
 const previous=chain.units[0].unit;chain.set(emptyChain());assert.equal(previous.output.links.length,0);
 assert.equal(cleanChain([{type:'unknown',params:[Infinity,-9]}])[0].type,'none');
});
test('seven track chains feed master, live monitor moves without feeding capture',()=>{
 const c=context(),synth={input:new Node(),compressor:new Node()};synth.input.connect(synth.compressor);
 const mixer=new Mixer(c,synth);
 assert.equal(mixer.tracks.length,7);assert.deepEqual(synth.input.links,[mixer.master.input]);
 mixer.select(3);assert.deepEqual(synth.input.links,[mixer.tracks[3].input]);
 for(const track of mixer.tracks)assert.deepEqual(track.output.links,[mixer.master.input]);
 assert.deepEqual(mixer.master.output.links,[synth.compressor]);
 mixer.select(-1);assert.deepEqual(synth.input.links,[mixer.master.input]);
});
