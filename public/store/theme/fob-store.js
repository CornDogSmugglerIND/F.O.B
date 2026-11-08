(()=>{
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine=matchMedia('(pointer: fine)').matches;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const grade=t=>{const m=/\b(PSA|CGC|BGS|SGC|TAG)\s*(\d+(?:\.\d)?)/i.exec(t);if(m)return m[1].toUpperCase()+' '+m[2];if(/sealed|booster|elite trainer|box|deck|tin|collection/i.test(t))return 'Sealed';const c=/\b(NM|LP|MP|HP)\b|near mint/i.exec(t);return c?({NM:'Near Mint',LP:'Lightly Played',MP:'Moderately Played',HP:'Heavily Played'})[(c[1]||'NM').toUpperCase()]:'Raw'};

/* ===== The Case: a 3D ring of real cards you can grab and fling ===== */
function deck(root){
  let data=[];try{data=JSON.parse(root.querySelector('script[type="application/json"]').textContent)}catch(e){}
  if(!data.length){root.hidden=true;return}
  const ring=root.querySelector('[data-ring]'),stage=root.querySelector('[data-stage]');
  const N=data.length,step=360/N;
  ring.innerHTML=data.map((d,i)=>`<a class="dk-card" href="${esc(d.u)}" draggable="false" data-i="${i}" style="--r:${i*step}deg"><span class="dk-f"><img src="${esc(d.i)}" alt="${esc(d.t)}" draggable="false" loading="${i<4||i>N-3?'eager':'lazy'}"></span><span class="dk-bk"></span></a>`).join('');
  const cards=[...ring.children];
  let R=0,a=0,v=0,drag=null,moved=0,last=performance.now(),idle=0,snapping=null,front=-1,running=false;
  const size=()=>{const w=cards[0].offsetWidth||180;R=Math.round(w/2/Math.tan(Math.PI/N)*1.18);ring.style.setProperty('--R',R+'px');paint()};
  const norm=x=>((x%360)+360)%360;
  const paint=()=>{
    ring.style.transform=`translateZ(${-R}px) rotateY(${a}deg)`;
    cards.forEach((c,i)=>{let d=norm(i*step+a);if(d>180)d-=360;const k=Math.min(1,Math.abs(d)/90);c.style.setProperty('--k',k.toFixed(3));c.classList.toggle('is-front',Math.abs(d)<step/2)});
    const f=((Math.round(-a/step)%N)+N)%N;
    if(f!==front){front=f;readout()}
  };
  const L=root.querySelector('[data-rol]'),Rr=root.querySelector('[data-ror]'),nm=root.querySelector('[data-name]'),ix=root.querySelector('[data-idx]'),open=root.querySelector('[data-open]');
  const row=(k,v,cls='')=>`<div class="dk-r ${cls}"><em>${esc(k)}</em><b>${esc(v)}</b></div>`;
  const readout=()=>{const d=data[front];root.classList.remove('locked');
    L.innerHTML=row('Price',d.p,'money')+row('In stock',d.q>0?d.q:1);
    const g=/graded/i.test(d.c||'')&&grade(d.t)==='Raw'?'Graded':(/graded/i.test(d.c||'')&&!/PSA|CGC|BGS|SGC|TAG/i.test(d.t)?'Graded':grade(d.t));
    Rr.innerHTML=row('Category',d.c||(g==='Sealed'?'Sealed product':'Single'))+row('Grade',g);
    nm.textContent=d.t;ix.textContent=`${front+1} / ${N}`;open.href=d.u};
  const lock=()=>root.classList.add('locked');
  const loop=t=>{const dt=Math.min(48,t-last);last=t;
    if(!drag){
      if(snapping!==null){const diff=snapping-a;a+=diff*Math.min(1,dt/110);if(Math.abs(diff)<.05){a=snapping;snapping=null;lock()}}
      else if(Math.abs(v)>.02){a+=v*dt/16;v*=Math.pow(.955,dt/16);if(Math.abs(v)<.35){v=0;snapTo(Math.round(a/step)*step)}}
      else if(!reduce&&(idle+=dt)>4200){a-=.012*dt;if(idle>4200+2600){idle=0;snapTo(Math.round(a/step)*step)}}
    }
    paint();
    if(running)requestAnimationFrame(loop)};
  const snapTo=x=>{snapping=x;v=0};
  const go=n=>{idle=0;root.classList.remove('locked');snapTo((Math.round(a/step)-n)*step)};
  stage.addEventListener('pointerdown',e=>{if(e.button)return;drag={x:e.clientX,y:e.clientY,a,t:performance.now(),lx:e.clientX};moved=0;v=0;snapping=null;idle=0;root.classList.remove('locked')});
  addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x;if(!moved&&Math.abs(dx)<6)return;if(!moved){moved=1;try{stage.setPointerCapture(e.pointerId)}catch(_){}}
    const now=performance.now();a=drag.a+dx*.32;v=(e.clientX-drag.lx)*.2*16/Math.max(8,now-drag.t);drag.lx=e.clientX;drag.t=now});
  addEventListener('pointerup',()=>{if(!drag)return;drag=null;if(moved){if(Math.abs(v)<.6)snapTo(Math.round(a/step)*step)}});
  stage.addEventListener('click',e=>{const c=e.target.closest('.dk-card');if(moved){e.preventDefault();moved=0;return}
    if(!c)return;const i=+c.dataset.i;if(i!==front){e.preventDefault();idle=0;let d=norm(i*step+a);if(d>180)d-=360;snapTo(a-d)}},true);
  stage.addEventListener('touchmove',e=>{if(moved)e.preventDefault()},{passive:false});
  root.querySelector('[data-prev]').onclick=()=>go(-1);
  root.querySelector('[data-next]').onclick=()=>go(1);
  root.querySelector('[data-spin]').onclick=()=>{idle=0;snapping=null;root.classList.remove('locked');v=(Math.random()<.5?-1:1)*(22+Math.random()*10)};
  stage.tabIndex=0;stage.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')go(-1);if(e.key==='ArrowRight')go(1)});
  new IntersectionObserver(([en])=>{const on=en.isIntersecting;if(on&&!running){running=true;last=performance.now();requestAnimationFrame(loop)}running=on}).observe(root);
  addEventListener('resize',size);size();
  // intro: the ring spins up into place and locks
  if(!reduce){a=-step*N*.5;snapping=null;v=0;setTimeout(()=>snapTo(0),60)}else{lock()}
}
document.querySelectorAll('[data-deck]').forEach(deck);

