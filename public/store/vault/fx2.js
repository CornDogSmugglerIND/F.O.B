/* Coalition Vault FX 2 — shipping in plain sight, pack rip, vault wall, cursor glow */
(()=>{
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const money=c=>'$'+(c/100).toFixed(2);
const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;
const ENV={rate:150,free:2500,label:'envelope'},PKG={rate:850,free:7500,label:'tracked'};
const isEnv=t=>/single card|mixed lot/i.test(t||'');

/* ---------- catalog (public products.json, cached for the visit) ---------- */
let CAT=null;
async function catalog(){if(CAT)return CAT;try{const c=sessionStorage.getItem('vcat2');if(c){CAT=JSON.parse(c);return CAT}}catch(e){}
 const out=[];try{for(let pg=1;pg<=4;pg++){const r=await fetch('/products.json?limit=250&page='+pg);const j=await r.json();if(!j.products.length)break;
  for(const p of j.products){const v=p.variants.find(x=>x.available);out.push({h:p.handle,t:p.title,ty:p.product_type,i:p.images[0]&&p.images[0].src,p:Math.round(parseFloat((v||p.variants[0]).price)*100),a:!!v,v:v&&v.id,n:p.variants.length})}
  if(j.products.length<250)break}}catch(e){}
 CAT=out;try{sessionStorage.setItem('vcat2',JSON.stringify(out))}catch(e){}return CAT}
const byHandle=()=>{const m={};(CAT||[]).forEach(p=>m[p.h]=p);return m};
const img=(u,w)=>u?u+(u.includes('?')?'&':'?')+'width='+w:'';

/* ---------- 1. shipping bar, always visible, turns into a live progress meter ---------- */
function shipBar(){const hd=$('.v-hd');if(!hd||$('.v-shipbar'))return;
 hd.insertAdjacentHTML('afterbegin',`<div class="v-shipbar" role="status"><i class="v-shipfill"></i><div class="v-shipmsgs"><span class="on"><b>Cards ship $1.50</b> · free over $25</span><span><b>Gear, slabs &amp; sealed</b> ship tracked $8.50 · free over $75</span><span><b>Ships next business day</b> from Wisconsin</span></div></div>`);
 document.documentElement.classList.add('has-shipbar');
 let k=0;const rot=()=>{const ms=$$('.v-shipmsgs span');if(ms.length<2)return;ms.forEach(m=>m.classList.remove('on'));k=(k+1)%ms.length;ms[k].classList.add('on')};let tm=setInterval(rot,3600);
 document.addEventListener('vault:cart',e=>{const c=e.detail;const box=$('.v-shipmsgs'),fill=$('.v-shipfill');if(!c||!c.item_count){fill.style.width='0';if(!box.dataset.base){return}return}
  const t=c.total_price;let msg,pct;
  if(t>=PKG.free){msg='<b>Free shipping unlocked</b> on everything in your cart';pct=1}
  else if(t>=ENV.free){msg=`<b>Free card shipping unlocked.</b> ${money(PKG.free-t)} more for free tracked shipping`;pct=t/PKG.free}
  else{msg=`<b>${money(ENV.free-t)} away</b> from free card shipping`;pct=t/ENV.free}
  clearInterval(tm);box.innerHTML=`<span class="on">${msg}</span>`;fill.style.width=(pct*100)+'%';$('.v-shipbar').classList.toggle('won',pct>=1)})}

/* ---------- 2. shipping line under every price ---------- */
function shipText(p){const k=isEnv(p.ty)?ENV:PKG;if(p.p>=k.free)return'<em class="free">Free shipping</em>';return `+${money(k.rate)} ${k.label} shipping`}
function tagCards(){const m=byHandle();$$('.v-card').forEach(c=>{if(c.querySelector('.v-card-ship'))return;const a=c.querySelector('a[href*="/products/"]');if(!a)return;const h=a.getAttribute('href').split('/products/')[1].split(/[?#]/)[0];const p=m[h];if(!p)return;
 const pr=c.querySelector('.v-card-p');pr&&pr.insertAdjacentHTML('afterend',`<span class="v-card-ship">${shipText(p)}</span>`)})}
function tagPdp(){const pr=$('#vPrice');if(!pr)return;const h=location.pathname.split('/products/')[1];const p=h&&byHandle()[h.split(/[?#/]/)[0]];if(!p)return;const k=isEnv(p.ty)?ENV:PKG;
 pr.insertAdjacentHTML('afterend','<div class="v-pdp-ship" id="vPdpShip"></div>');const box=$('#vPdpShip');
 const upd=()=>{const c=Math.round(parseFloat(pr.textContent.replace(/[^0-9.]/g,''))*100)||0;box.innerHTML=c>=k.free?`<svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/></svg><span><b>Free shipping</b> on this one. Ships next business day.</span>`:`<svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/></svg><span><b>+${money(k.rate)} ${k.label} shipping</b>, or free on orders over ${money(k.free).replace('.00','')}.</span>`};
 upd();new MutationObserver(upd).observe(pr,{childList:true,characterData:true,subtree:true})}

/* ---------- 3. rip a pack: pulls a random in-stock item ---------- */
function packSection(){const doors=$('.v-doors');if(!doors||$('.vp-sec'))return;const sec=doors.closest('section');
 sec.insertAdjacentHTML('afterend',`<section class="v-sec vp-sec"><div class="v-wrap vp-grid">
 <div class="vp-copy"><h2 class="v-h2">Rip a pack</h2><p class="v-lead">Every pack pulls one random item that's in stock right now: a card, a slab, gear, anything. Keep it or rip another.</p>
 <div class="vp-odds"><span><i class="c"></i>Common</span><span><i class="r"></i>Rare $10+</span><span><i class="h"></i>Hit $25+</span></div>
 <div class="vp-result" id="vpRes" hidden><small id="vpK"></small><b id="vpT"></b><div class="vp-row"><span id="vpP"></span><span class="v-card-ship" id="vpS"></span></div>
 <div class="vp-btns"><button class="v-btn" id="vpAdd">Add to cart</button><a class="v-btn v-btn--ghost" id="vpOpen" href="#">Look closer</a></div></div></div>
 <div class="vp-stage" id="vpStage"><div class="vp-glow"></div>
  <div class="vp-card" id="vpCard"><div class="vp-in"><div class="vp-back"></div><div class="vp-front"><img id="vpImg" alt=""><span class="v-card-shine"></span></div></div></div>
  <div class="vp-pack" id="vpPack"><div class="vp-top"><span>TEAR HERE</span></div><div class="vp-body"><div class="vp-logo"></div><b>COALITION</b><small>VAULT PACK · 1 ITEM</small><i class="vp-foil"></i></div></div>
  <div class="vp-tear" id="vpTear" aria-hidden="true"><i></i></div>
  <button class="v-btn vp-rip" id="vpRip">Rip it open</button>
  <div class="vp-burst" id="vpBurst"></div>
 </div></div></section>`);
 const st=$('#vpStage'),pack=$('#vpPack'),card=$('#vpCard'),rip=$('#vpRip'),res=$('#vpRes');let busy=false,cur=null;
 const pick=async()=>{const cat=(await catalog()).filter(p=>p.a&&p.i&&p.v&&p.p>=100);if(!cat.length)return null;
  // slight boost so hits show up now and then
  const r=Math.random();let pool=cat;if(r<.12)pool=cat.filter(p=>p.p>=2500);else if(r<.35)pool=cat.filter(p=>p.p>=1000);if(!pool.length)pool=cat;return pool[(Math.random()*pool.length)|0]};
 async function open(){if(busy)return;busy=true;res.hidden=true;
  if(st.classList.contains('opened')){st.classList.remove('opened','hit','rare');st.classList.add('reset');await new Promise(r=>setTimeout(r,380));st.classList.remove('reset')}
  cur=await pick();if(!cur){busy=false;return}
  const im=$('#vpImg');im.src=img(cur.i,700);await new Promise(r=>{if(im.complete)r();else{im.onload=r;im.onerror=r;setTimeout(r,1500)}});
  st.classList.add('shake');await new Promise(r=>setTimeout(r,520));st.classList.remove('shake');
  const tier=cur.p>=2500?'hit':cur.p>=1000?'rare':'';st.classList.add('opened');tier&&st.classList.add(tier);
  setTimeout(()=>{const r=card.getBoundingClientRect();window.vSparks&&vSparks(r.left+r.width/2,r.top+r.height*.4,tier==='hit'?70:tier==='rare'?40:22);if(tier==='hit'&&window.vSparks)setTimeout(()=>vSparks(r.left+r.width/2,r.top+r.height*.2,50),250)},900);
  setTimeout(()=>{$('#vpK').textContent=tier==='hit'?'Hit pulled':tier==='rare'?'Rare pull':'You pulled';$('#vpT').textContent=cur.t;$('#vpP').textContent=money(cur.p);$('#vpS').innerHTML=shipText(cur);$('#vpOpen').href='/products/'+cur.h;
   $('#vpAdd').textContent=cur.n>1?'Choose and add':'Add to cart';res.hidden=false;rip.textContent='Rip another';busy=false},1350)}
 rip.addEventListener('click',open);pack.addEventListener('click',()=>{if(!st.classList.contains('opened'))open()});
 // swipe across the pack to tear it
 let sx=null;st.addEventListener('touchstart',e=>{sx=e.touches[0].clientX},{passive:true});st.addEventListener('touchend',e=>{if(sx===null)return;const dx=e.changedTouches[0].clientX-sx;sx=null;if(Math.abs(dx)>50&&!st.classList.contains('opened'))open()});
 let mx=null;st.addEventListener('mousedown',e=>{mx=e.clientX});addEventListener('mouseup',e=>{if(mx===null)return;const dx=e.clientX-mx;mx=null;if(Math.abs(dx)>60&&!st.classList.contains('opened'))open()});
 card.addEventListener('click',()=>{if(cur&&st.classList.contains('opened'))location.href='/products/'+cur.h});
 $('#vpAdd').addEventListener('click',e=>{if(!cur)return;if(cur.n>1){location.href='/products/'+cur.h;return}window.vCart&&vCart.add(cur.v,1,e.currentTarget,$('#vpImg'))});
}

/* ---------- 4. the vault wall: everything in stock, sliding on a tilted 3D plane ---------- */
async function wall(){const ft=$('.v-ft');if(!ft||$('.vw-sec'))return;const cat=(await catalog()).filter(p=>p.a&&p.i);if(cat.length<12)return;
 const sh=[...cat].sort(()=>Math.random()-.5);const rows=[0,1,2].map(r=>sh.filter((_,i)=>i%3===r).slice(0,22));
 const tile=p=>`<a href="/products/${p.h}" class="vw-t" aria-label="${p.t.replace(/"/g,'&quot;')}"><img src="${img(p.i,260)}" alt="" decoding="async"><span>${money(p.p)}</span></a>`;
 ft.insertAdjacentHTML('beforebegin',`<section class="vw-sec" aria-label="Everything in the vault"><div class="vw-plane">${rows.map((r,i)=>`<div class="vw-row ${i%2?'rev':''}" style="--d:${70+i*14}s"><div class="vw-track">${r.map(tile).join('')}${r.map(tile).join('')}</div></div>`).join('')}</div>
 <div class="vw-over"><h2 class="v-h2">${cat.length} items in the vault</h2><p>Cards, slabs, sealed, bow hunting gear, electronics and collectibles. New stuff lands every week.</p><a class="v-btn" href="/collections/all">Browse everything</a></div></section>`)}

/* ---------- 5. desktop: holo cursor glow + magnetic buttons ---------- */
function cursor(){if(!fine)return;const g=document.createElement('i');g.id='vfxcur';document.body.appendChild(g);let x=0,y=0,tx=0,ty=0;
 addEventListener('pointermove',e=>{tx=e.clientX;ty=e.clientY},{passive:true});(function f(){x+=(tx-x)*.18;y+=(ty-y)*.18;g.style.transform=`translate(${x}px,${y}px)`;requestAnimationFrame(f)})();
 document.addEventListener('pointermove',e=>{const b=e.target.closest&&e.target.closest('.v-btn,.v-rbtn,.v-door-go,.v-quick');$$('.vmag').forEach(m=>{if(m!==b){m.style.transform='';m.classList.remove('vmag')}});if(!b)return;const r=b.getBoundingClientRect();b.classList.add('vmag');b.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.18}px,${(e.clientY-r.top-r.height/2)*.25}px)`},{passive:true})}

/* ---------- 6. hero price ticks up like a slot when the ring turns ---------- */
function priceTick(){const el=$('#vNowP');if(!el)return;let last=0,lock=false;new MutationObserver(()=>{if(lock)return;const txt=el.textContent,to=Math.round(parseFloat(txt.replace(/[^0-9.]/g,''))*100)||0;if(!last){last=to;return}const from=last;last=to;const t0=performance.now();lock=true;
 (function s(n){const k=Math.min(1,(n-t0)/380),v=from+(to-from)*(1-Math.pow(1-k,3));el.textContent=money(Math.round(v));if(k<1)requestAnimationFrame(s);else{el.textContent=money(to);lock=false}})(t0)}).observe(el,{childList:true})}

async function start(){shipBar();packSection();cursor();priceTick();window.vCart&&vCart.render();
 await catalog();tagCards();tagPdp();wall();
 let tq=0;new MutationObserver(()=>{if(!tq)tq=requestAnimationFrame(()=>{tq=0;tagCards()})}).observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
