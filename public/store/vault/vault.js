/* Coalition Vault — storefront behaviour */
(()=>{
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;
const money=c=>'$'+(c/100).toFixed(2);

/* ---------- header ---------- */
const hd=$('.v-hd');
const solid=()=>hd&&hd.classList.toggle('is-solid',scrollY>30||!document.body.classList.contains('has-hero'));
addEventListener('scroll',solid,{passive:true});solid();

/* ---------- overlays ---------- */
function toggle(el,on){if(!el)return;el.classList.toggle('on',on);document.documentElement.style.overflow=on?'hidden':''}
$$('[data-open]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();const t=$(b.dataset.open);toggle(t,true);if(t.id==='vSearch')setTimeout(()=>$('input',t).focus(),60);if(t.id==='vDrawer'){toggle($('#vScrim'),true);Cart.render()}}));
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>{const t=b.closest('.v-sheet,.v-search,.v-drawer,.v-qv,.v-zoom');toggle(t,false);if(t.classList.contains('v-drawer'))toggle($('#vScrim'),false)}));
$('#vScrim')?.addEventListener('click',()=>{toggle($('#vDrawer'),false);toggle($('#vScrim'),false)});
addEventListener('keydown',e=>{if(e.key==='Escape'){$$('.v-sheet.on,.v-search.on,.v-drawer.on,.v-qv.on,.v-zoom.on,.v-scrim.on').forEach(x=>toggle(x,false))}});

/* ---------- toast ---------- */
let tt;function toast(msg){let t=$('.v-toast');if(!t){t=document.createElement('div');t.className='v-toast';t.setAttribute('role','status');document.body.appendChild(t)}t.textContent=msg;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),2600)}
window.vToast=toast;

/* ---------- search ---------- */
const sIn=$('#vSearch input'),sRes=$('#vSearchRes');
let st;sIn?.addEventListener('input',()=>{clearTimeout(st);st=setTimeout(async()=>{const q=sIn.value.trim();if(q.length<2){sRes.innerHTML='';return}
 let items=[];
 if(window.VAULT_MOCK){const ql=q.toLowerCase();items=window.VAULT_MOCK.all.filter(p=>p.t.toLowerCase().includes(ql)).slice(0,12).map(p=>({url:'product-'+p.h+'.html',title:p.t,price:p.p*100,image:p.i}))}
 else{try{const r=await fetch('/search/suggest.json?q='+encodeURIComponent(q)+'&resources[type]=product&resources[limit]=10');const j=await r.json();items=(j.resources.results.products||[]).map(p=>({url:p.url,title:p.title,price:Math.round(parseFloat(p.price)*100),image:p.image}))}catch(e){}}
 sRes.innerHTML=items.length?items.map(p=>`<article class="v-card"><a class="v-card-media" href="${p.url}"><img src="${p.image||''}" alt=""></a><div class="v-card-info"><span class="v-card-p">${money(p.price)}</span><a class="v-card-t" href="${p.url}">${p.title}</a></div></article>`).join(''):`<p class="v-search-hint">Nothing matches “${q.replace(/</g,'')}”. Try a set name or card number.</p>`;
},180)});

