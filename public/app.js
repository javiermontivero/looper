import {SoundBrowser} from './sound-browser.js';
import {LatencyStats} from './latency.js';
import {PRESETS,Synth,loadInstrumentCatalog} from './instruments.js';
import {decode,matches,learnMapping,buttonDown,TrackButtons} from './midi.js';
import {Looper} from './looper.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
let synth,context,access,selected='',learning=null,octave=4,starting;
let mappings=read('looper:mappings',{});if(!mappings||typeof mappings!=='object'||Array.isArray(mappings))mappings={};
const savedCatalogPreset=read('looper:catalog-preset',null)||read('looper:preset','piano');
let preset=PRESETS.find(p=>p.id===read('looper:preset','piano'))||PRESETS[0];
let soundBrowser=new SoundBrowser(PRESETS,{presetId:preset.id,roleId:read('looper:role',null),remembered:read('looper:role-presets',{}),rememberedPages:read('looper:role-pages',{})});
let soundTimer,shownRole,presetChanges=0;
let volume=Number(read('looper:volume',65));if(!Number.isFinite(volume))volume=65;volume=Math.max(0,Math.min(100,volume));
const latencyStats=new LatencyStats();
let directMidiClick=false;
const midiActions=['previous','next'];
delete mappings.volume;
// Track pad notes are fixed; discard legacy learned track assignments.
for(const action of Object.keys(mappings))if(/^track\d+$/.test(action))delete mappings[action];
if(typeof PerformanceObserver==='function'&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){
 const observer=new PerformanceObserver(list=>{if(context?.state==='running')for(const entry of list.getEntries())latencyStats.task(entry.duration);});
 observer.observe({type:'longtask',buffered:false});
}
const latches=new Map(),computer=new Set();
const trackNotes=[30];
const trackButtons=new TrackButtons(fixedTrackCommand,{onError:error=>notice('MIDI: '+errorText(error))});
function notice(message){$('#notice').hidden=!message;$('#notice').textContent=message;}
function errorText(error){return error?.message||String(error);}
async function activate(){
 if(context?.state==='running')return true;
 if(starting)return starting;
 starting=(async()=>{try{
  if(!context){context=new AudioContext({latencyHint:'interactive'});synth=new Synth(context,{onStatus:message=>{$('#sound-status').textContent=message;$('#sound-status').hidden=!message;}});synth.selectPreset(preset);synth.volume(volume/100);context.onstatechange=()=>{$('#power').textContent=context.state==='running'?'Audio ✓':'Activar';};}
  await context.resume();return context.state==='running';
 }catch(e){notice('No se pudo activar el audio: '+errorText(e));return false;}
 finally{starting=null;}})();return starting;
}
function renderSoundChoice(){
 const role=soundBrowser.role,page=soundBrowser.page;$('#sound-role').value=role.id;
 if(shownRole!==page.id){
  $('#sound-page').replaceChildren();
  role.pages.forEach((p,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=(i+1)+'/'+role.pages.length;$('#sound-page').append(option);});
  $('#sound').replaceChildren();
  for(const p of page.presets){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;$('#sound').append(option);}
  shownRole=page.id;
 }
 $('#sound-page').value=String(soundBrowser.pageIndex);
 $('#sound-page').disabled=role.pages.length===1;
 $('#sound').value=soundBrowser.preset.id;
}
function setPreset(p){
 presetChanges++;
 clearTimeout(soundTimer);soundTimer=null;
 const changed=preset.id!==p.id;preset=p;soundBrowser.choose(p.id);
 if(synth&&changed)synth.selectPreset(p);
 renderSoundChoice();save('looper:preset',p.id);if(presetChanges>1)save('looper:catalog-preset',p.id);save('looper:role',soundBrowser.role.id);save('looper:role-presets',soundBrowser.remembered);save('looper:role-pages',soundBrowser.rememberedPages);
}
function queueSound(){
 renderSoundChoice();clearTimeout(soundTimer);
 soundTimer=setTimeout(()=>{soundTimer=null;setPreset(soundBrowser.preset);},250);
}
function cancelSoundSelection(){
 clearTimeout(soundTimer);soundTimer=null;soundBrowser.choose(preset.id);renderSoundChoice();
}
function setVolume(v){volume=Math.max(0,Math.min(100,Math.round(v)));$('#volume').value=volume;$('#volume-value').textContent=volume+'%';synth?.volume(volume/100);clearTimeout(volumeSaveTimer);volumeSaveTimer=setTimeout(()=>save('looper:volume',volume),300);}
let lastMidiDelay=null,volumeSaveTimer;
function on(key,note,velocity=100,channel='local'){if(!synth||context.state!=='running')return;const started=performance.now();try{if(directMidiClick)synth.testClick();else synth.noteOn(key,note,velocity,channel);}finally{latencyStats.add('note',performance.now()-started);}}
function off(key){synth?.noteOff(key);}
function panic(){cancelSoundSelection();synth?.panic();computer.clear();latches.clear();trackButtons.reset();}
function renderMappings(){for(const b of $$('[data-learn]')){const action=b.dataset.learn,m=mappings[action];b.classList.toggle('learning',learning===action);b.textContent=learning===action?'Cancelar':m?(m.type==='cc'?'CC ':'Nota ')+m.number:'Asignar';}}
function setLearning(action){trackButtons.reset();learning=learning===action?null:action;$('#learn-status').textContent=learning?(learning==='volume'?'Mové una perilla MIDI.':'Pulsá una tecla, pad o botón MIDI.'):'Asignaciones guardadas en este navegador.';renderMappings();}
function process(event,device){
 const e=decode(event.data);if(!e)return;
 if(e.type==='on'&&Number.isFinite(event.timeStamp)){const delay=performance.now()-event.timeStamp;if(delay>=0&&delay<10000){lastMidiDelay=delay;latencyStats.add('delivery',delay);}}const channel=device+':'+e.channel,key=channel+':'+e.number;
 // Reserve pad notes 30..45 on channel 10 before MIDI learn and instrument playback.
 if((e.type==='on'||e.type==='off')&&e.channel===9&&e.number>=30&&e.number<=45){trackButtons.handle(e.number-30,buttonDown(e));return;}
 // Fixed absolute pots and master slider precede learned mappings.
 if(e.type==='cc'&&e.channel===0){
  if(e.number===7){setVolume(e.value/127*100);return;}
  if(e.number===12){if(soundBrowser.turnPage(e.value))queueSound();return;}
  if(e.number===13){if(soundBrowser.turnRole(e.value))queueSound();return;}
  if(e.number===14){if(soundBrowser.turnSound(e.value))queueSound();return;}
 }
 if(learning){const m=learnMapping(learning,e,device);if(m){const action=learning;for(const a of Object.keys(mappings))if(matches(mappings[a],e,device))delete mappings[a];mappings[action]=m;latches.set(action,buttonDown(e));save('looper:mappings',mappings);setLearning(null);if(action.startsWith('track')&&buttonDown(e))trackButtons.suppress(Number(action.slice(5)));off(key);return;}}
 for(const action of midiActions){if(action.startsWith('track')&&Number(action.slice(5))>=trackCount)continue;if(!matches(mappings[action],e,device))continue;
  if(action==='volume'){setVolume(e.value/127*100);return;}
  const down=buttonDown(e);
  if(action.startsWith('track')){trackButtons.handle(Number(action.slice(5)),down);return;}
  if(down&&!latches.get(action)){{const list=soundBrowser.page.presets,i=list.indexOf(soundBrowser.preset);setPreset(list[(i+(action==='next'?1:-1)+list.length)%list.length]);}}
  latches.set(action,down);return;
 }
 if(e.type==='on')on(key,e.number,e.value,channel);
 else if(e.type==='off')off(key);
 else if(e.type==='bend')synth?.bend(channel,e.value);
 else if(e.type==='cc'){
  if(e.number===64)synth?.pedal(channel,e.value>=64);
  if(e.number===120||e.number===123){synth?.channelOff(channel);}
  if(e.number===121){synth?.pedal(channel,false);synth?.bend(channel,8192);}
 }
}
function refreshInputs(){
 if(!access)return;const inputs=[...access.inputs.values()].filter(p=>p.state==='connected');
 if(!inputs.some(p=>p.id===selected)){panic();selected=inputs[0]?.id||'';}
 for(const input of access.inputs.values())input.onmidimessage=input.id===selected?e=>process(e,input.id):null;
 const select=$('#midi-input');select.replaceChildren();
 if(!inputs.length)select.add(new Option('Sin teclado conectado',''));
 else for(const input of inputs)select.add(new Option(input.name||'Dispositivo MIDI',input.id));
 select.value=selected;
 $('#midi-status').textContent=selected?'Listo. Tocá tu teclado; también podés desconectarlo y volver a conectarlo.':'MIDI habilitado. Esperando un teclado USB…';
 $('#connect').textContent=selected?'Actualizar dispositivos':'Buscar teclado MIDI';
}
async function connect(){
 if(!window.isSecureContext){notice('Para conectar tu teclado, abrí esta app con HTTPS confiable o desde localhost. El sintetizador requiere activar el audio.');return;}
 if(!navigator.requestMIDIAccess){notice('Este navegador no ofrece Web MIDI. En Android, usá Chrome. Firefox para Android y Safari en iPhone no ofrecen MIDI USB web; usá Chrome en Android para conectar el teclado.');return;}
 try{access??=await navigator.requestMIDIAccess({sysex:false});access.onstatechange=refreshInputs;refreshInputs();notice('');}
 catch(e){$('#midi-status').textContent='No se habilitó el acceso MIDI.';notice('MIDI: '+errorText(e)+'. Revisá el permiso del sitio; Firefox puede pedir un permiso adicional.');}
}
$('#power').onclick=async()=>{await activate();await connect();};
$('#connect').onclick=async()=>{await activate();await connect();};
$('#midi-input').onchange=e=>{panic();selected=e.target.value;refreshInputs();};
$('#volume').oninput=e=>setVolume(Number(e.target.value));
$('#panic').onclick=silenceAll;

