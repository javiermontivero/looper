import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {PRESETS} from '../public/instruments.js';
import {decode,matches,learnMapping,buttonDown,TrackButtons} from '../public/midi.js';
import {LatencyStats} from '../public/latency.js';
import {LoopCore} from '../public/loop-core.js';

test('UI boots and track buttons actually start, close, overdub and mute captured audio',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const source=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
 class Element{
  constructor(){this.style={};this.dataset={};this.children=[];this.attrs={};this.classList={toggle(){}};this.queries=new Map();}
  setAttribute(k,v){this.attrs[k]=v;}
  append(...children){this.children.push(...children);for(const c of children)if(c.id)ids.set(c.id,c);}
  replaceChildren(...children){this.children=[...children];}
  remove(){ids.delete(this.id);}
  set innerHTML(html){this.localButtons=[...html.matchAll(/<button\b([^>]*)>/g)].map(m=>{const e=new Element();for(const a of m[1].matchAll(/data-([a-z-]+)="([^"]+)"/g))e.dataset[a[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=a[2];buttons.push(e);if(e.dataset.loopAction)actions.push(e);return e;});}
  querySelectorAll(selector){return (this.localButtons||[]).filter(b=>selector==='[data-learn]'?b.dataset.learn:b.dataset.loopAction);}
  querySelector(selector){if(!this.queries.has(selector))this.queries.set(selector,new Element());return this.queries.get(selector);}
 }
 const ids=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const buttons=[...html.matchAll(/<button\b([^>]*)>/g)].map(m=>{
  const e=new Element();
  for(const a of m[1].matchAll(/data-([a-z-]+)="([^"]+)"/g)){
   const key=a[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());e.dataset[key]=a[2];
  }
  return e;
 });
 const actions=buttons.filter(b=>b.dataset.loopAction);
 assert.equal(actions.length,3);
 ids.get('track-0').localButtons=buttons.filter(b=>b.dataset.track==='0'||b.dataset.learn==='track0');
 const document={hidden:false,activeElement:null,
  querySelector:selector=>selector.startsWith('#')?(ids.get(selector.slice(1))||null):document.querySelectorAll(selector)[0]||null,
  querySelectorAll:selector=>{
   if(selector==='[data-loop-action]')return actions;
   if(selector==='[data-learn]')return buttons.filter(b=>b.dataset.learn);
   if(selector==='[data-filter]')return buttons.filter(b=>b.dataset.filter);
   if(selector==='.key')return ids.get('keyboard').children;
   throw new Error('Unhandled selector '+selector);
  },
  createElement:()=>new Element(),addEventListener(){}
 };
 let core,publish;
 const engine={get trackCount(){return core.tracks.length;},command(type,track,value){
  if((type==='record'||type==='trigger')&&!core.tracks[track].data)core.command({type:'prepare',track,data:new Float32Array(core.capacity)});
  core.command({type,track,value});publish();
 }};
 const FakeLooper={async create(ctx,src,dest,onState){
  core=new LoopCore(1000);publish=()=>{engine.state=core.state();onState(engine.state);};return engine;
 }};
 class AudioContext{constructor(){this.state='running';this.sampleRate=1000;}async resume(){}}
 const played=[];
 class Synth{noteOn(...args){played.push(args);}constructor(){this.input={};this.compressor={};}volume(){}panic(){}noteOff(){}selectPreset(p){this.preset=p;this.ready=true;return Promise.resolve(true);}}
 const holds=new Map();let timerId=0;
 class TestTrackButtons extends TrackButtons{
  constructor(dispatch,options){super(dispatch,{...options,schedule:fn=>{const id=++timerId;holds.set(id,fn);return id;},cancel:id=>holds.delete(id)});}
 }
 const globals={document,window:{isSecureContext:false,addEventListener(){}},
  navigator:{},localStorage:{getItem(key){return key==='looper:mappings'?JSON.stringify({next:{device:'keyboard',channel:0,type:'note',number:32},track0:{device:'keyboard',channel:0,type:'cc',number:20}}):null;},setItem(){}},
  requestAnimationFrame:callback=>setImmediate(callback),
  matchMedia:()=>({matches:true,addEventListener(){}}),confirm:()=>true,
  setTimeout,clearTimeout,performance,
  AudioContext,Synth,PRESETS,LatencyStats,Looper:FakeLooper,decode,matches,learnMapping,buttonDown,TrackButtons:TestTrackButtons};
 vm.runInNewContext(source,globals);
 assert.equal(ids.get('sound').children.flatMap(group=>group.children).length,19,'dropdown must contain every preset');
 for(const button of actions)assert.equal(typeof button.onclick,'function','all track controls must be connected');
 const sendPad=(number,value,status=0x90,device='keyboard')=>globals.process({data:[status,number,value]},device);
 const settle=()=>new Promise(setImmediate);
 const finishCountIn=()=>{if(core.countInRemaining){core.process(new Float32Array(core.countInRemaining),new Float32Array(core.countInRemaining));publish();}};
 sendPad(45,0);await settle();assert.equal(core,undefined,'release alone cannot create a track or audio engine');
 const initialSound=ids.get('sound').value;
 sendPad(32,127);sendPad(32,0);await settle();
 assert.equal(ids.get('sound').value,initialSound,'pad overrides an old preset mapping');assert.equal(played.length,0,'pad never plays the synth');
 assert.equal(core.tracks.length,2,'first note 32 adds only its own track');
 assert.equal(ids.get('track-1').attrs['aria-label'],'Pista 3');
 assert.equal(core.pending,1,'first pad enters count-in');assert.equal(core.active,-1);
 assert.ok(ids.get('loop-time').textContent.startsWith('Entrada 1/2'));
 assert.equal(ids.get('tempo').disabled,true);
 assert.equal(ids.get('count-in').hidden,false);assert.equal(ids.get('count-in-number').textContent,'1');
 core.process(new Float32Array(3500),new Float32Array(3500));publish();
 assert.equal(ids.get('count-in-label').textContent,'COMPÁS 2 DE 2');
 assert.equal(ids.get('count-in-number').textContent,'4');assert.equal(ids.get('count-in').dataset.stage,'last');
 finishCountIn();assert.equal(ids.get('count-in-number').textContent,'¡REC!');

 assert.equal(core.active,1,'release during count-in does not cancel recording');
 assert.equal(ids.get('volume').value,65,'pad never adjusts volume');
 assert.equal(core.tracks[0].data,null,'unused initial track allocates no audio');
 core.process(new Float32Array(300).fill(.25),new Float32Array(300));
 sendPad(32,127);sendPad(32,0);await settle();assert.equal(core.active,-1);assert.equal(core.tracks[1].hasAudio,true);
 ids.get('loop-reset').onclick();assert.equal(core.tracks.length,1);
 sendPad(20,127);sendPad(20,0);await settle();assert.equal(core.active,-1,'legacy learned track assignments are ignored');

 const click=async(type,track)=>{actions.find(b=>b.dataset.loopAction===type&&b.dataset.track===String(track)).onclick();await new Promise(setImmediate);};
 await click('record',0);
 assert.equal(core.pending,0);finishCountIn();
 assert.equal(core.active,0,'click starts capture after the count-in');
 core.process(new Float32Array(1000).fill(.25),new Float32Array(1000));publish();
 assert.equal(ids.get('track-0').querySelector('.track-state').textContent,'REC');
 await click('record',0);
 assert.equal(core.length,1000);assert.equal(core.tracks[0].hasAudio,true);
 assert.equal(ids.get('track-0').querySelector('[data-loop-action="record"]').textContent,'Overdub');
 await click('record',0);core.process(new Float32Array(1000).fill(.25),new Float32Array(1000));await click('record',0);
 assert.equal(core.tracks[0].data[500],.5);
 await click('mute',0);assert.equal(core.tracks[0].muted,true);
 await click('mute',0);assert.equal(core.tracks[0].muted,false);
 for(let i=1;i<16;i++){
  ids.get('add-track').onclick();
  assert.equal(core.tracks.length,i+1);
 }
 assert.equal(ids.get('add-track').disabled,true);
 await click('record',15);core.process(new Float32Array(1300).fill(.1),new Float32Array(1300));
 await click('record',15);assert.equal(core.tracks[15].length,1300);assert.equal(core.length,1300);
 ids.get('tempo').onchange({target:{value:'180'}});assert.equal(core.speed,1.5);
 ids.get('tempo').value='19';publish();assert.equal(ids.get('tempo').value,'19');
 await click('record',0);assert.equal(ids.get('tempo').disabled,true);await click('record',0);assert.equal(ids.get('tempo').disabled,false);
 await click('clear',15);assert.equal(core.length,1000);
 core.process(new Float32Array(10),new Float32Array(10));
 const midi=value=>globals.process({data:[0x90,33,value]},'keyboard');
 const flush=()=>new Promise(setImmediate);
 midi(1);await flush();assert.equal(core.pending,3,'velocity 1 arms an empty track');
 midi(1);await flush();assert.equal(core.pending,3,'duplicate Note On does not cancel it');
 midi(0);core.process(new Float32Array(Math.ceil((core.length-core.position)/core.speed)).fill(0),new Float32Array(Math.ceil((core.length-core.position)/core.speed)));core.process(new Float32Array(300).fill(.2),new Float32Array(300));publish();
 midi(127);await flush();assert.equal(core.active,-1,'next press closes the take');midi(0);
 midi(1);await flush();assert.equal(core.tracks[3].muted,true);midi(0);
 midi(1);await flush();assert.equal(core.tracks[3].muted,false);midi(0);
 midi(1);await flush();
 for(const fn of [...holds.values()])fn();holds.clear();await flush();
 assert.equal(core.tracks[3].hasAudio,false,'holding clears the mapped track');
 midi(0);await flush();assert.equal(core.active,-1,'release after clear cannot restart recording');
 await ids.get('metronome').onclick();
 assert.equal(core.metronome,true);assert.equal(ids.get('metronome').attrs['aria-pressed'],'true');
 await ids.get('metronome').onclick();assert.equal(core.metronome,false);
 ids.get('loop-reset').onclick();assert.equal(core.tracks.length,1);assert.equal(ids.has('track-15'),false);
 globals.process({data:[0xb0,45,127]},'keyboard');await flush();
 assert.equal(core.tracks.length,1,'CC45 no longer creates a track');
 const previousPlayed=played.length;
 sendPad(45,127,0x91);sendPad(45,0,0x91);await flush();
 assert.equal(core.tracks.length,1,'same note on another channel is not a pad');
 assert.equal(played.length,previousPlayed+1,'other channels still play the instrument');
 sendPad(46,127);sendPad(29,127);sendPad(45,0);await flush();
 assert.equal(core.tracks.length,1,'out-of-range notes and release do not add tracks');
 sendPad(45,127,0x90,'reconnected-keyboard');sendPad(45,127,0x90,'reconnected-keyboard');await flush();
 assert.equal(core.tracks.length,2,'note 45 adds only its own track, without intermediate rows');
 assert.equal(core.pending,1);finishCountIn();
 assert.equal(core.active,1,'fixed controls work on channel 1 after device ID changes');
 assert.equal(ids.get('track-1').attrs['aria-label'],'Pista 16');assert.equal(ids.get('add-track').disabled,false);
 assert.equal(core.tracks[0].data,null,'only the selected track reserves audio');
 sendPad(45,64,0x80,'reconnected-keyboard');await flush();assert.equal(core.active,1);
 for(const fn of [...holds.values()])fn();holds.clear();await flush();
 assert.equal(core.active,1,'release cancels hold-to-clear');
 core.process(new Float32Array(300).fill(.25),new Float32Array(300));
 sendPad(45,127,0x90,'reconnected-keyboard');await flush();assert.equal(core.active,-1);
 for(const fn of [...holds.values()])fn();holds.clear();await flush();
 assert.equal(core.tracks[1].hasAudio,false,'hold clears a track created by its fixed note');
 sendPad(45,0,0x90,'reconnected-keyboard');await flush();assert.equal(core.active,-1);
 sendPad(31,127);sendPad(31,0);await flush();
 assert.equal(core.tracks.length,3);assert.equal(core.pending,2);finishCountIn();assert.equal(core.active,2,'note 31 gets its own new slot after note 45');
 assert.equal(ids.get('track-2').attrs['aria-label'],'Pista 2');
 core.process(new Float32Array(300).fill(.25),new Float32Array(300));
 sendPad(31,127);sendPad(31,0);await flush();assert.equal(core.active,-1);
 sendPad(31,127);sendPad(31,0);await flush();assert.equal(core.tracks[2].muted,true);
 assert.equal(core.tracks.length,3,'reusing note 31 does not add a duplicate');
 ids.get('add-track').onclick();assert.equal(core.tracks.length,4);
 assert.equal(ids.get('track-3').attrs['aria-label'],'Pista 3','manual add chooses the first unused pad note');
 sendPad(32,127);sendPad(32,0);await flush();
 assert.equal(core.tracks.length,4,'note 32 reuses the manually added track');
 assert.ok(core.active===3||core.pending===3);



});
