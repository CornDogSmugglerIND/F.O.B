import sys
PAL={
 "E":dict(name="Logo",bg="#1D1D1B",bg2="#0a2a1c",panel="rgba(0,34,22,.78)",line="rgba(179,251,213,.55)",acc="#50B97E",acc2="#B3FBD5",ink="#C9F7DE",mute="#86C4A4",glow="144,255,204"),
 "D":dict(name="Restrained",bg="#1E2124",bg2="#272B2F",panel="rgba(255,255,255,.055)",line="rgba(255,255,255,.12)",acc="#7FD1AE",acc2="#C9E9DB",ink="#E3E6E4",mute="#8E979A",glow="127,209,174"),
 "C":dict(name="Brand Smoke",bg="#171B19",bg2="#1F2824",panel="rgba(30,44,38,.66)",line="rgba(144,255,204,.30)",acc="#50B97E",acc2="#B3FBD5",ink="#D3F5E2",mute="#8FB5A2",glow="80,185,126"),
 "A":dict(name="Steel Teal",bg="#1B2229",bg2="#232C34",panel="rgba(38,50,60,.62)",line="rgba(122,170,180,.28)",acc="#5FA3AE",acc2="#8CC3CC",ink="#D5DEE3",mute="#92A3AD",glow="95,163,174"),
 "B":dict(name="Plum Slate",bg="#221B28",bg2="#2C2434",panel="rgba(58,46,70,.62)",line="rgba(176,150,208,.28)",acc="#A58CCF",acc2="#C4B0E6",ink="#E0D9E8",mute="#A398B3",glow="165,140,207"),
}
SMOKE='''<svg style="position:absolute;inset:0;width:1440px;height:900px" viewBox="0 0 1440 900"><defs>
<filter id="sg" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.0065 0.011" numOctaves="5" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 0.31  0 0 0 0 0.73  0 0 0 0 0.49  0 0 0 2.4 -0.95"/><feGaussianBlur stdDeviation="3"/></filter>
<filter id="so" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.012" numOctaves="5" seed="23"/><feColorMatrix type="matrix" values="0 0 0 0 0.88  0 0 0 0 0.54  0 0 0 0 0.23  0 0 0 2.4 -0.98"/><feGaussianBlur stdDeviation="3"/></filter>
<linearGradient id="mL" x1="0" x2="1"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#000"/></linearGradient>
<linearGradient id="mR" x1="0" x2="1"><stop offset=".55" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
<mask id="mkL"><rect width="1440" height="900" fill="url(#mL)"/></mask><mask id="mkR"><rect width="1440" height="900" fill="url(#mR)"/></mask></defs>
<g mask="url(#mkL)"><rect width="1440" height="900" filter="url(#sg)" opacity=".85"/></g><g mask="url(#mkR)"><rect width="1440" height="900" filter="url(#so)" opacity=".85"/></g></svg>'''
CSS="""
*{box-sizing:border-box;margin:0}
body{width:1440px;height:900px;overflow:hidden;font-family:'Rajdhani','Segoe UI','DejaVu Sans',system-ui,sans-serif;color:var(--ink);background:radial-gradient(1200px 700px at 70% 30%,var(--bg2),var(--bg));position:relative}
.smoke{position:absolute;inset:0;pointer-events:none;background:radial-gradient(520px 420px at 12% 78%,rgba(80,185,126,.28),transparent 70%),radial-gradient(560px 460px at 92% 62%,rgba(224,138,60,.26),transparent 70%),radial-gradient(420px 300px at 60% 10%,rgba(144,255,238,.10),transparent 70%);filter:blur(10px)}
.logo{font-weight:700;font-size:22px;letter-spacing:.02em;color:var(--acc2);text-shadow:0 0 14px rgba(144,255,204,.55)}.logo small{display:block;font-size:11px;color:var(--mute);letter-spacing:.14em;text-shadow:none}
body.C .panelx{}.C .strip,.C .nav,.C .tray,.C .half,.C .pill{box-shadow:0 0 0 1px rgba(255,255,255,.05) inset,0 1px 0 rgba(200,255,225,.25) inset,0 10px 30px rgba(0,0,0,.35)}
.C .ring.o{border-color:#E08A3C;box-shadow:0 0 34px rgba(224,138,60,.55);color:#FFD9B0}
.D .smoke{background:radial-gradient(700px 500px at 18% 85%,rgba(127,209,174,.10),transparent 70%),radial-gradient(600px 500px at 95% 70%,rgba(224,138,60,.09),transparent 70%);filter:blur(24px)}
.D .grid-placeholder{}
body.E{background-color:#1D1D1B!important;background-image:none!important}
.E .smoke{background:none}.E .grid{display:none}
.E .nav,.E .strip,.E .tray,.E .half,.E .pill{background:linear-gradient(180deg,rgba(26,28,28,.88),rgba(10,12,11,.92));border:1px solid rgba(145,149,160,.55);box-shadow:0 0 0 1px rgba(0,0,0,.6),0 1px 0 rgba(255,255,255,.18) inset,0 -2px 0 rgba(144,255,204,.35) inset,0 14px 34px rgba(0,0,0,.55);backdrop-filter:blur(16px)}
.E .nav .on{background:rgba(144,255,204,.18);color:#B3FBD5;box-shadow:0 0 14px rgba(144,255,204,.4) inset}
.E .logo{font-size:24px;color:#B3FBD5;text-shadow:0 0 12px rgba(144,255,204,.9),0 0 28px rgba(80,185,126,.7)}
.E .big,.E h2,.E .lbl,.E .ring{color:#E4E9E6;text-shadow:none}
.E .ring{background:linear-gradient(180deg,#1b1d1d,#0a0c0b);border:1.5px solid rgba(179,251,213,.75);box-shadow:0 0 14px rgba(144,255,204,.35)}
.E .ring.o{border-color:#E8924A;box-shadow:0 0 24px rgba(232,146,74,.7);color:#FFD6AE;text-shadow:0 0 10px rgba(232,146,74,.6)}
.E .btn{background:linear-gradient(180deg,#26292a,#101212);border:1px solid rgba(179,251,213,.7);color:#E4E9E6;box-shadow:0 0 10px rgba(144,255,204,.25)}
.E .pill b,.E .chip.on{color:#B3FBD5}.E .chip{background:rgba(10,12,11,.75)}.E .chip.on{background:rgba(144,255,204,.2);border-color:#B3FBD5}
.E .card,.E .tc,.E .th div,.E .half .pic{background:linear-gradient(165deg,#34383a,#141616)!important;border:1px solid rgba(145,149,160,.6)}
.E .drop{border:2px dashed rgba(179,251,213,.8);background:rgba(10,12,11,.66);box-shadow:0 0 36px rgba(144,255,204,.35) inset,0 0 24px rgba(144,255,204,.3)}
.E .th div.sel{outline:2px solid #B3FBD5}.E .th div b{background:#B3FBD5}
.D .grid{opacity:.07}
.D .nav,.D .strip,.D .tray,.D .half,.D .pill{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10);box-shadow:0 1px 0 rgba(255,255,255,.07) inset,0 24px 50px rgba(0,0,0,.35)}
.D .nav .on{background:rgba(255,255,255,.09);color:var(--ink);box-shadow:none}
.D .nav .it i{border-width:1.5px;opacity:.6;border-radius:6px}
.D .big,.D h2,.D .lbl{font-weight:600;letter-spacing:-.01em}
.D .ring{background:rgba(255,255,255,.04);border:1.5px solid rgba(201,233,219,.55);box-shadow:0 0 0 6px rgba(127,209,174,.06);font-weight:600;color:var(--ink)}
.D .ring.xl{border-color:var(--acc);box-shadow:0 0 0 10px rgba(127,209,174,.07),0 0 60px rgba(127,209,174,.25)}
.D .ring.o{border-color:rgba(224,138,60,.8);box-shadow:0 0 0 6px rgba(224,138,60,.07);color:var(--ink)}
.D .btn{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.18);color:var(--ink);font-weight:600}
.D .card,.D .tc,.D .th div,.D .half .pic{background:linear-gradient(165deg,#3a4146,#23282c)!important;border:1px solid rgba(255,255,255,.14)}
.D .tc::after{background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.10) 50%,transparent 70%)}
.D .pill b,.D .chip.on{color:var(--acc2)}
.D .chip.on{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.25)}
.D .logo{color:var(--ink);text-shadow:none;font-weight:600}
.D .th div.sel{outline:2px solid var(--acc2)}.D .th div b{background:var(--acc2)}
.D .drop{border:1.5px dashed rgba(201,233,219,.45);background:rgba(255,255,255,.025);box-shadow:none}
.grid{position:absolute;inset:0;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:60px 60px;opacity:.18;mask-image:radial-gradient(circle at 60% 50%,#000,transparent 75%)}
.nav{position:absolute;left:20px;top:20px;bottom:20px;width:74px;border-radius:24px;background:var(--panel);border:1px solid var(--line);backdrop-filter:blur(14px);display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 0;z-index:5}
.nav .it{width:58px;padding:9px 0;border-radius:16px;text-align:center;font-size:11px;letter-spacing:.06em;color:var(--mute)}
.nav .it i{display:block;width:22px;height:22px;margin:0 auto 4px;border:2px solid currentColor;border-radius:7px;opacity:.8}
.nav .on{background:rgba(var(--glow),.18);color:var(--acc2);box-shadow:0 0 0 1px var(--line) inset}
.strip{position:absolute;left:116px;right:20px;top:20px;height:70px;border-radius:22px;background:var(--panel);border:1px solid var(--line);backdrop-filter:blur(14px);display:flex;align-items:center;padding:0 26px;gap:34px;z-index:5}
.strip .big{font-size:30px;font-weight:700;letter-spacing:.02em}
.strip small{display:block;font-size:12px;color:var(--mute);letter-spacing:.08em}
.btn{margin-left:auto;padding:12px 24px;border-radius:16px;background:rgba(var(--glow),.22);border:1px solid var(--acc);color:var(--acc2);font-weight:700;font-size:15px}
.route{position:absolute;inset:0}
.node{position:absolute;z-index:2;transform:translate(-50%,-50%);text-align:center}
.ring{width:78px;height:78px;border-radius:50%;border:2px solid var(--acc);background:radial-gradient(circle,rgba(var(--glow),.35),rgba(var(--glow),.05)),var(--bg);box-shadow:0 0 34px rgba(var(--glow),.55);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;margin:0 auto}
.ring.dim{border-color:var(--line);box-shadow:none;color:var(--mute)}
.ring.xl{width:128px;height:128px;font-size:50px}
.lbl{margin-top:10px;font-size:19px;font-weight:700}
.sub{font-size:13px;color:var(--mute);max-width:170px;margin:2px auto 0;line-height:1.2}
.card{position:absolute;width:92px;height:128px;border-radius:10px;border:1px solid var(--line);background:linear-gradient(160deg,var(--c1),var(--c2));box-shadow:0 12px 26px rgba(0,0,0,.4);transform:rotate(var(--r));display:flex;align-items:flex-end;padding:6px;font-size:11px;font-weight:700;color:#fff;text-shadow:0 1px 3px #0008}
.dock{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);display:flex;gap:12px;z-index:5}
.pill{padding:13px 22px;border-radius:999px;background:var(--panel);border:1px solid var(--line);backdrop-filter:blur(14px);font-size:16px;font-weight:600}
.pill b{color:var(--acc2);margin-right:8px;font-size:18px}
.hint{position:absolute;right:30px;bottom:34px;font-size:13px;color:var(--mute);z-index:5}
.main{position:absolute;left:116px;right:20px;top:110px;bottom:20px}
h2{font-size:26px;letter-spacing:.04em;margin-bottom:4px}
.chips{display:flex;gap:10px;margin:10px 0 22px}
.chip{padding:8px 18px;border-radius:999px;border:1px solid var(--line);font-size:14px;color:var(--mute)}
.chip.on{background:rgba(var(--glow),.2);border-color:var(--acc);color:var(--acc2)}
.shelf{display:flex;gap:22px;margin-bottom:34px;perspective:900px}
.tc{width:150px;height:226px;border-radius:14px;background:linear-gradient(160deg,var(--c1),var(--c2));border:1px solid var(--line);box-shadow:0 22px 34px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.04) inset;transform:rotateY(var(--ry)) rotateX(4deg);position:relative;overflow:hidden}
.tc::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.14) 50%,transparent 65%)}
.tc .t{position:absolute;left:0;right:0;bottom:0;padding:26px 10px 9px;background:linear-gradient(transparent,#000a);font-size:13px;font-weight:700;line-height:1.1;z-index:2}
.tc .t em{display:block;font-style:normal;color:var(--acc2);font-size:15px;margin-top:2px}
.tc.sealed{height:200px;border-radius:8px}
.half{position:absolute;right:0;top:0;bottom:0;width:360px;border-radius:26px;background:var(--panel);border:1px solid var(--line);backdrop-filter:blur(18px);padding:24px;z-index:4}
.half .pic{height:240px;border-radius:14px;background:linear-gradient(160deg,var(--c1),var(--c2));margin-bottom:16px}
.row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line);font-size:16px}
.row span:first-child{color:var(--mute)}
.drop{position:absolute;left:116px;right:20px;top:110px;height:420px;border-radius:30px;border:2px dashed var(--acc);background:radial-gradient(600px 300px at 50% 40%,rgba(var(--glow),.22),rgba(var(--glow),.04));display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 0 60px rgba(var(--glow),.22) inset}
.drop .a{font-size:38px;font-weight:700}.drop .b{color:var(--mute);font-size:18px;margin-top:8px}
.tray{position:absolute;left:116px;right:20px;top:550px;height:330px;border-radius:26px;background:var(--panel);border:1px solid var(--line);padding:22px}
.th{display:flex;gap:14px;margin:14px 0 18px}
.th div{width:96px;height:128px;border-radius:10px;background:linear-gradient(160deg,var(--c1),var(--c2));border:1px solid var(--line);position:relative}
.th div.sel{outline:3px solid var(--acc2)}
.th div b{position:absolute;right:6px;top:6px;width:22px;height:22px;border-radius:50%;background:var(--acc);color:#10161a;text-align:center;font-size:13px;line-height:22px}
"""
CARDS=[("#6f4a7a","#2c3b5a"),("#7a5a3a","#3b2c2c"),("#3f7a72","#223a4a"),("#7a3f4f","#2f2442"),("#8a5a6a","#3a2a3f"),("#3a5f7a","#262c4a")]
def cv(i):
    a,b=CARDS[i%len(CARDS)];return f"--c1:{a};--c2:{b}"
