/* Kinoza · export des programmes en PDF (jsPDF chargé à la demande) */

/* ---------- Export PDF ---------- */
/* Copie locale d'abord (site en ligne, Dock du Mac), puis le CDN si elle est absente */
const JSPDF_URLS=["js/jspdf.umd.min.js","https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"];
function loadScript(src){
  return new Promise((res,rej)=>{const s=document.createElement("script");s.src=src;
    s.onload=()=>window.jspdf?res(window.jspdf.jsPDF):rej(new Error("jspdf"));s.onerror=()=>{s.remove();rej(new Error("jspdf"))};document.head.appendChild(s)});
}
async function loadJsPDF(){
  if(window.jspdf) return window.jspdf.jsPDF;
  for(const u of JSPDF_URLS){ try{ return await loadScript(u) }catch(e){} }
  throw new Error("jspdf");
}
const PRINT_CSS=`.lim{fill:none;stroke:#2a3a37;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.trunk{stroke-width:5}.far{opacity:.45}.nose{stroke-width:2.4}
.hd{fill:#2a3a37}.ghost{opacity:.2}.tgt{fill:#1c6a5e;opacity:.28}.flr{fill:#d2dcd9}.mat{fill:#1c6a5e;opacity:.35}
.prop{fill:#ffffff;stroke:#5a6966;stroke-width:1.4;stroke-linejoin:round}.prop path{fill:none;stroke-width:2.2;stroke-linecap:round}
.band{stroke:#a35d0c;stroke-width:1.6;stroke-dasharray:3 2;fill:none}.anchor{fill:#a35d0c}.db rect{fill:#5a6966}.ballp{fill:#a35d0c}
.pad{fill:#f6e8d4;stroke:#a35d0c;stroke-width:1}.towel{fill:#f6e8d4;stroke:#a35d0c;stroke-width:1}.stick{stroke:#a35d0c;stroke-width:2.2;stroke-linecap:round}`;
function figPNG(id){
  const ex=EX[id], vb=viewBox(ex), W=640, H=512;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}"><style>${PRINT_CSS}</style>
    <rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="#eef3f1"/>${sceneSVG(ex)}</svg>`;
  return new Promise((res,rej)=>{const img=new Image();
    img.onload=()=>{const cv=document.createElement("canvas");cv.width=W;cv.height=H;cv.getContext("2d").drawImage(img,0,0,W,H);res(cv.toDataURL("image/png"))};
    img.onerror=rej; img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg)});
}
/* Les polices standard du PDF couvrent le jeu WinAnsi : on remplace les rares symboles hors jeu */
const pdfTxt=s=>String(s??"").replace(/→/g,"->").replace(/≥/g,">=").replace(/≤/g,"<=").replace(/[“”]/g,'"');
function freqTxt(p){ return freqShort(p) + (fMax(p)>=2&&fMax(p)<=4?", idéalement avec une journée de repos entre deux séances":"") }
function doseParts(e){
  /* Un champ vide est retiré du programme : rien n'est affiché pour lui */
  const s=String(e.s??"").trim(), rep=String(e.rep??"").trim(), parts=[];
  const repTxt=rep+(/^\d+$/.test(rep)?" rép.":""), serTxt=`${s} série${+s>1?"s":""}`;
  if(s||rep) parts.push(s&&rep?`${serTxt} × ${repTxt}`:s?serTxt:repTxt);
  if(e.t&&e.t!=="—") parts.push("Tempo "+e.t);
  if(e.rest!==""&&e.rest!=null&&+e.rest!==0) parts.push(`Repos ${e.rest} s`);
  const l=String(e.load||"").trim(); if(l&&l!=="—") parts.push(l==="PDC"?"Poids du corps":l);
  return parts;
}
async function buildPDF(c,prog,opt){
  const jsPDF=await loadJsPDF();
  const doc=new jsPDF({unit:"mm",format:"letter",...(opt.password?{encryption:{userPassword:opt.password,ownerPassword:newId("o")+newId("o"),userPermissions:["print"]}}:{})});
  const PW=215.9, PH=279.4, M=17, CW=PW-2*M, BOTTOM=PH-20;
  const ink=[22,33,31], muted=[90,105,102], line=[217,225,223], acc=[28,106,94], soft=[236,244,241], warn=[163,93,12], warnSoft=[250,241,229];
  const set=(sz,st="normal",col=ink)=>{doc.setFont("helvetica",st);doc.setFontSize(sz);doc.setTextColor(...col)};
  const label=(t,x,y)=>{set(7,"bold",muted);doc.text(pdfTxt(t).toUpperCase(),x,y,{charSpace:.35})};
  const settings=S.settings||{};
  const dateTxt=now.toLocaleDateString("fr-CA",{day:"numeric",month:"long",year:"numeric"});
  let y=0;

  const smallHeader=()=>{
    doc.setFillColor(...acc); doc.rect(0,0,PW,2,"F");
    set(8.5,"bold",acc); doc.text(pdfTxt(settings.clinic||"Programme d'exercices"),M,11);
    set(8.5,"normal",muted); doc.text(pdfTxt(c.n),PW-M,11,{align:"right"});
    doc.setDrawColor(...line); doc.setLineWidth(.3); doc.line(M,14,PW-M,14);
    y=22;
  };
  const ensure=h=>{ if(y+h>BOTTOM){ doc.addPage(); smallHeader(); } };

  /* En-tête de la première page */
  doc.setFillColor(...acc); doc.rect(0,0,PW,4,"F");
  set(9,"bold",acc); doc.text(pdfTxt(settings.clinic||"Kinoza"),M,15);
  set(8.5,"normal",muted); doc.text("Remis le "+dateTxt,PW-M,15,{align:"right"});
  set(21,"bold"); doc.text("Programme d'exercices à domicile",M,27);
  set(11,"normal",muted); doc.text(pdfTxt(prog.name),M,34);

  /* Fiche d'identification */
  const boxY=40, colW=CW/3;
  /* Un objectif long (un paragraphe) prend toute la largeur, sur sa propre rangée */
  const dx=String(prog.dx||"").trim(), longDx=dx.length>60||dx.includes("\n");
  const obj=["Objectif du programme",dx||"—"], fr=["Fréquence",freqTxt(prog)], ph=["Phase",prog.phase||"—"], kin=["Entraîneur(e)",settings.kin||"—"], co=["Coordonnées",settings.contact||"—"];
  const rows=longDx?[[["Client",c.n],ph,fr],[kin,co],[[...obj,3]]]:[[["Client",c.n],obj,ph],[fr,kin,co]];
  const lay=rows.map(r=>{const cl=r.map(([,v,sp])=>{set(9.5,sp?"normal":"bold");return doc.splitTextToSize(pdfTxt(v),colW*(sp||1)-8)}); return {r,cl,h:8+Math.max(...cl.map(l=>l.length))*4.3}});
  const boxH=lay.reduce((a,x)=>a+x.h,0)+6;
  doc.setFillColor(...soft); doc.roundedRect(M,boxY,CW,boxH,2.5,2.5,"F");
  let ry=boxY+6;
  lay.forEach(({r,cl,h})=>{ r.forEach(([k,,sp],i)=>{const x=M+5+i*colW; label(k,x,ry); set(9.5,sp?"normal":"bold"); doc.text(cl[i],x,ry+5)}); ry+=h });
  y=boxY+boxH+9;

  /* Consignes générales */
  const rules=["Faites le nombre de séances indiqué chaque semaine, réparties dans la semaine plutôt que regroupées.",
    "Une douleur légère, jusqu'à 3/10, est acceptable si elle disparaît dans les 24 heures.",
    "Arrêtez et contactez votre entraîneur(e) si la douleur dépasse 5/10, augmente d'une séance à l'autre ou s'accompagne d'enflure.",
    "Respirez normalement pendant l'effort, sans bloquer votre respiration."];
  set(12,"bold"); doc.text("Consignes générales",M,y); y+=6;
  set(9.5,"normal",ink);
  rules.forEach(r=>{const l=doc.splitTextToSize(pdfTxt(r),CW-6); doc.setFillColor(...acc); doc.circle(M+1.2,y-1.1,.8,"F"); doc.text(l,M+5,y); y+=l.length*4.4+1.2});
  if(opt.notes&&c.notes){
    y+=2; set(9.5,"normal"); const l=doc.splitTextToSize(pdfTxt(c.notes),CW-12), h=l.length*4.4+12;
    ensure(h); doc.setFillColor(...warnSoft); doc.roundedRect(M,y,CW,h,2,2,"F");
    label("Précautions particulières",M+6,y+6); set(9.5,"normal"); doc.text(l,M+6,y+11.5); y+=h+2;
  }
  y+=6;

  /* Exercices */
  set(12,"bold"); ensure(50); doc.text(`Vos exercices (${prog.ex.length})`,M,y); y+=4;
  doc.setDrawColor(...line); doc.setLineWidth(.3); doc.line(M,y,PW-M,y); y+=6;
  const imgs=await Promise.all(prog.ex.map(e=>figPNG(e.id).catch(()=>null)));
  const IW=46, IH=36.8, TX=M+IW+7, TW=CW-IW-7;
  prog.ex.forEach((e,i)=>{
    const x=exView(prog,e.id);
    set(12,"bold"); const title=doc.splitTextToSize(pdfTxt(x.n),TW);
    set(9,"bold"); const dp=doseParts(e), dose=dp.length?doc.splitTextToSize(pdfTxt(dp.join("   ·   ")),TW):[];
    set(9.3,"normal"); const steps=opt.steps?x.steps.map(s=>doc.splitTextToSize(pdfTxt(s),TW-6)):[];
    const cue=x.cue?doc.splitTextToSize(pdfTxt((opt.steps?"Conseil : ":"")+x.cue),TW):[];
    const note=e.note?doc.splitTextToSize(pdfTxt(e.note),TW-8):null;
    let th=title.length*5+1.5+(dose.length?dose.length*4.2+3:0)+steps.reduce((a,l)=>a+l.length*4.1+1.3,0)+cue.length*4.1+1;
    if(note) th+=note.length*4.1+11;
    const h=Math.max(IH,th)+8;
    ensure(h);
    const top=y;
    if(imgs[i]) doc.addImage(imgs[i],"PNG",M,top,IW,IH,undefined,"FAST");
    else { doc.setFillColor(...soft); doc.roundedRect(M,top,IW,IH,2,2,"F"); }
    doc.setFillColor(...acc); doc.circle(M+5,top+5,3.6,"F"); set(9,"bold",[255,255,255]); doc.text(String(i+1),M+5,top+6.2,{align:"center"});
    set(7,"normal",muted); doc.text(pdfTxt(mgTxt(x)+" · "+x.eq),M,top+IH+4);
    let ty=top+4.2;
    set(12,"bold"); doc.text(title,TX,ty); ty+=title.length*5+1.5;
    if(dose.length){ set(9,"bold",acc); doc.text(dose,TX,ty); ty+=dose.length*4.2+3; }
    if(opt.steps){ set(9.3,"normal"); steps.forEach((l,k)=>{set(8,"bold",acc);doc.text(String(k+1)+".",TX,ty);set(9.3,"normal");doc.text(l,TX+6,ty);ty+=l.length*4.1+1.3}); }
    if(cue.length){ set(9.3,opt.steps?"italic":"normal",opt.steps?muted:ink); doc.text(cue,TX,ty); ty+=cue.length*4.1+1; }
    if(note){ const nh=note.length*4.1+9; doc.setFillColor(...warnSoft); doc.roundedRect(TX,ty,TW,nh,1.6,1.6,"F");
      doc.setFillColor(...warn); doc.rect(TX,ty,1,nh,"F");
      set(7,"bold",warn); doc.text("CONSIGNE DE VOTRE ENTRAÎNEUR(E)",TX+4,ty+4.6,{charSpace:.3}); set(9.3,"normal"); doc.text(note,TX+4,ty+9); }
    y=top+h;
    if(i<prog.ex.length-1){ doc.setDrawColor(...line); doc.line(M,y-3,PW-M,y-3); y+=3; }
  });

  /* Journal de suivi */
  if(opt.journal){
    y+=6; const rows=4, rh=13, hh=8, need=24+hh+rows*rh+14;
    ensure(need);
    set(12,"bold"); doc.text("Journal de suivi",M,y); y+=5.5;
    set(9.3,"normal",muted); doc.text(doc.splitTextToSize("Cochez chaque séance faite, inscrivez la date et notez votre douleur pendant l'exercice, de 0 (aucune) à 10 (pire imaginable). Apportez ce journal à votre prochain rendez-vous.",CW),M,y); y+=11;
    const n=fMax(prog), firstW=26, dw=(CW-firstW)/n;
    doc.setFillColor(...acc); doc.roundedRect(M,y,CW,hh,1.5,1.5,"F");
    set(8,"bold",[255,255,255]); doc.text("SEMAINE",M+4,y+5.3,{charSpace:.3});
    for(let i=0;i<n;i++) doc.text(`SÉANCE ${i+1}`,M+firstW+dw*i+dw/2,y+5.3,{align:"center",charSpace:.3});
    y+=hh;
    for(let r=0;r<rows;r++){
      const ry=y+r*rh;
      set(9,"bold"); doc.text(`Semaine ${r+1}`,M+4,ry+7.8);
      for(let i=0;i<n;i++){
        const cx=M+firstW+dw*i;
        doc.setDrawColor(...muted); doc.setLineWidth(.35); doc.rect(cx+3,ry+3,3.6,3.6);
        set(7.5,"normal",muted);
        if(dw>=30){ doc.text("Date : ______",cx+9,ry+5.9); doc.text("Douleur : ___ /10",cx+dw-3,ry+rh-2.6,{align:"right"}); }
        else doc.text("___ /10",cx+dw-3,ry+rh-2.6,{align:"right"});
      }
      doc.setDrawColor(...line); doc.setLineWidth(.3); doc.line(M,ry+rh,PW-M,ry+rh);
    }
    for(let i=0;i<=n;i++){ const cx=M+firstW+dw*i; doc.line(cx,y,cx,y+rows*rh); }
    y+=rows*rh+5;
    set(8,"normal",muted); doc.text(`Objectif : ${fLabel(prog)} séance${n>1?"s":""} par semaine, aux jours qui vous conviennent.`,M,y);
  }

  /* Pied de page */
  const n=doc.getNumberOfPages();
  for(let p=1;p<=n;p++){ doc.setPage(p);
    doc.setDrawColor(...line); doc.setLineWidth(.3); doc.line(M,PH-13,PW-M,PH-13);
    set(7.5,"normal",muted);
    doc.text(pdfTxt(`Programme de ${c.n} · ${settings.clinic||"Kinoza"}${settings.contact?" · "+settings.contact:""}`),M,PH-8.5);
    doc.text(`Page ${p} / ${n}`,PW-M,PH-8.5,{align:"right"});
  }
  doc.setProperties({title:`Programme d'exercices - ${c.n}`,author:settings.kin||"",subject:prog.name,creator:"Kinoza"});
  return doc.output("blob");
}

