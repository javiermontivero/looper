import test from 'node:test';
import assert from 'node:assert/strict';
import {EFFECTS,cleanChain,emptyChain,EffectChain,Mixer} from '../public/effects.js';
import {fakeAudio,Node} from './fake-audio.mjs';
test('all effects instantiate offline, expose two params and dispose old nodes',()=>{
 const c=fakeAudio(),chain=new EffectChain(c,{});
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
 const c=fakeAudio(),source=new Node(c.rawContext),capture=new Node(c.rawContext),destination=new Node(c.rawContext);
 source.connect(capture);
 const mixer=new Mixer(c,source,destination);
 assert.equal(mixer.tracks.length,7);assert.deepEqual(source.links,[capture,mixer.master.input]);
 mixer.select(3);assert.deepEqual(source.links,[capture,mixer.tracks[3].input]);
 for(const track of mixer.tracks)assert.deepEqual(track.output.links,[mixer.master.input]);
 assert.deepEqual(mixer.master.output.links,[destination]);
 mixer.select(-1);assert.deepEqual(source.links,[capture,mixer.master.input]);
 mixer.dispose();assert.deepEqual(source.links,[capture]);assert.ok(c.created.every(n=>n.disposed));

});
