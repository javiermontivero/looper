// A version-1 user document, not an application object or mocked database.
// The browser writes it to real IndexedDB before the application is opened.
export async function savedSession(page,{rate=48000,bpm=240,transport=0,tracks=[{bars:2,seconds:1.8}],invalid=false}={}){
 await page.goto('/health');
 await page.evaluate(async({rate,bpm,transport,tracks,invalid})=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('looper-session-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('meta');r.result.createObjectStore('audio');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const audio=tracks.map(t=>{
   const data=new Float32Array(Math.round((t.seconds??1)*rate));
   for(let i=0;i<data.length;i++){
    const time=i/rate,frequency=t.frequency??220;
    if(t.tailOnly&&time<1)continue;
    const phase=time%(240/bpm);
    if(t.pulse&&(phase<.01||phase>.05))continue;
    data[i]=.08*Math.sin(2*Math.PI*frequency*(t.pulse?phase:time));
   }
   return data;
  });
  const config={notes:tracks.map((t,i)=>t.note??31+i),selected:0,chains:[],bpm,volume:65,preset:'organ'};
  const snapshot={version:invalid===true||invalid==='version'?99:1,rate,bpm,referenceBpm:bpm,transport,tracks:tracks.map((t,i)=>({bars:t.bars??1,muted:!!t.muted,hasAudio:true,audioLength:audio[i].length}))};
  if(invalid==='rate')snapshot.rate=0;
  if(invalid==='bars')snapshot.tracks[0].bars=3;
  if(invalid==='missing-audio')audio[0]=new Float32Array();
  await new Promise((resolve,reject)=>{const tx=db.transaction(['meta','audio'],'readwrite');tx.objectStore('meta').put({config,snapshot},'current');audio.forEach((data,index)=>tx.objectStore('audio').put({index,data},index));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
 },{rate,bpm,transport,tracks,invalid});
}
