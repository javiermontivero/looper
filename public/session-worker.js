let database,meta=null,job=null;
function db(){
 if(!database)database=new Promise((resolve,reject)=>{
  const request=indexedDB.open('looper-session-v1',1);
  request.onupgradeneeded=()=>{request.result.createObjectStore('meta');request.result.createObjectStore('audio');};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(Error('Cerrá las otras pestañas del looper para guardar.'));
 });
 return database;
}
async function read(){
 const database=await db();
 return new Promise((resolve,reject)=>{
  const tx=database.transaction(['meta','audio'],'readonly'),m=tx.objectStore('meta').get('current'),a=tx.objectStore('audio').getAll();
  tx.oncomplete=()=>{meta=m.result||null;resolve(meta?{config:meta.config,snapshot:meta.snapshot?{...meta.snapshot,tracks:meta.snapshot.tracks.map((t,i)=>({...t,data:a.result.find(x=>x.index===i)?.data||new Float32Array()}))}:null}:null);};
  tx.onabort=()=>reject(tx.error||Error('Lectura local cancelada.'));
 });
}
async function commit(next,audio,info={}){
 const database=await db();
 await new Promise((resolve,reject)=>{
  const tx=database.transaction(audio?['meta','audio']:['meta'],'readwrite');
  tx.objectStore('meta').put(next,'current');
  if(audio){const store=tx.objectStore('audio');store.clear();audio.forEach((data,index)=>store.put({index,data},index));}
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Guardado cancelado.'));
 });
 meta=next;postMessage({event:'saved',...info});
}
let queue=Promise.resolve();
self.onmessage=event=>{
 const m=event.data;
 queue=queue.then(async()=>{
  try{
   if(m.type==='load'){const value=await read();postMessage({request:m.request,value},value?.snapshot?.tracks.map(t=>t.data.buffer)||[]);return;}
   if(m.type==='config'){if(!meta)await read();const next={...meta,config:m.config};if(next.snapshot){next.snapshot={...next.snapshot,tracks:[...next.snapshot.tracks]};while(next.snapshot.tracks.length<m.config.notes.length)next.snapshot.tracks.push({hasAudio:false,bars:0,audioLength:0,muted:false});}await commit(next,undefined,{kind:'config'});return;}
   if(m.type==='snapshot-start'){job={id:m.id,meta:m.snapshot,audio:m.snapshot.tracks.map(t=>new Float32Array(t.audioLength))};return;}
   if(m.type==='snapshot-cancel'){if(job?.id===m.id)job=null;return;}
   if(job?.id!==m.id)return;
   if(m.type==='snapshot-chunk'){job.audio[m.track].set(m.data,m.offset);return;}
   if(m.type==='snapshot-end'){const finished=job;job=null;const config=m.config||meta?.config;while(finished.meta.tracks.length<config.notes.length){finished.meta.tracks.push({hasAudio:false,bars:0,audioLength:0,muted:false});finished.audio.push(new Float32Array());}await commit({config,snapshot:finished.meta},finished.audio,{kind:'audio',id:m.id});}
  }catch(error){postMessage({request:m.request,event:'error',error:error?.message||String(error)});}
 });
};
