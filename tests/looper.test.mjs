import test from 'node:test';
import assert from 'node:assert/strict';
import {LoopCore} from '../public/loop-core.js';
const core=()=>new LoopCore(1000,{maxSeconds:60,minSeconds:.004,countInBeats:0});
function prepare(c,i){while(c.tracks.length<=i)c.command({type:'add'});c.command({type:'prepare',track:i,data:new Float32Array(c.capacity)});}
function run(c,input){const output=new Float32Array(input.length);c.process(input,output);return [...output];}
function advance(c,n,value=0){while(n>0){const size=Math.min(n,128);c.process(new Float32Array(size).fill(value),new Float32Array(size));n-=size;}}
function waitStart(c){if(c.pending>=0)advance(c,Math.ceil((c.pendingAt-c.transport-1e-7)/c.speed));}
function record(c,i,samples){prepare(c,i);c.command({type:'record',track:i});waitStart(c);run(c,samples);c.command({type:'stop'});}
test('dynamic tracks and buffer allocation remain lazy',()=>{
 const c=core();for(let i=0;i<30;i++)c.command({type:'add'});
 assert.equal(c.tracks.length,7);assert.ok(c.tracks.every(t=>t.data===null));
 record(c,6,Array(8).fill(.1));assert.equal(c.tracks[6].bars,1);
 c.command({type:'reset'});assert.equal(c.tracks.length,1);assert.equal(c.transport,0);
});
test('capture stops immediately, cycle rounds upward, silence is virtual',()=>{
 const c=core();record(c,0,Array(14000).fill(.25));const t=c.tracks[0];
 assert.equal(t.audioLength,14000);assert.equal(t.bars,8);assert.equal(t.length,16000);
 assert.equal(c.position,14000);assert.equal(c.active,-1);
 assert.ok(run(c,Array(2000).fill(.9)).every(x=>x===0));
 assert.equal(t.audioLength,14000);assert.equal(c.position,0);
});
test('shorten and lengthen are reversible and apply only on common boundaries',()=>{
 const c=core();record(c,0,Array(14000).fill(.25));const t=c.tracks[0],buffer=t.data;
 c.command({type:'shorten',track:0});assert.equal(t.pendingBars,4);assert.equal(t.bars,8);
 advance(c,1999);assert.equal(t.bars,8);advance(c,1);assert.equal(t.bars,4);
 c.command({type:'shorten',track:0});assert.equal(t.bars,2);
 c.command({type:'lengthen',track:0});assert.equal(t.bars,4);
 c.command({type:'lengthen',track:0});assert.equal(t.bars,8);
 assert.equal(t.data,buffer);assert.equal(t.audioLength,14000);assert.equal(t.data[13000],.25);
 c.command({type:'lengthen',track:0});assert.equal(t.pendingBars,16);
 advance(c,16000);assert.equal(t.bars,16);assert.equal(t.length,32000);assert.equal(t.data,buffer);
 advance(c,20000);assert.ok(run(c,Array(100).fill(0)).every(x=>x===0));
 c.command({type:'clear',track:0});assert.equal(c.tracks[0].data,null);
});
test('queued duration can be cancelled and pause freezes its boundary',()=>{
 const c=core();record(c,0,Array(1000).fill(.1));const t=c.tracks[0];
 c.command({type:'lengthen',track:0});c.command({type:'shorten',track:0});assert.equal(t.pendingBars,0);
 c.command({type:'lengthen',track:0});c.command({type:'pause'});const now=c.transport;
 advance(c,10000);assert.equal(c.transport,now);assert.equal(t.bars,1);
 c.command({type:'resume'});advance(c,3000);assert.equal(t.bars,2);
});
test('growing a new take keeps shorter tracks phase aligned even from an odd old cycle',()=>{
 const c=core();record(c,0,Array(1900).fill(.2));
 prepare(c,1);c.command({type:'record',track:1});assert.equal(c.pending,1);
 advance(c,100,9);assert.equal(c.active,1);assert.equal(c.captured,0);
 advance(c,3900,.3);assert.equal(c.active,1);c.command({type:'stop'});
 assert.equal(c.length,4000);assert.equal(c.tracks[1].bars,2);assert.equal(c.position,3900);
 assert.equal(c.tracks[0].position,1900);advance(c,100);
 assert.equal(c.position,0);assert.ok(c.tracks.every(t=>t.position===0));
});
test('overdub affects selected window while hidden original audio survives',()=>{
 const c=core();record(c,0,Array(14000).fill(.25));advance(c,2000);
 c.command({type:'shorten',track:0});c.command({type:'shorten',track:0});assert.equal(c.tracks[0].bars,2);
 record(c,0,Array(4000).fill(.25));
 assert.equal(c.tracks[0].data[2000],.5);assert.equal(c.tracks[0].data[13000],.25);
 assert.equal(c.tracks[0].audioLength,14000);
 c.command({type:'lengthen',track:0});advance(c,4000);c.command({type:'lengthen',track:0});
 advance(c,8000);assert.equal(c.tracks[0].bars,8);advance(c,13000);
 assert.ok(Math.abs(run(c,[0])[0]-.25)<1e-6);
});
test('shared clock survives thousands of cycles, fractional BPM, mute and tempo changes',()=>{
 const c=new LoopCore(100,{maxSeconds:60,minSeconds:.01,countInBeats:0});
 c.command({type:'tempo',value:137});
 record(c,0,Array(150).fill(.1));record(c,1,Array(300).fill(.2));
 for(const bpm of [137,83,219]){
  c.command({type:'tempo',value:bpm});
  for(let i=0;i<2000;i++){
   advance(c,97);
   for(const t of c.tracks)assert.equal(t.position,c.phase(t.length));
   assert.ok(Math.abs(c.tracks[1].position%c.tracks[0].length-c.tracks[0].position)<1e-7);
  }
 }
 c.command({type:'mute',track:0});advance(c,1000);c.command({type:'mute',track:0});
 assert.equal(c.tracks[0].position,c.phase(c.tracks[0].length));
 const pos=c.transport;c.command({type:'pause'});advance(c,100);assert.equal(c.transport,pos);
});
test('pending recording cancels, tempo locks, clear releases data, max capture is bounded',()=>{
 const c=core();record(c,0,Array(1000).fill(.2));prepare(c,1);
 for(const type of ['record','pause','clear']){
  c.command({type:'record',track:1});assert.equal(c.pending,1);
  c.command({type:'tempo',value:60});assert.equal(c.bpm,120);
  c.command({type,track:1});assert.equal(c.pending,-1);
  c.command({type:'resume'});prepare(c,1);
 }
 record(c,1,Array(c.capacity+5).fill(.2));assert.equal(c.active,-1);
 assert.equal(c.tracks[1].audioLength,c.capacity);assert.equal(c.tracks[1].bars,32);
 assert.ok(c.tracks[1].data.every(Number.isFinite));
 c.command({type:'record',track:1});assert.equal(c.pending,-1,'oversized silent cycles explain overdub limit');
 c.command({type:'clear',track:1});assert.equal(c.length,2000);
});
test('resize guards recording, supports cancellation and clamps at 1 and 128 bars',()=>{
 const c=core();record(c,0,Array(2000).fill(.1));
 c.command({type:'record',track:0});c.command({type:'lengthen',track:0});assert.equal(c.tracks[0].pendingBars,0);c.command({type:'stop'});
 for(let i=0;i<20;i++){c.command({type:'lengthen',track:0});if(c.tracks[0].pendingBars)advance(c,Math.ceil((c.tracks[0].changeAt-c.transport)/c.speed));}
 assert.equal(c.tracks[0].bars,128);
 for(let i=0;i<20;i++)c.command({type:'shorten',track:0});
 assert.equal(c.tracks[0].bars,1);
 c.command({type:'lengthen',track:0});c.command({type:'clear',track:0});advance(c,10000);assert.equal(c.length,0);
});
test('new capture and overdub at changed tempo preserve amplitude',()=>{
 for(const bpm of [60,180,240]){
  const c=core();record(c,0,Array(2000).fill(.2));c.command({type:'tempo',value:bpm});
  record(c,0,Array(Math.ceil(2000/c.speed)).fill(.1));
  assert.ok(c.tracks[0].data.slice(10,1990).every(v=>Math.abs(v-.3)<1e-6));
  record(c,1,Array(Math.ceil(4000/c.speed)).fill(.25));
  assert.ok(c.tracks[1].data.slice(10,3990).every(v=>Math.abs(v-.25)<1e-6));
 }
});
test('invalid input and tiny takes cannot corrupt stored audio',()=>{
 const c=core();record(c,0,[NaN]);assert.equal(c.length,0);
 record(c,0,[NaN,Infinity,0,0]);assert.ok(c.tracks[0].data.every(Number.isFinite));
 for(const value of [NaN,Infinity,0,300,'120'])c.command({type:'tempo',value});
 assert.equal(c.bpm,120);c.command(null);c.command({type:'record',track:16});
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
 assert.equal(c.tracks[1].audioLength,7);assert.equal(c.tracks[1].hasAudio,true);
});

