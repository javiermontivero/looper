import {test,expect,rms,frequency} from './fixtures.mjs';

test('P17 · primera toma espera dos compases visibles, bloquea BPM y no graba el clic',async({rig,page})=>{
 await rig.open();await rig.record();
 await expect(page.locator('#count-in-label')).toHaveText('COMPÁS 1 DE 2');
 await expect(page.locator('#tempo')).toBeDisabled();
 await expect(page.locator('#count-in-label')).toHaveText('COMPÁS 2 DE 2');
 await rig.recording();await expect(page.locator('#count-in-number')).toHaveText('¡REC!');
 await page.waitForTimeout(400);await rig.record();
 await expect(page.locator('#tempo')).toBeEnabled();
 await expect(rig.track().locator('.track-length')).toHaveText('1 compás');
 expect(await rig.rms(1.2)).toBeLessThan(.0001);
 await expect(page.locator('#loop-time')).toContainText('Base 4 compases · 4.0 s');
});

for(const cancel of ['pad','pause','clear','reset']){
 test('P18 · cancelar la cuenta con '+cancel+' no deja una toma pendiente',async({rig,page})=>{
  await rig.open();await rig.record();await expect(rig.track().locator('.track-state')).toHaveText('PREVIA');
  if(cancel==='pad')await rig.pad(2);
  if(cancel==='pause')await rig.pause();
  if(cancel==='clear'){await rig.options();await rig.track().locator('[data-loop-action="clear"]').click();}
  if(cancel==='reset')await page.getByRole('button',{name:'Nueva sesión'}).click();
  await expect(page.locator('#count-in')).toBeHidden();await expect(page.locator('#tempo')).toBeEnabled();
  await page.waitForTimeout(2100);await expect(page.getByRole('button',{name:'Grabar o cerrar pista 2',exact:true})).toHaveText('Grabar');
 });
}

test('P19 · cerrar corta al pulsar, completa con silencio y mute conserva la vuelta',async({rig,page})=>{
 await rig.open();await rig.take({duration:.4});
 await expect(rig.track().locator('.track-length')).toHaveText('1 compás');
 const cycle=await rig.capture(2.2),levels=[];
 for(let i=0;i+2400<cycle.samples.length;i+=2400)levels.push(rms(cycle.samples.slice(i,i+2400)));
 expect(Math.max(...levels)).toBeGreaterThan(.005);expect(Math.min(...levels)).toBeLessThan(.0001);
 await rig.mute();await expect(rig.track().locator('.track-state')).toHaveText('OFF');
 expect(await rig.rms(1.1)).toBeLessThan(.0001);
 const before=await rig.track().locator('.ring-progress').getAttribute('style');
 await page.waitForTimeout(200);expect(await rig.track().locator('.ring-progress').getAttribute('style')).not.toBe(before);
 await rig.mute();expect(await rig.rms(1.1)).toBeGreaterThan(.001);
 await rig.pause();const paused=await rig.track().locator('.ring-progress').getAttribute('style');
 await page.waitForTimeout(250);await expect(rig.track().locator('.ring-progress')).toHaveAttribute('style',paused);
});

test('P20 · tomas posteriores esperan inicio, una toma larga sigue y amplía la canción',async({rig,page})=>{
 await rig.open();await rig.take({duration:.45,note:60});await rig.pad(3);await rig.record(3);
 await expect(rig.track(3).locator('.track-state')).toHaveText('ESPERA');
 await rig.recording(3);await rig.note(67);
 await page.waitForTimeout(1450);await expect(rig.track(3).locator('.track-state')).toHaveText('REC');
 await rig.off(67);await rig.record(3);
 await expect(rig.track(3).locator('.track-length')).toHaveText('2 compases');
 await expect(rig.track(2).locator('.track-length')).toHaveText('1 compás');
 await expect(page.locator('#loop-time')).toContainText('Ciclo 2.0 s');
 await rig.mute(2);expect(await rig.rms(2)).toBeGreaterThan(.001);
 await rig.mute(3);expect(await rig.rms()).toBeLessThan(.0001);
});

