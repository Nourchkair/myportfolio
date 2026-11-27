import fs from 'node:fs';
import { GoogleGenAI, Modality } from '@google/genai';
import { audioPath, loadEnv, requireEnv } from './env.mjs';
const env=requireEnv(loadEnv(), ['GEMINI_API_KEY','GEMINI_LIVE_MODEL']);
const ai=new GoogleGenAI({apiKey:env.GEMINI_API_KEY,httpOptions:{apiVersion:'v1beta'}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const facts='You are AI Nour, a concise, warm, commercially minded AI representation of Nour Chkair. Nour is based in Ottawa and works across commercial strategy, sales and technology. His public projects are Customer Acquisition, Dispatch, AI Customer Communications, B.R.A.I.N. and Safiy. Safiy is a contextual AI assistant that captures conversations and workplace knowledge. Speak in the first person about yourself and in the third person about Nour\'s actual experience. Do not invent facts. Keep spoken answers to one or two sentences. Respond in the language of the visitor.';
const tool={functionDeclarations:[{name:'openProject',description:'Open a portfolio project by id.',parameters:{type:'OBJECT',properties:{projectId:{type:'STRING'}},required:['projectId']}}]};
const pcmEn=fs.readFileSync(audioPath('ainour-en.pcm')), pcmFr=fs.readFileSync(audioPath('ainour-fr.pcm')), pcmTool=fs.readFileSync(audioPath('ainour-tool.pcm'));
async function session({name,audio,tools=false,text=null}){
 const started=Date.now(),events=[];let s,transcript='',audioBytes=0,firstAudio=null,usage=null,toolCalls=[],turnMs=null;
 try{
  s=await ai.live.connect({model:env.GEMINI_LIVE_MODEL,config:{responseModalities:[Modality.AUDIO],systemInstruction:facts,inputAudioTranscription:{},outputAudioTranscription:{},...(tools?{tools:[tool]}:{})},callbacks:{
   onopen:()=>events.push({type:'open',ms:Date.now()-started}),
   onmessage:(m)=>{
    if(m.setupComplete)events.push({type:'setup',ms:Date.now()-started});
    if(m.serverContent){transcript+=m.serverContent.outputTranscription?.text||'';for(const p of m.serverContent.modelTurn?.parts||[])if(p.inlineData?.data){audioBytes+=Buffer.from(p.inlineData.data,'base64').length;if(firstAudio==null)firstAudio=Date.now()-started;}if(m.serverContent.turnComplete){turnMs=Date.now()-started;events.push({type:'turnComplete',ms:turnMs});}}
    if(m.toolCall?.functionCalls?.length){toolCalls.push(...m.toolCall.functionCalls.map(f=>({name:f.name,args:f.args})));events.push({type:'toolCall',names:m.toolCall.functionCalls.map(f=>f.name)});s.sendToolResponse({functionResponses:m.toolCall.functionCalls.map(f=>({id:f.id,name:f.name,response:{ok:true,message:'Project opened in test harness'}}))});}
    if(m.usageMetadata)usage={prompt:m.usageMetadata.promptTokenCount,response:m.usageMetadata.responseTokenCount,total:m.usageMetadata.totalTokenCount,promptDetails:m.usageMetadata.promptTokensDetails,responseDetails:m.usageMetadata.responseTokensDetails};
   },
   onerror:e=>events.push({type:'error',message:e.message||String(e)}),
   onclose:e=>events.push({type:'close',code:e.code,reason:e.reason,wasClean:e.wasClean,ms:Date.now()-started})
  }});
  events.push({type:'connected',ms:Date.now()-started});
  await sleep(800);
  if(text)s.sendClientContent({turns:text,turnComplete:true});
  else{for(let i=0;i<audio.length;i+=3200){s.sendRealtimeInput({audio:{data:audio.subarray(i,i+3200).toString('base64'),mimeType:'audio/pcm;rate=16000'}});await sleep(80);}s.sendRealtimeInput({audioStreamEnd:true});}
  await sleep(tools?25000:18000);
 }catch(e){events.push({type:'exception',message:String(e.message||e)});}
 try{s?.close()}catch{}
 return {name,transcript,audioBytes,firstAudioMs:firstAudio,turnCompleteMs:turnMs,usage,toolCalls,events:events.filter(e=>['open','setup','toolCall','turnComplete','close','error','exception'].includes(e.type))};
}
const out=[];
out.push(await session({name:'english',audio:pcmEn}));
out.push(await session({name:'french',audio:pcmFr}));
out.push(await session({name:'tool-call',audio:pcmTool,tools:true}));
// ephemeral token (v1alpha only)
let eph={created:false};
try{const a2=new GoogleGenAI({apiKey:env.GEMINI_API_KEY,httpOptions:{apiVersion:'v1alpha'}});const t=await a2.authTokens.create({config:{uses:1,expireTime:new Date(Date.now()+600000).toISOString(),newSessionExpireTime:new Date(Date.now()+120000).toISOString(),liveConnectConstraints:{model:env.GEMINI_LIVE_MODEL}}});eph={created:!!t.name,tokenLength:t.name?.length||0};}catch(e){eph={created:false,error:String(e.message||e)};}
console.log(JSON.stringify({sessions:out,ephemeralToken:eph},null,2));
