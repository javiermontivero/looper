// Bounded telemetry. No DOM work, logging or sorting in MIDI handlers.
export class LatencyStats{
 constructor(size=128){this.size=size;this.reset();}
 reset(){this.delivery=new Float64Array(this.size);this.note=new Float64Array(this.size);this.counts={delivery:0,note:0};this.longTasks=0;this.longestTask=0;}
 add(kind,value){if(!Number.isFinite(value)||value<0||value>10000)return;const n=this.counts[kind]++;this[kind][n%this.size]=value;}
 summary(kind){const n=Math.min(this.counts[kind],this.size);if(!n)return null;const values=Array.from(this[kind].subarray(0,n)).sort((a,b)=>a-b);return {count:n,median:values[Math.floor((n-1)*.5)],p95:values[Math.ceil(n*.95)-1],max:values[n-1]};}
 task(ms){if(Number.isFinite(ms)){this.longTasks++;this.longestTask=Math.max(this.longestTask,ms);}}
}
export function safetyCurve(size=4097){
 const curve=new Float32Array(size);
 for(let i=0;i<size;i++){const x=i*2/(size-1)-1,a=Math.abs(x);curve[i]=a<=.8?x:Math.sign(x)*(.8+.2*Math.tanh((a-.8)/.2));}
 return curve;
}
