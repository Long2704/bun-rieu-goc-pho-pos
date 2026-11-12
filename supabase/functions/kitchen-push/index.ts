import webpush from 'npm:web-push@3.6.7';
import {createKitchenPushHandler} from './handler.ts';
const url=Deno.env.get('SUPABASE_URL')??'';
Deno.serve(createKitchenPushHandler({
 url,serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',
 generateKeys:()=>webpush.generateVAPIDKeys(),
 details:(subscription,payload,keys)=>{
  const request=webpush.generateRequestDetails(subscription,payload,{TTL:300,urgency:'high',vapidDetails:{subject:'https://bunrieugocpho.vercel.app',publicKey:keys.publicKey,privateKey:keys.privateKey},contentEncoding:'aes128gcm'});
  return {endpoint:request.endpoint,headers:request.headers,body:new Uint8Array(request.body)};
 }
}));
