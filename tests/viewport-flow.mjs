import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5173');
 assert.match(await page.locator('meta[name=viewport]').getAttribute('content'),/maximum-scale=1/);
 const checks=await page.evaluate(()=>{
  const prevented=event=>!document.dispatchEvent(event);
  const touch=count=>new TouchEvent('touchmove',{cancelable:true,touches:Array.from({length:count},(_,identifier)=>new Touch({identifier,target:document.body,clientX:80+identifier*60,clientY:300}))});
  return {gesture:prevented(new Event('gesturestart',{cancelable:true})),change:prevented(new Event('gesturechange',{cancelable:true})),pinch:prevented(touch(2)),scroll:prevented(touch(1)),wheel:prevented(new WheelEvent('wheel',{cancelable:true,deltaY:100})),trackpad:prevented(new WheelEvent('wheel',{cancelable:true,deltaY:100,ctrlKey:true})),zoomKey:prevented(new KeyboardEvent('keydown',{cancelable:true,ctrlKey:true,key:'+'})),resetKey:prevented(new KeyboardEvent('keydown',{cancelable:true,ctrlKey:true,key:'0'})),action:getComputedStyle(document.documentElement).touchAction};
 });
 assert.deepEqual(checks,{gesture:true,change:true,pinch:true,scroll:false,wheel:false,trackpad:true,zoomKey:true,resetKey:false,action:'pan-x pan-y'});
 const cdp=await context.newCDPSession(page);
 await cdp.send('Input.synthesizePinchGesture',{x:195,y:330,scaleFactor:1.7,relativeSpeed:800,gestureSourceType:'touch'});
 assert.equal(await page.evaluate(()=>visualViewport.scale),1);
 await page.getByLabel('Tên đăng nhập',{exact:true}).tap();
 assert.ok(Number.parseFloat(await page.getByLabel('Tên đăng nhập',{exact:true}).evaluate(e=>getComputedStyle(e).fontSize))>=16);
 await page.getByLabel('Tên đăng nhập',{exact:true}).fill('local-test');
 assert.equal(await page.getByLabel('Tên đăng nhập',{exact:true}).inputValue(),'local-test');
 await page.evaluate(()=>{const spacer=document.createElement('div');spacer.style.height='2000px';document.body.append(spacer);});
 await page.evaluate(()=>document.activeElement?.blur());
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:650}]});
 for(const y of [600,550,500,450,400]){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:195,y}]});
  await new Promise(resolve=>setTimeout(resolve,40));
 }
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(()=>scrollY>0,{},{timeout:3000});
 assert.ok(await page.evaluate(()=>scrollY)>0,'one-finger scrolling still works');
 assert.deepEqual(errors,[]);await context.close();
 console.log('PASS fixed viewport: actual mobile pinch stays 1x; Safari gesture guards, Ctrl+wheel guard; normal touch/wheel allowed, input focus >=16px and one-finger scrolling.');
}finally{await browser.close();}
