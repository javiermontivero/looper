import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('./public/',import.meta.url);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.sh':'text/plain; charset=utf-8'};
const allowed=new Set(['index.html','style.css','app.js','synth.js','midi.js','icon.svg','setup-https.sh']);
export async function handler(req,res){
  const url=new URL(req.url,'http://localhost');
  let path=url.pathname.replace(/^\/looper(?=\/|$)/,'').replace(/^\//,'');
  if(!path){res.writeHead(302,{Location:url.pathname.endsWith('/')?'./index.html':url.pathname+'/'});res.end();return;}
  if(path==='health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'ok',app:'looper',version:'0.1.0'}));return;}
  if(!allowed.has(path)){res.writeHead(404);res.end('Not found');return;}
  try{
    const body=await readFile(new URL(path,root));
    res.writeHead(200,{'Content-Type':types[path.slice(path.lastIndexOf('.'))]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",'Permissions-Policy':'midi=(self)'});
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(500);res.end('Unable to serve file');}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  createServer(handler).listen(8080,'0.0.0.0',()=>console.log('Looper 0.1.0 listening on :8080'));
}
