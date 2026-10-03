import test from 'node:test';
import assert from 'node:assert/strict';
import {LoopCore} from '../public/loop-core.js';
const core=()=>new LoopCore(1000,{maxSeconds:2,minSeconds:.004});
function prepare(c,i){c.command({type:'prepare',track:i,data:new Float32Array(c.capacity)});}
function run(c,input){const output=new Float32Array(input.length);c.process(input,output);return [...output];}
function record(c,i,samples){prepare(c,i);c.command({type:'record',track:i});run(c,samples);c.command({type:'stop'});}
test('first take sets exact audio duration and starts at the beginning',()=>{
 const c=core();record(c,0,[1,2,3,4,5,6,7,8]);assert.equal(c.length,8);assert.equal(c.position,0);
 assert.equal(c.tracks[0].hasAudio,true);assert.deepEqual([...c.tracks[0].data.slice(0,8)],[1,2,3,4,5,6,7,8]);
});
test('overdub writes only new input at current phase, never the playback mix',()=>{
 const c=core();record(c,0,[1,1,1,1,1,1,1,1]);run(c,[0,0,0]);
 c.command({type:'record',track:0});run(c,[.25,.5]);c.command({type:'stop'});
 assert.equal(c.position,5);assert.equal(c.tracks[0].data[3],1.25);assert.equal(c.tracks[0].data[4],1.5);
 assert.equal(c.tracks[0].data[2],1);assert.equal(c.length,8);
});
test('new track wraps from current phase and closes after exactly one cycle',()=>{
 const c=core();record(c,0,[0,0,0,0,0,0,0,0]);run(c,[0,0,0]);prepare(c,1);
 c.command({type:'record',track:1});run(c,[1,2,3,4,5,6,7,8]);
 assert.equal(c.active,-1);assert.equal(c.position,3);
 assert.deepEqual([...c.tracks[1].data.slice(0,8)],[6,7,8,1,2,3,4,5]);
});
test('mute never resets or freezes the common clock',()=>{
 const c=core();record(c,0,Array(20).fill(.5));c.command({type:'mute',track:0});
 assert.ok(run(c,Array(10).fill(0)).slice(-5).every(x=>x===0));assert.equal(c.position,10);
 c.command({type:'mute',track:0});const output=run(c,Array(5).fill(0));assert.equal(c.position,15);assert.ok(output[4]>.49);
});
test('pause closes capture, preserves audio and position, resume continues there',()=>{
 const c=core();record(c,0,Array(20).fill(.2));run(c,[0,0,0]);c.command({type:'record',track:0});
 c.command({type:'pause'});assert.equal(c.active,-1);assert.equal(c.paused,true);
 assert.deepEqual(run(c,[1,1]),[0,0]);assert.equal(c.position,3);
 c.command({type:'resume'});run(c,[0]);assert.equal(c.position,4);
});
test('short take is rejected, maximum closes automatically and memory remains bounded',()=>{
 const c=core();prepare(c,0);c.command({type:'record',track:0});run(c,[1]);c.command({type:'stop'});
 assert.equal(c.length,0);assert.equal(c.tracks[0].hasAudio,false);
 c.command({type:'record',track:0});run(c,Array(c.capacity).fill(.1));
 assert.equal(c.length,c.capacity);assert.equal(c.active,-1);assert.equal(c.tracks[0].data.length,c.capacity);
});
test('five tracks clear/reset and malformed commands are safe',()=>{
 const c=core();for(let i=0;i<5;i++)record(c,i,Array(8).fill(.1));
 assert.equal(c.tracks.filter(t=>t.hasAudio).length,5);
 c.command({type:'clear',track:2});assert.equal(c.length,8);assert.equal(c.tracks[2].hasAudio,false);
 c.command({type:'record',track:7});c.command(null);assert.equal(c.active,-1);
 c.command({type:'reset'});assert.equal(c.length,0);assert.equal(c.position,0);
 assert.ok(c.tracks.every(t=>!t.hasAudio&&t.data.every(x=>x===0)));
});
test('missing input records silence and overdub sanitizes non-finite input',()=>{
 const c=core();record(c,0,Array(8).fill(.2));c.command({type:'record',track:0});
 const output=new Float32Array(8);c.process(undefined,output);assert.ok(output.every(Number.isFinite));
 run(c,[NaN,Infinity]);assert.ok(c.tracks[0].data.every(Number.isFinite));
});

