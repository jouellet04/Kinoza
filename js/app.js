/* Kinoza · données, vues, formulaires et gestionnaires d'événements */

const EQUIP = [...new Set(EXERCISES.map(e=>e.eq))].sort((a,b)=>a.localeCompare(b,"fr"));
const LOADS = ["Poids du corps","Haltères","Bande élastique","Autre matériel"];
const loadType = e=>/Haltère/.test(e.eq)?"Haltères":/Bande/.test(e.eq)?"Bande élastique":
  (e.d.load==="PDC"||e.d.load==="—"||["Aucun","Tapis","Mur","Chaise","Marche"].includes(e.eq))?"Poids du corps":"Autre matériel";

function mk(id,extra={}){return Object.assign({id, ...EX[id].d, note:""}, extra)}
function seed(){ return {clients:[]} }
/* Clés de stockage « kinoza-… ». Au premier lancement, les données enregistrées sous l'ancien nom
   de l'application sont déplacées vers les nouvelles clés, puis les anciennes clés sont effacées. */
(function moveOldStorage(){ try{
  [["kineplan-vault","kinoza-vault"],["kineplan-v2","kinoza-v2"],["kineplan-v2-view","kinoza-view"]].forEach(([from,to])=>{
    const v=localStorage.getItem(from);
    if(v!==null){ if(localStorage.getItem(to)===null) localStorage.setItem(to,v); localStorage.removeItem(from) }
  });
  localStorage.removeItem("kineplan-v1");
}catch(e){} })();
const KEY="kinoza-v2", VIEW_KEY="kinoza-view"; // KEY : ancien stockage non chiffré, repris puis effacé à la création du mot de passe
function loadLegacy(){try{const s=localStorage.getItem(KEY);return s?JSON.parse(s):null}catch(e){return null}}
function save(){ persist() }   // chiffré par securite.js
let S = seed();
const newId = pre=>pre+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
function migrateProg(p,c){
  if(p.dx==null) p.dx=c.dx||"";
  if(p.phase==null) p.phase=c.phase??0;
  if(typeof p.phase==="number") p.phase=PHASES[p.phase]||"";
  if(p.freq==null){ p.freq=(p.days&&p.days.length)||3; delete p.days; }
}
function migrate(data){
  data.clients=data.clients||[];
  data.clients.forEach(c=>{
    c.log=c.log||[];
    if(!c.progs){ c.prog=c.prog||{name:"Programme",ex:[]}; c.prog.id=newId("p"); c.prog.created=c.start||new Date().toISOString().slice(0,10); c.progs=[c.prog]; c.active=c.prog.id; delete c.prog; }
    c.progs.forEach(p=>{ p.ex=p.ex||[]; migrateProg(p,c); });
    if(!c.progs.some(p=>p.id===c.active)) c.active=c.progs[0]?.id;
    delete c.dx; delete c.phase;
  });
  return data;
}
migrate(S);

/* Noms et étapes personnalisés : S.exEdits = {id:{n,steps}}, appliqués par-dessus la bibliothèque d'origine */
const EX_ORIG = Object.fromEntries(EXERCISES.map(e=>[e.id,{n:e.n,steps:[...e.steps]}]));
function applyExEdits(){
  for(const e of EXERCISES){
    const o=EX_ORIG[e.id], m=(S.exEdits||{})[e.id];
    e.n = m?.n || o.n;
    e.steps = m?.steps?.length ? [...m.steps] : [...o.steps];
  }
}
const isEdited = id=>!!(S.exEdits&&S.exEdits[id]);
applyExEdits();
const AP = c=>c.progs.find(p=>p.id===c.active)||c.progs[0];
/* Programme verrouillé : noms et étapes figés au moment du verrouillage */
const exView = (p,id)=>p?.snap?.[id]?{...EX[id],...p.snap[id]}:EX[id];
const progLocked = (c,p)=>!!(p&&(p.locked||c?.locked));
const lockDate = l=>l?new Date(l.at).toLocaleDateString("fr-CA",{day:"numeric",month:"long",year:"numeric"}):"";
function guardProg(){
  const c=C(ui.builder), p=BP();
  if(progLocked(c,p)){ toast("Ce programme est verrouillé : il ne peut plus être modifié."); return false }
  return true;
}
function guardClient(c){
  if(c?.locked){ toast("Ce dossier est fermé et verrouillé : il ne peut plus être modifié."); return false }
  return true;
}
const BP = ()=>{const c=C(ui.builder); return c&&(c.progs.find(p=>p.id===ui.bp)||AP(c))};

const ui = {view:"dash", integ:{}, integKey:{}, client:null, builder:null, bp:null, libM:[], libEq:"Tous", libQ:"", libPh:"Toutes", libLt:[], bM:[], bQ:""};
/* Filtres à cocher : liste vide = tout ; plusieurs choix dans un même groupe = l'un ou l'autre */
const anyOf = (sel,vals)=>!sel.length||vals.some(v=>sel.includes(v));
const toggleIn = (arr,v)=>arr.includes(v)?arr.filter(x=>x!==v):[...arr,v];
const mgTxt = (e,n=2)=>e.mg.slice(0,n).join(" · ");
function chipRow(key,all,sel,counts,label){
  return `<div class="filters" role="group" aria-label="${label}"><button data-flt="${key}" data-v="" aria-pressed="${!sel.length}">Tous</button>${all.map(v=>`<button data-flt="${key}" data-v="${esc(v)}" aria-pressed="${sel.includes(v)}">${esc(v)}${counts?` <span class="num" style="opacity:.6">${counts(v)}</span>`:""}</button>`).join("")}</div>`;
}
try{const v=localStorage.getItem(VIEW_KEY); if(v&&v!=="patient") ui.view=v}catch(e){}

const $ = s=>document.querySelector(s);
const esc = s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const C = id=>S.clients.find(c=>c.id===id);
const initials = n=>n.trim().split(/[\s-]+/).map(w=>w[0]||"").slice(0,2).join("").toUpperCase();
/* Âge calculé à partir de la date de naissance ; les anciens dossiers gardent l'âge saisi à la main */
function ageOf(c){
  if(!c.birth) return c.age||null;
  const b=new Date(c.birth+"T12:00"), n=new Date(TODAY+"T12:00");
  let a=n.getFullYear()-b.getFullYear();
  if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate())) a--;
  return a;
}
const ageTxt = c=>{const a=ageOf(c); return a==null?"":a+" an"+(a>1?"s":"")};
const first = c=>c.n.trim().split(" ")[0];

/* Semaine courante, lundi → dimanche */
const now = new Date();
const todayIdx = (now.getDay()+6)%7;
const monday = new Date(now); monday.setDate(now.getDate()-todayIdx);
const weekDates = [...Array(7)].map((_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return d});
const fmtDate = d=>d.toLocaleDateString("fr-CA",{weekday:"long",day:"numeric",month:"long"});
const iso = d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const TODAY = iso(now);
const logged = (c,d)=>c.log.some(l=>l.date===d);

function sinceTxt(c){
  if(!c.start) return "";
  const days=Math.round((new Date(TODAY)-new Date(c.start))/864e5);
  if(days<0) return "Début du suivi le "+new Date(c.start+"T12:00").toLocaleDateString("fr-CA",{day:"numeric",month:"long"});
  if(days<7) return days===0?"Suivi commencé aujourd'hui":`Suivi depuis ${days} j`;
  return `Suivi depuis ${Math.floor(days/7)} sem.`;
}
/* Adhérence : séances enregistrées / séances attendues (fréquence hebdo) sur les 14 derniers jours */
function adherence(c){
  const from=new Date(now); from.setDate(now.getDate()-13);
  let start=iso(from); if(c.start && c.start>start) start=c.start;
  if(start>TODAY) return null;
  const active=Math.round((new Date(TODAY)-new Date(start))/864e5)+1;
  const expected=Math.round(fMin(AP(c))*active/7);
  if(expected<1) return null;
  const done=c.log.filter(l=>l.date>=start && l.date<=TODAY).length;
  return Math.min(100,Math.round(done/expected*100));
}
const weekDone = c=>c.log.filter(l=>l.date>=iso(weekDates[0]) && l.date<=iso(weekDates[6])).length;
const objTxt = p=>p.dx||"Objectif à préciser";
/* Clic sur un nombre : étend la plage, la réduit depuis un bout, ou revient à un seul nombre */
function setFreq(p,n){
  let lo=fMin(p), hi=fMax(p);
  if(n<lo) lo=n; else if(n>hi) hi=n;
  else if(lo===hi) return;
  else if(n===lo) lo++; else if(n===hi) hi--;
  else lo=hi=n;
  p.freq=lo; p.freqMax=hi>lo?hi:undefined;
}
/* Fréquence : un nombre (freq) ou une plage freq–freqMax, ex. 2 à 3 fois par semaine */
const fMin = p=>p.freq, fMax = p=>Math.max(p.freqMax||p.freq,p.freq);
const fLabel = p=>fMin(p)===fMax(p)?`${fMin(p)}`:`${fMin(p)} à ${fMax(p)}`;
const freqShort = p=>`${fLabel(p)} fois par semaine`;
const pains = c=>c.log.map(l=>l.pain).slice(-8);
function dayStatus(c,i){ return logged(c,iso(weekDates[i]))?"done":null }
function flags(c){
  const f=[], p=pains(c), a=adherence(c);
  if(p.length>=4){const last=p[p.length-1], prev=p[p.length-4]; if(last-prev>=1 && last>=5) f.push({t:`Douleur en hausse (${prev}→${last}/10)`,k:"bad"})}
  if(a!==null && a<60) f.push({t:`Adhérence ${a} %`,k:"warn"});
  return f;
}
const adhClass = a=> a===null?"":a<60?"bad":a<75?"warn":"";
const adhTxt = a=> a===null?"—":a+" %";
function syncSel(){
  const ids=S.clients.map(c=>c.id);
  for(const k of ["client","builder"]) if(!ids.includes(ui[k])) ui[k]=ids[0]||null;
  const bc=C(ui.builder); if(bc && !bc.progs.some(p=>p.id===ui.bp)) ui.bp=bc.active;
}
function emptyClients(msg){
  return `<section class="panel empty-state">
    <div class="empty-ico">${ico("clients")}</div>
    <h2>Aucun client pour l'instant</h2>
    <p class="muted">${msg}</p>
    <button class="btn primary" data-new-client>${I.plus} Ajouter un client</button></section>`;
}

