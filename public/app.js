let me=null, waves=[], users=[], analytics=[];
const MIXES="ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
async function api(url,options={}){const res=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json"},...options});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||"שגיאה");return data;}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function isWorker(u){const r=String(u.role||"").trim().toLowerCase();const label=String(u.role_label||"").trim();return r==="worker"||r==="עובד"||label==="עובד";}
function isActive(u){const a=u.active;return a===true||a===1||a==="1"||a==="true"||a==="כן"||a==="פעיל";}
function formatIL(dt){if(!dt)return"";try{return new Date(dt).toLocaleString("he-IL",{timeZone:"Asia/Jerusalem"});}catch(e){return dt;}}
function shortDate(dt){if(!dt)return"";try{return new Date(dt).toLocaleDateString("he-IL",{timeZone:"Asia/Jerusalem"});}catch(e){return dt;}}
function table(headers,rows,classes=[]){if(!rows.length)return`<div class="panel">אין נתונים להצגה</div>`;return`<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>`+rows.map((r,i)=>`<tr class="${classes[i]||""}">${r.map(c=>`<td>${c??""}</td>`).join("")}</tr>`).join("")+`</tbody></table>`;}
function showPage(id){document.querySelectorAll(".page").forEach(p=>p.classList.toggle("show",p.id===id));if(id==="importsPage")loadImports();if(id==="dashboardPage")renderDashboard();}
async function boot(){const res=await api("/api/me").catch(()=>({user:null}));me=res.user;loginScreen.classList.toggle("hidden",!!me);appScreen.classList.toggle("hidden",!me);if(!me)return;meBox.innerHTML=`מחובר: <b>${esc(me.username)}</b><br>${me.role==="admin"?"מנהל":"עובד"}`;document.querySelectorAll(".admin-only").forEach(x=>x.style.display=me.role==="admin"?"block":"none");document.querySelectorAll(".worker-only").forEach(x=>x.style.display=me.role==="worker"?"block":"none");await refresh();showPage(me.role==="admin"?"dashboardPage":"workerPage");}
async function login(){try{await api("/api/login",{method:"POST",body:JSON.stringify({username:loginUsername.value,code:loginCode.value})});await boot();}catch(e){alert(e.message);}}
async function logout(){await api("/api/logout",{method:"POST"});location.reload();}
async function refresh(){waves=await api("/api/waves");if(me.role==="admin"){users=await api("/api/users");analytics=await api("/api/analytics");renderUsers();renderAssign();renderStatus();renderAnalytics();renderDashboard();}else renderWorkerPage();}
function counts(w){const c={open:0,picked:0,alt_mix:0,not_found:0,total:0,done:0};(w.items||[]).forEach(i=>{c[i.status]=(c[i.status]||0)+Number(i.qty||1);c.total+=Number(i.qty||1);if(i.status!=="open")c.done+=Number(i.qty||1);});return c;}
function statusLabel(s){return{open:"פתוח",assigned:"משויך",active:"פעיל",completed:"הושלם",pallet_full:"משטח מלא",picked:"לוקט",alt_mix:"לוקט מיקס אחר",not_found:"לא נמצא"}[s]||s;}
function percentForWave(w){const c=counts(w);return c.total?Math.round((c.done/c.total)*100):0;}
function progress(p){return`<div class="progress"><div style="width:${p}%"></div></div>${p}%`;}
function renderWorkerPage(){if(!document.getElementById("workerWaveSelect"))return;const selectedId=workerWaveSelect.value;workerWaveSelect.innerHTML=waves.map(w=>`<option value="${esc(w.id)}">${esc(w.wave_no)} | ${esc(w.source_label)} | ${esc(w.store)}</option>`).join("")||"<option value='__none__'>אין גלי ליקוט</option>";const w=waves.find(x=>x.id===selectedId)||waves[0];if(!w){workerCards.innerHTML="";workerActions.innerHTML="";workerItems.innerHTML=`<div class="panel">אין גלים משויכים כרגע.</div>`;nextWave.innerHTML="";return;}workerWaveSelect.value=w.id;const idx=waves.findIndex(x=>x.id===w.id),next=waves[idx+1];nextWave.innerHTML=next?`הגל הבא: <b>${esc(next.source_label)}</b> | <b>${esc(next.store)}</b> | ${next.items.length} שורות`:"אין גל הבא כרגע";const c=counts(w);workerCards.innerHTML=`<div class="card"><b>${esc(w.wave_no)}</b><span>גל</span></div><div class="card"><b>${esc(w.source_label)}</b><span>סוג גל</span></div><div class="card"><b>${esc(w.store)}</b><span>חנות</span></div><div class="card"><b>${c.total}</b><span>יחידות</span></div><div class="card"><b>${c.done}</b><span>טופלו</span></div><div class="card"><b>${c.total-c.done}</b><span>נשאר</span></div>`;workerActions.innerHTML=`<div class="panel actions"><button class="orange" onclick="palletFull('${w.id}')">משטח מלא</button><button class="green" onclick="completeWave('${w.id}')">ליקוט הושלם - סגור משטח</button></div>`;workerItems.innerHTML=table(["מיקום","דגם","מיקס / מידה","כמות","סטטוס","פעולות"],(w.items||[]).map(i=>[esc(i.location||"ללא מיקום"),esc(i.model),esc(i.mix||"A"),esc(i.qty||1),`${statusLabel(i.status)}<br><span class="small">${esc(formatIL(i.picked_at)||"")}</span>`,`<div class="actions"><button class="green" onclick="setItemStatus('${i.id}','picked')">לוקט</button><select id="mix_${i.id}" style="width:80px">${MIXES.map(m=>`<option>${m}</option>`).join("")}</select><button class="orange" onclick="setItemStatus('${i.id}','alt_mix',document.getElementById('mix_${i.id}').value)">לוקט מיקס אחר</button><button class="red" onclick="setItemStatus('${i.id}','not_found')">לא נמצא</button><button class="gray" onclick="setItemStatus('${i.id}','open')">בטל סימון</button></div>`]),(w.items||[]).map(i=>i.status));}
async function setItemStatus(itemId,status,actualMix=""){await api("/api/item/status",{method:"POST",body:JSON.stringify({itemId,status,actualMix})});await refresh();}
async function completeWave(waveId){const res=await api("/api/wave/complete",{method:"POST",body:JSON.stringify({waveId})});alert(res.message||"ליקוט הושלם - סגור משטח");await refresh();}
async function palletFull(waveId){const res=await api("/api/wave/pallet-full",{method:"POST",body:JSON.stringify({waveId})});alert("נוצר גל המשך: "+res.newWaveNo);await refresh();}
async function uploadPicking(){const files=[...pickingFiles.files];if(!files.length)return alert("בחר קבצים");const fd=new FormData();files.forEach(f=>fd.append("files",f));const res=await fetch("/api/upload/picking",{method:"POST",body:fd,credentials:"same-origin"});const data=await res.json().catch(()=>({}));if(!res.ok)return alert(data.error||"שגיאה");uploadResult.innerHTML=`<div class="panel">נטענו ${data.added} שורות. נוצרו ${data.created} גלים חדשים. אוחדו ${data.merged} גלים פתוחים מאותו סוג קובץ.<br>${(data.files||[]).map(f=>`${f.filename}: ${f.label} / ${f.rows} שורות ${f.error||""}`).join("<br>")}</div>`;await refresh();await loadImports();}
async function uploadLocations(kind){const input=kind==="daily"?dailyLocations:melangeLocations;if(!input.files[0])return alert("בחר קובץ מיקומים");const fd=new FormData();fd.append("file",input.files[0]);const res=await fetch(`/api/upload/locations/${kind}`,{method:"POST",body:fd,credentials:"same-origin"});const data=await res.json().catch(()=>({}));if(!res.ok)return alert(data.error||"שגיאה");alert(`עודכנו ${data.count} מיקומים`);await refresh();}
async function createUser(){try{await api("/api/users",{method:"POST",body:JSON.stringify({username:newUsername.value,code:newCode.value,role:newRole.value})});newUsername.value="";newCode.value="";await refresh();}catch(e){alert(e.message);}}
async function toggleUser(id,active){await api(`/api/users/${id}`,{method:"PATCH",body:JSON.stringify({active:!active})});await refresh();}
async function editUser(id,currentName,currentCode,currentRole){const username=prompt("שם משתמש:",currentName);if(!username)return;const code=prompt("קוד כניסה:",currentCode||"");if(!code)return;const role=prompt("הרשאה: worker או admin",currentRole||"worker")||currentRole;await api(`/api/users/${id}`,{method:"PATCH",body:JSON.stringify({username,code,role})});await refresh();}
async function deleteUser(id,name){if(!confirm(`למחוק את היוזר ${name}? גלים שמשויכים אליו יחזרו ללא שיוך.`))return;const res=await fetch(`/api/users/${id}`,{method:"DELETE",credentials:"same-origin"});const data=await res.json().catch(()=>({}));if(!res.ok)return alert(data.error||"שגיאה במחיקת יוזר");await refresh();}
function renderUsers(){usersTable.innerHTML=table(["שם משתמש","קוד","הרשאה","פעיל","פעולה"],users.map(u=>[esc(u.username),esc(u.code_plain),esc(u.role_label||(isWorker(u)?"עובד":"מנהל")),isActive(u)?"כן":"לא",u.username==="admin"?"":`<div class="actions"><button class="gray" onclick="toggleUser(${u.id},${isActive(u)})">${isActive(u)?"השבת":"הפעל"}</button><button class="orange" onclick="editUser(${u.id},'${esc(u.username)}','${esc(u.code_plain)}','${esc(u.role)}')">ערוך</button><button class="red" onclick="deleteUser(${u.id},'${esc(u.username)}')">מחק</button></div>`]));}
function workerDropdown(waveId){const activeWorkers=users.filter(u=>isWorker(u)&&isActive(u));return`<select id="worker_for_${waveId}" style="min-width:150px">${activeWorkers.map(u=>`<option value="${esc(u.username)}">${esc(u.username)}</option>`).join("")}</select>`;}
function renderAssign(){const openWaves=waves.filter(w=>!["completed","pallet_full"].includes(w.status)&&!w.assigned_to);assignTable.innerHTML=table(["גל","סוג","חנות","סטטוס","עובד","שורות","שיוך"],openWaves.map(w=>[esc(w.wave_no),esc(w.source_label),esc(w.store),statusLabel(w.status),esc(w.assigned_to||"לא שויך"),w.items.length,`<div class="actions">${workerDropdown(w.id)}<button onclick="assignWaveFromRow('${w.id}')">שייך</button></div>`]));}
async function assignWaveFromRow(waveId){const sel=document.getElementById(`worker_for_${waveId}`);if(!sel||!sel.value)return alert("בחר עובד");try{await api("/api/assign",{method:"POST",body:JSON.stringify({waveId,username:sel.value})});await refresh();}catch(e){alert(e.message);}}
async function unassignWave(waveId){if(!confirm("להסיר שיוך מהגל?"))return;await api("/api/wave/unassign",{method:"POST",body:JSON.stringify({waveId})});await refresh();}
async function deleteWave(waveId,waveNo){if(!confirm(`למחוק את גל ${waveNo}? כל השורות שלו יימחקו.`))return;const res=await fetch(`/api/waves/${waveId}`,{method:"DELETE",credentials:"same-origin"});const data=await res.json().catch(()=>({}));if(!res.ok)return alert(data.error||"שגיאה במחיקת גל");await refresh();}
function renderStatus(){const all=waves.flatMap(w=>w.items.map(i=>({...i,wave:w}))),total=all.reduce((s,i)=>s+Number(i.qty||1),0),done=all.filter(i=>i.status!=="open").reduce((s,i)=>s+Number(i.qty||1),0);statusCards.innerHTML=`<div class="card"><b>${waves.length}</b><span>גלים</span></div><div class="card"><b>${total}</b><span>יחידות</span></div><div class="card"><b>${done}</b><span>טופלו</span></div><div class="card"><b>${total-done}</b><span>נשאר</span></div>`;statusTable.innerHTML=table(["גל","סוג","חנות","עובד","סטטוס","יחידות","טופלו","אחוז","פעולה"],waves.map(w=>{const c=counts(w),p=percentForWave(w);return[esc(w.wave_no),esc(w.source_label),esc(w.store),esc(w.assigned_to||""),statusLabel(w.status),c.total,c.done,progress(p),`<div class="actions">${w.assigned_to?`<button class="orange" onclick="unassignWave('${w.id}')">הסר שיוך</button>`:""}<button class="red" onclick="deleteWave('${w.id}','${esc(w.wave_no)}')">מחק גל</button></div>`];}));const unassigned=waves.filter(w=>!w.assigned_to&&!["completed","pallet_full"].includes(w.status));unassignedWavesTable.innerHTML=table(["גל","סוג","חנות","סטטוס","שורות","פעולה"],unassigned.map(w=>[esc(w.wave_no),esc(w.source_label),esc(w.store),statusLabel(w.status),w.items.length,`<button class="red" onclick="deleteWave('${w.id}','${esc(w.wave_no)}')">מחק גל</button>`]));const active=waves.filter(w=>w.assigned_to&&!["completed","pallet_full"].includes(w.status));activeWavesTable.innerHTML=table(["גל","סוג","חנות","עובד","יחידות","טופלו","אחוז","פעולה"],active.map(w=>{const c=counts(w),p=percentForWave(w);return[esc(w.wave_no),esc(w.source_label),esc(w.store),esc(w.assigned_to),c.total,c.done,progress(p),`<button class="orange" onclick="unassignWave('${w.id}')">הסר שיוך</button>`];}));}
async function loadImports(){if(!document.getElementById("importsTable"))return;const rows=await api("/api/imports");importsTable.innerHTML=table(["קובץ","סוג","נטען בתאריך","שורות","טופל","אחוז","סטטוס","פעולה"],rows.map(r=>[esc(r.filename),esc(r.source_label),formatIL(r.created_at),r.total_items||r.rows_count,`${r.done_items||0}/${r.total_items||0}`,progress(r.percent||0),r.completed?"לוקט במלואו":"בתהליך / פתוח",`<button class="red" onclick="deleteImport('${r.id}')">מחק קובץ</button>`]));}
async function deleteImport(id){if(!confirm("למחוק את הקובץ והשורות שנוצרו ממנו? פעולה זו מיועדת למחיקת קובצי בדיקה."))return;await fetch(`/api/imports/${id}`,{method:"DELETE",credentials:"same-origin"});await refresh();await loadImports();}
function filteredAnalyticsRows(){let rows=[...analytics];const worker=(filterWorker?.value)||"all",st=(filterStatus?.value)||"all",dates=(filterDates?.value||"").split(",").map(x=>x.trim()).filter(Boolean);if(worker!=="all")rows=rows.filter(r=>r.picked_by===worker||r.assigned_to===worker);if(st!=="all")rows=rows.filter(r=>r.status===st);if(dates.length)rows=rows.filter(r=>dates.some(d=>(r.picked_at||"").startsWith(d)));return rows;}
function renderAnalytics(){if(me?.role!=="admin"||!document.getElementById("filterWorker"))return;const old=filterWorker.value||"all";filterWorker.innerHTML=`<option value="all">כל העובדים</option>`+users.map(u=>`<option>${esc(u.username)}</option>`).join("");filterWorker.value=old;const rows=filteredAnalyticsRows();analyticsCards.innerHTML=`<div class="card"><b>${rows.length}</b><span>שורות</span></div><div class="card"><b>${rows.filter(r=>r.status==="picked").length}</b><span>לוקט</span></div><div class="card"><b>${rows.filter(r=>r.status==="alt_mix").length}</b><span>מיקס אחר</span></div><div class="card"><b>${rows.filter(r=>r.status==="not_found").length}</b><span>לא נמצא</span></div>`;const byWorker={};analytics.forEach(r=>{const name=r.picked_by||r.assigned_to||"לא שויך";if(filterWorker.value!=="all"&&name!==filterWorker.value)return;if(!byWorker[name])byWorker[name]={rows:0,pickedRows:0,waves:new Set()};byWorker[name].rows++;if(r.status!=="open")byWorker[name].pickedRows++;if(r.wave_id)byWorker[name].waves.add(r.wave_id);});workerSummaryTable.innerHTML=table(["עובד","שורות משויכות/קיימות","שורות שטופלו","גלי ליקוט"],Object.entries(byWorker).map(([name,o])=>[esc(name),o.rows,o.pickedRows,o.waves.size]));analyticsTable.innerHTML=table(["גל","סוג","חנות","עובד","דגם","מיקס","כמות","מיקום","סטטוס","מיקס בפועל","תאריך"],rows.map(r=>[esc(r.wave_no),esc(r.source_label),esc(r.store),esc(r.picked_by||r.assigned_to||""),esc(r.model),esc(r.mix),r.qty,esc(r.location||""),statusLabel(r.status),esc(r.actual_mix||""),esc(formatIL(r.picked_at)||"")]),rows.map(r=>r.status));}
function groupRows(rows,keyFn){const out={};rows.forEach(r=>{const k=keyFn(r)||"לא ידוע";if(!out[k])out[k]={total:0,done:0,waves:new Set()};out[k].total++;if(r.status!=="open")out[k].done++;if(r.wave_id)out[k].waves.add(r.wave_id);});return Object.entries(out).map(([k,v])=>[esc(k),v.total,v.done,v.waves.size,progress(v.total?Math.round(v.done/v.total*100):0)]);}
function renderDashboard(){if(me?.role!=="admin"||!document.getElementById("dashCards"))return;const old=dashWorker.value||"all";dashWorker.innerHTML=`<option value="all">כל העובדים</option>`+users.map(u=>`<option>${esc(u.username)}</option>`).join("");dashWorker.value=old;let rows=[...analytics];if(dashWorker.value!=="all")rows=rows.filter(r=>r.picked_by===dashWorker.value||r.assigned_to===dashWorker.value);if(dashDate.value)rows=rows.filter(r=>(r.picked_at||"").startsWith(dashDate.value));if(dashStore.value)rows=rows.filter(r=>String(r.store||"").includes(dashStore.value));const total=rows.length,done=rows.filter(r=>r.status!=="open").length;dashCards.innerHTML=`<div class="card"><b>${total}</b><span>שורות</span></div><div class="card"><b>${done}</b><span>טופלו</span></div><div class="card"><b>${rows.filter(r=>r.status==="not_found").length}</b><span>לא נמצא</span></div><div class="card"><b>${new Set(rows.map(r=>r.wave_id)).size}</b><span>גלים</span></div>`;dashByWorker.innerHTML=table(["עובד","שורות","טופלו","גלים","אחוז"],groupRows(rows,r=>r.picked_by||r.assigned_to||"לא שויך"));dashByStore.innerHTML=table(["חנות","שורות","טופלו","גלים","אחוז"],groupRows(rows,r=>r.store));dashByDate.innerHTML=table(["תאריך","שורות","טופלו","גלים","אחוז"],groupRows(rows,r=>shortDate(r.picked_at)||"ללא תאריך"));}
boot();setInterval(()=>{if(me)refresh();},15000);

// ===== KLC v1.6 additions =====

async function completeWave(waveId){
  try{
    const res=await api("/api/wave/complete",{method:"POST",body:JSON.stringify({waveId})});
    alert(res.message||"ליקוט הושלם - סגור משטח");
    await refresh();
  }catch(e){
    alert(e.message || "לא ניתן לסגור גל");
  }
}

function showPage(id){
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("show",p.id===id));
  if(id==="importsPage")loadImports();
  if(id==="dashboardPage")renderDashboard();
  if(id==="personalStatusPage")renderPersonalStatus();
  if(id==="correctionsPage")renderCorrections();
}

