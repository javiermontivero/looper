import test from 'node:test';
import assert from 'node:assert/strict';
import {LatencyStats,safetyCurve} from '../public/latency.js';
test('bounded latency telemetry distinguishes missing measurements from zero and resets',()=>{
 const s=new LatencyStats(4);assert.equal(s.summary('note'),null);
 for(const v of [500,0,1,2,3])s.add('note',v);
 s.add('note',NaN);s.add('note',-1);
 assert.deepEqual(s.summary('note'),{count:4,median:1,p95:3,max:3});
 s.task(70);s.task(100);assert.equal(s.longTasks,2);assert.equal(s.longestTask,100);
 s.reset();assert.equal(s.summary('note'),null);assert.equal(s.longTasks,0);
});
test('memoryless output safety curve is symmetric, bounded and transparent at ordinary levels',()=>{
 const curve=safetyCurve();assert.equal(curve[2048],0);
 for(let i=0;i<curve.length;i++){
  assert.ok(Number.isFinite(curve[i])&&Math.abs(curve[i])<=1);
  assert.ok(Math.abs(curve[i]+curve[curve.length-1-i])<1e-6);
  if(i)assert.ok(curve[i]>=curve[i-1]);
  const x=i*2/(curve.length-1)-1;if(Math.abs(x)<=.8)assert.ok(Math.abs(curve[i]-x)<1e-6);
 }
});