/* ---------- reveal ---------- */
if('IntersectionObserver' in window&&!RM){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -8% 0px'});$$('.rv').forEach(el=>io.observe(el))}else $$('.rv').forEach(el=>el.classList.add('in'));

/* ---------- card shine / tilt (mouse only) ---------- */
if(fine)$$('.v-card-media,.v-main').forEach(m=>{
 m.addEventListener('pointermove',e=>{const r=m.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;m.style.setProperty('--mx',x*100+'%');m.style.setProperty('--my',y*100+'%');m.style.setProperty('--sx',(100-x*100)+'%');
  const tgt=m.classList.contains('v-main')?$('.v-main-in',m):m;tgt.style.transform=`perspective(900px) rotateY(${(x-.5)*14}deg) rotateX(${(.5-y)*14}deg)`});
 m.addEventListener('pointerleave',()=>{const tgt=m.classList.contains('v-main')?$('.v-main-in',m):m;tgt.style.transform=''});
});

/* ---------- THE RING ---------- */
const stage=$('.v-ring-stage');
if(stage){
 const ring=$('.v-ring',stage),cards=$$('.v-rc',ring),N=cards.length,step=360/N;
 const nowT=$('#vNowT'),nowP=$('#vNowP'),nowK=$('#vNowK'),open=$('#vNowGo'),dots=$('.v-dots'),hint=$('.v-hint');
 dots.innerHTML=cards.map(()=>'<i></i>').join('');const dotEls=$$('i',dots);
 let rot=0,vel=0,target=null,drag=false,lastX=0,lastT=0,startX=0,startY=0,lock=null,moved=0,idleAt=performance.now(),front=-1;
 const R=()=>{const cw=$('.v-ring-pivot').offsetWidth;return Math.round(cw/2/Math.tan(Math.PI/N)*1.18)};
 const place=()=>{const r=R();cards.forEach((c,i)=>{c.style.setProperty('--a',i*step+'deg');c.style.setProperty('--R',r+'px')});ring.style.transform=`translateZ(${-r}px) rotateY(${rot}deg)`};
 const norm=a=>((a%360)+540)%360-180;
 function paint(){
  const r=R();ring.style.transform=`translateZ(${-r}px) rotateY(${rot}deg)`;
  let best=0,bd=999;
  cards.forEach((c,i)=>{const rel=norm(i*step+rot),k=(1-Math.cos(rel*Math.PI/180))/2;c.style.setProperty('--k',k.toFixed(3));c.style.visibility=k>.92?'hidden':'';c.style.setProperty('--sx',(50+rel*1.6)+'%');if(Math.abs(rel)<bd){bd=Math.abs(rel);best=i}});
  if(best!==front){front=best;cards.forEach((c,i)=>c.classList.toggle('front',i===best));dotEls.forEach((d,i)=>d.classList.toggle('on',i===best));const c=cards[best];nowT.textContent=c.dataset.t;nowP.textContent=c.dataset.p;nowK.textContent=c.dataset.k;open.href=c.dataset.u}
 }
 const snapTo=i=>{target=-i*step;const d=norm(target-rot);target=rot+d};
 function tick(t){
  if(!drag){
   if(target!==null){const d=target-rot;rot+=d*.14;if(Math.abs(d)<.05){rot=target;target=null}}
   else if(Math.abs(vel)>.02){rot+=vel;vel*=.94;if(Math.abs(vel)<.25){vel=0;snapTo(Math.round(-rot/step))}}
   else if(!RM&&t-idleAt>4000){rot-=.06}
  }
  paint();requestAnimationFrame(tick)
 }
 place();requestAnimationFrame(tick);addEventListener('resize',place);
 const sens=()=>step/($('.v-ring-pivot').offsetWidth*.9);
 const down=(x,y)=>{drag=true;lock=null;moved=0;startX=lastX=x;startY=y;lastT=performance.now();vel=0;target=null;stage.classList.add('dragging');hint&&hint.classList.add('gone')};
 const move=(x,y,ev)=>{if(!drag)return;const dx=x-startX,dy=y-startY;
  if(lock===null&&(Math.abs(dx)>6||Math.abs(dy)>6))lock=Math.abs(dx)>Math.abs(dy)?'x':'y';
  if(lock==='y'){drag=false;stage.classList.remove('dragging');return}
  if(lock==='x'){ev&&ev.cancelable&&ev.preventDefault();const now=performance.now(),d=x-lastX;rot+=d*sens();vel=d*sens()/Math.max(1,now-lastT)*16;lastX=x;lastT=now;moved+=Math.abs(d)}};
 const up=()=>{if(!drag)return;drag=false;stage.classList.remove('dragging');idleAt=performance.now();if(Math.abs(vel)<.25)snapTo(Math.round(-rot/step))};
 // touch (iOS-safe): non-passive move so horizontal swipes never scroll the page
 stage.addEventListener('touchstart',e=>{const t=e.touches[0];down(t.clientX,t.clientY)},{passive:true});
 stage.addEventListener('touchmove',e=>{const t=e.touches[0];move(t.clientX,t.clientY,e)},{passive:false});
 stage.addEventListener('touchend',up);stage.addEventListener('touchcancel',up);
 // mouse
 stage.addEventListener('mousedown',e=>{if(e.button)return;e.preventDefault();down(e.clientX,e.clientY);const mm=ev=>move(ev.clientX,ev.clientY,ev),mu=()=>{up();removeEventListener('mousemove',mm);removeEventListener('mouseup',mu)};addEventListener('mousemove',mm);addEventListener('mouseup',mu)});
 stage.addEventListener('wheel',e=>{if(Math.abs(e.deltaX)>Math.abs(e.deltaY)){e.preventDefault();rot-=e.deltaX*.12;vel=0;target=null;idleAt=performance.now();clearTimeout(stage._w);stage._w=setTimeout(()=>snapTo(Math.round(-rot/step)),140)}},{passive:false});
 // tap: hit-test by geometry (3D hit-testing is unreliable across browsers)
 cards.forEach(c=>{$$('img',c).forEach(im=>{im.draggable=false});c.addEventListener('click',e=>e.preventDefault())});
 stage.addEventListener('click',e=>{if(moved>8){moved=0;return}const fr=$('.v-rc-f',cards[front]).getBoundingClientRect();
  if(e.clientX>=fr.left&&e.clientX<=fr.right&&e.clientY>=fr.top&&e.clientY<=fr.bottom){location.href=cards[front].dataset.u;return}
  if(e.clientY<fr.top-40||e.clientY>fr.bottom+40)return;snapTo(front+(e.clientX<fr.left?-1:1));idleAt=performance.now()});
 $('#vPrev').addEventListener('click',()=>{snapTo(front-1);idleAt=performance.now();hint&&hint.classList.add('gone')});
 $('#vNext').addEventListener('click',()=>{snapTo(front+1);idleAt=performance.now();hint&&hint.classList.add('gone')});
 stage.tabIndex=0;stage.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){snapTo(front-1);idleAt=performance.now()}if(e.key==='ArrowRight'){snapTo(front+1);idleAt=performance.now()}if(e.key==='Enter')location.href=cards[front].dataset.u});
 window.vRing={get rot(){return rot},get front(){return front}};
}

