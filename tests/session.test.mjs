import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanConfig,prepareRestore,validateSnapshot} from '../public/session.js';
import {LoopCore} from '../public/loop-core.js';
test('session restores samples, reversible lengths, mute, tempo and clock across sample rates',async()=>{
 const snapshot={version:1,rate:1000,bpm:90,referenceBpm:120,transport:200,tracks:[{hasAudio:true,bars:1,muted:true,data:new Float32Array(3000).fill(.25)},{hasAudio:false,bars:0,muted:false,data:new Float32Array()}]};
 const restored=await prepareRestore(snapshot,2000);
 assert.equal(restored.tracks[0].audioLength,6000);assert.equal(restored.transport,400);
 const c=new LoopCore(2000);c.command({type:'restore',snapshot:restored});
 assert.equal(c.paused,true);assert.equal(c.bpm,90);assert.equal(c.referenceBpm,120);assert.equal(c.tracks.length,2);
 assert.equal(c.tracks[0].length,4000);assert.equal(c.tracks[0].data[5000],.25,'hidden audio retained');assert.equal(c.tracks[0].muted,true);assert.equal(c.tracks[0].gain,0,'muted restore cannot leak a first audio block');
 assert.equal(c.tracks[1].data,null);
});
test('session validation bounds memory and preserves sparse logical track identities',()=>{
 assert.deepEqual(cleanConfig({notes:[31,37,37,45],selected:6}).notes,[31,37]);
 assert.equal(cleanConfig({chains:[[{type:'volume',params:[1000,-10]}]]}).chains[0][0].params[0],100);
 assert.throws(()=>validateSnapshot({version:99}),/compatible/);
 assert.throws(()=>validateSnapshot({version:1,rate:48000,bpm:120,referenceBpm:120,tracks:[{bars:3,data:new Float32Array(),hasAudio:false}]}),/inválido/);
 assert.equal(cleanConfig({}).chains.flat().filter(s=>s.type!=='none').length,0);
});