async function boot(){
  const res=await api("/api/me").catch(()=>({user:null}));
  me=res.user;
  loginScreen.classList.toggle("hidden",!!me);
  appScreen.classList.toggle("hidden",!me);
  if(!me)return;
  meBox.innerHTML=`מחובר: <b>${esc(me.username)}</b><br>${me.role==="admin"?"מנהל":"עובד"}`;
  document.querySelectorAll(".admin-only").forEach(x=>x.style.display=me.role==="admin"?"block":"none");
  document.querySelectorAll(".worker-only").forEach(x=>x.style.display=me.role==="worker"?"block":"none");
  await refresh();
  showPage(me.role==="admin"?"dashboardPage":"workerPage");
}

function groupRowsWithTotal(rows,keyFn){
  const out={};
  rows.forEach(r=>{
    const k=keyFn(r)||"לא ידוע";
    if(!out[k]) out[k]={total:0,done:0,waves:new Set()};
    out[k].total++;
    if(r.status!=="open") out[k].done++;
    if(r.wave_id) out[k].waves.add(r.wave_id);
  });
  const result = Object.entries(out).map(([k,v])=>[esc(k),v.total,v.done,v.waves.size,progress(v.total?Math.round(v.done/v.total*100):0)]);
  const totalRows = result.reduce((s,r)=>s+Number(r[1]||0),0);
  const totalDone = result.reduce((s,r)=>s+Number(r[2]||0),0);
  const totalWaves = new Set(rows.map(r=>r.wave_id).filter(Boolean)).size;
  result.push([`<b>סה"כ</b>`,`<b>${totalRows}</b>`,`<b>${totalDone}</b>`,`<b>${totalWaves}</b>`,progress(totalRows?Math.round(totalDone/totalRows*100):0)]);
  return result;
}

