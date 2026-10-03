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
 const engine={command(type,track,value){
  if((type==='record'||type==='trigger')&&!core.tracks[track].data)core.command({type:'prepare',track,data:new Float32Array(core.capacity)});
  core.command({type,track,value});publish();
 }};
 const FakeLooper={async create(ctx,src,dest,onState){
  core=new LoopCore(1000);publish=()=>{engine.state=core.state();onState(engine.state);};return engine;
 }};
 class AudioContext{constructor(){this.state='running';this.sampleRate=1000;}async resume(){}}
 class Synth{constructor(){this.input={};this.compressor={};}volume(){}panic(){}noteOff(){}selectPreset(p){this.preset=p;this.ready=true;return Promise.resolve(true);}}
 const holds=new Map();let timerId=0;
 class TestTrackButtons extends TrackButtons{
  constructor(dispatch,options){super(dispatch,{...options,schedule:fn=>{const id=++timerId;holds.set(id,fn);return id;},cancel:id=>holds.delete(id)});}
 }
 const globals={document,window:{isSecureContext:false,addEventListener(){}},
  navigator:{},localStorage:{getItem(){return null;},setItem(){}},
  requestAnimationFrame:callback=>setImmediate(callback),
  matchMedia:()=>({matches:true,addEventListener(){}}),confirm:()=>true,
  setTimeout,clearTimeout,performance,
  AudioContext,Synth,PRESETS,LatencyStats,Looper:FakeLooper,decode,matches,learnMapping,buttonDown,TrackButtons:TestTrackButtons};
 vm.runInNewContext(source,globals);
 assert.equal(ids.get('sound').children.flatMap(group=>group.children).length,19,'dropdown must contain every preset');
 for(const button of actions)assert.equal(typeof button.onclick,'function','all track controls must be connected');
 const click=async(type,track)=>{actions.find(b=>b.dataset.loopAction===type&&b.dataset.track===String(track)).onclick();await new Promise(setImmediate);};
 await click('record',0);
 assert.equal(core.active,0,'click starts capture');
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
 const midi=value=>globals.process({data:[0xb0,20,value]},'keyboard');
 const flush=()=>new Promise(setImmediate);
 buttons.find(b=>b.dataset.learn==='track3').onclick();
 midi(1);midi(0);await flush();
 assert.equal(core.active,-1,'learning consumes press and release');
 midi(1);await flush();assert.equal(core.pending,3,'CC 1 arms an empty track');
 midi(1);await flush();assert.equal(core.pending,3,'duplicate CC does not cancel it');
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

});
