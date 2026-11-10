/* Coalition Vault FX 3 — handle the product: 3D tilt + glare, loupe, flip, slab acrylic, morphing page transitions */
(()=>{
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const SLAB=/\b(psa|bgs|cgc|sgc|beckett)\b|graded/i;
const big=u=>u?u.replace(/([?&])width=\d+/,'$1width=2000'):u;

/* ---------- graded slabs: acrylic case everywhere a slab shows up ---------- */
function slabs(){
 $$('.v-card').forEach(c=>{const t=(c.querySelector('.v-card-t')||{}).textContent||'';if(SLAB.test(t))c.querySelector('.v-card-media')?.classList.add('is-slab')});
 $$('.v-spot-list a,.v-slab').forEach(el=>el.classList.add('is-slab'));
}

/* ---------- product page: the card in your hand ---------- */
function pdp(){
 const m=$('.v-main'),inn=m&&$('.v-main-in',m),front=inn&&$('img',inn);if(!front)return;
 const title=($('.v-buy h1')||{}).textContent||'';if(SLAB.test(title))m.classList.add('is-slab');
 // faces
 front.classList.add('vt-front');
 const thumbs=$$('.v-thumbs button');let backSrc=thumbs[1]&&thumbs[1].dataset.src;
 let back=null,flipped=false;
 if(backSrc){back=document.createElement('img');back.className='vt-back';back.alt='Back';back.src=backSrc;back.decoding='async';inn.appendChild(back);
  const fb=document.createElement('button');fb.className='vt-flip';fb.type='button';fb.setAttribute('aria-label','Flip it over');fb.innerHTML='<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg><span>Flip</span>';
  m.appendChild(fb);fb.addEventListener('click',e=>{e.stopPropagation();window.__vNoZoom=0;m.classList.add('flipping');setTimeout(()=>m.classList.remove('flipping'),720);flipped=!flipped;m.classList.toggle('flipped',flipped);apply(true);fb.querySelector('span').textContent=flipped?'Front':'Flip'})}
 document.addEventListener('vault:img',e=>{flipped=false;m.classList.remove('flipped');const fb=$('.vt-flip span',m);fb&&(fb.textContent='Flip');apply(true);
  // whatever photo is up front, the next one is its back
  const i=thumbs.findIndex(t=>t.dataset.src===e.detail);const nb=thumbs[(i+1)%thumbs.length];if(back&&nb)back.src=nb.dataset.src});
 m.classList.add('vt-ready');

 // tilt state
 let rx=0,ry=0,trx=0,try_=0,gx=50,gy=30,active=false,gyro=false,raf=0;
 function apply(snap){if(!raf)raf=requestAnimationFrame(loop)}
 function loop(){raf=0;rx+=(trx-rx)*.16;ry+=(try_-ry)*.16;
  inn.style.transform=`rotateY(${(flipped?180:0)+ry}deg) rotateX(${rx}deg)`;
  m.style.setProperty('--gx',gx+'%');m.style.setProperty('--gy',gy+'%');m.style.setProperty('--mx',gx+'%');m.style.setProperty('--my',gy+'%');m.style.setProperty('--sx',(100-gx)+'%');
  m.style.setProperty('--tilt',Math.min(1,(Math.abs(rx)+Math.abs(ry))/16).toFixed(3));
  if(Math.abs(trx-rx)>.05||Math.abs(try_-ry)>.05)raf=requestAnimationFrame(loop)}
 const aim=(x,y)=>{const r=m.getBoundingClientRect(),px=(x-r.left)/r.width,py=(y-r.top)/r.height;try_=(px-.5)*26;trx=(.5-py)*22;gx=px*100;gy=py*100;apply()};
 const rest=()=>{if(gyro)return;trx=0;try_=0;gx=50;gy=30;apply()};

 // loupe
 const lp=document.createElement('div');lp.className='vt-loupe';lp.setAttribute('aria-hidden','true');document.body.appendChild(lp);
 let loupe=false,holdT=0,sx=0,sy=0,moved=false;
 function imgRect(img){const r=img.getBoundingClientRect(),nw=img.naturalWidth||1,nh=img.naturalHeight||1,s=Math.min(r.width/nw,r.height/nh),w=nw*s,h=nh*s;return{l:r.left+(r.width-w)/2,t:r.top+(r.height-h)/2,w,h}}
 function showLoupe(x,y){const img=flipped&&back?back:front;const ir=imgRect(img);const Z=2.6,S=lp.offsetWidth||150;
  const px=Math.max(0,Math.min(1,(x-ir.l)/ir.w)),py=Math.max(0,Math.min(1,(y-ir.t)/ir.h));
  lp.style.backgroundImage=`url("${big(img.currentSrc||img.src)}")`;lp.style.backgroundSize=`${ir.w*Z}px ${ir.h*Z}px`;
  lp.style.backgroundPosition=`${-(px*ir.w*Z-S/2)}px ${-(py*ir.h*Z-S/2)}px`;
  const off=matchMedia('(pointer:coarse)').matches?S*.85:0;lp.style.transform=`translate(${x-S/2}px,${y-S/2-off}px)`}
 const startLoupe=(x,y)=>{loupe=true;window.__vNoZoom=1;trx=0;try_=0;apply();lp.classList.add('on');m.classList.add('louping');showLoupe(x,y);try{navigator.vibrate&&navigator.vibrate(10)}catch(e){}};
 const endLoupe=()=>{loupe=false;lp.classList.remove('on');m.classList.remove('louping')};

 // touch: drag tilts, hold to magnify
 m.addEventListener('touchstart',e=>{const t=e.touches[0];sx=t.clientX;sy=t.clientY;moved=false;active=true;m.classList.add('handling');
  clearTimeout(holdT);holdT=setTimeout(()=>{if(!moved)startLoupe(sx,sy)},320);askGyro()},{passive:true});
 m.addEventListener('touchmove',e=>{const t=e.touches[0];const dx=t.clientX-sx,dy=t.clientY-sy;
  if(loupe){e.cancelable&&e.preventDefault();showLoupe(t.clientX,t.clientY);return}
  if(!moved&&(Math.abs(dx)>6||Math.abs(dy)>6)){moved=true;clearTimeout(holdT);
   if(Math.abs(dy)>Math.abs(dx)*1.4){active=false;m.classList.remove('handling');rest();return}}
  if(active&&moved){e.cancelable&&e.preventDefault();window.__vNoZoom=1;aim(t.clientX,t.clientY)}},{passive:false});
 const tEnd=()=>{clearTimeout(holdT);active=false;m.classList.remove('handling');if(loupe)endLoupe();rest();if(!moved&&!loupe)window.__vNoZoom=window.__vNoZoom||0};
 m.addEventListener('touchend',tEnd);m.addEventListener('touchcancel',tEnd);

 // mouse: hover tilts, press and hold to magnify
 m.addEventListener('mousemove',e=>{if(loupe){showLoupe(e.clientX,e.clientY);return}m.classList.add('handling');aim(e.clientX,e.clientY)});
 m.addEventListener('mouseleave',()=>{m.classList.remove('handling');clearTimeout(holdT);if(loupe)endLoupe();rest()});
 m.addEventListener('mousedown',e=>{if(e.button)return;sx=e.clientX;sy=e.clientY;clearTimeout(holdT);holdT=setTimeout(()=>startLoupe(e.clientX,e.clientY),280)});
 addEventListener('mouseup',()=>{clearTimeout(holdT);if(loupe){endLoupe();rest()}});

 // phone tilt (gyroscope) when you're not touching it
 let base=null;
 function onOri(e){if(active||loupe||e.gamma==null)return;if(!base)base={b:e.beta,g:e.gamma};gyro=true;
  const g=Math.max(-25,Math.min(25,e.gamma-base.g)),b=Math.max(-25,Math.min(25,e.beta-base.b));try_=g*.7;trx=-b*.6;gx=50+g*1.6;gy=30+b*1.4;apply()}
 let asked=false;function askGyro(){if(asked)return;asked=true;const D=window.DeviceOrientationEvent;if(!D)return;
  if(typeof D.requestPermission==='function'){D.requestPermission().then(s=>{if(s==='granted')addEventListener('deviceorientation',onOri)}).catch(()=>{})}else addEventListener('deviceorientation',onOri)}
 if(window.DeviceOrientationEvent&&typeof DeviceOrientationEvent.requestPermission!=='function')askGyro();
 // re-center the gyro whenever the page is scrolled back to the photo
 addEventListener('scroll',()=>{base=null},{passive:true});
 apply();
}

/* ---------- morph: the photo you tap glides into the product page ---------- */
function morph(){
 let last=null;
 document.addEventListener('pointerdown',e=>{const a=e.target.closest&&e.target.closest('a[href*="/products/"]');if(!a){last=null;return}
  const card=a.closest('.v-card,.v-rc,.v-spot-list a,.vw-t')||a;last=card.querySelector('img')},{capture:true,passive:true});
 const tag=(el,vt)=>{if(!el)return;el.style.viewTransitionName='vt-hero';vt.finished.finally(()=>{el.style.viewTransitionName=''})};
 addEventListener('pageswap',e=>{const onPdp=!!$('.v-main');if(onPdp){try{sessionStorage.setItem('vt-from',location.pathname)}catch(_){}}
  if(!e.viewTransition)return;
  const mi=$('.v-main-in > img');if(last&&last.isConnected){if(mi)mi.style.viewTransitionName='none';tag(last,e.viewTransition)}});
 addEventListener('pagereveal',e=>{let from=null;try{from=sessionStorage.getItem('vt-from');sessionStorage.removeItem('vt-from')}catch(_){}
  if(!e.viewTransition)return;
  const mi=$('.v-main img');if(mi){tag(mi,e.viewTransition);return}
  if(from){const a=$(`a[href$="${from}"] img`);tag(a,e.viewTransition)}});
}

function start(){slabs();pdp();morph();let q=0;new MutationObserver(()=>{if(!q)q=requestAnimationFrame(()=>{q=0;slabs()})}).observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