function renderDashboard(){
  if(me?.role!=="admin"||!document.getElementById("dashCards"))return;
  const old=dashWorker.value||"all";
  dashWorker.innerHTML=`<option value="all">כל העובדים</option>`+users.map(u=>`<option>${esc(u.username)}</option>`).join("");
  dashWorker.value=old;
  let rows=[...analytics];
  if(dashWorker.value!=="all")rows=rows.filter(r=>r.picked_by===dashWorker.value||r.assigned_to===dashWorker.value);
  if(dashDate.value)rows=rows.filter(r=>(r.picked_at||"").startsWith(dashDate.value)||(r.closed_at||"").startsWith(dashDate.value));
  if(dashStore.value)rows=rows.filter(r=>String(r.store||"").includes(dashStore.value));
  const total=rows.length,done=rows.filter(r=>r.status!=="open").length;
  dashCards.innerHTML=`<div class="card"><b>${total}</b><span>שורות</span></div><div class="card"><b>${done}</b><span>טופלו</span></div><div class="card"><b>${rows.filter(r=>r.status==="not_found").length}</b><span>לא נמצא</span></div><div class="card"><b>${new Set(rows.map(r=>r.wave_id)).size}</b><span>גלים</span></div>`;
  dashByWorker.innerHTML=table(["עובד","שורות","טופלו","גלים","אחוז"],groupRowsWithTotal(rows,r=>r.picked_by||r.assigned_to||"לא שויך"));
  dashByStore.innerHTML=table(["חנות","שורות","טופלו","גלים","אחוז"],groupRowsWithTotal(rows,r=>r.store));
  dashByDate.innerHTML=table(["תאריך","שורות","טופלו","גלים","אחוז"],groupRowsWithTotal(rows,r=>shortDate(r.picked_at||r.closed_at)||"ללא תאריך"));
  const waveRows = waves.filter(w=>{
    if(dashWorker.value!=="all" && w.assigned_to!==dashWorker.value) return false;
    if(dashStore.value && !String(w.store||"").includes(dashStore.value)) return false;
    if(dashDate.value && !(w.closed_at||"").startsWith(dashDate.value)) return false;
    return true;
  }).map(w=>{
    const c=counts(w),p=percentForWave(w);
    return [`<span class="clickable" onclick="showDashWave('${w.id}')">${esc(w.wave_no)}</span>`,esc(w.source_label),esc(w.store),esc(w.assigned_to||"לא שויך"),statusLabel(w.status),c.total,c.done,progress(p)];
  });
  dashWaves.innerHTML=table(["גל","סוג","חנות","מלקט","סטטוס","שורות","טופלו","אחוז"],waveRows);
}

