import {AudioEngine} from './audio-engine.js';
import {SoundBrowser,RelativePots} from './sound-browser.js';
import {LatencyStats} from './latency.js';
import {PRESETS,InstrumentSource,loadInstrumentCatalog} from './instruments.js';
import {decode,matches,learnMapping,buttonDown,TrackButtons} from './midi.js';
import {Looper} from './looper.js';
import {EFFECTS,emptyChain} from './effects.js';
import {SessionStore,cleanConfig,prepareRestore,validateSnapshot} from './session.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
let synth,audio,context,access,selected='',learning=null,octave=4,starting;
let mappings=read('looper:mappings',{});if(!mappings||typeof mappings!=='object'||Array.isArray(mappings))mappings={};
const savedCatalogPreset=read('looper:catalog-preset',null)||read('looper:preset','piano');
let preset=PRESETS.find(p=>p.id===read('looper:preset','piano'))||PRESETS[0];
const relativePots=new RelativePots();
let soundBrowser=new SoundBrowser(PRESETS,{presetId:preset.id,roleId:read('looper:role',null),remembered:read('looper:role-presets',{})});
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
const trackNotes=[31];
let selectedTrack=-1,selectedEffect=-1,mixer,chains=Array.from({length:8},emptyChain);
let restoringAudio=false,sessionLoaded=false,sessionWritable=true,pendingSnapshot=null,configTimer,snapshotTimer,fxTimer,snapshotSerial=0,lastSavedRevision=-1;
const session=new SessionStore(text=>{$('#save-status').textContent=session.capture?'Toma en curso · guardado al cerrar':text;});
$('#app').inert=true;
const trackButtons=new TrackButtons(fixedTrackCommand,{onError:error=>notice('MIDI: '+errorText(error))});
function notice(message){$('#notice').hidden=!message;$('#notice').textContent=message;}
function errorText(error){return error?.message||String(error);}
async function activate(){
 if(context?.state==='running')return true;
 if(starting)return starting;
 starting=(async()=>{try{
  if(!audio){
   const engine=await AudioEngine.create();
   try{
    synth=new InstrumentSource(engine.context,{onStatus:message=>{$('#sound-status').textContent=message;$('#sound-status').hidden=!message;}});
    engine.setSource(synth);engine.volume(volume/100);
    mixer=engine.mixer;chains.forEach((c,i)=>mixer.set(i-1,c));
    mixer.select(selectedTrack<0?-1:trackNotes[selectedTrack]-31);
   }catch(error){synth?.dispose();synth=null;engine.dispose();throw error;}
   audio=engine;context=audio.context;synth.selectPreset(preset);
   context.onstatechange=()=>{$('#power').textContent=context.state==='running'?'Audio ✓':'Activar';};
  }
  await context.resume();$('#power').textContent=context.state==='running'?'Audio ✓':'Activar';return context.state==='running';
 }catch(e){notice('No se pudo activar el audio: '+errorText(e));return false;}
 finally{starting=null;}})();return starting;
}
function renderSoundChoice(){
 const role=soundBrowser.role;$('#sound-role').value=role.id;
 if(shownRole!==role.id){
  $('#sound').replaceChildren();
  for(const p of role.presets){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;$('#sound').append(option);}
  shownRole=role.id;
 }
 $('#sound').value=soundBrowser.preset.id;
}
function setPreset(p){
 presetChanges++;
 clearTimeout(soundTimer);soundTimer=null;
 const changed=preset.id!==p.id;preset=p;soundBrowser.choose(p.id);
 if(synth&&changed)synth.selectPreset(p);
 renderSoundChoice();save('looper:preset',p.id);if(presetChanges>1)save('looper:catalog-preset',p.id);save('looper:role',soundBrowser.role.id);save('looper:role-presets',soundBrowser.remembered);scheduleConfig();
}
function queueSound(){
 renderSoundChoice();clearTimeout(soundTimer);
 soundTimer=setTimeout(()=>{soundTimer=null;setPreset(soundBrowser.preset);},250);
}
function cancelSoundSelection(){
 clearTimeout(soundTimer);soundTimer=null;soundBrowser.choose(preset.id);renderSoundChoice();
}
function setVolume(v){volume=Math.max(0,Math.min(100,Math.round(v)));$('#volume').value=volume;$('#volume-value').textContent=volume+'%';audio?.volume(volume/100);clearTimeout(volumeSaveTimer);volumeSaveTimer=setTimeout(()=>save('looper:volume',volume),300);scheduleConfig();}
let lastMidiDelay=null,volumeSaveTimer;
function on(key,note,velocity=100,channel='local'){if(!synth||context.state!=='running')return;const started=performance.now();try{if(directMidiClick)audio.testClick();else synth.noteOn(key,note,velocity,channel);}finally{latencyStats.add('note',performance.now()-started);}}
function off(key){synth?.noteOff(key);}
function panic(){cancelSoundSelection();synth?.panic();computer.clear();latches.clear();trackButtons.reset();}
function renderMappings(){for(const b of $$('[data-learn]')){const action=b.dataset.learn,m=mappings[action];b.classList.toggle('learning',learning===action);b.textContent=learning===action?'Cancelar':m?(m.type==='cc'?'CC ':'Nota ')+m.number:'Asignar';}}
function setLearning(action){trackButtons.reset();learning=learning===action?null:action;$('#learn-status').textContent=learning?(learning==='volume'?'Mové una perilla MIDI.':'Pulsá una tecla, pad o botón MIDI.'):'Asignaciones guardadas en este navegador.';renderMappings();}
function process(event,device){
 if(!sessionLoaded||restoringAudio)return;
 const e=decode(event.data);if(!e)return;
 if(e.type==='on'&&Number.isFinite(event.timeStamp)){const delay=performance.now()-event.timeStamp;if(delay>=0&&delay<10000){lastMidiDelay=delay;latencyStats.add('delivery',delay);}}const channel=device+':'+e.channel,key=channel+':'+e.number;
 // Reserve pad notes 30..45 on channel 10 before MIDI learn and instrument playback.
 if((e.type==='on'||e.type==='off')&&e.channel===9&&e.number>=30&&e.number<=45){handlePad(e.number-30,buttonDown(e));return;}
 // Relative navigation pots and master slider precede learned mappings.
 if(e.type==='cc'&&e.channel===0){
  if(e.number===7){setVolume(e.value/127*100);return;}
  if(e.number===14){const step=relativePots.step(key,e.value);if(selectedEffect>=0)adjustEffect(1,step);else if(soundBrowser.step('sound',step))queueSound();return;}
  if(e.number===13){const step=relativePots.step(key,e.value);if(selectedEffect>=0)adjustEffect(0,step);else if(soundBrowser.step('role',step))queueSound();return;}
  if(e.number===15){const step=relativePots.step(key,e.value);if(selectedEffect>=0&&step){const current=EFFECTS.findIndex(e=>e.id===currentChain()[selectedEffect].type);setEffectType(EFFECTS[Math.max(0,Math.min(EFFECTS.length-1,current+step))].id);}return;}
 }
 if(learning){const m=learnMapping(learning,e,device);if(m){const action=learning;for(const a of Object.keys(mappings))if(matches(mappings[a],e,device))delete mappings[a];mappings[action]=m;latches.set(action,buttonDown(e));save('looper:mappings',mappings);setLearning(null);if(action.startsWith('track')&&buttonDown(e))trackButtons.suppress(Number(action.slice(5)));off(key);return;}}
 for(const action of midiActions){if(action.startsWith('track')&&Number(action.slice(5))>=trackCount)continue;if(!matches(mappings[action],e,device))continue;
  if(action==='volume'){setVolume(e.value/127*100);return;}
  const down=buttonDown(e);
  if(action.startsWith('track')){trackButtons.handle(Number(action.slice(5)),down);return;}
  if(down&&!latches.get(action)){{const list=soundBrowser.role.presets,i=list.indexOf(soundBrowser.preset);setPreset(list[(i+(action==='next'?1:-1)+list.length)%list.length]);}}
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
 if(!access)return;relativePots.reset();const inputs=[...access.inputs.values()].filter(p=>p.state==='connected');
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
$('#power').onclick=async()=>{try{await ensureLooper();await connect();}catch(e){notice(errorText(e));}};
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
 if(!sessionLoaded)return;const index=keys.indexOf(e.code);if(index<0||e.repeat)return;e.preventDefault();computer.add(e.code);
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
 if(looperStarting)return looperStarting;
 if(looper)return looper;

 if(!looperStarting)looperStarting=Looper.create(context,audio.capture,mixer,renderLoop,notice,onSnapshot)
   .then(async value=>{looper=value;looper.route(trackNotes);if(pendingSnapshot){restoringAudio=true;$('#app').inert=true;try{const restored=await prepareRestore(pendingSnapshot,context.sampleRate);pendingSnapshot=null;await looper.restore(restored);for(let i=restored.tracks.length;i<trackNotes.length;i++)looper.command('add');}finally{restoringAudio=false;$('#app').inert=false;}}else{for(let i=1;i<trackNotes.length;i++)looper.command('add');looper.command('tempo',undefined,bpm);}return value;}).finally(()=>{looperStarting=null;});
 return looperStarting;
}
function currentChain(){return chains[selectedTrack<0?0:trackNotes[selectedTrack]-30];}
function addTrack(note){
 if(trackNotes.length>=7)return -1;
 const track=trackNotes.length;trackNotes.push(note);
 syncTracks(trackNotes.length);if(looper){looper.route(trackNotes);looper.command('add');}scheduleConfig();
 return track;
}
function selectTrack(track){
 if(track< -1||track>=trackNotes.length)return;
 selectedTrack=track;selectedEffect=-1;
 for(let i=0;i<trackCount;i++){
  const row=$('#track-'+i);row.classList.toggle('selected',i===track);
  row.querySelector('.loop-ring').setAttribute('aria-pressed',String(i===track));
 }
 $('#master-track').classList.toggle('selected',track<0);
 $('#master-select').setAttribute('aria-pressed',String(track<0));
 mixer?.select(track<0?-1:trackNotes[track]-31);
 renderEffects();scheduleConfig();
}
function handlePad(slot,down){
 if(!down){trackButtons.handle(slot,false);return;}
 if(trackButtons.held.has(slot))return;
 if(slot>=8){selectEffect(slot-8);trackButtons.suppress(slot);return;}
 if(slot===0){
  if(selectedTrack!==-1||selectedEffect>=0)selectTrack(-1);
  else toggleMaster();
  trackButtons.suppress(slot);return;
 }
 let track=trackNotes.indexOf(30+slot);if(track<0)track=addTrack(30+slot);
 if(track<0)return;
 if(track!==selectedTrack||selectedEffect>=0){selectTrack(track);trackButtons.suppress(slot);return;}
 trackButtons.handle(slot,true);
}
async function toggleMaster(){try{const engine=await ensureLooper();engine.command(engine.state?.paused?'resume':'pause');}catch(e){notice(errorText(e));}}
async function fixedTrackCommand(type,slot){
 const track=trackNotes.indexOf(30+slot);
 if(slot>0&&slot<8&&track>=0)return loopCommand(type,track);
}
function renderEffects(){
 $('#fx-track').textContent=selectedTrack<0?'Master':'Pista '+(trackNotes[selectedTrack]-29);
 const chain=currentChain();
 for(let i=0;i<8;i++){const b=$('#fx-slot-'+i);b.textContent=(i+1)+' · '+EFFECTS.find(e=>e.id===chain[i].type).name;b.setAttribute('aria-pressed',String(selectedEffect===i));}
 $('#fx-editor').hidden=selectedEffect<0;
 $('#fx-mode').textContent=selectedEffect<0?'Instrumentos · CC13 / CC14':'Efecto '+(selectedEffect+1)+' · CC15';
 if(selectedEffect<0)return;
 const s=chain[selectedEffect],def=EFFECTS.find(e=>e.id===s.type);$('#fx-type').value=s.type;
 def.labels.forEach((label,i)=>{$('#fx-label-'+i).textContent=label;$('#fx-param-'+i).value=s.params[i];$('#fx-value-'+i).textContent=Math.round(s.params[i])+'%';$('#fx-param-'+i).disabled=s.type==='none';});
 $('#fx-left').disabled=selectedEffect===0;$('#fx-right').disabled=selectedEffect===7;
}
function selectEffect(index){selectedEffect=index;renderEffects();}
function applyEffects(){
 clearTimeout(fxTimer);fxTimer=setTimeout(()=>{chains.forEach((c,i)=>mixer?.set(i-1,c));},100);scheduleConfig();renderEffects();
}
function setEffectType(type){
 if(selectedEffect<0)return;const def=EFFECTS.find(e=>e.id===type);if(!def)return;
 if(currentChain()[selectedEffect].type===type)return;
 currentChain()[selectedEffect]={type,params:[...def.defaults]};applyEffects();
}
function adjustEffect(index,delta){
 if(selectedEffect<0||!delta||currentChain()[selectedEffect].type==='none')return;
 const s=currentChain()[selectedEffect];s.params[index]=Math.max(0,Math.min(100,s.params[index]+delta));applyEffects();
}
function moveEffect(delta){
 const target=selectedEffect+delta;if(selectedEffect<0||target<0||target>7)return;
 const c=currentChain();[c[target],c[selectedEffect]]=[c[selectedEffect],c[target]];selectedEffect=target;applyEffects();
}
function getConfig(){return {notes:[...trackNotes],selected:selectedTrack<0?-1:trackNotes[selectedTrack]-31,chains,bpm,volume,preset:preset.id,role:soundBrowser.role.id};}
function scheduleConfig(){if(!sessionLoaded||!sessionWritable)return;session.configScheduled=true;clearTimeout(configTimer);configTimer=setTimeout(()=>{session.configScheduled=false;session.config(getConfig());},300);}
function scheduleSnapshot(){
 if(!sessionLoaded||!sessionWritable||!looper||pendingSnapshot)return;
 clearTimeout(snapshotTimer);snapshotTimer=setTimeout(()=>{if(looper.state?.active>=0||looper.state?.pending>=0)return;looper.snapshot(++snapshotSerial);},400);
}
function onSnapshot(message){
 session.snapshot(message,message.type==='snapshot-end'?getConfig():undefined);
 if(message.type==='snapshot-cancel')scheduleSnapshot();
}
async function loopCommand(type,track){
 try{
  if(pendingSnapshot)await ensureLooper();
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
 syncTracks(Math.max(state.tracks.length,trackNotes.length));

 const elapsed=active?state.elapsed:state.position/(context?.sampleRate||48000)/(state.speed||1);
 const base=state.baseSeconds||16*60/bpm;
 loopProgress.value=state.countInRemaining>0?1-state.countInRemaining/state.countInTotal:base?(elapsed%base)/base:0;
 $('#loop-time').textContent=(active?'REC '+elapsed.toFixed(1)+' s · '+(elapsed/base*4).toFixed(1)+'/4 compases':pending?'Espera al inicio · ': 'Ciclo '+((state.seconds||0)/(state.speed||1)).toFixed(1)+' s · ')+(active?'':'Base 4 compases · '+base.toFixed(1)+' s');
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
  const t=state.tracks[i],row=$('#track-'+i);
  const phase=state.pending===i&&state.countInRemaining>0?1-state.countInRemaining/state.countInTotal:
   state.active===i&&!t.hasAudio?(state.elapsed%base)/base:t.length?(t.position||0)/t.length:0;
  row.querySelector('.ring-progress').style.strokeDashoffset=String(1-Math.max(0,Math.min(1,phase)));
  const label=$('#track-'+i).querySelector('.track-length'),text=state.active===i?state.elapsed.toFixed(1)+' s':t.hasAudio?(t.pendingBars?t.bars+' → '+t.pendingBars:t.bars)+(t.bars===1&&!t.pendingBars?' compás':' compases'):'';
  if(label.textContent!==text)label.textContent=text;
 }
 if(state.revision===lastLoopRevision)return;
 lastLoopRevision=state.revision;
 session.capture=active||pending;
 if(active||pending){$('#save-status').textContent='Toma en curso · guardado al cerrar';}else if(looper&&sessionLoaded&&!pendingSnapshot){session.audioDirty=true;scheduleSnapshot();}
 if(Number.isFinite(state.bpm))bpm=state.bpm;
 $('#tempo').value=bpm;
 $('#tempo').disabled=active||pending;
 $('#metronome').setAttribute('aria-pressed',String(!!state.metronome));
 $('#loop-transport').disabled=!state.length&&!active&&!pending&&!state.metronome;
 $('#loop-transport').textContent=state.paused?'Reanudar':'Pausar';
 $('#loop-reset').disabled=false;
 $('#master-play').textContent=state.paused?'▶':'Ⅱ';
 $('#master-track').querySelector('.ring-progress').style.strokeDashoffset=String(1-(state.length?state.position/state.length:0));
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
 row.querySelector('.loop-ring').onclick=()=>selectTrack(Number(row.id.slice(6)));
 for(const b of row.querySelectorAll('[data-loop-action]'))b.onclick=()=>{
  const type=b.dataset.loopAction,track=Number(b.dataset.track);
  if(type==='clear'&&!confirm('¿Borrar el audio de la pista '+(trackNotes[track]-29)+'?'))return;
  selectTrack(track);loopCommand(type,track);
 };
 for(const b of row.querySelectorAll('[data-learn]'))b.onclick=()=>setLearning(b.dataset.learn);
}
function syncTracks(count){
 if(trackCount===count)return;
 while(trackCount<count){
  const i=trackCount++,row=document.createElement('article');
  row.className='track';row.id='track-'+i;row.setAttribute('aria-label','Pista '+(trackNotes[i]-29));
  row.innerHTML="<button class=\"loop-ring\" data-select-track=\"0\" aria-label=\"Seleccionar pista 1\" aria-pressed=\"true\"><svg viewBox=\"0 0 72 72\" aria-hidden=\"true\"><circle class=\"ring-base\" cx=\"36\" cy=\"36\" r=\"31\"></circle><circle class=\"ring-progress\" cx=\"36\" cy=\"36\" r=\"31\" pathLength=\"1\"></circle></svg><span class=\"number\">01</span></button><div class=\"track-body\"><div class=\"track-top\"><span class=\"track-state\"></span><span class=\"track-length\" aria-label=\"Duración de la pista\"></span><output class=\"track-volume\"></output></div><div class=\"track-actions\"><button class=\"record\" data-loop-action=\"record\" data-track=\"0\" aria-label=\"Grabar o cerrar pista 1\" aria-pressed=\"false\">Grabar</button><button class=\"mute icon\" data-loop-action=\"mute\" data-track=\"0\" aria-label=\"Encender o apagar pista 1\" disabled>▶</button><details><summary aria-label=\"Opciones de pista 1\">⋯</summary><div class=\"track-menu\"><div class=\"track-duration\"><button data-loop-action=\"shorten\" data-track=\"0\" aria-label=\"Acortar ciclo de pista 1\" disabled>‹</button><button data-loop-action=\"lengthen\" data-track=\"0\" aria-label=\"Alargar ciclo de pista 1\" disabled>›</button></div><button data-loop-action=\"clear\" data-track=\"0\" disabled>Borrar</button></div></details></div></div>".replace(/data-track="0"/g,'data-track="'+i+'"').replace(/data-select-track="0"/g,'data-select-track="'+i+'"').replace(/pista 1/g,'pista '+(trackNotes[i]-29)).replace('>01<','>'+String(trackNotes[i]-29).padStart(2,'0')+'<');
  $('#tracks').append(row);bindTrack(row);
 }
 while(trackCount>count){$('#track-'+(--trackCount)).remove();}
 $('#add-track').disabled=trackCount>=7;renderMappings();selectTrack(Math.min(selectedTrack,trackCount-1));
}
bindTrack($('#track-0'));
$('#add-track').onclick=()=>{if(trackNotes.length>=7)return;let note=31;while(trackNotes.includes(note))note++;selectTrack(addTrack(note));};
$('#master-select').onclick=()=>selectTrack(-1);
$('#master-play').onclick=toggleMaster;
for(let i=0;i<8;i++)$('#fx-slot-'+i).onclick=()=>selectEffect(i);
for(const def of EFFECTS){const o=document.createElement('option');o.value=def.id;o.textContent=def.name;$('#fx-type').append(o);}
$('#fx-type').onchange=e=>setEffectType(e.target.value);
for(let i=0;i<2;i++)$('#fx-param-'+i).oninput=e=>{if(selectedEffect<0)return;currentChain()[selectedEffect].params[i]=Number(e.target.value);applyEffects();};
$('#fx-left').onclick=()=>moveEffect(-1);$('#fx-right').onclick=()=>moveEffect(1);
$('#fx-close').onclick=()=>selectTrack(selectedTrack);
let metroBusy=false;
$('#metronome').onclick=async()=>{
 if(metroBusy)return;metroBusy=true;
 try{const engine=await ensureLooper();if(!document.hidden)engine.command('metronome',undefined,!engine.state?.metronome);}
 catch(error){notice('Metrónomo: '+errorText(error));}finally{metroBusy=false;}
};
$('#tempo').onchange=event=>{
 const value=Number(event.target.value);
 if(!Number.isFinite(value)||value<40||value>240){event.target.value=bpm;return;}
 if(looper)looper.command('tempo',undefined,value);else{bpm=value;if(pendingSnapshot)pendingSnapshot.bpm=value;scheduleConfig();$('#loop-time').textContent='Base 4 compases · '+(16*60/bpm).toFixed(1)+' s';}
};
$('#loop-transport').onclick=()=>loopCommand(looper?.state?.paused?'resume':'pause');
$('#loop-reset').onclick=()=>{if(confirm('¿Borrar todas las pistas y empezar una sesión nueva?')){trackButtons.reset();learning=null;pendingSnapshot=null;sessionWritable=true;trackNotes.splice(0,trackNotes.length,31);chains=Array.from({length:8},emptyChain);selectedTrack=-1;syncTracks(1);chains.forEach((c,i)=>mixer?.set(i-1,c));loopCommand('reset');selectTrack(-1);if(!looper){session.snapshot({type:'snapshot-start',id:++snapshotSerial,snapshot:{version:1,rate:48000,bpm,referenceBpm:bpm,transport:0,tracks:[{hasAudio:false,bars:0,audioLength:0,muted:false}]}});session.snapshot({type:'snapshot-end',id:snapshotSerial},getConfig());}}};
window.addEventListener('beforeunload',event=>{if(session.dirty||looper?.state?.active>=0){event.preventDefault();event.returnValue='';}});
for(const role of soundBrowser.roles){const option=document.createElement('option');option.value=role.id;option.textContent=role.name;$('#sound-role').append(option);}
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
  soundBrowser=new SoundBrowser(PRESETS,{presetId:wanted.id,roleId:soundBrowser.role.id,remembered});
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

renderEffects();
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
$('#test-click').onpointerdown=async e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();if(await activate())audio.testClick();};
$('#test-click').onclick=async e=>{if(e.detail===0&&await activate())audio.testClick();};
$('#reset-performance').onclick=()=>{latencyStats.reset();showPerformance();};

