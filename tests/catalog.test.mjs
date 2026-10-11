import test from 'node:test';
import assert from 'node:assert/strict';
import {GM_NAMES,GM_KITS,FAMILIES,soundfonts,discoverCatalog,musicalRoles,mapDrumGroups,title} from '../public/catalog.js';
import {PRESETS} from '../public/instruments.js';
import {buildRoles,potIndex} from '../public/sound-browser.js';
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
test('large catalogs remain completely reachable in both directions using two absolute pots',()=>{
 const extra=Array.from({length:733},(_,i)=>({id:'extra'+i,roles:['rhythm']}));
 const roles=buildRoles([...PRESETS,...extra]);assert.ok(roles.length<=128);
 const seen=new Set();let role=-1;
 for(let value=0;value<128;value++){role=potIndex(value,roles.length,role);seen.add(role);}
 assert.equal(seen.size,roles.length);
 const all=new Set();
 for(const role of roles){
  assert.ok(role.presets.length<=64);
  for(const direction of [1,-1]){
   let index=-1;const reached=new Set();
   for(let n=0;n<128;n++){index=potIndex(direction===1?n:127-n,role.presets.length,index);reached.add(index);all.add(role.presets[index].id);}
   assert.equal(reached.size,role.presets.length);
  }
 }
 for(const p of [...PRESETS,...extra])assert.ok(all.has(p.id));
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