function showDashWave(waveId){
  const w=waves.find(x=>x.id===waveId);
  if(!w)return;
  dashWaveDetails.innerHTML=`<div class="detailBox"><b>פרטי גל ${esc(w.wave_no)}</b><br>מלקט: ${esc(w.assigned_to||"לא שויך")}<br>סיום גל: ${w.status==="completed" ? esc(formatIL(w.closed_at)) : "טרם נסגר בליקוט הושלם"}<br>הערה: משטח מלא אינו נחשב סיום גל.</div>`;
}

let personalRows=[];
async function loadPersonalRows(){
  personalRows = await api("/api/my-performance").catch(()=>[]);
  return personalRows;
}
async function renderPersonalStatus(){
  if(me?.role!=="worker")return;
  if(!personalRows.length) await loadPersonalRows();
  let rows=[...personalRows];
  if(personalDate.value) rows=rows.filter(r=>(r.picked_at||r.closed_at||"").startsWith(personalDate.value));
  const byStore={};
  rows.filter(r=>r.status!=="open").forEach(r=>{
    const key=(r.picked_at?shortDate(r.picked_at):"ללא תאריך")+"||"+(r.store||"לא ידוע");
    if(!byStore[key]) byStore[key]={date:r.picked_at?shortDate(r.picked_at):"ללא תאריך",store:r.store||"לא ידוע",rows:0,waves:new Set()};
    byStore[key].rows++; if(r.wave_id)byStore[key].waves.add(r.wave_id);
  });
  const storeRows=Object.values(byStore).map(o=>[esc(o.date),`<span class="clickable" onclick="showPersonalStore('${esc(o.store)}')">${esc(o.store)}</span>`,o.rows,o.waves.size]);
  const totalStores=new Set(Object.values(byStore).map(o=>o.store)).size;
  const totalLines=Object.values(byStore).reduce((s,o)=>s+o.rows,0);
  storeRows.push([`<b>סה"כ</b>`,`<b>${totalStores} חנויות</b>`,`<b>${totalLines}</b>`,""]);
  personalByStore.innerHTML=table(["תאריך","חנות","שורות שבוצעו","משטחים/גלים"],storeRows);

  const allByDate={};
  analytics.forEach(r=>{
    const d=shortDate(r.picked_at||r.closed_at)||"ללא תאריך";
    if(!allByDate[d])allByDate[d]={all:0,mine:0};
    if(r.status!=="open") allByDate[d].all++;
    if((r.picked_by===me.username||r.assigned_to===me.username)&&r.status!=="open") allByDate[d].mine++;
  });
  const percRows=Object.entries(allByDate).map(([d,o])=>[esc(d),o.mine,o.all,progress(o.all?Math.round(o.mine/o.all*100):0)]).slice(0,50);
  personalDailyPercent.innerHTML=table(["תאריך","שורות שלי","סה״כ יומי","אחוז"],percRows);
}