function openExport(id,pid){
  const c=C(id), prog=c.progs.find(p=>p.id===pid)||AP(c), st=S.settings||{}, sh=$("#sheet");
  sh.innerHTML=`<form class="sheet-card form-card" id="export-form" role="dialog" aria-modal="true" aria-labelledby="ex-t" novalidate>
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
      <div style="display:flex;flex-direction:column;gap:4px"><span class="eyebrow">Exporter en PDF</span><h2 id="ex-t" style="font-size:1.4rem">${esc(prog.name)}</h2>
        <span class="muted" style="font-size:.88rem">${esc(c.n)} · ${prog.ex.length} exercice${prog.ex.length>1?"s":""} · format lettre</span></div>
      <button type="button" class="icon-btn" data-close aria-label="Fermer">${I.x}</button></div>
    <input type="hidden" id="ex-id" value="${c.id}"><input type="hidden" id="ex-pid" value="${prog.id}">
    <div class="form-grid">
      <div class="field"><label for="ex-clinic">Nom de l'entreprise ou de la clinique</label><input class="inp" id="ex-clinic" value="${esc(st.clinic)}" placeholder="Ex. Studio Mouvement"></div>
      <div class="field"><label for="ex-kin">Entraîneur(e)</label><input class="inp" id="ex-kin" value="${esc(st.kin)}" placeholder="Prénom Nom"></div>
      <div class="field span2"><label for="ex-contact">Coordonnées affichées sur le document</label><input class="inp" id="ex-contact" value="${esc(st.contact)}" placeholder="Ex. 418 555-0123 · info@monentreprise.ca"></div>
    </div>
    <fieldset class="opts"><legend class="eyebrow">Contenu</legend>
      <label><input type="checkbox" id="ex-steps" ${st.steps===false?"":"checked"}> Étapes d'exécution détaillées pour chaque exercice</label>
      <label><input type="checkbox" id="ex-journal" ${st.journal===false?"":"checked"}> Journal de suivi sur 4 semaines (cases à cocher, date et douleur)</label>
      <label><input type="checkbox" id="ex-notes" ${c.notes?"":"disabled"}> Notes cliniques et précautions du dossier${c.notes?"":` <span class="muted">(aucune note)</span>`}</label>
    </fieldset>
    <p class="muted" style="font-size:.82rem">Le nom de l'entreprise, le nom de l'entraîneur(e) et les coordonnées sont conservés pour les prochains exports.</p>
    <p class="err" id="ex-err" ${prog.ex.length?"hidden":""}>${prog.ex.length?"":"Ajoutez au moins un exercice au programme avant d'exporter."}</p>
    <div class="form-actions">
      <button type="button" class="btn" data-close>Annuler</button>
      <button type="submit" class="btn primary" id="ex-go" ${prog.ex.length?"":"disabled"}>${I.pdf} Télécharger le PDF</button></div>
  </form>`;
  sh.hidden=false; document.body.style.overflow="hidden";
  $("#ex-go").disabled||$("#ex-go").focus();
}
async function submitExport(){
  const c=C($("#ex-id").value), prog=c.progs.find(p=>p.id===$("#ex-pid").value), go=$("#ex-go"), err=$("#ex-err");
  const v=k=>$("#ex-"+k).value.trim();
  S.settings={clinic:v("clinic"),kin:v("kin"),contact:v("contact"),steps:$("#ex-steps").checked,journal:$("#ex-journal").checked}; save();
  const opt={steps:$("#ex-steps").checked,journal:$("#ex-journal").checked,notes:$("#ex-notes").checked};
  const showErr=m=>{err.textContent=m;err.hidden=false};
  err.hidden=true; go.disabled=true; const label=go.innerHTML; go.textContent="Création du PDF…";
  try{
    const blob=await buildPDF(c,prog,opt);
    const name=`${prog.name} - ${c.n} - ${TODAY}.pdf`.replace(/[\\/:*?"<>|]/g,"");
    try{ await saveFile(name,blob); closeSheet(); toast("PDF enregistré"); }
    catch(e){
      if(e?.code==="declined"){ toast("Téléchargement annulé"); }
      else if(e?.code==="rate_limited"){ showErr("Une autre demande de téléchargement est déjà ouverte. Réessayez dans un instant."); }
      else showErr("Le téléchargement n'a pas pu se faire dans cet affichage. Ouvrez la page dans claude.ai et réessayez.");
    }
  }catch(e){
    showErr("La création du PDF a échoué. Vérifiez votre connexion Internet, puis réessayez.");
  }finally{ if(document.body.contains(go)){go.disabled=false;go.innerHTML=label} }
}