test('first take counts exactly eight beats at the selected BPM without capturing input',()=>{
 for(const bpm of [60,120,137,240]){
  const c=new LoopCore(8000);c.command({type:'tempo',value:bpm});prepare(c,0);
  c.command({type:'trigger',track:0});
  const total=Math.round(8000*60/bpm*8);
  assert.equal(c.pending,0);assert.equal(c.active,-1);assert.equal(c.countInRemaining,total);
  assert.equal(c.state().countInBeat,0);
  const output=run(c,Array(total-1).fill(.9));
  assert.ok(output.some(x=>Math.abs(x)>1e-5),'count-in is audible even when metronome is off');
  assert.equal(c.active,-1);assert.equal(c.captured,0);
  assert.ok(c.tracks[0].data.every(x=>x===0));
  run(c,[.9]);assert.equal(c.active,0);assert.equal(c.captured,0);
  assert.equal(c.countInRemaining,0);assert.equal(c.metronome,false);
  run(c,Array(2000).fill(.25));c.command({type:'stop'});
  assert.equal(c.tracks[0].audioLength,2000);assert.ok(c.tracks[0].data.slice(0,2000).every(x=>x===.25));
  prepare(c,1);c.command({type:'record',track:1});
  assert.equal(c.pending,1,'subsequent take waits for the padded cycle');
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

test('fractional bar endings round to the intended cycle, and repeated expansion keeps the origin aligned',()=>{
 const c=new LoopCore(1000,{countInBeats:0});c.command({type:'tempo',value:137});
 record(c,0,Array(Math.ceil(c.barLength)).fill(.1));assert.equal(c.tracks[0].bars,1);
 for(let i=1;i<=3;i++){
  record(c,i,Array(Math.ceil(c.barLength*2**i)).fill(.2));
  assert.equal(c.tracks[i].bars,2**i);
  const short=c.phase(c.tracks[0].length);
  for(const t of c.tracks)assert.ok(Math.abs(c.phase(t.length)%c.tracks[0].length-short)<1e-6);
 }
});
test('audible impulses from short and long tracks coincide every shared cycle',()=>{
 const c=core(),short=new Float32Array(1900),long=new Float32Array(3900);
 short[20]=.25;long[20]=.5;record(c,0,short);record(c,1,long);advance(c,100);
 const output=run(c,new Float32Array(4000*1000));
 for(let cycle=0;cycle<1000;cycle++){
  assert.equal(output[cycle*4000+20],.75);
  assert.equal(output[cycle*4000+2020],.25);
 }
});

test('track volume is reversible playback gain, smoothed and isolated from capture',()=>{
 const c=core();record(c,0,Array(2000).fill(.2));prepare(c,1);
 const original=c.tracks[0].data.slice();
 assert.equal(c.tracks[0].volume,70);
 c.command({type:'volume',track:0,value:100});advance(c,100);
 assert.ok(Math.abs(c.tracks[0].gain-100/70)<1e-10);
 const louder=run(c,Array(20).fill(0));assert.ok(louder.every(v=>Math.abs(v-.2*100/70)<1e-6));
 c.command({type:'volume',track:0,value:0});
 const fade=run(c,Array(1).fill(0));assert.ok(fade[0]>0,'gain ramps instead of jumping');
 advance(c,100);assert.ok(run(c,Array(20).fill(0)).every(v=>v===0));
 assert.deepEqual(c.tracks[0].data,original);
 assert.equal(c.tracks[1].volume,70);
 c.command({type:'volume',track:0,value:35});advance(c,100);
 assert.ok(run(c,Array(20).fill(0)).every(v=>Math.abs(v-.1)<1e-6));
 c.command({type:'mute',track:0});advance(c,100);assert.equal(c.tracks[0].gain,0);
 c.command({type:'mute',track:0});advance(c,100);assert.equal(c.tracks[0].gain,.5);
 c.command({type:'volume',track:0,value:NaN});assert.equal(c.tracks[0].volume,35);
 c.command({type:'volume',track:0,value:200});assert.equal(c.tracks[0].volume,100);
 c.command({type:'volume',track:0,value:-1});assert.equal(c.tracks[0].volume,0);
 c.command({type:'clear',track:0});assert.equal(c.tracks[0].volume,0);
 record(c,0,Array(100).fill(.3));assert.ok(Math.abs(c.tracks[0].data[50]-.3)<1e-6,'zero playback volume does not erase input');
 c.command({type:'reset'});assert.equal(c.tracks[0].volume,70);
});
test('four-bar guide survives closing the first take and per-track phase follows shared transport',()=>{
 const c=core();assert.equal(c.state().baseSeconds,8);
 record(c,0,Array(100).fill(.2));assert.equal(c.state().baseSeconds,8);
 advance(c,250);assert.equal(c.state().tracks[0].position,c.transport%c.tracks[0].length);
});

test('independent track outputs remain phase aligned and master output only carries click',()=>{
 const c=core();record(c,0,Array(2000).fill(.2));record(c,1,Array(2000).fill(.4));advance(c,100);
 const output=new Float32Array(128),tracks=Array.from({length:7},()=>new Float32Array(128));
 c.process(new Float32Array(128),output,tracks);
 assert.ok(output.every(v=>v===0));assert.ok(tracks[0].every(v=>Math.abs(v-.2)<1e-6));assert.ok(tracks[1].every(v=>Math.abs(v-.4)<1e-6));assert.ok(tracks[2].every(v=>v===0));
 c.command({type:'mute',track:0});advance(c,100);c.process(new Float32Array(128),output,tracks);
 assert.ok(tracks[0].every(v=>v===0));assert.ok(tracks[1].every(v=>Math.abs(v-.4)<1e-6));
});