function showPersonalStore(store){
  const rows=personalRows.filter(r=>r.store===store && r.status!=="open");
  const byWave={};
  rows.forEach(r=>{
    if(!byWave[r.wave_id]) byWave[r.wave_id]={wave_no:r.wave_no,date:formatIL(r.closed_at||r.picked_at),rows:0};
    byWave[r.wave_id].rows++;
  });
  personalPallets.innerHTML=table(["משטח/גל","תאריך","שורות"],Object.entries(byWave).map(([id,o])=>[`<span class="clickable" onclick="showPersonalWaveItems('${id}')">${esc(o.wave_no)}</span>`,esc(o.date),o.rows]));
  personalPalletItems.innerHTML="";
}
function showPersonalWaveItems(waveId){
  const rows=personalRows.filter(r=>r.wave_id===waveId);
  personalPalletItems.innerHTML=table(["דגם","מיקס","כמות","סטטוס","מיקום"],rows.map(r=>[esc(r.model),esc(r.mix),r.qty,statusLabel(r.status),esc(r.location||"")]),rows.map(r=>r.status));
}

function renderCorrections(){
  if(me?.role!=="admin"||!document.getElementById("correctionStores"))return;
  let rows=[...analytics];
  if(correctionStoreFilter.value) rows=rows.filter(r=>String(r.store||"").includes(correctionStoreFilter.value));
  if(correctionDateFilter.value) rows=rows.filter(r=>(r.picked_at||r.closed_at||"").startsWith(correctionDateFilter.value));
  const stores=[...new Set(rows.map(r=>r.store).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"he"));
  correctionStores.innerHTML=table(["חנות"],stores.map(s=>[`<span class="clickable" onclick="showCorrectionStore('${esc(s)}')">${esc(s)}</span>`]));
  correctionWaves.innerHTML="";
  correctionItems.innerHTML="";
}
function showCorrectionStore(store){
  const storeRows=analytics.filter(r=>r.store===store);
  const waveIds=[...new Set(storeRows.map(r=>r.wave_id).filter(Boolean))];
  correctionWaves.innerHTML=table(["גל","סוג","מלקט","סטטוס","שורות"],waveIds.map(id=>{
    const w=waves.find(x=>x.id===id);
    const cnt=storeRows.filter(r=>r.wave_id===id).length;
    return [`<span class="clickable" onclick="showCorrectionWave('${id}')">${esc(w?.wave_no||id)}</span>`,esc(w?.source_label||""),esc(w?.assigned_to||"לא שויך"),statusLabel(w?.status||""),cnt];
  }));
  correctionItems.innerHTML="";
}
function correctionStatusSelect(itemId,status){
  return `<select id="corr_${itemId}"><option value="picked" ${status==="picked"?"selected":""}>לוקט</option><option value="alt_mix" ${status==="alt_mix"?"selected":""}>לוקט מיקס אחר</option><option value="not_found" ${status==="not_found"?"selected":""}>לא נמצא</option><option value="open" ${status==="open"?"selected":""}>פתוח</option></select><button onclick="saveCorrection('${itemId}')">שמור</button>`;
}
function showCorrectionWave(waveId){
  const rows=analytics.filter(r=>r.wave_id===waveId);
  correctionItems.innerHTML=table(["דגם","מיקס","כמות","מיקום","סטטוס","תיקון"],rows.map(r=>[esc(r.model),esc(r.mix),r.qty,esc(r.location||""),statusLabel(r.status),correctionStatusSelect(r.item_id,r.status)]),rows.map(r=>r.status));
}
async function saveCorrection(itemId){
  const st=document.getElementById(`corr_${itemId}`).value;
  await setItemStatus(itemId,st);
  analytics=await api("/api/analytics");
  renderCorrections();
}
// KLC v1.7.2 - תיקון כפוי למסך עובד בגל "השלמת מכנסיים"
// חשוב: להדביק בסוף public/app.js, אחרי כל העדכונים הקודמים.

function klcIsPantsWave(w){
  const label = String(w?.source_label || "");
  const type = String(w?.source_type || "").toLowerCase();
  const no = String(w?.wave_no || "");
  return type === "pants" || label.includes("מכנס") || no.includes("-P-");
}

async function klcSetItemStatus(itemId,status,actualMix="",pickedModel=""){
  // משתמש ב-endpoint החדש ששומר גם דגם שלוקט
  try{
    await api("/api/item/status2",{
      method:"POST",
      body:JSON.stringify({itemId,status,actualMix,pickedModel})
    });
  }catch(e){
    alert(e.message || "לא ניתן לשמור את השורה. ודא שהדבקת גם את עדכון server.js");
    return;
  }
  await refresh();
}

function klcPantsModelInput(i){
  return `
    <div class="pants-model-box">
      <label for="picked_model_${i.id}">הזן דגם שלוקט</label>
      <input
        id="picked_model_${i.id}"
        type="number"
        inputmode="numeric"
        pattern="[0-9]*"
        value="${esc(i.picked_model || "")}"
        placeholder="מספר דגם"
        class="picked-model-input"
      />
    </div>
  `;
}

function klcPantsActions(i){
  return `
    <div class="actions pants-actions">
      <button class="green" onclick="klcSetItemStatus('${i.id}','picked','',document.getElementById('picked_model_${i.id}').value)">לוקט</button>
      <button class="red" onclick="klcSetItemStatus('${i.id}','not_found','',document.getElementById('picked_model_${i.id}').value)">אין מלאי</button>
      <button class="gray" onclick="klcSetItemStatus('${i.id}','open')">בטל סימון</button>
    </div>
  `;
}

function klcRegularActions(i){
  return `
    <div class="actions">
      <button class="green" onclick="klcSetItemStatus('${i.id}','picked')">לוקט</button>
      <select id="mix_${i.id}" style="width:80px">${MIXES.map(m=>`<option>${m}</option>`).join("")}</select>
      <button class="orange" onclick="klcSetItemStatus('${i.id}','alt_mix',document.getElementById('mix_${i.id}').value)">לוקט מיקס אחר</button>
      <button class="red" onclick="klcSetItemStatus('${i.id}','not_found')">לא נמצא</button>
      <button class="gray" onclick="klcSetItemStatus('${i.id}','open')">בטל סימון</button>
    </div>
  `;
}