function spark(p,w=120,h=32){
  const max=10, step=w/(p.length-1);
  const pts=p.map((v,i)=>[i*step, h-3-(v/max)*(h-6)]);
  const d=pts.map((q,i)=>(i?"L":"M")+q[0].toFixed(1)+" "+q[1].toFixed(1)).join(" ");
  const [lx,ly]=pts[pts.length-1];
  const rising = p[p.length-1]>p[0];
  const col = rising?"var(--bad)":"var(--good)";
  return `<svg viewBox="-3 0 ${w+6} ${h}" width="${w}" height="${h}" aria-label="Douleur : ${p.join(", ")}" role="img">
    <path d="${d} L${w} ${h} L0 ${h}Z" fill="${col}" opacity=".12"/>
    <path d="${d}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="${lx}" cy="${ly}" r="3" fill="${col}"/></svg>`;
}
function painChart(p){
  if(p.length<2) return `<div class="empty" style="padding:24px">${p.length?`Une séance enregistrée, douleur <span class="num">${p[0]}/10</span>. La courbe apparaîtra à partir de deux séances.`:"Les notes de douleur s'afficheront ici quand le client terminera ses séances."}</div>`;
  const W=520,H=170,L=26,R=10,T=10,B=24, iw=W-L-R, ih=H-T-B, step=iw/(p.length-1);
  const y=v=>T+ih-(v/10)*ih, x=i=>L+i*step;
  let g="";
  [0,2,4,6,8,10].forEach(v=>{g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L-8}" y="${y(v)+3}" text-anchor="end">${v}</text>`});
  p.forEach((v,i)=>{g+=`<text x="${x(i)}" y="${H-6}" text-anchor="middle">S${i+1}</text>`});
  const d=p.map((v,i)=>(i?"L":"M")+x(i)+" "+y(v)).join(" ");
  const dots=p.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="${i===p.length-1?4.5:3}" fill="${i===p.length-1?"var(--accent)":"var(--surface)"}" stroke="var(--accent)" stroke-width="2"/>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Douleur rapportée par séance">
    <rect x="${L}" y="${y(10)}" width="${iw}" height="${y(7)-y(10)}" fill="var(--bad-soft)" opacity=".6"/>
    ${g}<path d="${d} L${x(p.length-1)} ${y(0)} L${L} ${y(0)}Z" fill="var(--accent)" opacity=".08"/>
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round"/>${dots}</svg>`;
}
const doseTxt = e=>`${e.s} × ${e.rep}${e.t&&e.t!=="—"?" · "+e.t:""}`;

const ICONS={
  backup:'<path d="M12 3v11M7.5 9.5 12 14l4.5-4.5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  shield:'<path d="M12 3l7 3v5.5c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  lock:'<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  dash:'<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z"/>',
  clients:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.4 3.5 5.2"/>',
  builder:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  library:'<path d="M6 4v16M10 4v16M14 4l5 15.5"/>'
};
const NAV_ICON={backup:"lock",compliance:"shield"};
const NAV=[["dash","Tableau de bord"],["clients","Clients"],["builder","Programmes"],["library","Bibliothèque"],["compliance","Conformité"],["backup","Sécurité"]];
const ico = k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`;
const I = {
  up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 15l6-6 6 6"/></svg>',
  down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  pdf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M12 11v6M9.5 14.5 12 17l2.5-2.5"/></svg>',
  mail:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>'
};

function renderNav(){
  $("#nav").innerHTML = NAV.map(([k,l])=>`<button data-go="${k}" ${ui.view===k||(k==="clients"&&ui.view==="client")?'aria-current="page"':""} title="${l}">${ico(NAV_ICON[k]||k)}<span>${l}</span></button>`).join("");
}

/* ---------- Tableau de bord ---------- */
function vDash(){
  const cl=S.clients;
  const head=`<div class="head"><div class="head-l"><span class="eyebrow">${esc(fmtDate(now))}</span><h1>Tableau de bord</h1></div>
    <button class="btn primary" data-new-client>${I.plus} Ajouter un client</button></div>`;
  if(!cl.length) return head+emptyClients("Créez un dossier pour chaque client, puis construisez son programme à partir de la bibliothèque d'exercices.");
  const adh=cl.map(c=>({c,a:adherence(c)})), withA=adh.filter(x=>x.a!==null);
  const avg=withA.length?Math.round(withA.reduce((s,x)=>s+x.a,0)/withA.length):null;
  const watch=cl.filter(c=>flags(c).length);
  const met=cl.filter(c=>weekDone(c)>=fMin(AP(c))).length;
  return head+backupReminder()+complianceReminder()+`
  <div class="stats">
    <div class="stat"><span class="eyebrow">Clients actifs</span><span class="stat-v num">${cl.length}</span><span class="stat-s">${met} ${met>1?"ont":"a"} atteint leur objectif cette semaine</span></div>
    <div class="stat"><span class="eyebrow">Adhérence moyenne</span><span class="stat-v num">${adhTxt(avg)}</span><span class="stat-s">Séances faites / attendues, 14 derniers jours</span></div>
    <div class="stat"><span class="eyebrow">À surveiller</span><span class="stat-v num" style="color:${watch.length?"var(--bad)":"var(--good)"}">${watch.length}</span><span class="stat-s">Douleur en hausse ou adhérence &lt; 60 %</span></div>
  </div>
  <div class="grid-dash">
    <section class="panel">
      <div class="panel-h"><h2>À surveiller</h2><span class="muted" style="font-size:.85rem">Douleur rapportée, 8 dernières séances</span></div>
      <div class="rows">${watch.length?watch.map(c=>`
        <div class="row" style="grid-template-columns:minmax(0,1.4fr) auto auto">
          <div class="who"><div class="avatar">${esc(initials(c.n))}</div><div class="who-t"><b>${esc(c.n)}</b><span>${esc(AP(c).name)}</span>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${flags(c).map(f=>`<span class="chip ${f.k}">${f.t}</span>`).join("")}</div></div></div>
          <div class="r-diag">${pains(c).length>1?spark(pains(c)):""}</div>
          <button class="btn sm" data-client="${c.id}">Dossier</button>
        </div>`).join(""):`<p class="muted">Aucun client à surveiller pour l'instant.</p>`}</div>
    </section>
    <section class="panel">
      <div class="panel-h"><h2>Cette semaine</h2><span class="muted" style="font-size:.85rem">Séances faites / objectif</span></div>
      <div>${cl.map(c=>{const w=weekDone(c), f=fLabel(AP(c)), ok=w>=fMin(AP(c));return `
        <div class="rdv" style="grid-template-columns:minmax(0,1fr) auto auto"><div style="min-width:0"><b style="font-weight:600">${esc(c.n)}</b><div class="muted" style="font-size:.84rem">${esc(AP(c).name)} · ${AP(c).ex.length} exercices</div></div>
        <span class="chip ${ok?"ok":""} num">${w} / ${f}</span>
        <button class="link" data-client="${c.id}">Ouvrir</button></div>`}).join("")}</div>
    </section>
  </div>
  <section class="panel">
    <div class="panel-h"><h2>Adhérence par client</h2>
      <div class="legend"><span><i style="width:10px;height:10px;border-radius:2px;background:var(--accent)"></i>≥ 75 %</span><span><i style="width:10px;height:10px;border-radius:2px;background:var(--warn)"></i>60–74 %</span><span><i style="width:10px;height:10px;border-radius:2px;background:var(--bad)"></i>&lt; 60 %</span></div></div>
    ${withA.length?`<div style="display:flex;flex-direction:column;gap:10px">${[...withA].sort((a,b)=>b.a-a.a).map(({c,a})=>`
      <div style="display:grid;grid-template-columns:minmax(0,180px) minmax(0,1fr) 48px;gap:12px;align-items:center;font-size:.9rem">
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.n)}</span>
        <div class="bar" style="height:10px"><i class="${adhClass(a)}" style="width:${a}%"></i></div>
        <span class="num" style="text-align:right">${a} %</span></div>`).join("")}</div>`
      :`<p class="muted">L'adhérence se calcule après les premiers jours de suivi, à partir des séances saisies.</p>`}
  </section>`;
}

/* ---------- Clients ---------- */
function vClients(){
  const head=`<div class="head"><div class="head-l"><span class="eyebrow">${S.clients.length} dossier${S.clients.length>1?"s":""}</span><h1>Clients</h1></div>
    <button class="btn primary" data-new-client>${I.plus} Ajouter un client</button></div>`;
  if(!S.clients.length) return head+emptyClients("Ajoutez un client, puis bâtissez-lui un programme avec son objectif et sa phase.");
  return head+`
  <section class="panel"><div class="rows">
    ${S.clients.map(c=>{const p=pains(c), last=p.length?p[p.length-1]+"/10":"—", a=adherence(c);return `
    <div class="row">
      <div class="who"><div class="avatar">${esc(initials(c.n))}</div><div class="who-t"><b>${esc(c.n)}${c.locked?` <span class="chip" style="vertical-align:middle">${ico("lock")} Fermé</span>`:""}${consentState(c).ok?"":` <span class="chip warn" style="vertical-align:middle">Consentement</span>`}</b><span>${[ageTxt(c),sinceTxt(c)].filter(Boolean).join(" · ")||"&nbsp;"}</span></div></div>
      <div class="r-diag" style="min-width:0"><div style="font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(AP(c).name)}</div>
        <span class="chip acc" style="margin-top:4px">${esc(phaseTxt(AP(c)))}</span></div>
      <div class="adh r-adh"><span><span class="num">${adhTxt(a)}</span> <span class="muted">adhérence</span></span><div class="bar"><i class="${adhClass(a)}" style="width:${a??0}%"></i></div>
        <span class="muted">Douleur <span class="num" style="color:var(--ink)">${last}</span></span></div>
      <div style="display:flex;gap:4px;align-items:center">
        ${c.locked?"":`<button class="icon-btn" data-edit-client="${c.id}" aria-label="Modifier ${esc(c.n)}" title="Modifier">${I.edit}</button>`}
        <button class="btn sm" data-client="${c.id}">Dossier</button></div>
    </div>`}).join("")}
  </div></section>`;
}

function vClient(){
  const c=C(ui.client);
  if(!c) return vClients();
  const a=adherence(c), L=!!c.locked, PL=progLocked(c,AP(c));
  const st=[...Array(7)].map((_,i)=>dayStatus(c,i));
  queueVerify(c);
  const ig=ui.integ[c.id], anyLock=L||c.progs.some(p=>p.locked);
  return `
  <div class="head">
    <div class="head-l"><button class="link" data-go="clients" style="align-self:flex-start">← Clients</button>
      <h1>${esc(c.n)}</h1><span class="muted">${[ageTxt(c)+(c.birth?` (né(e) le ${esc(dLong(c.birth))})`:""),sinceTxt(c),esc(c.email||"")].filter(Boolean).join(" · ")}</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
        ${L?`<span class="chip">${ico("lock")} Dossier fermé le ${esc(lockDate(c.locked))}</span>`:""}
        ${anyLock&&ig?.ok?`<span class="chip ok">${I.check} Intégrité vérifiée</span>`:""}</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${L?"":`<button class="btn" data-edit-client="${c.id}">${I.edit} Modifier</button>
      <button class="btn danger" data-del-client="${c.id}">${I.trash} Supprimer</button>
      <button class="btn" data-lock-client="${c.id}">${ico("lock")} Fermer et verrouiller</button>
      <button class="btn primary" data-new-prog="${c.id}">${I.plus} Nouveau programme</button>`}
      <button class="btn" data-preview="${c.id}:${c.active}">Aperçu page client</button>
      <button class="btn" data-cf-access="${c.id}">Remettre son dossier</button>
      ${L?`<button class="btn" data-cf-rectify="${c.id}">Rectifier un renseignement</button>`:""}</div>
  </div>
  ${ig&&!ig.ok?`<section class="panel integ-bad" role="alert"><h2>Intégrité compromise</h2><p>Des données verrouillées ne correspondent plus à leur empreinte. Elles ont été modifiées en dehors de Kinoza.</p><ul>${ig.problems.map(p=>`<li>${esc(p)}</li>`).join("")}</ul></section>`:""}
  ${consentPanel(c)}
  ${c.notes?`<section class="panel notes"><span class="eyebrow">Notes cliniques et précautions</span><p>${esc(c.notes)}</p></section>`:""}
  <section class="panel">
    <div class="panel-h"><div><span class="eyebrow">Programme actuel · ${esc(AP(c).name)}</span><h2 style="margin-top:4px">Phase et objectif</h2></div></div>
    <div class="meta" style="grid-template-columns:minmax(0,1fr) minmax(0,1.6fr)">
      ${phaseField("phase-sel",AP(c).phase,"Phase",PL)}
      <div class="field"><label for="obj-sel">Objectif du programme</label><input class="inp" id="obj-sel" autocomplete="off" value="${esc(AP(c).dx)}" placeholder="Ex. reprendre la course sans douleur d'ici 8 semaines" ${PL?"disabled":""}></div>
    </div>
    ${PL?`<p class="muted" style="font-size:.82rem">Programme verrouillé : la phase et l'objectif ne peuvent plus changer.</p>`:""}
  </section>
  <div class="grid2">
    <section class="panel">
      <div class="panel-h"><h2>Cette semaine</h2><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="chip ${weekDone(c)>=fMin(AP(c))?"ok":""} num">${weekDone(c)} / ${fLabel(AP(c))} séances</span><span class="chip ${a===null?"":adhClass(a)==="bad"?"bad":adhClass(a)==="warn"?"warn":"ok"}">Adhérence ${adhTxt(a)}</span></div></div>
      <div class="week">${weekDates.map((d,i)=>{const inner=`<span class="day-n">${DAYS_LONG[i]}</span><span class="day-d">${d.getDate()}</span>
        ${st[i]?`<span class="dot done">✓</span>`:""}`;
        return i<=todayIdx&&!L?`<button class="day ${i===todayIdx?"today":""}" data-log-day="${i}" aria-label="Saisir la séance du ${esc(fmtDate(d))}">${inner}</button>`:`<div class="day ${i===todayIdx?"today":""}">${inner}</div>`}).join("")}</div>
      <div class="legend"><span><i class="dot done"></i>Séance réalisée</span></div>
      <p class="muted" style="font-size:.82rem">${L?"Dossier fermé : les séances ne peuvent plus être saisies.":"Cliquez sur un jour pour saisir une séance à partir du journal de suivi du client."}</p>
    </section>
    <section class="panel">
      <div class="panel-h"><h2>Douleur rapportée</h2><span class="muted" style="font-size:.85rem">Échelle numérique 0–10, zone ≥ 7 en rouge</span></div>
      ${painChart(pains(c))}
    </section>
  </div>
  <section class="panel">
    <div class="panel-h"><div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px"><span class="chip ok">Programme actuel</span>${AP(c).locked?`<span class="chip">${ico("lock")} Verrouillé le ${esc(lockDate(AP(c).locked))}</span>`:""}</div><h2>${esc(AP(c).name)}</h2><span class="muted" style="font-size:.85rem">${AP(c).ex.length} exercices · ${freqShort(AP(c))} · depuis le ${esc(dLong(AP(c).created))}</span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-build-prog="${c.id}:${AP(c).id}">${PL?"Consulter":`${I.edit} Modifier`}</button>
      ${PL?"":`<button class="btn sm" data-lock-prog="${c.id}:${AP(c).id}">${ico("lock")} Verrouiller</button>`}
      ${AP(c).ex.length?`<button class="btn sm" data-export="${c.id}:${AP(c).id}">${I.pdf} Exporter en PDF</button>
      <button class="btn sm" data-cf-mail="${c.id}:${AP(c).id}">${I.mail} Envoyer par courriel</button>`:""}</div></div>
    ${AP(c).ex.length?"":`<div class="empty">Aucun exercice pour l'instant.${PL?"":` <button class="link" data-build-prog="${c.id}:${AP(c).id}">Construire le programme</button>`}</div>`}
    <ol class="ex-mini">${AP(c).ex.map((e,i)=>`
      <li><span class="ord">${String(i+1).padStart(2,"0")}</span><button class="open-fig" data-open="${e.id}" aria-label="Voir la fiche">${fig(e.id)}</button>
        <div style="min-width:0"><b style="font-weight:600">${esc(exView(AP(c),e.id).n)}</b>${e.note?`<div class="muted" style="font-size:.84rem">${esc(e.note)}</div>`:""}</div>
        <span class="dose">${esc(doseTxt(e))}</span></li>`).join("")}</ol>
  </section>
  ${progHistory(c)}
  ${rectifPanel(c)}
  ${addendaPanel(c)}
  ${auditPanel(c)}`;
}
function queueVerify(c){
  verifyClient(c).then(r=>{
    const k=JSON.stringify(r);
    if(ui.integKey[c.id]!==k){ ui.integ[c.id]=r; ui.integKey[c.id]=k; if(ui.view==="client"&&ui.client===c.id&&$("#sheet").hidden&&!document.activeElement?.matches?.("textarea,input")) render() }
  });
}
const stamp = s=>new Date(s).toLocaleString("fr-CA",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});
function addendaPanel(c){
  const list=c.addenda||[];
  return `<section class="panel">
    <div class="panel-h"><div><h2>Notes d'ajout</h2><span class="muted" style="font-size:.85rem">Datées et définitives : une note ne peut être ni modifiée ni supprimée.${c.locked?" C'est la seule façon de compléter un dossier fermé.":""}</span></div></div>
    ${list.length?`<ol class="addenda">${[...list].reverse().map(n=>`<li><span class="eyebrow">${esc(stamp(n.at))}</span><p>${esc(n.text)}</p></li>`).join("")}</ol>`:`<p class="muted">Aucune note pour l'instant.</p>`}
    <form id="addendum-form" class="field" novalidate>
      <label for="ad-text">Nouvelle note</label>
      <textarea class="inp" id="ad-text" rows="3" placeholder="Ex. Le client rapporte une douleur au genou depuis la dernière séance ; exercice 3 suspendu."></textarea>
      <span class="err" id="ad-err" hidden>Écrivez la note avant de l'ajouter.</span>
      <button class="btn" type="submit" style="align-self:flex-start;margin-top:6px">Ajouter la note</button>
    </form>
  </section>`;
}
function auditPanel(c){
  const list=c.audit||[];
  return `<section class="panel"><details>
    <summary><h2 style="display:inline">Historique du dossier</h2> <span class="muted" style="font-size:.85rem">· ${list.length} évènement${list.length>1?"s":""}</span></summary>
    ${list.length?`<ol class="audit">${[...list].reverse().map(e=>`<li><span class="num muted">${esc(stamp(e.at))}</span><span>${esc(e.a)}</span></li>`).join("")}</ol>`:`<p class="muted">L'historique commence avec les actions faites à partir de maintenant.</p>`}
  </details></section>`;
}
const dLong = d=>d?new Date(d+"T12:00").toLocaleDateString("fr-CA",{day:"numeric",month:"long",year:"numeric"}):"";
const byDate = arr=>[...arr].sort((a,b)=>(b.created||"").localeCompare(a.created||""));
function progHistory(c){
  return `<section class="panel">
    <div class="panel-h"><div><h2>Tous les programmes</h2><span class="muted" style="font-size:.85rem">${c.progs.length} programme${c.progs.length>1?"s":""} · les anciens restent consultables et exportables</span></div>
      ${c.locked?"":`<button class="btn sm" data-new-prog="${c.id}">${I.plus} Nouveau programme</button>`}</div>
    <div class="rows">${byDate(c.progs).map(p=>{const act=p.id===c.active;return `
      <div class="row prog-row">
        <div style="min-width:0"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-weight:600">${esc(p.name)}</b>${act?`<span class="chip ok">Actuel</span>`:`<span class="chip">Ancien</span>`}${progLocked(c,p)?`<span class="chip">${ico("lock")} Verrouillé</span>`:""}</div>
          <div class="muted" style="font-size:.84rem">${esc(objTxt(p))} · ${esc(phaseTxt(p))} · ${p.ex.length} exercices · ${freqShort(p)} · créé le ${esc(dLong(p.created))}</div></div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;align-items:center">
          ${act||c.locked?"":`<button class="btn sm" data-activate="${c.id}:${p.id}">Rendre actuel</button>`}
          ${progLocked(c,p)?"":`<button class="icon-btn" data-lock-prog="${c.id}:${p.id}" aria-label="Verrouiller ${esc(p.name)}" title="Verrouiller">${ico("lock")}</button>`}
          <button class="icon-btn" data-build-prog="${c.id}:${p.id}" aria-label="Ouvrir ${esc(p.name)}" title="Ouvrir dans le constructeur">${I.edit}</button>
          <button class="icon-btn" data-export="${c.id}:${p.id}" aria-label="Exporter ${esc(p.name)} en PDF" title="Exporter en PDF" ${p.ex.length?"":"disabled"}>${I.pdf}</button>
          <button class="icon-btn" data-cf-mail="${c.id}:${p.id}" aria-label="Envoyer ${esc(p.name)} par courriel" title="Envoyer par courriel" ${p.ex.length?"":"disabled"}>${I.mail}</button>
          ${act||progLocked(c,p)?"":`<button class="icon-btn" data-del-prog="${c.id}:${p.id}" aria-label="Supprimer ${esc(p.name)}" title="Supprimer">${I.trash}</button>`}
        </div>
      </div>`}).join("")}</div>
  </section>`;
}

/* ---------- Constructeur ---------- */
function libFiltered(sel,q){
  q=q.trim().toLowerCase();
  return EXERCISES.filter(e=>anyOf(sel,e.mg)&&(!q||e.n.toLowerCase().includes(q)||e.eq.toLowerCase().includes(q)||e.m.toLowerCase().includes(q)));
}
function vBuilder(){
  const c=C(ui.builder);
  if(!c) return `<div class="head"><div class="head-l"><span class="eyebrow">Constructeur de programme</span><h1>Programmes</h1></div></div>`+emptyClients("Un programme appartient toujours à un client. Ajoutez d'abord un client, puis choisissez ses exercices ici.");
  const p=BP(), isActive=p.id===c.active, L=progLocked(c,p), off=L?"disabled":"";
  const list=libFiltered(ui.bM,ui.bQ);
  const total=p.ex.reduce((a,e)=>a+(+e.s||0),0);
  return `
  <div class="head"><div class="head-l"><span class="eyebrow">Constructeur de programme</span><h1>${esc(p.name)}</h1></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${c.locked?"":`<button class="btn" data-new-prog="${c.id}">${I.plus} Nouveau programme</button>`}${L?"":`<button class="btn" data-lock-prog="${c.id}:${p.id}">${ico("lock")} Verrouiller</button>`}<button class="btn" data-preview="${c.id}:${p.id}">Aperçu page client</button>${p.ex.length?`<button class="btn" data-cf-mail="${c.id}:${p.id}">${I.mail} Envoyer par courriel</button>`:""}<button class="btn primary" data-export="${c.id}:${p.id}">${I.pdf} Exporter en PDF</button></div></div>
  <div class="builder">
    <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
      <section class="panel">
        <div class="meta" style="grid-template-columns:repeat(2,minmax(0,1fr))">
          <div class="field"><label for="b-client">Client</label><select class="inp" id="b-client">${S.clients.map(x=>`<option value="${x.id}" ${x.id===c.id?"selected":""}>${esc(x.n)}</option>`).join("")}</select></div>
          <div class="field"><label for="b-prog">Programme</label><select class="inp" id="b-prog">${byDate(c.progs).map(x=>`<option value="${x.id}" ${x.id===p.id?"selected":""}>${esc(x.name)}${x.id===c.active?" (actuel)":` (ancien, ${esc(dLong(x.created))})`}</option>`).join("")}</select></div>
        </div>
        ${L?`<div class="banner">${ico("lock")} <b>Programme verrouillé le ${esc(lockDate(p.locked||c.locked))}.</b> Lecture seule. Pour le faire évoluer, créez un nouveau programme à partir d'une copie.</div>`:""}
        ${isActive||L?"":`<div class="banner">Vous modifiez un ancien programme. Le programme actuel du client ne change pas. <button class="link" data-activate="${c.id}:${p.id}">Rendre ce programme actuel</button></div>`}
        <div class="meta" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)">
          <div class="field"><label for="b-name">Nom du programme</label><input class="inp" id="b-name" value="${esc(p.name)}" ${off}></div>
          ${phaseField("b-phase",p.phase,"Phase",L)}
        </div>
        <div class="field"><label for="b-dx">Objectif du programme</label><input class="inp" id="b-dx" autocomplete="off" value="${esc(p.dx)}" placeholder="Ex. reprendre la course sans douleur d'ici 8 semaines" ${off}></div>
        <div class="field"><label id="freq-l">Séances à domicile par semaine</label>
          <div class="days" role="group" aria-labelledby="freq-l">${[1,2,3,4,5,6,7].map(n=>`<button data-freq="${n}" aria-pressed="${n>=fMin(p)&&n<=fMax(p)}" aria-label="${n} fois par semaine" ${off}>${n}</button>`).join("")}</div>
          <span class="muted" style="font-size:.8rem">Choisissez un nombre, ou cochez deux nombres pour une plage, par exemple 2 et 3 pour « 2 à 3 fois par semaine ».</span></div>
        <div class="muted" style="font-size:.85rem"><span class="num">${p.ex.length}</span> exercices · <span class="num">${total}</span> séries par séance · <span class="num">${fLabel(p)}</span> séance${fMax(p)>1?"s":""} par semaine</div>
      </section>
      <div class="prog-list" id="prog-list">
        ${p.ex.length?p.ex.map((e,i)=>{const x=exView(p,e.id);return `
        <article class="ex-card">
          <span class="ord">${String(i+1).padStart(2,"0")}</span><button class="open-fig" data-open="${e.id}" aria-label="Voir la fiche">${fig(e.id)}</button>
          <div class="ex-body">
            <div class="ex-title"><b>${esc(x.n)}</b><span class="chip">${esc(mgTxt(x))}</span><span class="muted" style="font-size:.8rem">${x.eq}</span></div>
            <div class="dosage">
              <div class="field"><label for="f-s-${i}">Séries</label><input class="inp" id="f-s-${i}" data-f="s" data-i="${i}" value="${esc(e.s)}" inputmode="numeric" ${off}></div>
              <div class="field"><label for="f-rep-${i}">Rép./durée</label><input class="inp" id="f-rep-${i}" data-f="rep" data-i="${i}" value="${esc(e.rep)}" ${off}></div>
              <div class="field"><label for="f-t-${i}">Tempo</label><input class="inp" id="f-t-${i}" data-f="t" data-i="${i}" value="${esc(e.t)}" title="Excentrique-pause-concentrique, en secondes" ${off}></div>
              <div class="field"><label for="f-rest-${i}">Repos (s)</label><input class="inp" id="f-rest-${i}" data-f="rest" data-i="${i}" value="${esc(e.rest)}" inputmode="numeric" ${off}></div>
              <div class="field"><label for="f-load-${i}">Charge</label><input class="inp" id="f-load-${i}" data-f="load" data-i="${i}" value="${esc(e.load)}" ${off}></div>
            </div>
            <input class="inp" id="f-note-${i}" data-f="note" data-i="${i}" value="${esc(e.note)}" placeholder="Consigne pour le client (ex. arrêter si douleur > 4/10)" aria-label="Consigne" ${off}>
          </div>
          <div class="ex-tools" ${L?"hidden":""}>
            <button class="icon-btn" data-mv="${i}" data-dir="-1" aria-label="Monter" ${i===0?"disabled":""}>${I.up}</button>
            <button class="icon-btn" data-mv="${i}" data-dir="1" aria-label="Descendre" ${i===p.ex.length-1?"disabled":""}>${I.down}</button>
            <button class="icon-btn" data-rm="${i}" aria-label="Retirer">${I.x}</button>
          </div>
        </article>`}).join(""):`<div class="empty">${L?"Ce programme verrouillé ne contient aucun exercice.":"Glissez un exercice ici ou cliquez sur + dans la bibliothèque."}</div>`}
      </div>
    </div>
    <aside class="panel lib-side">
      <div class="panel-h"><h2>Bibliothèque</h2><span class="muted num" style="font-size:.8rem">${list.length}/${EXERCISES.length}</span></div>
      <div class="search">${I.search}<input class="inp" id="b-q" placeholder="Rechercher un exercice" value="${esc(ui.bQ)}" aria-label="Rechercher"></div>
      <span class="eyebrow">Muscles travaillés</span>
      ${chipRow("bM",MUSCLE_NAMES,ui.bM,null,"Muscles travaillés")}
      <div class="lib-scroll">${list.map(e=>`
        <div class="lib-item" draggable="true" data-drag="${e.id}"><button class="open-fig" data-open="${e.id}" aria-label="Voir la fiche">${fig(e.id)}</button>
          <div style="min-width:0"><b>${esc(e.n)}</b><span>${esc(mgTxt(e))} · ${e.eq}</span></div>
          <button class="icon-btn" data-add="${e.id}" aria-label="Ajouter ${esc(e.n)}" ${off}>${I.plus}</button></div>`).join("")||`<p class="muted">Aucun exercice ne correspond.</p>`}</div>
    </aside>
  </div>`;
}

/* ---------- Bibliothèque ---------- */
function vLibrary(){
  const q=ui.libQ.trim().toLowerCase();
  const list=EXERCISES.filter(e=>anyOf(ui.libM,e.mg)&&(ui.libEq==="Tous"||e.eq===ui.libEq)&&(ui.libPh==="Toutes"||e.ph<=+ui.libPh)&&anyOf(ui.libLt,[loadType(e)])
    &&(!q||[e.n,e.desc,e.m,e.eq].join(" ").toLowerCase().includes(q)));
  return `
  <div class="head"><div class="head-l"><span class="eyebrow">${EXERCISES.length} exercices · ${MUSCLE_NAMES.length} groupes musculaires</span><h1>Bibliothèque d'exercices</h1></div></div>
  <div class="toolbar">
    <div class="search">${I.search}<input class="inp" id="l-q" placeholder="Rechercher par nom, muscle ou description" value="${esc(ui.libQ)}" aria-label="Rechercher"></div>
    <select class="inp" id="l-eq" style="width:auto" aria-label="Équipement">${["Tous",...EQUIP].map(x=>`<option value="${x}" ${x===ui.libEq?"selected":""}>${x==="Tous"?"Tout l'équipement":x}</option>`).join("")}</select>
    <select class="inp" id="l-ph" style="width:auto" aria-label="Phase">${["Toutes",0,1,2,3].map(x=>`<option value="${x}" ${String(x)===String(ui.libPh)?"selected":""}>${x==="Toutes"?"Toutes les phases":`Permis en phase ${x+1}`}</option>`).join("")}</select>
  </div>
  <div class="filter-block"><span class="eyebrow">Muscles travaillés</span>
    ${chipRow("libM",MUSCLE_NAMES,ui.libM,v=>EXERCISES.filter(e=>e.mg.includes(v)).length,"Muscles travaillés")}</div>
  <div class="filter-block"><span class="eyebrow">Type de charge</span>
    ${chipRow("libLt",LOADS,ui.libLt,v=>EXERCISES.filter(e=>loadType(e)===v).length,"Type de charge")}</div>
  <p class="muted" style="font-size:.85rem;margin-top:-6px"><span class="num">${list.length}</span> exercice${list.length>1?"s":""} affiché${list.length>1?"s":""}. Cochez plusieurs choix pour combiner les filtres.</p>
  <div class="lib-grid">${list.map(e=>`
    <article class="lib-card">
      <button class="fig-btn" data-open="${e.id}" aria-label="Voir la fiche : ${esc(e.n)}">${fig(e.id,"md")}</button>
      <div style="display:flex;flex-direction:column;gap:6px">
        <h3><button class="title-btn" data-open="${e.id}">${esc(e.n)}</button>${isEdited(e.id)?` <span class="chip warn" style="vertical-align:middle">Modifié</span>`:""}</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${e.mg.map(g=>`<span class="chip">${esc(g)}</span>`).join("")}<span class="chip">${e.eq}</span><span class="chip acc">Dès la phase ${e.ph+1}</span></div>
      </div>
      <p class="clamp">${esc(e.desc)}</p>
      <div class="lib-card-f"><span class="dose">${esc(doseTxt(e.d))}</span>
        <button class="btn sm" data-add-lib="${e.id}">${I.plus} Ajouter</button></div>
    </article>`).join("")||`<p class="muted">Aucun exercice ne correspond à ces filtres.</p>`}</div>
  <p class="muted" style="font-size:.85rem">${C(ui.builder)?`« Ajouter » place l'exercice dans « ${esc(BP().name)} » de ${esc(C(ui.builder).n)}.`:"Ajoutez un client pour pouvoir placer des exercices dans son programme."} Sur chaque illustration, la silhouette pâle montre la position de départ et la zone verte la région ciblée.</p>`;
}

/* ---------- Fiche d'exercice ---------- */
let anim=null;
function openSheet(id){
  const e=EX[id], sh=$("#sheet");
  sh.innerHTML=`<div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheet-t">
    <div class="sheet-fig">${fig(id,"lg").replace('class="fig lg"',`class="fig lg" id="sheet-svg" data-ex="${id}"`)}
      <div class="sheet-cap"><span id="sheet-lbl">Mouvement animé</span><button class="btn sm" id="sheet-play">Pause</button></div></div>
    <div class="sheet-body">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div style="display:flex;flex-direction:column;gap:6px;min-width:0"><span class="eyebrow">${esc(e.mg.join(" · "))} · ${e.eq}${isEdited(id)?` · <span class="chip warn">Modifié</span>`:""}</span><h2 id="sheet-t" style="font-size:1.4rem">${esc(e.n)}</h2></div>
        <div style="display:flex;gap:4px"><button class="icon-btn" data-ex-edit="${id}" aria-label="Modifier le nom et les étapes" title="Modifier le nom et les étapes">${I.edit}</button>
        <button class="icon-btn" data-close aria-label="Fermer">${I.x}</button></div></div>
      <p>${esc(e.desc)}</p>
      <div class="facts">
        <div><span class="eyebrow">Muscles ciblés</span><span>${esc(e.m)}</span></div>
        <div><span class="eyebrow">Dosage de départ</span><span class="num">${esc(e.d.s)} × ${esc(e.d.rep)}${e.d.t!=="—"?` · tempo ${esc(e.d.t)}`:""}${+e.d.rest?` · repos ${esc(e.d.rest)} s`:""}</span></div>
        <div><span class="eyebrow">Phase</span><span>Dès la phase ${e.ph+1} · ${PHASES[e.ph]}</span></div>
        <div><span class="eyebrow">Charge</span><span>${esc(e.d.load)}</span></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="eyebrow">Exécution</span><button class="link" data-ex-edit="${id}" style="font-size:.85rem">Modifier le nom et les étapes</button></div>
        <ol class="steps">${e.steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol></div>
      <div class="cue-box"><span class="eyebrow">Consigne clé</span><span>${esc(e.cue)}</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${C(ui.builder)?`<button class="btn primary" data-add-sheet="${id}">${I.plus} Ajouter à « ${esc(BP().name)} »</button>`:`<span class="muted" style="font-size:.88rem">Ajoutez un client pour utiliser cet exercice dans un programme.</span>`}</div>
    </div></div>`;
  sh.hidden=false; document.body.style.overflow="hidden";
  sh.querySelector("[data-close]").focus();
  startAnim(e);
}
function startAnim(e){
  stopAnim();
  const svg=$("#sheet-svg"), reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(reduce){$("#sheet-lbl").textContent="Pâle : départ · foncé : arrivée";$("#sheet-play").hidden=true;return}
  const t0=performance.now();
  const frame=now=>{const ph=((now-t0)/2600)%1, t=(1-Math.cos(ph*2*Math.PI))/2;
    svg.innerHTML=sceneSVG(e,t); anim=requestAnimationFrame(frame)};
  anim=requestAnimationFrame(frame);
}
function stopAnim(){if(anim){cancelAnimationFrame(anim);anim=null}}
function closeSheet(){stopAnim();const sh=$("#sheet");sh.hidden=true;sh.innerHTML="";document.body.style.overflow=""}

/* ---------- Rendu ---------- */
function render(){
  if(!DK) return;   // rien n'est affiché tant que l'application est verrouillée
  syncSel();
  renderNav();
  const v={dash:vDash,clients:vClients,client:vClient,builder:vBuilder,library:vLibrary,backup:vBackup,compliance:vCompliance}[ui.view]||vDash;
  $("#main").innerHTML=v();
  try{localStorage.setItem(VIEW_KEY,ui.view==="client"?"clients":ui.view)}catch(e){}
}
function go(view){ui.view=view;render();window.scrollTo(0,0)}
let tt;
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(tt);tt=setTimeout(()=>t.classList.remove("show"),2200)}
function addEx(id){const p=BP();if(!p){toast("Ajoutez d'abord un client");return false}if(!guardProg())return false;p.ex.push(mk(id));save();return true}

/* ---------- Nouveau programme ---------- */
function openNewProg(cid){
  const c=C(cid), cur=AP(c), sh=$("#sheet");
  if(!guardClient(c)) return;
  sh.innerHTML=`<form class="sheet-card form-card" id="prog-form" role="dialog" aria-modal="true" aria-labelledby="np-t" novalidate>
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
      <div style="display:flex;flex-direction:column;gap:4px"><span class="eyebrow">${esc(c.n)}</span><h2 id="np-t" style="font-size:1.4rem">Nouveau programme</h2></div>
      <button type="button" class="icon-btn" data-close aria-label="Fermer">${I.x}</button></div>
    <input type="hidden" id="np-c" value="${c.id}">
    <div class="form-grid">
      <div class="field span2"><label for="np-name">Nom du programme</label><input class="inp" id="np-name" autocomplete="off" placeholder="Ex. Cheville, retour à la course"><span class="err" id="np-name-err" hidden>Donnez un nom au programme.</span></div>
      <div class="field span2"><label for="np-dx">Objectif du programme</label><input class="inp" id="np-dx" autocomplete="off" placeholder="Ex. reprendre la course sans douleur d'ici 8 semaines"></div>
      <div class="span2">${phaseField("np-phase",cur.phase)}</div>
    </div>
    <fieldset class="opts"><legend class="eyebrow">Point de départ</legend>
      <label><input type="radio" name="np-from" value="copy" ${cur.ex.length?"checked":"disabled"}> Copier les exercices de « ${esc(cur.name)} » (${cur.ex.length})</label>
      <label><input type="radio" name="np-from" value="empty" ${cur.ex.length?"":"checked"}> Commencer un programme vide</label>
    </fieldset>
    <p class="muted" style="font-size:.85rem">Le nouveau programme devient le programme actuel. « ${esc(cur.name)} » reste dans l'historique du client.</p>
    <div class="form-actions"><button type="button" class="btn" data-close>Annuler</button><button type="submit" class="btn primary">Créer le programme</button></div>
  </form>`;
  sh.hidden=false; document.body.style.overflow="hidden"; $("#np-name").focus();
}
function submitNewProg(){
  const c=C($("#np-c").value), name=$("#np-name").value.trim();
  $("#np-name-err").hidden=!!name; if(!name){$("#np-name").focus();return}
  const cur=AP(c), copy=document.querySelector('input[name="np-from"]:checked')?.value==="copy";
  const p={id:newId("p"),name,dx:$("#np-dx").value.trim(),phase:phaseVal("np-phase"),freq:cur.freq,freqMax:cur.freqMax,created:TODAY,
    ex:copy?cur.ex.map(e=>({...e})):[]};
  c.progs.push(p); c.active=p.id; logAudit(c,`Programme créé : ${name}${copy?` (copie de « ${cur.name} »)`:""}`); save(); closeSheet();
  ui.builder=c.id; ui.bp=p.id; go("builder"); toast(`« ${name} » créé`);
}
function confirmDelProg(key){
  const [cid,pid]=key.split(":"), c=C(cid), p=c.progs.find(x=>x.id===pid), sh=$("#sheet");
  if(progLocked(c,p)){ toast("Un programme verrouillé ne peut pas être supprimé."); return }
  sh.innerHTML=`<div class="sheet-card form-card" role="alertdialog" aria-modal="true" aria-labelledby="dp-t">
    <h2 id="dp-t" style="font-size:1.3rem">Supprimer « ${esc(p.name)} » ?</h2>
    <p class="muted">Ce programme et ses ${p.ex.length} exercices seront effacés de l'historique de ${esc(c.n)}. Les séances déjà saisies sont conservées.</p>
    <div class="form-actions"><button type="button" class="btn" data-close>Annuler</button>
      <button type="button" class="btn danger-solid" data-del-prog-confirm="${key}">${I.trash} Supprimer le programme</button></div></div>`;
  sh.hidden=false; document.body.style.overflow="hidden"; sh.querySelector("[data-close]").focus();
}

/* ---------- Modifier un exercice (nom et étapes) ---------- */
const stepRow = (v,i)=>`<div class="step-row"><span class="step-n num">${i+1}</span>
  <textarea class="inp" rows="2" aria-label="Étape ${i+1}">${esc(v)}</textarea>
  <button type="button" class="icon-btn" data-step-del aria-label="Retirer l'étape ${i+1}" title="Retirer l'étape">${I.x}</button></div>`;
function openExEdit(id){
  const e=EX[id], o=EX_ORIG[id], body=$("#sheet .sheet-body");
  body.innerHTML=`<form id="exedit-form" class="exedit" novalidate>
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
      <div style="display:flex;flex-direction:column;gap:4px"><span class="eyebrow">Modifier l'exercice</span><h2 style="font-size:1.3rem">${esc(e.n)}</h2></div>
      <button type="button" class="icon-btn" data-close aria-label="Fermer">${I.x}</button></div>
    <input type="hidden" id="exedit-id" value="${id}">
    <div class="field"><label for="exedit-n">Nom de l'exercice</label><input class="inp" id="exedit-n" value="${esc(e.n)}" autocomplete="off">
      ${e.n!==o.n?`<span class="muted" style="font-size:.8rem">Nom d'origine : ${esc(o.n)}</span>`:""}
      <span class="err" id="exedit-n-err" hidden>Le nom ne peut pas être vide.</span></div>
    <div class="field"><label>Étapes d'exécution</label>
      <div id="exedit-steps" class="step-list">${e.steps.map(stepRow).join("")}</div>
      <button type="button" class="btn sm" data-step-add style="align-self:flex-start">${I.plus} Ajouter une étape</button>
      <span class="err" id="exedit-s-err" hidden>Gardez au moins une étape.</span></div>
    <p class="muted" style="font-size:.85rem">Les changements s'appliquent partout : bibliothèque, programmes et PDF. Ils sont enregistrés dans ce navigateur et inclus dans vos sauvegardes.</p>
    <div class="form-actions">
      ${isEdited(id)?`<button type="button" class="btn" data-ex-reset="${id}" style="margin-right:auto">Rétablir l'original</button>`:""}
      <button type="button" class="btn" data-ex-back="${id}">Annuler</button>
      <button type="submit" class="btn primary">Enregistrer</button></div>
  </form>`;
  $("#exedit-n").focus();
}
function renumberSteps(){
  document.querySelectorAll("#exedit-steps .step-row").forEach((r,i)=>{
    r.querySelector(".step-n").textContent=i+1;
    r.querySelector("textarea").setAttribute("aria-label",`Étape ${i+1}`);
    r.querySelector("[data-step-del]").setAttribute("aria-label",`Retirer l'étape ${i+1}`);
  });
}
function addStepRow(){
  const list=$("#exedit-steps"), n=list.children.length;
  list.insertAdjacentHTML("beforeend",stepRow("",n));
  list.lastElementChild.querySelector("textarea").focus();
}
function submitExEdit(){
  const id=$("#exedit-id").value, o=EX_ORIG[id];
  const n=$("#exedit-n").value.trim();
  const steps=[...document.querySelectorAll("#exedit-steps textarea")].map(t=>t.value.trim()).filter(Boolean);
  $("#exedit-n-err").hidden=!!n; $("#exedit-s-err").hidden=steps.length>0;
  if(!n||!steps.length) return;
  S.exEdits=S.exEdits||{};
  const same = n===o.n && steps.length===o.steps.length && steps.every((s,i)=>s===o.steps[i]);
  if(same) delete S.exEdits[id]; else S.exEdits[id]={n,steps};
  applyExEdits(); save(); render(); openSheet(id); toast(same?"Aucun changement par rapport à l'original":"Exercice modifié");
}
function resetExEdit(id){
  delete S.exEdits[id]; applyExEdits(); save(); render(); openSheet(id); toast("Exercice rétabli");
}