for(const b of $$('[data-learn]'))b.onclick=()=>setLearning(b.dataset.learn);
$('#clear-mappings').onclick=()=>{mappings={};save('looper:mappings',mappings);latches.clear();trackButtons.reset();learning=null;renderMappings();$('#learn-status').textContent='Asignaciones borradas.';};


const keys=['KeyA','KeyW','KeyS','KeyE','KeyD','KeyF','KeyT','KeyG','KeyY','KeyH','KeyU','KeyJ','KeyK','KeyO','KeyL','KeyP','Semicolon'];
window.addEventListener('keydown',async e=>{
 if(e.code==='Escape'){silenceAll();if(learning)setLearning(learning);return;}
 if(e.ctrlKey||e.metaKey||e.altKey||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
 const index=keys.indexOf(e.code);if(index<0||e.repeat)return;e.preventDefault();computer.add(e.code);
 if(context?.state==='running')on('computer:'+e.code,(octave+1)*12+index);else if(await activate())if(computer.has(e.code))on('computer:'+e.code,(octave+1)*12+index);
});
window.addEventListener('keyup',e=>{computer.delete(e.code);off('computer:'+e.code);});
window.addEventListener('blur',silenceAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)silenceAll();});
let bpm=120,trackCount=1;

let looper,looperStarting,loopBusy=false,lastLoopMessage=-1,lastLoopRevision=-1;
const loopProgress=$('#loop-progress');
let countInTrack=-1;
async function ensureLooper(){
 if(!(await activate()))throw new Error('Activá el audio para grabar.');
 if(document.hidden)throw new Error('Volvé a la app para comenzar a grabar.');
 if(looper)return looper;
 const requestedTracks=trackCount;
 if(!looperStarting)looperStarting=Looper.create(context,synth.input,synth.compressor,renderLoop,notice)
   .then(value=>{looper=value;for(let i=1;i<requestedTracks;i++)looper.command('add');looper.command('tempo',undefined,bpm);return value;}).finally(()=>{looperStarting=null;});
 return looperStarting;
}
async function fixedTrackCommand(type,slot){
 const note=30+slot;
 let track=trackNotes.indexOf(note);
 if(track<0){
  if(type!=='trigger')return;
  try{
   const engine=await ensureLooper();
   if(document.hidden)return;
   track=trackNotes.indexOf(note);
   if(track<0){
    if(trackNotes.length>=16)return;
    track=trackNotes.length;trackNotes.push(note);engine.command('add');
   }
  }catch(e){notice('Looper: '+errorText(e));return;}
 }
 return loopCommand(type,track);
}
async function loopCommand(type,track){
 try{
  if(type==='record'||type==='trigger'){
   if(loopBusy)return;loopBusy=true;
   try{const engine=await ensureLooper();if(!document.hidden){
    if(synth.ready===false&&engine.state?.active!==track&&engine.state?.pending!==track&&!(type==='trigger'&&engine.state?.tracks?.[track]?.hasAudio)){notice('Esperá a que cargue el sonido o elegí un Sinte FM.');return;}engine.command(type,track);}}finally{loopBusy=false;}
  }else if(looper){if(type==='resume'&&!(await activate()))return;looper.command(type,track);}
 }catch(e){notice('Looper: '+errorText(e));}
}
function silenceAll(){panic();if(looper)loopCommand('pause');}
function renderLoop(state){
 const active=state.active>=0,pending=(state.pending??-1)>=0;
 syncTracks(state.tracks.length);

 const elapsed=active?state.elapsed:state.position/(context?.sampleRate||48000)/(state.speed||1);
 const base=state.baseSeconds||32*60/bpm;
 loopProgress.value=state.countInRemaining>0?1-state.countInRemaining/state.countInTotal:base?(elapsed%base)/base:0;
 $('#loop-time').textContent=(active?'REC '+elapsed.toFixed(1)+' s · '+(elapsed/base*8).toFixed(1)+'/8 compases':pending?'Espera al inicio · ': 'Ciclo '+((state.seconds||0)/(state.speed||1)).toFixed(1)+' s · ')+(active?'':'Base 8 compases · '+base.toFixed(1)+' s');
 if(state.countInRemaining>0)$('#loop-time').textContent='Entrada '+(Math.floor(state.countInBeat/4)+1)+'/2 · '+(state.countInBeat%4+1)+'/4';
 const counting=state.countInRemaining>0,banner=$('#count-in');
 if(counting)countInTrack=state.pending;
 const justStarted=!counting&&active&&state.active===countInTrack&&state.elapsed<60/bpm;
 banner.hidden=!counting&&!justStarted;
 if(counting){
  banner.dataset.stage=state.countInBeat===7?'last':'counting';
  $('#count-in-label').textContent='COMPÁS '+(Math.floor(state.countInBeat/4)+1)+' DE 2';
  $('#count-in-number').textContent=String(state.countInBeat%4+1);
  $('#count-in-next').textContent=state.countInBeat===7?'Ahora entrás → REC':'Preparáte';
 }else if(justStarted){
  banner.dataset.stage='recording';$('#count-in-label').textContent='GRABANDO';
  $('#count-in-number').textContent='¡REC!';$('#count-in-next').textContent='Tocá';
 }else countInTrack=-1;

 for(let i=0;i<state.tracks.length;i++){
  const t=state.tracks[i];
  const label=$('#track-'+i).querySelector('.track-length'),text=state.active===i?state.elapsed.toFixed(1)+' s':t.hasAudio?(t.pendingBars?t.bars+' → '+t.pendingBars:t.bars)+(t.bars===1&&!t.pendingBars?' compás':' compases'):'';
  if(label.textContent!==text)label.textContent=text;
 }
 if(state.revision===lastLoopRevision)return;
 lastLoopRevision=state.revision;
 if(Number.isFinite(state.bpm))bpm=state.bpm;
 $('#tempo').value=bpm;
 $('#tempo').disabled=active||pending;
 $('#metronome').setAttribute('aria-pressed',String(!!state.metronome));
 $('#loop-transport').disabled=!state.length&&!active&&!pending&&!state.metronome;
 $('#loop-transport').textContent=state.paused?'Reanudar':'Pausar';
 $('#loop-reset').disabled=!state.length&&!active&&!pending;
 for(let i=0;i<state.tracks.length;i++){
  const t=state.tracks[i],row=$('#track-'+i),record=row.querySelector('[data-loop-action="record"]'),mute=row.querySelector('[data-loop-action="mute"]'),clear=row.querySelector('[data-loop-action="clear"]');
  row.classList.toggle('recording',state.active===i);row.classList.toggle('muted',t.muted);row.classList.toggle('playing',t.hasAudio&&!t.muted&&!state.paused);
  row.querySelector('.track-state').textContent=state.pending===i?(state.countInRemaining>0?'PREVIA':'ESPERA'):state.active===i?(t.mode==='overdub'?'DUB':'REC'):(t.hasAudio?(state.paused?'II':t.muted?'OFF':'ON'):'');
  record.textContent=state.pending===i?'Cancelar':state.active===i?'Cerrar':t.hasAudio?'Overdub':'Grabar';
  record.setAttribute('aria-pressed',String(state.active===i||state.pending===i));
  mute.textContent=t.muted?'▶':'■';mute.disabled=!t.hasAudio;mute.setAttribute('aria-pressed',String(!t.muted&&t.hasAudio));
  const shorter=row.querySelector('[data-loop-action="shorten"]'),longer=row.querySelector('[data-loop-action="lengthen"]');
  shorter.disabled=!t.hasAudio||active||pending||(t.pendingBars||t.bars)<=1;
  longer.disabled=!t.hasAudio||active||pending||(t.pendingBars||t.bars)>=128;
  record.disabled=t.hasAudio&&t.canOverdub===false||state.tracks.some(track=>track.pendingBars);
  record.title=t.canOverdub===false?'Acortá el ciclo a 60 s o menos para overdub':'';
  clear.disabled=!t.hasAudio&&state.active!==i&&state.pending!==i;
 }
 if(state.message&&state.revision!==lastLoopMessage){notice(state.message);lastLoopMessage=state.revision;}

}
function bindTrack(row){
 for(const b of row.querySelectorAll('[data-loop-action]'))b.onclick=()=>{
  const type=b.dataset.loopAction,track=Number(b.dataset.track);
  if(type==='clear'&&!confirm('¿Borrar el audio de la pista '+(trackNotes[track]-29)+'?'))return;
  loopCommand(type,track);
 };
 for(const b of row.querySelectorAll('[data-learn]'))b.onclick=()=>setLearning(b.dataset.learn);
}
function syncTracks(count){
 if(trackCount===count)return;
 while(trackCount<count){
  const i=trackCount++,row=document.createElement('article');
  row.className='track';row.id='track-'+i;row.setAttribute('aria-label','Pista '+(trackNotes[i]-29));
  row.innerHTML="<div class=\"track-main\"><span class=\"number\">01</span><span class=\"track-info\"><span class=\"track-state\"></span></span><button class=\"record\" data-loop-action=\"record\" data-track=\"0\" aria-label=\"Grabar o cerrar pista 1\" aria-pressed=\"false\">Grabar</button><button class=\"mute icon\" data-loop-action=\"mute\" data-track=\"0\" aria-label=\"Encender o apagar pista 1\" disabled>▶</button><details><summary aria-label=\"Opciones de pista 1\">⋯</summary><div class=\"track-menu\"><span class=\"hint\">Nota 30</span><button data-loop-action=\"clear\" data-track=\"0\" disabled>Borrar</button></div></details></div><div class=\"track-duration\"><button data-loop-action=\"shorten\" data-track=\"0\" aria-label=\"Acortar ciclo de pista 1\" disabled>‹</button><span class=\"track-length\" aria-label=\"Duración de la pista\"></span><button data-loop-action=\"lengthen\" data-track=\"0\" aria-label=\"Alargar ciclo de pista 1\" disabled>›</button></div>".replace(/data-track="0"/g,'data-track="'+i+'"').replace('Nota 30','Nota '+trackNotes[i]).replace(/pista 1/g,'pista '+(trackNotes[i]-29)).replace(/Pista 1/g,'Pista '+(trackNotes[i]-29)).replace('>01<','>'+String(trackNotes[i]-29).padStart(2,'0')+'<');
  $('#tracks').append(row);bindTrack(row);
 }
 while(trackCount>count){$('#track-'+(--trackCount)).remove();}
 $('#add-track').disabled=trackCount>=16;renderMappings();
}
bindTrack($('#track-0'));
$('#add-track').onclick=()=>{if(trackNotes.length>=16)return;let note=30;while(trackNotes.includes(note))note++;trackNotes.push(note);if(looper)looper.command('add');else syncTracks(trackNotes.length);};
let metroBusy=false;
$('#metronome').onclick=async()=>{
 if(metroBusy)return;metroBusy=true;
 try{const engine=await ensureLooper();if(!document.hidden)engine.command('metronome',undefined,!engine.state?.metronome);}
 catch(error){notice('Metrónomo: '+errorText(error));}finally{metroBusy=false;}
};
$('#tempo').onchange=event=>{
 const value=Number(event.target.value);
 if(!Number.isFinite(value)||value<40||value>240){event.target.value=bpm;return;}
 if(looper)looper.command('tempo',undefined,value);else{bpm=value;$('#loop-time').textContent='Base 8 compases · '+(32*60/bpm).toFixed(1)+' s';}
};
$('#loop-transport').onclick=()=>loopCommand(looper?.state?.paused?'resume':'pause');
$('#loop-reset').onclick=()=>{if(confirm('¿Borrar todas las pistas y empezar una sesión nueva?')){trackButtons.reset();learning=null;trackNotes.splice(0,trackNotes.length,30);loopCommand('reset');}};
window.addEventListener('beforeunload',event=>{if(looper?.hasAudio){event.preventDefault();event.returnValue='';}});
for(const role of soundBrowser.roles){const option=document.createElement('option');option.value=role.id;option.textContent=role.name;$('#sound-role').append(option);}
$('#sound-page').onchange=event=>{if(soundBrowser.selectPage(Number(event.target.value)))setPreset(soundBrowser.preset);};
$('#sound-role').onchange=event=>{const index=soundBrowser.roles.findIndex(r=>r.id===event.target.value);if(soundBrowser.selectRole(index))setPreset(soundBrowser.preset);};
$('#sound').onchange=event=>{const p=PRESETS.find(p=>p.id===event.target.value);if(p)setPreset(p);};
$('#settings-open').onclick=()=>$('#settings').showModal();
$('#settings-close').onclick=()=>$('#settings').close();
setPreset(preset);setVolume(volume);renderMappings();
let catalogBusy=false;
async function refreshCatalog(){
 if(catalogBusy)return;catalogBusy=true;
 const before=presetChanges,savedId=presetChanges<=1?savedCatalogPreset:preset.id;
 $('#catalog-retry').disabled=true;$('#catalog-status').textContent='Consultando catálogo…';
 try{
  const result=await loadInstrumentCatalog();
  const wanted=soundTimer?soundBrowser.preset:presetChanges===before?PRESETS.find(p=>p.id===savedId)||preset:preset;
  const remembered={...read('looper:role-presets',{}),...soundBrowser.remembered};
  soundBrowser=new SoundBrowser(PRESETS,{presetId:wanted.id,roleId:soundBrowser.role.id,remembered,rememberedPages:soundBrowser.rememberedPages});
  $('#sound-role').replaceChildren();
  for(const role of soundBrowser.roles){const option=document.createElement('option');option.value=role.id;option.textContent=role.name;$('#sound-role').append(option);}
  shownRole=null;setPreset(wanted);
  $('#catalog-status').textContent=PRESETS.length+' sonidos · '+(result.issues.length?result.issues.join(' · '):'Catálogo completo de esta versión.');
 }catch{
  $('#catalog-status').textContent=PRESETS.length+' sonidos disponibles. No se pudo consultar el catálogo adicional; podés reintentar.';
 }finally{catalogBusy=false;$('#catalog-retry').disabled=false;}
}
$('#catalog-retry').onclick=refreshCatalog;
refreshCatalog();

