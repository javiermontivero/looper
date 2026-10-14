import {test,expect} from './fixtures.mjs';
import {savedSession} from './saved-session.mjs';

test('P50 · overdub silencioso no realimenta loops ni imprime metrónomo',async({rig,page})=>{
 await savedSession(page,{tracks:[{bars:1,seconds:1,frequency:220}]});
 await page.goto('index.html');await rig.activate();await rig.resume();const dry=await rig.rms(1.1);
 await page.getByRole('button',{name:'Metrónomo',exact:true}).click();await rig.record();await rig.recording();
 await page.waitForTimeout(1200);await rig.record();await page.getByRole('button',{name:'Metrónomo',exact:true}).click();
 expect((await rig.rms(1.1))/dry).toBeCloseTo(1,1);
});

test('P51 · cancelar una toma en espera no altera el audio previo ni deja BPM bloqueado',async({rig,page})=>{
 await savedSession(page,{tracks:[{bars:2,seconds:2}]});
 await page.goto('index.html');await rig.activate();await rig.resume();await page.waitForTimeout(200);
 await rig.pad(8);await rig.record(8);await expect(rig.track(8).locator('.track-state')).toHaveText('ESPERA');await expect(page.locator('#tempo')).toBeDisabled();
 await rig.pad(8);await expect(rig.track(8).locator('.track-state')).toHaveText('');await expect(page.locator('#tempo')).toBeEnabled();
 await page.waitForTimeout(2100);await expect(rig.track(8).locator('.track-state')).toHaveText('');expect(await rig.rms()).toBeGreaterThan(.005);
});

test('P52 · aprender CC momentáneo acepta valores bajos, ignora repeticiones y permite borrar',async({rig,page})=>{
 await rig.open();await page.getByRole('button',{name:'Ajustes',exact:true}).click();
 await page.locator('[data-learn="next"]').click();await rig.cc(20,1);await rig.cc(20,0);
 await expect(page.locator('[data-learn="next"]')).toHaveText('CC 20');
 const before=await page.locator('#sound').inputValue();await rig.cc(20,1);const after=await page.locator('#sound').inputValue();expect(after).not.toBe(before);
 await rig.cc(20,100);await expect(page.locator('#sound')).toHaveValue(after);await rig.cc(20,0);await expect(page.locator('#sound')).toHaveValue(after);
 await page.getByRole('button',{name:'Borrar asignaciones',exact:true}).click();await rig.cc(20,127);await expect(page.locator('#sound')).toHaveValue(after);
});

test('P53 · el pad master pausa sin borrar y sostenerlo no destruye pistas',async({rig,page})=>{
 await rig.open();await rig.take();await rig.pad(1);await rig.pad(1,{hold:1100});
 await expect(page.locator('#loop-transport')).toHaveText('Reanudar');expect(await rig.rms()).toBeLessThan(.0001);
 await expect(rig.track().locator('.track-length')).toHaveText('1 compás');await rig.pad(1);expect(await rig.rms(1.1)).toBeGreaterThan(.001);
});

test('P54 · primera guía recorre cuatro compases completos y no ocho',async({rig,page})=>{
 await rig.open();await rig.record();await rig.recording();await page.waitForTimeout(3050);
 const progress=await page.getByRole('progressbar',{name:'Avance de la guía de cuatro compases'}).getAttribute('value');
 expect(Number(progress)).toBeGreaterThan(.7);expect(Number(progress)).toBeLessThan(.95);
 await rig.record();await expect(rig.track().locator('.track-length')).toHaveText('4 compases');
});

test('P55 · cambiar preset y perder foco cancela voces y selección diferida',async({rig,page})=>{
 await rig.open();await rig.note();await rig.choose('pluck');await expect.poll(()=>rig.rms(),{timeout:3000}).toBeLessThan(.0001);
 await rig.cc(14,20);await rig.cc(14,21);
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 await page.waitForTimeout(400);await expect(page.locator('#sound')).toHaveValue('pluck');expect(await rig.rms()).toBeLessThan(.0001);
});