test('P21 · overdub suma audio y deja intactas las otras pistas',async({rig,page})=>{
 await rig.open();await rig.take({duration:.7,note:60});
 const before=await rig.rms(1.1);
 await rig.record();await rig.recording();await rig.note(67);await page.waitForTimeout(700);await rig.off(67);await rig.record();await expect(rig.track().locator('.track-state')).toHaveText('ON');
 const after=await rig.rms(1.1);expect(after).toBeGreaterThan(before*1.05);
 await rig.saved();await page.reload();await rig.activate();await rig.resume();
 expect(await rig.rms(1.1)).toBeGreaterThan(before*1.05);
});

test('P22 · recorte es reversible, cambios esperan el inicio común y se pueden cancelar',async({rig,page})=>{
 await rig.open();await rig.take({duration:1.35});
 await expect(rig.track().locator('.track-length')).toHaveText('2 compases');
 await rig.resize(2,'shorten');await expect(rig.track().locator('.track-length')).toHaveText(/2 → 1|1 compás/);
 await expect(rig.track().locator('.track-length')).toHaveText('1 compás');
 await rig.resize(2,'lengthen');await expect(rig.track().locator('.track-length')).toHaveText(/1 → 2|2 compases/);
 await expect(rig.track().locator('.track-length')).toHaveText('2 compases');
 expect(await rig.rms(2.1)).toBeGreaterThan(.002);
 await rig.resize(2,'lengthen');await rig.resize(2,'shorten');
 await expect(rig.track().locator('.track-length')).toHaveText('2 compases');
});

test('P23 · BPM cambia velocidad y tono del loop, no de notas en vivo',async({rig,page})=>{
 await rig.open({bpm:120});await rig.take({duration:.55,note:69});
 await rig.tempo(240);await expect(page.locator('#loop-time')).toContainText('Base 4 compases · 4.0 s');
 const doubled=await rig.capture(1.1);expect(frequency(doubled.samples.filter(v=>Math.abs(v)>.00001),doubled.rate)).toBeGreaterThan(700);
 await rig.mute();await rig.note(69);const live=await rig.capture(.5);
 expect(frequency(live.samples,live.rate)).toBeGreaterThan(430);expect(frequency(live.samples,live.rate)).toBeLessThan(450);
 await rig.off();await rig.mute();await rig.record();await rig.recording();await expect(page.locator('#tempo')).toBeDisabled();
 await rig.record();await expect(page.locator('#tempo')).toBeEnabled();
});

test('P24 · metrónomo respeta BPM y apagarlo o pausar deja silencio',async({rig,page})=>{
 await rig.open();await page.getByRole('button',{name:'Metrónomo',exact:true}).click();
 const audio=await rig.capture(1.4),starts=[];let last=-10000;
 for(let i=0;i<audio.samples.length;i++)if(Math.abs(audio.samples[i])>.001){if(i-last>audio.rate*.04)starts.push(i);last=i;}
 expect(starts.length).toBeGreaterThanOrEqual(4);
 for(let i=1;i<starts.length;i++)expect(Math.abs((starts[i]-starts[i-1])/audio.rate-.25)).toBeLessThan(.005);
 await rig.pause();expect(await rig.rms()).toBeLessThan(.0001);
 await expect(page.getByRole('button',{name:'Metrónomo',exact:true})).toHaveAttribute('aria-pressed','false');
});

test('P25 · toma demasiado corta avisa, no guarda basura y permite grabar otra vez',async({rig,page})=>{
 await rig.open();await rig.record();await page.waitForFunction(()=>document.querySelector('#track-0 .track-state').textContent==='REC',{},{polling:10});await rig.pad(2);
 await expect(page.locator('#notice')).toContainText('al menos un cuarto');
 await expect(page.getByRole('button',{name:'Grabar o cerrar pista 2',exact:true})).toHaveText('Grabar');
 await rig.take();expect(await rig.rms(1.1)).toBeGreaterThan(.001);
});

test('P26 · borrar y nueva sesión liberan el audio y vuelven a una pista',async({rig,page})=>{
 await rig.open();await rig.take();await rig.pad(8);await rig.take({track:8});
 await rig.options(2);await rig.track(2).locator('[data-loop-action="clear"]').click();
 await expect(rig.track(2).locator('.track-state')).toHaveText('');
 expect(await rig.rms(1.1)).toBeGreaterThan(.001);
 await page.getByRole('button',{name:'Nueva sesión'}).click();
 await expect(page.locator('#tracks article')).toHaveCount(1);
 expect(await rig.rms()).toBeLessThan(.0001);
 await rig.saved();await page.reload();await expect(page.locator('#tracks article')).toHaveCount(1);
});
