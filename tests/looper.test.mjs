import test from 'node:test';
import assert from 'node:assert/strict';
import {LoopCore} from '../public/loop-core.js';
const core=()=>new LoopCore(1000,{maxSeconds:2,minSeconds:.004,countInBeats:0});
function prepare(c,i){while(c.tracks.length<=i)c.command({type:'add'});c.command({type:'prepare',track:i,data:new Float32Array(c.capacity)});}
function run(c,input){const output=new Float32Array(input.length);c.process(input,output);return [...output];}
function record(c,i,samples){prepare(c,i);c.command({type:'record',track:i});if(c.pending>=0)run(c,Array(Math.ceil((c.length-c.position)/c.speed)).fill(0));run(c,samples);c.command({type:'stop'});}
test('one empty track initially, add up to sixteen without allocating audio',()=>{
 const c=core();assert.equal(c.tracks.length,1);
 for(let i=0;i<30;i++)c.command({type:'add'});
 assert.equal(c.tracks.length,16);assert.ok(c.tracks.every(t=>t.data===null));
 record(c,15,Array(8).fill(.1));assert.equal(c.tracks[15].hasAudio,true);
 c.command({type:'reset'});assert.equal(c.tracks.length,1);assert.equal(c.tracks[0].data,null);
});
test('fixed eight-bar guide follows BPM independently of first take duration',()=>{
 const c=core();assert.equal(c.state().baseSeconds,16);
 c.command({type:'tempo',value:60});assert.equal(c.state().baseSeconds,32);
 record(c,0,Array(10).fill(.2));assert.equal(c.length,10);assert.equal(c.baseLength,32000);
 c.command({type:'tempo',value:120});assert.equal(c.state().baseSeconds,16);assert.equal(c.length,10);
});
test('take closes at its exact duration after recording starts',()=>{
 const c=core();record(c,0,[1,2,3,4,5,6,7,8]);
 assert.equal(c.length,8);assert.equal(c.position,0);assert.equal(c.active,-1);
 assert.deepEqual([...c.tracks[0].data.slice(0,8)],[1,2,3,4,5,6,7,8]);
});
test('armed take waits for longest loop boundary and ignores input until then',()=>{
 const c=core();record(c,0,Array(8).fill(0));run(c,[0,0,0]);prepare(c,1);
 c.command({type:'record',track:1});assert.equal(c.pending,1);assert.equal(c.active,-1);
 run(c,[9,9,9,9,9]);assert.equal(c.active,1);assert.equal(c.captured,0);
 run(c,[1,2,3,4,5,6,7,8,1,2,3]);assert.equal(c.active,1,'does not auto close at old loop end');
 c.command({type:'stop'});assert.equal(c.active,-1);assert.equal(c.length,11);
 assert.deepEqual([...c.tracks[1].data.slice(0,11)],[1,2,3,4,5,6,7,8,1,2,3]);
 assert.equal(c.tracks[0].length,8);assert.equal(c.tracks[0].position,3);
 assert.equal(c.position,0);
});
test('second take closes immediately mid-cycle without padding',()=>{
 const c=core();record(c,0,Array(20).fill(.2));record(c,1,Array(7).fill(.3));
 assert.equal(c.active,-1);assert.equal(c.tracks[1].length,7);assert.equal(c.length,20);
 assert.equal(c.position,7);assert.equal(c.tracks[1].position,0);
});
test('armed take can cancel; pause and clear cannot start it later',()=>{
 const c=core();record(c,0,Array(20).fill(.2));run(c,[0,0]);prepare(c,1);
 for(const type of ['record','pause','clear']){
  c.command({type:'record',track:1});assert.equal(c.pending,1);
  c.command({type,track:1});assert.equal(c.pending,-1);assert.equal(c.active,-1);
  c.command({type:'resume'});prepare(c,1);
 }
 run(c,Array(20).fill(0));assert.equal(c.active,-1);
});
test('overdub also waits for boundary and never captures playback',()=>{
 const c=core();record(c,0,Array(8).fill(.25));run(c,[0,0,0]);
 c.command({type:'record',track:0});run(c,Array(5).fill(7));
 run(c,[.25,.5]);c.command({type:'stop'});
 assert.equal(c.tracks[0].data[0],.5);assert.equal(c.tracks[0].data[1],.75);
 assert.equal(c.tracks[0].data[2],.25);assert.equal(c.position,2);
});
test('muting is phase-preserving and does not suppress active overdub',()=>{
 const c=core();record(c,0,Array(20).fill(.1));c.command({type:'record',track:0});
 c.command({type:'mute',track:0});run(c,Array(20).fill(.1));c.command({type:'stop'});
 assert.ok(Math.abs(c.tracks[0].data[10]-.2)<1e-6);assert.equal(c.tracks[0].position,0);
 assert.ok(run(c,Array(10).fill(0)).every(x=>x===0));
 c.command({type:'mute',track:0});run(c,Array(5).fill(0));assert.equal(c.tracks[0].position,15);
});
test('clearing longest recalculates song duration and releases its buffer',()=>{
 const c=core();record(c,0,Array(8).fill(.1));record(c,1,Array(13).fill(.2));
 assert.equal(c.length,13);c.command({type:'clear',track:1});assert.equal(c.length,8);
 assert.equal(c.tracks[1].data,null);c.command({type:'clear',track:0});assert.equal(c.length,0);
 assert.equal(c.state().baseSeconds,16);
});
test('short take rejected and maximum capture stops without overflow',()=>{
 const c=core();record(c,0,[1]);assert.equal(c.length,0);assert.equal(c.tracks[0].hasAudio,false);
 record(c,0,Array(8).fill(.1));record(c,1,Array(c.capacity+5).fill(.2));
 assert.equal(c.length,c.capacity);assert.equal(c.active,-1);assert.equal(c.tracks[1].data.length,c.capacity);
});
test('fractional tempo capture and overdub preserve signal gain and immediate close',()=>{
 for(const bpm of [60,180,240]){
  const c=core();record(c,0,Array(12).fill(.2));c.command({type:'tempo',value:bpm});
  record(c,0,Array(12/(bpm/120)).fill(.1));
  assert.ok(c.tracks[0].data.slice(0,12).every(x=>Math.abs(x-.3)<1e-6));
  record(c,1,Array(24/(bpm/120)).fill(.25));assert.equal(c.length,24);
  assert.ok(c.tracks[1].data.slice(0,24).every(x=>x===.25));
 }
});
test('tempo resampling and phase continue for short tracks',()=>{
 const c=core();record(c,0,[0,0,0,1,2,3,4,5,6,7,0,0]);c.command({type:'tempo',value:60});
 const out=run(c,Array(10).fill(0));assert.equal(out[7],1.5);assert.equal(out[8],2);
 c.command({type:'pause'});run(c,[0,0]);assert.equal(c.position,5);c.command({type:'resume'});run(c,[0]);assert.equal(c.position,5.5);
});
test('tempo validates and locks during armed and active recording',()=>{
 const c=core();record(c,0,Array(8).fill(.2));run(c,[0]);
 prepare(c,1);c.command({type:'record',track:1});c.command({type:'tempo',value:60});assert.equal(c.bpm,120);
 run(c,Array(7).fill(0));c.command({type:'tempo',value:60});assert.equal(c.bpm,120);
 run(c,Array(4).fill(.2));c.command({type:'stop'});
 for(const value of [NaN,Infinity,0,300,'120'])c.command({type:'tempo',value});
 assert.equal(c.bpm,120);
});
test('MIDI trigger starts, closes immediately, mutes; clear discards take',()=>{
 const c=core();prepare(c,0);c.command({type:'trigger',track:0});run(c,Array(20).fill(.2));
 c.command({type:'trigger',track:0});c.command({type:'trigger',track:0});assert.equal(c.tracks[0].muted,true);
 run(c,Array(3).fill(0));c.command({type:'trigger',track:0});assert.equal(c.tracks[0].position,3);
 prepare(c,1);c.command({type:'trigger',track:1});c.command({type:'clear',track:1});
 assert.equal(c.pending,-1);assert.equal(c.tracks[1].data,null);
});
test('malformed input stays finite and first take cannot be silently replaced',()=>{
 const c=core();prepare(c,0);prepare(c,1);c.command({type:'record',track:0});run(c,[NaN,Infinity,0,0]);
 c.command({type:'record',track:1});assert.equal(c.active,0);
 c.command(null);c.command({type:'record',track:16});c.command({type:'stop'});
 c.command({type:'record',track:0});c.process(undefined,new Float32Array(8));c.command({type:'stop'});
 assert.ok(c.tracks[0].data.every(Number.isFinite));
});
function clickStarts(c,samples,chunk=128){
 const output=[];let remaining=samples;
 while(remaining){const n=Math.min(chunk,remaining),buf=new Float32Array(n);c.process(undefined,buf);output.push(...buf);remaining-=n;}
 const starts=[];let last=-10000;
 for(let i=0;i<output.length;i++)if(Math.abs(output[i])>1e-5){if(i-last>c.rate*.03)starts.push(i);last=i;}
 return starts;
}
test('metronome ticks at exact BPM across render blocks even without recorded tracks',()=>{
 for(const bpm of [60,120,137,240]){
  const c=new LoopCore(48000);c.command({type:'tempo',value:bpm});c.command({type:'metronome',value:true});
  const starts=clickStarts(c,48000*3),period=48000*60/bpm;
  assert.ok(starts.length>=3);
  for(let i=1;i<starts.length;i++)assert.ok(Math.abs(starts[i]-starts[0]-i*period)<=1);
  assert.equal(c.length,0);assert.ok(c.tracks.every(t=>t.data===null));
 }
});
test('metronome follows tempo changes and never enters recorded audio or overdub',()=>{
 const c=new LoopCore(48000);c.command({type:'metronome',value:true});
 clickStarts(c,48000);c.command({type:'tempo',value:240});
 const starts=clickStarts(c,48000);assert.equal(starts[1]-starts[0],12000);
 prepare(c,0);c.command({type:'trigger',track:0});
 clickStarts(c,c.countInRemaining);
 assert.ok(clickStarts(c,24000).length>0);c.command({type:'trigger',track:0});
 assert.ok(c.tracks[0].data.every(x=>x===0));
 c.command({type:'record',track:0});clickStarts(c,24000);c.command({type:'stop'});
 assert.ok(c.tracks[0].data.every(x=>x===0));
 c.command({type:'metronome',value:false});
 assert.ok(run(c,Array(100).fill(0)).every(x=>x===0));
 c.command({type:'metronome',value:true});c.command({type:'pause'});
 assert.equal(c.metronome,false);assert.ok(run(c,Array(100).fill(0)).every(x=>x===0));
});

