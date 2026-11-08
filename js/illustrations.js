/* Kinoza · dessin des illustrations d'exercices (SVG) */

/* ---------- Rendu des illustrations ---------- */
const RAD=Math.PI/180, FLOOR=74;
const dn=(a,l)=>[Math.sin(a*RAD)*l, Math.cos(a*RAD)*l];
const upv=(a,l)=>[Math.sin(a*RAD)*l,-Math.cos(a*RAD)*l];
const add=(p,v)=>[p[0]+v[0],p[1]+v[1]];
function resolve(o){
  const r={hd:0,cv:0,la:1,...o};
  r.hp2??=o.hp; r.kn2??=o.kn; r.ft??=o.kn+90; r.ft2??=(o.kn2!==undefined?o.kn2+90:r.ft);
  r.sh2??=o.sh; r.el2??=o.el; r.hw??=r.el; r.hw2??=r.el2;
  return r;
}
/* Vue de face (view:"front") : pour les mouvements qui se font vers l'avant du corps, comme les rotations d'épaule.
   Bras « proche » (E, W) à droite de l'image ; ses angles s'ouvrent vers l'extérieur, négatifs vers le ventre. */
function kinFront(r){
  const J={}, P=[r.x,r.y], mir=(a,l)=>{const v=dn(a,l);return[-v[0],v[1]]};
  J.P=P; J.N=[r.x,r.y-24]; J.H=[r.x,r.y-31.5]; J.C=J.M=[r.x,r.y-12];
  J.SR=add(J.N,[7,2]); J.SL=add(J.N,[-7,2]); J.HR=add(P,[4,0]); J.HL=add(P,[-4,0]);
  /* th, sn : écart de la cuisse et de la jambe vers l'extérieur (squat sumo) ; 0 = jambes droites */
  const th=r.th||0, sn=r.sn||0;
  J.K=add(J.HR,dn(th,18)); J.A=add(J.K,dn(sn,17)); J.T=add(J.A,[3.5,0]);
  J.K2=add(J.HL,mir(th,18)); J.A2=add(J.K2,mir(sn,17)); J.T2=add(J.A2,[-3.5,0]);
  J.E=add(J.SR,dn(r.sh,13));
  if(r.rot!=null){ /* rotation de l'épaule : l'avant-bras pivote à l'horizontale ; 0 = vers nous, + vers l'extérieur, − vers le ventre */
    const s=Math.sin(r.rot*RAD); J.W=add(J.E,[s*12,0]); J.F=add(J.W,[s*3,0]);
  } else { J.W=add(J.E,dn(r.el,12*r.la)); J.F=add(J.W,dn(r.el,3*r.la)); }
  J.E2=add(J.SL,mir(r.sh2,13)); J.W2=add(J.E2,mir(r.el2,12)); J.F2=add(J.W2,mir(r.el2,3));
  J.face="front";
  return J;
}
function kin(r){
  if(r.view==="front") return kinFront(r);
  const J={}, P=[r.x,r.y];
  J.P=P; J.N=add(P,upv(r.tr,24)); J.H=add(J.N,upv(r.tr+r.hd,7.5));
  const u=upv(r.tr,1), perp=[u[1],-u[0]];
  J.C=[(P[0]+J.N[0])/2+perp[0]*r.cv*2,(P[1]+J.N[1])/2+perp[1]*r.cv*2];
  J.M=[(P[0]+J.N[0])/2+perp[0]*r.cv,(P[1]+J.N[1])/2+perp[1]*r.cv];
  J.K=add(P,dn(r.hp,18)); J.A=add(J.K,dn(r.kn,17)); J.T=add(J.A,dn(r.ft,6));
  J.K2=add(P,dn(r.hp2,18)); J.A2=add(J.K2,dn(r.kn2,17)); J.T2=add(J.A2,dn(r.ft2,6));
  J.E=add(J.N,dn(r.sh,13)); J.W=add(J.E,dn(r.el,12*r.la)); J.F=add(J.W,dn(r.hw,4));
  J.E2=add(J.N,dn(r.sh2,13)); J.W2=add(J.E2,dn(r.el2,12)); J.F2=add(J.W2,dn(r.hw2,4));
  J.face=upv(r.tr+r.hd+90,1);
  return J;
}
function groundShift(r){
  if(r.g==null) return 0;
  const J=kin(r), c=r.c||["A","T","A2","T2"];
  return r.g-Math.max(...c.map(k=>J[k][1]));
}
function posed(o,t,o2){ // t: interpolation vers o2
  const a=resolve(o); let r=a, sh=groundShift(a);
  if(o2){const b=resolve(o2); r={...a}; for(const k in a){ if(typeof a[k]==="number"&&typeof b[k]==="number") r[k]=a[k]+(b[k]-a[k])*t }
    sh=sh+(groundShift(b)-sh)*t;}
  const J=kin(r); for(const k in J){ if(k!=="face") J[k]=[J[k][0],J[k][1]+sh] }
  return J;
}
const pt=p=>p[0].toFixed(1)+" "+p[1].toFixed(1);
function bodySVG(J,cls){
  if(J.face==="front"){
    const h=J.H;
    return `<g class="${cls}"><path class="lim trunk" d="M${pt(J.P)}L${pt(J.N)}"/>
      <path class="lim" d="M${pt(J.SL)}L${pt(J.SR)}M${pt(J.HL)}L${pt(J.HR)}M${pt(J.HR)}L${pt(J.K)}L${pt(J.A)}L${pt(J.T)}M${pt(J.HL)}L${pt(J.K2)}L${pt(J.A2)}L${pt(J.T2)}M${pt(J.SL)}L${pt(J.E2)}L${pt(J.W2)}L${pt(J.F2)}M${pt(J.SR)}L${pt(J.E)}L${pt(J.W)}L${pt(J.F)}"/>
      <circle class="hd" cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="4.6"/>
      <circle class="hd" cx="${J.W[0].toFixed(1)}" cy="${J.W[1].toFixed(1)}" r="2.4"/></g>`;
  }
  const far=`<path class="lim far" d="M${pt(J.P)}L${pt(J.K2)}L${pt(J.A2)}L${pt(J.T2)}M${pt(J.N)}L${pt(J.E2)}L${pt(J.W2)}L${pt(J.F2)}"/>`;
  const trunk=`<path class="lim trunk" d="M${pt(J.P)}Q${pt(J.C)} ${pt(J.N)}"/>`;
  const near=`<path class="lim" d="M${pt(J.P)}L${pt(J.K)}L${pt(J.A)}L${pt(J.T)}M${pt(J.N)}L${pt(J.E)}L${pt(J.W)}L${pt(J.F)}"/>`;
  const f=J.face, h=J.H;
  const head=`<circle class="hd" cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="4.6"/><path class="lim nose" d="M${pt([h[0]+f[0]*3.6,h[1]+f[1]*3.6])}L${pt([h[0]+f[0]*6.4,h[1]+f[1]*6.4])}"/>`;
  return `<g class="${cls}">${far}${trunk}${head}${near}</g>`;
}
function propBack(p){
  switch(p.t){
    case "mat": return `<rect class="mat" x="-50" y="${FLOOR-1.6}" width="200" height="1.6" rx=".8"/>`;
    case "chair": return `<g class="prop"><path d="M${p.x-12} 34V74M${p.x-12} 59H${p.x+12}M${p.x+11} 59V74"/><rect x="${p.x-12}" y="57.4" width="24" height="3" rx="1"/></g>`;
    case "bolster": return `<circle class="pad" cx="${p.x}" cy="${FLOOR-p.r}" r="${p.r}"/>`;
    case "pad": return `<rect class="pad" x="${p.x1}" y="${FLOOR-4}" width="${p.x2-p.x1}" height="4" rx="2"/>`;
    case "step": return `<rect class="prop" x="${p.x1}" y="${FLOOR-p.h}" width="${p.x2-p.x1}" height="${p.h}" rx="1"/>`;
    case "wall": return `<g class="prop"><rect x="${p.x}" y="-40" width="4" height="${FLOOR+40}"/></g>`;
    case "bench": return `<g class="prop"><rect x="${p.x1}" y="${p.y}" width="${p.x2-p.x1}" height="3" rx="1"/><path d="M${p.x1+3} ${p.y+3}V74M${p.x2-3} ${p.y+3}V74"/></g>`;
  }
  return "";
}
function propFront(p,J){
  const at=k=>typeof k==="string"?J[k]:k;
  switch(p.t){
    case "band":{const a=at(p.from),b=at(p.to);return `<path class="band" d="M${pt(a)}L${pt(b)}"/>${typeof p.from!=="string"?`<circle class="anchor" cx="${a[0]}" cy="${a[1]}" r="1.6"/>`:""}`}
    case "db":{const w=J[p.at],w2=J[p.at+"2"]||w;return [w2,w].map((q,i)=>`<g class="db ${i?"":"far"}" transform="translate(${pt(q)})"><rect x="-3.2" y="-1.6" width="6.4" height="3.2" rx="1"/></g>`).join("")}
    case "pillow":{const k=J[p.at];return `<ellipse class="pad" cx="${(k[0]+(p.dx||0)).toFixed(1)}" cy="${(k[1]+(p.dy||0)).toFixed(1)}" rx="${p.rx}" ry="${p.ry}"/>`}
    case "ball":{const w=J[p.at];return `<circle class="ballp" cx="${w[0].toFixed(1)}" cy="${w[1].toFixed(1)}" r="${p.r||3}"/>`}
    case "towel":{const k=J[p.at];return `<ellipse class="towel" cx="${k[0].toFixed(1)}" cy="${(FLOOR-2.2).toFixed(1)}" rx="4" ry="2.2"/>`}
    case "stick":{const w=J.W,v=dn(J.W[0]===J.E[0]?0:0,0);return `<path class="stick" d="M${pt([w[0]-3,w[1]+3])}L${pt([w[0]+3,w[1]-3])}"/>`}
  }
  return "";
}
const VBC={};
function viewBox(ex){
  if(VBC[ex.id]) return VBC[ex.id];
  const pts=[]; [posed(ex.A),posed(ex.B)].forEach(J=>{for(const k in J) if(k!=="face") pts.push(J[k])});
  let x0=Math.min(...pts.map(p=>p[0]))-7, x1=Math.max(...pts.map(p=>p[0]))+7;
  let y0=Math.min(...pts.map(p=>p[1]))-7, y1=FLOOR+4;
  (ex.pr||[]).forEach(p=>{
    if(p.t==="chair"){x0=Math.min(x0,p.x-15);x1=Math.max(x1,p.x+15)}
    if(p.t==="step"||p.t==="pad"){x0=Math.min(x0,p.x1-3);x1=Math.max(x1,p.x2+3)}
    if(p.t==="wall"){x0=Math.min(x0,p.x-3);x1=Math.max(x1,p.x+7)}
    if(p.t==="bench"){x0=Math.min(x0,p.x1-2);x1=Math.max(x1,p.x2+2)}
    if(p.t==="bolster"){x0=Math.min(x0,p.x-p.r-2);x1=Math.max(x1,p.x+p.r+2)}
    if(p.t==="band"&&typeof p.from!=="string"){x0=Math.min(x0,p.from[0]-4);x1=Math.max(x1,p.from[0]+4);y0=Math.min(y0,p.from[1]-4)}
  });
  let w=x1-x0, h=y1-y0;
  if(w/h<1.25){const nw=h*1.25; x0-=(nw-w)/2; w=nw} else {const nh=w/1.25; y0-=(nh-h); h=nh}
  return VBC[ex.id]={x:x0,y:y0,w,h};
}
function sceneSVG(ex,t){
  const vb=viewBox(ex), JA=posed(ex.A), JB=posed(ex.B);
  const live = t==null ? JB : posed(ex.A,t,ex.B);
  const tgt=live[ex.tg]||live.M;
  const pr=ex.pr||[];
  return `<rect class="flr" x="${vb.x}" y="${FLOOR}" width="${vb.w}" height="${vb.y+vb.h-FLOOR}"/>
    ${pr.map(propBack).join("")}
    ${t==null?bodySVG(JA,"ghost"):""}
    <circle class="tgt" cx="${tgt[0].toFixed(1)}" cy="${tgt[1].toFixed(1)}" r="7"/>
    ${pr.filter(p=>p.t==="band").map(p=>propFront(p,live)).join("")}
    ${bodySVG(live,"pose")}
    ${pr.filter(p=>p.t!=="band").map(p=>propFront(p,live)).join("")}`;
}
function fig(id,size="sm"){
  const ex=EX[id], vb=viewBox(ex);
  return `<svg class="fig ${size}" viewBox="${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}" role="img" aria-label="Illustration : ${esc(ex.n)}">${sceneSVG(ex)}</svg>`;
}