// זה מחליף סופית את renderWorkerPage, גם אם עדכון קודם דרס אותו.
function renderWorkerPage(){
  if(!document.getElementById("workerWaveSelect")) return;

  const selectedId = workerWaveSelect.value;

  workerWaveSelect.innerHTML = waves.map(w =>
    `<option value="${esc(w.id)}">${esc(w.wave_no)} | ${esc(w.source_label)} | ${esc(w.store)}</option>`
  ).join("") || "<option value='__none__'>אין גלי ליקוט</option>";

  const w = waves.find(x=>x.id===selectedId) || waves[0];

  if(!w){
    workerCards.innerHTML = "";
    workerActions.innerHTML = "";
    workerItems.innerHTML = `<div class="panel">אין גלים משויכים כרגע.</div>`;
    nextWave.innerHTML = "";
    return;
  }

  workerWaveSelect.value = w.id;

  const idx = waves.findIndex(x=>x.id===w.id);
  const next = waves[idx+1];
  nextWave.innerHTML = next
    ? `הגל הבא: <b>${esc(next.source_label)}</b> | <b>${esc(next.store)}</b> | ${next.items.length} שורות`
    : "אין גל הבא כרגע";

  const c = counts(w);
  workerCards.innerHTML = `
    <div class="card"><b>${esc(w.wave_no)}</b><span>גל</span></div>
    <div class="card"><b>${esc(w.source_label)}</b><span>סוג גל</span></div>
    <div class="card"><b>${esc(w.store)}</b><span>חנות</span></div>
    <div class="card"><b>${c.total}</b><span>יחידות</span></div>
    <div class="card"><b>${c.done}</b><span>טופלו</span></div>
    <div class="card"><b>${c.total-c.done}</b><span>נשאר</span></div>
  `;

  workerActions.innerHTML = `
    <div class="panel actions">
      <button class="orange" onclick="palletFull('${w.id}')">משטח מלא</button>
      <button class="green" onclick="completeWave('${w.id}')">ליקוט הושלם - סגור משטח</button>
    </div>
  `;

  const sortedItems = typeof sortItemsByLocation === "function"
    ? sortItemsByLocation(w.items)
    : (w.items || []);

  const isPants = klcIsPantsWave(w);

  workerItems.innerHTML = table(
    ["מיקום","דגם","מיקס / מידה","כמות","סטטוס","פעולות"],
    sortedItems.map(i=>[
      esc(i.location || "ללא מיקום"),
      isPants
        ? `${esc(i.model)}${klcPantsModelInput(i)}`
        : esc(i.model),
      esc(i.mix || "A"),
      esc(i.qty || 1),
      `${statusLabel(i.status)}<br><span class="small">${esc(formatIL(i.picked_at)||"")}</span>${i.picked_model?`<br><span class="small">דגם שלוקט: ${esc(i.picked_model)}</span>`:""}`,
      isPants ? klcPantsActions(i) : klcRegularActions(i)
    ]),
    sortedItems.map(i=>i.status)
  );
}

// אחרי טעינה מחדש של הדף, נוודא שמסך העובד מצויר עם הגרסה החדשה
setTimeout(()=>{ 
  if(me?.role === "worker") renderWorkerPage(); 
}, 800);

function klcPantsModelInput(i){
  return `
    <div class="pants-model-inline">
      <span class="pants-model-label">הזן דגם</span>
      <input
        id="picked_model_${i.id}"
        type="number"
        inputmode="numeric"
        pattern="[0-9]*"
        value="${esc(i.picked_model || "")}"
        placeholder="מספר דגם"
        class="picked-model-input-compact"
      />
    </div>
  `;
}

function klcPickPantsItem(itemId){
  const el = document.getElementById(`picked_model_${itemId}`);
  const val = String(el?.value || "").trim();

  if(!val){
    alert("חובה להזין מספר דגם לפני סימון לוקט");
    if(el) el.focus();
    return;
  }

  klcSetItemStatus(itemId, "picked", "", val);
}

function klcPantsActions(i){
  return `
    <div class="actions pants-actions compact-pants-actions">
      <button class="green" onclick="klcPickPantsItem('${i.id}')">לוקט</button>
      <button class="red" onclick="klcSetItemStatus('${i.id}','not_found','',document.getElementById('picked_model_${i.id}')?.value || '')">אין מלאי</button>
      <button class="gray" onclick="klcSetItemStatus('${i.id}','open')">בטל סימון</button>
    </div>
  `;
}

// החלפה סופית של מסך העובד כדי שהדגם יישאר באותה שורה וההזנה תהיה קטנה מתחתיו
function renderWorkerPage(){
  if(!document.getElementById("workerWaveSelect")) return;

  const selectedId = workerWaveSelect.value;

  workerWaveSelect.innerHTML = waves.map(w =>
    `<option value="${esc(w.id)}">${esc(w.wave_no)} | ${esc(w.source_label)} | ${esc(w.store)}</option>`
  ).join("") || "<option value='__none__'>אין גלי ליקוט</option>";

  const w = waves.find(x=>x.id===selectedId) || waves[0];

  if(!w){
    workerCards.innerHTML = "";
    workerActions.innerHTML = "";
    workerItems.innerHTML = `<div class="panel">אין גלים משויכים כרגע.</div>`;
    nextWave.innerHTML = "";
    return;
  }

  workerWaveSelect.value = w.id;

  const idx = waves.findIndex(x=>x.id===w.id);
  const next = waves[idx+1];
  nextWave.innerHTML = next
    ? `הגל הבא: <b>${esc(next.source_label)}</b> | <b>${esc(next.store)}</b> | ${next.items.length} שורות`
    : "אין גל הבא כרגע";

  const c = counts(w);
  workerCards.innerHTML = `
    <div class="card"><b>${esc(w.wave_no)}</b><span>גל</span></div>
    <div class="card"><b>${esc(w.source_label)}</b><span>סוג גל</span></div>
    <div class="card"><b>${esc(w.store)}</b><span>חנות</span></div>
    <div class="card"><b>${c.total}</b><span>יחידות</span></div>
    <div class="card"><b>${c.done}</b><span>טופלו</span></div>
    <div class="card"><b>${c.total-c.done}</b><span>נשאר</span></div>
  `;

  workerActions.innerHTML = `
    <div class="panel actions">
      <button class="orange" onclick="palletFull('${w.id}')">משטח מלא</button>
      <button class="green" onclick="completeWave('${w.id}')">ליקוט הושלם - סגור משטח</button>
    </div>
  `;

  const sortedItems = typeof sortItemsByLocation === "function"
    ? sortItemsByLocation(w.items)
    : (w.items || []);

  const isPants = klcIsPantsWave(w);

  workerItems.innerHTML = table(
    ["מיקום","דגם","מיקס / מידה","כמות","סטטוס","פעולות"],
    sortedItems.map(i=>[
      esc(i.location || "ללא מיקום"),
      isPants
        ? `<div class="pants-model-cell"><div class="pants-required-model">${esc(i.model)}</div>${klcPantsModelInput(i)}</div>`
        : esc(i.model),
      esc(i.mix || "A"),
      esc(i.qty || 1),
      `${statusLabel(i.status)}<br><span class="small">${esc(formatIL(i.picked_at)||"")}</span>${i.picked_model?`<br><span class="small">דגם שלוקט: ${esc(i.picked_model)}</span>`:""}`,
      isPants ? klcPantsActions(i) : klcRegularActions(i)
    ]),
    sortedItems.map(i=>i.status)
  );
}