/* ---------- Saisie d'une séance ---------- */
function openLog(cid,i){
  const c=C(cid), d=iso(weekDates[i]), cur=c.log.find(l=>l.date===d), sh=$("#sheet");
  if(!guardClient(c)) return;
  sh.innerHTML=`<form class="sheet-card form-card" id="log-form" role="dialog" aria-modal="true" aria-labelledby="lg-t" style="width:min(440px,100%)">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
      <div style="display:flex;flex-direction:column;gap:4px"><span class="eyebrow">${esc(c.n)}</span><h2 id="lg-t" style="font-size:1.3rem">Séance du ${esc(fmtDate(weekDates[i]))}</h2></div>
      <button type="button" class="icon-btn" data-close aria-label="Fermer">${I.x}</button></div>
    <input type="hidden" id="lg-c" value="${c.id}"><input type="hidden" id="lg-d" value="${d}">
    <div class="field"><label for="lg-pain">Douleur rapportée pendant la séance (0 à 10)</label>
      <select class="inp" id="lg-pain">${[...Array(11)].map((_,v)=>`<option value="${v}" ${v===(cur?.pain??2)?"selected":""}>${v}${v===0?" · aucune":v===5?" · modérée":v===10?" · pire imaginable":""}</option>`).join("")}</select></div>
    <div class="form-actions">
      ${cur?`<button type="button" class="btn danger" data-log-del style="margin-right:auto">${I.trash} Retirer la séance</button>`:""}
      <button type="button" class="btn" data-close>Annuler</button>
      <button type="submit" class="btn primary">${cur?"Mettre à jour":"Enregistrer la séance"}</button></div>
  </form>`;
  sh.hidden=false; document.body.style.overflow="hidden"; $("#lg-pain").focus();
}
function submitLog(del){
  const c=C($("#lg-c").value), d=$("#lg-d").value;
  if(!guardClient(c)) return;
  const had=c.log.some(l=>l.date===d);
  c.log=c.log.filter(l=>l.date!==d);
  if(!del){ c.log.push({date:d,pain:+$("#lg-pain").value,prog:c.active}); c.log.sort((a,b)=>a.date<b.date?-1:1); }
  logAudit(c,del?`Séance retirée : ${dLong(d)}`:`Séance ${had?"modifiée":"saisie"} : ${dLong(d)}, douleur ${$("#lg-pain").value}/10`);
  save(); closeSheet(); render(); toast(del?"Séance retirée":"Séance enregistrée");
}

