import {test,expect,frequency} from './fixtures.mjs';

for(const preset of ['organ','bass']){
test('P08 · '+preset+': velocity suave audible, fuerte mayor y velocity cero suelta; paquetes inválidos no suenan',async({rig})=>{
 await rig.open({preset});await rig.readySound();const levels=[];
 for(const velocity of [1,64,127]){await rig.note(60,velocity);levels.push(await rig.rms());await rig.off();await rig.page.waitForTimeout(600);expect(await rig.rms()).toBeLessThan(.0001);}
 expect(levels[0]).toBeGreaterThan(preset==='organ'?.002:.0002);expect(levels[1]).toBeGreaterThan(levels[0]*1.2);expect(levels[2]).toBeGreaterThan(levels[1]);
 await rig.note(60,0);await rig.messages([[0x90,60],[0xf8],[0x90,60,200]]);
 expect(await rig.rms()).toBeLessThan(.0001);
});

}

test('P09 · sustain y all-notes-off respetan canales; bend cambia notas sostenidas FM',async({rig})=>{
 await rig.open();await rig.cc(64,127);await rig.note(69);await rig.off(69);
 expect(await rig.rms()).toBeGreaterThan(.005);
 await rig.cc(123,0,1);expect(await rig.rms()).toBeGreaterThan(.005);
 const before=await rig.capture(.4);await rig.midi([0xe0,127,127]);const after=await rig.capture(.4);
 expect(frequency(after.samples,after.rate)/frequency(before.samples,before.rate)).toBeGreaterThan(1.10);
 await rig.cc(64,0);expect(await rig.rms()).toBeLessThan(.0001);
 await rig.note(60);await rig.note(60);await rig.note(62);await rig.cc(120,0);
 expect(await rig.rms()).toBeLessThan(.0001);
});

test('P10 · muchas notas y retriggers no dejan voces colgadas; pánico recupera silencio',async({rig,page})=>{
 await rig.open();await rig.messages(Array.from({length:64},(_,i)=>[0x90,36+i,100]));
 const sound=await rig.capture(.4);expect(sound.samples.every(Number.isFinite)).toBe(true);
 expect(Math.max(...sound.samples.map(Math.abs))).toBeLessThanOrEqual(1);
 const readout=await rig.diagnostics();expect(readout).toMatch(/Voces: 32\b/);
 await page.getByRole('button',{name:'Silenciar todo',exact:true}).click();
 await page.getByRole('button',{name:'Cerrar ajustes'}).click();expect(await rig.rms()).toBeLessThan(.0001);
 await rig.note();expect(await rig.rms()).toBeGreaterThan(.005);
});

for(const [name,preset] of [
 ['piano','piano'],['eléctrico','wurlitzer'],['Fluid','bass'],
 ['Musyng','gm:MusyngKite:acoustic_bass'],['FatBoy','gm:FatBoy:acoustic_bass'],
 ['batería acústica','drums'],['DrumMachine','machine:TR-808'],
 ['DrumAbuse','abuse:roland-tr-808'],['Mallet','mallet:Balafon - Hard Mallet'],
 ['Mellotron','mellotron:MKII VIOLINS'],['Smolken','smolken:Arco'],
 ['Versilian','versilian:Strings/Violin/Violin - Arco'],['Tabla','tabla']
]){
 test('P11 · tocar '+name+' carga y reproduce muestras con el motor real',async({rig,page})=>{
  await rig.open({preset});await rig.readySound();await rig.note();
  expect(await rig.rms()).toBeGreaterThan(.0002);
  await page.keyboard.press('Escape');await rig.page.waitForTimeout(600);expect(await rig.rms()).toBeLessThan(.0001);
  if(preset==='wurlitzer')expect(rig.requests.some(u=>u.endsWith('ab6mp.m4a'))).toBe(true);
 });
}

test('P12 · percusión mantiene colas al soltar y cerrar hi-hat corta el abierto',async({rig,page})=>{
 await rig.open({preset:'drums'});await rig.readySound();await rig.note(60);await rig.off(60);
 expect(await rig.rms()).toBeGreaterThan(.0002);
 await page.keyboard.press('Escape');
 await rig.note(46);await rig.note(42);
 const readout=await rig.diagnostics();expect(readout).toMatch(/Voces: 1\b/);
 await page.getByRole('button',{name:'Cerrar ajustes'}).click();await page.keyboard.press('Escape');
 await rig.note(100);expect(await rig.rms()).toBeLessThan(.0001);
});