function getCheckedStatusWaves(){
  return [...document.querySelectorAll(".status-wave-check:checked")].map(x=>x.value);
}

function toggleAllStatusWaves(source){
  document.querySelectorAll(".status-wave-check").forEach(cb=>{
    cb.checked = source.checked;
  });
}

async function bulkDeleteStatusWaves(){
  const ids = getCheckedStatusWaves();

  if(!ids.length){
    alert("לא נבחרו גלים למחיקה");
    return;
  }

  if(!confirm(`למחוק ${ids.length} גלים מסומנים? כל שורות הליקוט שלהם יימחקו.`)){
    return;
  }

  try{
    const res = await api("/api/waves/bulk-delete",{
      method:"POST",
      body:JSON.stringify({waveIds:ids})
    });

    alert(`נמחקו ${res.deleted} גלים`);
    await refresh();
    showPage("statusPage");
  }catch(e){
    alert(e.message || "לא ניתן למחוק את הגלים המסומנים");
  }
}

// החלפת מסך סטאטוס עם תיבת סימון ליד כל גל וכפתור מחק מסומנים
function renderStatus(){
  const sortedWaves = typeof sortWavesByStoreAsc === "function" ? sortWavesByStoreAsc(waves) : waves;
  const all = sortedWaves.flatMap(w=>w.items.map(i=>({...i,wave:w})));
  const total = all.reduce((s,i)=>s+Number(i.qty||1),0);
  const done = all.filter(i=>i.status!=="open").reduce((s,i)=>s+Number(i.qty||1),0);

  statusCards.innerHTML = `
    <div class="card"><b>${sortedWaves.length}</b><span>גלים</span></div>
    <div class="card"><b>${total}</b><span>יחידות</span></div>
    <div class="card"><b>${done}</b><span>טופלו</span></div>
    <div class="card"><b>${total-done}</b><span>נשאר</span></div>
  `;

  const bulkBar = `
    <div class="panel status-bulk-bar">
      <label class="bulk-check-label">
        <input type="checkbox" onchange="toggleAllStatusWaves(this)" />
        סמן הכל
      </label>
      <button class="red" onclick="bulkDeleteStatusWaves()">מחק מסומנים</button>
    </div>
  `;

  statusTable.innerHTML = bulkBar + table(
    ["סימון","גל","סוג","חנות","עובד","סטטוס","יחידות","טופלו","אחוז","פעולה"],
    sortedWaves.map(w=>{
      const c=counts(w),p=percentForWave(w);
      return [
        `<input type="checkbox" class="status-wave-check" value="${esc(w.id)}" />`,
        esc(w.wave_no),
        esc(w.source_label),
        esc(w.store),
        esc(w.assigned_to||""),
        statusLabel(w.status),
        c.total,
        c.done,
        progress(p),
        `<div class="actions">${w.assigned_to?`<button class="orange" onclick="unassignWave('${w.id}')">הסר שיוך</button>`:""}<button class="red" onclick="deleteWave('${w.id}','${esc(w.wave_no)}')">מחק שורה</button></div>`
      ];
    })
  );

  const unassigned = (typeof sortWavesByStoreAsc === "function" ? sortWavesByStoreAsc(sortedWaves.filter(w=>!w.assigned_to&&!["completed","pallet_full"].includes(w.status))) : sortedWaves.filter(w=>!w.assigned_to&&!["completed","pallet_full"].includes(w.status)));
  unassignedWavesTable.innerHTML = table(
    ["גל","סוג","חנות","סטטוס","שורות","פעולה"],
    unassigned.map(w=>[
      esc(w.wave_no),
      esc(w.source_label),
      esc(w.store),
      statusLabel(w.status),
      w.items.length,
      `<button class="red" onclick="deleteWave('${w.id}','${esc(w.wave_no)}')">מחק שורה</button>`
    ])
  );

  const active = (typeof sortWavesByStoreAsc === "function" ? sortWavesByStoreAsc(sortedWaves.filter(w=>w.assigned_to&&!["completed","pallet_full"].includes(w.status))) : sortedWaves.filter(w=>w.assigned_to&&!["completed","pallet_full"].includes(w.status)));
  activeWavesTable.innerHTML = table(
    ["גל","סוג","חנות","עובד","יחידות","טופלו","אחוז","פעולה"],
    active.map(w=>{
      const c=counts(w),p=percentForWave(w);
      return [
        esc(w.wave_no),
        esc(w.source_label),
        esc(w.store),
        esc(w.assigned_to),
        c.total,
        c.done,
        progress(p),
        `<button class="orange" onclick="unassignWave('${w.id}')">הסר שיוך</button>`
      ];
    })
  );
}

window.klcStatusSelectedWaves = window.klcStatusSelectedWaves || new Set();
window.klcAssignSelectedWaves = window.klcAssignSelectedWaves || new Set();

function rememberStatusCheck(cb){
  if(cb.checked) window.klcStatusSelectedWaves.add(cb.value);
  else window.klcStatusSelectedWaves.delete(cb.value);
}

function getCheckedStatusWaves(){
  return [...window.klcStatusSelectedWaves];
}

function toggleAllStatusWaves(source){
  document.querySelectorAll(".status-wave-check").forEach(cb=>{
    cb.checked = source.checked;
    rememberStatusCheck(cb);
  });
}

async function bulkDeleteStatusWaves(){
  const ids = getCheckedStatusWaves();

  if(!ids.length){
    alert("לא נבחרו גלים למחיקה");
    return;
  }

  if(!confirm(`למחוק ${ids.length} גלים מסומנים? כל שורות הליקוט שלהם יימחקו.`)){
    return;
  }

  try{
    const res = await api("/api/waves/bulk-delete",{
      method:"POST",
      body:JSON.stringify({waveIds:ids})
    });

    ids.forEach(id=>window.klcStatusSelectedWaves.delete(id));

    alert(`נמחקו ${res.deleted} גלים`);
    await refresh();
    showPage("statusPage");
  }catch(e){
    alert(e.message || "לא ניתן למחוק את הגלים המסומנים");
  }
}