/* ---------- Formulaire client ---------- */
function openClientForm(id){
  const c=id?C(id):null, sh=$("#sheet");
  if(c&&!guardClient(c)) return;
  sh.innerHTML=`<form class="sheet-card form-card" id="client-form" role="dialog" aria-modal="true" aria-labelledby="cf-t" novalidate>
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
      <div style="display:flex;flex-direction:column;gap:4px"><span class="eyebrow">${c?"Dossier client":"Nouveau dossier"}</span><h2 id="cf-t" style="font-size:1.4rem">${c?"Modifier "+esc(c.n):"Ajouter un client"}</h2></div>
      <button type="button" class="icon-btn" data-close aria-label="Fermer">${I.x}</button></div>
    <input type="hidden" id="cf-id" value="${c?c.id:""}">
    <div class="form-grid">
      <div class="field span2"><label for="cf-n">Nom complet</label><input class="inp" id="cf-n" autocomplete="off" value="${esc(c?.n)}" placeholder="Prénom Nom"><span class="err" id="cf-n-err" hidden>Inscrivez le nom du client.</span></div>
      <div class="field"><label for="cf-birth">Date de naissance</label><input class="inp" id="cf-birth" type="date" min="1900-01-01" max="${TODAY}" value="${esc(c?.birth)}">${c&&!c.birth&&c.age?`<span class="muted" style="font-size:.8rem">Âge inscrit auparavant : ${c.age} ans</span>`:""}<span class="err" id="cf-birth-err" hidden>La date de naissance ne peut pas être dans le futur.</span></div>
      <div class="field"><label for="cf-start">Début du suivi</label><input class="inp" id="cf-start" type="date" value="${esc(c?.start||TODAY)}"></div>
      <div class="field span2"><label for="cf-email">Adresse courriel <span class="muted" style="font-weight:400">(facultatif)</span></label><input class="inp" id="cf-email" type="email" autocomplete="off" value="${esc(c?.email)}" placeholder="client@exemple.ca"><span class="err" id="cf-email-err" hidden>Cette adresse courriel n'est pas valide.</span></div>
      <div class="field span2"><label for="cf-notes">Notes cliniques et précautions <span class="muted" style="font-weight:400">(facultatif)</span></label><textarea class="inp" id="cf-notes" rows="3" placeholder="Ex. pas de flexion au-delà de 90° avant 6 semaines">${esc(c?.notes)}</textarea></div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" data-close>Annuler</button>
      <button type="submit" class="btn primary">${c?"Enregistrer":"Ajouter le client"}</button></div>
  </form>`;
  sh.hidden=false; document.body.style.overflow="hidden";
  $("#cf-n").focus();
}
function submitClient(){
  const v=k=>$("#cf-"+k).value.trim();
  const n=v("n");
  $("#cf-n-err").hidden=!!n;
  if(!n){$("#cf-n").focus();return}
  const birth=v("birth");
  $("#cf-birth-err").hidden=!(birth&&birth>TODAY);
  if(birth&&birth>TODAY){$("#cf-birth").focus();return}
  const email=v("email");
  $("#cf-email-err").hidden=!email||emailOk(email);
  if(email&&!emailOk(email)){$("#cf-email").focus();return}
  const data={n,start:v("start")||TODAY,notes:v("notes"),email};
  if(birth){ data.birth=birth; data.age=null; }
  const id=v("id");
  if(id){const c=C(id); if(!guardClient(c)) return; Object.assign(c,data);logAudit(c,"Fiche du client modifiée");save();closeSheet();render();toast("Dossier mis à jour")}
  else{
    const pid=newId("p");
    const c={id:newId("c"),...data,log:[],active:pid,progs:[{id:pid,name:"Programme de "+n.split(" ")[0],dx:"",phase:"",freq:3,ex:[],created:TODAY}]};
    S.clients.push(c);logAudit(c,"Dossier créé");save();ui.client=c.id;ui.builder=c.id;ui.bp=pid;closeSheet();go("client");toast(`${n} ajouté`);
  }
}
function confirmDelete(id){
  const c=C(id), sh=$("#sheet");
  if(!guardClient(c)) return;
  sh.innerHTML=`<div class="sheet-card form-card" role="alertdialog" aria-modal="true" aria-labelledby="del-t" aria-describedby="del-d">
    <h2 id="del-t" style="font-size:1.3rem">Supprimer le dossier de ${esc(c.n)} ?</h2>
    <p id="del-d" class="muted">Son programme, ses séances enregistrées et ses notes de douleur seront effacés. Cette action est définitive.</p>
    <div class="form-actions"><button type="button" class="btn" data-close>Annuler</button>
      <button type="button" class="btn danger-solid" data-del-confirm="${c.id}">${I.trash} Supprimer définitivement</button></div></div>`;
  sh.hidden=false; document.body.style.overflow="hidden";
  sh.querySelector("[data-close]").focus();
}

