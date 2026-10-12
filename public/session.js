import {cleanChain,emptyChain} from './effects.js';
export function cleanConfig(value={}){
 const notes=Array.isArray(value.notes)?[...new Set(value.notes.filter(n=>Number.isInteger(n)&&n>=31&&n<=37))]:[31];
 return {notes:notes.length?notes:[31],selected:Number.isInteger(value.selected)&&value.selected>=-1&&value.selected<7?value.selected:-1,
  chains:Array.from({length:8},(_,i)=>cleanChain(value.chains?.[i]||emptyChain())),
  bpm:Number.isFinite(value.bpm)?Math.max(40,Math.min(240,value.bpm)):120,
  volume:Number.isFinite(value.volume)?Math.max(0,Math.min(100,value.volume)):65,
  preset:typeof value.preset==='string'?value.preset:'piano',role:typeof value.role==='string'?value.role:null};
}
export function validateSnapshot(s){
 if(!s||s.version!==1||!Number.isFinite(s.rate)||s.rate<800||s.rate>192000||!Array.isArray(s.tracks)||s.tracks.length<1||s.tracks.length>7)throw Error('Sesión local no compatible.');
 if(!Number.isFinite(s.bpm)||s.bpm<40||s.bpm>240||!Number.isFinite(s.referenceBpm)||s.referenceBpm<40||s.referenceBpm>240)throw Error('Tempo guardado inválido.');
 for(const t of s.tracks){
  if(!(t.data instanceof Float32Array)||t.data.length>s.rate*60||!Number.isInteger(t.bars)||t.bars<0||t.bars>128||(t.bars&&(t.bars&(t.bars-1))))throw Error('Audio guardado inválido.');
  if(t.hasAudio&&(!t.bars||!t.data.length))throw Error('Pista guardada incompleta.');
 }
 return s;
}
export async function prepareRestore(snapshot,rate){
 validateSnapshot(snapshot);const tracks=[];
 for(const t of snapshot.tracks){
  const length=Math.min(Math.ceil(rate*60),Math.round(t.data.length*rate/snapshot.rate));
  const data=t.hasAudio?new Float32Array(Math.ceil(rate*60)):null;
  if(data)for(let i=0;i<length;i++){const p=i*snapshot.rate/rate,n=Math.floor(p),a=Number.isFinite(t.data[n])?t.data[n]:0,b=Number.isFinite(t.data[n+1])?t.data[n+1]:a;data[i]=a+(b-a)*(p-n);}
  tracks.push({...t,data,audioLength:length});
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 return {...snapshot,rate,transport:Number.isFinite(snapshot.transport)?snapshot.transport*rate/snapshot.rate:0,tracks};
}
export class SessionStore{
 constructor(onStatus=()=>{}){
  this.onStatus=onStatus;this.pending=new Map();this.serial=0;this.pendingConfigs=0;this.audioDirty=false;this.capture=false;
  if(typeof Worker==='undefined'){this.error=Error('Este navegador no ofrece guardado local.');return;}
  this.worker=new Worker(new URL('./session-worker.js',import.meta.url),{type:'module'});
  this.worker.onmessage=e=>{const m=e.data,p=this.pending.get(m.request);if(p){this.pending.delete(m.request);m.error?p.reject(Error(m.error)):p.resolve(m.value);}
   if(m.event==='saved'){if(m.kind==='config')this.pendingConfigs=Math.max(0,this.pendingConfigs-1);if(m.kind==='audio'&&m.id===this.lastSnapshotId)this.audioDirty=false;if(!this.dirty)this.onStatus('Guardado local');}
   if(m.event==='error'){this.audioDirty=true;this.onStatus('No se pudo guardar: '+m.error);}
  };
  this.worker.onerror=()=>{this.error=Error('No se pudo iniciar el guardado local.');for(const p of this.pending.values())p.reject(this.error);this.pending.clear();this.onStatus(this.error.message);};
 }
 get dirty(){return !!(this.capture||this.audioDirty||this.configScheduled||this.pendingConfigs>0);}
 request(type,payload={}){
  if(this.error)return Promise.reject(this.error);
  const request=++this.serial;return new Promise((resolve,reject)=>{this.pending.set(request,{resolve,reject});this.worker.postMessage({type,request,...payload});});
 }
 load(){return this.request('load');}
 config(config){if(this.error)return;this.pendingConfigs++;this.onStatus('Guardando…');this.worker.postMessage({type:'config',config:cleanConfig(config)});}
 snapshot(message,config){
  if(this.error)return;
  this.audioDirty=true;if(message.type==='snapshot-start')this.lastSnapshotId=message.id;this.onStatus('Guardando audio…');
  this.worker.postMessage({...message,config:config?cleanConfig(config):undefined},message.data?[message.data.buffer]:[]);
 }
}