/* ---------- rails ---------- */
$$('.v-rail').forEach(rl=>{const tr=$('.v-rail-track',rl),bar=$('.v-rail-prog i',rl);
 const prog=()=>{const max=tr.scrollWidth-tr.clientWidth;const w=tr.clientWidth/tr.scrollWidth;if(bar){bar.style.width=(w*100)+'%';bar.style.transform=`translateX(${max?tr.scrollLeft/max*(1/w-1)*100:0}%)`}};
 tr.addEventListener('scroll',prog,{passive:true});addEventListener('resize',prog);prog();
 const sec=rl.closest('section');$$('[data-rail]',sec).forEach(b=>b.addEventListener('click',()=>tr.scrollBy({left:(b.dataset.rail==='next'?1:-1)*tr.clientWidth*.85,behavior:'smooth'})));
 if(fine){let dn=false,sx=0,sl=0,mv=0;tr.addEventListener('mousedown',e=>{dn=true;mv=0;sx=e.clientX;sl=tr.scrollLeft;tr.classList.add('dragging')});
  addEventListener('mousemove',e=>{if(!dn)return;mv=Math.abs(e.clientX-sx);tr.scrollLeft=sl-(e.clientX-sx)});
  addEventListener('mouseup',()=>{if(!dn)return;dn=false;tr.classList.remove('dragging')});
  tr.addEventListener('click',e=>{if(mv>6){e.preventDefault();e.stopPropagation();mv=0}},true);$$('img',tr).forEach(i=>i.draggable=false)}
});

/* ---------- graded spotlight ---------- */
const spot=$('.v-spot');if(spot){const links=$$('.v-spot-list a',spot),img=$('.v-slab img',spot);let i=0,tm;
 const show=n=>{i=n;links.forEach((l,j)=>l.classList.toggle('on',j===n));img.style.opacity=0;setTimeout(()=>{img.src=links[n].dataset.img;img.style.opacity=1},200)};
 img.style.transition='opacity .25s';links.forEach((l,j)=>l.addEventListener('mouseenter',()=>{clearInterval(tm);show(j)}));
 if(links.length>1&&!RM)tm=setInterval(()=>show((i+1)%links.length),3800);show(0)}