test('switching tracks closes the first take and starts the second without losing it',()=>{
 const c=core();prepare(c,0);prepare(c,1);c.command({type:'record',track:0});
 run(c,[1,2,3,4,5,6,7,8]);c.command({type:'record',track:1});
 assert.equal(c.length,8);assert.equal(c.active,1);assert.equal(c.tracks[0].hasAudio,true);
 run(c,Array(8).fill(.25));assert.equal(c.active,-1);assert.equal(c.tracks[1].hasAudio,true);
});
test('muting playback does not suppress capture of a running overdub',()=>{
 const c=core();record(c,0,Array(20).fill(.1));c.command({type:'record',track:0});c.command({type:'mute',track:0});
 run(c,Array(20).fill(.1));c.command({type:'stop'});
 assert.ok(Math.abs(c.tracks[0].data[10]-.2)<1e-6);assert.equal(c.tracks[0].muted,true);
});

test('double duplicates only the selected track and overdub can vary its second half',()=>{
 const c=core();record(c,0,Array(8).fill(.1));record(c,1,Array(8).fill(.2));
 run(c,[0,0,0]);c.command({type:'double',track:0});
 assert.equal(c.length,8);assert.equal(c.tracks[0].length,16);assert.equal(c.tracks[1].length,8);
 assert.equal(c.tracks[0].position,3);
 assert.deepEqual(c.tracks[0].data.slice(0,8),c.tracks[0].data.slice(8,16));
 run(c,Array(5).fill(0));c.command({type:'record',track:0});
 run(c,Array(8).fill(.3));c.command({type:'stop'});
 assert.ok(Math.abs(c.tracks[0].data[4]-.1)<1e-6);
 assert.ok(Math.abs(c.tracks[0].data[12]-.4)<1e-6);
 assert.equal(c.tracks[0].position,0);assert.equal(c.tracks[1].position,0);
});
test('double respects capacity and is unavailable during capture',()=>{
 const c=core();record(c,0,Array(1000).fill(.2));c.command({type:'record',track:0});
 c.command({type:'double',track:0});assert.equal(c.tracks[0].length,1000);
 c.command({type:'stop'});c.command({type:'double',track:0});
 assert.equal(c.tracks[0].length,2000);assert.equal(c.state().tracks[0].canDouble,false);
 c.command({type:'double',track:0});assert.equal(c.tracks[0].length,2000);
 assert.equal(c.tracks[0].data[1999],c.tracks[0].data[999]);
});
test('tempo advances all track clocks proportionally, including muted tracks',()=>{
 const c=core();record(c,0,Array(20).fill(.2));record(c,1,Array(20).fill(.1));
 c.command({type:'double',track:1});c.command({type:'mute',track:1});
 c.command({type:'tempo',value:180});run(c,Array(10).fill(0));
 assert.equal(c.position,15);assert.equal(c.tracks[1].position,15);
 c.command({type:'tempo',value:60});run(c,Array(10).fill(0));
 assert.equal(c.position,0);assert.equal(c.tracks[1].position,20);
 c.command({type:'pause'});run(c,Array(10).fill(0));assert.equal(c.tracks[1].position,20);
});
test('tempo resamples playback and does not change stored samples',()=>{
 const c=core();record(c,0,[0,0,0,1,2,3,4,5,6,7,0,0]);
 c.command({type:'tempo',value:60});
 const audio=run(c,Array(10).fill(0));
 assert.equal(audio[7],1.5);assert.equal(audio[8],2);assert.equal(audio[9],2.5);
 assert.equal(c.tracks[0].data[4],2);
});
test('overdub gain stays consistent at half, double and fractional speed',()=>{
 for(const bpm of [60,180,240]){
  const c=core();record(c,0,Array(12).fill(.2));c.command({type:'tempo',value:bpm});
  c.command({type:'record',track:0});run(c,Array(12/(bpm/120)).fill(.1));c.command({type:'stop'});
  for(const sample of c.tracks[0].data.slice(0,12))assert.ok(Math.abs(sample-.3)<1e-6,bpm+': '+sample);
 }
});
test('new tracks at changed tempo capture one source cycle without gaps',()=>{
 const c=core();record(c,0,Array(12).fill(.2));c.command({type:'tempo',value:180});
 prepare(c,1);c.command({type:'record',track:1});run(c,Array(8).fill(.25));
 assert.equal(c.active,-1);assert.equal(c.tracks[1].length,12);
 assert.ok(c.tracks[1].data.slice(0,12).every(x=>x===.25));
});
test('tempo validates values, locks during capture and reanchors a new session',()=>{
 const c=core();c.command({type:'tempo',value:100});record(c,0,Array(8).fill(.2));
 assert.equal(c.referenceBpm,100);c.command({type:'tempo',value:200});assert.equal(c.speed,2);
 for(const value of [NaN,Infinity,0,300,'120'])c.command({type:'tempo',value});
 assert.equal(c.bpm,200);c.command({type:'record',track:0});
 c.command({type:'tempo',value:60});assert.equal(c.bpm,200);c.command({type:'stop'});
 c.command({type:'reset'});assert.equal(c.speed,1);assert.equal(c.referenceBpm,200);
 assert.ok(c.tracks.every(t=>t.length===0&&t.position===0));
});