test('clearing the last recorded track while another is armed starts a free take',()=>{
 const c=core();record(c,0,Array(8).fill(.2));run(c,[0]);prepare(c,1);
 c.command({type:'record',track:1});c.command({type:'clear',track:0});
 assert.equal(c.pending,-1);assert.equal(c.active,1);run(c,Array(7).fill(.3));c.command({type:'stop'});
 assert.equal(c.length,7);assert.equal(c.tracks[1].hasAudio,true);
});

test('first take counts exactly sixteen beats at the selected BPM without capturing input',()=>{
 for(const bpm of [60,120,137,240]){
  const c=new LoopCore(8000);c.command({type:'tempo',value:bpm});prepare(c,0);
  c.command({type:'trigger',track:0});
  const total=Math.round(8000*60/bpm*16);
  assert.equal(c.pending,0);assert.equal(c.active,-1);assert.equal(c.countInRemaining,total);
  assert.equal(c.state().countInBeat,0);
  const output=run(c,Array(total-1).fill(.9));
  assert.ok(output.some(x=>Math.abs(x)>1e-5),'count-in is audible even when metronome is off');
  assert.equal(c.active,-1);assert.equal(c.captured,0);
  assert.ok(c.tracks[0].data.every(x=>x===0));
  run(c,[.9]);assert.equal(c.active,0);assert.equal(c.captured,0);
  assert.equal(c.countInRemaining,0);assert.equal(c.metronome,false);
  run(c,Array(2000).fill(.25));c.command({type:'stop'});
  assert.equal(c.length,2000);assert.ok(c.tracks[0].data.slice(0,2000).every(x=>x===.25));
  prepare(c,1);c.command({type:'record',track:1});
  assert.equal(c.active,1,'subsequent take at loop start has no count-in');
  assert.equal(c.countInRemaining,0);
 }
});
test('count-in cancels on second press, stop, pause, clear or reset and locks BPM',()=>{
 for(const type of ['trigger','stop','pause','clear','reset']){
  const c=new LoopCore(8000);prepare(c,0);c.command({type:'trigger',track:0});
  run(c,Array(100).fill(.8));c.command({type:'tempo',value:60});assert.equal(c.bpm,120);
  c.command({type,track:0});assert.equal(c.pending,-1);assert.equal(c.countInRemaining,0);
  assert.ok(run(c,Array(65000).fill(.8)).every(x=>x===0));
  assert.equal(c.active,-1);assert.equal(c.length,0);
 }
});
test('count-in metronome stays on if enabled and toggling it does not restart the count',()=>{
 const c=new LoopCore(8000);prepare(c,0);c.command({type:'trigger',track:0});
 run(c,Array(100).fill(0));const remaining=c.countInRemaining,phase=c.beatPhase;
 c.command({type:'metronome',value:true});assert.equal(c.countInRemaining,remaining);assert.equal(c.beatPhase,phase);
 run(c,Array(remaining).fill(0));assert.equal(c.metronome,true);assert.equal(c.active,0);
 assert.ok(run(c,Array(200).fill(0)).some(x=>Math.abs(x)>1e-5));
 assert.ok(c.tracks[0].data.every(x=>x===0));
});
