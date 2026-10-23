/* Approved stardust reference, externalized without changing the fixed background.
 * Discovery counts belong to this local-only preview. A future game-clear /
 * lantern component must remain separate; incrementDiscovery never lights lanterns.
 */
(()=>{
'use strict';
const canvas=document.querySelector('#overlay');
const ctx=canvas.getContext('2d',{alpha:true});
const stage=document.querySelector('#stage');
const status=document.querySelector('#projector-status');
const W=1536,H=864,TAU=Math.PI*2;
const colors=[{name:'赤',rgb:[255,65,83],x:.20,y:.26},{name:'白',rgb:[255,250,232],x:.19,y:.77},{name:'黄',rgb:[255,199,70],x:.79,y:.26},{name:'青',rgb:[64,159,255],x:.83,y:.78}];
const storageKey='hikari-2027-projector-demo-v1';
const maxCount=9999;
// Counts keep increasing; only the visual intensity reaches its ceiling at 30 per color.
const sparkleMax=30;
let counts=[0,0,0,0];
try{
 const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
 if(Array.isArray(saved)&&saved.length===4&&saved.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=maxCount)) counts=saved;
}catch{status.textContent='このブラウザーでは保存できないため、この画面を開いている間だけ記録します。';}
let display=[...counts],last=0,burst=[0,0,0,0],raf=0;
const motionQuery=window.matchMedia('(prefers-reduced-motion:reduce)');
let reducedMotion=motionQuery.matches;
canvas.width=W;canvas.height=H;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const rgba=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
function fixedRandom(seed){let x=seed>>>0;return()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296}}
function halo(x,y,rx,ry,rgb,op,falloff=.6){ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);const g=ctx.createRadialGradient(0,0,.01,0,0,1);g.addColorStop(0,rgba(rgb,op));g.addColorStop(.26,rgba(rgb,op*.79));g.addColorStop(falloff,rgba(rgb,op*.27));g.addColorStop(1,rgba(rgb,0));ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.fill();ctx.restore()}
function makeSparkSprite(rgb){
 const sprite=document.createElement('canvas');sprite.width=sprite.height=64;
 const brush=sprite.getContext('2d');
 if(!brush)return sprite;
 const x=32,y=32,size=8;
 const glow=brush.createRadialGradient(x,y,0,x,y,size*3.8);
 glow.addColorStop(0,rgba([255,255,244],1));
 glow.addColorStop(.3,rgba(rgb,.6));glow.addColorStop(1,rgba(rgb,0));
 brush.fillStyle=glow;brush.fillRect(0,0,64,64);
 brush.strokeStyle=rgba(rgb,.85);brush.lineWidth=2.4;brush.lineCap='round';
 brush.beginPath();brush.moveTo(x-size*2.6,y);brush.lineTo(x+size*2.6,y);
 brush.moveTo(x,y-size*2.6);brush.lineTo(x,y+size*2.6);brush.stroke();
 brush.strokeStyle='#fffff4';brush.lineWidth=1.1;
 brush.beginPath();brush.moveTo(x-size*1.4,y);brush.lineTo(x+size*1.4,y);
 brush.moveTo(x,y-size*1.4);brush.lineTo(x,y+size*1.4);brush.stroke();
 return sprite;
}
// Reuse the same four stars: a full screen can show 960 without rebuilding gradients every frame.
const sparkSprites=colors.map(color=>makeSparkSprite(color.rgb));
function burstRing(x,y,r,rgb,alpha){ctx.save();ctx.strokeStyle=rgba(rgb,alpha);ctx.lineWidth=2.6;ctx.beginPath();ctx.ellipse(x,y,r,r*.64,0,0,TAU);ctx.stroke();ctx.restore()}
function stardust(z,c,t,idx){
 const x=z.x*W,y=z.y*H,g=clamp(c/sparkleMax,0,1);
 ctx.save();ctx.globalCompositeOperation='screen';
 halo(x,y,W*(.08+.18*g),H*(.14+.22*g),z.rgb,.13+.15*g);
 halo(x,y+H*.07,W*(.12+.15*g),H*(.12+.16*g),z.rgb,.08+.08*g);
 const rand=fixedRandom(928361+idx*134),N=Math.round(16+224*g);
 for(let j=0;j<N;j++){
  const u=rand(),a=rand()*TAU,rr=Math.sqrt(rand());
  const ox=Math.cos(a)*W*(.095+.155*g)*rr,oy=Math.sin(a)*H*(.17+.21*g)*rr;
  const sx=x+ox+Math.sin(t*.32+j*3.2)*4,sy=y+oy-Math.sin(t*.2+j)*5-4*Math.sin(t*.33+j*2);
  const flicker=clamp(.55+.45*Math.sin(t*(1.1+u*.45)+j*3),.12,1);
  const featured=j%12===0,sz=(1.25+rand()*2.1+g*.9)*(featured?1.8:1);
  ctx.globalAlpha=Math.min(1,(.32+.58*flicker)*(.78+.22*g)*(featured?1.15:1));
  ctx.drawImage(sparkSprites[idx],sx-sz*4,sy-sz*4,sz*8,sz*8);
 }
 ctx.restore();
}