async function restoreLocal(){
 try{
  const saved=await session.load();
  if(saved){
   const config=cleanConfig(saved.config);
   if(saved.snapshot){validateSnapshot(saved.snapshot);if(saved.snapshot.tracks.length!==config.notes.length)throw Error('Sesión local incompleta.');pendingSnapshot={...saved.snapshot,bpm:config.bpm};}
   trackNotes.splice(0,trackNotes.length,...config.notes);chains=config.chains;bpm=config.bpm;$('#tempo').value=bpm;$('#loop-time').textContent='Base 4 compases · '+(960/bpm).toFixed(1)+' s';setVolume(config.volume);syncTracks(trackNotes.length);
   const p=PRESETS.find(p=>p.id===config.preset);if(p)setPreset(p);
   selectTrack(config.selected<0?-1:Math.max(0,trackNotes.indexOf(config.selected+31)));
   if(pendingSnapshot){
    const s=pendingSnapshot,bar=s.rate*240/s.referenceBpm,length=Math.max(0,...s.tracks.map(t=>t.bars*bar));
    renderLoop({revision:-2,length,position:0,seconds:length/s.rate,baseSeconds:960/s.bpm,speed:s.bpm/s.referenceBpm,bpm:s.bpm,elapsed:0,active:-1,pending:-1,paused:true,tracks:s.tracks.map(t=>({...t,length:t.bars*bar,canOverdub:t.bars*bar<=s.rate*60,position:0}))});
   }
   $('#save-status').textContent='Sesión recuperada · activá audio';
  }else $('#save-status').textContent='Guardado local listo';
 }catch(e){sessionWritable=false;notice('No se pudo recuperar la sesión: '+errorText(e));$('#save-status').textContent='Guardado local no disponible';}
 finally{sessionLoaded=true;$('#app').inert=false;}
}
restoreLocal();