document.addEventListener("click",ev=>{
  const b=ev.target.closest("button"); if(!b) return;
  const d=b.dataset;
  if(d.open){openSheet(d.open);return}
  if(d.close!==undefined){closeSheet();return}
  if(d.export){const [cid,pid]=d.export.split(":");openExport(cid,pid);return}
  if(d.newProg){openNewProg(d.newProg);return}
  if(d.delProgConfirm){const [cid,pid]=d.delProgConfirm.split(":");const c=C(cid);const p=c.progs.find(p=>p.id===pid);if(progLocked(c,p)){toast("Un programme verrouillé ne peut pas être supprimé.");return}c.progs=c.progs.filter(x=>x.id!==pid);logAudit(c,`Programme supprimé : ${p.name}`);save();closeSheet();render();toast(`« ${p.name} » supprimé`);return}
  if(d.lockProg){openLockConfirm("prog",d.lockProg);return}
  if(d.lockClient){openLockConfirm("client",d.lockClient);return}
  if(d.lockGo){doLock(d.lockGo,b);return}
  if(b.id==="lock-now"||b.id==="lock-now2"){lockNow(false);return}
  if(b.id==="sec-pw"){openPwChange();return}
  if(b.id==="sec-rec"){openRecRenew();return}
  if(b.id==="rec-copy"){const t=$("#rec-code").textContent;navigator.clipboard?.writeText(t).then(()=>{b.textContent="Clé copiée"}).catch(()=>{b.textContent="Sélectionnez la clé et copiez-la avec Ctrl+C"});return}
  if(b.id==="bk-decrypt"){decryptPending();return}
  if(d.delProg){confirmDelProg(d.delProg);return}
  if(d.logDay!==undefined){openLog(ui.client,+d.logDay);return}
  if(d.logDel!==undefined){submitLog(true);return}
  if(b.id==="bk-export"){exportData();return}
  if(b.id==="bk-pick"){$("#bk-file").click();return}
  if(b.id==="bk-confirm"){applyImport();return}
  if(b.id==="bk-cancel"){pendingImport=null;render();return}
  if(d.exEdit){openExEdit(d.exEdit);return}
  if(d.stepAdd!==undefined){addStepRow();return}
  if(d.stepDel!==undefined){const rows=document.querySelectorAll("#exedit-steps .step-row"); if(rows.length>1) b.closest(".step-row").remove(); renumberSteps(); return}
  if(d.exReset){resetExEdit(d.exReset);return}
  if(d.exBack){openSheet(d.exBack);return}
  if(d.newClient!==undefined){openClientForm();return}
  if(d.editClient){openClientForm(d.editClient);return}
  if(d.delClient){confirmDelete(d.delClient);return}
  if(d.delConfirm){const c=C(d.delConfirm);if(!guardClient(c))return;S.clients=S.clients.filter(x=>x.id!==c.id);save();closeSheet();go("clients");toast(`Dossier de ${c.n} supprimé`);return}
  if(d.addSheet){if(!addEx(d.addSheet))return;closeSheet();if(ui.view==="builder")render();toast(`${EX[d.addSheet].n} ajouté à « ${BP().name} »`);return}
  if(b.id==="sheet-play"){if(anim){stopAnim();b.textContent="Lecture"}else{startAnim(EX[$("#sheet-svg").dataset.ex]);b.textContent="Pause"}return}
  if(d.go){go(d.go)}
  else if(d.client){ui.client=d.client;go("client")}
  else if(d.build){ui.builder=d.build;ui.bp=C(d.build)?.active;go("builder")}
  else if(d.buildProg){const [cid,pid]=d.buildProg.split(":");ui.builder=cid;ui.bp=pid;go("builder")}
  else if(d.activate){const [cid,pid]=d.activate.split(":");const c=C(cid);if(!guardClient(c))return;c.active=pid;logAudit(c,`Programme actuel : ${c.progs.find(p=>p.id===pid).name}`);save();render();toast(`« ${c.progs.find(p=>p.id===pid).name} » est maintenant le programme actuel`)}
  else if(d.freq){if(!guardProg())return;setFreq(BP(),+d.freq);save();render()}
  else if(d.mv!==undefined){if(!guardProg())return;const a=BP().ex,i=+d.mv,j=i+ +d.dir;[a[i],a[j]]=[a[j],a[i]];save();render()}
  else if(d.rm!==undefined){if(!guardProg())return;const a=BP().ex;const r=a.splice(+d.rm,1)[0];save();render();toast(`${EX[r.id].n} retiré`)}
  else if(d.add){if(addEx(d.add)){render();toast(`${EX[d.add].n} ajouté`)}}
  else if(d.addLib){if(addEx(d.addLib))toast(`Ajouté à « ${BP().name} » (${C(ui.builder).n})`)}
  else if(d.flt){ui[d.flt]=d.v?toggleIn(ui[d.flt],d.v):[];render()}
});
document.addEventListener("submit",ev=>{if(ev.target.id==="client-form"){ev.preventDefault();submitClient()}
  else if(ev.target.id==="export-form"){ev.preventDefault();submitExport()}
  else if(ev.target.id==="log-form"){ev.preventDefault();submitLog(false)}
  else if(ev.target.id==="prog-form"){ev.preventDefault();submitNewProg()}
  else if(ev.target.id==="exedit-form"){ev.preventDefault();submitExEdit()}
  else if(ev.target.id==="addendum-form"){ev.preventDefault();submitAddendum()}
  else if(ev.target.id==="pw-form"){ev.preventDefault();submitPwChange()}
  else if(ev.target.id==="rec-form"){ev.preventDefault();submitRecRenew()}});