/* ---------- cart (Shopify AJAX, or mock in prototype) ---------- */
const FREE_ENV=2500,FREE_PKG=7500;
const Mock={k:'vaultMockCart',get(){try{return JSON.parse(sessionStorage.getItem(this.k))||{items:[]}}catch(e){return{items:[]}}},set(c){try{sessionStorage.setItem(this.k,JSON.stringify(c))}catch(e){}}};
const api={
 async get(){if(window.VAULT_MOCK){const c=Mock.get();c.item_count=c.items.reduce((a,b)=>a+b.quantity,0);c.total_price=c.items.reduce((a,b)=>a+b.quantity*b.price,0);return c}return (await fetch('/cart.js')).json()},
 async add(id,q=1){if(window.VAULT_MOCK){const v=window.VAULT_MOCK.vars[id];const c=Mock.get();const ex=c.items.find(x=>x.key==id);if(ex)ex.quantity+=q;else c.items.push({key:String(id),id,quantity:q,price:Math.round(v.p*100),final_line_price:0,product_title:v.pt,variant_title:v.t==='Default Title'?null:v.t,image:v.img,url:'product-'+v.h+'.html'});Mock.set(c);return true}
  const r=await fetch('/cart/add.js',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({items:[{id,quantity:q}]})});if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.description||'Could not add that card.')}return true},
 async change(key,q){if(window.VAULT_MOCK){const c=Mock.get();const it=c.items.find(x=>x.key==key);if(it)it.quantity=q;c.items=c.items.filter(x=>x.quantity>0);Mock.set(c);return}
  const r=await fetch('/cart/change.js',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({id:key,quantity:q})});if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.description||'That’s all we have in stock.')}}
};
const Cart={
 async render(){const c=await api.get();$$('[data-cart-count]').forEach(e=>{e.textContent=c.item_count;e.hidden=!c.item_count});
  const list=$('#vDrList');if(!list)return;const tot=c.total_price;
  const env=Math.min(1,tot/FREE_ENV),pkg=Math.min(1,tot/FREE_PKG);
  $('#vDrShip').innerHTML=`<div class="v-meter"><span>${tot>=FREE_ENV?'<b>Free envelope shipping unlocked.</b>':`Add <b>${money(FREE_ENV-tot)}</b> for free envelope shipping`}</span><div class="v-meter-bar"><i style="width:${env*100}%"></i></div></div><div class="v-meter"><span>${tot>=FREE_PKG?'<b>Free tracked package unlocked.</b>':`Add <b>${money(FREE_PKG-tot)}</b> for a free tracked package`}</span><div class="v-meter-bar"><i style="width:${pkg*100}%"></i></div></div>`;
  if(!c.items.length){list.innerHTML=`<div class="v-empty"><p>Your cart is empty.</p><a class="v-btn" href="${window.VAULT_MOCK?'collection-pokemon-singles.html':'/collections/all'}">Browse cards</a></div>`;$('#vDrFoot').hidden=true;return}
  $('#vDrFoot').hidden=false;$('#vDrTot').textContent=money(tot);
  list.innerHTML=c.items.map(it=>`<div class="v-li"><a href="${it.url}"><img src="${it.image||''}" alt=""></a><div><a class="v-li-t" href="${it.url}">${it.product_title}</a>${it.variant_title?`<div class="v-li-v">${it.variant_title}</div>`:''}<div class="v-li-q"><button data-q="${it.key}|${it.quantity-1}" aria-label="One less">−</button><span>${it.quantity}</span><button data-q="${it.key}|${it.quantity+1}" aria-label="One more">+</button></div></div><div><div class="v-li-p">${money(it.price*it.quantity)}</div><button class="v-li-x" data-q="${it.key}|0">Remove</button></div></div>`).join('');
  $$('[data-q]',list).forEach(b=>b.addEventListener('click',async()=>{const[k,q]=b.dataset.q.split('|');try{await api.change(k,+q)}catch(e){toast(e.message)}Cart.render()}));
 },
 async add(id,q,btn){btn&&(btn.disabled=true);try{await api.add(+id,q||1);await Cart.render();toggle($('#vDrawer'),true);toggle($('#vScrim'),true)}catch(e){toast(e.message)}btn&&(btn.disabled=false)}
};
window.vCart=Cart;Cart.render();
document.addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(!b)return;e.preventDefault();Cart.add(b.dataset.add,1,b)});

