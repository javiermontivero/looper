import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {handler} from '../../server.mjs';
createServer(async(req,res)=>{
 if(req.url==='/__e2e__/meter.js'){
  res.writeHead(200,{'Content-Type':'text/javascript'});
  res.end(await readFile(new URL('./meter.js',import.meta.url)));return;
 }
 if(req.url==='/looper/session-worker.js'&&(req.headers.cookie||'').includes('e2e-storage-failure=1')){
  // Fault injection at the native storage boundary. The actual transaction is
  // aborted by the browser, so rollback and worker/app error handling are real.
  const fault=`const nativePut=IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put=function(...args){
 if(this.name==='audio'){this.transaction.abort();throw new DOMException('Quota exceeded','QuotaExceededError');}
 return nativePut.apply(this,args);
};\n`;
  res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});
  res.end(fault+await readFile(new URL('../../public/session-worker.js',import.meta.url)));return;
 }
 return handler(req,res);
}).listen(8080,'127.0.0.1');
