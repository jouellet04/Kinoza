/* Kinoza · sécurité : mot de passe, chiffrement local, verrouillage automatique et empreintes d'intégrité */

/* ---------- Coffre chiffré ----------
   Les données (S) sont chiffrées en AES-GCM 256 avec une clé de données aléatoire.
   Cette clé est elle-même chiffrée deux fois : par le mot de passe et par la clé de secours (PBKDF2-SHA-256).
   La clé de données ne vit qu'en mémoire, pendant que l'application est déverrouillée. */
const VAULT_KEY = "kinoza-vault";
const PW_ITER = 600000, REC_ITER = 150000, MIN_PW = 10;
const te = new TextEncoder(), td = new TextDecoder();
function b64(buf){ const u=new Uint8Array(buf); let s=""; for(let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return btoa(s) }
const unb64 = s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const rand = n=>crypto.getRandomValues(new Uint8Array(n));
async function kek(secret,salt,iter){
  const base=await crypto.subtle.importKey("raw",te.encode(secret),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:iter,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function enc(key,bytes){ const iv=rand(12); return {iv:b64(iv),ct:b64(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,bytes))} }
async function dec(key,o){ return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(o.iv)},key,unb64(o.ct))) }
const importDK = raw=>crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["encrypt","decrypt"]);

let DK=null, DKRAW=null, VAULT=null;
function readVault(){ try{ return JSON.parse(localStorage.getItem(VAULT_KEY)||"null") }catch(e){ return null } }
function writeVault(){
  try{ localStorage.setItem(VAULT_KEY,JSON.stringify(VAULT)); return true }
  catch(e){ toast("L'enregistrement a échoué : l'espace de stockage du navigateur est peut-être plein."); return false }
}

/* Clé de secours : 24 caractères sans 0/O ni 1/I, en groupes de 4 */
const REC_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newRecoveryCode = ()=>[...rand(24)].map(b=>REC_ABC[b%32]).join("").match(/.{4}/g).join("-");
const normCode = s=>String(s).toUpperCase().replace(/[^A-Z0-9]/g,"");

async function createVault(pw,data){
  const raw=rand(32), salt=rand(16), rsalt=rand(16), code=newRecoveryCode();
  const k=await kek(pw,salt,PW_ITER), rk=await kek(normCode(code),rsalt,REC_ITER);
  VAULT={v:1,created:new Date().toISOString(),kdf:{salt:b64(salt),iter:PW_ITER},wrapPw:await enc(k,raw),
    rec:{salt:b64(rsalt),iter:REC_ITER,...(await enc(rk,raw))},data:null};
  DKRAW=raw; DK=await importDK(raw);
  VAULT.data=await enc(DK,te.encode(JSON.stringify(data)));
  if(!writeVault()) throw new Error("write");
  return code;
}
async function openVault(secret,kind){
  const v=readVault();
  const isPw=kind==="pw", w=isPw?v.wrapPw:v.rec;
  const k=await kek(isPw?secret:normCode(secret),unb64(isPw?v.kdf.salt:v.rec.salt),isPw?v.kdf.iter:v.rec.iter);
  const raw=await dec(k,w);            // lève une erreur si le secret est faux
  VAULT=v; DKRAW=raw; DK=await importDK(raw);
  return JSON.parse(td.decode(await dec(DK,v.data)));
}
async function rewrapPassword(pw){
  const salt=rand(16), k=await kek(pw,salt,PW_ITER);
  VAULT.kdf={salt:b64(salt),iter:PW_ITER}; VAULT.wrapPw=await enc(k,DKRAW); return writeVault();
}
async function rewrapRecovery(){
  const code=newRecoveryCode(), rsalt=rand(16), rk=await kek(normCode(code),rsalt,REC_ITER);
  VAULT.rec={salt:b64(rsalt),iter:REC_ITER,...(await enc(rk,DKRAW))}; writeVault(); return code;
}
async function checkPassword(pw){
  try{ await dec(await kek(pw,unb64(VAULT.kdf.salt),VAULT.kdf.iter),VAULT.wrapPw); return true }catch(e){ return false }
}

/* Enregistrement chiffré : regroupe les sauvegardes rapprochées, la plus récente gagne */
let saveSeq=0, saveTimer=null;
function persist(){
  if(!DK) return;
  clearTimeout(saveTimer); const seq=++saveSeq;
  saveTimer=setTimeout(async()=>{
    const blob=await enc(DK,te.encode(JSON.stringify(S)));
    if(seq!==saveSeq||!DK) return;
    VAULT.data=blob; writeVault();
  },0);
}
async function flush(){
  if(!DK) return;
  clearTimeout(saveTimer); saveSeq++;
  VAULT.data=await enc(DK,te.encode(JSON.stringify(S))); writeVault();
}
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden") flush() });

