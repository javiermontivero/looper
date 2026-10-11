import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {LoopCore} from '../public/loop-core.js';
test('worklet publishes every count-in beat while transport is empty and signals recording start',async()=>{
 const source=(await readFile(new URL('../public/loop-worklet.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
 const messages=[];let Processor;
 class AudioWorkletProcessor{constructor(){this.port={postMessage:s=>messages.push(s)};}}
 vm.runInNewContext(source,{LoopCore,sampleRate:8000,AudioWorkletProcessor,registerProcessor:(name,ctor)=>{Processor=ctor;}});
 const processor=new Processor(),core=processor.core;
 processor.port.onmessage({data:{type:'prepare',track:0,data:new Float32Array(core.capacity)}});
 processor.port.onmessage({data:{type:'record',track:0}});
 for(let n=0;n<250;n++)processor.process([[new Float32Array(128).fill(.5)]],[[new Float32Array(128)]]);
 const beats=messages.filter(s=>s.countInRemaining>0).map(s=>s.countInBeat);
 assert.deepEqual([...new Set(beats)],[0,1,2,3,4,5,6,7]);
 assert.equal(messages.at(-1).active,0);assert.equal(messages.at(-1).countInRemaining,0);
 assert.equal(core.captured,0,'recording begins after all eight beats');
 processor.process([[new Float32Array(128).fill(.25)]],[[new Float32Array(128)]]);
 assert.equal(core.captured,128);assert.ok(core.tracks[0].data.slice(0,128).every(x=>x===.25));
});
