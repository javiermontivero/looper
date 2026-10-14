import {test,expect} from './fixtures.mjs';

test('P59 · catálogo que no responde termina en aviso y conserva instrumentos utilizables',async({rig,page})=>{
 rig.network.delay='sfz_files.json';rig.network.delayMs=16000;
 await rig.open({activate:false,preset:null});
 await page.getByRole('button',{name:'Activar audio y conectar MIDI'}).click();
 await expect(page.locator('#power')).toHaveText('Audio ✓');
 await expect(page.locator('#catalog-status')).toContainText('VCSL experimental',{timeout:20000});
 rig.network.delay=null;await rig.choose('organ');await rig.note();expect(await rig.rms()).toBeGreaterThan(.005);
});

test('P60 · el metrónomo sigue cambios de BPM sin reiniciar ni grabar su clic',async({rig,page})=>{
 await rig.open();await page.getByRole('button',{name:'Metrónomo',exact:true}).click();
 for(const bpm of [120,137,240]){
  await rig.tempo(bpm);
  const audio=await page.evaluate(seconds=>window.__device.pulses(seconds),3);
  expect(audio.starts.length).toBeGreaterThanOrEqual(5);
  for(let i=2;i<audio.starts.length;i++)expect(Math.abs((audio.starts[i]-audio.starts[i-1])/audio.rate-60/bpm)).toBeLessThan(2/audio.rate);
 }
 await page.getByRole('button',{name:'Metrónomo',exact:true}).click();expect(await rig.rms()).toBeLessThan(.0001);
});

test('P61 · entrar a aprendizaje cancela un borrado pendiente por pad mantenido',async({rig,page})=>{
 await rig.open();await rig.take();await rig.note(31,100,9);
 await page.getByRole('button',{name:'Ajustes',exact:true}).click();await page.locator('[data-learn="next"]').click();
 await page.waitForTimeout(1150);await rig.off(31,9);
 await page.getByRole('button',{name:'Cerrar ajustes'}).click();
 await expect(rig.track().locator('.track-length')).toHaveText('1 compás');
 await expect(rig.track().locator('.track-state')).toHaveText('OFF');
});