/* Chiffrement d'un fichier de sauvegarde avec un mot de passe propre au fichier */
async function encryptBackup(payload,pw){
  const salt=rand(16), k=await kek(pw,salt,PW_ITER);
  return {app:"Kinoza",format:2,exported:payload.exported,enc:{salt:b64(salt),iter:PW_ITER},...(await enc(k,te.encode(JSON.stringify(payload))))};
}
async function decryptBackup(file,pw){
  const k=await kek(pw,unb64(file.enc.salt),file.enc.iter);
  return JSON.parse(td.decode(await dec(k,file)));
}

/* ---------- Écran de verrouillage ---------- */
let lockState={mode:"unlock"};
function showLock(mode,extra={}){
  lockState={mode,...extra};
  const app=$(".app"); app.inert=true; app.setAttribute("aria-hidden","true");
  const L=$("#lock"); L.hidden=false; L.innerHTML=lockHTML();
  L.querySelector("input,button.primary")?.focus();
}
function hideLock(){ const L=$("#lock"); L.hidden=true; L.innerHTML=""; const app=$(".app"); app.inert=false; app.removeAttribute("aria-hidden") }
const lockLogo = `<div class="brand" style="padding:0"><div class="brand-mark"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent-ink)" stroke-width="2.4" stroke-linecap="round"><path d="M4 12h3l2-5 4 10 2-5h5"/></svg></div><div class="brand-name">Kinoza</div></div>`;
const pwRules = `<span class="muted" style="font-size:.8rem">Au moins ${MIN_PW} caractères. Une phrase de passe facile à retenir fonctionne bien, par exemple « tulipe-vélo-montagne-2026 ».</span>`;
function lockHTML(){
  const s=lockState, err=`<p class="err" id="lk-err" ${s.err?"":"hidden"}>${esc(s.err||"")}</p>`;
  if(s.mode==="setup") return `<form class="lock-card" id="lk-form" data-mode="setup" novalidate>${lockLogo}
    <h1>Protégez vos dossiers</h1>
    <p class="muted">Choisissez un mot de passe. Il sera demandé à chaque ouverture et après une période d'inactivité. Vos dossiers seront chiffrés dans ce navigateur : sans le mot de passe, ils sont illisibles.${s.legacy?.clients.length?(s.legacy.clients.length>1?` Vos <b>${s.legacy.clients.length}</b> dossiers existants seront chiffrés aussi.`:" Votre dossier existant sera chiffré aussi."):""}</p>
    <div class="field"><label for="lk-pw">Mot de passe</label><input class="inp" id="lk-pw" type="password" autocomplete="new-password">${pwRules}</div>
    <div class="field"><label for="lk-pw2">Confirmez le mot de passe</label><input class="inp" id="lk-pw2" type="password" autocomplete="new-password"></div>
    ${err}<button class="btn primary" type="submit" id="lk-go">Créer le mot de passe</button></form>`;
  if(s.mode==="code") return `<div class="lock-card">${lockLogo}
    <h1>Votre clé de secours</h1>
    <p class="muted">Si vous oubliez votre mot de passe, cette clé est <b>le seul moyen</b> de récupérer vos dossiers. Notez-la sur papier et rangez-la dans un endroit sûr. Elle ne sera plus jamais affichée.</p>
    <div class="code-box num" id="lk-code">${esc(s.code)}</div>
    <button class="btn" type="button" id="lk-copy" style="align-self:flex-start">Copier la clé</button>
    <label class="check-line"><input type="checkbox" id="lk-ok"> J'ai noté ma clé de secours dans un endroit sûr.</label>
    <button class="btn primary" type="button" id="lk-continue" disabled>Continuer</button></div>`;
  if(s.mode==="recover") return `<form class="lock-card" id="lk-form" data-mode="recover" novalidate>${lockLogo}
    <h1>Utiliser la clé de secours</h1>
    <p class="muted">Entrez la clé de 24 caractères notée à la création du mot de passe, puis choisissez un nouveau mot de passe.</p>
    <div class="field"><label for="lk-code-in">Clé de secours</label><input class="inp num" id="lk-code-in" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"></div>
    <div class="field"><label for="lk-pw">Nouveau mot de passe</label><input class="inp" id="lk-pw" type="password" autocomplete="new-password">${pwRules}</div>
    <div class="field"><label for="lk-pw2">Confirmez le nouveau mot de passe</label><input class="inp" id="lk-pw2" type="password" autocomplete="new-password"></div>
    ${err}<button class="btn primary" type="submit" id="lk-go">Récupérer mes dossiers</button>
    <button class="link" type="button" id="lk-back" style="align-self:flex-start">← Revenir au mot de passe</button></form>`;
  return `<form class="lock-card" id="lk-form" data-mode="unlock" novalidate>${lockLogo}
    <h1>Kinoza est verrouillé</h1>
    ${s.info?`<p class="muted">${esc(s.info)}</p>`:`<p class="muted">Entrez votre mot de passe pour ouvrir vos dossiers.</p>`}
    <div class="field"><label for="lk-pw">Mot de passe</label><input class="inp" id="lk-pw" type="password" autocomplete="current-password"></div>
    ${err}<button class="btn primary" type="submit" id="lk-go">Déverrouiller</button>
    <button class="link" type="button" id="lk-forgot" style="align-self:flex-start">Mot de passe oublié ? Utiliser la clé de secours</button></form>`;
}
function lockErr(m){ const e=$("#lk-err"); e.textContent=m; e.hidden=false; const b=$("#lk-go"); if(b){b.disabled=false;b.textContent=b.dataset.label||b.textContent} }
function pwProblem(pw,pw2){
  if(pw.length<MIN_PW) return `Le mot de passe doit contenir au moins ${MIN_PW} caractères.`;
  if(pw!==pw2) return "Les deux mots de passe ne sont pas identiques.";
  return "";
}
function busy(label){ const b=$("#lk-go"); b.dataset.label=b.textContent; b.disabled=true; b.textContent=label }
async function submitLock(form){
  const mode=form.dataset.mode, pw=$("#lk-pw")?.value||"", pw2=$("#lk-pw2")?.value||"";
  if(mode==="unlock"){
    if(!pw) return lockErr("Entrez votre mot de passe.");
    busy("Déverrouillage…");
    try{ onUnlocked(await openVault(pw,"pw")) }catch(e){ lockErr("Mot de passe incorrect. Vérifiez les majuscules et réessayez.") }
  } else if(mode==="setup"){
    const p=pwProblem(pw,pw2); if(p) return lockErr(p);
    busy("Chiffrement…");
    const data=lockState.legacy||seed();
    try{
      const code=await createVault(pw,data);
      try{ localStorage.removeItem(KEY) }catch(e){}
      showLock("code",{code,data});
    }catch(e){ lockErr("Le chiffrement n'a pas pu se faire. Vérifiez l'espace disponible dans le navigateur et réessayez.") }
  } else if(mode==="recover"){
    const code=$("#lk-code-in").value;
    if(normCode(code).length!==24) return lockErr("La clé de secours contient 24 caractères.");
    const p=pwProblem(pw,pw2); if(p) return lockErr(p);
    busy("Récupération…");
    let data;
    try{ data=await openVault(code,"rec") }catch(e){ return lockErr("Cette clé de secours ne correspond pas. Vérifiez chaque caractère.") }
    await rewrapPassword(pw);
    const fresh=await rewrapRecovery();
    showLock("code",{code:fresh,data,info:"Mot de passe changé"});
  }
}
function onUnlocked(data){
  S=migrate(data); applyExEdits(); hideLock(); render(); armIdle();
}
async function lockNow(auto){
  if(!DK) return;
  await flush();
  DK=null; DKRAW=null; S=seed(); closeSheet(); if(typeof closePreview==="function") closePreview(); pendingImport=null;
  $("#main").innerHTML=""; $("#nav").innerHTML="";
  const m=lockMin();
  showLock("unlock",auto?{info:`Verrouillé automatiquement après ${m} minute${m>1?"s":""} sans activité. Entrez votre mot de passe pour continuer.`}:{});
}
document.addEventListener("submit",ev=>{ if(ev.target.id==="lk-form"){ ev.preventDefault(); ev.stopImmediatePropagation(); submitLock(ev.target) } },true);
document.addEventListener("click",ev=>{
  const b=ev.target.closest("button"); if(!b||!b.closest("#lock")) return;
  if(b.id==="lk-forgot") showLock("recover");
  else if(b.id==="lk-back") showLock("unlock");
  else if(b.id==="lk-copy"){
    const t=lockState.code;
    navigator.clipboard?.writeText(t).then(()=>{b.textContent="Clé copiée"}).catch(()=>{const r=document.createRange();r.selectNodeContents($("#lk-code"));const s=getSelection();s.removeAllRanges();s.addRange(r);b.textContent="Sélectionnée : copiez-la avec Ctrl+C"});
  }
  else if(b.id==="lk-continue"){ const d=lockState.data; onUnlocked(d); if(lockState.info) toast(lockState.info) }
},true);
document.addEventListener("change",ev=>{ if(ev.target.id==="lk-ok") $("#lk-continue").disabled=!ev.target.checked },true);

