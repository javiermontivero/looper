import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS} from '../public/instruments.js';
import {SOUND_ROLES,SoundBrowser,potIndex,buildRoles} from '../public/sound-browser.js';
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
