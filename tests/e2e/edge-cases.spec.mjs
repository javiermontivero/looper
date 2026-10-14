import {test,expect} from './fixtures.mjs';
import {savedSession} from './saved-session.mjs';

test('P56 · dos pulsaciones durante un arranque lento mantienen su orden y cancelan la cuenta',async({rig,page})=>{
 await page.addInitScript(()=>{
  const query=navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query=descriptor=>descriptor.name==='midi'?Promise.resolve({state:'granted'}):query(descriptor);
 });
 rig.network.delay='Tone.js';rig.network.delayMs=900;await rig.open({activate:false});
 await expect(page.locator('#midi-input')).toHaveValue('minicontrol');
 await rig.pad(2);await rig.pad(2);await page.waitForTimeout(100);await rig.pad(2);
 await expect(page.locator('#power')).toHaveText('Audio ✓');
 await page.waitForTimeout(2300);
 await expect(rig.track().locator('.track-state')).toHaveText('');
 await expect(page.locator('#count-in')).toBeHidden();expect(await rig.rms()).toBeLessThan(.0001);
});

test('P57 · tocar en la cuenta no se captura; cambiar clic no reinicia los dos compases',async({rig,page})=>{
 await rig.open();await page.getByRole('button',{name:'Metrónomo',exact:true}).click();
 await rig.record();await rig.note();await page.waitForTimeout(200);await rig.off();
 await expect(page.locator('#count-in-number')).toHaveText('2');
 await page.getByRole('button',{name:'Metrónomo',exact:true}).click();
 await expect(page.locator('#count-in-number')).toHaveText('3');
 await rig.recording();await expect(page.getByRole('button',{name:'Metrónomo',exact:true})).toHaveAttribute('aria-pressed','false');
 await page.waitForTimeout(400);await rig.record();expect(await rig.rms(1.1)).toBeLessThan(.0001);
});

test('P58 · borrar el último loop mientras otra pista espera permite completar esa toma',async({rig,page})=>{
 await savedSession(page,{tracks:[{bars:2,seconds:2}]});
 await page.goto('index.html');await rig.activate();await rig.resume();await page.waitForTimeout(250);
 await rig.pad(8);await rig.record(8);await expect(rig.track(8).locator('.track-state')).toHaveText('ESPERA');
 await rig.options(2);await rig.track(2).locator('[data-loop-action="clear"]').click();
 await rig.recording(8);await rig.note();await page.waitForTimeout(400);await rig.off();await rig.record(8);
 await expect(rig.track(2).locator('.track-state')).toHaveText('');expect(await rig.rms(1.1)).toBeGreaterThan(.001);
});
