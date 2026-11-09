/* Coalition Vault FX — the F.O.B. app's effects, brought to the store */
(()=>{
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const root=document.documentElement;root.classList.add('vfx');
const touch=matchMedia('(hover:none)').matches;

/* 1. living background: smoke light + holo dust, parallax with pointer / phone tilt */
let cv,cx,W,H,parts=[],px=0,py=0,tx=0,ty=0,last=0,run=true,burst=[];
function initBg(){
 cv=document.createElement('canvas');cv.id='vfxbg';cv.setAttribute('aria-hidden','true');document.body.prepend(cv);cx=cv.getContext('2d');size();
 const N=innerWidth<720?45:80;for(let i=0;i<N;i++)parts.push({x:Math.random(),y:Math.random(),z:.3+Math.random()*.7,v:.00004+Math.random()*.00012,o:Math.random()<.22});
 addEventListener('resize',size);
 addEventListener('pointermove',e=>{tx=e.clientX/innerWidth-.5;ty=e.clientY/innerHeight-.5},{passive:true});
 addEventListener('deviceorientation',e=>{if(e.gamma==null)return;tx=Math.max(-.5,Math.min(.5,e.gamma/60));ty=Math.max(-.5,Math.min(.5,(e.beta-40)/60))},{passive:true});
 document.addEventListener('visibilitychange',()=>{run=!document.hidden;if(run)requestAnimationFrame(tick)});
 requestAnimationFrame(tick)}
function size(){W=innerWidth;H=innerHeight;cv.width=W;cv.height=H}
const blobs=[{x:.15,y:.8,r:.55,c:'60,220,170',a:.10,s:.00005},{x:.88,y:.25,r:.5,c:'232,146,74',a:.08,s:.00007},{x:.55,y:.5,r:.7,c:'40,160,140',a:.06,s:.00004}];
function tick(t){
 if(!run)return;requestAnimationFrame(tick);if(t-last<33)return;const dt=Math.min(80,t-last);last=t;
 px+=(tx-px)*.06;py+=(ty-py)*.06;cx.clearRect(0,0,W,H);
 const sy=scrollY*.15;
 for(const b of blobs){const bx=(b.x+Math.sin(t*b.s)*.08-px*.05)*W,by=((b.y+Math.cos(t*b.s*1.3)*.06-py*.05)*H)-sy%H*.2,r=b.r*Math.max(W,H);
  const g=cx.createRadialGradient(bx,by,0,bx,by,r);g.addColorStop(0,`rgba(${b.c},${b.a})`);g.addColorStop(1,`rgba(${b.c},0)`);cx.fillStyle=g;cx.fillRect(0,0,W,H)}
 for(let i=0;i<parts.length;i++){const p=parts[i];p.y-=p.v*dt*p.z;p.x+=Math.sin(t/4000+i)*.00003*dt;if(p.y<-.02){p.y=1.02;p.x=Math.random()}
  const x=(p.x-px*.05*p.z)*W,y=(p.y-py*.05*p.z)*H,a=.25+.5*p.z*(.6+.4*Math.sin(t/700+i*3));
  cx.fillStyle=p.o?`rgba(255,178,122,${a})`:`rgba(125,242,180,${a})`;cx.beginPath();cx.arc(x,y,.8+p.z*1.9,0,6.283);cx.fill();
  if(p.z>.85){cx.fillStyle=p.o?`rgba(255,178,122,${a*.15})`:`rgba(125,242,180,${a*.15})`;cx.beginPath();cx.arc(x,y,6*p.z,0,6.283);cx.fill()}}
 // sparks (from add-to-cart / ring snaps)
 for(let i=burst.length-1;i>=0;i--){const s=burst[i];s.l-=dt;if(s.l<=0){burst.splice(i,1);continue}s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=.0006*dt;const k=s.l/s.L;
  cx.fillStyle=s.o?`rgba(255,190,130,${k})`:`rgba(140,255,195,${k})`;cx.beginPath();cx.arc(s.x,s.y,1.2+2*k,0,6.283);cx.fill()}
}
function sparks(x,y,n=26){for(let i=0;i<n;i++){const a=Math.random()*6.283,v=.08+Math.random()*.32;burst.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-.15,l:500+Math.random()*500,L:1000,o:Math.random()<.35})}}
window.vSparks=sparks;

/* 2. power-on splash, once per visit */
function boot(){let seen=false;try{seen=sessionStorage.getItem('vfx-boot')}catch(e){}if(seen)return;try{sessionStorage.setItem('vfx-boot','1')}catch(e){}
 const logo=$('.v-logo .w');if(!logo)return;const sp=document.createElement('div');sp.id='vfxsplash';sp.setAttribute('aria-hidden','true');
 sp.innerHTML=`<img src="${logo.src}" alt=""><i></i>`;document.body.appendChild(sp);setTimeout(()=>sp.remove(),1800);
 setTimeout(()=>{root.classList.add('vfx-on');setTimeout(()=>root.classList.remove('vfx-on'),1200)},1150)}

