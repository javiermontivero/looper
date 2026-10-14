import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioEngine} from '../public/audio-engine.js';
import {createAudioRuntime,loadTone} from '../public/tone-runtime.js';
import {fakeAudio,Node} from './fake-audio.mjs';

test('Tone shares the native context and has no scheduling look-ahead',()=>{
 const fake=fakeAudio(),audio=createAudioRuntime(fake.Tone,fake.rawContext);
 assert.equal(audio.context.rawContext,fake.rawContext);
 assert.equal(audio.context.lookAhead,0);
 assert.equal(audio.Tone.activeContext,audio.context);
 const engine=new AudioEngine(audio);
 assert.ok(fake.created.every(n=>n.options.context===audio.context));
 assert.equal(engine.safety.oversample,'none');
 assert.deepEqual(engine.safety.output.links,[engine.master.input]);
 assert.deepEqual(engine.master.output.links,[fake.rawContext.destination]);
 engine.volume(.4);assert.deepEqual(engine.master.gain.events.at(-1),{value:.4,time:3,constant:.015});
 engine.dispose();assert.ok(fake.created.every(n=>n.disposed));
});

test('replaceable source feeds dry capture once, selected track FX cannot feed back',()=>{
 const audio=fakeAudio(),engine=new AudioEngine(audio);
 const first={output:new Node(audio.rawContext)},next={output:new Node(audio.rawContext)};
 engine.setSource(first);engine.setSource(first);
 const recorder=new Node(audio.rawContext);engine.capture.connect(recorder);
 assert.deepEqual(first.output.links,[engine.bus.input]);
 engine.mixer.select(2);engine.setSource(next);
 assert.deepEqual(first.output.links,[]);
 assert.deepEqual(next.output.links,[engine.bus.input]);
 assert.deepEqual(engine.capture.links,[recorder,engine.mixer.tracks[2].input]);
 assert.throws(()=>engine.setSource({output:new Node({})}),/mismo AudioContext/);
 assert.equal(engine.source,next,'invalid replacement preserves current input');
 next.output.disconnect();engine.setSource(null);assert.deepEqual(next.output.links,[]);
 engine.dispose();engine.dispose();
});

test('click is monitor-only and its nodes are reclaimed, including engine shutdown',()=>{
 const audio=fakeAudio(),engine=new AudioEngine(audio),oscillators=[],gains=[];
 audio.rawContext.createOscillator=()=>{const n=new Node(audio.rawContext);oscillators.push(n);return n;};
 audio.rawContext.createGain=()=>{const n=new Node(audio.rawContext);gains.push(n);return n;};
 engine.testClick();assert.deepEqual(gains[0].links,[engine.master.input]);
 assert.equal(oscillators[0].started,3);assert.equal(oscillators[0].stopped,3.04);
 oscillators[0].onended();assert.deepEqual(gains[0].links,[]);assert.equal(engine.clicks.size,0);
 engine.testClick();engine.dispose();assert.equal(engine.clicks.size,0);assert.deepEqual(gains[1].links,[]);
});

test('activation resumes before library download and failure closes context for a clean retry',async()=>{
 const audio=fakeAudio(),events=[];
 class Context{constructor(){Object.assign(this,audio.rawContext);this.resume=async()=>events.push('resume');this.close=async()=>events.push('close');}}
 await assert.rejects(AudioEngine.create({Context,loadLibrary:async()=>{events.push('load');throw Error('offline');}}),/offline/);
 assert.deepEqual(events,['resume','load','close']);
 const engine=await AudioEngine.create({Context,loadLibrary:async()=>audio.Tone});
 assert.equal(engine.audio.context.lookAhead,0);engine.dispose();
});

test('Tone bundle load failures are retryable instead of caching a rejected promise',async()=>{
 const scripts=[];globalThis.document={createElement:()=>({remove(){this.removed=true;}}),head:{append:s=>scripts.push(s)}};
 try{
  const first=loadTone(),shared=loadTone();assert.equal(first,shared);assert.equal(scripts.length,1);
  scripts[0].onerror();await assert.rejects(first,/cargar Tone/);assert.equal(scripts[0].removed,true);
  const retry=loadTone();assert.equal(scripts.length,2);
  globalThis.Tone={version:'15.1.22'};scripts[1].onload();assert.equal(await retry,globalThis.Tone);
 }finally{delete globalThis.document;delete globalThis.Tone;}
});
