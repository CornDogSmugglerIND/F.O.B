/* Coalition Vault FX 4 — tactical optics layer, in Coalition colors */
(()=>{
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const ticks=(n,r1,r2,cx=100,cy=100,skip=[])=>{let d='';for(let i=0;i<n;i++){if(skip.includes(i))continue;const a=i/n*Math.PI*2,l=i%5===0?r2-4:r2;d+=`M${(cx+Math.cos(a)*r1).toFixed(1)} ${(cy+Math.sin(a)*r1).toFixed(1)}L${(cx+Math.cos(a)*l).toFixed(1)} ${(cy+Math.sin(a)*l).toFixed(1)}`}return d};
const arc=(r,a0,a1,cx=100,cy=100)=>{const p=a=>[(cx+Math.cos(a*Math.PI/180)*r).toFixed(1),(cy+Math.sin(a*Math.PI/180)*r).toFixed(1)];const[s0,s1]=p(a0),[e0,e1]=p(a1);return `M${s0} ${s1}A${r} ${r} 0 ${a1-a0>180?1:0} 1 ${e0} ${e1}`};
const optic=()=>`<svg viewBox="0 0 200 200" class="tac-svg" aria-hidden="true">
 <g class="tac-spin"><path d="${arc(96,200,250)}"/><path d="${arc(96,290,340)}"/><path d="${arc(96,20,70)}"/><path d="${arc(96,110,160)}"/></g>
 <g class="tac-spin2"><path class="t" d="${ticks(72,88,92)}"/></g>
 <path class="thin" d="${arc(80,-30,30)}"/><path class="thin" d="${arc(80,150,210)}"/>
 <path class="hair" d="M100 2V18M100 182V198M2 100H18M182 100H198"/>
</svg>`;

/* parse what a buyer actually checks: number, grade or condition */
function facts(t){const f=[];const num=t.match(/\b\d{1,3}\/\d{1,3}\b/);num&&f.push(['No.',num[0]]);
 const g=t.match(/\b(PSA|BGS|CGC|SGC)\s?(\d{1,2}(\.\d)?)/i);if(g)f.push(['Grade',g[1].toUpperCase()+' '+g[2]]);
 else{const c=t.match(/\b(Near Mint|NM|LP|MP|HP|Mint|New|Used|Sealed)\b/i);c&&f.push(['Cond.',c[1].replace(/near mint/i,'NM')])}
 return f}

/* 1. hero: optic tracks the front item */
function heroOptic(){const st=$('.v-ring-stage');if(!st||$('.tac-hero',st))return;
 const o=document.createElement('div');o.className='tac-hero';o.innerHTML=optic()+'<div class="tac-read l"><i id="tacIdx"></i><b id="tacGame"></b></div><div class="tac-read r"><i>Price</i><b id="tacPrice"></b></div>';st.appendChild(o);
 const piv=$('.v-ring-pivot',st);const pos=()=>{const r=piv.getBoundingClientRect(),s=st.getBoundingClientRect();o.style.left=(r.left-s.left+r.width/2)+'px';o.style.top=(r.top-s.top+r.height/2)+'px';o.style.setProperty('--sz',(r.height*1.12)+'px')};pos();addEventListener('resize',pos);
 let lf=-1;setInterval(()=>{if(!window.vRing)return;const f=vRing.front,n=$$('.v-rc',st).length;if(f===lf)return;lf=f;
  $('#tacIdx').textContent=String(f+1).padStart(2,'0')+' / '+String(n).padStart(2,'0');$('#tacGame').textContent=($('#vNowK')||{}).textContent||'';$('#tacPrice').textContent=($('#vNowP')||{}).textContent||'';
  o.classList.remove('acq');void o.offsetWidth;o.classList.add('acq')},140)}

/* 2. product photo: optic + readouts, brightens while you handle it */
function pdpOptic(){const m=$('.v-main');if(!m||$('.tac-pdp',m))return;const t=($('.v-buy h1')||{}).textContent||'';
 const fx=facts(t),price=($('#vPrice')||{}).textContent||'';
 const o=document.createElement('div');o.className='tac-pdp';o.innerHTML=optic()+
  `<div class="tac-corner tl"></div><div class="tac-corner tr"></div><div class="tac-corner bl"></div><div class="tac-corner br"></div>
   <div class="tac-ruler"></div>
   <div class="tac-data">${fx.map(([k,v])=>`<span><i>${k}</i><b>${v}</b></span>`).join('')}<span><i>Price</i><b id="tacPdpP">${price}</b></span></div>`;
 m.appendChild(o);const pp=$('#vPrice');pp&&new MutationObserver(()=>{$('#tacPdpP').textContent=pp.textContent}).observe(pp,{childList:true,characterData:true,subtree:true})}

/* 3. film grain + lens vignette so everything sits in the same air */
function grain(){if($('#tacGrain'))return;const g=document.createElement('i');g.id='tacGrain';g.setAttribute('aria-hidden','true');document.body.appendChild(g)}

function start(){grain();heroOptic();pdpOptic()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
