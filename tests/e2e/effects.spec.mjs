import {test,expect,rms} from './fixtures.mjs';

test('P27 · volumen opcional, boost y panorama estéreo de potencia constante',async({rig})=>{
 await rig.open();await rig.note();const dry=await rig.rms();
 await rig.effect(1,'volume');const unity=await rig.rms();expect(unity/dry).toBeCloseTo(Math.SQRT1_2,1);
 await rig.param(0,100);expect((await rig.rms())/unity).toBeCloseTo(100/70,1);
 await rig.param(1,0);let sound=await rig.capture(.3);expect(rms(sound.left.slice(-9600))).toBeGreaterThan(.005);expect(rms(sound.right.slice(-9600))).toBeLessThan(.0001);
 await rig.param(1,100);sound=await rig.capture(.3);expect(rms(sound.right.slice(-9600))).toBeGreaterThan(.005);expect(rms(sound.left.slice(-9600))).toBeLessThan(.0001);
 await rig.param(0,0);expect(await rig.rms()).toBeLessThan(.0001);
 await rig.effect(1,'none');expect((await rig.rms())/dry).toBeCloseTo(1,1);
});

for(const [effect,param,note] of [['lowpass',0,84],['highpass',100,36],['eq',0,36]]){
 test('P28 · '+effect+' modifica el espectro y quitarlo recupera el sonido',async({rig})=>{
  await rig.open();await rig.note(note);const dry=await rig.rms();
  await rig.effect(1,effect);await rig.param(0,param);
  expect(await rig.rms()).toBeLessThan(dry*(effect==='eq'?.7:.15));
  await rig.effect(1,'none');expect((await rig.rms())/dry).toBeCloseTo(1,1);
 });
}

for(const effect of ['delay','reverb']){
 test('P29 · '+effect+' deja una cola audible después de soltar; quitarlo recupera silencio',async({rig,page})=>{
  await rig.open();await rig.effect(1,effect);await rig.param(0,70);await rig.param(1,100);
  await rig.note();await page.waitForTimeout(400);await rig.off();
  expect(await rig.rms(1.4)).toBeGreaterThan(.0001);
  await rig.effect(1,'none');expect(await rig.rms()).toBeLessThan(.0001);
 });
}

test('P30 · tremolo modula amplitud y distorsión altera la forma de onda',async({rig})=>{
 await rig.open();await rig.note(60);const dry=await rig.rms();
 await rig.effect(1,'tremolo');await rig.param(0,35);await rig.param(1,100);
 const sound=await rig.capture(1),window=Math.round(sound.rate*.025),levels=[];
 for(let i=0;i+window<sound.samples.length;i+=window)levels.push(rms(sound.samples.slice(i,i+window)));
 expect(Math.max(...levels)).toBeGreaterThan(Math.min(...levels)*4);
 await rig.effect(1,'distortion');await rig.param(0,100);await rig.param(1,100);
 expect(await rig.rms()).toBeGreaterThan(dry*2);
 await rig.effect(1,'none');expect((await rig.rms())/dry).toBeCloseTo(1,1);
});

test('P31 · reordenar tiene efecto audible y ocho espacios se guardan por pista',async({rig,page})=>{
 await rig.open();await rig.effect(1,'volume');await rig.param(0,20);
 await rig.effect(2,'distortion');await rig.param(0,100);await rig.param(1,100);
 await rig.note();const before=await rig.rms();
 await page.getByRole('button',{name:'Mover efecto antes',exact:true}).click();
 const after=await rig.rms();expect(before).toBeGreaterThan(after*1.5);await rig.off();
 for(let slot=3;slot<=8;slot++)await rig.effect(slot,'volume');
 await rig.saved();await page.reload();await expect(page.locator('#app')).toHaveJSProperty('inert',false);
 await page.getByRole('button',{name:'Seleccionar efecto 1',exact:true}).click();await expect(page.locator('#fx-type')).toHaveValue('distortion');await expect(page.locator('#fx-param-0')).toHaveValue('100');
 await expect(page.locator('.fx-slots button')).toHaveCount(8);
 for(let slot=2;slot<=8;slot++)await expect(page.locator('#fx-slot-'+(slot-1))).toContainText('Volumen');
 await rig.activate();await rig.pad(8);await rig.pad(9);await expect(page.locator('#fx-type')).toHaveValue('none');
});

test('P32 · efectos de pista y master son independientes y nunca imprimen la toma',async({rig,page})=>{
 await rig.open();await rig.pad(2);await rig.effect(1,'volume');await rig.param(0,0);
 await rig.take();expect(await rig.rms(1.1)).toBeLessThan(.0001);
 await rig.effect(1,'none');expect(await rig.rms(1.1)).toBeGreaterThan(.002);
 await rig.pad(8);await rig.effect(1,'volume');await rig.param(0,0);
 expect(await rig.rms(1.1)).toBeGreaterThan(.002);
 await rig.pad(1);await rig.effect(1,'volume');await rig.param(0,0);
 expect(await rig.rms(1.1)).toBeLessThan(.0001);
 await rig.effect(1,'none');expect(await rig.rms(1.1)).toBeGreaterThan(.002);
 await page.keyboard.press('Escape');expect(await rig.rms()).toBeLessThan(.0001);
});
