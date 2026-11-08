/* Kinoza · maquette de la page client (aperçu seulement : rien n'est envoyé ni enregistré) */

let PV=null, pvAnimId=null;   // état de l'aperçu
function openPreview(cid,pid){
  const c=C(cid); if(!c) return;
  PV={cid, pid:pid||c.active, screen:"home", device:PV?.device||"phone", open:null, checks:{}, pain:2, done:false};
  $("#preview").hidden=false; document.body.style.overflow="hidden";
  renderPreview();
  $("#preview .pv-close").focus();
}
function closePreview(){
  stopPvAnim(); PV=null;
  const el=$("#preview"); if(!el) return;
  el.hidden=true; el.innerHTML=""; if($("#sheet").hidden) document.body.style.overflow="";
}
const pvProg = ()=>{const c=C(PV.cid); return c.progs.find(p=>p.id===PV.pid)||AP(c)};

function renderPreview(){
  stopPvAnim();
  const c=C(PV.cid);
  $("#preview").innerHTML=`
    <div class="pv-bar">
      <div class="pv-bar-l"><span class="chip warn">Aperçu</span><span class="muted">Ce que verrait ${esc(c.n)}. Rien n'est envoyé ni enregistré.</span></div>
      <div class="pv-bar-r">
        <div class="seg" role="group" aria-label="Format d'affichage">
          <button data-pv-device="phone" aria-pressed="${PV.device==="phone"}">Téléphone</button>
          <button data-pv-device="desktop" aria-pressed="${PV.device==="desktop"}">Ordinateur</button></div>
        <button class="btn pv-close" data-pv-close>Fermer l'aperçu</button></div>
    </div>
    <div class="pv-stage">
      <div class="pv-frame ${PV.device}" role="region" aria-label="Page client">
        <div class="pv-scroll">${PV.screen==="prog"?pvProgScreen(c):PV.screen==="session"?pvSessionScreen(c):pvHome(c)}</div>
      </div>
    </div>`;
  if(PV.open) startPvAnim(PV.open);
}