def shell(p,body,active):
    pp=p
    SM=SMOKE if p=='E' else ''
    P=PAL[p]
    vars_=f":root{{--bg:{P['bg']};--bg2:{P['bg2']};--panel:{P['panel']};--line:{P['line']};--acc:{P['acc']};--acc2:{P['acc2']};--ink:{P['ink']};--mute:{P['mute']};--glow:{P['glow']}}}"
    items=["Command","Scouter","Collection","Channels","Spaces","Settings"]
    nav="".join(f'<div class="it{" on" if n==active else ""}"><i></i>{n}</div>' for n in items)
    return f"<!doctype html><meta charset=utf-8><style>{vars_}{CSS}</style><body class='{pp}'>{SM}<div class=smoke></div><div class=grid></div><div class=nav>{nav}</div>{body}"
def command(p):
    pts=[(300,640),(560,330),(830,560),(1090,300),(1310,520)]
    path="M"+" L".join(f"{x},{y}" for x,y in pts)
    svg=f'<svg class=route viewBox="0 0 1440 900"><defs><linearGradient id=g x1=0 x2=1><stop offset=0 stop-color="var(--acc)"/><stop offset=.6 stop-color="var(--acc2)"/><stop offset=1 stop-color="#E08A3C"/></linearGradient><filter id=b><feGaussianBlur stdDeviation=9 /></filter></defs><path d="{path}" fill=none stroke="rgb(var(--glow))" stroke-width=10 opacity=.5 filter=url(#b) /><path d="{path}" fill=none stroke="url(#g)" stroke-width=3 stroke-linejoin=round /><path d="{path}" fill=none stroke="var(--acc2)" stroke-width=3 stroke-dasharray="2 18" stroke-linecap=round /></svg>'
    info=[("Photos in","3","not identified yet",False),("Ready to list","13","needs a listing built",False),("Live on eBay","166","","xl"),("Sold","1","needs packing",False),("Shipped","12","on the way",False)]
    nodes=""
    for (x,y),(l,n,s,xl) in zip(pts,info):
        cls="ring"+(" xl" if xl else "")+(" o" if l in ("Sold","Shipped") else "")+(" dim" if n=="0" else "")
        nodes+=f'<div class=node style="left:{x}px;top:{y}px;transform:translate(-50%,-{64 if xl else 39}px)"><div class="{cls}">{n}</div><div class=lbl>{l}</div><div class=sub>{s}</div></div>'
    cards=""
    for i,(x,y,r) in enumerate([(150,560,-8),(190,590,5),(400,170,-6),(455,210,7),(500,160,2)]):
        cards+=f'<div class=card style="left:{x}px;top:{y}px;--r:{r}deg;{cv(i)}">Card {i+1}</div>'
    body=f'''{svg}{cards}{nodes}
<div class=strip><div class=logo>CornDogSmuggler<small>COALITION</small></div><div><div class=big>$774.28</div><small>VALUE ON THE LINE</small></div><div><div class=big>16</div><small>TO WORK</small></div><div><div class=big>166</div><small>LIVE ON EBAY</small></div><div class=btn>Sync eBay</div></div>
<div class=dock><div class=pill><b>3</b>Identify new photos</div><div class=pill><b>13</b>Build and publish</div><div class=pill><b>1</b>Pack and ship</div></div>
<div class=hint>Tap a stop to open it · drag a card to move it</div>'''
    return shell(p,body,"Command")
