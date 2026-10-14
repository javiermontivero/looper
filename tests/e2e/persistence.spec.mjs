import {test,expect,frequency,rms} from './fixtures.mjs';
import {savedSession} from './saved-session.mjs';

test('P33 · sesión real recupera audio, pista dispersa, mute, tempo, selección y efectos',async({rig,page})=>{
 await rig.open();await rig.take();await rig.pad(8);await rig.take({track:8,note:67});
 await rig.mute(2);await rig.pad(8);await rig.effect(3,'volume');await rig.param(0,90);await rig.tempo(180);
 await rig.pause();await rig.saved();await page.reload();
 await expect(page.locator('#app')).toHaveJSProperty('inert',false);
 await expect(page.locator('#tracks article')).toHaveCount(2);await expect(page.locator('#tempo')).toHaveValue('180');
 await expect(page.locator('#fx-track')).toHaveText('Pista 8');
 await rig.activate();expect(await rig.rms()).toBeLessThan(.0001);
 await rig.resume();await expect(rig.track(2).locator('.track-state')).toHaveText('OFF');
 expect(await rig.rms(1.5)).toBeGreaterThan(.001);
 await page.getByRole('button',{name:'Seleccionar efecto 3',exact:true}).click();
 await expect(page.locator('#fx-type')).toHaveValue('volume');await expect(page.locator('#fx-param-0')).toHaveValue('90');
 await rig.mute(8);expect(await rig.rms()).toBeLessThan(.0001);await rig.mute(2);expect(await rig.rms(1.5)).toBeGreaterThan(.001);
});

test('P34 · recortar, overdub y recargar conservan el audio original oculto',async({rig,page})=>{
 await savedSession(page,{tracks:[{bars:1,seconds:1.8,tailOnly:true}]});
 await page.goto('index.html');await rig.activate();await rig.resume();
 expect(await rig.rms(1.1)).toBeLessThan(.0001);
 await rig.record();await rig.recording();await rig.note(69);await page.waitForTimeout(400);await rig.off(69);await rig.record();
 await rig.saved();await page.reload();await rig.activate();await rig.resume();
 await rig.resize(2,'lengthen');await expect(rig.track().locator('.track-length')).toHaveText('2 compases');
 const audio=await rig.capture(2.1);
 // The hidden original is 220 Hz; the overdub is 440 Hz. Both survive.
 const windows=[];for(let i=0;i+4800<audio.samples.length;i+=4800){const chunk=audio.samples.slice(i,i+4800);if(rms(chunk)>.005)windows.push(frequency(chunk,audio.rate));}
 expect(windows.some(f=>f>200&&f<240)).toBe(true);expect(windows.some(f=>f>420&&f<460)).toBe(true);
});

test.describe('cambio de dispositivo de audio',()=>{
 test.use({sampleRate:44100});
 test('P35 · sesión 48 kHz restaura a 44.1 kHz sin cambiar afinación, duración ni fase',async({rig,page})=>{
  await savedSession(page,{tracks:[{bars:1,seconds:1,frequency:440}],transport:48000*1000});
  await page.goto('index.html');await rig.activate();await rig.resume();
  const sound=await rig.capture(.5);expect(sound.rate).toBe(44100);expect(frequency(sound.samples,sound.rate)).toBeGreaterThan(435);expect(frequency(sound.samples,sound.rate)).toBeLessThan(445);
  await expect(rig.track().locator('.track-length')).toHaveText('1 compás');await expect(page.locator('#loop-time')).toContainText('Ciclo 1.0 s');
 });
});

test('P36 · cuota agotada avisa y conserva la última sesión completa',async({rig,page,context})=>{
 await rig.open();await rig.take();await rig.saved();await rig.pause();await rig.saved();
 await context.addCookies([{name:'e2e-storage-failure',value:'1',url:'http://127.0.0.1:8080'}]);
 await page.reload();await rig.activate();
 await rig.pad(8);await rig.take({track:8,duration:1.1,note:67});
 await expect(page.locator('#save-status')).toContainText('No se pudo guardar',{timeout:15000});
 await context.clearCookies({name:'e2e-storage-failure'});
 await page.reload();await rig.activate();await rig.resume();
 expect(await rig.rms(1.1)).toBeGreaterThan(.001);
 await expect(rig.track(2).locator('.track-length')).toHaveText('1 compás');
 await expect(rig.track(8).locator('.track-state')).toHaveText('');
});

for(const invalid of ['version','rate','bars','missing-audio']){
test('P37 · sesión incompatible ('+invalid+') avisa sin impedir tocar ni sobrescribirla',async({rig,page})=>{
 await savedSession(page,{invalid});await page.goto('index.html');
 await expect(page.locator('#save-status')).toHaveText('Guardado local no disponible');await expect(page.locator('#notice')).toContainText('No se pudo recuperar');
 await rig.choose('organ');await rig.activate();await rig.note();expect(await rig.rms()).toBeGreaterThan(.005);await rig.off();
 await page.reload();await expect(page.locator('#notice')).toContainText('No se pudo recuperar');
});

}

test('P38 · cambios mientras se guarda recuperan el estado más reciente',async({rig,page})=>{
 await savedSession(page,{tracks:[{bars:64,seconds:60}]});await page.goto('index.html');await rig.activate();
 await rig.pad(8);await rig.effect(1,'volume');await rig.param(0,80);
 await rig.pad(2);await rig.options();await rig.resume();await expect(page.locator('#save-status')).toHaveText('Guardando audio…');await rig.track().locator('[data-loop-action="clear"]').click();
 await rig.saved();await page.reload();await rig.activate();
 await expect(rig.track().locator('.track-state')).toHaveText('');
 await expect(page.locator('#tracks article')).toHaveCount(2);
 await rig.pad(8);await rig.pad(9);await expect(page.locator('#fx-type')).toHaveValue('volume');await expect(page.locator('#fx-param-0')).toHaveValue('80');
 expect(await rig.rms()).toBeLessThan(.0001);
});
