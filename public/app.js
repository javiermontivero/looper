import {PRESETS,Synth} from './synth.js';
import {decode,matches,learnMapping} from './midi.js';
import {Looper} from './looper.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
let synth,context,access,selected='',learning=null,filter='Todos',octave=4,starting;
let mappings=read('looper:mappings',{});if(!mappings||typeof mappings!=='object'||Array.isArray(mappings))mappings={};
let preset=PRESETS.find(p=>p.id===read('looper:preset','velvet'))||PRESETS[0];
let volume=Number(read('looper:volume',65));if(!Number.isFinite(volume))volume=65;volume=Math.max(0,Math.min(100,volume));
const pressed=new Map(),latches=new Map(),pointers=new Map(),computer=new Set();
function notice(message){$('#notice').hidden=!message;$('#notice').textContent=message;}
function errorText(error){return error?.message||String(error);}
async function activate(){
 if(context?.state==='running')return true;
 if(starting)return starting;
 starting=(async()=>{try{
  if(!context){context=new AudioContext({latencyHint:'interactive'});synth=new Synth(context);synth.preset=preset;synth.volume(volume/100);context.onstatechange=()=>{$('#audio-status').textContent=context.state==='running'?'Audio activo':'Audio suspendido';$('#power').textContent=context.state==='running'?'Audio activo':'Reactivar audio';};}
  await context.resume();return context.state==='running';
 }catch(e){notice('No se pudo activar el audio: '+errorText(e));return false;}
 finally{starting=null;}})();return starting;
}
function setPreset(p){preset=p;if(synth)synth.preset=p;$('#current-preset').textContent=p.name;$('#preset-description').textContent=p.description;save('looper:preset',p.id);renderPresets();}
function renderPresets(){
 $('#presets').replaceChildren();const list=PRESETS.filter(p=>filter==='Todos'||p.category===filter);
 $('#preset-count').textContent=list.length+' presets';
 for(const p of list){const b=document.createElement('button');b.className='preset'+(p.id===preset.id?' active':'');b.setAttribute('aria-pressed',String(p.id===preset.id));
 const cat=document.createElement('span');cat.className='category';cat.textContent=p.category.toUpperCase();const title=document.createElement('strong');title.textContent=p.name;
 const n=document.createElement('span');n.className='number';n.textContent=String(PRESETS.indexOf(p)+1).padStart(2,'0');b.append(cat,title,n);b.onclick=()=>setPreset(p);$('#presets').append(b);}
}
function setVolume(v){volume=Math.max(0,Math.min(100,Math.round(v)));$('#volume').value=volume;$('#volume-value').textContent=volume+'%';synth?.volume(volume/100);save('looper:volume',volume);}
let keyElements=[],paintPending=false;
function paint(){
 if(paintPending)return;
 paintPending=true;
 requestAnimationFrame(()=>{
  paintPending=false;const notes=new Set(pressed.values());
  for(const k of keyElements){const playing=notes.has(Number(k.dataset.note));if(k._playing!==playing){k._playing=playing;k.classList.toggle('playing',playing);}}
 });
}
function on(key,note,velocity=100,channel='local'){if(!synth||context.state!=='running')return;pressed.set(key,note);synth.noteOn(key,note,velocity,channel);$('#last-note').textContent=noteName(note)+' · Intensidad '+velocity;paint();}
function off(key){synth?.noteOff(key);pressed.delete(key);paint();}
function panic(){synth?.panic();pressed.clear();computer.clear();pointers.clear();latches.clear();paint();}
function noteName(note){return['Do','Do♯','Re','Re♯','Mi','Fa','Fa♯','Sol','Sol♯','La','La♯','Si'][note%12]+(Math.floor(note/12)-1);}
function renderKeyboard(){
 $('#keyboard').replaceChildren();const base=(octave+1)*12;const compact=matchMedia('(max-width: 720px)').matches,total=compact?13:25,whiteCount=compact?8:15;let whites=0;
 for(let i=0;i<total;i++){const note=base+i,black=[1,3,6,8,10].includes(note%12),b=document.createElement('button');b.className='key'+(black?' black':'');b.dataset.note=note;b.setAttribute('aria-label',noteName(note));b.tabIndex=-1;
 if(black){b.style.left=(whites/whiteCount*100-(compact?3.8:2.15))+'%';b.style.width=(compact?7.6:4.3)+'%';}else whites++;
 if(note%12===0)b.textContent='C'+(Math.floor(note/12)-1);
 b.onpointerdown=async e=>{e.preventDefault();b.setPointerCapture(e.pointerId);const key='pointer:'+e.pointerId;pointers.set(e.pointerId,key);if(context?.state==='running')on(key,note);else if(await activate())if(pointers.get(e.pointerId)===key)on(key,note);};
 const end=e=>{const key=pointers.get(e.pointerId);if(key)off(key);pointers.delete(e.pointerId);};
 b.onpointerup=end;b.onpointercancel=end;b.onlostpointercapture=end;$('#keyboard').append(b);}
 keyElements=$$('.key');$('#octave-value').textContent=octave;paint();
}
function renderMappings(){for(const b of $$('[data-learn]')){const action=b.dataset.learn,m=mappings[action];b.classList.toggle('learning',learning===action);b.textContent=learning===action?'Cancelar':m?(m.type==='cc'?'CC ':'Nota ')+m.number:'Asignar';}}
function setLearning(action){learning=learning===action?null:action;$('#learn-status').textContent=learning?(learning==='volume'?'Mové una perilla MIDI.':'Pulsá una tecla, pad o botón MIDI.'):'Asignaciones guardadas en este navegador.';renderMappings();}
function process(event,device){
 const e=decode(event.data);if(!e)return;const channel=device+':'+e.channel,key=channel+':'+e.number;
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
  if(e.number===120||e.number===123){synth?.channelOff(channel);for(const k of pressed.keys())if(k.startsWith(channel+':'))pressed.delete(k);paint();}
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
 select.value=selected;$('#midi-dot').classList.toggle('connected',!!selected);
 $('#midi-status').textContent=selected?'Listo. Tocá tu teclado; también podés desconectarlo y volver a conectarlo.':'MIDI habilitado. Esperando un teclado USB…';
 $('#connect').textContent=selected?'Actualizar dispositivos':'Buscar teclado MIDI';
}
async function connect(){
 if(!window.isSecureContext){notice('Para conectar tu teclado, abrí esta app con HTTPS confiable o desde localhost. El teclado en pantalla sí funciona por HTTP.');return;}
 if(!navigator.requestMIDIAccess){notice('Este navegador no ofrece Web MIDI. En Android, usá Chrome. Firefox para Android y Safari en iPhone no ofrecen MIDI USB web; el teclado táctil sigue disponible.');return;}
 try{access??=await navigator.requestMIDIAccess({sysex:false});access.onstatechange=refreshInputs;refreshInputs();notice('');}
 catch(e){$('#midi-status').textContent='No se habilitó el acceso MIDI.';notice('MIDI: '+errorText(e)+'. Revisá el permiso del sitio; Firefox puede pedir un permiso adicional.');}
}
$('#power').onclick=async()=>{await activate();await connect();};
$('#connect').onclick=async()=>{await activate();await connect();};
$('#midi-input').onchange=e=>{panic();selected=e.target.value;refreshInputs();};
$('#volume').oninput=e=>setVolume(Number(e.target.value));
$('#panic').onclick=silenceAll;
for(const b of $$('[data-filter]'))b.onclick=()=>{filter=b.dataset.filter;for(const t of $$('[data-filter]'))t.classList.toggle('active',t===b);renderPresets();};
for(const b of $$('[data-learn]'))b.onclick=()=>setLearning(b.dataset.learn);
$('#clear-mappings').onclick=()=>{mappings={};save('looper:mappings',mappings);latches.clear();learning=null;renderMappings();$('#learn-status').textContent='Asignaciones borradas.';};
$('#octave-down').onclick=()=>{panic();octave=Math.max(0,octave-1);renderKeyboard();};
$('#octave-up').onclick=()=>{panic();octave=Math.min(7,octave+1);renderKeyboard();};
const keys=['KeyA','KeyW','KeyS','KeyE','KeyD','KeyF','KeyT','KeyG','KeyY','KeyH','KeyU','KeyJ','KeyK','KeyO','KeyL','KeyP','Semicolon'];
window.addEventListener('keydown',async e=>{
 if(e.code==='Escape'){silenceAll();if(learning)setLearning(learning);return;}
 if(e.ctrlKey||e.metaKey||e.altKey||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
 const index=keys.indexOf(e.code);if(index<0||e.repeat)return;e.preventDefault();computer.add(e.code);
 if(context?.state==='running')on('computer:'+e.code,(octave+1)*12+index);else if(await activate())if(computer.has(e.code))on('computer:'+e.code,(octave+1)*12+index);
});
window.addEventListener('keyup',e=>{computer.delete(e.code);off('computer:'+e.code);});
window.addEventListener('blur',silenceAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)silenceAll();});
let looper,looperStarting,loopBusy=false,lastLoopMessage=-1,lastLoopRevision=-1,lastClockText='';
const loopClock=$('#loop-clock'),loopProgress=$('#loop-progress');
async function ensureLooper(){
 if(!(await activate()))throw new Error('Activá el audio para grabar.');
 if(document.hidden)throw new Error('Volvé a la app para comenzar a grabar.');
 if(looper)return looper;
 if(!looperStarting)looperStarting=Looper.create(context,synth.input,synth.compressor,renderLoop,notice)
   .then(value=>{looper=value;return value;}).finally(()=>{looperStarting=null;});
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
 const clockText=state.length?state.seconds.toFixed(2)+' s por vuelta':active?state.elapsed.toFixed(1)+' s / 60 s':'Primer loop: duración libre';
 if(clockText!==lastClockText){loopClock.textContent=clockText;lastClockText=clockText;}
 loopProgress.value=state.length?state.position/state.length:0;
 if(state.revision===lastLoopRevision)return;
 lastLoopRevision=state.revision;
 $('#loop-transport').disabled=!state.length&&!active;
 $('#loop-transport').textContent=state.paused?'Reanudar':'Pausar';
 $('#loop-reset').disabled=!state.length&&!active;
 for(let i=0;i<5;i++){
  const t=state.tracks[i],row=$('#track-'+i),record=row.querySelector('[data-loop-action="record"]'),mute=row.querySelector('[data-loop-action="mute"]'),clear=row.querySelector('[data-loop-action="clear"]');
  row.classList.toggle('recording',state.active===i);row.classList.toggle('muted',t.muted);
  row.querySelector('.track-state').textContent=state.active===i?(t.mode==='overdub'?'Sumando audio':'Grabando'):(t.hasAudio?(state.paused?'Pausada':t.muted?'Apagada':'Reproduciendo'):'Vacía');
  record.textContent=state.active===i?'Cerrar':t.hasAudio?'Overdub':'Grabar';
  record.setAttribute('aria-pressed',String(state.active===i));
  mute.textContent=t.muted?'Encender':'Apagar';mute.disabled=!t.hasAudio;mute.setAttribute('aria-pressed',String(!t.muted&&t.hasAudio));
  clear.disabled=!t.hasAudio&&state.active!==i;
 }
 if(state.message&&state.revision!==lastLoopMessage){$('#loop-status').textContent=state.message;lastLoopMessage=state.revision;}
 else if(!state.message)$('#loop-status').textContent=active?(state.length?'Lo que tocás se suma solo a esta pista.':'Tocá tu frase y pulsá Cerrar para empezar a repetirla.'):state.paused?'Pausado. Reanudá para seguir desde esta posición.':'Elegí una pista para grabar. Cada pista nueva cierra automáticamente después de una vuelta.';
}
for(const b of $$('[data-loop-action]'))b.onclick=()=>{
 const type=b.dataset.loopAction,track=Number(b.dataset.track);
 if(type==='clear'&&!confirm('¿Borrar el audio de la pista '+(track+1)+'?'))return;
 loopCommand(type,track);
};
$('#loop-transport').onclick=()=>loopCommand(looper?.state?.paused?'resume':'pause');
$('#loop-reset').onclick=()=>{if(confirm('¿Borrar las cinco pistas y empezar una sesión nueva?'))loopCommand('reset');};
window.addEventListener('beforeunload',event=>{if(looper?.hasAudio){event.preventDefault();event.returnValue='';}});
setPreset(preset);setVolume(volume);renderKeyboard();renderMappings();
renderLoop({length:0,position:0,seconds:0,elapsed:0,active:-1,paused:false,revision:0,message:'',tracks:Array.from({length:5},()=>({hasAudio:false,muted:false,mode:'empty'}))});
if(!window.isSecureContext)notice('El audio funciona aquí. Para usar tu teclado MIDI necesitás HTTPS confiable; el servidor tiene disponible setup-https.sh para configurar nginx.');
if(window.isSecureContext&&navigator.permissions){navigator.permissions.query({name:'midi',sysex:false}).then(p=>{if(p.state==='granted')connect();}).catch(()=>{});}

matchMedia('(max-width: 720px)').addEventListener('change',()=>{panic();renderKeyboard();});
