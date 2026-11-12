type Job={id:string;lease:string;device_id:string;user_id:string;event_id:string;order_id:string|null;title:string;body:string;subscription:{endpoint:string;keys:{p256dh:string;auth:string}}};
type Details={endpoint:string;headers:Record<string,string>;body:Uint8Array};
type Options={url:string;serviceKey:string;generateKeys:()=>{publicKey:string;privateKey:string};details:(subscription:Job['subscription'],payload:string,keys:{publicKey:string;privateKey:string})=>Details;fetcher?:typeof fetch};
export function validPushEndpoint(value:string){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&(!u.port||u.port==='443')&&u.pathname!=='/'&&(['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(u.hostname)||/^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname));}catch{return false;}
}
export function createKitchenPushHandler(options:Options){
 const fetcher=options.fetcher??fetch,base=options.url.replace(/\/+$/,'');
 const reply=(status:number,result:Record<string,unknown>)=>new Response(JSON.stringify(result),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 async function rpc(name:string,body:unknown){
  const response=await fetcher(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:options.serviceKey,Authorization:`Bearer ${options.serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('RPC failed');return response.status===204?null:response.json();
 }
 return async(req:Request)=>{
  if(req.method!=='POST')return reply(405,{error:'POST required'});
  const token=req.headers.get('x-pos-push-worker');if(!token||!/^[a-f0-9]{64}$/.test(token))return reply(401,{error:'Unauthorized'});
  if(!base||!options.serviceKey)return reply(503,{error:'Unavailable'});
  let config:{public_key:string|null;private_key:string|null};
  try{config=await rpc('kitchen_push_worker_config',{p_token:token});}catch{return reply(401,{error:'Unauthorized'});}
  try{
   if(!config.public_key||!config.private_key){const keys=options.generateKeys();await rpc('kitchen_push_set_keys',{p_public:keys.publicKey,p_private:keys.privateKey});config=await rpc('kitchen_push_worker_config',{p_token:token});}
   if(!config.public_key||!config.private_key)throw Error('Missing configuration');
   const keys={publicKey:config.public_key,privateKey:config.private_key},jobs=await rpc('kitchen_push_claim',{}) as Job[];
   if(!Array.isArray(jobs)||jobs.length>8)throw Error('Invalid jobs');
   const results=[];
   for(let at=0;at<jobs.length;at+=4){
    results.push(...await Promise.all(jobs.slice(at,at+4).map(async job=>{
     const result={id:job.id,lease:job.lease,status:'retry',code:'network'};
     if(!validPushEndpoint(job.subscription.endpoint))return {...result,status:'failed',code:'invalid_endpoint'};
     try{
      const payload=JSON.stringify({version:1,user_id:job.user_id,device_id:job.device_id,order_id:job.order_id,title:job.title.slice(0,140),body:job.body.slice(0,240),tag:`kitchen:${job.order_id??job.event_id}`,url:'/?open=kitchen'});
      const details=options.details(job.subscription,payload,keys);
      if(details.endpoint!==job.subscription.endpoint||!validPushEndpoint(details.endpoint))return {...result,status:'failed',code:'invalid_endpoint'};
      const response=await fetcher(details.endpoint,{method:'POST',headers:details.headers,body:new Uint8Array(details.body),redirect:'manual',signal:AbortSignal.timeout(8000)});
      await response.body?.cancel();
      return {...result,status:response.ok?'sent':[404,410].includes(response.status)?'gone':response.status===429||response.status>=500||response.status===403?'retry':'failed',code:String(response.status)};
     }catch{return result;}
    })));
   }
   if(results.length)await rpc('kitchen_push_ack',{p_results:results});
   return reply(200,{processed:results.length});
  }catch{return reply(503,{error:'Push processing unavailable'});}
 };
}
