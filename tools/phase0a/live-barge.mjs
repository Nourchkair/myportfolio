import fs from 'node:fs';
import { GoogleGenAI, Modality } from '@google/genai';
import { audioPath, loadEnv, requireEnv } from './env.mjs';
const env=requireEnv(loadEnv(), ['GEMINI_API_KEY','GEMINI_LIVE_MODEL']);
const ai=new GoogleGenAI({apiKey:env.GEMINI_API_KEY,httpOptions:{apiVersion:'v1beta'}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const audio1=fs.readFileSync(audioPath('ainour-en.pcm')), audio2=fs.readFileSync(audioPath('ainour-interrupt.pcm'));
const events=[]; let session, transcript='', interrupted=false, firstAudio=false, secondAudio=false;
const facts='You are AI Nour, a concise, warm AI representation of Nour Chkair. Keep spoken answers to one sentence. Respond in the language of the visitor.';
try{
 session=await ai.live.connect({model:env.GEMINI_LIVE_MODEL,config:{responseModalities:[Modality.AUDIO],systemInstruction:facts,inputAudioTranscription:{},outputAudioTranscription:{}},callbacks:{
  onmessage:(m)=>{
   if(m.setupComplete)events.push({type:'setup'});
   if(m.serverContent){
    transcript+=m.serverContent.outputTranscription?.text||'';
    for(const p of m.serverContent.modelTurn?.parts||[]) if(p.inlineData?.data){if(!firstAudio){firstAudio=true;events.push({type:'firstAudio',ms:Date.now()-t0});}else if(!secondAudio){secondAudio=true;events.push({type:'secondAudio',ms:Date.now()-t0});}}
    if(m.serverContent.interrupted){interrupted=true;events.push({type:'interrupted',ms:Date.now()-t0});}
    if(m.serverContent.turnComplete)events.push({type:'turnComplete',ms:Date.now()-t0});
   }
   if(m.usageMetadata)events.push({type:'usage',usage:{prompt:m.usageMetadata.promptTokenCount,response:m.usageMetadata.responseTokenCount,promptDetails:m.usageMetadata.promptTokensDetails,responseDetails:m.usageMetadata.responseTokensDetails}});
  },
  onerror:e=>events.push({type:'error',message:e.message||String(e)}),
  onclose:e=>events.push({type:'close',code:e.code,reason:e.reason})
 }});
 const t0=Date.now();
 await sleep(700);
 const send=async(pcm)=>{for(let i=0;i<pcm.length;i+=3200){session.sendRealtimeInput({audio:{data:pcm.subarray(i,i+3200).toString('base64'),mimeType:'audio/pcm;rate=16000'}});await sleep(70);}};
 await send(audio1);
 session.sendRealtimeInput({audioStreamEnd:true});
 // Wait for response audio, then interrupt with second clip.
 const deadline=Date.now()+12000; while(!firstAudio&&Date.now()<deadline) await sleep(100);
 if(firstAudio){await sleep(500);await send(audio2);session.sendRealtimeInput({audioStreamEnd:true});}
 await sleep(16000);
}catch(e){events.push({type:'exception',message:String(e.message||e)});}
try{session?.close()}catch{}
console.log(JSON.stringify({interrupted,transcript,events},null,2));
