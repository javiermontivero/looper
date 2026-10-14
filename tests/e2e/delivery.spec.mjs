import {test,expect} from './fixtures.mjs';

test('P39 · fallo de Tone permite reintentar sin dejar notas ni audio duplicado',async({rig,page})=>{
 await rig.open({activate:false});rig.network.fail='Tone.js';
 await page.getByRole('button',{name:'Activar audio y conectar MIDI'}).click();
 await expect(page.locator('#notice')).toContainText('Activá el audio');
 await rig.note();await rig.off();rig.network.fail=null;await rig.activate();
 expect(await rig.rms()).toBeLessThan(.0001);await rig.note();expect(await rig.rms()).toBeGreaterThan(.005);
 await rig.off();expect(await rig.rms()).toBeLessThan(.0001);
});

test('P40 · teclado de PC libera al soltar, ignora repetición y no toca al editar BPM',async({rig,page})=>{
 await rig.open();await page.locator('#loop-time').click();
 await page.keyboard.down('a');await page.keyboard.down('a');expect(await rig.rms()).toBeGreaterThan(.001);
 await page.keyboard.up('a');expect(await rig.rms()).toBeLessThan(.0001);
 await page.locator('#tempo').focus();await page.keyboard.press('a');expect(await rig.rms()).toBeLessThan(.0001);
});

test('P41 · métricas usan datos reales y reiniciar limpia la medición; clic de prueba no se graba',async({rig,page})=>{
 await rig.open();let text=await rig.diagnostics();expect(text).toContain('sin datos');
 await rig.messages(Array.from({length:140},(_,i)=>[0x90,60+i%12,90]));await page.getByRole('button',{name:'Actualizar',exact:true}).click();
 await expect(page.locator('#performance-readout')).toContainText('(128 notas)');
 await page.getByRole('button',{name:'Reiniciar medición'}).click();await expect(page.locator('#performance-readout')).toContainText('sin datos');
 await page.locator('#direct-midi-click').check();await page.getByRole('button',{name:'Cerrar ajustes'}).click();
 await rig.record();await rig.recording();for(let i=0;i<4;i++){await rig.note();await rig.off();await page.waitForTimeout(100);}await rig.record();
 expect(await rig.rms(1.2)).toBeLessThan(.0001);await rig.saved();await page.reload();await rig.activate();
 await rig.note();expect(await rig.rms()).toBeGreaterThan(.005);
});

test('P42 · publicación bajo subruta carga módulos, créditos y UI móvil sin desborde',async({rig,page,request})=>{
 await rig.open({activate:false});
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('combobox',{name:'Sonido',exact:true})).toBeVisible();
 }
 await page.goto('sounds.html');await expect(page.locator('body')).toContainText('smplr');
 for(const path of ['/health','/looper/health'])expect((await request.get(path)).status()).toBe(200);
 for(const path of ['/looper/.env','/looper/package.json','/looper/tests/e2e/device.js'])expect((await request.get(path)).status()).toBe(404);
});

test('P43 · sin permiso MIDI se puede seguir tocando desde el teclado de computadora',async({rig,page})=>{
 await rig.open({activate:false});
 await page.evaluate(()=>Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>{throw new DOMException('Permiso denegado','NotAllowedError');}}));
 await page.getByRole('button',{name:'Activar audio y conectar MIDI'}).click();
 await expect(page.locator('#power')).toHaveText('Audio ✓');
 await expect(page.locator('#notice')).toContainText('MIDI');
 await page.locator('#loop-time').click();await page.keyboard.down('a');expect(await rig.rms()).toBeGreaterThan(.001);await page.keyboard.up('a');
});

test('P44 · sample sustain, retrigger, 24 voces y cambio a FM no dejan audio pendiente',async({rig,page})=>{
 await rig.open({preset:'bass'});await rig.readySound();await rig.cc(64,127);await rig.note(60);await rig.off(60);expect(await rig.rms()).toBeGreaterThan(.0002);
 await rig.cc(64,0);await rig.page.waitForTimeout(600);expect(await rig.rms()).toBeLessThan(.0001);
 await rig.messages(Array.from({length:40},(_,i)=>[0x90,36+i,100]));
 const text=await rig.diagnostics();expect(text).toContain('Voces: 24');
 await page.getByRole('button',{name:'Cerrar ajustes'}).click();await rig.choose('organ');await rig.readySound();await rig.page.waitForTimeout(600);expect(await rig.rms()).toBeLessThan(.0001);
 await rig.note();expect(await rig.rms()).toBeGreaterThan(.005);
});
