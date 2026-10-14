import {test as base,expect} from '@playwright/test';
import {installDevice} from './device.js';
export {expect};
export function wav(frequency=261.625565,duration=2,decay=false){
 const rate=12000,length=Math.round(rate*duration),buffer=Buffer.alloc(44+length*2);
 buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(length*2,40);
 for(let i=0;i<length;i++)buffer.writeInt16LE(Math.round(32767*.12*Math.sin(2*Math.PI*frequency*i/rate)*(decay?Math.exp(-i/rate*3):1)),44+i*2);
 return buffer;
}
const tone=wav(),drum=wav(180,2,true),soundfont='MIDI.Soundfont.fixture = {\n"C4":"data:audio/wav;base64,'+tone.toString('base64')+'",\n};';
export const test=base.extend({
 sampleRate:[48000,{option:true}],
 rig:async({page,context,sampleRate},use,testInfo)=>{
  const errors=[],unexpected=[],requests=[];
  const network={fail:null,delay:null,delayMs:1000};
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(installDevice,{sampleRate});
  await context.route('**/*',async route=>{
   if(route.request().url().startsWith('http://127.0.0.1:8080/'))return route.continue();
   const url=decodeURIComponent(route.request().url());requests.push(url);
   if(network.fail&&url.includes(network.fail))return route.abort('failed');
   if(network.delay&&url.includes(network.delay))await new Promise(r=>setTimeout(r,network.delayMs));
   const fulfill=(body,contentType='application/json')=>route.fulfill({status:200,body:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body),contentType});
   if(url==='https://cdn.jsdelivr.net/npm/tone@15.1.22/build/Tone.js')return route.fulfill({path:'node_modules/tone/build/Tone.js',contentType:'text/javascript'});
   if(url==='https://cdn.jsdelivr.net/npm/smplr@1.1.0/dist/index.mjs')return route.fulfill({path:'node_modules/smplr/dist/index.mjs',contentType:'text/javascript'});
   if(url.includes('gleitz.github.io/')&&url.endsWith('.js'))return fulfill(soundfont,'text/javascript');
   if(url.endsWith('/sfz_files.json'))return fulfill(['Strings/Violin/Violin - Arco','Idiophones/Marimba']);
   if(url.endsWith('/files.json'))return fulfill(['C4 CELL','C4 VIOL','C4 STRINGS','C4 test']);
   if(url.endsWith('/dm.json'))return fulfill({samples:['kick-1','snare-1','closed-1','open-1']});
   if(url.includes('/machines/')&&url.endsWith('.json'))return fulfill({id:'fixture',sample_sets:[{path:'fixture',url_path:'fixture',samples:['kick.wav','snare.wav','closed.wav','open.wav'],sample_instruments:['kick','snare','closed','open']}]});
   if(url.endsWith('.sfz'))return fulfill('<group> lokey=0 hikey=127 pitch_keycenter=60 ampeg_release=0.04\n<region> sample='+ (url.includes('wurlitzer')?'ab6mp.wav':'fixture.wav'),'text/plain');
   if(/\.(ogg|m4a|wav|mp3)$/.test(url))return fulfill(/drum|hydrogen/i.test(url)?drum:tone,'audio/wav');
   unexpected.push(url);return route.abort();
  });
  page.on('dialog',dialog=>dialog.accept());
  const rig=new Product(page,network,requests);
  await use(rig);
  if(testInfo.status!==testInfo.expectedStatus)console.error('Failure UI:',await page.locator('#app').evaluate(el=>{const clone=el.cloneNode(true);clone.querySelectorAll('select,dialog').forEach(e=>e.remove());return clone.textContent;}).catch(()=>'<closed>'));
  expect(errors,'uncaught browser errors').toEqual([]);
  expect(unexpected,'unrecognized external resource: update a provider fixture explicitly').toEqual([]);
 }
});
export class Product{
 constructor(page,network,requests){this.page=page;this.network=network;this.requests=requests;}
 track(n=2){return this.page.getByRole('article',{name:'Pista '+n,exact:true});}
 async open({activate=true,preset='organ',bpm=240}={}){
  await this.page.goto('index.html');
  await expect(this.page.locator('#app')).toHaveJSProperty('inert',false);
  if(preset)await this.choose(preset);
  if(bpm)await this.tempo(bpm);
  if(activate)await this.activate();
 }
 async activate(){
  await this.page.getByRole('button',{name:'Activar audio y conectar MIDI'}).click();
  await expect(this.page.locator('#power')).toHaveText('Audio ✓');
  await expect(this.page.locator('#midi-input')).toHaveValue('minicontrol');
  await this.page.evaluate(()=>window.__device.ready());
  await this.page.waitForTimeout(100);
  await expect(this.page.locator('#app')).toHaveJSProperty('inert',false);
 }
 async choose(value){
  await expect(this.page.locator('#catalog-status')).not.toHaveText('Consultando catálogo…');
  const roles=await this.page.locator('#sound-role option').evaluateAll(options=>options.map(o=>o.value));
  for(const role of roles){
   await this.page.locator('#sound-role').selectOption(role);
   if(await this.page.locator('#sound option').evaluateAll((options,value)=>options.some(o=>o.value===value),value)){
    await this.page.locator('#sound').selectOption(value);return;
   }
  }
  throw Error('Instrumento no publicado en la UI: '+value);
 }
 async tempo(value){await this.page.getByRole('spinbutton',{name:'BPM de referencia'}).fill(String(value));await this.page.getByRole('spinbutton',{name:'BPM de referencia'}).press('Tab');}
 async midi(data,device='minicontrol'){await this.page.evaluate(({data,device})=>window.__device.send(data,device),{data,device});}
 async messages(messages){await this.page.evaluate(messages=>messages.forEach(data=>window.__device.send(data)),messages);}
 async note(note=60,velocity=100,channel=0){await this.midi([0x90|channel,note,velocity]);}
 async off(note=60,channel=0){await this.midi([0x80|channel,note,0]);}
 async cc(number,value,channel=0){await this.midi([0xb0|channel,number,value]);}
 async pad(number,{hold=0}={}){await this.note(number+29,100,9);if(hold)await this.page.waitForTimeout(hold);await this.off(number+29,9);}
 async capture(seconds=.35){return this.page.evaluate(seconds=>window.__device.capture(seconds),seconds);}
 async rms(seconds=.35){const audio=await this.capture(seconds+.18);return rms(audio.samples.slice(Math.floor(audio.rate*.18)));}
 async readySound(){await expect(this.page.locator('#sound-status')).toBeHidden();}
 async record(n=2){await this.page.getByRole('button',{name:'Grabar o cerrar pista '+n,exact:true}).click();}
 async recording(n=2){await expect(this.track(n).locator('.track-state')).toHaveText(/^(REC|DUB)$/);}
 async take({track=2,duration=.45,note=60}={}){
  await this.record(track);await this.recording(track);
  if(note!==null)await this.note(note);
  await this.page.waitForTimeout(duration*1000);
  if(note!==null)await this.off(note);
  await this.record(track);
  await expect(this.track(track).locator('.track-state')).toHaveText('ON');
 }
 async saved(){await expect(this.page.locator('#save-status')).toHaveText('Guardado local',{timeout:15000});}
 async pause(){await this.page.getByRole('button',{name:'Pausar',exact:true}).click();await expect(this.page.locator('#loop-transport')).toHaveText('Reanudar');}
 async resume(){await this.page.getByRole('button',{name:'Reanudar',exact:true}).click();}
 async mute(n=2){await this.page.getByRole('button',{name:'Encender o apagar pista '+n,exact:true}).click();}
 async options(n=2){const details=this.track(n).locator('details');if(await details.getAttribute('open')===null)await this.page.getByLabel('Opciones de pista '+n,{exact:true}).click();}
 async resize(n,direction){await this.options(n);await this.track(n).locator('[data-loop-action="'+direction+'"]').click();}
 async effect(slot,type){
  await this.page.getByRole('button',{name:'Seleccionar efecto '+slot,exact:true}).click();
  await this.page.locator('#fx-type').selectOption(type);
 }
 async param(index,value){
  const slider=this.page.locator('#fx-param-'+index);await slider.focus();await slider.press('Home');
  for(let i=0;i<value;i++)await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(value));
  await this.page.waitForTimeout(150);
 }
 async diagnostics(){
  await this.page.getByRole('button',{name:'Ajustes',exact:true}).click();
  const details=this.page.locator('#performance-details');if(await details.getAttribute('open')===null)await this.page.getByText('Rendimiento',{exact:true}).click();
  await this.page.getByRole('button',{name:'Actualizar',exact:true}).click();
  await expect(this.page.locator('#performance-readout')).toContainText('Audio:');
  return this.page.locator('#performance-readout').textContent();
 }
}
export function rms(samples){return Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/Math.max(1,samples.length));}
export function frequency(samples,rate){
 // Count positive crossings after discarding initial transients; adequate for sine fixtures.
 const start=Math.floor(samples.length*.2);let count=0;
 for(let i=start+1;i<samples.length;i++)if(samples[i-1]<=0&&samples[i]>0)count++;
 return count*rate/(samples.length-start);
}