renderLoop({length:0,position:0,seconds:0,elapsed:0,active:-1,paused:false,revision:0,message:'',tracks:Array.from({length:1},()=>({hasAudio:false,muted:false,mode:'empty'}))});
if(!window.isSecureContext)notice('Abrí la dirección HTTPS para usar MIDI y grabar.');
if(window.isSecureContext&&navigator.permissions){navigator.permissions.query({name:'midi',sysex:false}).then(p=>{if(p.state==='granted')connect();}).catch(()=>{});}



const perfDetails=$('#performance-details'),perfReadout=$('#performance-readout');
function showPerformance(){
 const summary=kind=>{const s=latencyStats.summary(kind);return s?s.median.toFixed(2)+' / '+s.p95.toFixed(2)+' / '+s.max.toFixed(2)+' ms ('+s.count+' notas)':'sin datos';};
 const ms=value=>Number.isFinite(value)?(value*1000).toFixed(1)+' ms':'No informado';
 perfReadout.textContent=[
 'Audio: '+(context?.state||'apagado'),
 'Frecuencia: '+(context?.sampleRate||'—')+' Hz',
 'Latencia base informada: '+ms(context?.baseLatency),
 'Latencia de salida informada: '+ms(context?.outputLatency),
 'Entrega MIDI → JS (mediana / p95 / máx): '+summary('delivery'),
 'Preparar nota (mediana / p95 / máx): '+summary('note'),
 'Bloqueos de interfaz ≥50 ms: '+latencyStats.longTasks+' · mayor '+latencyStats.longestTask.toFixed(1)+' ms',
 'Ruta: '+(directMidiClick?'clic directo':'instrumento')+' · salida sin look-ahead',
 'Estas cifras no miden tecla → parlante ni el tiempo físico del USB.',
 'Voces: '+((synth?.voices?.size||0)+(synth?.sampleVoices?.size||0)),
 'Looper: '+(!looper?'no iniciado':looper.state?.paused?'pausado':looper.state?.active>=0?'grabando':looper.state?.length?'reproduciendo':'vacío')
 ].join('\n');
}
perfDetails.ontoggle=()=>{if(perfDetails.open)showPerformance();};
$('#refresh-performance').onclick=showPerformance;

$('#direct-midi-click').onchange=e=>{panic();directMidiClick=e.target.checked;latencyStats.reset();showPerformance();};
$('#test-click').onpointerdown=async e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();if(await activate())synth.testClick();};
$('#test-click').onclick=async e=>{if(e.detail===0&&await activate())synth.testClick();};
$('#reset-performance').onclick=()=>{latencyStats.reset();showPerformance();};