document.addEventListener("keydown",ev=>{if(ev.key==="Escape"&&!$("#sheet").hidden)closeSheet()});
$("#sheet").addEventListener("click",ev=>{if(ev.target.id==="sheet")closeSheet()});
document.addEventListener("input",ev=>{
  const t=ev.target;
  if((t.dataset.f||t.id==="b-name"||t.id==="b-dx")&&progLocked(C(ui.builder),BP())) return;
  if(t.dataset.f){const e=BP().ex[+t.dataset.i];e[t.dataset.f]=t.value;save()}
  else if(t.id==="b-name"){BP().name=t.value;save()}
  else if(t.id==="b-dx"){BP().dx=t.value;save()}
  else if(t.dataset.phaseCustom){const id=t.dataset.phaseCustom, target=id==="b-phase"?BP():id==="phase-sel"?AP(C(ui.client)):null; if(target){target.phase=t.value.trim();save()}}
  else if(t.id==="b-q"||t.id==="l-q"){
    if(t.id==="b-q")ui.bQ=t.value;else ui.libQ=t.value;
    const pos=t.selectionStart;render();const n=document.getElementById(t.id);n.focus();n.setSelectionRange(pos,pos);
  }
});
document.addEventListener("change",ev=>{
  const t=ev.target;
  if(t.id==="bk-file"){ if(t.files[0]) readBackup(t.files[0]); t.value=""; return }
  if(t.id==="b-client"){ui.builder=t.value;ui.bp=C(t.value).active;render()}
  else if(t.id==="b-prog"){ui.bp=t.value;render()}
  else if(t.dataset.phaseField!==undefined){
    const inp=$("#"+t.id+"-custom"), custom=t.value==="__custom";
    inp.hidden=!custom; if(custom){inp.focus()}
    const target = t.id==="b-phase"?BP():t.id==="phase-sel"?AP(C(ui.client)):null;
    const owner = t.id==="b-phase"?C(ui.builder):C(ui.client);
    if(target && progLocked(owner,target)) return;
    if(target && !custom && t.value){ target.phase=t.value; if(t.id==="phase-sel") logAudit(owner,`Phase : ${t.value}`); save(); toast(`Phase : ${t.value}`) }
  }
  else if(t.id==="obj-sel"){const c=C(ui.client);if(progLocked(c,AP(c)))return;AP(c).dx=t.value.trim();logAudit(c,"Objectif du programme modifié");save();render();toast("Objectif enregistré")}
  else if(t.id==="sec-delay"){S.settings=S.settings||{};S.settings.lockMin=+t.value;save();armIdle();toast(`Verrouillage automatique après ${t.value} minutes`)}
  else if(t.id==="l-eq"){ui.libEq=t.value;render()}
  else if(t.id==="l-ph"){ui.libPh=t.value;render()}
  else if(t.id==="b-name"){render()}
});
/* Glisser-déposer depuis la bibliothèque */
document.addEventListener("dragstart",ev=>{const it=ev.target.closest?.("[data-drag]");if(it){ev.dataTransfer.setData("text/plain",it.dataset.drag);ev.dataTransfer.effectAllowed="copy"}});
document.addEventListener("dragover",ev=>{const l=ev.target.closest?.("#prog-list");if(l){ev.preventDefault();l.classList.add("drop")}});
document.addEventListener("dragleave",ev=>{const l=ev.target.closest?.("#prog-list");if(l&&!l.contains(ev.relatedTarget))l.classList.remove("drop")});
document.addEventListener("drop",ev=>{const l=ev.target.closest?.("#prog-list");if(!l)return;ev.preventDefault();l.classList.remove("drop");const id=ev.dataTransfer.getData("text/plain");if(EX[id]&&addEx(id)){render();toast(`${EX[id].n} ajouté`)}});

