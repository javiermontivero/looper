import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import vm from 'node:vm';
import {decode,matches,learnMapping} from '../public/midi.js';
import {Synth,PRESETS,frequency,playableVelocity} from '../public/synth.js';
import {handler} from '../server.mjs';
test('MIDI zero velocity, channels, malformed packets and pitch bend',()=>{
 assert.deepEqual(decode([0x92,60,0]),{type:'off',channel:2,number:60,value:0});
 assert.equal(decode([0x90,60]),null);assert.equal(decode([0xf8]),null);
 assert.equal(decode([0xe0,0,64]).value,8192);
 assert.equal(decode([0xe0,127,127]).value,16383);
 assert.equal(decode([0x90,60,200]),null);
});
test('MIDI learning reserves pedals and matches device and channel',()=>{
 const e=decode([0x91,60,100]),m=learnMapping('next',e,'keyboard');
 assert.ok(matches(m,e,'keyboard'));assert.ok(!matches(m,e,'other'));
 assert.ok(!matches(m,{...e,channel:0},'keyboard'));
 assert.ok(matches(m,{...e,type:'off'},'keyboard'));
 assert.equal(learnMapping('volume',e,'keyboard'),null);
 assert.equal(learnMapping('volume',decode([0xb0,64,127]),'keyboard'),null);
});
class Param{constructor(){this.value=0;this.calls=[];}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}exponentialRampToValueAtTime(v){this.value=v;}setTargetAtTime(v){this.value=v;}cancelAndHoldAtTime(t){this.calls.push(t);}}
class Node{constructor(){for(const p of ['gain','frequency','detune','Q','threshold','ratio','knee','attack','release'])this[p]=new Param();}connect(node){this.destination=node;}disconnect(){this.disconnected=true;}start(){}stop(t){this.stopped=t;}}
function context(){return{currentTime:1,sampleRate:48000,destination:{},createGain:()=>new Node(),createOscillator:()=>new Node(),createBiquadFilter:()=>new Node(),createWaveShaper:()=>new Node()};}
test('Sustain holds released notes only on its own channel',()=>{
 const s=new Synth(context());s.pedal('a',true);s.noteOn('a1',60,100,'a');s.noteOn('b1',64,100,'b');
 s.noteOff('a1');s.noteOff('b1');assert.equal(s.voices.get('a1').released,false);assert.equal(s.voices.get('b1').released,true);
 s.pedal('a',false);assert.equal(s.voices.get('a1').released,true);
});
test('Retrigger cleanup cannot delete replacement voice and panic clears pedal/bend',()=>{
 const s=new Synth(context());s.noteOn('x',60);const first=s.voices.get('x');s.noteOn('x',62);first.carrier.onended();assert.equal(s.voices.get('x').note,62);
 s.bend('local',16383);assert.ok(s.voices.get('x').carrier.detune.value>199);s.pedal('local',true);s.panic();
 assert.equal(s.voices.size,0);assert.equal(s.sustain.size,0);assert.equal(s.bends.size,0);
});
test('Voice budget and preset changes preserve existing sound',()=>{
 const s=new Synth(context());for(let i=0;i<40;i++)s.noteOn(String(i),i+30);assert.equal(s.voices.size,32);
 const v=s.voices.get('39');s.preset=PRESETS[6];assert.equal(v.release,PRESETS[0].release);
 assert.equal(frequency(69),440);
});
test('Browser app parses and all HTML resources exist',async()=>{
 const js=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 new vm.Script(js.replace(/^import .*;$/gm,''));
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 for(const m of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g))await readFile(new URL('../public/'+m[1],import.meta.url));
});
test('HTTP serves health and prefixed assets; refuses paths outside allowlist',async()=>{
 const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await(await fetch(base+'/health')).json()).status,'ok');
  const html=await fetch(base+'/looper/');assert.equal(html.status,200);assert.match(await html.text(),/<title>Looper<\/title>/);
  const js=await fetch(base+'/looper/app.js');assert.match(js.headers.get('content-type'),/javascript/);
  assert.match(js.headers.get('permissions-policy'),/midi/);
  assert.equal((await fetch(base+'/server.mjs')).status,404);
  assert.equal((await fetch(base+'/looper/setup-https.sh')).status,200);
  for(const asset of ['looper.js','loop-core.js','loop-worklet.js','loops.css'])assert.equal((await fetch(base+'/looper/'+asset)).status,200,asset);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('monitor uses a memoryless safety stage and diagnostic click bypasses capture',()=>{
 const c=context(),oscillators=[],gains=[];
 c.createOscillator=()=>{const n=new Node();oscillators.push(n);return n;};
 c.createGain=()=>{const n=new Node();gains.push(n);return n;};
 c.createDynamicsCompressor=()=>{throw Error('look-ahead must not return');};
 const s=new Synth(c);assert.equal(s.input.destination,s.compressor);assert.equal(s.compressor.oversample,'none');
 assert.equal(s.compressor.destination,s.master);assert.equal(s.master.destination,c.destination);
 s.testClick();const osc=oscillators[0],amp=gains.at(-1);
 assert.equal(amp.destination,s.master);assert.notEqual(amp.destination,s.input);
 assert.ok(osc.stopped<=c.currentTime+.041);osc.onended();assert.equal(amp.disconnected,true);
});

test('velocity curve preserves ordering, raises quiet strikes and keeps release and peak unchanged',()=>{
 assert.equal(playableVelocity(0),0);assert.equal(playableVelocity(NaN),0);assert.equal(playableVelocity(-1),0);
 assert.equal(playableVelocity(1),36);assert.equal(playableVelocity(127),127);assert.equal(playableVelocity(200),127);
 for(let v=2;v<=127;v++){assert.ok(playableVelocity(v)>playableVelocity(v-1));assert.ok(playableVelocity(v)>=v);}
 const synth=new Synth(context());synth.noteOn('soft',60,1);
 assert.ok(Math.abs(synth.voices.get('soft').amp.gain.value-.18*(36/127)*PRESETS[0].sustain)<1e-9);
 synth.noteOn('soft',60,0);assert.equal(synth.voices.get('soft').released,true);
});