test('P13 · cambios rápidos, descarga lenta y error no dejan sonar notas atrasadas',async({rig,page})=>{
 await rig.open();rig.network.delay='splendid-grand-piano';rig.network.delayMs=1200;
 await rig.choose('piano');await expect(page.locator('#sound-status')).toContainText('Cargando');
 await rig.note(60);await rig.off(60);
 expect(await rig.rms(.2)).toBeLessThan(.0001);
 await rig.choose('organ');rig.network.delay=null;await rig.readySound();
 await page.waitForTimeout(1400);expect(await rig.rms(.2)).toBeLessThan(.0001);
 await rig.note();expect(await rig.rms()).toBeGreaterThan(.005);await rig.off();
 rig.network.fail='midi-js-soundfonts';await rig.choose('bass');
 await expect(page.locator('#sound-status')).toContainText('No se pudo cargar');
 await rig.record();await expect(page.locator('#notice')).toContainText('Esperá a que cargue');
 rig.network.fail=null;await rig.choose('guitar');await rig.readySound();
 await rig.note();expect(await rig.rms()).toBeGreaterThan(.0002);await rig.off();
});

test('P14 · todos los bancos y familias se recorren por rol sin páginas ni descargar audio',async({rig,page})=>{
 await rig.open({activate:false,preset:null});
 await expect(page.locator('#catalog-status')).toContainText('sonidos',{timeout:10000});
 const ids=new Set(),labels=[];
 for(const role of await page.locator('#sound-role option').evaluateAll(o=>o.map(x=>x.value))){
  await page.locator('#sound-role').selectOption(role);
  const choices=await page.locator('#sound option').evaluateAll(o=>o.map(x=>({value:x.value,label:x.textContent})));
  expect(new Set(choices.map(c=>c.value)).size).toBe(choices.length);
  choices.forEach(c=>{ids.add(c.value);labels.push(c.label);});
 }
 for(const bank of ['Fluid','Musyng','FatBoy'])expect(labels.filter(s=>s.endsWith('· '+bank)).length).toBeGreaterThanOrEqual(125);
 expect(ids.size).toBeGreaterThan(400);
 expect([...ids].some(id=>id.startsWith('versilian:'))).toBe(true);
 expect(rig.requests.some(u=>u.includes('gleitz.github.io/')||/\.(ogg|m4a|wav|sfz)$/.test(u))).toBe(false);
 await rig.choose('gm:FatBoy:acoustic_grand_piano');
 const remembered=await page.locator('#sound').inputValue();
 await page.locator('#sound-role').selectOption('rhythm');await page.locator('#sound-role').selectOption('accompaniment');
 await expect(page.locator('#sound')).toHaveValue(remembered);
});

test('P15 · navegación relativa alcanza instrumentos posteriores al 128 sin saltearlos',async({rig,page})=>{
 await rig.open();await page.locator('#sound-role').selectOption('rhythm');
 const values=await page.locator('#sound option').evaluateAll(o=>o.map(x=>x.value));
 expect(values.length).toBeGreaterThan(128);
 await page.locator('#sound').selectOption(values[0]);await rig.cc(14,126);await rig.cc(14,127);
 for(let i=1;i<values.length;i++)await rig.cc(14,127);
 await expect(page.locator('#sound')).toHaveValue(values.at(-1));
 await rig.cc(14,126);await expect(page.locator('#sound')).toHaveValue(values.at(-2));
 await rig.pad(9);await rig.pad(1);await expect(page.locator('#sound')).toHaveValue(values.at(-2));
});

test('P16 · un proveedor caído informa el problema y deja disponibles FM y bancos conocidos',async({rig,page})=>{
 rig.network.fail='sfz_files.json';await rig.open();
 await expect(page.locator('#catalog-status')).toContainText('VCSL experimental');
 await rig.note();expect(await rig.rms()).toBeGreaterThan(.005);await rig.off();
 await rig.choose('bass');await rig.readySound();await rig.note();expect(await rig.rms()).toBeGreaterThan(.0002);
});
