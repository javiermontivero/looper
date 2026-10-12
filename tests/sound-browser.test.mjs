import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS} from '../public/instruments.js';
import {SOUND_ROLES,SoundBrowser,RelativePots,buildRoles} from '../public/sound-browser.js';
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

test('large roles are single lists and legacy page choices restore',()=>{
 const presets=[...PRESETS,...Array.from({length:733},(_,i)=>({id:'extra'+i,roles:['rhythm']}))];
 const browser=new SoundBrowser(presets,{presetId:'extra732',roleId:'rhythm:12',remembered:{'rhythm:12':'extra732'}});
 assert.equal(browser.roles.length,6);assert.equal(browser.role.id,'rhythm');
 assert.equal(browser.preset.id,'extra732');assert.ok(browser.role.presets.length>733);
 browser.selectRole(1);browser.selectRole(0);assert.equal(browser.preset.id,'extra732');
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
test('relative steps reach every instrument beyond the old 64 and MIDI 128 limits',()=>{
 const presets=[...PRESETS,...Array.from({length:733},(_,i)=>({id:'extra'+i,roles:['rhythm']}))];
 const b=new SoundBrowser(presets,{presetId:'drums'}),seen=new Set(),pots=new RelativePots();
 pots.step('sound',127);
 for(let r=0;r<b.roles.length;r++){
  assert.equal(b.roleIndex,r);b.choose(b.role.presets[0].id);
  for(const preset of b.role.presets){assert.equal(b.preset.id,preset.id);seen.add(preset.id);b.step('sound',pots.step('sound',127));}
  assert.equal(b.preset,b.role.presets.at(-1));
  for(let i=b.role.presets.length-1;i>=0;i--){assert.equal(b.preset,b.role.presets[i]);b.step('sound',-1);}
  b.step('role',1);
 }
 assert.equal(b.roleIndex,b.roles.length-1);
 assert.deepEqual(seen,new Set(presets.map(p=>p.id)));
 b.selectRole(0);assert.equal(b.step('role',-1),false);
});