/* ===== card tiles: tilt + glare toward the pointer ===== */
function tilt(el){const fr=el.querySelector('.cd-frame');if(!fr)return;let raf=0;
  el.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse')return;const r=fr.getBoundingClientRect(),nx=(e.clientX-r.left)/r.width,ny=(e.clientY-r.top)/r.height;
    cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{fr.style.transform=`rotateX(${(.5-ny)*10}deg) rotateY(${(nx-.5)*12}deg) translateZ(6px)`;fr.style.setProperty('--gx',nx*100+'%');fr.style.setProperty('--gy',ny*100+'%')})},{passive:true});
  el.addEventListener('pointerleave',()=>{cancelAnimationFrame(raf);fr.style.transform=''})}
if(!reduce&&fine)$$('[data-tilt]').forEach(tilt);

/* ===== inspector: point at a card to see it (like the app) ===== */
const insp=$('[data-insp]');
if(insp&&fine){let cur=null;
  const show=c=>{if(cur===c)return;cur=c;const d=c.dataset;const n=+d.n||1;
    insp.innerHTML=`<div class="insp-card">${d.i?`<img src="${esc(d.i)}" alt="">`:''}<i class="insp-br a"></i><i class="insp-br b"></i><i class="insp-br c"></i><i class="insp-br d"></i></div>
    <p class="insp-t">${esc(d.t)}</p><div class="insp-p">${esc(d.p)}</div>
    <div class="insp-m"><span class="chip"><em>Game</em><b>${esc(d.g||'Collectible')}</b></span><span class="chip"><em>Condition</em><b>${esc(grade(d.t))}</b></span>${n>1?`<span class="chip"><em>Pick your card</em><b>${n} options</b></span>`:''}</div>
    <a class="fx-btn" style="margin-top:14px;width:100%" href="${esc(c.getAttribute('href'))}">Open this card</a>`};
  $$('[data-card]').forEach(c=>c.addEventListener('pointerenter',()=>show(c)))}

/* ===== phone games sheet ===== */
const sh=$('[data-games]');
if(sh){$$('[data-games-open]').forEach(b=>b.onclick=()=>{sh.hidden=false;document.body.style.overflow='hidden'});
  $$('[data-games-close]',sh).forEach(b=>b.onclick=()=>{sh.hidden=true;document.body.style.overflow=''});
  addEventListener('keydown',e=>{if(e.key==='Escape'&&!sh.hidden){sh.hidden=true;document.body.style.overflow=''}})}