/* ---------- product page ---------- */
const pdp=$('.v-pdp');if(pdp&&$('#vAdd')){
 const main=$('.v-main img',pdp),thumbs=$$('.v-thumbs button',pdp),opts=$$('.v-opt',pdp),price=$('#vPrice'),addB=$('#vAdd'),idIn=$('#vVarId'),qty=$('#vQty'),selT=$('#vSel');
 const setImg=src=>{main.style.opacity=.2;setTimeout(()=>{main.src=src;main.style.opacity=1},140)};main.style.transition='opacity .2s';
 thumbs.forEach(t=>t.addEventListener('click',()=>{thumbs.forEach(x=>x.classList.toggle('on',x===t));setImg(t.dataset.src)}));
 // swipe main image on touch
 if(thumbs.length>1){let sx=null;const m=$('.v-main',pdp);m.addEventListener('touchstart',e=>{sx=e.touches[0].clientX},{passive:true});m.addEventListener('touchend',e=>{if(sx===null)return;const dx=e.changedTouches[0].clientX-sx;sx=null;if(Math.abs(dx)<40)return;const cur=thumbs.findIndex(x=>x.classList.contains('on'));const n=(cur+(dx<0?1:-1)+thumbs.length)%thumbs.length;thumbs[n].click()})}
 $('.v-main',pdp).addEventListener('click',()=>{const z=$('.v-zoom');$('img',z).src=main.src;toggle(z,true)});$('.v-zoom')?.addEventListener('click',e=>toggle(e.currentTarget,false));
 opts.forEach(o=>o.addEventListener('click',()=>{if(o.classList.contains('out'))return;opts.forEach(x=>x.classList.toggle('on',x===o));idIn.value=o.dataset.id;price.textContent=o.dataset.p;selT&&(selT.textContent=o.dataset.t);if(o.dataset.img)setImg(o.dataset.img);
  if(!window.VAULT_MOCK){const u=new URL(location.href);u.searchParams.set('variant',o.dataset.id);history.replaceState(null,'',u)}}));
 const ps=$('#vPickS');ps?.addEventListener('input',()=>{const q=ps.value.toLowerCase();opts.forEach(o=>o.hidden=!o.dataset.t.toLowerCase().includes(q))});
 $$('[data-qty]',pdp).forEach(b=>b.addEventListener('click',()=>{qty.value=Math.max(1,(+qty.value||1)+(+b.dataset.qty))}));
 addB?.addEventListener('click',e=>{e.preventDefault();Cart.add(idIn.value,+qty.value||1,addB)});
}

/* ---------- collection sort + load more ---------- */
const sortSel=$('#vSort');sortSel?.addEventListener('change',()=>{if(window.VAULT_MOCK){window.vMockSort&&window.vMockSort(sortSel.value);return}const u=new URL(location.href);u.searchParams.set('sort_by',sortSel.value);u.searchParams.delete('page');location.href=u});
const more=$('#vMore');more?.addEventListener('click',async e=>{e.preventDefault();more.disabled=true;more.textContent='Loading…';try{const h=await (await fetch(more.dataset.next)).text();const d=new DOMParser().parseFromString(h,'text/html');$$('.v-grid > *',d).forEach(n=>$('.v-grid').appendChild(n));const nm=$('#vMore',d);if(nm){more.dataset.next=nm.dataset.next;more.disabled=false;more.textContent='Show more'}else more.parentElement.remove()}catch(err){more.disabled=false;more.textContent='Show more'}});
})();
