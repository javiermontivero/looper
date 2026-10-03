import {PRESETS,Synth} from './synth.js';
import {decode,matches,learnMapping} from './midi.js';
import {Looper} from './looper.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
let synth,context,access,selected='',learning=null,octave=4,starting;
let mappings=read('looper:mappings',{});if(!mappings||typeof mappings!=='object'||Array.isArray(mappings))mappings={};
let preset=PRESETS.find(p=>p.id===read('looper:preset','velvet'))||PRESETS[0];
let volume=Number(read('looper:volume',65));if(!Number.isFinite(volume))volume=65;volume=Math.max(0,Math.min(100,volume));
const latches=new Map(),computer=new Set();
function notice(message){$('#notice').hidden=!message;$('#notice').textContent=message;}
function errorText(error){return error?.message||String(error);}
async function activate(){
 if(context?.state==='running')return true;
 if(starting)return starting;
 starting=(async()=>{try{
  if(!context){context=new AudioContext({latencyHint:'interactive'});synth=new Synth(context);synth.preset=preset;synth.volume(volume/100);context.onstatechange=()=>{$('#power').textContent=context.state==='running'?'Audio ✓':'Activar';};}
  await context.resume();return context.state==='running';
 }catch(e){notice('No se pudo activar el audio: '+errorText(e));return false;}
 finally{starting=null;}})();return starting;
}
function setPreset(p){preset=p;if(synth)synth.preset=p;$('#sound').value=p.id;save('looper:preset',p.id);}
function setVolume(v){volume=Math.max(0,Math.min(100,Math.round(v)));$('#volume').value=volume;$('#volume-value').textContent=volume+'%';synth?.volume(volume/100);clearTimeout(volumeSaveTimer);volumeSaveTimer=setTimeout(()=>save('looper:volume',volume),300);}
let lastMidiDelay=null,volumeSaveTimer;
function on(key,note,velocity=100,channel='local'){if(!synth||context.state!=='running')return;synth.noteOn(key,note,velocity,channel);}
function off(key){synth?.noteOff(key);}
function panic(){synth?.panic();computer.clear();latches.clear();}
function renderMappings(){for(const b of $$('[data-learn]')){const action=b.dataset.learn,m=mappings[action];b.classList.toggle('learning',learning===action);b.textContent=learning===action?'Cancelar':m?(m.type==='cc'?'CC ':'Nota ')+m.number:'Asignar';}}
function setLearning(action){learning=learning===action?null:action;$('#learn-status').textContent=learning?(learning==='volume'?'Mové una perilla MIDI.':'Pulsá una tecla, pad o botón MIDI.'):'Asignaciones guardadas en este navegador.';renderMappings();}
function process(event,device){
 const e=decode(event.data);if(!e)return;
 if(e.type==='on'&&Number.isFinite(event.timeStamp)){const delay=performance.now()-event.timeStamp;if(delay>=0&&delay<10000)lastMidiDelay=delay;}const channel=device+':'+e.channel,key=channel+':'+e.number;
 if(learning){const m=learnMapping(learning,e,device);if(m){const action=learning;for(const a of Object.keys(mappings))if(matches(mappings[a],e,device))delete mappings[a];mappings[action]=m;latches.set(action,e.value>=64);save('looper:mappings',mappings);setLearning(null);off(key);return;}}
 for(const action of ['volume','previous','next','track0','track1','track2','track3','track4']){if(!matches(mappings[action],e,device))continue;
  if(action==='volume'){setVolume(e.value/127*100);return;}
  const down=e.type==='on'||(e.type==='cc'&&e.value>=64);
  if(down&&!latches.get(action)){if(action.startsWith('track'))loopCommand('mute',Number(action.slice(5)));else{const i=PRESETS.indexOf(preset);setPreset(PRESETS[(i+(action==='next'?1:-1)+PRESETS.length)%PRESETS.length]);}}
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
$('#clear-mappings').onclick=()=>{mappings={};save('looper:mappings',mappings);latches.clear();learning=null;renderMappings();$('#learn-status').textContent='Asignaciones borradas.';};


const keys=['KeyA','KeyW','KeyS','KeyE','KeyD','KeyF','KeyT','KeyG','KeyY','KeyH','KeyU','KeyJ','KeyK','KeyO','KeyL','KeyP','Semicolon'];
window.addEventListener('keydown',async e=>{
 if(e.code==='Escape'){silenceAll();if(learning)setLearning(learning);return;}
 if(e.ctrlKey||e.metaKey||e.altKey||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
 const index=keys.indexOf(e.code);if(index<0||e.repeat)return;e.preventDefault();computer.add(e.code);
 if(context?.state==='running')on('computer:'+e.code,(octave+1)*12+index);else if(await activate())if(computer.has(e.code))on('computer:'+e.code,(octave+1)*12+index);
});
window.addEventListener('keyup',e=>{computer.delete(e.code);off('computer:'+e.code);});
window.addEventListener('blur',silenceAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)silenceAll();});
let bpm=120;
let looper,looperStarting,loopBusy=false,lastLoopMessage=-1,lastLoopRevision=-1;
const loopProgress=$('#loop-progress');
async function ensureLooper(){
 if(!(await activate()))throw new Error('Activá el audio para grabar.');
 if(document.hidden)throw new Error('Volvé a la app para comenzar a grabar.');
 if(looper)return looper;
 if(!looperStarting)looperStarting=Looper.create(context,synth.input,synth.compressor,renderLoop,notice)
   .then(value=>{looper=value;looper.command('tempo',undefined,bpm);return value;}).finally(()=>{looperStarting=null;});
 return looperStarting;
}
async function loopCommand(type,track){
 try{
  if(type==='record'){
   if(loopBusy)return;loopBusy=true;
   try{const engine=await ensureLooper();if(!document.hidden)engine.command(type,track);}finally{loopBusy=false;}
  }else if(looper){if(type==='resume'&&!(await activate()))return;looper.command(type,track);}
 }catch(e){notice('Looper: '+errorText(e));}
}
function silenceAll(){panic();if(looper)loopCommand('pause');}
function renderLoop(state){
 const active=state.active>=0;

 loopProgress.value=state.length?state.position/state.length:0;
 if(state.revision===lastLoopRevision)return;
 lastLoopRevision=state.revision;
 if(Number.isFinite(state.bpm))bpm=state.bpm;
 $('#tempo').value=bpm;
 $('#tempo').disabled=active;
 $('#loop-transport').disabled=!state.length&&!active;
 $('#loop-transport').textContent=state.paused?'Reanudar':'Pausar';
 $('#loop-reset').disabled=!state.length&&!active;
 for(let i=0;i<5;i++){
  const t=state.tracks[i],row=$('#track-'+i),record=row.querySelector('[data-loop-action="record"]'),mute=row.querySelector('[data-loop-action="mute"]'),clear=row.querySelector('[data-loop-action="clear"]');
  row.classList.toggle('recording',state.active===i);row.classList.toggle('muted',t.muted);row.classList.toggle('playing',t.hasAudio&&!t.muted&&!state.paused);
  row.querySelector('.track-state').textContent=state.active===i?(t.mode==='overdub'?'DUB':'REC'):(t.hasAudio?(state.paused?'II':t.muted?'OFF':'ON'):'');
  record.textContent=state.active===i?'Cerrar':t.hasAudio?'Overdub':'Grabar';
  record.setAttribute('aria-pressed',String(state.active===i));
  mute.textContent=t.muted?'▶':'■';mute.disabled=!t.hasAudio;mute.setAttribute('aria-pressed',String(!t.muted&&t.hasAudio));
  const double=row.querySelector('[data-loop-action="double"]');
  double.disabled=!t.canDouble;
  row.querySelector('.track-length').textContent=t.hasAudio?(t.multiple||1)+'×':'';
  clear.disabled=!t.hasAudio&&state.active!==i;
 }
 if(state.message&&state.revision!==lastLoopMessage){notice(state.message);lastLoopMessage=state.revision;}

}
for(const b of $$('[data-loop-action]'))b.onclick=()=>{
 const type=b.dataset.loopAction,track=Number(b.dataset.track);
 if(type==='clear'&&!confirm('¿Borrar el audio de la pista '+(track+1)+'?'))return;
 loopCommand(type,track);
};
$('#tempo').onchange=event=>{
 const value=Number(event.target.value);
 if(!Number.isFinite(value)||value<40||value>240){event.target.value=bpm;return;}
 if(looper)looper.command('tempo',undefined,value);else bpm=value;
};
$('#loop-transport').onclick=()=>loopCommand(looper?.state?.paused?'resume':'pause');
$('#loop-reset').onclick=()=>{if(confirm('¿Borrar las cinco pistas y empezar una sesión nueva?'))loopCommand('reset');};
window.addEventListener('beforeunload',event=>{if(looper?.hasAudio){event.preventDefault();event.returnValue='';}});
for(const category of ['Teclas','Bajos','Pads','Leads']){
 const group=document.createElement('optgroup');group.label=category;
 for(const p of PRESETS.filter(p=>p.category===category)){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;group.append(option);}
 $('#sound').append(group);
}
$('#sound').onchange=event=>{const p=PRESETS.find(p=>p.id===event.target.value);if(p)setPreset(p);};
$('#settings-open').onclick=()=>$('#settings').showModal();
$('#settings-close').onclick=()=>$('#settings').close();
setPreset(preset);setVolume(volume);renderMappings();
renderLoop({length:0,position:0,seconds:0,elapsed:0,active:-1,paused:false,revision:0,message:'',tracks:Array.from({length:5},()=>({hasAudio:false,muted:false,mode:'empty'}))});
if(!window.isSecureContext)notice('Abrí la dirección HTTPS para usar MIDI y grabar.');
if(window.isSecureContext&&navigator.permissions){navigator.permissions.query({name:'midi',sysex:false}).then(p=>{if(p.state==='granted')connect();}).catch(()=>{});}



const perfDetails=$('#performance-details'),perfReadout=$('#performance-readout');
function showPerformance(){
 const ms=value=>Number.isFinite(value)?(value*1000).toFixed(1)+' ms':'No informado';
 perfReadout.textContent=[
 'Audio: '+(context?.state||'apagado'),
 'Frecuencia: '+(context?.sampleRate||'—')+' Hz',
 'Latencia base informada: '+ms(context?.baseLatency),
 'Latencia de salida informada: '+ms(context?.outputLatency),
 'Entrega del último evento MIDI: '+(lastMidiDelay===null?'sin datos':lastMidiDelay.toFixed(1)+' ms'),
 'Voces: '+(synth?.voices?.size||0),
 'Looper: '+(!looper?'no iniciado':looper.state?.paused?'pausado':looper.state?.active>=0?'grabando':looper.state?.length?'reproduciendo':'vacío')
 ].join('\n');
}
perfDetails.ontoggle=()=>{if(perfDetails.open)showPerformance();};
$('#refresh-performance').onclick=showPerformance;