/* Verrouillage automatique après inactivité */
const lockMin = ()=>(S.settings&&+S.settings.lockMin)||15;
let idleT=null, lastArm=0;
function armIdle(){ clearTimeout(idleT); if(!DK) return; lastArm=Date.now(); idleT=setTimeout(()=>lockNow(true),lockMin()*60000) }
["pointerdown","keydown","wheel","touchstart","mousemove"].forEach(t=>document.addEventListener(t,()=>{ if(DK&&Date.now()-lastArm>3000) armIdle() },{passive:true}));

function bootSecurity(){
  if(!window.crypto?.subtle){ $("#lock").hidden=false; $("#lock").innerHTML=`<div class="lock-card">${lockLogo}<h1>Navigateur non compatible</h1><p class="muted">Le chiffrement n'est pas disponible ici. Ouvrez Kinoza dans un navigateur à jour (Firefox, Chrome, Edge ou Safari).</p></div>`; return }
  if(readVault()) showLock("unlock");
  else { const legacy=loadLegacy(); showLock("setup",{legacy:legacy?migrate(legacy):null}) }
}

/* ---------- Empreintes d'intégrité (SHA-256) ---------- */
function canon(v){
  if(Array.isArray(v)) return "["+v.map(canon).join(",")+"]";
  if(v&&typeof v==="object") return "{"+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+":"+canon(v[k])).join(",")+"}";
  return JSON.stringify(v===undefined?null:v);
}
async function sha(s){ const h=await crypto.subtle.digest("SHA-256",te.encode(s)); return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("") }
const progContent = p=>({id:p.id,name:p.name,dx:p.dx??"",phase:p.phase??"",freq:p.freq,freqMax:p.freqMax??null,created:p.created??null,ex:p.ex,snap:p.snap??null,at:p.locked?.at??null});
const clientContent = c=>({id:c.id,n:c.n,email:c.email||undefined,birth:c.birth??null,age:c.age??null,start:c.start??null,notes:c.notes??"",log:c.log,
  progs:c.progs.map(p=>({id:p.id,h:p.locked?.hash??null})),at:c.locked?.at??null});

