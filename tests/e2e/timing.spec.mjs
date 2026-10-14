import {test,expect,rms} from './fixtures.mjs';
import {savedSession} from './saved-session.mjs';

for(const bpm of [120,137,240]){
 test('P45 · pistas de 1 y 2 compases mantienen un único pulso a '+bpm+' BPM después de miles de vueltas',async({rig,page})=>{
  await savedSession(page,{bpm,transport:48000*(240/bpm)*10000,tracks:[{bars:1,seconds:240/bpm,pulse:true},{bars:2,seconds:480/bpm,pulse:true}]});
  await page.goto('index.html');await rig.activate();await rig.resume();
  const audio=await page.evaluate(seconds=>window.__device.pulses(seconds),12*(240/bpm));
  expect(audio.starts.length).toBeGreaterThanOrEqual(11);
  for(let i=2;i<audio.starts.length;i++)expect(Math.abs((audio.starts[i]-audio.starts[i-1])/audio.rate-240/bpm)).toBeLessThan(2/audio.rate);
  expect(audio.peak).toBeGreaterThan(.08); // Two simultaneous voices, not a missing track.
 });
}

test('P46 · siete pistas se oyen y se silencian de manera independiente',async({rig,page})=>{
 await savedSession(page,{tracks:Array.from({length:7},(_,i)=>({bars:1,seconds:1,frequency:220+i*55}))});
 await page.goto('index.html');await rig.activate();await rig.resume();
 for(let n=2;n<=8;n++)await rig.mute(n);
 expect(await rig.rms()).toBeLessThan(.0001);
 for(let n=2;n<=8;n++){await rig.mute(n);expect(await rig.rms()).toBeGreaterThan(.005);await rig.mute(n);}
 expect(await rig.rms()).toBeLessThan(.0001);
});

test('P47 · límites de 1–128 compases agregan silencio sin duplicar audio y bloquean overdub largo',async({rig,page})=>{
 await savedSession(page,{tracks:[{bars:128,seconds:1}]});
 await page.goto('index.html');await rig.activate();
 await rig.options();await expect(rig.track().locator('[data-loop-action="lengthen"]')).toBeDisabled();
 await expect(page.getByRole('button',{name:'Grabar o cerrar pista 2',exact:true})).toBeDisabled();
 await rig.resume();const audio=await rig.capture(2.5);expect(rms(audio.samples.slice(-24000))).toBeLessThan(.0001);
 await rig.pad(2);await expect(rig.track().locator('.track-state')).toHaveText('OFF');
 await rig.pause();
});

test('P48 · la toma termina automáticamente a los 60 segundos y puede recuperarse',async({rig,page})=>{
 test.setTimeout(100000);
 await rig.open();await rig.record();await rig.recording();await rig.note(60);
 await expect(rig.track().locator('.track-state')).toHaveText('ON',{timeout:65000});await rig.off();
 await expect(rig.track().locator('.track-length')).toHaveText('64 compases');
 await rig.saved();await page.reload();await rig.activate();await rig.resume();await expect.poll(()=>rig.rms(),{timeout:8000}).toBeGreaterThan(.005);
});
