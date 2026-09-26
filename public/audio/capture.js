/* First-party PCM capture. Native AudioContext sample rate is declared to STT. */
class Capture extends AudioWorkletProcessor {
 constructor() { super(); this.samples = []; this.active = true; this.port.onmessage = e => { if(e.data === 'flush') this.flush(); }; }
 flush() { if(!this.samples.length) return; const pcm = new Int16Array(this.samples); this.port.postMessage(pcm.buffer,[pcm.buffer]); this.samples=[]; }
 process(inputs) {
  const input=inputs[0]?.[0]; if(!input) return true;
  for(const value of input) this.samples.push(Math.round(Math.max(-1,Math.min(1,value)) * (value < 0 ? 32768 : 32767)));
  if(this.samples.length >= sampleRate * .08) this.flush();
  return true;
 }
}
registerProcessor('yougotit-capture', Capture);
