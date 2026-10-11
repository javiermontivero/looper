import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS} from '../public/instruments.js';
import {SOUND_ROLES,SoundBrowser,RelativePots,potIndex,buildRoles} from '../public/sound-browser.js';
test('roles cover the existing catalog, mix engines and share instruments without copying samples',()=>{
 const ids=new Set(PRESETS.map(p=>p.id));
 for(const role of SOUND_ROLES)for(const id of role.presets)assert.ok(ids.has(id),'unknown preset '+id);
 assert.deepEqual(new Set(buildRoles(PRESETS).flatMap(r=>r.presets.map(p=>p.id))),ids);
 const browser=new SoundBrowser(PRESETS,{presetId:'piano'});
 assert.equal(browser.role.id,'accompaniment');
 assert.equal(browser.preset,PRESETS.find(p=>p.id==='piano'));
 browser.selectRole(4);browser.choose('piano');
 assert.equal(browser.preset,PRESETS.find(p=>p.id==='piano'));
});
test('absolute pots reach every option and resist one-step boundary noise',()=>{
 for(const size of [1,2,6,8,32,64,128]){
  let current=-1;const seen=new Set();
  for(let value=0;value<128;value++){current=potIndex(value,size,current);seen.add(current);}
  assert.equal(seen.size,size);assert.equal(potIndex(127,size,0),size-1);assert.equal(potIndex(0,size,size-1),0);
 }
 assert.equal(potIndex(64,2,0),0);assert.equal(potIndex(65,2,0),1);
 assert.equal(potIndex(63,2,1),1);assert.equal(potIndex(62,2,1),0);
 assert.equal(potIndex(NaN,6,2),2);
});
test('each role remembers its variant and restores only valid saved choices',()=>{
 const browser=new SoundBrowser(PRESETS,{presetId:'piano',remembered:{bass:'missing'}});
 browser.selectRole(1);assert.equal(browser.role.id,'bass');assert.equal(browser.preset.id,'bass');
 browser.choose('rubber');assert.equal(browser.preset.id,'rubber');
 browser.selectRole(5);assert.equal(browser.role.id,'texture');
 browser.selectRole(1);assert.equal(browser.preset.id,'rubber');
 const restored=new SoundBrowser(PRESETS,{presetId:'rubber',roleId:'bass',remembered:browser.remembered});
 assert.equal(restored.role.id,'bass');assert.equal(restored.preset.id,'rubber');
 assert.equal(new SoundBrowser(PRESETS,{presetId:'missing',roleId:'missing',remembered:null}).preset.id,'drums');
});

test('category and page controls are independent, ordered and remember sounds across reloads',()=>{
 const presets=[...PRESETS,...Array.from({length:140},(_,i)=>({id:'extra'+i,roles:['rhythm']}))];
 const browser=new SoundBrowser(presets,{presetId:'drums'});
 assert.equal(browser.roles.length,6);
 assert.deepEqual(browser.role.pages.map(p=>p.id),['rhythm','rhythm:2','rhythm:3','rhythm:4']);
 browser.turnPage(127);assert.equal(browser.role.id,'rhythm');assert.equal(browser.pageIndex,3);
 browser.turnSound(127);const last=browser.preset.id;
 browser.turnPage(0);assert.equal(browser.preset.id,'drums');
 browser.turnPage(127);assert.equal(browser.preset.id,last);
 browser.selectRole(1);browser.selectRole(0);assert.equal(browser.preset.id,last);
 const restored=new SoundBrowser(presets,{presetId:'bass',roleId:'bass',remembered:browser.remembered,rememberedPages:browser.rememberedPages});
 restored.selectRole(0);assert.equal(restored.preset.id,last);assert.equal(restored.pageIndex,3);
 const legacy=new SoundBrowser(presets,{presetId:last,roleId:'rhythm:4',remembered:browser.remembered});
 assert.equal(legacy.role.id,'rhythm');assert.equal(legacy.pageIndex,3);assert.equal(legacy.preset.id,last);
});

test('relative navigation tracks each device/control, endpoints, reversals and reset',()=>{
 const pots=new RelativePots();
 assert.equal(pots.step('a13',12),0);
 assert.equal(pots.step('a13',11),-1);
 assert.equal(pots.step('a13',10),-1);
 assert.equal(pots.step('a13',11),1);
 assert.equal(pots.step('a13',11),0);
 assert.equal(pots.step('a13',127),1);
 assert.equal(pots.step('a13',127),1);
 assert.equal(pots.step('a13',126),-1);
 assert.equal(pots.step('a13',0),-1);
 assert.equal(pots.step('a13',0),-1);
 assert.equal(pots.step('a13',1),1);
 assert.equal(pots.step('a14',127),0);assert.equal(pots.step('b13',50),0);
 assert.equal(pots.step('a13',NaN),0);assert.equal(pots.step('a13',2),1);
 pots.reset();assert.equal(pots.step('a13',127),0);
});
test('relative steps traverse all categories and every page/instrument without skipping or wrapping',()=>{
 const b=new SoundBrowser(PRESETS,{presetId:'drums'}),seen=new Set();
 for(let r=0;r<b.roles.length;r++){
  assert.equal(b.roleIndex,r);b.selectPage(0);
  for(let p=0;p<b.role.pages.length;p++){
   assert.equal(b.pageIndex,p);b.choose(b.page.presets[0].id);
   for(const preset of b.page.presets){assert.equal(b.preset.id,preset.id);seen.add(preset.id);b.step('sound',1);}
   assert.equal(b.preset,b.page.presets.at(-1));
   b.step('page',1);
  }
  b.step('role',1);
 }
 assert.equal(b.roleIndex,b.roles.length-1);
 assert.deepEqual(seen,new Set(PRESETS.map(p=>p.id)));
 b.selectRole(0);assert.equal(b.step('role',-1),false);
 b.selectPage(0);assert.equal(b.step('page',-1),false);
});
