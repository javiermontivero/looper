import {test,expect} from './fixtures.mjs';
import {savedSession} from './saved-session.mjs';

// Long-run regression is intentionally wall-clock: this is the real app clock,
// not LoopCore stepping or patched audio timing. Included in npm test.
test('P49 · 1000 vueltas continuas no acumulan desincronización @soak',async({rig,page})=>{
 test.setTimeout(1100000);
 await savedSession(page,{bpm:137,tracks:[{bars:1,seconds:240/137,pulse:true},{bars:2,seconds:480/137,pulse:true}]});
 await page.goto('index.html');await rig.activate();await rig.resume();
 await rig.tempo(240);
 const audio=await page.evaluate(()=>window.__device.pulses(1002));
 expect(audio.starts.length).toBeGreaterThanOrEqual(1000);
 for(let i=2;i<audio.starts.length;i++)expect(Math.abs((audio.starts[i]-audio.starts[1])-(i-1)*audio.rate)).toBeLessThanOrEqual(2);
 expect(audio.peak).toBeGreaterThan(.08);
});
