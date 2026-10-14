import {test,expect} from './fixtures.mjs';

test('P02 · pads crean solo la pista elegida, primero seleccionan y luego graban',async({rig,page})=>{
 await rig.open();
 await expect(page.locator('#tracks article')).toHaveCount(1);
 await rig.pad(8);await expect(page.locator('#tracks article')).toHaveCount(2);
 await expect(rig.track(8)).toBeVisible();await expect(rig.track(8).locator('.track-state')).toHaveText('');
 await rig.pad(8);await expect(rig.track(8).locator('.track-state')).toHaveText('PREVIA');
 await rig.pad(8);await expect(rig.track(8).locator('.track-state')).toHaveText('');
 for(const n of [3,4,5,6,7])await rig.pad(n);
 await expect(page.locator('#tracks article')).toHaveCount(7);
 await expect(page.getByRole('button',{name:'+ Agregar pista'})).toBeDisabled();
 for(let n=9;n<=16;n++)await rig.pad(n);
 await expect(page.locator('#tracks article')).toHaveCount(7);
 await expect(page.locator('#fx-mode')).toHaveText('Efecto 8 · CC15');
 await rig.note(30);expect(await rig.rms()).toBeGreaterThan(.0001);await rig.off(30);
});

test('P03 · cada giro avanza una opción; extremos, reversa, dispositivo y canal son independientes',async({rig,page})=>{
 await rig.open({activate:false});await rig.activate();
 const role=()=>page.locator('#sound-role').inputValue();
 const start=await role();await rig.cc(13,50);expect(await role()).toBe(start);
 await rig.cc(13,51);const next=await role();expect(next).not.toBe(start);
 await rig.cc(13,50);expect(await role()).toBe(start);
 await rig.cc(13,50);expect(await role()).toBe(start);
 await rig.cc(13,51,1);expect(await role()).toBe(start);
 await rig.cc(13,0);await rig.cc(13,0);await rig.cc(13,0);expect(await role()).toBe('rhythm');
 await rig.cc(13,127);for(let i=0;i<8;i++)await rig.cc(13,127);
 expect(await role()).toBe('texture');
 await rig.choose('organ');const chosen=await page.locator('#sound').inputValue();
 await rig.cc(14,20);await rig.cc(14,21);expect(await page.locator('#sound').inputValue()).not.toBe(chosen);
 await rig.cc(14,20);await expect(page.locator('#sound')).toHaveValue(chosen);
 await rig.cc(7,0);await rig.note();expect(await rig.rms()).toBeLessThan(.0001);
 await rig.cc(7,127);expect(await rig.rms()).toBeGreaterThan(.01);await rig.off();
});

test('P04 · pads de efectos cambian tipo y parámetros, seleccionar pista vuelve a instrumentos',async({rig,page})=>{
 await rig.open();await rig.pad(8);await rig.pad(9);
 await expect(page.locator('#fx-track')).toHaveText('Pista 8');
 await rig.cc(15,50);await rig.cc(15,51);await expect(page.locator('#fx-type')).toHaveValue('volume');
 await rig.cc(13,50);await rig.cc(13,51);await expect(page.locator('#fx-param-0')).toHaveValue('71');
 await rig.cc(14,50);await rig.cc(14,49);await expect(page.locator('#fx-param-1')).toHaveValue('49');
 await page.locator('#fx-right').click();
 await expect(page.locator('#fx-mode')).toHaveText('Efecto 2 · CC15');
 await rig.pad(8);await expect(page.locator('#fx-mode')).toHaveText('Instrumentos · CC13 / CC14');
 await expect(rig.track(8).locator('.track-state')).toHaveText('');
 await rig.pad(1);await expect(page.locator('#fx-track')).toHaveText('Master');
 await rig.pad(10);await expect(page.locator('#fx-type')).toHaveValue('none');
});

test('P05 · mantener borra una vez, soltar y rebotes no vuelven a grabar',async({rig})=>{
 await rig.open();await rig.take();
 await rig.pad(2,{hold:1150});await expect(rig.track().locator('.track-state')).toHaveText('');
 await rig.page.waitForTimeout(250);await expect(rig.track().locator('.track-state')).toHaveText('');
 await rig.note(31,100,9);await rig.note(31,90,9);
 await expect(rig.track().locator('.track-state')).toHaveText('PREVIA');
 await rig.off(31,9);await expect(rig.track().locator('.track-state')).toHaveText('PREVIA');
 await rig.pad(2);await expect(rig.track().locator('.track-state')).toHaveText('');
});

test('P06 · desconectar MIDI o silenciar libera notas y una conexión nueva funciona',async({rig,page})=>{
 await rig.open();await rig.note();expect(await rig.rms()).toBeGreaterThan(.005);
 await page.evaluate(()=>window.__device.disconnect());
 await page.waitForTimeout(100);expect(await rig.rms()).toBeLessThan(.0001);
 await expect(page.locator('#midi-input')).toHaveValue('other');
 await rig.midi([0x90,64,100],'other');expect(await rig.rms()).toBeGreaterThan(.005);
 await page.keyboard.press('Escape');expect(await rig.rms()).toBeLessThan(.0001);
 await page.evaluate(()=>window.__device.reconnect());
 await page.getByRole('button',{name:'Ajustes',exact:true}).click();
 await page.locator('#midi-input').selectOption('minicontrol');
 await page.getByRole('button',{name:'Cerrar ajustes'}).click();
 await rig.note();expect(await rig.rms()).toBeGreaterThan(.005);await rig.off();
});

test('P07 · aprender cambio de sonido no toca notas ni acepta el pedal de sustain',async({rig,page})=>{
 await rig.open();
 await page.getByRole('button',{name:'Ajustes',exact:true}).click();
 await page.locator('[data-learn="next"]').click();await rig.cc(64,127);
 await expect(page.locator('[data-learn="next"]')).toHaveText('Cancelar');
 await rig.note(80);await rig.off(80);await page.getByRole('button',{name:'Cerrar ajustes'}).click();
 expect(await rig.rms()).toBeLessThan(.0001);
 const before=await page.locator('#sound').inputValue();await rig.note(80);await rig.note(80);
 const after=await page.locator('#sound').inputValue();expect(after).not.toBe(before);
 await rig.off(80);await expect(page.locator('#sound')).toHaveValue(after);
 await rig.saved();await page.reload();await expect(page.locator('#app')).toHaveJSProperty('inert',false);
 await rig.activate();await rig.note(80);expect(await page.locator('#sound').inputValue()).not.toBe(after);
});
