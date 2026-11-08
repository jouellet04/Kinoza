/* Kinoza · conformité à la Loi 25 (P-39.1) : consentement, mineurs, accès et portabilité,
   rectification tracée, registre des demandes et registre des incidents de confidentialité */

const NOTICE_VERSION = "2026-11";
const MINOR_AGE = 14;
const REQ_TYPES = ["Accès au dossier","Copie en format structuré (portabilité)","Rectification","Retrait du consentement","Plainte","Autre"];
const RECT_FIELDS = {n:"Nom complet",email:"Adresse courriel",birth:"Date de naissance",start:"Début du suivi",notes:"Notes cliniques et précautions"};
const nowIso = ()=>new Date().toISOString();
const addDays = (iso,d)=>{const x=new Date(iso);x.setDate(x.getDate()+d);return x.toISOString()};
const daysLeft = iso=>Math.round((new Date(localDay(iso)+"T12:00")-new Date(TODAY+"T12:00"))/864e5);
const rprp = ()=>S.settings?.rprp||{};
const isMinor = c=>{const a=ageOf(c); return a!=null&&a<MINOR_AGE};

/* ---------- Chaînes d'empreintes (consentements, rectifications) ---------- */
async function chainPush(list,e,fields){
  const prev=list.length?list[list.length-1].h:"";
  e.h=await sha([prev,...fields.map(f=>canon(e[f]??null))].join("|")); list.push(e);
}
async function chainOk(list,fields){
  let prev="";
  for(const e of list||[]){ if(await sha([prev,...fields.map(f=>canon(e[f]??null))].join("|"))!==e.h) return false; prev=e.h }
  return true;
}
const CONSENT_FIELDS=["at","kind","by","byName","version","purposes","tiers","note"];
const RECT_KEYS=["at","field","old","new","reason"];

/* ---------- Consentement (art. 8, 12, 13, 14) ---------- */
function consentState(c){
  const list=c.consents||[];
  const last=[...list].reverse().find(x=>x.kind==="consent"||x.kind==="withdraw");
  if(!last) return {ok:false,label:"Consentement à obtenir",cls:"warn"};
  if(last.kind==="withdraw") return {ok:false,label:`Consentement retiré le ${dLong(localDay(last.at))}`,cls:"bad",last};
  const minorGap = isMinor(c)&&last.by!=="parent";
  if(minorGap) return {ok:false,label:"Consentement du parent ou tuteur requis (moins de 14 ans)",cls:"warn",last};
  return {ok:true,label:`Consentement obtenu le ${dLong(localDay(last.at))}`,cls:"ok",last};
}
function consentPanel(c){
  const st=consentState(c), list=c.consents||[];
  return `<section class="panel" id="cf-consent">
    <div class="panel-h"><div><h2>Consentement et confidentialité</h2><span class="muted" style="font-size:.85rem">Loi 25, art. 8 et 14 : le client est informé, et consent par écrit, de façon distincte pour chaque fin.</span></div>
      <span class="chip ${st.cls}">${esc(st.label)}</span></div>
    ${isMinor(c)?`<div class="banner">Client de moins de ${MINOR_AGE} ans : le consentement doit être donné par le parent ou le tuteur (art. 4.1 et 14).</div>`:""}
    ${st.last&&st.last.kind==="consent"?`<div class="facts" style="border:0;padding:0">
      <div><span class="eyebrow">Donné par</span><span>${st.last.by==="parent"?`Parent ou tuteur : ${esc(st.last.byName)}`:"Le client"}</span></div>
      <div><span class="eyebrow">Avis remis</span><span>Version ${esc(st.last.version)}</span></div>
      <div><span class="eyebrow">Suivi et programmes</span><span>${st.last.purposes?.suivi?"Accepté":"Refusé"}</span></div>
      <div><span class="eyebrow">Communication à un tiers</span><span>${st.last.purposes?.tiers?`Acceptée : ${esc(st.last.tiers||"")}`:"Non autorisée"}</span></div>
      <div><span class="eyebrow">Programmes par courriel</span><span>${st.last.purposes?.courriel?"Accepté":"Non autorisé"}</span></div></div>`:""}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" data-cf-notice="${c.id}">${I.pdf} Avis de confidentialité à signer</button>
      <button class="btn primary" data-cf-consent="${c.id}">Enregistrer un consentement</button>
      ${st.last&&st.last.kind==="consent"?`<button class="btn danger" data-cf-withdraw="${c.id}">Retrait du consentement</button>`:""}</div>
    ${list.length?`<details><summary class="muted" style="font-size:.88rem">Historique des consentements (${list.length})</summary><ol class="audit">${[...list].reverse().map(x=>`<li><span class="num muted">${esc(stamp(x.at))}</span><span>${x.kind==="withdraw"?"Retrait du consentement":"Consentement enregistré"}${x.by==="parent"?` · par ${esc(x.byName)} (parent ou tuteur)`:""}${x.note?` · ${esc(x.note)}`:""}</span></li>`).join("")}</ol></details>`:""}
  </section>`;
}
function openConsentForm(cid){
  const c=C(cid), minor=isMinor(c), sh=$("#sheet");
  sh.innerHTML=`<form class="sheet-card form-card" id="cf-consent-form" role="dialog" aria-modal="true" aria-labelledby="cs-t" novalidate>
    <div style="display:flex;justify-content:space-between;gap:12px"><div><span class="eyebrow">${esc(c.n)}</span><h2 id="cs-t" style="font-size:1.35rem">Enregistrer un consentement</h2></div><button type="button" class="icon-btn" data-close aria-label="Fermer">${I.x}</button></div>
    <p class="muted" style="font-size:.88rem">Remettez d'abord l'avis de confidentialité au client (bouton « Avis de confidentialité à signer »), puis consignez ici ce qu'il a accepté. Gardez l'avis signé au dossier papier.</p>
    <input type="hidden" id="cs-c" value="${c.id}">
    <fieldset class="opts"><legend class="eyebrow">Consentement donné par</legend>
      <label><input type="radio" name="cs-by" value="client" ${minor?"disabled":"checked"}> Le client lui-même${minor?` (impossible : moins de ${MINOR_AGE} ans)`:""}</label>
      <label><input type="radio" name="cs-by" value="parent" ${minor?"checked":""}> Le parent ou le tuteur</label></fieldset>
    <div class="field" id="cs-parent-f" ${minor?"":"hidden"}><label for="cs-parent">Nom du parent ou du tuteur</label><input class="inp" id="cs-parent" autocomplete="off"></div>
    <fieldset class="opts"><legend class="eyebrow">Fins acceptées (une case par fin)</legend>
      <label><input type="checkbox" id="cs-suivi" checked> Constituer un dossier, préparer et suivre les programmes d'exercices</label>
      <label><input type="checkbox" id="cs-courriel"> Recevoir ses programmes d'exercices par courriel, sachant que le courriel n'est pas entièrement sécurisé</label>
      <label><input type="checkbox" id="cs-tiers"> Communiquer des renseignements à un tiers précis (ex. médecin traitant)</label></fieldset>
    <div class="field" id="cs-tiers-f" hidden><label for="cs-tiers-who">À qui et quoi</label><input class="inp" id="cs-tiers-who" placeholder="Ex. Dre Tremblay, médecin de famille : résumé de progression"></div>
    <div class="field"><label for="cs-note">Note (facultatif)</label><input class="inp" id="cs-note" placeholder="Ex. avis signé le 20 octobre, copie remise au client"></div>
    <p class="err" id="cs-err" hidden></p>
    <div class="form-actions"><button type="button" class="btn" data-close>Annuler</button><button type="submit" class="btn primary">Enregistrer</button></div>
  </form>`;
  sh.hidden=false; document.body.style.overflow="hidden";
}
async function submitConsent(){
  const c=C($("#cs-c").value), by=document.querySelector('input[name="cs-by"]:checked')?.value, err=$("#cs-err");
  const fail=m=>{err.textContent=m;err.hidden=false};
  const byName=$("#cs-parent").value.trim(), suivi=$("#cs-suivi").checked, tiers=$("#cs-tiers").checked, tiersWho=$("#cs-tiers-who").value.trim();
  if(!by) return fail("Indiquez qui donne le consentement.");
  if(isMinor(c)&&by!=="parent") return fail(`Le client a moins de ${MINOR_AGE} ans : le consentement doit venir du parent ou du tuteur.`);
  if(by==="parent"&&!byName) return fail("Inscrivez le nom du parent ou du tuteur.");
  if(!suivi) return fail("Sans consentement au suivi, aucun dossier ne peut être tenu. Utilisez plutôt « Retrait du consentement ».");
  if(tiers&&!tiersWho) return fail("Précisez à quel tiers et quels renseignements la communication est autorisée.");
  c.consents=c.consents||[];
  await chainPush(c.consents,{at:nowIso(),kind:"consent",by,byName:by==="parent"?byName:"",version:NOTICE_VERSION,purposes:{suivi,tiers,courriel:$("#cs-courriel").checked},tiers:tiers?tiersWho:"",note:$("#cs-note").value.trim()},CONSENT_FIELDS);
  await logAudit(c,"Consentement enregistré"+(by==="parent"?` (parent ou tuteur : ${byName})`:"")); await flush();
  closeSheet(); render(); toast("Consentement enregistré");
}
function openWithdraw(cid){
  const c=C(cid), sh=$("#sheet");
  sh.innerHTML=`<form class="sheet-card form-card" id="cf-withdraw-form" role="dialog" aria-modal="true" aria-labelledby="wd-t" novalidate style="width:min(480px,100%)">
    <h2 id="wd-t" style="font-size:1.3rem">Retrait du consentement de ${esc(c.n)}</h2>
    <p class="muted">Le client peut retirer son consentement en tout temps (art. 8). Le retrait est daté et conservé. Ce qui a déjà été fait reste au dossier, mais aucune nouvelle utilisation ne doit en être faite. Pensez ensuite à fermer le dossier et à planifier sa destruction selon votre durée de conservation.</p>
    <input type="hidden" id="wd-c" value="${c.id}">
    <div class="field"><label for="wd-note">Précisions (facultatif)</label><input class="inp" id="wd-note" placeholder="Ex. demande verbale à la séance du 20 octobre"></div>
    <div class="form-actions"><button type="button" class="btn" data-close>Annuler</button><button type="submit" class="btn danger-solid">Enregistrer le retrait</button></div></form>`;
  sh.hidden=false; document.body.style.overflow="hidden";
}
async function submitWithdraw(){
  const c=C($("#wd-c").value); c.consents=c.consents||[];
  await chainPush(c.consents,{at:nowIso(),kind:"withdraw",by:"client",byName:"",version:NOTICE_VERSION,purposes:null,tiers:"",note:$("#wd-note").value.trim()},CONSENT_FIELDS);
  await logAudit(c,"Retrait du consentement"); await flush(); closeSheet(); render(); toast("Retrait du consentement enregistré");
}