/* 3. lock-on: arcs close in on whatever you tap, pulse where your finger lands */
const SEL='.v-card-media,.v-door,.v-btn,.v-rbtn,.v-quick,.v-chip,.v-opt,.v-rc.front,.v-spot-list a,.v-ic';
function lockOn(e){const el=e.target.closest&&e.target.closest(SEL);if(!el)return;const r=el.getBoundingClientRect();if(r.width<8||r.width>innerWidth*.95)return;
 const pad=8,d=document.createElement('div');d.className='vfx-lock';d.style.cssText=`left:${r.left-pad}px;top:${r.top-pad}px;width:${r.width+pad*2}px;height:${r.height+pad*2}px`;
 d.innerHTML='<b class="tl"></b><b class="tr"></b><b class="bl"></b><b class="br"></b>';document.body.appendChild(d);
 const p=document.createElement('div');p.className='vfx-ping';p.style.left=e.clientX+'px';p.style.top=e.clientY+'px';p.innerHTML='<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30"/><circle class="s" cx="50" cy="50" r="44"/></svg>';document.body.appendChild(p);
 setTimeout(()=>{d.remove();p.remove()},720)}

/* 4. headings decode like the HUD when they scroll in */
const GL='▓▒░█<>/\\#$%&*+=?ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
function decode(h){if(h.__d)return;h.__d=1;const fin=h.textContent;if(fin.length>60)return;let f=0;const tot=Math.min(26,fin.length*1.4);
 h.style.minHeight=h.offsetHeight+'px';
 const step=()=>{f++;const k=f/tot;h.textContent=[...fin].map((c,i)=>c===' '||i/fin.length<k?c:GL[(Math.random()*GL.length)|0]).join('');if(f<tot)requestAnimationFrame(step);else{h.textContent=fin;h.style.minHeight=''}};step()}

/* 5. rails: cards are dealt in when the row arrives, and the row bends like a coverflow while you scroll it */
function rails(){
 $$('.v-rail-track').forEach(tr=>{
  const cards=$$(':scope > .v-card',tr);cards.forEach((c,i)=>c.style.setProperty('--di',Math.min(i,7)));
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){tr.classList.add('dealt');io.disconnect()}}),{threshold:.2});io.observe(tr);
  let q=0;const bend=()=>{q=0;const r=tr.getBoundingClientRect(),mid=r.left+r.width/2;
   for(const c of cards){const b=c.getBoundingClientRect();const d=(b.left+b.width/2-mid)/(r.width/2);if(Math.abs(d)>1.6)continue;
    const dd=Math.max(-1,Math.min(1,d));c.style.setProperty('--ry',(dd*-14).toFixed(2)+'deg');c.style.setProperty('--sc',(1-Math.abs(dd)*.07).toFixed(3));c.style.setProperty('--sh',(50+dd*40).toFixed(1)+'%')}};
  tr.addEventListener('scroll',()=>{if(!q)q=requestAnimationFrame(bend)},{passive:true});addEventListener('resize',bend);bend();
 })}

/* 6. phone: cards shimmer as they pass the middle of the screen (no hover on phones) */
function shimmer(){if(!touch)return;const io=new IntersectionObserver(es=>es.forEach(e=>e.target.classList.toggle('glint',e.isIntersecting)),{rootMargin:'-42% 0px -42% 0px'});$$('.v-card-media,.v-door').forEach(el=>io.observe(el))}

/* 7. add to cart: the card flies into the bag, sparks pop, bag kicks */
document.addEventListener('vault:added',e=>{const src=e.detail&&e.detail.from,bag=$('.v-hd [data-open="#vDrawer"]');if(!bag)return;const br=bag.getBoundingClientRect();
 if(src){const im=src.querySelector('img')||src;const r=im.getBoundingClientRect();const f=document.createElement('img');f.className='vfx-fly';f.src=im.currentSrc||im.src;f.style.cssText=`left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;document.body.appendChild(f);
  requestAnimationFrame(()=>{f.style.transform=`translate(${br.left+br.width/2-r.left-r.width/2}px,${br.top+br.height/2-r.top-r.height/2}px) scale(.08) rotate(25deg)`;f.style.opacity='.4'});setTimeout(()=>f.remove(),700)}
 setTimeout(()=>{sparks(br.left+br.width/2,br.top+br.height/2,30);bag.classList.remove('kick');void bag.offsetWidth;bag.classList.add('kick')},560)});

/* 8. scroll progress line + ring snap sparks */
function progress(){const b=document.createElement('i');b.id='vfxprog';document.body.appendChild(b);const u=()=>{const m=document.documentElement.scrollHeight-innerHeight;b.style.transform=`scaleX(${m>0?scrollY/m:0})`};addEventListener('scroll',u,{passive:true});u()}
function ringSparks(){const st=$('.v-ring-stage');if(!st)return;let lf=-1;setInterval(()=>{if(!window.vRing)return;const f=vRing.front;if(f!==lf&&lf!==-1){const el=$('.v-rc.front .v-rc-f');if(el){const r=el.getBoundingClientRect();if(r.top<innerHeight&&r.bottom>0)sparks(r.left+r.width/2,r.top+r.height*.9,14)}}lf=f},120)}

function start(){
 const hero=$('.v-hero');if(hero){hero.insertAdjacentHTML('afterbegin','<i class="v-scan"></i><i class="v-band"></i>')}
 initBg();boot();rails();shimmer();progress();ringSparks();
 addEventListener('pointerdown',lockOn,{passive:true,capture:true});
 const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){decode(e.target);io.unobserve(e.target)}}),{threshold:.6});
 $$('.v-h2,.v-col-hero .v-h1').forEach(h=>io.observe(h));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
