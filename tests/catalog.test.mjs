import test from 'node:test';
import assert from 'node:assert/strict';
import {GM_NAMES,GM_KITS,FAMILIES,soundfonts,discoverCatalog,musicalRoles,mapDrumGroups,title} from '../public/catalog.js';
import {PRESETS} from '../public/instruments.js';
import {buildRoles} from '../public/sound-browser.js';
test('complete GM banks preserve legacy IDs without duplicate instrument/bank pairs',()=>{
 assert.equal(GM_NAMES.length,128);assert.equal(new Set(GM_NAMES).size,128);
 const gm=PRESETS.filter(p=>p.engine==='soundfont'&&p.kit!=='Tabla');
 assert.equal(gm.length,384);
 for(const kit of GM_KITS)for(const instrument of GM_NAMES)
  assert.equal(gm.filter(p=>(p.kit||'FluidR3_GM')===kit&&p.instrument===instrument).length,1);
 assert.equal(new Set(PRESETS.map(p=>p.id)).size,PRESETS.length);
 assert.equal(soundfonts(PRESETS).length,0);
});
test('all advertised families are discovered without constructing or loading audio',async()=>{
 const lib={};
 for(const f of FAMILIES){lib[f.factory]=()=>{throw Error('must not load audio');};lib[f.helper]=()=>['Test 2','Test 1','Test 1'];}
 const result=await discoverCatalog(lib,[]);
 assert.equal(result.presets.length,FAMILIES.length*2);assert.deepEqual(result.issues,[]);
 for(const p of result.presets)assert.ok(p.roles.length>0);
});
test('unavailable and stalled catalogs do not hide working families',async()=>{
 const result=await discoverCatalog({
  ElectricPiano(){},getElectricPianoNames:()=>['CP80'],
  Versilian(){},getVersilianInstruments:()=>new Promise(()=>{})
 },[],{timeoutMs:5});
 assert.equal(result.presets.length,1);assert.equal(result.presets[0].id,'electric:CP80');
 assert.equal(result.issues.length,FAMILIES.length-1);
});
test('all catalog instruments belong to one or more unpaginated musical categories',()=>{
 const extra=Array.from({length:733},(_,i)=>({id:'extra'+i,roles:['rhythm']}));
 const roles=buildRoles([...PRESETS,...extra]);assert.equal(roles.length,6);
 const all=new Set(roles.flatMap(role=>role.presets.map(p=>p.id)));
 for(const p of [...PRESETS,...extra])assert.ok(all.has(p.id));
 assert.ok(roles[0].presets.length>733);
});
test('grouping follows song function and keeps readable names',()=>{
 assert.deepEqual(musicalRoles('acoustic_bass','soundfont'),['bass']);
 assert.deepEqual(musicalRoles('bassoon','soundfont'),['melody']);
 assert.deepEqual(musicalRoles('pad_2_warm','soundfont'),['background']);
 assert.deepEqual(musicalRoles('lead_8_bass__lead','soundfont'),['melody']);
 assert.equal(title('Aerophones/Reed Aerophones/Tenor Saxophone - Staccato'),'Tenor Saxophone Staccato');
});
test('drum group mapping preserves anchors, central octave and extra groups',()=>{
 const groups=['kick','snare','closed-hihat','open-hihat','cowbell','clap','strange-percussion'];
 const map=mapDrumGroups(groups);
 assert.equal(map[36],'kick');assert.equal(map[60],'kick');
 assert.equal(map[38],'snare');assert.equal(map[62],'snare');
 assert.equal(map[42],'closed-hihat');assert.equal(map[46],'open-hihat');
 for(const g of groups)assert.ok(Object.values(map).includes(g));
 assert.deepEqual(mapDrumGroups([]),{});
});