/* ---------- Petits documents PDF (avis, dossier remis, attestation) ---------- */
async function simplePDF(title,build){
  const jsPDF=await loadJsPDF(), doc=new jsPDF({unit:"mm",format:"letter"});
  const PW=215.9, PH=279.4, M=18, CW=PW-2*M; let y=0;
  const ink=[22,33,31], muted=[90,105,102], acc=[28,106,94], line=[217,225,223];
  const set=(sz,st="normal",col=ink)=>{doc.setFont("helvetica",st);doc.setFontSize(sz);doc.setTextColor(...col)};
  const need=h=>{ if(y+h>PH-22){ doc.addPage(); y=20 } };
  const api={
    h1(t){ set(18,"bold"); const l=doc.splitTextToSize(pdfTxt(t),CW); need(l.length*7+4); doc.text(l,M,y); y+=l.length*7+2 },
    h2(t){ y+=3; set(11.5,"bold"); need(10); doc.text(pdfTxt(t),M,y); y+=2; doc.setDrawColor(...line); doc.line(M,y,PW-M,y); y+=5 },
    p(t,o={}){ set(o.size||9.6,o.bold?"bold":"normal",o.muted?muted:ink); const l=doc.splitTextToSize(pdfTxt(t),CW-(o.indent||0)); need(l.length*4.5); doc.text(l,M+(o.indent||0),y); y+=l.length*4.5+1.6 },
    bullet(t){ set(9.6); const l=doc.splitTextToSize(pdfTxt(t),CW-6); need(l.length*4.5); doc.setFillColor(...acc); doc.circle(M+1.3,y-1.2,.8,"F"); doc.text(l,M+5,y); y+=l.length*4.5+1.2 },
    kv(k,v){ set(7.5,"bold",muted); need(10); doc.text(pdfTxt(k).toUpperCase(),M,y,{charSpace:.3}); y+=4.2; api.p(v||"—") },
    check(t){ set(9.6); const l=doc.splitTextToSize(pdfTxt(t),CW-8); need(l.length*4.5+2); doc.setDrawColor(...muted); doc.rect(M,y-3.3,3.8,3.8); doc.text(l,M+7,y); y+=l.length*4.5+2.5 },
    sign(lbl){ need(18); y+=10; doc.setDrawColor(...muted); doc.line(M,y,M+90,y); doc.line(M+110,y,PW-M,y); set(8,"normal",muted); doc.text(pdfTxt(lbl),M,y+4); doc.text("Date",M+110,y+4); y+=9 },
    space(h=4){ y+=h }, keep(h){ need(h) }, doc, set
  };
  const st=S.settings||{};
  doc.setFillColor(...acc); doc.rect(0,0,PW,3,"F");
  set(9,"bold",acc); doc.text(pdfTxt(st.clinic||"Kinoza"),M,13); set(8.5,"normal",muted); doc.text(dLong(TODAY),PW-M,13,{align:"right"});
  y=26; api.h1(title);
  await build(api);
  const n=doc.getNumberOfPages();
  for(let i=1;i<=n;i++){ doc.setPage(i); doc.setDrawColor(...line); doc.line(M,PH-13,PW-M,PH-13); set(7.5,"normal",muted);
    doc.text(pdfTxt(`${st.clinic||"Kinoza"}${rprp().contact?" · Responsable de la protection des renseignements personnels : "+rprp().contact:""}`),M,PH-8.5); doc.text(`Page ${i} / ${n}`,PW-M,PH-8.5,{align:"right"}) }
  doc.setProperties({title,creator:"Kinoza"});
  return doc.output("blob");
}
async function savePdf(blob,name){
  try{ await saveFile(name.replace(/[\\/:*?"<>|]/g,""),blob); toast("PDF enregistré") }
  catch(e){ toast(e?.code==="declined"?"Enregistrement annulé":"L'enregistrement n'a pas pu se faire dans cet affichage") }
}
async function noticePDF(c){
  const st=S.settings||{}, r=rprp(), years=st.retentionYears||5;
  const blob=await simplePDF("Avis de confidentialité et consentement",async a=>{
    a.p(`Version ${NOTICE_VERSION}. Ce document vous explique comment ${st.clinic||"votre entraîneur(e)"} recueille, utilise et protège vos renseignements personnels, conformément à la Loi sur la protection des renseignements personnels dans le secteur privé (Québec).`,{muted:true});
    a.kv("Client",c?c.n:""); if(c&&isMinor(c)) a.p(`Le client a moins de ${MINOR_AGE} ans : ce consentement doit être donné par le parent ou le tuteur.`,{bold:true});
    a.h2("Pourquoi nous recueillons vos renseignements");
    a.bullet("Constituer votre dossier, évaluer votre condition et préparer vos programmes d'exercices.");
    a.bullet("Suivre vos progrès : séances réalisées, douleur rapportée, notes de suivi.");
    a.p("Nous ne recueillons que les renseignements nécessaires à ces fins. Vos renseignements de santé sont sensibles : ils ne sont jamais utilisés à d'autres fins, ni pour de la publicité.");
    a.h2("Quels renseignements");
    a.p("Nom, adresse courriel si vous la donnez, date de naissance, date de début du suivi, notes cliniques et précautions, programmes d'exercices, séances réalisées et douleur rapportée.");
    a.h2("Qui y a accès et où ils sont conservés");
    a.p(`Seul votre entraîneur(e)${st.kin?` (${st.kin})`:""} y a accès, pour vous offrir le service. ${st.storage||"Les dossiers sont conservés sur l'ordinateur de l'entreprise, au Québec, chiffrés et protégés par mot de passe."} Aucun renseignement n'est communiqué à un tiers sans votre consentement exprès, sauf dans les cas prévus par la loi (par exemple une urgence mettant en danger votre vie ou votre santé).`);
    a.h2("Durée de conservation");
    a.p(`Votre dossier est conservé ${years} an${years>1?"s":""} après le dernier service, puis détruit de façon sécuritaire.`);
    a.h2("Vos droits");
    a.bullet("Consulter votre dossier et en obtenir une copie, gratuitement (des frais raisonnables de reproduction peuvent s'appliquer et vous seront annoncés à l'avance).");
    a.bullet("Recevoir les renseignements que vous nous avez fournis dans un format structuré et couramment utilisé.");
    a.bullet("Faire corriger un renseignement inexact, incomplet ou équivoque.");
    a.bullet("Retirer votre consentement en tout temps.");
    a.bullet("Porter plainte auprès de nous, puis auprès de la Commission d'accès à l'information du Québec.");
    a.p("Toute demande se fait par écrit au responsable ci-dessous. Nous répondons au plus tard dans les 30 jours.",{muted:true});
    a.h2("Responsable de la protection des renseignements personnels");
    a.p(`${r.name||"Nom à inscrire"}${r.title?", "+r.title:""}`,{bold:true}); a.p(r.contact||"Coordonnées à inscrire");
    a.keep(90); a.h2("Votre consentement");
    a.p("Cochez chaque fin que vous acceptez. Chaque consentement est distinct.",{muted:true});
    a.check("J'accepte que mes renseignements soient recueillis et utilisés pour constituer mon dossier, préparer et suivre mes programmes d'exercices.");
    a.check("J'accepte de recevoir mes programmes d'exercices par courriel (facultatif). Je comprends que le courriel n'est pas un moyen entièrement sécurisé et qu'il passe par notre fournisseur de messagerie, possiblement à l'extérieur du Québec. Adresse : ____________________________");
    a.check("J'accepte que les renseignements suivants soient communiqués au tiers suivant (facultatif) : ____________________________________________");
    a.space(2); a.p("J'ai lu cet avis et on a répondu à mes questions. Je peux retirer mon consentement en tout temps.");
    a.sign("Signature du client"); a.sign("Signature du parent ou tuteur (si moins de 14 ans) et nom en lettres moulées");
  });
  await savePdf(blob,`Avis de confidentialité - ${c?c.n:"modèle"} - ${TODAY}.pdf`);
}

/* ---------- Accès et portabilité (art. 27) ---------- */
function openAccessExport(cid){
  const c=C(cid), sh=$("#sheet");
  sh.innerHTML=`<div class="sheet-card form-card" role="dialog" aria-modal="true" aria-labelledby="ax-t">
    <div style="display:flex;justify-content:space-between;gap:12px"><div><span class="eyebrow">${esc(c.n)}</span><h2 id="ax-t" style="font-size:1.35rem">Remettre son dossier au client</h2></div><button type="button" class="icon-btn" data-close aria-label="Fermer">${I.x}</button></div>
    <p class="muted" style="font-size:.9rem">Le client a le droit de consulter son dossier et d'en obtenir une copie (art. 27). Les renseignements qu'il vous a fournis doivent aussi pouvoir lui être remis dans un format structuré et couramment utilisé.</p>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn primary" data-cf-access-pdf="${c.id}">${I.pdf} Copie lisible du dossier complet (PDF)</button>
      <button class="btn" data-cf-access-json="${c.id}">Renseignements fournis par le client, format structuré (JSON)</button></div>
    <label class="check-line"><input type="checkbox" id="ax-log" checked> Inscrire cette remise au registre des demandes</label>
    <p class="muted" style="font-size:.82rem">Remettez le fichier en main propre ou par un moyen sécurisé. Évitez le courriel non chiffré pour des renseignements de santé.</p>
  </div>`;
  sh.hidden=false; document.body.style.overflow="hidden";
}
async function accessPDF(c){
  const blob=await simplePDF(`Dossier de ${c.n}`,async a=>{
    a.p("Copie remise à la demande du client (Loi sur la protection des renseignements personnels dans le secteur privé, art. 27).",{muted:true});
    a.h2("Identification");
    a.kv("Nom",c.n); if(c.email) a.kv("Adresse courriel",c.email); a.kv("Date de naissance",c.birth?dLong(c.birth):(c.age?`${c.age} ans (âge inscrit)`:"—")); a.kv("Début du suivi",c.start?dLong(c.start):"—");
    a.kv("Notes cliniques et précautions",c.notes||"—");
    a.h2("Consentements");
    if(!(c.consents||[]).length) a.p("Aucun consentement consigné.");
    for(const x of c.consents||[]) a.bullet(`${stamp(x.at)} : ${x.kind==="withdraw"?"retrait du consentement":`consentement (suivi : ${x.purposes?.suivi?"oui":"non"} ; tiers : ${x.purposes?.tiers?x.tiers:"non"})`}${x.by==="parent"?`, donné par ${x.byName}`:""}`);
    a.h2("Programmes d'exercices");
    for(const p of byDate(c.progs)){
      a.p(`${p.name}${p.id===c.active?" (programme actuel)":""}`,{bold:true});
      a.p(`Créé le ${dLong(p.created)} · ${freqShort(p)}${p.phase?" · "+p.phase:""}${p.dx?" · Objectif : "+p.dx:""}`,{muted:true});
      p.ex.forEach((e,i)=>a.bullet(`${i+1}. ${exView(p,e.id).n} : ${doseParts(e).join(", ")}${e.note?` (${e.note})`:""}`));
    }
    a.h2("Séances rapportées");
    if(!c.log.length) a.p("Aucune séance saisie.");
    for(const l of c.log) a.bullet(`${dLong(l.date)} : douleur ${l.pain}/10`);
    a.h2("Notes d'ajout");
    if(!(c.addenda||[]).length) a.p("Aucune note d'ajout.");
    for(const n of c.addenda||[]) a.bullet(`${stamp(n.at)} : ${n.text}`);
    if((c.rectifs||[]).length){ a.h2("Rectifications"); for(const r of c.rectifs) a.bullet(`${stamp(r.at)} : ${RECT_FIELDS[r.field]} rectifié. Motif : ${r.reason}`) }
  });
  await savePdf(blob,`Dossier - ${c.n} - ${TODAY}.pdf`);
}
async function accessJSON(c){
  const data={format:"Kinoza · renseignements fournis par le client",genere:nowIso(),client:{nom:c.n,courriel:c.email||null,date_naissance:c.birth||null,age_inscrit:c.birth?null:(c.age||null),debut_suivi:c.start||null,notes_cliniques:c.notes||""},
    seances:c.log.map(l=>({date:l.date,douleur_sur_10:l.pain})),
    consentements:(c.consents||[]).map(x=>({date:x.at,type:x.kind==="withdraw"?"retrait":"consentement",donne_par:x.by==="parent"?`parent ou tuteur : ${x.byName}`:"client",suivi:x.purposes?.suivi??null,communication_tiers:x.purposes?.tiers?x.tiers:null}))};
  try{ await saveFile(`Dossier structuré - ${c.n} - ${TODAY}.json`.replace(/[\\/:*?"<>|]/g,""),JSON.stringify(data,null,2)); toast("Fichier enregistré") }
  catch(e){ toast(e?.code==="declined"?"Enregistrement annulé":"L'enregistrement n'a pas pu se faire dans cet affichage") }
}
async function logAccess(c,kind){
  if(!$("#ax-log")?.checked) return;
  S.requests=S.requests||[];
  const at=nowIso();
  S.requests.push({id:newId("r"),at,cid:c.id,client:c.n,type:kind==="json"?REQ_TYPES[1]:REQ_TYPES[0],details:kind==="json"?"Fichier JSON remis":"Copie PDF remise",due:addDays(at,30),status:"traitée",closedAt:at,response:"Copie remise au client"});
  await logAudit(c,kind==="json"?"Copie structurée (JSON) remise au client":"Copie du dossier (PDF) remise au client"); save();
}

/* ---------- Rectification tracée (art. 28, 35) ---------- */
function openRectify(cid){
  const c=C(cid), sh=$("#sheet");
  sh.innerHTML=`<form class="sheet-card form-card" id="cf-rect-form" role="dialog" aria-modal="true" aria-labelledby="rt-t" novalidate>
    <div style="display:flex;justify-content:space-between;gap:12px"><div><span class="eyebrow">${esc(c.n)}</span><h2 id="rt-t" style="font-size:1.35rem">Rectifier un renseignement</h2></div><button type="button" class="icon-btn" data-close aria-label="Fermer">${I.x}</button></div>
    <p class="muted" style="font-size:.88rem">Pour corriger un renseignement inexact, incomplet ou équivoque, même dans un dossier fermé. L'ancienne valeur, la nouvelle, la date et le motif sont conservés dans le dossier et ne pourront pas être effacés.</p>
    <input type="hidden" id="rt-c" value="${c.id}">
    <div class="field"><label for="rt-field">Renseignement à rectifier</label><select class="inp" id="rt-field">${Object.entries(RECT_FIELDS).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></div>
    <div class="field"><label>Valeur actuelle</label><div class="inp" id="rt-old" style="background:var(--sunk);white-space:pre-line">${esc(c.n)}</div></div>
    <div class="field" id="rt-new-f"><label for="rt-new">Nouvelle valeur</label><input class="inp" id="rt-new" autocomplete="off"></div>
    <div class="field"><label for="rt-reason">Motif de la rectification</label><input class="inp" id="rt-reason" placeholder="Ex. demande écrite du client du 20 octobre : nom mal orthographié"></div>
    <p class="err" id="rt-err" hidden></p>
    <div class="form-actions"><button type="button" class="btn" data-close>Annuler</button><button type="submit" class="btn primary">Rectifier</button></div></form>`;
  sh.hidden=false; document.body.style.overflow="hidden"; rectFieldUI(c);
}
function rectFieldUI(c){
  const f=$("#rt-field").value, cur=c[f]??"", wrap=$("#rt-new-f");
  $("#rt-old").textContent=(f==="birth"||f==="start")?(cur?dLong(cur):"—"):(cur||"—");
  wrap.innerHTML=`<label for="rt-new">Nouvelle valeur</label>${f==="notes"?`<textarea class="inp" id="rt-new" rows="3">${esc(cur)}</textarea>`:`<input class="inp" id="rt-new" ${f==="birth"||f==="start"?`type="date" max="${TODAY}"`:'autocomplete="off"'} value="${esc(cur)}">`}`;
}
async function submitRectify(){
  const c=C($("#rt-c").value), f=$("#rt-field").value, nv=$("#rt-new").value.trim(), reason=$("#rt-reason").value.trim(), err=$("#rt-err");
  const fail=m=>{err.textContent=m;err.hidden=false};
  const old=c[f]??"";
  if(f==="n"&&!nv) return fail("Le nom ne peut pas être vide.");
  if(f==="email"&&nv&&!emailOk(nv)) return fail("Cette adresse courriel n'est pas valide.");
  if(nv===String(old)) return fail("La nouvelle valeur est identique à l'actuelle.");
  if(!reason) return fail("Indiquez le motif de la rectification.");
  c.rectifs=c.rectifs||[];
  await chainPush(c.rectifs,{at:nowIso(),field:f,old:String(old),new:nv,reason},RECT_KEYS);
  c[f]=nv; if(f==="birth"&&nv) c.age=null;
  if(c.locked){ c.locked.hash=await sha(canon(clientContent(c))) }   // nouveau scellé, la rectification reste visible
  await logAudit(c,`Rectification : ${RECT_FIELDS[f]}`); await flush();
  ui.integKey[c.id]=null; closeSheet(); render(); toast("Renseignement rectifié");
}
function rectifPanel(c){
  const list=c.rectifs||[]; if(!list.length) return "";
  return `<section class="panel"><h2>Rectifications</h2>
    <ol class="addenda">${[...list].reverse().map((r,i)=>`<li><span class="eyebrow">${esc(stamp(r.at))} · ${esc(RECT_FIELDS[r.field])}</span>
      <p><span class="muted">Avant :</span> ${esc(r.field==="birth"||r.field==="start"?(r.old?dLong(r.old):"—"):r.old||"—")}<br><span class="muted">Après :</span> ${esc(r.field==="birth"||r.field==="start"?(r.new?dLong(r.new):"—"):r.new||"—")}<br><span class="muted">Motif :</span> ${esc(r.reason)}</p>
      <button class="link" style="align-self:flex-start;font-size:.85rem" data-cf-attest="${c.id}:${list.length-1-i}">Attestation de rectification à remettre (PDF)</button></li>`).join("")}</ol></section>`;
}
async function attestPDF(c,i){
  const r=c.rectifs[i];
  const blob=await simplePDF("Attestation de rectification",async a=>{
    a.p("Remise sans frais au client, conformément à l'article 35 de la Loi sur la protection des renseignements personnels dans le secteur privé.",{muted:true});
    a.kv("Client",c.n); a.kv("Date de la rectification",stamp(r.at)); a.kv("Renseignement",RECT_FIELDS[r.field]);
    a.kv("Ancienne valeur",r.field==="birth"||r.field==="start"?(r.old?dLong(r.old):"—"):r.old); a.kv("Nouvelle valeur",r.field==="birth"||r.field==="start"?(r.new?dLong(r.new):"—"):r.new);
    a.kv("Motif",r.reason);
    a.sign(`${rprp().name||"Responsable de la protection des renseignements personnels"}`);
  });
  await savePdf(blob,`Attestation de rectification - ${c.n} - ${TODAY}.pdf`);
}

/* ---------- Registre des demandes (art. 30, 32, 34) ---------- */
function openRequestForm(rid){
  const r=rid?S.requests.find(x=>x.id===rid):null, sh=$("#sheet");
  sh.innerHTML=`<form class="sheet-card form-card" id="cf-req-form" role="dialog" aria-modal="true" aria-labelledby="rq-t" novalidate>
    <div style="display:flex;justify-content:space-between;gap:12px"><h2 id="rq-t" style="font-size:1.35rem">${r?"Traiter la demande":"Nouvelle demande"}</h2><button type="button" class="icon-btn" data-close aria-label="Fermer">${I.x}</button></div>
    <input type="hidden" id="rq-id" value="${r?r.id:""}">
    <div class="form-grid">
      <div class="field"><label for="rq-cid">Client</label><select class="inp" id="rq-cid" ${r?"disabled":""}><option value="">Personne sans dossier</option>${S.clients.map(c=>`<option value="${c.id}" ${r?.cid===c.id?"selected":""}>${esc(c.n)}</option>`).join("")}</select></div>
      <div class="field"><label for="rq-who">Nom du demandeur</label><input class="inp" id="rq-who" value="${esc(r?.client||"")}" ${r?"disabled":""} placeholder="Si différent du client"></div>
      <div class="field"><label for="rq-type">Type de demande</label><select class="inp" id="rq-type" ${r?"disabled":""}>${REQ_TYPES.map(t=>`<option ${r?.type===t?"selected":""}>${t}</option>`).join("")}</select></div>
      <div class="field"><label for="rq-at">Reçue le</label><input class="inp" id="rq-at" type="date" max="${TODAY}" value="${r?localDay(r.at):TODAY}" ${r?"disabled":""}></div>
      <div class="field span2"><label for="rq-details">Détails de la demande</label><textarea class="inp" id="rq-details" rows="2" ${r?"disabled":""}>${esc(r?.details||"")}</textarea></div>
      ${r?`<div class="field"><label for="rq-status">Décision</label><select class="inp" id="rq-status"><option value="traitée">Acceptée et traitée</option><option value="refusée">Refusée (motif obligatoire)</option></select></div>
      <div class="field span2"><label for="rq-resp">Réponse écrite transmise</label><textarea class="inp" id="rq-resp" rows="2" placeholder="Ex. copie du dossier remise en main propre le 25 octobre. En cas de refus : motif, article de loi et recours possibles devant la Commission d'accès à l'information."></textarea></div>`:""}
    </div>
    <p class="muted" style="font-size:.82rem">La demande doit être écrite, et l'identité du demandeur vérifiée (art. 30). Répondez par écrit au plus tard 30 jours après la réception. Sans réponse dans ce délai, la demande est réputée refusée (art. 32). Un refus doit être motivé et indiquer les recours (art. 34).</p>
    <p class="err" id="rq-err" hidden></p>
    <div class="form-actions"><button type="button" class="btn" data-close>Annuler</button><button type="submit" class="btn primary">${r?"Fermer la demande":"Inscrire la demande"}</button></div></form>`;
  sh.hidden=false; document.body.style.overflow="hidden";
}
async function submitRequest(){
  const id=$("#rq-id").value, err=$("#rq-err"), fail=m=>{err.textContent=m;err.hidden=false};
  S.requests=S.requests||[];
  if(id){
    const r=S.requests.find(x=>x.id===id), resp=$("#rq-resp").value.trim(), status=$("#rq-status").value;
    if(!resp) return fail("Décrivez la réponse transmise au demandeur.");
    Object.assign(r,{status,response:resp,closedAt:nowIso()});
    const c=C(r.cid); if(c) await logAudit(c,`Demande « ${r.type} » ${status==="refusée"?"refusée":"traitée"}`);
  } else {
    const cid=$("#rq-cid").value, c=C(cid), who=$("#rq-who").value.trim()||c?.n||"", at=new Date($("#rq-at").value+"T12:00").toISOString();
    if(!who) return fail("Indiquez le nom du demandeur.");
    const type=$("#rq-type").value;
    S.requests.push({id:newId("r"),at,cid:cid||null,client:who,type,details:$("#rq-details").value.trim(),due:addDays(at,30),status:"ouverte",closedAt:null,response:""});
    if(c) await logAudit(c,`Demande reçue : ${type}`);
  }
  await flush(); closeSheet(); render(); toast(id?"Demande fermée":"Demande inscrite au registre");
}
const openRequests = ()=>(S.requests||[]).filter(r=>r.status==="ouverte");
function requestsPanel(){
  const list=[...(S.requests||[])].sort((a,b)=>b.at.localeCompare(a.at));
  return `<section class="panel">
    <div class="panel-h"><div><h2>Registre des demandes</h2><span class="muted" style="font-size:.85rem">Accès, portabilité, rectification, retrait du consentement, plaintes. Délai de réponse : 30 jours.</span></div>
      <button class="btn sm" data-cf-req-new>${I.plus} Nouvelle demande</button></div>
    ${list.length?`<div class="rows">${list.map(r=>{const d=daysLeft(r.due), open=r.status==="ouverte";return `
      <div class="row prog-row"><div style="min-width:0"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b style="font-weight:600">${esc(r.type)}</b>
        <span class="chip ${open?(d<0?"bad":d<=7?"warn":""):r.status==="refusée"?"bad":"ok"}">${open?(d<0?`En retard de ${-d} j`:`${d} j restants`):r.status==="refusée"?"Refusée":"Traitée"}</span></div>
        <div class="muted" style="font-size:.84rem">${esc(r.client)} · reçue le ${esc(dLong(localDay(r.at)))}${r.details?` · ${esc(r.details)}`:""}${r.response?` · Réponse : ${esc(r.response)}`:""}</div></div>
        ${open?`<button class="btn sm" data-cf-req-close="${r.id}">Traiter</button>`:""}</div>`}).join("")}</div>`:`<p class="muted">Aucune demande pour l'instant.</p>`}
  </section>`;
}

/* ---------- Registre des incidents de confidentialité (art. 3.5 à 3.8) ---------- */
function openIncidentForm(iid){
  const x=iid?S.incidents.find(i=>i.id===iid):{}, sh=$("#sheet"), d=v=>v?localDay(v):"";
  sh.innerHTML=`<form class="sheet-card form-card" id="cf-inc-form" role="dialog" aria-modal="true" aria-labelledby="ic-t" novalidate style="width:min(680px,100%)">
    <div style="display:flex;justify-content:space-between;gap:12px"><h2 id="ic-t" style="font-size:1.35rem">${iid?"Mettre à jour l'incident":"Inscrire un incident de confidentialité"}</h2><button type="button" class="icon-btn" data-close aria-label="Fermer">${I.x}</button></div>
    <p class="muted" style="font-size:.86rem">Un incident, c'est un accès, une utilisation ou une communication non autorisés, ou la perte d'un renseignement (art. 3.6). Par exemple : un ordinateur perdu, un PDF envoyé au mauvais client ou un mot de passe vu par quelqu'un. Prenez d'abord les mesures pour limiter les dommages (art. 3.5).</p>
    <input type="hidden" id="ic-id" value="${iid||""}">
    <div class="form-grid">
      <div class="field span2"><label for="ic-desc">Description et circonstances</label><textarea class="inp" id="ic-desc" rows="3">${esc(x.desc||"")}</textarea></div>
      <div class="field span2"><label for="ic-info">Renseignements personnels visés</label><input class="inp" id="ic-info" value="${esc(x.info||"")}" placeholder="Ex. nom, programme d'exercices et notes cliniques d'un client"></div>
      <div class="field"><label for="ic-when">Date ou période de l'incident</label><input class="inp" id="ic-when" value="${esc(x.when||"")}" placeholder="Ex. 18 octobre 2026"></div>
      <div class="field"><label for="ic-found">Date où vous l'avez appris</label><input class="inp" id="ic-found" type="date" max="${TODAY}" value="${d(x.found)||TODAY}"></div>
      <div class="field"><label for="ic-nb">Nombre de personnes visées</label><input class="inp num" id="ic-nb" type="number" min="0" value="${esc(x.nb??"")}"></div>
      <div class="field"><label for="ic-risk">Risque de préjudice sérieux ?</label><select class="inp" id="ic-risk"><option value="">À évaluer</option><option value="oui" ${x.risk==="oui"?"selected":""}>Oui : aviser la CAI et les personnes</option><option value="non" ${x.risk==="non"?"selected":""}>Non</option></select></div>
      <div class="field span2"><label for="ic-why">Évaluation du risque</label><textarea class="inp" id="ic-why" rows="2" placeholder="Sensibilité des renseignements, conséquences possibles, probabilité d'un usage préjudiciable (art. 3.7)">${esc(x.why||"")}</textarea></div>
      <div class="field"><label for="ic-cai">Avis à la Commission d'accès à l'information le</label><input class="inp" id="ic-cai" type="date" max="${TODAY}" value="${d(x.cai)}"></div>
      <div class="field"><label for="ic-pers">Avis aux personnes visées le</label><input class="inp" id="ic-pers" type="date" max="${TODAY}" value="${d(x.pers)}"></div>
      <div class="field span2"><label for="ic-meas">Mesures prises</label><textarea class="inp" id="ic-meas" rows="2" placeholder="Ex. mot de passe changé, nouvelle clé de secours, client avisé, PDF supprimé par le destinataire">${esc(x.meas||"")}</textarea></div>
    </div>
    <p class="muted" style="font-size:.82rem">Si le risque de préjudice est sérieux, avisez avec diligence la Commission d'accès à l'information (formulaire sur <a href="https://www.cai.gouv.qc.ca" target="_blank" rel="noopener">cai.gouv.qc.ca</a>) et les personnes visées. Gardez ce registre : la Commission peut en demander une copie (art. 3.8).</p>
    <p class="err" id="ic-err" hidden></p>
    <div class="form-actions"><button type="button" class="btn" data-close>Annuler</button><button type="submit" class="btn primary">Enregistrer</button></div></form>`;
  sh.hidden=false; document.body.style.overflow="hidden";
}
async function submitIncident(){
  const v=k=>$("#ic-"+k).value.trim(), id=v("id"), err=$("#ic-err");
  if(!v("desc")){ err.textContent="Décrivez l'incident."; err.hidden=false; return }
  S.incidents=S.incidents||[];
  const data={desc:v("desc"),info:v("info"),when:v("when"),found:v("found"),nb:v("nb")===""?null:+v("nb"),risk:v("risk"),why:v("why"),cai:v("cai"),pers:v("pers"),meas:v("meas")};
  if(id){ const x=S.incidents.find(i=>i.id===id); x.history=x.history||[]; x.history.push({at:nowIso()}); Object.assign(x,data) }
  else S.incidents.push({id:newId("i"),created:nowIso(),...data});
  await flush(); closeSheet(); render(); toast("Registre des incidents mis à jour");
}
function incidentsPanel(){
  const list=[...(S.incidents||[])].sort((a,b)=>(b.created||"").localeCompare(a.created||""));
  return `<section class="panel">
    <div class="panel-h"><div><h2>Registre des incidents de confidentialité</h2><span class="muted" style="font-size:.85rem">Obligatoire, même s'il est vide (art. 3.8). Chaque incident y est inscrit, grave ou non.</span></div>
      <button class="btn sm" data-cf-inc-new>${I.plus} Inscrire un incident</button></div>
    ${list.length?`<div class="rows">${list.map(x=>`
      <div class="row prog-row"><div style="min-width:0"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b style="font-weight:600">${esc(x.when||dLong(x.found))}</b>
        <span class="chip ${x.risk==="oui"?"bad":x.risk==="non"?"ok":"warn"}">${x.risk==="oui"?"Préjudice sérieux":x.risk==="non"?"Risque faible":"Risque à évaluer"}</span>
        ${x.risk==="oui"&&!(x.cai&&x.pers)?`<span class="chip bad">Avis à faire</span>`:""}</div>
        <div class="muted" style="font-size:.84rem">${esc(x.desc)}${x.nb!=null?` · ${x.nb} personne${x.nb>1?"s":""}`:""}${x.meas?` · Mesures : ${esc(x.meas)}`:""}</div></div>
        <button class="btn sm" data-cf-inc-edit="${x.id}">Mettre à jour</button></div>`).join("")}</div>`:`<p class="muted">Aucun incident inscrit.</p>`}
  </section>`;
}

/* ---------- Page Conformité ---------- */
function vCompliance(){
  const r=rprp(), st=S.settings||{}, missing=S.clients.filter(c=>!consentState(c).ok);
  return `<div class="head"><div class="head-l"><span class="eyebrow">Loi 25 · Protection des renseignements personnels</span><h1>Conformité</h1></div></div>
  ${missing.length?`<div class="banner"><b>${missing.length} dossier${missing.length>1?"s":""} sans consentement valide :</b> ${missing.map(c=>`<button class="link" data-client="${c.id}">${esc(c.n)}</button>`).join(", ")}</div>`:""}
  <section class="panel">
    <h2>Responsable de la protection des renseignements personnels</h2>
    <p class="muted" style="max-width:75ch">Par défaut, c'est la personne qui exploite l'entreprise (art. 3.1). Son titre et ses coordonnées doivent être accessibles au public, par exemple sur votre site ou affichés à la clinique. Ils apparaissent dans l'avis de confidentialité et dans les PDF.</p>
    <form id="cf-rprp-form" class="form-grid" novalidate>
      <div class="field"><label for="rp-name">Nom</label><input class="inp" id="rp-name" value="${esc(r.name||st.kin||"")}"></div>
      <div class="field"><label for="rp-title">Titre</label><input class="inp" id="rp-title" value="${esc(r.title||"Responsable de la protection des renseignements personnels")}"></div>
      <div class="field span2"><label for="rp-contact">Coordonnées publiques</label><input class="inp" id="rp-contact" value="${esc(r.contact||st.contact||"")}" placeholder="Ex. confidentialite@monentreprise.ca · 418 555-0123"></div>
      <div class="field"><label for="rp-years">Durée de conservation après le dernier service</label><select class="inp" id="rp-years">${[1,2,3,5,7,10].map(y=>`<option value="${y}" ${(+st.retentionYears||5)===y?"selected":""}>${y} an${y>1?"s":""}</option>`).join("")}</select></div>
      <div class="field"><label for="rp-storage">Lieu de conservation (dans l'avis)</label><input class="inp" id="rp-storage" value="${esc(st.storage||"Les dossiers sont conservés sur l'ordinateur de l'entreprise, au Québec, chiffrés et protégés par mot de passe.")}"></div>
      <div class="span2" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="submit">Enregistrer</button><button class="btn" type="button" data-go-retention>Voir les échéances</button><button class="btn" type="button" data-cf-notice="">${I.pdf} Modèle d'avis de confidentialité (PDF)</button></div>
    </form>
    <p class="muted" style="font-size:.82rem">Vérifiez la durée de conservation exigée par votre fédération professionnelle ou votre assureur.</p>
  </section>
  ${retentionPanel()}
  ${requestsPanel()}
  ${incidentsPanel()}`;
}
async function submitRprp(){
  const v=k=>$("#rp-"+k).value.trim();
  S.settings=S.settings||{};
  S.settings.rprp={name:v("name"),title:v("title"),contact:v("contact")};
  S.settings.retentionYears=+v("years"); S.settings.storage=v("storage");
  await flush(); render(); toast("Informations de conformité enregistrées");
}
/* Rappel sur le tableau de bord */
function complianceReminder(){
  const due=openRequests().filter(r=>daysLeft(r.due)<=7), noCons=S.clients.filter(c=>!consentState(c).ok).length, inc=(S.incidents||[]).filter(x=>x.risk==="oui"&&!(x.cai&&x.pers)).length;
  const parts=[];
  if(due.length) parts.push(`${due.length} demande${due.length>1?"s":""} à traiter bientôt`);
  if(inc) parts.push(`${inc} incident${inc>1?"s":""} à déclarer`);
  if(noCons) parts.push(`${noCons} dossier${noCons>1?"s":""} sans consentement`);
  const exp=expired().length; if(exp) parts.push(`${exp} dossier${exp>1?"s":""} à détruire (conservation écoulée)`);
  return parts.length?`<div class="banner"><b>Conformité :</b> ${parts.join(" · ")}. <button class="link" data-go="compliance">Voir</button></div>`:"";
}

/* ---------- Interactions ---------- */
document.addEventListener("click",async ev=>{
  const b=ev.target.closest("button"); if(!b||!DK) return;
  const d=b.dataset;
  if(d.cfConsent){ openConsentForm(d.cfConsent) }
  else if(d.cfWithdraw){ openWithdraw(d.cfWithdraw) }
  else if(d.cfNotice!==undefined){ b.disabled=true; await noticePDF(C(d.cfNotice)||null); b.disabled=false }
  else if(d.cfAccess){ openAccessExport(d.cfAccess) }
  else if(d.cfAccessPdf){ const c=C(d.cfAccessPdf); b.disabled=true; await accessPDF(c); await logAccess(c,"pdf"); b.disabled=false }
  else if(d.cfAccessJson){ const c=C(d.cfAccessJson); await accessJSON(c); await logAccess(c,"json") }
  else if(d.cfRectify){ openRectify(d.cfRectify) }
  else if(d.cfAttest){ const [cid,i]=d.cfAttest.split(":"); await attestPDF(C(cid),+i) }
  else if(d.cfReqNew!==undefined){ openRequestForm() }
  else if(d.cfReqClose){ openRequestForm(d.cfReqClose) }
  else if(d.cfIncNew!==undefined){ openIncidentForm() }
  else if(d.cfIncEdit){ openIncidentForm(d.cfIncEdit) }
});
document.addEventListener("change",ev=>{
  const t=ev.target;
  if(t.name==="cs-by"){ $("#cs-parent-f").hidden=t.value!=="parent" }
  else if(t.id==="cs-tiers"){ $("#cs-tiers-f").hidden=!t.checked }
  else if(t.id==="rt-field"){ rectFieldUI(C($("#rt-c").value)) }
});
document.addEventListener("submit",ev=>{
  const id=ev.target.id, map={"cf-consent-form":submitConsent,"cf-withdraw-form":submitWithdraw,"cf-rect-form":submitRectify,"cf-req-form":submitRequest,"cf-inc-form":submitIncident,"cf-rprp-form":submitRprp};
  if(map[id]){ ev.preventDefault(); map[id]() }
});

/* ---------- Conservation et destruction (art. 3.2, 23) ---------- */
const retYears = ()=>+(S.settings?.retentionYears)||5;
/* Dernier service : séance saisie, programme créé, note d'ajout ou début du suivi, la date la plus récente.
   La fermeture du dossier ne compte pas : elle ne repousse pas l'échéance. */
function lastService(c){
  const d=[c.start,...c.log.map(l=>l.date),...c.progs.map(p=>p.created),...(c.addenda||[]).map(a=>localDay(a.at))].filter(Boolean).sort();
  return d.length?d[d.length-1]:TODAY;
}
function retentionDue(c){ const d=new Date(lastService(c)+"T12:00"); d.setFullYear(d.getFullYear()+retYears()); return iso(d) }
const daysToDue = c=>Math.round((new Date(retentionDue(c)+"T12:00")-new Date(TODAY+"T12:00"))/864e5);
const expired = ()=>S.clients.filter(c=>daysToDue(c)<=0);
const soonExpired = ()=>S.clients.filter(c=>{const d=daysToDue(c);return d>0&&d<=90});
function retentionPanel(){
  const ex=expired(), soon=soonExpired(), reg=[...(S.destructions||[])].reverse();
  const row=(c,overdue)=>`<div class="row prog-row"><div style="min-width:0"><b style="font-weight:600">${esc(c.n)}</b>
      <div class="muted" style="font-size:.84rem">Dernier service le ${esc(dLong(lastService(c)))} · échéance le ${esc(dLong(retentionDue(c)))}${c.locked?" · dossier fermé":""}</div></div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="chip ${overdue?"bad":"warn"}">${overdue?"Échu":`Dans ${daysToDue(c)} j`}</span>
      ${overdue?`<button class="btn sm danger" data-cf-destroy="${c.id}">Détruire</button>`:""}</div></div>`;
  return `<section class="panel" id="cf-retention">
    <div class="panel-h"><div><h2>Conservation et destruction</h2><span class="muted" style="font-size:.85rem">Durée réglée : ${retYears()} an${retYears()>1?"s":""} après le dernier service. Une fois cette durée écoulée, le dossier doit être détruit (art. 23).</span></div></div>
    ${ex.length?`<h3>Dossiers échus, à détruire (${ex.length})</h3><div class="rows">${ex.map(c=>row(c,true)).join("")}</div>`:`<p class="muted">Aucun dossier n'est arrivé à la fin de sa durée de conservation.</p>`}
    ${soon.length?`<h3>Échéance dans les 90 prochains jours (${soon.length})</h3><div class="rows">${soon.map(c=>row(c,false)).join("")}</div>`:""}
    <details><summary><b>Registre des destructions</b> <span class="muted" style="font-size:.85rem">· ${reg.length} entrée${reg.length>1?"s":""} · aucun renseignement personnel n'y est conservé</span></summary>
      ${reg.length?`<ol class="audit">${reg.map(x=>`<li><span class="num muted">${esc(stamp(x.at))}</span><span>Dossier ${esc(x.ref)} détruit · ${esc(x.reason)} · dernier service le ${esc(dLong(x.lastService))} · ${x.progs} programme${x.progs>1?"s":""}, ${x.sessions} séance${x.sessions>1?"s":""} · par ${esc(x.by)}</span></li>`).join("")}</ol>`:`<p class="muted">Aucune destruction pour l'instant.</p>`}
    </details>
    <p class="muted" style="font-size:.82rem">Les dossiers détruits restent dans vos anciens fichiers de sauvegarde. Après une destruction, faites une nouvelle sauvegarde et supprimez les anciennes.</p>
  </section>`;
}
function openDestroy(cid){
  const c=C(cid), due=daysToDue(c)<=0, sh=$("#sheet");
  sh.innerHTML=`<form class="sheet-card form-card" id="cf-destroy-form" role="alertdialog" aria-modal="true" aria-labelledby="ds-t" novalidate>
    <h2 id="ds-t" style="font-size:1.3rem">Détruire le dossier de ${esc(c.n)} ?</h2>
    <p>${due?`La durée de conservation est écoulée depuis le ${esc(dLong(retentionDue(c)))}.`:`<b>La durée de conservation n'est pas écoulée</b> (échéance le ${esc(dLong(retentionDue(c)))}). Une destruction anticipée doit être justifiée, par exemple un dossier ouvert par erreur. Vérifiez d'abord qu'aucune règle professionnelle ne vous oblige à le garder.`}</p>
    <p class="muted">Tout le dossier sera effacé définitivement : fiche, programmes, séances, notes, consentements, rectifications et historique, même s'il est verrouillé. Le registre des destructions ne garde qu'une référence anonyme, la date et le motif. Dans le registre des demandes, le nom du client est remplacé par cette référence.</p>
    <input type="hidden" id="ds-c" value="${c.id}">
    ${due?"":`<div class="field"><label for="ds-reason">Motif de la destruction anticipée</label><input class="inp" id="ds-reason" placeholder="Ex. dossier créé par erreur, aucun service rendu"></div>`}
    <div class="field"><label for="ds-name">Pour confirmer, tapez le nom du client : <b>${esc(c.n)}</b></label><input class="inp" id="ds-name" autocomplete="off"></div>
    <p class="err" id="ds-err" hidden></p>
    <div class="form-actions"><button type="button" class="btn" data-close>Annuler</button><button type="submit" class="btn danger-solid">${I.trash} Détruire définitivement</button></div></form>`;
  sh.hidden=false; document.body.style.overflow="hidden"; $("#ds-name").focus();
}
async function submitDestroy(){
  const c=C($("#ds-c").value), err=$("#ds-err"), fail=m=>{err.textContent=m;err.hidden=false};
  const due=daysToDue(c)<=0, reason=due?`Fin de la durée de conservation (${retYears()} ans)`:$("#ds-reason")?.value.trim();
  if(!due&&!reason) return fail("Indiquez le motif de la destruction anticipée.");
  if($("#ds-name").value.trim()!==c.n.trim()) return fail("Le nom tapé ne correspond pas au nom du client.");
  S.destructions=S.destructions||[];
  const ref="D-"+String(S.destructions.length+1).padStart(4,"0");
  S.destructions.push({at:nowIso(),ref,reason:due?reason:`Destruction anticipée : ${reason}`,lastService:lastService(c),progs:c.progs.length,sessions:c.log.length,by:rprp().name||S.settings?.kin||"Responsable"});
  for(const r of S.requests||[]) if(r.cid===c.id){ r.cid=null; r.client=`Dossier ${ref} (détruit)`; r.details=""; }
  S.clients=S.clients.filter(x=>x.id!==c.id);
  delete ui.integ[c.id]; delete ui.integKey[c.id];
  await flush(); closeSheet(); go("compliance"); toast(`Dossier détruit (${ref}). Pensez à refaire une sauvegarde.`);
}

/* ---------- Effacer toutes les données de cet appareil ---------- */
function eraseZone(){
  return `<section class="panel danger-zone">
    <h2>Effacer toutes les données de cet appareil</h2>
    <p class="muted" style="max-width:75ch">À faire avant de vendre, de donner ou de faire réparer l'ordinateur, ou pour arrêter d'utiliser Kinoza ici. Tous les dossiers, réglages et registres enregistrés dans ce navigateur seront effacés. Vos fichiers de sauvegarde et vos PDF ne sont pas touchés : supprimez-les vous-même au besoin.</p>
    <button class="btn danger" data-cf-erase>${I.trash} Effacer toutes les données</button>
  </section>`;
}
function openErase(){
  const sh=$("#sheet");
  sh.innerHTML=`<form class="sheet-card form-card" id="cf-erase-form" role="alertdialog" aria-modal="true" aria-labelledby="er-t" novalidate style="width:min(500px,100%)">
    <h2 id="er-t" style="font-size:1.3rem">Effacer toutes les données de cet appareil ?</h2>
    <p><b>${S.clients.length} dossier${S.clients.length>1?"s":""}</b> et tous les registres seront effacés de ce navigateur. C'est irréversible. Si vous voulez garder vos dossiers, exportez d'abord une sauvegarde chiffrée.</p>
    <div class="field"><label for="er-pw">Votre mot de passe Kinoza</label><input class="inp" id="er-pw" type="password" autocomplete="current-password"></div>
    <div class="field"><label for="er-word">Tapez <b>EFFACER</b> pour confirmer</label><input class="inp" id="er-word" autocomplete="off"></div>
    <p class="err" id="er-err" hidden></p>
    <div class="form-actions"><button type="button" class="btn" data-close>Annuler</button><button type="submit" class="btn danger-solid" id="er-go">${I.trash} Tout effacer</button></div></form>`;
  sh.hidden=false; document.body.style.overflow="hidden"; $("#er-pw").focus();
}
async function submitErase(){
  const err=$("#er-err"), b=$("#er-go"), fail=m=>{err.textContent=m;err.hidden=false;b.disabled=false};
  if($("#er-word").value.trim()!=="EFFACER") return fail("Tapez EFFACER en majuscules pour confirmer.");
  b.disabled=true;
  if(!await checkPassword($("#er-pw").value)) return fail("Mot de passe incorrect.");
  DK=null; DKRAW=null; VAULT=null; clearTimeout(saveTimer);
  try{ Object.keys(localStorage).filter(k=>/^kinoza-|^kineplan-/.test(k)).forEach(k=>localStorage.removeItem(k)) }catch(e){}
  S=seed(); closeSheet(); $("#main").innerHTML=""; $("#nav").innerHTML="";
  showLock("setup",{legacy:null}); toast("Toutes les données de cet appareil ont été effacées");
}
document.addEventListener("click",ev=>{
  const b=ev.target.closest("button"); if(!b||!DK) return;
  if(b.dataset.cfDestroy) openDestroy(b.dataset.cfDestroy);
  else if(b.dataset.goRetention!==undefined) $("#cf-retention")?.scrollIntoView({behavior:"smooth",block:"start"});
  else if(b.dataset.cfErase!==undefined) openErase();
});
document.addEventListener("submit",ev=>{
  if(ev.target.id==="cf-destroy-form"){ ev.preventDefault(); submitDestroy() }
  else if(ev.target.id==="cf-erase-form"){ ev.preventDefault(); submitErase() }
});


/* ---------- Envoi d'un programme par courriel ----------
   Sans serveur, la page ne peut pas envoyer de courriel ni joindre un fichier : elle prépare le PDF protégé
   et ouvre le logiciel de courriel avec le message rempli. Le fichier se joint à la main. */
const emailOk = v=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v||"").trim());
const courrielOk = c=>{const st=consentState(c); return st.ok&&!!st.last?.purposes?.courriel};
const newPdfPw = ()=>[...rand(8)].map(b=>REC_ABC[b%32]).join("").replace(/^(.{4})/,"$1-");
let MAIL=null;
function openMail(cid,pid){
  const c=C(cid), prog=c.progs.find(p=>p.id===pid)||AP(c), sh=$("#sheet"), st=S.settings||{};
  const blocked = !c.email
    ? `<p>Ce client n'a pas d'adresse courriel dans son dossier.</p><button type="button" class="btn primary" style="align-self:flex-start" ${c.locked?`data-cf-rectify="${c.id}"`:`data-edit-client="${c.id}"`}>${c.locked?"Rectifier la fiche":"Ajouter l'adresse à la fiche"}</button>`
    : !courrielOk(c)
    ? `<p>Le client n'a pas consenti à recevoir ses programmes par courriel (Loi 25, art. 12 et 14). Faites-lui signer l'avis, puis cochez cette fin dans son consentement.</p><button type="button" class="btn primary" style="align-self:flex-start" data-cf-consent="${c.id}">Enregistrer un consentement</button>`
    : "";
  MAIL={cid,pid:prog.id,saved:false};
  const prenom=first(c), sign=[st.kin,st.clinic,st.contact].filter(Boolean).join("\n");
  sh.innerHTML=`<form class="sheet-card form-card" id="cf-mail-form" role="dialog" aria-modal="true" aria-labelledby="ml-t" novalidate>
    <div style="display:flex;justify-content:space-between;gap:12px"><div><span class="eyebrow">${esc(c.n)} · ${esc(prog.name)}</span><h2 id="ml-t" style="font-size:1.35rem">Envoyer le programme par courriel</h2></div><button type="button" class="icon-btn" data-close aria-label="Fermer">${I.x}</button></div>
    ${blocked||`
    <div class="confirm-box" style="border-color:var(--line);background:var(--sunk)"><span class="eyebrow">Destinataire : vérifiez l'adresse</span><b style="word-break:break-all">${esc(c.email)}</b></div>
    <label class="check-line"><input type="checkbox" id="ml-protect" checked> Protéger le PDF par un mot de passe (recommandé)</label>
    <div class="field" id="ml-pw-f"><label for="ml-pw">Mot de passe du PDF</label><input class="inp num" id="ml-pw" autocomplete="off" value="${newPdfPw()}">
      <span class="muted" style="font-size:.8rem">Donnez-le au client de vive voix ou par texto, jamais dans le même courriel. Protection de base : elle arrête un destinataire par erreur, pas un expert.</span></div>
    <div class="field"><span class="eyebrow">Le message</span>
      <label for="ml-subject">Objet</label><input class="inp" id="ml-subject" value="Votre programme d'exercices">
      <label for="ml-body">Message</label><textarea class="inp" id="ml-body" rows="7"></textarea></div>
    <div id="ml-direct" hidden style="display:flex;flex-direction:column;gap:10px">
      <label class="check-line"><input type="checkbox" id="ml-verified"> J'ai vérifié l'adresse. Cet envoi ne pourra pas être annulé.</label>
      <button type="button" class="btn primary" id="ml-send" disabled style="justify-content:center">${I.mail} Envoyer maintenant</button>
      <span class="muted" id="ml-from" style="font-size:.8rem"></span></div>
    <div id="ml-manual" style="display:flex;flex-direction:column;gap:12px">
      <p class="muted" style="font-size:.82rem" id="ml-why">Vérification du programme d'envoi…</p>
      <div id="ml-share-box" hidden><span class="eyebrow">Le plus simple sur Mac</span>
        <button type="button" class="btn primary" id="ml-share" style="width:100%;justify-content:center;margin-top:6px">${I.mail} Partager vers Mail, PDF joint</button>
        <span class="muted" style="font-size:.8rem;display:block;margin-top:4px">Choisissez <b>Mail</b> dans le menu : le PDF et le message sont ajoutés. L'adresse du client est copiée : collez-la dans « À » avec Cmd + V. Passez ensuite à l'étape 3.</span>
        <span class="eyebrow" style="display:block;margin-top:12px">Ou, étape par étape</span></div>
      <div><span class="eyebrow">Étape 1</span><button type="button" class="btn" id="ml-pdf" style="width:100%;justify-content:center;margin-top:6px">${I.pdf} Créer et enregistrer le PDF</button></div>
      <div><span class="eyebrow">Étape 2</span><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><a class="btn" id="ml-open" href="#" target="_blank" rel="noopener">${I.mail} Ouvrir mon courriel</a>
        <button type="button" class="btn sm" data-cf-copy="${esc(c.email)}">Copier l'adresse</button><button type="button" class="btn sm" data-cf-copy-from="ml-subject">Copier l'objet</button><button type="button" class="btn sm" data-cf-copy-from="ml-body">Copier le message</button></div>
        <span class="muted" style="font-size:.8rem;display:block;margin-top:4px">Joignez le PDF au message. Si le bouton n'ouvre rien, copiez les éléments dans votre courriel.</span></div>
      <div><span class="eyebrow">Étape 3</span><button type="submit" class="btn" style="width:100%;justify-content:center;margin-top:6px">J'ai envoyé le courriel : l'inscrire au dossier</button></div>
    </div>
    <p class="err" id="ml-err" hidden></p>`}
  </form>`;
  sh.hidden=false; document.body.style.overflow="hidden";
  if(!blocked){
    const body=$("#ml-body");
    MAIL.base=`Bonjour ${prenom},\n\nVous trouverez votre programme d'exercices en pièce jointe.`;
    MAIL.sign=`\n\nPour toute question, écrivez-moi ou appelez-moi.${sign?`\n\n${sign}`:""}`;
    body.value=mailBody(true); mailRefresh(); mailCheckRelay();
    $("#ml-share-box").hidden=!canShareFiles();
  }
}
/* Petit programme d'envoi (outils/kinoza-courriel.py) : joignable seulement depuis ce même ordinateur */
async function relayCall(path,opt={},ms=2500){
  const r=S.settings?.relay; if(!r?.token) throw {code:"off"};
  const ctl=new AbortController(), t=setTimeout(()=>ctl.abort(),ms);
  try{
    const res=await fetch(`http://127.0.0.1:${+r.port||8787}${path}`,{...opt,headers:{...(opt.headers||{}),"X-Kinoza-Jeton":r.token},signal:ctl.signal});
    const j=await res.json().catch(()=>({}));
    if(!res.ok) throw {code:"refused",message:j.erreur||"Le programme d'envoi a refusé la demande."};
    return j;
  }catch(e){ if(e?.code) throw e; throw {code:"down"} }
  finally{ clearTimeout(t) }
}
async function mailCheckRelay(){
  const cid=MAIL.cid;
  let st=null, why="";
  try{ st=await relayCall("/etat") }
  catch(e){ why=e.code==="off"?"Envoi manuel : le programme d'envoi n'est pas configuré (page Sécurité).":e.code==="refused"?`Envoi manuel : ${e.message}`:"Envoi manuel : le programme d'envoi n'est pas démarré ou n'est pas joignable d'ici."; }
  if(!MAIL||MAIL.cid!==cid||!$("#ml-direct")) return;
  if(st?.ok){
    MAIL.from=st.from; $("#ml-direct").hidden=false; $("#ml-manual").hidden=true;
    $("#ml-from").textContent=`Envoi depuis ${st.from}, par ${st.provider==="gmail"?"Gmail":"Outlook"}. Une copie reste dans vos messages envoyés.`;
  } else { $("#ml-direct").hidden=true; $("#ml-why").textContent=why; }
}
async function mailSendDirect(b){
  const c=C(MAIL.cid), prog=c.progs.find(p=>p.id===MAIL.pid), prot=$("#ml-protect").checked, pw=$("#ml-pw").value.trim(), err=$("#ml-err");
  const fail=m=>{ err.textContent=m; err.hidden=false; b.disabled=false; b.innerHTML=`${I.mail} Envoyer maintenant` };
  if(prot&&pw.length<6) return fail("Le mot de passe du PDF doit contenir au moins 6 caractères.");
  err.hidden=true; b.disabled=true; b.textContent="Envoi en cours…";
  try{
    const blob=await buildPDF(c,prog,{steps:true,journal:(S.settings||{}).journal!==false,notes:false,password:prot?pw:null});
    await relayCall("/envoyer",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:c.email,subject:$("#ml-subject").value,body:$("#ml-body").value,filename:`Programme d'exercices - ${TODAY}.pdf`,pdf:b64(await blob.arrayBuffer())})},60000);
  }catch(e){
    return fail(e?.code==="refused"?e.message:e?.code==="down"?"Le programme d'envoi ne répond plus. Rien n'a été confirmé : vérifiez vos messages envoyés avant de réessayer.":"Le PDF n'a pas pu être créé. Vérifiez votre connexion Internet, puis réessayez.");
  }
  await logAudit(c,`Programme envoyé par courriel : ${prog.name} (${c.email}), depuis ${MAIL.from}`); await flush(); render();
  $("#sheet").innerHTML=`<div class="sheet-card form-card" role="dialog" aria-modal="true" aria-labelledby="ms-t" style="width:min(460px,100%)">
    <h2 id="ms-t" style="font-size:1.3rem">Programme envoyé</h2>
    <p>Envoyé à <b>${esc(c.email)}</b> et inscrit à l'historique du dossier.</p>
    ${prot?`<div class="cue-box"><span class="eyebrow">Mot de passe du PDF à donner au client</span><span class="num" style="font-size:1.1rem">${esc(pw)}</span></div>
    <p class="muted" style="font-size:.85rem">Donnez-le de vive voix ou par texto, jamais par courriel. Il ne sera plus affiché.</p>`:""}
    <div class="form-actions">${prot?`<button type="button" class="btn" data-cf-copy="${esc(pw)}">Copier le mot de passe</button>`:""}<button type="button" class="btn primary" data-close>Fermer</button></div></div>`;
}
/* Réglages du programme d'envoi, page Sécurité */
function relayPanel(){
  const r=S.settings?.relay||{};
  return `<section class="panel">
    <h2>Envoi de courriels</h2>
    <p class="muted" style="max-width:75ch">Pour envoyer les programmes depuis Kinoza par Gmail ou Outlook, lancez le petit programme <span class="num">outils/kinoza-courriel.py</span> sur cet ordinateur, puis copiez son jeton ici. Ça ne fonctionne qu'en ouvrant Kinoza depuis votre fichier <span class="num">index.html</span>, pas sur claude.ai.</p>
    <form id="cf-relay-form" class="form-grid" novalidate>
      <div class="field"><label for="ry-token">Jeton</label><input class="inp num" id="ry-token" type="password" autocomplete="off" value="${esc(r.token||"")}"></div>
      <div class="field"><label for="ry-port">Port</label><input class="inp num" id="ry-port" inputmode="numeric" value="${esc(r.port||8787)}"></div>
      <div class="span2" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn primary" type="submit">Enregistrer et vérifier</button><span id="ry-status" role="status" style="font-size:.88rem"></span></div>
    </form></section>`;
}
async function submitRelay(){
  const st=$("#ry-status"), token=$("#ry-token").value.trim(), port=parseInt($("#ry-port").value,10);
  if(!(port>=1024&&port<=65535)){ st.textContent="Le port doit être un nombre entre 1024 et 65535."; return }
  S.settings=S.settings||{}; S.settings.relay=token?{token,port}:null; await flush();
  if(!token){ st.textContent="Envoi direct désactivé."; return }
  st.textContent="Vérification…";
  try{ const r=await relayCall("/etat"); st.textContent=`Connecté : envois depuis ${r.from}.` }
  catch(e){ st.textContent=e.code==="refused"?e.message:"Programme d'envoi injoignable. Vérifiez qu'il est démarré et que Kinoza est ouvert depuis votre fichier index.html." }
}
const mailBody = prot=>MAIL.base+(prot?" Le fichier est protégé : je vous transmets le mot de passe séparément.":"")+MAIL.sign;
function mailRefresh(){
  const c=C(MAIL.cid), a=$("#ml-open"); if(!a) return;
  a.href=`mailto:${encodeURIComponent(c.email).replace(/%40/g,"@")}?subject=${encodeURIComponent($("#ml-subject").value)}&body=${encodeURIComponent($("#ml-body").value)}`;
}
/* Menu Partager du système (Safari sur Mac, iPhone…) : joint le PDF directement dans Mail.
   Safari n'ouvre ce menu que juste après un clic : si la création du PDF a été trop longue, un deuxième clic partage le PDF déjà prêt. */
const PDF_PROBE = ()=>{ try{ return new File(["%PDF"],"test.pdf",{type:"application/pdf"}) }catch(e){ return null } };
const canShareFiles = ()=>{ const f=PDF_PROBE(); try{ return !!(f&&navigator.share&&navigator.canShare?.({files:[f]})) }catch(e){ return false } };
async function mailShare(b){
  const c=C(MAIL.cid), prog=c.progs.find(p=>p.id===MAIL.pid), prot=$("#ml-protect").checked, pw=$("#ml-pw").value.trim(), err=$("#ml-err");
  if(prot&&pw.length<6){ err.textContent="Le mot de passe du PDF doit contenir au moins 6 caractères."; err.hidden=false; return }
  err.hidden=true;
  navigator.clipboard?.writeText(c.email).catch(()=>{});
  const key=prot?"p:"+pw:"libre", label=`${I.mail} Partager vers Mail, PDF joint`;
  if(MAIL.file?.key!==key){
    b.disabled=true; b.textContent="Création du PDF…";
    try{
      const blob=await buildPDF(c,prog,{steps:true,journal:(S.settings||{}).journal!==false,notes:false,password:prot?pw:null});
      MAIL.file={key,file:new File([blob],`Programme d'exercices - ${TODAY}.pdf`,{type:"application/pdf"})};
    }catch(e){ b.disabled=false; b.innerHTML=label; err.textContent="Le PDF n'a pas pu être créé. Réessayez."; err.hidden=false; return }
    b.disabled=false;
  }
  try{
    await navigator.share({files:[MAIL.file.file],title:$("#ml-subject").value,text:$("#ml-body").value});
    MAIL.saved=true; b.innerHTML=label; toast("Message prêt : vérifiez l'adresse, envoyez, puis faites l'étape 3");
  }catch(e){
    if(e?.name==="AbortError"){ b.innerHTML=label; return }
    if(e?.name==="NotAllowedError"){ b.innerHTML=`${I.mail} PDF prêt : partager`; return }
    b.innerHTML=label; err.textContent="Le menu Partager n'a pas pu s'ouvrir. Utilisez les étapes ci-dessous."; err.hidden=false;
  }
}
async function mailMakePdf(b){
  const c=C(MAIL.cid), prog=c.progs.find(p=>p.id===MAIL.pid), prot=$("#ml-protect").checked, pw=$("#ml-pw").value.trim(), err=$("#ml-err");
  if(prot&&pw.length<6){ err.textContent="Le mot de passe du PDF doit contenir au moins 6 caractères."; err.hidden=false; return }
  err.hidden=true; b.disabled=true; const html=b.innerHTML; b.textContent="Création du PDF…";
  try{
    const blob=await buildPDF(c,prog,{steps:true,journal:(S.settings||{}).journal!==false,notes:false,password:prot?pw:null});
    await saveFile(`Programme d'exercices - ${TODAY}.pdf`,blob);
    MAIL.saved=true; toast("PDF enregistré : joignez-le à votre courriel");
  }catch(e){
    err.textContent=e?.code==="declined"?"Enregistrement annulé.":"Le PDF n'a pas pu être créé ou enregistré. Vérifiez votre connexion Internet, puis réessayez."; err.hidden=false;
  }finally{ b.disabled=false; b.innerHTML=html }
}
async function submitMail(){
  const c=C(MAIL.cid), prog=c.progs.find(p=>p.id===MAIL.pid), err=$("#ml-err");
  if(!MAIL.saved){ err.textContent="Créez d'abord le PDF à l'étape 1."; err.hidden=false; return }
  await logAudit(c,`Programme envoyé par courriel : ${prog.name} (${c.email})`); await flush();
  closeSheet(); render(); toast("Envoi inscrit à l'historique du dossier");
}
function copyText(t,b){
  const label=b.textContent;
  navigator.clipboard?.writeText(t).then(()=>{b.textContent="Copié"; setTimeout(()=>{b.textContent=label},1500)}).catch(()=>toast("Sélectionnez le texte et copiez-le avec Ctrl+C"));
}
document.addEventListener("click",ev=>{
  const b=ev.target.closest("button"); if(!b||!DK) return;
  const d=b.dataset;
  if(d.cfMail){ const [cid,pid]=d.cfMail.split(":"); openMail(cid,pid) }
  else if(b.id==="ml-pdf"){ mailMakePdf(b) }
  else if(b.id==="ml-share"){ mailShare(b) }
  else if(b.id==="ml-send"){ mailSendDirect(b) }
  else if(d.cfCopy){ copyText(d.cfCopy,b) }
  else if(d.cfCopyFrom){ copyText($("#"+d.cfCopyFrom).value,b) }
});
document.addEventListener("input",ev=>{ if(MAIL&&(ev.target.id==="ml-subject"||ev.target.id==="ml-body")) mailRefresh(); if(MAIL&&ev.target.id==="ml-pw") MAIL.file=null });
document.addEventListener("change",ev=>{
  if(ev.target.id==="ml-verified"){ $("#ml-send").disabled=!ev.target.checked; return }
  if(ev.target.id!=="ml-protect") return;
  $("#ml-pw-f").hidden=!ev.target.checked;
  $("#ml-body").value=mailBody(ev.target.checked); mailRefresh(); MAIL.saved=false; MAIL.file=null;
});
document.addEventListener("submit",ev=>{
  if(ev.target.id==="cf-mail-form"){ ev.preventDefault(); if(!$("#ml-manual").hidden) submitMail() }
  else if(ev.target.id==="cf-relay-form"){ ev.preventDefault(); submitRelay() }
});
