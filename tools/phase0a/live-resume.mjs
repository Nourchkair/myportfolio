import fs from 'node:fs';
import { GoogleGenAI, Modality } from '@google/genai';
import { audioPath, loadEnv, requireEnv } from './env.mjs';
const env=requireEnv(loadEnv(), ['GEMINI_API_KEY','GEMINI_LIVE_MODEL']);
const ai=new GoogleGenAI({apiKey:env.GEMINI_API_KEY,httpOptions:{apiVersion:'v1beta'}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const facts='You are AI Nour, concise. Keep answers to one sentence.';
let handle=null,transcript1='',transcript2='',events=[];
async function connect(handle){
 return await ai.live.connect({model:env.GEMINI_LIVE_MODEL,config:{responseModalities:[Modality.AUDIO],systemInstruction:facts,inputAudioTranscription:{},outputAudioTranscription:{},sessionResumption:handle?{handle}: {}},callbacks:{onmessage:m=>{if(m.setupComplete)events.push('setup');if(m.serverContent){const t=m.serverContent.outputTranscription?.text||'';if(handle)transcript2+=t;else transcript1+=t;if(m.serverContent.turnComplete)events.push(handle?'resumedTurnComplete':'firstTurnComplete');}if(m.sessionResumptionUpdate){if(m.sessionResumptionUpdate.newHandle)handle=m.sessionResumptionUpdate.newHandle;events.push({resumable:!!m.sessionResumptionUpdate.resumable,handlePresent:!!m.sessionResumptionUpdate.newHandle});}},onerror:e=>events.push('error')}});
}
let s;
try{
 s=await connect(); await sleep(800);
 s.sendClientContent({turns:'My favourite project is Safiy.',turnComplete:true}); await sleep(8000);
 s.close(); s=null;
 await sleep(500);
 s=await connect(handle); await sleep(800);
 s.sendClientContent({turns:'Which project did I say was my favourite?',turnComplete:true}); await sleep(9000);
}catch(e){events.push('exception:'+String(e.message||e));}
try{s?.close()}catch{}
console.log(JSON.stringify({handleReceived:!!handle,transcript1,transcript2,events},null,2));