function draw(ms){
 if(!ctx)return;
 const t=reducedMotion?0:ms/1000;
 ctx.clearRect(0,0,W,H);
 ctx.globalCompositeOperation='source-over';
 for(let i=0;i<4;i++){
  const z=colors[i],c=display[i];
  if(c<=.01)continue;
  stardust(z,c,t,i);
  if(!reducedMotion&&burst[i]>0){
   const progress=1-burst[i],rad=30+190*progress;
   ctx.save();ctx.globalCompositeOperation='screen';
   burstRing(z.x*W,z.y*H,rad,z.rgb,burst[i]*.6);
   halo(z.x*W,z.y*H,W*.08,H*.11,z.rgb,.22*burst[i]);
   ctx.restore();
  }
 }
}
function render(ms){
 const dt=clamp((ms-last)/1000,0,.08);last=ms;
 display=display.map((v,i)=>{
  const target=Math.min(counts[i],sparkleMax);
  return Math.abs(target-v)<.01?target:v+(target-v)*Math.min(dt*7,1);
 });
 burst=burst.map(b=>Math.max(0,b-dt/1.1));
 draw(ms);
 raf=requestAnimationFrame(render);
}
function print(animate=-1){
 document.querySelectorAll('[data-counter]').forEach((el,i)=>{
  el.textContent=counts[i].toLocaleString('ja-JP');
  if(i===animate&&!reducedMotion){el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop');}
 });
 try{localStorage.setItem(storageKey,JSON.stringify(counts));}
 catch{status.textContent='保存できませんでした。この画面を開いている間だけ記録します。';}
 if(reducedMotion){display=[...counts];draw(0);}
}
function incrementDiscovery(index,amount=1){
 // Only this local demo invokes the discovery view. No database or phone events.
 counts[index]=Math.min(maxCount,counts[index]+amount);
 burst[index]=1;
 print(index);
}
function startAnimation(){
 cancelAnimationFrame(raf);raf=0;last=0;
 if(document.hidden)return;
 if(reducedMotion){display=[...counts];draw(0);}
 else raf=requestAnimationFrame(render);
}
document.querySelectorAll('[data-color]').forEach(button=>{
 button.addEventListener('click',()=>incrementDiscovery(Number(button.dataset.color)));
});
document.querySelector('#sample').addEventListener('click',()=>{
 for(let i=0;i<counts.length;i++)counts[i]=Math.min(maxCount,counts[i]+5);
 burst=[1,1,1,1];print();
});
document.querySelector('#fullscreen').addEventListener('click',async()=>{
 const frame=document.querySelector('#screen-frame');
 try{
  if(frame.requestFullscreen)await frame.requestFullscreen();
  else if(frame.webkitRequestFullscreen)frame.webkitRequestFullscreen();
  else status.textContent='このブラウザーは全画面表示に対応していません。横向きで確認できます。';
 }catch{status.textContent='全画面表示を開始できませんでした。横向きで確認できます。';}
});
if(motionQuery.addEventListener)motionQuery.addEventListener('change',event=>{reducedMotion=event.matches;startAnimation();});
document.addEventListener('visibilitychange',startAnimation);
print();startAnimation();
})();
