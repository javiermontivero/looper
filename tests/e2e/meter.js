class OutputMeter extends AudioWorkletProcessor{
 constructor(){super();this.buffer=new Float32Array(2048);this.left=new Float32Array(2048);this.right=new Float32Array(2048);this.offset=0;}
 process(inputs){
  const channels=inputs[0];if(!channels?.length)return true;
  const left=channels[0],right=channels[1]||left;
  for(let i=0;i<left.length;i++){
   this.left[this.offset]=left[i];this.right[this.offset]=right[i];this.buffer[this.offset++]=(left[i]+right[i])*.5;
   if(this.offset===this.buffer.length){
    this.port.postMessage({samples:this.buffer,left:this.left,right:this.right,time:currentTime},[this.buffer.buffer,this.left.buffer,this.right.buffer]);
    this.buffer=new Float32Array(2048);this.left=new Float32Array(2048);this.right=new Float32Array(2048);this.offset=0;
   }
  }
  return true;
 }
}
registerProcessor('output-meter',OutputMeter);
