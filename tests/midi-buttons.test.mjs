import test from 'node:test';
import assert from 'node:assert/strict';
import {TrackButtons,buttonDown,decode,learnMapping} from '../public/midi.js';
function setup(dispatch){
 const actions=[],timers=new Map();let id=0;
 const buttons=new TrackButtons(dispatch||((...action)=>actions.push(action)),{
  schedule:fn=>{timers.set(++id,fn);return id;},cancel:i=>timers.delete(i)
 });
 const fire=()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}};
 return {buttons,actions,timers,fire};
}
test('CC 1 and 127 are presses, CC 0 and note-off are releases',()=>{
 for(const v of [1,63,64,127])assert.equal(buttonDown(decode([0xb0,20,v])),true);
 assert.equal(buttonDown(decode([0xb0,20,0])),false);
 assert.equal(buttonDown(decode([0x80,60,127])),false);
 assert.equal(learnMapping('track0',decode([0xb0,20,0]),'a'),null);
 assert.equal(learnMapping('volume',decode([0xb0,20,0]),'a').number,20);
});
test('short press fires once on down, repeats and release do not toggle again',async()=>{
 const {buttons,actions,timers}=setup();
 buttons.handle(0,true);buttons.handle(0,true);buttons.handle(0,false);
 await buttons.pending;assert.deepEqual(actions,[['trigger',0]]);assert.equal(timers.size,0);
 buttons.handle(0,true);buttons.handle(0,false);await buttons.pending;assert.equal(actions.length,2);
});
test('hold clears only its track once, and release does not start a new take',async()=>{
 const {buttons,actions,fire}=setup();buttons.handle(2,true);await buttons.pending;
 fire();await buttons.pending;buttons.handle(2,true);fire();buttons.handle(2,false);await buttons.pending;
 assert.deepEqual(actions,[['trigger',2],['clear',2]]);
});
test('learning suppresses held key, cancellation stops pending deletion and queued presses',async()=>{
 const {buttons,actions,fire}=setup();buttons.suppress(0);buttons.handle(0,true);fire();
 buttons.handle(0,false);await buttons.pending;assert.equal(actions.length,0);
 buttons.handle(0,true);await buttons.pending;buttons.reset();fire();await buttons.pending;
 assert.deepEqual(actions,[['trigger',0]]);
 buttons.handle(1,true);buttons.reset();await buttons.pending;assert.equal(actions.length,1);
});
test('slow engine startup cannot reorder a second press or a held clear',async()=>{
 let ready;const gate=new Promise(resolve=>{ready=resolve;}),actions=[];
 const {buttons,fire}=setup(async(type,track)=>{if(!actions.length)await gate;actions.push([type,track]);});
 buttons.handle(0,true);buttons.handle(0,false);buttons.handle(0,true);fire();
 await Promise.resolve();assert.equal(actions.length,0);ready();await buttons.pending;
 assert.deepEqual(actions,[['trigger',0],['trigger',0],['clear',0]]);
});
