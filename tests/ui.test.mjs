import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {PRESETS} from '../public/synth.js';
import {LoopCore} from '../public/loop-core.js';

test('UI boots and track buttons actually start, close, overdub and mute captured audio',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const source=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
 class Element{
  constructor(){this.style={};this.dataset={};this.children=[];this.attrs={};this.classList={toggle(){}};this.queries=new Map();}
  setAttribute(k,v){this.attrs[k]=v;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
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
 assert.equal(actions.length,15);
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
 const engine={command(type,track){
  if(type==='record'&&!core.tracks[track].data)core.command({type:'prepare',track,data:new Float32Array(core.capacity)});
  core.command({type,track});publish();
 }};
 const FakeLooper={async create(ctx,src,dest,onState){
  core=new LoopCore(1000);publish=()=>{engine.state=core.state();onState(engine.state);};return engine;
 }};
 class AudioContext{constructor(){this.state='running';this.sampleRate=1000;}async resume(){}}
 class Synth{constructor(){this.input={};this.compressor={};}volume(){}panic(){}}
 const globals={document,window:{isSecureContext:false,addEventListener(){}},
  navigator:{},localStorage:{getItem(){return null;},setItem(){}},
  matchMedia:()=>({matches:true,addEventListener(){}}),confirm:()=>true,
  AudioContext,Synth,PRESETS,Looper:FakeLooper,decode:()=>null,matches:()=>false,learnMapping:()=>null};
 vm.runInNewContext(source,globals);
 assert.equal(ids.get('presets').children.length,12,'startup must finish rendering presets');
 for(const button of actions)assert.equal(typeof button.onclick,'function','all track controls must be connected');
 const click=async(type,track)=>{actions.find(b=>b.dataset.loopAction===type&&b.dataset.track===String(track)).onclick();await new Promise(setImmediate);};
 await click('record',0);
 assert.equal(core.active,0,'click starts capture');
 core.process(new Float32Array(1000).fill(.25),new Float32Array(1000));publish();
 assert.match(ids.get('loop-clock').textContent,/1.0 s/);
 await click('record',0);
 assert.equal(core.length,1000);assert.equal(core.tracks[0].hasAudio,true);
 assert.equal(ids.get('track-0').querySelector('[data-loop-action="record"]').textContent,'Overdub');
 await click('record',0);core.process(new Float32Array(1000).fill(.25),new Float32Array(1000));await click('record',0);
 assert.equal(core.tracks[0].data[500],.5);
 await click('mute',0);assert.equal(core.tracks[0].muted,true);
 await click('mute',0);assert.equal(core.tracks[0].muted,false);
 for(let i=1;i<5;i++){await click('record',i);assert.equal(core.active,i);core.process(new Float32Array(1000).fill(.1),new Float32Array(1000));publish();assert.equal(core.tracks[i].hasAudio,true);}
 await click('clear',3);assert.equal(core.tracks[3].hasAudio,false);
});