/* ---------- Écrans ---------- */
const pvHeader = (c,back)=>{
  const st=S.settings||{};
  return `<header class="pv-top">
    ${back?`<button class="pv-back" data-pv-go="${back}" aria-label="Retour">←</button>`:""}
    <div style="min-width:0"><div class="pv-clinic">${esc(st.clinic||"Votre clinique")}</div>
      ${back?"":`<h1 class="pv-h1">Bonjour ${esc(first(c))}</h1><div class="pv-date">${esc(fmtDate(now))}</div>`}</div></header>`;
};
function pvWeek(c,p){
  const w=weekDone(c), max=fMax(p), ok=w>=fMin(p);
  return `<div class="pv-week"><div class="pv-dots">${[...Array(max)].map((_,i)=>`<i class="${i<w?"on":""}"></i>`).join("")}</div>
    <span>${ok?"Objectif de la semaine atteint, bravo !":`${w} séance${w>1?"s":""} sur ${fLabel(p)} cette semaine`}</span></div>`;
}
function pvHome(c){
  const cur=AP(c), st=S.settings||{}, old=byDate(c.progs.filter(p=>p.id!==c.active));
  return `${pvHeader(c)}
  <div class="pv-body">
    <section class="pv-card pv-hero">
      <span class="pv-eyebrow">Votre programme</span>
      <h2>${esc(cur.name)}</h2>
      ${cur.dx?`<p class="pv-muted" style="white-space:pre-line">${esc(cur.dx)}</p>`:""}
      <div class="pv-facts"><span>${esc(freqShort(cur))}</span><span>${cur.ex.length} exercice${cur.ex.length>1?"s":""}</span>${cur.phase?`<span>${esc(cur.phase)}</span>`:""}</div>
      ${pvWeek(c,cur)}
      <button class="pv-btn primary" data-pv-session="${cur.id}" ${cur.ex.length?"":"disabled"}>Commencer la séance</button>
      <button class="pv-btn" data-pv-prog="${cur.id}">Voir les exercices</button>
    </section>
    ${old.length?`<section class="pv-card"><span class="pv-eyebrow">Programmes précédents</span>
      <ul class="pv-list">${old.map(p=>`<li><button data-pv-prog="${p.id}"><b>${esc(p.name)}</b><span>${esc(dLong(p.created))} · ${p.ex.length} exercices</span></button></li>`).join("")}</ul></section>`:""}
    <section class="pv-card">
      <span class="pv-eyebrow">Votre entraîneur(e)</span>
      <p><b>${esc(st.kin||"Nom de l'entraîneur(e)")}</b></p>
      <p class="pv-muted">${esc(st.contact||"Téléphone et courriel de la clinique")}</p>
      <p class="pv-muted" style="font-size:.85rem">Arrêtez un exercice et contactez-nous si la douleur dépasse 5/10 ou augmente d'une séance à l'autre.</p>
    </section>
  </div>`;
}
function pvExercise(p,e,i,mode){
  const x=exView(p,e.id), open=PV.open===`${p.id}:${i}`;
  const dose=doseParts(e).join(" · ");
  return `<li class="pv-ex ${mode==="session"&&PV.checks[i]?"done":""}">
    <div class="pv-ex-h">
      <button class="pv-ex-fig" data-pv-open="${p.id}:${i}" aria-label="Voir comment faire : ${esc(x.n)}">${fig(e.id)}</button>
      <div style="min-width:0">
        <span class="pv-num">${i+1}</span><b>${esc(x.n)}</b>
        <div class="pv-dose">${esc(dose)}</div>
        ${e.note?`<div class="pv-note">${esc(e.note)}</div>`:""}
      </div>
      ${mode==="session"?`<button class="pv-check" data-pv-check="${i}" aria-pressed="${!!PV.checks[i]}" aria-label="Marquer comme fait">${I.check}</button>`:""}
    </div>
    <button class="pv-link" data-pv-open="${p.id}:${i}" aria-expanded="${open}">${open?"Masquer les instructions":"Voir comment faire"}</button>
    ${open?`<div class="pv-how">
      ${fig(e.id,"lg").replace('class="fig lg"','class="fig lg" id="pv-anim"')}
      <ol class="steps">${x.steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol>
      ${x.cue?`<div class="cue-box"><span class="eyebrow">À retenir</span><span>${esc(x.cue)}</span></div>`:""}</div>`:""}
  </li>`;
}
function pvProgScreen(c){
  const p=pvProg(), isCur=p.id===c.active;
  return `${pvHeader(c,"home")}
  <div class="pv-body">
    <section class="pv-card">
      <span class="pv-eyebrow">${isCur?"Programme actuel":`Programme précédent · ${esc(dLong(p.created))}`}</span>
      <h2>${esc(p.name)}</h2>
      ${p.dx?`<p class="pv-muted" style="white-space:pre-line">${esc(p.dx)}</p>`:""}
      <div class="pv-facts"><span>${esc(freqShort(p))}</span>${p.phase?`<span>${esc(p.phase)}</span>`:""}</div>
      <div class="pv-actions">
        ${isCur&&p.ex.length?`<button class="pv-btn primary" data-pv-session="${p.id}">Commencer la séance</button>`:""}
        <button class="pv-btn" data-pv-pdf="${p.id}" ${p.ex.length?"":"disabled"}>${I.pdf} Imprimer en PDF</button></div>
    </section>
    ${p.ex.length?`<ol class="pv-exlist">${p.ex.map((e,i)=>pvExercise(p,e,i,"view")).join("")}</ol>`:`<p class="pv-muted">Ce programme ne contient pas encore d'exercices.</p>`}
  </div>`;
}
function pvSessionScreen(c){
  const p=pvProg(), n=p.ex.length, done=p.ex.filter((_,i)=>PV.checks[i]).length;
  if(PV.done) return `${pvHeader(c,"home")}
    <div class="pv-body"><section class="pv-card pv-done">
      <div class="pv-done-ico">${I.check}</div>
      <h2>Séance terminée</h2>
      <p>${done} exercice${done>1?"s":""} sur ${n} · douleur ${PV.pain}/10</p>
      <p class="pv-muted">Dans la version en ligne, cette séance serait envoyée à votre entraîneur(e) et s'ajouterait à votre suivi. Ici, rien n'est enregistré.</p>
      <button class="pv-btn primary" data-pv-go="home">Retour à l'accueil</button></section></div>`;
  return `${pvHeader(c,"home")}
  <div class="pv-body">
    <section class="pv-card">
      <span class="pv-eyebrow">Séance du jour</span>
      <h2>${esc(p.name)}</h2>
      <div class="pv-progress" aria-label="${done} sur ${n} exercices faits"><i style="width:${n?Math.round(done/n*100):0}%"></i></div>
      <p class="pv-muted">${done} sur ${n} exercice${n>1?"s":""} fait${done>1?"s":""}</p>
    </section>
    <ol class="pv-exlist">${p.ex.map((e,i)=>pvExercise(p,e,i,"session")).join("")}</ol>
    <section class="pv-card">
      <label for="pv-pain" class="pv-pain-l"><b>Douleur pendant la séance</b><span class="pv-pain-v num" id="pv-pain-v">${PV.pain}/10</span></label>
      <input type="range" id="pv-pain" min="0" max="10" step="1" value="${PV.pain}">
      <div class="pv-scale"><span>0 · aucune</span><span>5 · modérée</span><span>10 · pire imaginable</span></div>
      <button class="pv-btn primary" data-pv-finish ${done?"":"disabled"}>${done?"Terminer la séance":"Cochez au moins un exercice"}</button>
    </section>
  </div>`;
}

/* ---------- Animation de l'exercice ouvert ---------- */
function startPvAnim(key){
  const [pid,i]=key.split(":"), c=C(PV.cid), p=c.progs.find(x=>x.id===pid), e=EX[p.ex[+i].id], svg=$("#pv-anim");
  if(!svg||matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const t0=performance.now();
  const frame=t=>{ const ph=((t-t0)/2600)%1; svg.innerHTML=sceneSVG(e,(1-Math.cos(ph*2*Math.PI))/2); pvAnimId=requestAnimationFrame(frame) };
  pvAnimId=requestAnimationFrame(frame);
}
function stopPvAnim(){ if(pvAnimId){ cancelAnimationFrame(pvAnimId); pvAnimId=null } }

/* ---------- Interactions ---------- */
document.addEventListener("click",ev=>{
  const b=ev.target.closest("button"); if(!b) return;
  const d=b.dataset;
  if(d.preview){ const [cid,pid]=d.preview.split(":"); openPreview(cid,pid); return }
  if(!PV||!b.closest("#preview")) return;
  if(d.pvClose!==undefined) closePreview();
  else if(d.pvDevice){ PV.device=d.pvDevice; renderPreview() }
  else if(d.pvGo){ PV.screen=d.pvGo; PV.open=null; PV.done=false; renderPreview(); $("#preview .pv-scroll").scrollTop=0 }
  else if(d.pvProg){ PV.pid=d.pvProg; PV.screen="prog"; PV.open=null; renderPreview(); $("#preview .pv-scroll").scrollTop=0 }
  else if(d.pvSession){ PV.pid=d.pvSession; PV.screen="session"; PV.open=null; PV.checks={}; PV.done=false; renderPreview(); $("#preview .pv-scroll").scrollTop=0 }
  else if(d.pvOpen){ const top=$("#preview .pv-scroll").scrollTop; PV.open=PV.open===d.pvOpen?null:d.pvOpen; renderPreview(); $("#preview .pv-scroll").scrollTop=top }
  else if(d.pvCheck!==undefined){ const top=$("#preview .pv-scroll").scrollTop; PV.checks[d.pvCheck]=!PV.checks[d.pvCheck]; renderPreview(); $("#preview .pv-scroll").scrollTop=top }
  else if(d.pvFinish!==undefined){ PV.done=true; renderPreview(); $("#preview .pv-scroll").scrollTop=0 }
  else if(d.pvPdf){ openExport(PV.cid,d.pvPdf) }
});
document.addEventListener("input",ev=>{
  if(ev.target.id==="pv-pain"&&PV){ PV.pain=+ev.target.value; $("#pv-pain-v").textContent=PV.pain+"/10" }
});
document.addEventListener("keydown",ev=>{ if(ev.key==="Escape"&&PV&&$("#sheet").hidden) closePreview() },true);