/* ===== product viewer: drag to spin, tap to zoom ===== */
const pv=$('[data-pv]');
if(pv){
  const card=$('[data-spin]',pv),inn=$('.pv-in',pv),face=$('.pv-f',pv);
  let r=0,d=null,moved=0,raf=0;
  const set=x=>{r=x;inn.style.transform=`rotateY(${r}deg)`};
  card.addEventListener('pointerdown',e=>{d={x:e.clientX,r,lx:e.clientX,t:performance.now(),v:0};moved=0;inn.style.transition=''});
  card.addEventListener('pointermove',e=>{
    if(!d){if(e.pointerType==='mouse'&&!reduce){const b=card.getBoundingClientRect(),nx=(e.clientX-b.left)/b.width,ny=(e.clientY-b.top)/b.height;face.style.setProperty('--gx',nx*100+'%');face.style.setProperty('--gy',ny*100+'%');face.style.setProperty('--go',1);if(Math.round(r/180)%2===0)inn.style.transform=`rotateY(${r+(nx-.5)*16}deg) rotateX(${(.5-ny)*12}deg)`}return}
    const dx=e.clientX-d.x;if(!moved&&Math.abs(dx)<6)return;if(!moved){moved=1;try{card.setPointerCapture(e.pointerId)}catch(_){}}
    const now=performance.now();d.v=(e.clientX-d.lx)/Math.max(8,now-d.t)*16;d.lx=e.clientX;d.t=now;face.style.setProperty('--go',1);
    cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>set(d.r+dx*.8))});
  const end=()=>{if(!d)return;const vel=d.v;d=null;if(!moved)return;inn.style.transition='transform .75s cubic-bezier(.2,.9,.25,1.1)';set(Math.round((r+vel*7)/180)*180);setTimeout(()=>inn.style.transition='',780)};
  card.addEventListener('pointerup',end);card.addEventListener('pointercancel',end);
  card.addEventListener('pointerleave',()=>{if(!d){face.style.setProperty('--go',0);inn.style.transform=`rotateY(${r}deg)`}});
  card.addEventListener('touchmove',e=>{if(moved)e.preventDefault()},{passive:false});
  const zoom=$('[data-zoom]');
  card.addEventListener('click',()=>{if(moved){moved=0;return}if(Math.round(r/180)%2){inn.style.transition='transform .6s';set(r+180);return}
    const im=$('img[data-main]',pv)||$('.pv-f img',pv);if(!im||!zoom)return;$('img',zoom).src=im.currentSrc||im.src;zoom.hidden=false});
  if(zoom){zoom.addEventListener('click',()=>zoom.hidden=true);addEventListener('keydown',e=>{if(e.key==='Escape')zoom.hidden=true})}
  const swap=src=>{const im=$('.pv-f img',pv);if(im&&src){im.removeAttribute('srcset');im.src=src}};
  $$('[data-thumb]',pv).forEach(t=>t.onclick=()=>{$$('[data-thumb]',pv).forEach(x=>x.classList.remove('is-on'));t.classList.add('is-on');swap(t.dataset.thumb);set(0)});
  // pick your card
  const vid=$('[data-vid]',pv),price=$('[data-price]',pv),add=$('[data-add]',pv);
  $$('.pv-var',pv).forEach(b=>b.onclick=()=>{$$('.pv-var',pv).forEach(x=>{x.classList.remove('is-on');x.setAttribute('aria-selected','false')});b.classList.add('is-on');b.setAttribute('aria-selected','true');
    vid.value=b.dataset.id;price.textContent=b.dataset.price;const ok=b.dataset.av==='true';add.disabled=!ok;add.textContent=ok?'Add to cart':'Sold out';
    if(b.dataset.img)swap(b.dataset.img);set(0);const u=new URL(location.href);u.searchParams.set('variant',b.dataset.id);history.replaceState(null,'',u)});
  // tabs
  $$('.seg-tabs button',pv).forEach(b=>b.onclick=()=>{$$('.seg-tabs button',pv).forEach(x=>{x.classList.toggle('is-on',x===b);x.setAttribute('aria-selected',x===b)});$$('[data-pane]',pv).forEach(p=>p.hidden=p.dataset.pane!==b.dataset.tab)});
  // add to cart without leaving the page
  const form=$('[data-pv-form]',pv);
  if(form)form.addEventListener('submit',async e=>{e.preventDefault();if(add.disabled)return;const fd=new FormData(form);const old=add.textContent;add.disabled=true;add.textContent='Adding…';
    try{const res=await fetch((window.Shopify&&Shopify.routes&&Shopify.routes.root||'/')+'cart/add.js',{method:'POST',headers:{Accept:'application/json'},body:fd});
      if(!res.ok){const j=await res.json().catch(()=>({}));throw new Error(j.description||'Could not add this card')}
      const c=await (await fetch('/cart.js')).json();$$('[data-cart-n]').forEach(n=>n.textContent=c.item_count);
      if(!$('[data-cart-n]')){const ic=$('.hb-cart');if(ic){const i=document.createElement('i');i.dataset.cartN='';i.textContent=c.item_count;ic.appendChild(i)}}
      toast('Added to cart',true);add.textContent='Added';setTimeout(()=>{add.textContent=old;add.disabled=false},1400)}
    catch(err){toast(err.message,false);add.textContent=old;add.disabled=false}});
}
function toast(msg,ok){let t=$('.toast');if(!t){t=document.createElement('div');t.className='toast';t.setAttribute('role','status');document.body.appendChild(t)}
  t.innerHTML=`<span>${esc(msg)}</span>${ok?'<a class="fx-btn" href="/cart">View cart</a>':''}`;t.classList.add('on');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('on'),3800)}

/* count-up */
$$('[data-count]').forEach(b=>{const n=+b.dataset.count;if(reduce||!n)return;let s=null;
  const st=ts=>{s??=ts;const k=Math.min(1,(ts-s)/1200);b.textContent=Math.round(n*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(st)};requestAnimationFrame(st)});
})();
