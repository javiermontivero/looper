import test from 'node:test';
import assert from 'node:assert/strict';
import {Looper} from '../public/looper.js';

test('track count includes queued additions before worklet state arrives and resets immediately',()=>{
 const previous=globalThis.AudioWorkletNode;
 const messages=[];
 globalThis.AudioWorkletNode=class {
  constructor(){this.port={postMessage:message=>messages.push(message)};}
  connect(){}
 };
 try{
  const looper=new Looper({sampleRate:1000},{connect(){}},{},()=>{},()=>{});
  assert.equal(looper.trackCount,1);
  looper.command('add');looper.command('add');
  assert.equal(looper.trackCount,3);
  looper.node.port.onmessage({data:{tracks:[{hasAudio:false}],active:-1,pending:-1}});
  assert.equal(looper.trackCount,3,'an older worklet snapshot cannot cause duplicate additions');
  for(let i=looper.trackCount;i<=2;i++)looper.command('add');
  assert.equal(messages.filter(m=>m.type==='add').length,2);
  for(let i=0;i<20;i++)looper.command('add');
  assert.equal(looper.trackCount,16);
  assert.equal(messages.filter(m=>m.type==='add').length,15);
  looper.command('reset');assert.equal(looper.trackCount,1);
  looper.command('add');assert.equal(looper.trackCount,2);
 }finally{
  if(previous===undefined)delete globalThis.AudioWorkletNode;
  else globalThis.AudioWorkletNode=previous;
 }
});
