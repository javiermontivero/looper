// One pinned bundle, loaded only when audio is activated (also works on Pages).
export const TONE_URL='https://cdn.jsdelivr.net/npm/tone@15.1.22/build/Tone.js';
let loading;
export function loadTone(){
 if(globalThis.Tone?.version==='15.1.22')return Promise.resolve(globalThis.Tone);
 if(!loading)loading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  const finish=error=>{
   clearTimeout(timeout);script.onload=script.onerror=null;
   if(error){script.remove();reject(error);}else resolve(globalThis.Tone);
  };
  const timeout=setTimeout(()=>finish(Error('No se pudo descargar Tone.js. Revisá Internet y volvé a activar el audio.')),30000);
  script.src=TONE_URL;script.async=true;
  script.onload=()=>finish(globalThis.Tone?.version==='15.1.22'?null:Error('Versión de Tone.js no compatible.'));
  script.onerror=()=>finish(Error('No se pudo cargar Tone.js. Revisá Internet y volvé a activar el audio.'));
  document.head.append(script);
 }).catch(error=>{loading=null;throw error;});
 return loading;
}
export function createAudioRuntime(Tone,rawContext){
 const context=new Tone.Context({context:rawContext,lookAhead:0,clockSource:'timeout',updateInterval:.05});
 // Prevent Tone from creating another default AudioContext. Nodes still receive
 // their context explicitly; neither Transport nor Tone's Destination is used.
 Tone.setContext(context);
 return {Tone,context,rawContext};
}
