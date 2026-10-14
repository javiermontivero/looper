import {test,expect} from './fixtures.mjs';
test('P01 · activar y tocar produce audio real',async({rig})=>{
 await rig.open();await rig.note();
 expect(await rig.rms()).toBeGreaterThan(.005);
 await rig.off();await rig.page.waitForTimeout(200);expect(await rig.rms()).toBeLessThan(.0001);
});