/* Journal du dossier : chaque entrée est chaînée à la précédente */
let auditQueue=Promise.resolve();
function logAudit(c,a,ref){
  c.audit=c.audit||[];
  const e={at:new Date().toISOString(),a,ref:ref??null,h:null}; c.audit.push(e);
  auditQueue=auditQueue.then(async()=>{
    const i=c.audit.indexOf(e), prev=i>0?c.audit[i-1].h:"";
    e.h=await sha([prev,e.at,e.a,e.ref??""].join("|")); save();
  });
  return auditQueue;
}
async function addAddendum(c,text){
  c.addenda=c.addenda||[];
  const prev=c.addenda.length?c.addenda[c.addenda.length-1].h:"";
  const e={at:new Date().toISOString(),text}; e.h=await sha([prev,e.at,e.text].join("|"));
  c.addenda.push(e); await logAudit(c,"Note d'ajout"); save();
}
async function lockProg(c,p){
  if(p.locked) return;
  p.snap=Object.fromEntries(p.ex.map(e=>[e.id,{n:EX[e.id].n,steps:[...EX[e.id].steps],cue:EX[e.id].cue}]));
  p.locked={at:new Date().toISOString(),hash:null};
  p.locked.hash=await sha(canon(progContent(p)));
  await logAudit(c,`Programme verrouillé : ${p.name}`,p.id); save();
}
async function lockClient(c){
  for(const p of c.progs) await lockProg(c,p);
  c.locked={at:new Date().toISOString(),hash:null};
  c.locked.hash=await sha(canon(clientContent(c)));
  await logAudit(c,"Dossier fermé et verrouillé"); save();
}
async function verifyClient(c){
  const problems=[];
  for(const p of c.progs) if(p.locked && await sha(canon(progContent(p)))!==p.locked.hash) problems.push(`Le programme « ${p.name} » a été modifié après son verrouillage.`);
  if(c.locked && await sha(canon(clientContent(c)))!==c.locked.hash) problems.push("Le dossier a été modifié après sa fermeture.");
  let prev="";
  for(const e of c.addenda||[]){ if(await sha([prev,e.at,e.text].join("|"))!==e.h){ problems.push("Une note d'ajout a été modifiée ou supprimée."); break } prev=e.h }
  prev="";
  for(const e of c.audit||[]){ if(e.h===null) break; if(await sha([prev,e.at,e.a,e.ref??""].join("|"))!==e.h){ problems.push("L'historique du dossier a été modifié."); break } prev=e.h }
  if(typeof chainOk==="function"){
    if(!await chainOk(c.consents,CONSENT_FIELDS)) problems.push("L'historique des consentements a été modifié.");
    if(!await chainOk(c.rectifs,RECT_KEYS)) problems.push("L'historique des rectifications a été modifié.");
  }
  for(const e of c.audit||[]) if(e.ref&&/^Programme verrouillé/.test(e.a)&&!c.progs.some(p=>p.id===e.ref&&p.locked)) problems.push("Un programme verrouillé a été retiré du dossier.");
  return {ok:!problems.length,problems:[...new Set(problems)]};
}