/* ---------- Sauvegarde dans un fichier ---------- */
/* Enregistre un fichier : capacité « downloads » dans claude.ai, lien de téléchargement ailleurs */
async function saveFile(name,data){
  if(window.claude?.use){
    const dl=await window.claude.use("downloads");
    if(!dl) throw {code:"unavailable"};
    return dl.save({filename:name,data});
  }
  const blob=data instanceof Blob?data:new Blob([data],{type:"application/octet-stream"});
  const url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  return {status:"saved"};
}
const localDay = stamp=>iso(new Date(stamp));
const daysSince = stamp=>Math.round((new Date(TODAY)-new Date(localDay(stamp)))/864e5);
const progCount = data=>data.clients.reduce((n,c)=>n+(c.progs?c.progs.length:1),0);
function backupAge(){
  if(!S.lastBackup) return "Aucune sauvegarde pour l'instant";
  const d=daysSince(S.lastBackup);
  return d===0?"Dernière sauvegarde aujourd'hui":d===1?"Dernière sauvegarde hier":`Dernière sauvegarde il y a ${d} jours`;
}
function backupReminder(){
  if(!S.clients.length) return "";
  if(S.lastBackup && daysSince(S.lastBackup)<7) return "";
  return `<div class="banner"><b>${backupAge()}.</b> Vos dossiers ne sont enregistrés que dans ce navigateur. <button class="link" data-go="backup">Sauvegarder dans un fichier</button></div>`;
}
let pendingImport=null;
const isOurBackup = d=>d.app==="Kinoza"||d.app==="Kinéplan";   // les sauvegardes faites sous l'ancien nom restent valides
function vBackup(){
  const nc=S.clients.length, np=progCount(S);
  return `
  <div class="head"><div class="head-l"><span class="eyebrow">${esc(backupAge())}</span><h1>Sécurité et sauvegarde</h1></div></div>
  <section class="panel">
    <h2>Accès et chiffrement</h2>
    <p class="muted" style="max-width:75ch">Vos dossiers sont chiffrés (AES-256) dans ce navigateur et ne s'ouvrent qu'avec votre mot de passe. Kinoza se verrouille tout seul après une période sans activité.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn primary" id="lock-now2">${ico("lock")} Verrouiller maintenant</button>
      <button class="btn" id="sec-pw">Changer le mot de passe</button>
      <button class="btn" id="sec-rec">Nouvelle clé de secours</button></div>
    <div class="field" style="max-width:320px"><label for="sec-delay">Verrouillage automatique après</label>
      <select class="inp" id="sec-delay">${[5,10,15,30,60].map(m=>`<option value="${m}" ${m===lockMin()?"selected":""}>${m} minutes</option>`).join("")}</select></div>
  </section>
  <div class="grid2">
    <section class="panel">
      <h2>Exporter mes données</h2>
      <p class="muted">Crée un fichier <span class="num">.json</span> <b>chiffré</b> avec tous vos clients, leurs programmes, les séances, les notes d'ajout, l'historique, les consentements, les registres des demandes et des incidents, les exercices modifiés et vos réglages. Gardez-le dans un endroit sûr, par exemple une clé USB.</p>
      <p><span class="num">${nc}</span> client${nc>1?"s":""} · <span class="num">${np}</span> programme${np>1?"s":""}</p>
      <div class="field"><label for="bk-pw">Mot de passe du fichier</label><input class="inp" id="bk-pw" type="password" autocomplete="new-password">
        <span class="muted" style="font-size:.8rem">Au moins ${MIN_PW} caractères. Il sera demandé pour importer le fichier. Vous pouvez utiliser votre mot de passe Kinoza.</span></div>
      <div class="field"><label for="bk-pw2">Confirmez le mot de passe du fichier</label><input class="inp" id="bk-pw2" type="password" autocomplete="new-password"></div>
      <p class="err" id="bk-xerr" hidden></p>
      <button class="btn primary" id="bk-export" style="align-self:flex-start" ${nc?"":"disabled"}>${ico("backup")} Exporter mes données</button>
      ${nc?"":`<p class="muted" style="font-size:.85rem">Rien à exporter pour l'instant : ajoutez d'abord un client.</p>`}
    </section>
    <section class="panel">
      <h2>Importer une sauvegarde</h2>
      <p class="muted">Restaure un fichier exporté depuis Kinoza, sur cet appareil ou un autre. L'import <b>remplace</b> toutes les données actuellement enregistrées dans ce navigateur.</p>
      <input type="file" id="bk-file" accept=".json,application/json" hidden>
      ${pendingImport?.locked?`
        <div class="confirm-box">
          <b>${esc(pendingImport.name)}</b>
          <span class="muted" style="font-size:.88rem">Sauvegarde chiffrée, exportée le ${esc(dLong(localDay(pendingImport.file.exported)))}.</span>
          <div class="field"><label for="bk-ipw">Mot de passe de la sauvegarde</label><input class="inp" id="bk-ipw" type="password" autocomplete="off"></div>
          <div class="form-actions" style="justify-content:flex-start">
            <button class="btn primary" id="bk-decrypt">Ouvrir la sauvegarde</button>
            <button class="btn" id="bk-cancel">Annuler</button></div>
        </div>`:pendingImport?`
        <div class="confirm-box">
          ${pendingImport.plain?`<span style="font-size:.88rem"><b>Attention :</b> ce fichier n'est pas chiffré. Après l'import, supprimez-le ou remplacez-le par une sauvegarde chiffrée.</span>`:""}
          <b>${esc(pendingImport.name)}</b>
          <span class="muted" style="font-size:.88rem">Exporté le ${esc(dLong(localDay(pendingImport.data.exported)))} · <span class="num">${pendingImport.data.clients.length}</span> client${pendingImport.data.clients.length>1?"s":""} · <span class="num">${progCount(pendingImport.data)}</span> programme${progCount(pendingImport.data)>1?"s":""}</span>
          <span style="font-size:.9rem">${nc?`${nc>1?`Les <span class="num">${nc}</span> clients actuellement dans ce navigateur seront remplacés.`:"Le client actuellement dans ce navigateur sera remplacé."} Exportez-les d'abord si vous voulez les garder.`:"Aucune donnée n'est enregistrée dans ce navigateur pour l'instant : rien ne sera perdu."}</span>
          <div class="form-actions" style="justify-content:flex-start">
            <button class="btn danger-solid" id="bk-confirm">Remplacer mes données</button>
            <button class="btn" id="bk-cancel">Annuler</button></div>
        </div>`:`<button class="btn" id="bk-pick" style="align-self:flex-start">Choisir un fichier…</button>`}
      <p class="err" id="bk-err" hidden></p>
    </section>
  </div>
  <section class="panel">
    <h2>Combien de temps les données restent-elles dans ce navigateur ?</h2>
    <p class="muted" style="max-width:75ch">Les dossiers restent dans ce navigateur jusqu'à ce que ses données soient effacées. Ils disparaissent si vous videz les données de navigation, en navigation privée, ou dans Safari si la page n'est pas ouverte pendant 7 jours. Un autre navigateur ou appareil ne les voit pas. Exportez une sauvegarde au moins une fois par semaine.</p>
  </section>
  ${relayPanel()}
  ${eraseZone()}`;
}
async function exportData(){
  const btn=$("#bk-export"), pw=$("#bk-pw").value, pw2=$("#bk-pw2").value, err=$("#bk-xerr");
  const p=pwProblem(pw,pw2); if(p){ err.textContent=p; err.hidden=false; return }
  err.hidden=true; btn.disabled=true; btn.textContent="Chiffrement…";
  const payload={app:"Kinoza",format:1,exported:new Date().toISOString(),clients:S.clients,settings:S.settings||{},exEdits:S.exEdits||{},requests:S.requests||[],incidents:S.incidents||[],destructions:S.destructions||[]};
  const name=`Kinoza - sauvegarde - ${TODAY}.json`;
  try{
    await saveFile(name,JSON.stringify(await encryptBackup(payload,pw)));
    S.lastBackup=new Date().toISOString(); save(); render(); toast("Sauvegarde enregistrée");
  }catch(e){
    btn.disabled=false; btn.innerHTML=`${ico("backup")} Exporter mes données`;
    if(e?.code==="declined") toast("Enregistrement annulé");
    else if(e?.code==="rate_limited") toast("Une autre demande d'enregistrement est déjà ouverte");
    else toast("L'enregistrement n'a pas pu se faire dans cet affichage");
  }
}
function readBackup(file){
  const err=$("#bk-err"), fail=m=>{err.textContent=m;err.hidden=false};
  const r=new FileReader();
  r.onload=()=>{
    let data;
    try{ data=JSON.parse(r.result) }catch(e){ return fail("Ce fichier n'est pas une sauvegarde lisible. Choisissez le fichier .json exporté depuis Kinoza.") }
    if(data&&isOurBackup(data)&&data.format===2&&data.enc){ pendingImport={name:file.name,locked:true,file:data}; render(); return }
    if(!data||!isOurBackup(data)||!Array.isArray(data.clients)) return fail("Ce fichier ne vient pas de Kinoza. Choisissez un fichier exporté depuis la page Sauvegarde.");
    if(!data.clients.every(c=>c&&c.id&&typeof c.n==="string")) return fail("Ce fichier de sauvegarde est incomplet ou abîmé, il ne peut pas être importé.");
    data.exported=data.exported||new Date().toISOString();
    pendingImport={name:file.name,data,plain:true}; render();
  };
  r.onerror=()=>fail("Le fichier n'a pas pu être lu. Réessayez.");
  r.readAsText(file);
}
async function decryptPending(){
  const pw=$("#bk-ipw").value, err=$("#bk-err"), b=$("#bk-decrypt");
  if(!pw){ err.textContent="Entrez le mot de passe de la sauvegarde."; err.hidden=false; return }
  b.disabled=true; b.textContent="Déchiffrement…";
  try{
    const data=await decryptBackup(pendingImport.file,pw);
    if(!Array.isArray(data.clients)||!data.clients.every(c=>c&&c.id&&typeof c.n==="string")) throw new Error("contenu");
    pendingImport={name:pendingImport.name,data}; render();
  }catch(e){ b.disabled=false; b.textContent="Ouvrir la sauvegarde"; err.textContent="Mot de passe incorrect, ou fichier abîmé."; err.hidden=false }
}
function applyImport(){
  const data=migrate(structuredClone(pendingImport.data));
  S={clients:data.clients,settings:{...(data.settings||{}),lockMin:lockMin()},exEdits:data.exEdits||{},requests:data.requests||[],incidents:data.incidents||[],destructions:data.destructions||[],lastBackup:data.exported};
  ui.integ={}; ui.integKey={};
  applyExEdits();
  pendingImport=null; ui.client=null; ui.builder=null; ui.bp=null; save();
  go("clients"); toast(`${S.clients.length} client${S.clients.length>1?"s":""} importé${S.clients.length>1?"s":""}`);
}

