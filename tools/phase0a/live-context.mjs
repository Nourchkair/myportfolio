import fs from 'node:fs';
import { GoogleGenAI, Modality } from '@google/genai';
import { audioPath, loadEnv, requireEnv } from './env.mjs';
const env=requireEnv(loadEnv(), ['GEMINI_API_KEY','GEMINI_LIVE_MODEL']);
const ai=new GoogleGenAI({apiKey:env.GEMINI_API_KEY,httpOptions:{apiVersion:'v1beta'}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const audio=fs.readFileSync(audioPath('ainour-context.pcm'));
const facts='You are AI Nour, concise. Nour\'s public projects are Customer Acquisition, Dispatch, AI Customer Communications, B.R.A.I.N. and Safiy. Safiy is a contextual AI assistant. Keep answers to one sentence.';
let transcript='',usage=null,events=[];let session;
try{
 session=await ai.live.connect({model:env.GEMINI_LIVE_MODEL,config:{responseModalities:[Modality.AUDIO],systemInstruction:facts,inputAudioTranscription:{},outputAudioTranscription:{}},callbacks:{onmessage:m=>{if(m.setupComplete)events.push('setup');if(m.serverContent){transcript+=m.serverContent.outputTranscription?.text||'';if(m.serverContent.turnComplete)events.push('turnComplete');}if(m.usageMetadata)usage={prompt:m.usageMetadata.promptTokenCount,response:m.usageMetadata.responseTokenCount,promptDetails:m.usageMetadata.promptTokensDetails,responseDetails:m.usageMetadata.responseTokensDetails};},onerror:e=>events.push('error')}});
 await sleep(800);
 session.sendClientContent({turns:'The project I want to discuss is Safiy.',turnComplete:true});
 await sleep(9000);
 events.push('textTurnDone');
 for(let i=0;i<audio.length;i+=3200){session.sendRealtimeInput({audio:{data:audio.subarray(i,i+3200).toString('base64'),mimeType:'audio/pcm;rate=16000'}});await sleep(70);}
 session.sendRealtimeInput({audioStreamEnd:true});
 await sleep(12000);
}catch(e){events.push('exception:'+String(e.message||e));}
try{session?.close()}catch{}
console.log(JSON.stringify({transcript,usage,events},null,2));
