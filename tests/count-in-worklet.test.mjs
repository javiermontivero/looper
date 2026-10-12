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

test('audio snapshots copy bounded chunks and cancel if recording changes the source',async()=>{
 const source=(await readFile(new URL('../public/loop-worklet.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
 const messages=[];let Processor;
 class AudioWorkletProcessor{constructor(){this.port={postMessage:s=>messages.push(s)};}}
 vm.runInNewContext(source,{LoopCore,sampleRate:8000,AudioWorkletProcessor,registerProcessor:(name,ctor)=>{Processor=ctor;}});
 const p=new Processor(),c=p.core;c.countInBeats=0;
 c.command({type:'prepare',track:0,data:new Float32Array(c.capacity)});c.command({type:'record',track:0});
 c.process(new Float32Array(12000).fill(.25),new Float32Array(12000));c.command({type:'stop'});
 p.port.onmessage({data:{type:'snapshot',id:1}});
 const start=messages.find(m=>m.type==='snapshot-start');assert.equal(start.snapshot.tracks[0].audioLength,12000);
 for(let i=0;i<4;i++)p.process([[new Float32Array(128)]],Array.from({length:8},()=>[new Float32Array(128)]));
 const chunks=messages.filter(m=>m.type==='snapshot-chunk');
 assert.equal(chunks.length,3);assert.ok(chunks.every(m=>m.data.length<=4096&&m.data.every(v=>v===.25)));
 assert.ok(messages.some(m=>m.type==='snapshot-end'&&m.id===1));
 p.port.onmessage({data:{type:'snapshot',id:2}});c.command({type:'mute',track:0});
 p.process([[new Float32Array(128)]],[[new Float32Array(128)]]);
 assert.ok(messages.some(m=>m.type==='snapshot-cancel'&&m.id===2));
 assert.ok(!messages.some(m=>m.type==='snapshot-end'&&m.id===2));
});