/* ---------- Verrouillage définitif d'un programme ou d'un dossier ---------- */
function openLockConfirm(kind,key){
  const [cid,pid]=key.split(":"), c=C(cid), p=pid?c.progs.find(x=>x.id===pid):null, sh=$("#sheet");
  const title = kind==="client" ? `Fermer et verrouiller le dossier de ${esc(c.n)} ?` : `Verrouiller « ${esc(p.name)} » ?`;
  const body = kind==="client"
    ? `Le dossier et tous ses programmes passeront en <b>lecture seule, définitivement</b>. Plus personne, vous compris, ne pourra modifier la fiche, les programmes ou les séances, ni supprimer le dossier. Vous pourrez encore consulter, exporter en PDF et ajouter des notes d'ajout datées.`
    : `Le programme passera en <b>lecture seule, définitivement</b> : exercices, dosages, consignes, phase et objectif. Les noms et étapes des exercices sont figés tels qu'ils sont aujourd'hui. Pour le faire évoluer plus tard, créez un nouveau programme à partir d'une copie.`;
  sh.innerHTML=`<div class="sheet-card form-card" role="alertdialog" aria-modal="true" aria-labelledby="lk-t">
    <h2 id="lk-t" style="font-size:1.3rem">${title}</h2>
    <p>${body}</p>
    <p class="muted" style="font-size:.85rem">Une empreinte numérique (SHA-256) est enregistrée : toute modification faite en dehors de Kinoza sera détectée et signalée.</p>
    <label class="check-line"><input type="checkbox" id="lk-understand"> Je comprends que ce verrouillage est définitif.</label>
    <div class="form-actions"><button type="button" class="btn" data-close>Annuler</button>
      <button type="button" class="btn danger-solid" id="lk-confirm" data-lock-go="${kind}:${key}" disabled>${ico("lock")} Verrouiller définitivement</button></div></div>`;
  sh.hidden=false; document.body.style.overflow="hidden"; sh.querySelector("[data-close]").focus();
}
document.addEventListener("change",ev=>{ if(ev.target.id==="lk-understand") $("#lk-confirm").disabled=!ev.target.checked });
async function doLock(key,b){
  const [kind,cid,pid]=key.split(":"), c=C(cid);
  b.disabled=true; b.textContent="Verrouillage…";
  if(kind==="client") await lockClient(c); else await lockProg(c,c.progs.find(x=>x.id===pid));
  await auditQueue; await flush();
  closeSheet(); ui.integKey[c.id]=null; render();
  toast(kind==="client"?"Dossier fermé et verrouillé":"Programme verrouillé");
}

/* ---------- Notes d'ajout ---------- */
async function submitAddendum(){
  const c=C(ui.client), t=$("#ad-text"), text=t.value.trim();
  $("#ad-err").hidden=!!text; if(!text){t.focus();return}
  await addAddendum(c,text); await auditQueue; await flush();
  render(); toast("Note ajoutée au dossier");
}

/* ---------- Mot de passe et clé de secours ---------- */
function openPwChange(){
  const sh=$("#sheet");
  sh.innerHTML=`<form class="sheet-card form-card" id="pw-form" role="dialog" aria-modal="true" aria-labelledby="pw-t" novalidate style="width:min(460px,100%)">
    <div style="display:flex;justify-content:space-between;gap:12px"><h2 id="pw-t" style="font-size:1.3rem">Changer le mot de passe</h2><button type="button" class="icon-btn" data-close aria-label="Fermer">${I.x}</button></div>
    <div class="field"><label for="pw-cur">Mot de passe actuel</label><input class="inp" id="pw-cur" type="password" autocomplete="current-password"></div>
    <div class="field"><label for="pw-new">Nouveau mot de passe</label><input class="inp" id="pw-new" type="password" autocomplete="new-password"><span class="muted" style="font-size:.8rem">Au moins ${MIN_PW} caractères.</span></div>
    <div class="field"><label for="pw-new2">Confirmez le nouveau mot de passe</label><input class="inp" id="pw-new2" type="password" autocomplete="new-password"></div>
    <p class="err" id="pw-err" hidden></p>
    <div class="form-actions"><button type="button" class="btn" data-close>Annuler</button><button type="submit" class="btn primary" id="pw-go">Changer le mot de passe</button></div>
  </form>`;
  sh.hidden=false; document.body.style.overflow="hidden"; $("#pw-cur").focus();
}
async function submitPwChange(){
  const err=$("#pw-err"), fail=m=>{err.textContent=m;err.hidden=false;b.disabled=false;b.textContent="Changer le mot de passe"}, b=$("#pw-go");
  const p=pwProblem($("#pw-new").value,$("#pw-new2").value); if(p) return fail(p);
  b.disabled=true; b.textContent="Vérification…";
  if(!await checkPassword($("#pw-cur").value)) return fail("Le mot de passe actuel est incorrect.");
  await rewrapPassword($("#pw-new").value); closeSheet(); toast("Mot de passe changé");
}
function openRecRenew(){
  const sh=$("#sheet");
  sh.innerHTML=`<form class="sheet-card form-card" id="rec-form" role="dialog" aria-modal="true" aria-labelledby="rc-t" novalidate style="width:min(460px,100%)">
    <div style="display:flex;justify-content:space-between;gap:12px"><h2 id="rc-t" style="font-size:1.3rem">Nouvelle clé de secours</h2><button type="button" class="icon-btn" data-close aria-label="Fermer">${I.x}</button></div>
    <p class="muted">L'ancienne clé ne fonctionnera plus. Utile si vous avez perdu votre clé ou si quelqu'un d'autre l'a vue.</p>
    <div class="field"><label for="rc-cur">Mot de passe actuel</label><input class="inp" id="rc-cur" type="password" autocomplete="current-password"></div>
    <p class="err" id="rc-err" hidden></p>
    <div class="form-actions"><button type="button" class="btn" data-close>Annuler</button><button type="submit" class="btn primary" id="rc-go">Créer une nouvelle clé</button></div>
  </form>`;
  sh.hidden=false; document.body.style.overflow="hidden"; $("#rc-cur").focus();
}
async function submitRecRenew(){
  const b=$("#rc-go"), err=$("#rc-err"); b.disabled=true; b.textContent="Vérification…";
  if(!await checkPassword($("#rc-cur").value)){ err.textContent="Le mot de passe actuel est incorrect."; err.hidden=false; b.disabled=false; b.textContent="Créer une nouvelle clé"; return }
  const code=await rewrapRecovery();
  $("#sheet").innerHTML=`<div class="sheet-card form-card" role="dialog" aria-modal="true" aria-labelledby="rc2-t" style="width:min(460px,100%)">
    <h2 id="rc2-t" style="font-size:1.3rem">Votre nouvelle clé de secours</h2>
    <p class="muted">Notez-la sur papier et rangez-la dans un endroit sûr. Elle ne sera plus affichée.</p>
    <div class="code-box num" id="rec-code">${esc(code)}</div>
    <div class="form-actions" style="justify-content:space-between"><button type="button" class="btn" id="rec-copy">Copier la clé</button><button type="button" class="btn primary" data-close>J'ai noté la clé</button></div></div>`;
}

bootSecurity();