def collection(p):
    sing=["Charizard ex 199/165","Pikachu VMAX","Umbreon V Alt","Mew ex","Gengar VMAX","Lugia V"]
    seal=["Prismatic Evo ETB","151 Booster Bundle","Paldean Fates Tin","Surging Sparks Display"]
    row1="".join(f'<div class=tc style="{cv(i)};--ry:{(-10+i*4)}deg"><div class=t>{n}<em>${20+i*13}.00</em></div></div>' for i,n in enumerate(sing))
    row2="".join(f'<div class="tc sealed" style="{cv(i+2)};--ry:{(-8+i*5)}deg"><div class=t>{n}<em>${44+i*21}.00</em></div></div>' for i,n in enumerate(seal))
    body=f'''<div class=main><h2>Collection</h2><div class=chips><div class="chip on">All 179</div><div class=chip>Singles</div><div class=chip>Sealed</div><div class=chip>In a bin</div><div class=chip>Not filed</div><div class=chip style="margin-left:auto">Select</div></div>
<div style="width:calc(100% - 390px)"><h2 style="font-size:18px;color:var(--mute)">SINGLES</h2><div class=shelf>{row1[:0]}{row1}</div><h2 style="font-size:18px;color:var(--mute)">SEALED</h2><div class=shelf>{row2}</div></div>
<div class=half><div class=pic style="{cv(0)}"></div><h2 style="font-size:22px">Charizard ex 199/165</h2><div style="color:var(--mute);margin-bottom:10px">Singles · Bin 3 · NM</div><div class=row><span>Market value</span><span>$26.00</span></div><div class=row><span>You paid</span><span>$9.00</span></div><div class=row><span>Profit if sold</span><span>$17.00</span></div><div class=row><span>Where it is</span><span>Live on eBay</span></div><div class=btn style="margin:18px 0 0;text-align:center">Move or list</div></div></div>'''
    return shell(p,body,"Collection")
def scouter(p):
    th="".join(f'<div class="{"sel" if i<5 else ""}" style="{cv(i)}">{f"<b>{i+1}</b>" if i<5 else ""}</div>' for i in range(8))
    body=f'''<div class=strip><div><div class=big>Scouter</div><small>PHOTOS IN</small></div></div>
<div class=drop><div class=a>Drop photos here</div><div class=b>or paste them · or click to choose</div></div>
<div class=tray><h2 style="font-size:20px">8 photos ready · 5 picked for this item</h2><div style="color:var(--mute);font-size:15px">Tap photos to pick the ones for one item. Nothing is saved until you press Add.</div><div class=th>{th}</div><div class=btn style="display:inline-block;margin:0">Add as 1 item</div></div>'''
    return shell(p,body.replace('<div class=strip>','<div class=strip style="left:116px">',1),"Scouter")
for p in PAL:
    for n,f in [("command",command),("collection",collection),("scouter",scouter)]:
        open(f"{n}-{p}.html","w").write(f(p))