function renderStatus(){
  const sortedWaves = typeof sortWavesByStoreAsc === "function" ? sortWavesByStoreAsc(waves) : waves;
  const all = sortedWaves.flatMap(w=>w.items.map(i=>({...i,wave:w})));
  const total = all.reduce((s,i)=>s+Number(i.qty||1),0);
  const done = all.filter(i=>i.status!=="open").reduce((s,i)=>s+Number(i.qty||1),0);

  statusCards.innerHTML = `
    <div class="card"><b>${sortedWaves.length}</b><span>גלים</span></div>
    <div class="card"><b>${total}</b><span>יחידות</span></div>
    <div class="card"><b>${done}</b><span>טופלו</span></div>
    <div class="card"><b>${total-done}</b><span>נשאר</span></div>
  `;

  const bulkBar = `
    <div class="panel status-bulk-bar">
      <label class="bulk-check-label">
        <input type="checkbox" onchange="toggleAllStatusWaves(this)" />
        סמן הכל
      </label>
      <button class="red" onclick="bulkDeleteStatusWaves()">מחק מסומנים</button>
      <span class="small">הסימונים נשמרים גם אם המסך מתרענן.</span>
    </div>
  `;

  statusTable.innerHTML = bulkBar + table(
    ["סימון","גל","סוג","חנות","עובד","סטטוס","יחידות","טופלו","אחוז","פעולה"],
    sortedWaves.map(w=>{
      const c=counts(w),p=percentForWave(w);
      const checked = window.klcStatusSelectedWaves.has(w.id) ? "checked" : "";
      return [
        `<input type="checkbox" class="status-wave-check" value="${esc(w.id)}" ${checked} onchange="rememberStatusCheck(this)" />`,
        esc(w.wave_no),
        esc(w.source_label),
        esc(w.store),
        esc(w.assigned_to||""),
        statusLabel(w.status),
        c.total,
        c.done,
        progress(p),
        `<div class="actions">${w.assigned_to?`<button class="orange" onclick="unassignWave('${w.id}')">הסר שיוך</button>`:""}<button class="red" onclick="deleteWave('${w.id}','${esc(w.wave_no)}')">מחק שורה</button></div>`
      ];
    })
  );

  const unassigned = (typeof sortWavesByStoreAsc === "function" ? sortWavesByStoreAsc(sortedWaves.filter(w=>!w.assigned_to&&!["completed","pallet_full"].includes(w.status))) : sortedWaves.filter(w=>!w.assigned_to&&!["completed","pallet_full"].includes(w.status)));
  unassignedWavesTable.innerHTML = table(
    ["גל","סוג","חנות","סטטוס","שורות","פעולה"],
    unassigned.map(w=>[
      esc(w.wave_no),
      esc(w.source_label),
      esc(w.store),
      statusLabel(w.status),
      w.items.length,
      `<button class="red" onclick="deleteWave('${w.id}','${esc(w.wave_no)}')">מחק שורה</button>`
    ])
  );

  const active = (typeof sortWavesByStoreAsc === "function" ? sortWavesByStoreAsc(sortedWaves.filter(w=>w.assigned_to&&!["completed","pallet_full"].includes(w.status))) : sortedWaves.filter(w=>w.assigned_to&&!["completed","pallet_full"].includes(w.status)));
  activeWavesTable.innerHTML = table(
    ["גל","סוג","חנות","עובד","יחידות","טופלו","אחוז","פעולה"],
    active.map(w=>{
      const c=counts(w),p=percentForWave(w);
      return [
        esc(w.wave_no),
        esc(w.source_label),
        esc(w.store),
        esc(w.assigned_to),
        c.total,
        c.done,
        progress(p),
        `<button class="orange" onclick="unassignWave('${w.id}')">הסר שיוך</button>`
      ];
    })
  );
}

function rememberAssignCheck(cb){
  if(cb.checked) window.klcAssignSelectedWaves.add(cb.value);
  else window.klcAssignSelectedWaves.delete(cb.value);
}

function getCheckedAssignWaves(){
  return [...window.klcAssignSelectedWaves];
}

function toggleAllAssignWaves(source){
  document.querySelectorAll(".assign-wave-check").forEach(cb=>{
    cb.checked = source.checked;
    rememberAssignCheck(cb);
  });
}

async function bulkAssignSelectedWaves(){
  const username = document.getElementById("assignTopWorker")?.value || "";
  const ids = getCheckedAssignWaves();

  if(!username || username === "__none__"){
    alert("יש לבחור עובד");
    return;
  }

  if(!ids.length){
    alert("לא נבחרו גלים לשיוך");
    return;
  }

  try{
    const res = await api("/api/assign/bulk",{
      method:"POST",
      body:JSON.stringify({username, waveIds:ids})
    });

    ids.forEach(id=>window.klcAssignSelectedWaves.delete(id));

    alert(`שויכו ${res.assigned} גלים לעובד ${username}${res.skipped ? `, דולגו ${res.skipped}` : ""}`);
    await refresh();
    showPage("assignPage");
  }catch(e){
    alert(e.message || "לא ניתן לשייך את הגלים המסומנים");
  }
}

function renderAssign(){
  const openWaves = (typeof sortWavesByStoreAsc === "function" ? sortWavesByStoreAsc(waves) : waves)
    .filter(w=>!["completed","pallet_full"].includes(w.status)&&!w.assigned_to);

  const activeWorkers = users.filter(u=>isWorker(u)&&isActive(u));

  const topBar = `
    <div class="panel assign-bulk-bar">
      <select id="assignTopWorker">
        ${activeWorkers.map(u=>`<option value="${esc(u.username)}">${esc(u.username)}</option>`).join("") || `<option value="__none__">אין עובדים פעילים</option>`}
      </select>
      <button onclick="bulkAssignSelectedWaves()">שייך</button>
      <label class="bulk-check-label">
        <input type="checkbox" onchange="toggleAllAssignWaves(this)" />
        סמן הכל
      </label>
      <span class="small">בחר עובד, סמן גלים ולחץ שייך.</span>
    </div>
  `;

  assignTable.innerHTML = topBar + table(
    ["סימון","גל","סוג","חנות","סטטוס","עובד","שורות","שיוך בודד"],
    openWaves.map(w=>{
      const checked = window.klcAssignSelectedWaves.has(w.id) ? "checked" : "";
      return [
        `<input type="checkbox" class="assign-wave-check" value="${esc(w.id)}" ${checked} onchange="rememberAssignCheck(this)" />`,
        esc(w.wave_no),
        esc(w.source_label),
        esc(w.store),
        statusLabel(w.status),
        esc(w.assigned_to||"לא שויך"),
        w.items.length,
        `<div class="actions">${workerDropdown(w.id)}<button onclick="assignWaveFromRow('${w.id}')">שייך</button></div>`
      ];
    })
  );
}

