import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {SoundBrowser,RelativePots} from '../public/sound-browser.js';
import {PRESETS} from '../public/instruments.js';
import {decode,matches,learnMapping,buttonDown,TrackButtons} from '../public/midi.js';
import {LatencyStats} from '../public/latency.js';
import {LoopCore} from '../public/loop-core.js';
import {EFFECTS,emptyChain} from '../public/effects.js';
import {cleanConfig,prepareRestore,validateSnapshot} from '../public/session.js';

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
 assert.equal(actions.length,5);
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
 const snapshots=[];
 engine.route=()=>{};engine.snapshot=id=>snapshots.push({id,state:core.state()});engine.restore=async snapshot=>{core.command({type:'restore',snapshot});publish();};
 const FakeLooper={async create(ctx,src,dest,onState){
  core=new LoopCore(1000);publish=()=>{engine.state=core.state();onState(engine.state);};return engine;
 }};
 class AudioContext{constructor(){this.state='running';this.sampleRate=1000;}async resume(){}}
 const played=[],loaded=[];let masterGain;
 class InstrumentSource{noteOn(...args){played.push(args);}constructor(){this.output={};}panic(){}noteOff(){}selectPreset(p){loaded.push(p.id);this.preset=p;this.ready=true;return Promise.resolve(true);}}
 const holds=new Map();let timerId=0;
 class TestTrackButtons extends TrackButtons{
  constructor(dispatch,options){super(dispatch,{...options,schedule:fn=>{const id=++timerId;holds.set(id,fn);return id;},cancel:id=>holds.delete(id)});}
 }
 const soundTimers=new Map();let soundTimerId=10000;
 const configurations=[],effectChanges=[];
 class SessionStore{constructor(){this.dirty=false;}async load(){return null;}config(c){configurations.push(c);}snapshot(){}}
 class AudioEngine{
  static async create(){return new AudioEngine();}
  constructor(){this.context=new AudioContext();this.capture={};this.mixer=new Mixer();}
  setSource(source){this.source=source;}
  volume(value){masterGain=value;}
  dispose(){}
 }
 class Mixer{constructor(){this.master={input:{}};this.tracks=Array.from({length:7},()=>({input:{}}));}select(slot){this.selected=slot;}set(slot,c){effectChanges.push({slot,chain:structuredClone(c)});}}
 const globals={document,window:{isSecureContext:false,addEventListener(){}},
  navigator:{},localStorage:{getItem(key){return key==='looper:mappings'?JSON.stringify({next:{device:'keyboard',channel:9,type:'note',number:32},track0:{device:'keyboard',channel:0,type:'cc',number:20}}):null;},setItem(){}},
  requestAnimationFrame:callback=>setImmediate(callback),
  matchMedia:()=>({matches:true,addEventListener(){}}),confirm:()=>true,
  setTimeout:(fn,ms)=>{if(ms===250){const id=++soundTimerId;soundTimers.set(id,fn);return id;}return setTimeout(fn,ms);},clearTimeout:id=>{if(soundTimers.has(id))soundTimers.delete(id);else clearTimeout(id);},performance,
  AudioContext,AudioEngine,InstrumentSource,PRESETS,EFFECTS,emptyChain,Mixer,SessionStore,cleanConfig,prepareRestore,validateSnapshot,loadInstrumentCatalog:async()=>({added:0,issues:[]}),SoundBrowser,RelativePots,LatencyStats,Looper:FakeLooper,decode,matches,learnMapping,buttonDown,TrackButtons:TestTrackButtons};
 vm.runInNewContext(source,globals);
 const settle=()=>new Promise(setImmediate);await settle();await settle();
 assert.equal(ids.get('app').inert,false);
 assert.equal(ids.get('sound-role').children.length,6);
 const send=(note,value=127)=>globals.process({data:[0x99,note,value]},'keyboard');
 const tap=async note=>{send(note);send(note,0);await settle();};
 const cc=(number,value)=>globals.process({data:[0xb0,number,value]},'keyboard');
 const click=async(type,track)=>{actions.find(b=>b.dataset.loopAction===type&&b.dataset.track===String(track)).onclick();await settle();};
 await tap(31);assert.equal(core,undefined,'pad 2 selects without recording');
 assert.equal(ids.get('fx-track').textContent,'Pista 2');
 await tap(31);assert.equal(core.pending,0,'selected track records after count-in');
 core.process(new Float32Array(core.countInRemaining),new Float32Array(core.countInRemaining));publish();
 core.process(new Float32Array(500).fill(.25),new Float32Array(500));publish();await tap(31);
 assert.equal(core.tracks[0].hasAudio,true);
 for(let note=32;note<=37;note++)await tap(note);
 assert.equal(core.tracks.length,7);assert.equal(ids.get('add-track').disabled,true);
 assert.equal(core.pending,-1,'other pads select without triggering');
 await tap(38);assert.equal(core.tracks.length,7,'effect pad never creates a track');
 assert.equal(ids.get('fx-editor').hidden,false);assert.equal(ids.get('fx-type').value,'none');
 cc(15,64);cc(15,65);assert.equal(ids.get('fx-type').value,'volume');
 cc(13,50);cc(13,51);assert.equal(ids.get('fx-param-0').value,71);
 cc(14,50);cc(14,49);assert.equal(ids.get('fx-param-1').value,49);
 ids.get('fx-right').onclick();assert.equal(ids.get('fx-slot-1').attrs['aria-pressed'],'true');assert.match(ids.get('fx-slot-1').textContent,/Volumen/);
 await tap(37);assert.equal(ids.get('fx-editor').hidden,true,'track pad exits effect editing without triggering');
 assert.equal(core.active,-1);
 await tap(45);assert.equal(ids.get('fx-slot-7').attrs['aria-pressed'],'true');
 ids.get('fx-type').onchange({target:{value:'delay'}});assert.equal(ids.get('fx-type').value,'delay');
 await tap(30);assert.equal(ids.get('fx-track').textContent,'Master');assert.equal(core.paused,false);
 await tap(30);assert.equal(core.paused,true,'master pauses transport');
 await tap(30);assert.equal(core.paused,false);
 await tap(38);assert.equal(ids.get('fx-type').value,'none','master has an independent empty chain');
 ids.get('fx-type').onchange({target:{value:'eq'}});assert.equal(ids.get('fx-param-0').value,50);
 await tap(31);assert.equal(ids.get('fx-track').textContent,'Pista 2');
 assert.equal(core.tracks[0].muted,false,'select does not mute');
 await tap(31);assert.equal(core.tracks[0].muted,true);
 cc(7,0);assert.equal(masterGain,0);cc(7,127);assert.equal(masterGain,1);
 assert.ok(played.length===0,'track and effect pads never play samples');
 globals.process({data:[0x90,30,100]},'keyboard');assert.equal(played.length,1,'low keyboard notes are free');
 await click('record',0);assert.ok(core.active===0||core.pending===0);await click('record',0);
 await new Promise(resolve=>setTimeout(resolve,600));
 assert.ok(configurations.length>0);assert.ok(snapshots.length>0);
 assert.equal(configurations.at(-1).chains.length,8);
 assert.equal(configurations.at(-1).chains[0][0].type,'eq');
 assert.equal(configurations.at(-1).chains[7][1].type,'volume');
 assert.equal(configurations.at(-1).chains[7][7].type,'delay');
 assert.ok(effectChanges.some(c=>c.slot===6&&c.chain[1].type==='volume'));
});
