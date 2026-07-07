let me=null,waves=[],users=[],analytics=[],personalRows=[];const MIXES='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');window.klcStatusSelectedWaves=new Set();window.klcAssignSelectedWaves=new Set();
async function api(url,options={}){const res=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'שגיאה');return data}function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}function isWorker(u){return String(u.role||'').toLowerCase()==='worker'||u.role_label==='עובד'}function isActive(u){return u.active===true||u.active===1||u.active==='1'||u.active==='true'||u.active==='כן'}function formatIL(dt){if(!dt)return'';try{return new Date(dt).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'})}catch(e){return dt}}function shortDate(dt){if(!dt)return'';try{return new Date(dt).toLocaleDateString('he-IL',{timeZone:'Asia/Jerusalem'})}catch(e){return dt}}function table(h,rows,cls=[]){if(!rows.length)return'<div class="panel">אין נתונים להצגה</div>';return'<table><thead><tr>'+h.map(x=>`<th>${x}</th>`).join('')+'</tr></thead><tbody>'+rows.map((r,i)=>`<tr class="${cls[i]||''}">${r.map(c=>`<td>${c??''}</td>`).join('')}</tr>`).join('')+'</tbody></table>'}function statusLabel(s){return{open:'פתוח',assigned:'משויך',active:'פעיל',completed:'הושלם',pallet_full:'משטח מלא',picked:'לוקט',alt_mix:'לוקט מיקס אחר',not_found:'לא נמצא'}[s]||s}function progress(p){return`<div class="progress"><div style="width:${p}%"></div></div>${p}%`}function storeSortNumber(s){const m=String(s||'').match(/\d+/);return m?Number(m[0]):999999999}function sortWavesByStoreAsc(list){return[...list].sort((a,b)=>storeSortNumber(a.store)-storeSortNumber(b.store)||String(a.store||'').localeCompare(String(b.store||''),'he'))}function locationParts(loc){const s=String(loc||'').trim().toUpperCase(),m=s.match(/^([A-Z]+)\s*[-_ ]?\s*(\d+)/);return m?{l:m[1],n:Number(m[2]),r:s}:{l:'ZZZ',n:999999,r:s}}function sortItemsByLocation(items){return[...(items||[])].sort((a,b)=>{const x=locationParts(a.location),y=locationParts(b.location);return x.l.localeCompare(y.l)||x.n-y.n||x.r.localeCompare(y.r)})}function counts(w){const c={total:0,done:0};(w.items||[]).forEach(i=>{c.total+=Number(i.qty||1);if(i.status!=='open')c.done+=Number(i.qty||1)});return c}function percentForWave(w){const c=counts(w);return c.total?Math.round(c.done/c.total*100):0}
function showPage(id){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('show',p.id===id));if(id==='importsPage')loadImports();if(id==='dashboardPage')renderDashboard();if(id==='personalStatusPage')renderPersonalStatus();if(id==='correctionsPage')renderCorrections()}async function boot(){const res=await api('/api/me').catch(()=>({user:null}));me=res.user;loginScreen.classList.toggle('hidden',!!me);appScreen.classList.toggle('hidden',!me);if(!me)return;document.body.classList.toggle('worker-mode',me.role==='worker');document.body.classList.toggle('admin-mode',me.role==='admin');meBox.innerHTML=`מחובר: <b>${esc(me.username)}</b><br>${me.role==='admin'?'מנהל':'עובד'}`;document.querySelectorAll('.admin-only').forEach(x=>x.style.display=me.role==='admin'?'block':'none');document.querySelectorAll('.worker-only').forEach(x=>x.style.display=me.role==='worker'?'block':'none');await refresh();showPage(me.role==='admin'?'dashboardPage':'workerPage')}async function login(){try{await api('/api/login',{method:'POST',body:JSON.stringify({username:loginUsername.value,code:loginCode.value})});await boot()}catch(e){alert(e.message)}}async function logout(){await api('/api/logout',{method:'POST'});location.reload()}async function refresh(){waves=await api('/api/waves');if(me.role==='admin'){users=await api('/api/users');analytics=await api('/api/analytics');renderUsers();renderAssign();renderStatus();renderAnalytics();renderDashboard()}else renderWorkerPage()}
function isPantsWave(w){return String(w.source_type||'').toLowerCase()==='pants'||String(w.source_label||'').includes('מכנס')||String(w.wave_no||'').includes('-P-')}async function setItemStatus(itemId,status,actualMix='',pickedModel=''){try{await api('/api/item/status',{method:'POST',body:JSON.stringify({itemId,status,actualMix,pickedModel})});await refresh()}catch(e){alert(e.message)}}function pickPants(itemId){const el=document.getElementById(`picked_model_${itemId}`),val=String(el?.value||'').trim();if(!/^\d{6}$/.test(val)){alert('מספר הספרות בדגם אינו תואם');el?.focus();return}setItemStatus(itemId,'picked','',val)}function pantsInput(i){return`<div class="pants-entry-line"><span class="pants-entry-label">הזן דגם</span><input id="picked_model_${i.id}" type="tel" inputmode="numeric" maxlength="6" value="${esc(i.picked_model||'')}" placeholder="6 ספרות" class="pants-entry-input" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,6)"/></div>`}function pantsActions(i){return`<div class="actions pants-actions-final"><button class="green" onclick="pickPants('${i.id}')">לוקט</button><button class="red" onclick="setItemStatus('${i.id}','not_found','',document.getElementById('picked_model_${i.id}')?.value||'')">אין מלאי</button><button class="gray" onclick="setItemStatus('${i.id}','open')">בטל סימון</button></div>`}function regularActions(i){return`<div class="actions"><button class="green" onclick="setItemStatus('${i.id}','picked')">לוקט</button><select id="mix_${i.id}" style="width:80px">${MIXES.map(m=>`<option>${m}</option>`).join('')}</select><button class="orange" onclick="setItemStatus('${i.id}','alt_mix',document.getElementById('mix_${i.id}').value)">לוקט מיקס אחר</button><button class="red" onclick="setItemStatus('${i.id}','not_found')">לא נמצא</button><button class="gray" onclick="setItemStatus('${i.id}','open')">בטל סימון</button></div>`}
function renderWorkerPage(){if(!document.getElementById('workerWaveSelect'))return;const selected=workerWaveSelect.value;workerWaveSelect.innerHTML=waves.map(w=>`<option value="${esc(w.id)}">${esc(w.wave_no)} | ${esc(w.source_label)} | ${esc(w.store)}</option>`).join('')||'<option value="__none__">אין גלי ליקוט</option>';const w=waves.find(x=>x.id===selected)||waves[0];if(!w){workerCards.innerHTML='';workerActions.innerHTML='';workerItems.innerHTML='<div class="panel">אין גלים משויכים כרגע.</div>';nextWave.innerHTML='';return}workerWaveSelect.value=w.id;const idx=waves.findIndex(x=>x.id===w.id),next=waves[idx+1];nextWave.innerHTML=next?`הגל הבא: <b>${esc(next.source_label)}</b> | <b>${esc(next.store)}</b> | ${next.items.length} שורות`:'אין גל הבא כרגע';const c=counts(w);workerCards.innerHTML=`<div class="card"><b>${esc(w.wave_no)}</b><span>גל</span></div><div class="card"><b>${esc(w.source_label)}</b><span>סוג גל</span></div><div class="card"><b>${esc(w.store)}</b><span>חנות</span></div><div class="card"><b>${c.total}</b><span>יחידות</span></div><div class="card"><b>${c.done}</b><span>טופלו</span></div><div class="card"><b>${c.total-c.done}</b><span>נשאר</span></div>`;workerActions.innerHTML=`<div class="panel actions"><button class="orange" onclick="palletFull('${w.id}')">משטח מלא</button><button class="green" onclick="completeWave('${w.id}')">ליקוט הושלם - סגור משטח</button></div>`;const items=sortItemsByLocation(w.items),pants=isPantsWave(w);workerItems.innerHTML=table(['מיקום','דגם','מיקס / מידה','כמות','סטטוס','פעולות'],items.map(i=>[esc(i.location||'ללא מיקום'),pants?`<div class="pants-model-clean"><div class="pants-required-clean">${esc(i.model)}</div>${pantsInput(i)}</div>`:esc(i.model),esc(i.mix||'A'),esc(i.qty||1),`${statusLabel(i.status)}${i.picked_model?`<br><span class="small">דגם שלוקט: ${esc(i.picked_model)}</span>`:''}`,pants?pantsActions(i):regularActions(i)]),items.map(i=>i.status))}async function completeWave(waveId){try{const r=await api('/api/wave/complete',{method:'POST',body:JSON.stringify({waveId})});alert(r.message||'ליקוט הושלם - סגור משטח');await refresh()}catch(e){alert(e.message)}}async function palletFull(waveId){try{const r=await api('/api/wave/pallet-full',{method:'POST',body:JSON.stringify({waveId})});alert('נוצר גל המשך: '+r.newWaveNo);await refresh()}catch(e){alert(e.message)}}
async function uploadPicking(){const files=[...pickingFiles.files];if(!files.length)return alert('בחר קבצים');const fd=new FormData();files.forEach(f=>fd.append('files',f));const res=await fetch('/api/upload/picking',{method:'POST',body:fd,credentials:'same-origin'}),d=await res.json();if(!res.ok)return alert(d.error||'שגיאה');uploadResult.innerHTML=`<div class="panel">נטענו ${d.added} שורות. נוצרו ${d.created} גלים. אוחדו ${d.merged}.<br>${(d.files||[]).map(f=>`${f.filename}: ${f.label} / ${f.rows} שורות`).join('<br>')}</div>`;await refresh()}async function uploadLocations(kind){const input=kind==='daily'?dailyLocations:melangeLocations;if(!input.files[0])return alert('בחר קובץ');const fd=new FormData();fd.append('file',input.files[0]);const res=await fetch(`/api/upload/locations/${kind}`,{method:'POST',body:fd,credentials:'same-origin'}),d=await res.json();if(!res.ok)return alert(d.error||'שגיאה');alert(`עודכנו ${d.count} מיקומים`);await refresh()}
async function createUser(){try{await api('/api/users',{method:'POST',body:JSON.stringify({username:newUsername.value,code:newCode.value,role:newRole.value})});newUsername.value='';newCode.value='';await refresh()}catch(e){alert(e.message)}}async function toggleUser(id,a){await api(`/api/users/${id}`,{method:'PATCH',body:JSON.stringify({active:!a})});await refresh()}async function editUser(id,n,c,r){const username=prompt('שם משתמש:',n);if(!username)return;const code=prompt('קוד כניסה:',c||'');if(!code)return;const role=prompt('הרשאה: worker או admin',r||'worker')||r;await api(`/api/users/${id}`,{method:'PATCH',body:JSON.stringify({username,code,role})});await refresh()}async function deleteUser(id,n){if(!confirm(`למחוק את ${n}?`))return;const res=await fetch(`/api/users/${id}`,{method:'DELETE',credentials:'same-origin'});const d=await res.json().catch(()=>({}));if(!res.ok)return alert(d.error||'שגיאה');await refresh()}function renderUsers(){if(!document.getElementById('usersTable'))return;usersTable.innerHTML=table(['שם משתמש','קוד','הרשאה','פעיל','פעולה'],users.map(u=>[esc(u.username),esc(u.code_plain),esc(u.role_label),isActive(u)?'כן':'לא',u.username==='admin'?'':`<div class="actions"><button class="gray" onclick="toggleUser(${u.id},${isActive(u)})">${isActive(u)?'השבת':'הפעל'}</button><button class="orange" onclick="editUser(${u.id},'${esc(u.username)}','${esc(u.code_plain)}','${esc(u.role)}')">ערוך</button><button class="red" onclick="deleteUser(${u.id},'${esc(u.username)}')">מחק</button></div>`]))}
function workerDropdown(id){const ws=users.filter(u=>isWorker(u)&&isActive(u));return`<select id="worker_for_${id}" style="min-width:150px">${ws.map(u=>`<option>${esc(u.username)}</option>`).join('')}</select>`}function rememberAssignCheck(cb){cb.checked?klcAssignSelectedWaves.add(cb.value):klcAssignSelectedWaves.delete(cb.value)}function toggleAllAssignWaves(s){document.querySelectorAll('.assign-wave-check').forEach(cb=>{cb.checked=s.checked;rememberAssignCheck(cb)})}async function bulkAssignSelectedWaves(){const username=document.getElementById('assignTopWorker')?.value||'',ids=[...klcAssignSelectedWaves];if(!username)return alert('יש לבחור עובד');if(!ids.length)return alert('לא נבחרו גלים');const r=await api('/api/assign/bulk',{method:'POST',body:JSON.stringify({username,waveIds:ids})});ids.forEach(id=>klcAssignSelectedWaves.delete(id));alert(`שויכו ${r.assigned} גלים`);await refresh()}async function assignWaveFromRow(id){const sel=document.getElementById(`worker_for_${id}`);await api('/api/assign',{method:'POST',body:JSON.stringify({waveId:id,username:sel.value})});await refresh()}function renderAssign(){if(!document.getElementById('assignTable'))return;const open=sortWavesByStoreAsc(waves).filter(w=>!['completed','pallet_full'].includes(w.status)&&!w.assigned_to),workers=users.filter(u=>isWorker(u)&&isActive(u));const top=`<div class="panel assign-bulk-bar"><select id="assignTopWorker">${workers.map(u=>`<option>${esc(u.username)}</option>`).join('')}</select><button onclick="bulkAssignSelectedWaves()">שייך</button><label class="bulk-check-label"><input type="checkbox" onchange="toggleAllAssignWaves(this)"/> סמן הכל</label></div>`;assignTable.innerHTML=top+table(['סימון','גל','סוג','חנות','סטטוס','עובד','שורות','שיוך בודד'],open.map(w=>[`<input type="checkbox" class="assign-wave-check" value="${esc(w.id)}" ${klcAssignSelectedWaves.has(w.id)?'checked':''} onchange="rememberAssignCheck(this)"/>`,esc(w.wave_no),esc(w.source_label),esc(w.store),statusLabel(w.status),esc(w.assigned_to||'לא שויך'),w.items.length,`<div class="actions">${workerDropdown(w.id)}<button onclick="assignWaveFromRow('${w.id}')">שייך</button></div>`]))}
function rememberStatusCheck(cb){cb.checked?klcStatusSelectedWaves.add(cb.value):klcStatusSelectedWaves.delete(cb.value)}function toggleAllStatusWaves(s){document.querySelectorAll('.status-wave-check').forEach(cb=>{cb.checked=s.checked;rememberStatusCheck(cb)})}async function bulkDeleteStatusWaves(){const ids=[...klcStatusSelectedWaves];if(!ids.length)return alert('לא נבחרו גלים');if(!confirm(`למחוק ${ids.length} גלים?`))return;const r=await api('/api/waves/bulk-delete',{method:'POST',body:JSON.stringify({waveIds:ids})});ids.forEach(id=>klcStatusSelectedWaves.delete(id));alert(`נמחקו ${r.deleted} גלים`);await refresh()}async function deleteWave(id,no){if(!confirm(`למחוק גל ${no}?`))return;const res=await fetch(`/api/waves/${id}`,{method:'DELETE',credentials:'same-origin'});if(!res.ok){const d=await res.json().catch(()=>({}));return alert(d.error||'שגיאה')}await refresh()}async function unassignWave(id){if(!confirm('להסיר שיוך?'))return;await api('/api/wave/unassign',{method:'POST',body:JSON.stringify({waveId:id})});await refresh()}function renderStatus(){if(!document.getElementById('statusTable'))return;const sorted=sortWavesByStoreAsc(waves),all=sorted.flatMap(w=>w.items),total=all.reduce((s,i)=>s+Number(i.qty||1),0),done=all.filter(i=>i.status!=='open').reduce((s,i)=>s+Number(i.qty||1),0);statusCards.innerHTML=`<div class="card"><b>${sorted.length}</b><span>גלים</span></div><div class="card"><b>${total}</b><span>יחידות</span></div><div class="card"><b>${done}</b><span>טופלו</span></div><div class="card"><b>${total-done}</b><span>נשאר</span></div>`;const top=`<div class="panel status-bulk-bar"><label class="bulk-check-label"><input type="checkbox" onchange="toggleAllStatusWaves(this)"/> סמן הכל</label><button class="red" onclick="bulkDeleteStatusWaves()">מחק מסומנים</button></div>`;statusTable.innerHTML=top+table(['סימון','גל','סוג','חנות','עובד','סטטוס','יחידות','טופלו','אחוז','פעולה'],sorted.map(w=>{const c=counts(w);return[`<input type="checkbox" class="status-wave-check" value="${esc(w.id)}" ${klcStatusSelectedWaves.has(w.id)?'checked':''} onchange="rememberStatusCheck(this)"/>`,esc(w.wave_no),esc(w.source_label),esc(w.store),esc(w.assigned_to||''),statusLabel(w.status),c.total,c.done,progress(percentForWave(w)),`<div class="actions">${w.assigned_to?`<button class="orange" onclick="unassignWave('${w.id}')">הסר שיוך</button>`:''}<button class="red" onclick="deleteWave('${w.id}','${esc(w.wave_no)}')">מחק שורה</button></div>`]}));unassignedWavesTable.innerHTML=table(['גל','סוג','חנות','סטטוס','שורות','פעולה'],sorted.filter(w=>!w.assigned_to&&!['completed','pallet_full'].includes(w.status)).map(w=>[esc(w.wave_no),esc(w.source_label),esc(w.store),statusLabel(w.status),w.items.length,`<button class="red" onclick="deleteWave('${w.id}','${esc(w.wave_no)}')">מחק שורה</button>`]));activeWavesTable.innerHTML=table(['גל','סוג','חנות','עובד','יחידות','טופלו','אחוז','פעולה'],sorted.filter(w=>w.assigned_to&&!['completed','pallet_full'].includes(w.status)).map(w=>{const c=counts(w);return[esc(w.wave_no),esc(w.source_label),esc(w.store),esc(w.assigned_to),c.total,c.done,progress(percentForWave(w)),`<button class="orange" onclick="unassignWave('${w.id}')">הסר שיוך</button>`]}))}
async function loadImports(){const rows=await api('/api/imports');importsTable.innerHTML=table(['קובץ','סוג','נטען','שורות','טופל','אחוז','סטטוס','פעולה'],rows.map(r=>[esc(r.filename),esc(r.source_label),formatIL(r.created_at),r.total_items||r.rows_count,`${r.done_items||0}/${r.total_items||0}`,progress(r.percent||0),r.completed?'לוקט במלואו':'פתוח',`<button class="red" onclick="deleteImport('${r.id}')">מחק קובץ</button>`]))}async function deleteImport(id){if(!confirm('למחוק קובץ?'))return;await fetch(`/api/imports/${id}`,{method:'DELETE',credentials:'same-origin'});await refresh();await loadImports()}
function exportAnalytics(){window.location=`/api/analytics/export?worker=${encodeURIComponent(filterWorker.value)}&status=${encodeURIComponent(filterStatus.value)}&sourceType=${encodeURIComponent(filterSourceType.value)}&dates=${encodeURIComponent(filterDates.value)}`}function renderAnalytics(){if(me?.role!=='admin'||!document.getElementById('filterWorker'))return;const old=filterWorker.value||'all';filterWorker.innerHTML=`<option value="all">כל העובדים</option>`+users.map(u=>`<option>${esc(u.username)}</option>`).join('');filterWorker.value=old;let rows=[...analytics];if(filterWorker.value!=='all')rows=rows.filter(r=>r.picked_by===filterWorker.value||r.assigned_to===filterWorker.value);if(filterStatus.value!=='all')rows=rows.filter(r=>r.status===filterStatus.value);if(filterSourceType.value!=='all')rows=rows.filter(r=>r.source_type===filterSourceType.value);const dates=filterDates.value.split(',').map(x=>x.trim()).filter(Boolean);if(dates.length)rows=rows.filter(r=>dates.some(d=>(r.picked_at||'').startsWith(d)));analyticsCards.innerHTML=`<div class="card"><b>${rows.length}</b><span>שורות</span></div><div class="card"><b>${rows.filter(r=>r.status==='picked').length}</b><span>לוקט</span></div><div class="card"><b>${rows.filter(r=>r.status==='not_found').length}</b><span>לא נמצא</span></div><div class="card"><b>${new Set(rows.map(r=>r.wave_id)).size}</b><span>גלים</span></div>`;const by={};rows.forEach(r=>{const n=r.picked_by||r.assigned_to||'לא שויך';if(!by[n])by[n]={rows:0,done:0,waves:new Set()};by[n].rows++;if(r.status!=='open')by[n].done++;by[n].waves.add(r.wave_id)});workerSummaryTable.innerHTML=table(['עובד','שורות','טופלו','גלים'],Object.entries(by).map(([n,o])=>[esc(n),o.rows,o.done,o.waves.size]));analyticsTable.innerHTML=table(['גל','סוג','חנות','עובד','דגם נדרש','דגם שלוקט','מיקס','כמות','מיקום','סטטוס','מיקס בפועל','תאריך'],rows.map(r=>[esc(r.wave_no),esc(r.source_label),esc(r.store),esc(r.picked_by||r.assigned_to||''),esc(r.model),esc(r.picked_model||''),esc(r.mix),r.qty,esc(r.location||''),statusLabel(r.status),esc(r.actual_mix||''),formatIL(r.picked_at)]),rows.map(r=>r.status))}
function groupRows(rows,keyFn){const out={};rows.forEach(r=>{const k=keyFn(r)||'לא ידוע';if(!out[k])out[k]={total:0,done:0,waves:new Set()};out[k].total++;if(r.status!=='open')out[k].done++;out[k].waves.add(r.wave_id)});const arr=Object.entries(out).map(([k,v])=>[esc(k),v.total,v.done,v.waves.size,progress(v.total?Math.round(v.done/v.total*100):0)]);const tr=arr.reduce((s,r)=>s+Number(r[1]),0),td=arr.reduce((s,r)=>s+Number(r[2]),0);arr.push(['<b>סה״כ</b>',`<b>${tr}</b>`,`<b>${td}</b>`,'',progress(tr?Math.round(td/tr*100):0)]);return arr}function renderDashboard(){if(me?.role!=='admin'||!document.getElementById('dashCards'))return;const old=dashWorker.value||'all';dashWorker.innerHTML=`<option value="all">כל העובדים</option>`+users.map(u=>`<option>${esc(u.username)}</option>`).join('');dashWorker.value=old;let rows=[...analytics];if(dashWorker.value!=='all')rows=rows.filter(r=>r.picked_by===dashWorker.value||r.assigned_to===dashWorker.value);if(dashDate.value)rows=rows.filter(r=>(r.picked_at||r.closed_at||'').startsWith(dashDate.value));if(dashStore.value)rows=rows.filter(r=>String(r.store||'').includes(dashStore.value));dashCards.innerHTML=`<div class="card"><b>${rows.length}</b><span>שורות</span></div><div class="card"><b>${rows.filter(r=>r.status!=='open').length}</b><span>טופלו</span></div><div class="card"><b>${rows.filter(r=>r.status==='not_found').length}</b><span>לא נמצא</span></div><div class="card"><b>${new Set(rows.map(r=>r.wave_id)).size}</b><span>גלים</span></div>`;dashByWorker.innerHTML=table(['עובד','שורות','טופלו','גלים','אחוז'],groupRows(rows,r=>r.picked_by||r.assigned_to||'לא שויך'));dashByStore.innerHTML=table(['חנות','שורות','טופלו','גלים','אחוז'],groupRows(rows,r=>r.store));dashByDate.innerHTML=table(['תאריך','שורות','טופלו','גלים','אחוז'],groupRows(rows,r=>shortDate(r.picked_at||r.closed_at)||'ללא תאריך'));dashWaves.innerHTML=table(['גל','סוג','חנות','מלקט','סטטוס','שורות','טופלו','אחוז'],sortWavesByStoreAsc(waves).map(w=>{const c=counts(w);return[`<span class="clickable" onclick="showDashWave('${w.id}')">${esc(w.wave_no)}</span>`,esc(w.source_label),esc(w.store),esc(w.assigned_to||'לא שויך'),statusLabel(w.status),c.total,c.done,progress(percentForWave(w))]}))}function showDashWave(id){const w=waves.find(x=>x.id===id);dashWaveDetails.innerHTML=w?`<div class="detailBox"><b>פרטי גל ${esc(w.wave_no)}</b><br>מלקט: ${esc(w.assigned_to||'לא שויך')}<br>סיום גל: ${w.status==='completed'?formatIL(w.closed_at):'טרם נסגר בליקוט הושלם'}<br>משטח מלא אינו נחשב סיום גל.</div>`:''}
async function renderPersonalStatus(){if(me?.role!=='worker')return;personalRows=await api('/api/my-performance').catch(()=>[]);let rows=[...personalRows];if(personalDate.value)rows=rows.filter(r=>(r.picked_at||'').startsWith(personalDate.value));const by={};rows.filter(r=>r.status!=='open').forEach(r=>{const k=(shortDate(r.picked_at)||'ללא תאריך')+'||'+r.store;if(!by[k])by[k]={date:shortDate(r.picked_at)||'ללא תאריך',store:r.store,rows:0,waves:new Set()};by[k].rows++;by[k].waves.add(r.wave_id)});const sr=Object.values(by).map(o=>[esc(o.date),`<span class="clickable" onclick="showPersonalStore('${esc(o.store)}')">${esc(o.store)}</span>`,o.rows,o.waves.size]);sr.push(['<b>סה״כ</b>',`<b>${new Set(Object.values(by).map(o=>o.store)).size} חנויות</b>`,`<b>${Object.values(by).reduce((s,o)=>s+o.rows,0)}</b>`,'']);personalByStore.innerHTML=table(['תאריך','חנות','שורות','משטחים'],sr);personalDailyPercent.innerHTML=table(['תאריך','שורות שלי','סה״כ יומי','אחוז'],groupRows(rows,r=>shortDate(r.picked_at)||'ללא תאריך').slice(0,10))}function showPersonalStore(store){const rows=personalRows.filter(r=>r.store===store&&r.status!=='open'),by={};rows.forEach(r=>{if(!by[r.wave_id])by[r.wave_id]={wave:r.wave_no,date:formatIL(r.closed_at||r.picked_at),rows:0};by[r.wave_id].rows++});personalPallets.innerHTML=table(['משטח/גל','תאריך','שורות'],Object.entries(by).map(([id,o])=>[`<span class="clickable" onclick="showPersonalWaveItems('${id}')">${esc(o.wave)}</span>`,esc(o.date),o.rows]))}function showPersonalWaveItems(id){personalPalletItems.innerHTML=table(['דגם','מיקס','כמות','סטטוס','מיקום'],personalRows.filter(r=>r.wave_id===id).map(r=>[esc(r.model),esc(r.mix),r.qty,statusLabel(r.status),esc(r.location||'')]))}
function renderCorrections(){if(me?.role!=='admin'||!document.getElementById('correctionStores'))return;let rows=[...analytics];if(correctionStoreFilter.value)rows=rows.filter(r=>String(r.store||'').includes(correctionStoreFilter.value));if(correctionDateFilter.value)rows=rows.filter(r=>(r.picked_at||'').startsWith(correctionDateFilter.value));const stores=[...new Set(rows.map(r=>r.store).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'he'));correctionStores.innerHTML=table(['חנות'],stores.map(s=>[`<span class="clickable" onclick="showCorrectionStore('${esc(s)}')">${esc(s)}</span>`]));correctionWaves.innerHTML='';correctionItems.innerHTML=''}function showCorrectionStore(store){const rows=analytics.filter(r=>r.store===store),ids=[...new Set(rows.map(r=>r.wave_id))];correctionWaves.innerHTML=table(['גל','סוג','מלקט','סטטוס','שורות'],ids.map(id=>{const w=waves.find(x=>x.id===id);return[`<span class="clickable" onclick="showCorrectionWave('${id}')">${esc(w?.wave_no||id)}</span>`,esc(w?.source_label||''),esc(w?.assigned_to||'לא שויך'),statusLabel(w?.status||''),rows.filter(r=>r.wave_id===id).length]}));correctionItems.innerHTML=''}function correctionSelect(id,st){return`<select id="corr_${id}"><option value="picked" ${st==='picked'?'selected':''}>לוקט</option><option value="alt_mix" ${st==='alt_mix'?'selected':''}>לוקט מיקס אחר</option><option value="not_found" ${st==='not_found'?'selected':''}>לא נמצא</option><option value="open" ${st==='open'?'selected':''}>פתוח</option></select><button onclick="saveCorrection('${id}')">שמור</button>`}function showCorrectionWave(id){const rows=analytics.filter(r=>r.wave_id===id);correctionItems.innerHTML=table(['דגם','מיקס','כמות','מיקום','סטטוס','תיקון'],rows.map(r=>[esc(r.model),esc(r.mix),r.qty,esc(r.location||''),statusLabel(r.status),correctionSelect(r.item_id,r.status)]),rows.map(r=>r.status))}async function saveCorrection(id){const st=document.getElementById(`corr_${id}`).value;await setItemStatus(id,st);analytics=await api('/api/analytics');renderCorrections()}
boot();setInterval(()=>{if(me)refresh()},15000);


// ===== KLC v2.1 Barcode scanner for pants waves =====
let klcBarcodeStream = null;
let klcBarcodeTimer = null;
let klcBarcodeTargetItemId = null;

function ensureBarcodeModal(){
  if(document.getElementById('barcodeModal')) return;
  const div = document.createElement('div');
  div.id = 'barcodeModal';
  div.className = 'barcode-modal hidden';
  div.innerHTML = `
    <div class="barcode-box">
      <h2>סריקת ברקוד</h2>
      <p>המצלמה פעילה רק במסך הזה ותיסגר מיד בסיום הסריקה או בלחיצה על ביטול.</p>
      <video id="barcodeVideo" playsinline muted></video>
      <div class="actions barcode-actions">
        <button class="gray" onclick="stopBarcodeScanner()">ביטול וסגירת מצלמה</button>
      </div>
      <div class="small">אם הסריקה לא זמינה במכשיר, אפשר להקליד ידנית בשדה הברקוד.</div>
    </div>`;
  document.body.appendChild(div);
}

async function startBarcodeScanner(itemId){
  klcBarcodeTargetItemId = itemId;
  ensureBarcodeModal();

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    alert('הדפדפן לא מאפשר גישה למצלמה. אפשר להקליד את הברקוד ידנית.');
    return;
  }

  if(!('BarcodeDetector' in window)){
    alert('סריקת ברקוד אוטומטית לא נתמכת בדפדפן הזה. אפשר להקליד את הברקוד ידנית.');
    return;
  }

  const modal = document.getElementById('barcodeModal');
  const video = document.getElementById('barcodeVideo');
  modal.classList.remove('hidden');

  try{
    klcBarcodeStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}, audio:false});
    video.srcObject = klcBarcodeStream;
    await video.play();

    const detector = new BarcodeDetector({formats:['code_128','ean_13','ean_8','code_39','itf','upc_a','upc_e','qr_code']});
    klcBarcodeTimer = setInterval(async ()=>{
      try{
        const codes = await detector.detect(video);
        if(codes && codes.length){
          const val = String(codes[0].rawValue || '').trim();
          if(val){
            const input = document.getElementById(`picked_model_${klcBarcodeTargetItemId}`);
            if(input) input.value = val;
            stopBarcodeScanner(false);
            alert('הברקוד נסרק ונשמר בשדה. כעת לחץ לוקט.');
          }
        }
      }catch(err){}
    }, 450);
  }catch(e){
    stopBarcodeScanner(false);
    alert('לא ניתנה הרשאה למצלמה או שהמצלמה אינה זמינה. אפשר להקליד את הברקוד ידנית.');
  }
}

function stopBarcodeScanner(showAlert=true){
  if(klcBarcodeTimer){ clearInterval(klcBarcodeTimer); klcBarcodeTimer = null; }
  if(klcBarcodeStream){
    klcBarcodeStream.getTracks().forEach(t=>t.stop());
    klcBarcodeStream = null;
  }
  const video = document.getElementById('barcodeVideo');
  if(video) video.srcObject = null;
  const modal = document.getElementById('barcodeModal');
  if(modal) modal.classList.add('hidden');
  klcBarcodeTargetItemId = null;
}

function pickPants(itemId){
  const el=document.getElementById(`picked_model_${itemId}`), val=String(el?.value||'').trim();
  if(!val){alert('חובה לסרוק או להזין ברקוד לפני סימון לוקט');el?.focus();return}
  setItemStatus(itemId,'picked','',val);
}

function pantsInput(i){
  return `<div class="pants-entry-line barcode-entry-line">
    <span class="pants-entry-label">ברקוד</span>
    <input id="picked_model_${i.id}" type="tel" inputmode="numeric" value="${esc(i.picked_model||'')}" placeholder="סרוק / הקלד" class="pants-entry-input barcode-input" />
    <button type="button" class="barcode-scan-btn" onclick="startBarcodeScanner('${i.id}')">סרוק</button>
  </div>`;
}

function pantsActions(i){
  return `<div class="actions pants-actions-final"><button class="green" onclick="pickPants('${i.id}')">לוקט</button><button class="red" onclick="setItemStatus('${i.id}','not_found','',document.getElementById('picked_model_${i.id}')?.value||'')">אין מלאי</button><button class="gray" onclick="setItemStatus('${i.id}','open')">בטל סימון</button></div>`;
}

function renderWorkerPage(){if(!document.getElementById('workerWaveSelect'))return;const selected=workerWaveSelect.value;workerWaveSelect.innerHTML=waves.map(w=>`<option value="${esc(w.id)}">${esc(w.wave_no)} | ${esc(w.source_label)} | ${esc(w.store)}</option>`).join('')||'<option value="__none__">אין גלי ליקוט</option>';const w=waves.find(x=>x.id===selected)||waves[0];if(!w){workerCards.innerHTML='';workerActions.innerHTML='';workerItems.innerHTML='<div class="panel">אין גלים משויכים כרגע.</div>';nextWave.innerHTML='';return}workerWaveSelect.value=w.id;const idx=waves.findIndex(x=>x.id===w.id),next=waves[idx+1];nextWave.innerHTML=next?`הגל הבא: <b>${esc(next.source_label)}</b> | <b>${esc(next.store)}</b> | ${next.items.length} שורות`:'אין גל הבא כרגע';const c=counts(w);workerCards.innerHTML=`<div class="card"><b>${esc(w.wave_no)}</b><span>גל</span></div><div class="card"><b>${esc(w.source_label)}</b><span>סוג גל</span></div><div class="card"><b>${esc(w.store)}</b><span>חנות</span></div><div class="card"><b>${c.total}</b><span>יחידות</span></div><div class="card"><b>${c.done}</b><span>טופלו</span></div><div class="card"><b>${c.total-c.done}</b><span>נשאר</span></div>`;workerActions.innerHTML=`<div class="panel actions"><button class="orange" onclick="palletFull('${w.id}')">משטח מלא</button><button class="green" onclick="completeWave('${w.id}')">ליקוט הושלם - סגור משטח</button></div>`;const items=sortItemsByLocation(w.items),pants=isPantsWave(w);workerItems.innerHTML=table(['מיקום','דגם','מיקס / מידה','כמות','סטטוס','פעולות'],items.map(i=>[esc(i.location||'ללא מיקום'),pants?`<div class="pants-model-clean"><div class="pants-required-clean">${esc(i.model)}</div>${pantsInput(i)}</div>`:esc(i.model),esc(i.mix||'A'),esc(i.qty||1),`${statusLabel(i.status)}${i.picked_model?`<br><span class="small">ברקוד שנסרק: ${esc(i.picked_model)}</span>`:''}`,pants?pantsActions(i):regularActions(i)]),items.map(i=>i.status))}

function renderAnalytics(){if(me?.role!=='admin'||!document.getElementById('filterWorker'))return;const old=filterWorker.value||'all';filterWorker.innerHTML=`<option value="all">כל העובדים</option>`+users.map(u=>`<option>${esc(u.username)}</option>`).join('');filterWorker.value=old;let rows=[...analytics];if(filterWorker.value!=='all')rows=rows.filter(r=>r.picked_by===filterWorker.value||r.assigned_to===filterWorker.value);if(filterStatus.value!=='all')rows=rows.filter(r=>r.status===filterStatus.value);if(filterSourceType.value!=='all')rows=rows.filter(r=>r.source_type===filterSourceType.value);const dates=filterDates.value.split(',').map(x=>x.trim()).filter(Boolean);if(dates.length)rows=rows.filter(r=>dates.some(d=>(r.picked_at||'').startsWith(d)));analyticsCards.innerHTML=`<div class="card"><b>${rows.length}</b><span>שורות</span></div><div class="card"><b>${rows.filter(r=>r.status==='picked').length}</b><span>לוקט</span></div><div class="card"><b>${rows.filter(r=>r.status==='not_found').length}</b><span>לא נמצא</span></div><div class="card"><b>${new Set(rows.map(r=>r.wave_id)).size}</b><span>גלים</span></div>`;const by={};rows.forEach(r=>{const n=r.picked_by||r.assigned_to||'לא שויך';if(!by[n])by[n]={rows:0,done:0,waves:new Set()};by[n].rows++;if(r.status!=='open')by[n].done++;by[n].waves.add(r.wave_id)});workerSummaryTable.innerHTML=table(['עובד','שורות','טופלו','גלים'],Object.entries(by).map(([n,o])=>[esc(n),o.rows,o.done,o.waves.size]));analyticsTable.innerHTML=table(['גל','סוג','חנות','עובד','דגם נדרש','ברקוד שנסרק','מיקס','כמות','מיקום','סטטוס','מיקס בפועל','תאריך'],rows.map(r=>[esc(r.wave_no),esc(r.source_label),esc(r.store),esc(r.picked_by||r.assigned_to||''),esc(r.model),esc(r.picked_model||''),esc(r.mix),r.qty,esc(r.location||''),statusLabel(r.status),esc(r.actual_mix||''),formatIL(r.picked_at)]),rows.map(r=>r.status))}


// ===== KLC v2.1.1 full override: barcode persists, any length =====
window.klcBarcodeDrafts = window.klcBarcodeDrafts || {};

function klcGetBarcodeValue(itemId){
  const el = document.getElementById(`picked_model_${itemId}`) || document.getElementById(`barcode_${itemId}`);
  return String(el?.value || window.klcBarcodeDrafts[itemId] || "").trim();
}

function klcSetBarcodeValue(itemId, value){
  const val = String(value || "").trim();
  window.klcBarcodeDrafts[itemId] = val;
  const el1 = document.getElementById(`picked_model_${itemId}`);
  const el2 = document.getElementById(`barcode_${itemId}`);
  if(el1) el1.value = val;
  if(el2) el2.value = val;
}

async function setItemStatus(itemId,status,actualMix='',pickedModel=''){
  try{
    if(status === 'picked' || status === 'not_found' || status === 'open'){
      const barcode = pickedModel || klcGetBarcodeValue(itemId);
      await api('/api/item/status_barcode',{method:'POST',body:JSON.stringify({itemId,status,actualMix,barcode})});
    }else{
      await api('/api/item/status',{method:'POST',body:JSON.stringify({itemId,status,actualMix,pickedModel})});
    }
    if(status === 'open') delete window.klcBarcodeDrafts[itemId];
    await refresh();
  }catch(e){ alert(e.message || 'לא ניתן לשמור את השורה'); }
}

function pickPants(itemId){
  const val = klcGetBarcodeValue(itemId);
  if(!val){
    const el = document.getElementById(`picked_model_${itemId}`) || document.getElementById(`barcode_${itemId}`);
    alert('חובה לסרוק או להזין ברקוד לפני סימון לוקט');
    if(el) el.focus();
    return;
  }
  setItemStatus(itemId,'picked','',val);
}

function pantsInput(i){
  const saved = window.klcBarcodeDrafts[i.id] || i.picked_model || '';
  return `<div class="pants-entry-line barcode-entry-line">
    <span class="pants-entry-label">ברקוד</span>
    <input id="picked_model_${i.id}" type="tel" inputmode="numeric" value="${esc(saved)}" placeholder="סרוק / הזן ברקוד" class="pants-entry-input barcode-entry-input" oninput="klcSetBarcodeValue('${i.id}', this.value)" />
    <button type="button" class="barcode-scan-btn scan-btn" onclick="startBarcodeScanner('${i.id}')">סרוק</button>
  </div>`;
}

function pantsActions(i){
  return `<div class="actions pants-actions-final">
    <button class="green" onclick="pickPants('${i.id}')">לוקט</button>
    <button class="red" onclick="setItemStatus('${i.id}','not_found','',klcGetBarcodeValue('${i.id}'))">אין מלאי</button>
    <button class="gray" onclick="setItemStatus('${i.id}','open')">בטל סימון</button>
  </div>`;
}

// Override scanner so scanned barcode is also stored in local draft before auto-refresh.
if(typeof startBarcodeScanner === 'function'){
  const klcOriginalStartBarcodeScanner = startBarcodeScanner;
  startBarcodeScanner = async function(itemId){
    window.klcCurrentScanTarget = itemId;
    return klcOriginalStartBarcodeScanner(itemId);
  }
}

function klcStoreVisibleBarcodeInputs(){
  document.querySelectorAll("[id^='picked_model_'], [id^='barcode_']").forEach(el=>{
    const id = el.id.replace('picked_model_','').replace('barcode_','');
    if(id && el.value) window.klcBarcodeDrafts[id] = el.value;
  });
}
setInterval(klcStoreVisibleBarcodeInputs, 300);

// If the built-in scanner updates the input value directly, this interval catches it.
// Also improves behavior after detector writes the value and the 15-sec refresh redraws the screen.


// ===== KLC v2.2 - clean wave actions + admin code edit =====
window.klcBarcodeDrafts = window.klcBarcodeDrafts || {};

function klcWaveType(w){
  const t=String(w?.source_type||"").toLowerCase(), label=String(w?.source_label||""), no=String(w?.wave_no||"");
  if(t==="pants"||label.includes("מכנס")||no.includes("-P-")) return "pants";
  if(t==="daily"||label.includes("יומי")||no.includes("-D-")) return "daily";
  if(t==="melange"||label.includes("מלאנז")||label.includes("מלנז")||no.includes("-M-")) return "melange";
  return t||"regular";
}
function klcGetBarcodeValue(itemId){
  const el=document.getElementById(`picked_model_${itemId}`)||document.getElementById(`barcode_${itemId}`);
  return String(el?.value||window.klcBarcodeDrafts[itemId]||"").trim();
}
function klcSetBarcodeValue(itemId,value){
  const val=String(value||"").trim();
  window.klcBarcodeDrafts[itemId]=val;
  const el=document.getElementById(`picked_model_${itemId}`)||document.getElementById(`barcode_${itemId}`);
  if(el) el.value=val;
}
async function klcSaveItemStatus(itemId,status,actualMix="",barcode=""){
  try{
    if(barcode || status==="picked" || status==="not_found" || status==="open"){
      await api("/api/item/status_barcode_v22",{method:"POST",body:JSON.stringify({itemId,status,actualMix,barcode})});
    }else{
      await api("/api/item/status",{method:"POST",body:JSON.stringify({itemId,status,actualMix,pickedModel:""})});
    }
    if(status==="open") delete window.klcBarcodeDrafts[itemId];
    await refresh();
  }catch(e){ alert(e.message||"לא ניתן לשמור את השורה"); }
}
async function setItemStatus(itemId,status,actualMix="",pickedModel=""){
  return klcSaveItemStatus(itemId,status,actualMix,pickedModel);
}
function klcPickPants(itemId){
  const barcode=klcGetBarcodeValue(itemId);
  if(!barcode){
    const el=document.getElementById(`picked_model_${itemId}`)||document.getElementById(`barcode_${itemId}`);
    alert("חובה לסרוק או להזין ברקוד לפני סימון לוקט");
    if(el) el.focus();
    return;
  }
  klcSaveItemStatus(itemId,"picked","",barcode);
}
function klcPantsInput(i){
  const saved=window.klcBarcodeDrafts[i.id]||i.picked_model||"";
  return `<div class="pants-entry-line barcode-entry-line">
    <span class="pants-entry-label">ברקוד</span>
    <input id="picked_model_${i.id}" type="tel" inputmode="numeric" value="${esc(saved)}" placeholder="סרוק / הזן ברקוד" class="pants-entry-input barcode-entry-input" oninput="klcSetBarcodeValue('${i.id}',this.value)" />
    <button type="button" class="barcode-scan-btn scan-btn" onclick="klcStartScanSafe('${i.id}')">סרוק</button>
  </div>`;
}
function klcPantsActions(i){
  return `<div class="actions pants-actions-final">
    <button class="green" onclick="klcPickPants('${i.id}')">לוקט</button>
    <button class="red" onclick="klcSaveItemStatus('${i.id}','not_found','',klcGetBarcodeValue('${i.id}'))">אין מלאי</button>
    <button class="gray" onclick="klcSaveItemStatus('${i.id}','open')">בטל סימון</button>
  </div>`;
}
function klcRegularActions(i){
  return `<div class="actions regular-actions-final">
    <button class="green" onclick="klcSaveItemStatus('${i.id}','picked')">לוקט</button>
    <select id="mix_${i.id}" style="width:90px">${MIXES.map(m=>`<option>${m}</option>`).join("")}</select>
    <button class="orange" onclick="klcSaveItemStatus('${i.id}','alt_mix',document.getElementById('mix_${i.id}').value)">לוקט מיקס אחר</button>
    <button class="red" onclick="klcSaveItemStatus('${i.id}','not_found')">לא נמצא</button>
    <button class="gray" onclick="klcSaveItemStatus('${i.id}','open')">בטל סימון</button>
  </div>`;
}
async function klcStartScanSafe(itemId){
  window.klcCurrentScanTarget=itemId;
  if(typeof startBarcodeScanner==="function") return startBarcodeScanner(itemId);
  if(typeof openBarcodeScanner==="function") return openBarcodeScanner(itemId);
  if(typeof scanBarcode==="function") return scanBarcode(itemId);
  alert("סורק הברקוד לא זמין בדפדפן הזה. אפשר להזין ידנית.");
}
setInterval(()=>{document.querySelectorAll("[id^='picked_model_'],[id^='barcode_']").forEach(el=>{const id=el.id.replace("picked_model_","").replace("barcode_","");if(id&&el.value)window.klcBarcodeDrafts[id]=el.value;});},300);

function renderWorkerPage(){
  if(!document.getElementById("workerWaveSelect"))return;
  const selectedId=workerWaveSelect.value;
  workerWaveSelect.innerHTML=waves.map(w=>`<option value="${esc(w.id)}">${esc(w.wave_no)} | ${esc(w.source_label)} | ${esc(w.store)}</option>`).join("")||"<option value='__none__'>אין גלי ליקוט</option>";
  const w=waves.find(x=>x.id===selectedId)||waves[0];
  if(!w){workerCards.innerHTML="";workerActions.innerHTML="";workerItems.innerHTML=`<div class="panel">אין גלים משויכים כרגע.</div>`;nextWave.innerHTML="";return;}
  workerWaveSelect.value=w.id;
  const idx=waves.findIndex(x=>x.id===w.id), next=waves[idx+1];
  nextWave.innerHTML=next?`הגל הבא: <b>${esc(next.source_label)}</b> | <b>${esc(next.store)}</b> | ${next.items.length} שורות`:"אין גל הבא כרגע";
  const c=counts(w);
  workerCards.innerHTML=`<div class="card"><b>${esc(w.wave_no)}</b><span>גל</span></div><div class="card"><b>${esc(w.source_label)}</b><span>סוג גל</span></div><div class="card"><b>${esc(w.store)}</b><span>חנות</span></div><div class="card"><b>${c.total}</b><span>יחידות</span></div><div class="card"><b>${c.done}</b><span>טופלו</span></div><div class="card"><b>${c.total-c.done}</b><span>נשאר</span></div>`;
  workerActions.innerHTML=`<div class="panel actions"><button class="orange" onclick="palletFull('${w.id}')">משטח מלא</button><button class="green" onclick="completeWave('${w.id}')">ליקוט הושלם - סגור משטח</button></div>`;
  const sortedItems=typeof sortItemsByLocation==="function"?sortItemsByLocation(w.items):(w.items||[]);
  const waveType=klcWaveType(w);
  workerItems.innerHTML=table(["מיקום","דגם","מיקס / מידה","כמות","סטטוס","פעולות"],
    sortedItems.map(i=>[
      esc(i.location||"ללא מיקום"),
      waveType==="pants"?`<div class="pants-model-clean"><div class="pants-required-clean">${esc(i.model)}</div>${klcPantsInput(i)}</div>`:esc(i.model),
      esc(i.mix||"A"),
      esc(i.qty||1),
      `${statusLabel(i.status)}${i.picked_model?`<br><span class="small">${waveType==="pants"?"ברקוד":"דגם"}: ${esc(i.picked_model)}</span>`:""}`,
      waveType==="pants"?klcPantsActions(i):klcRegularActions(i)
    ]),
    sortedItems.map(i=>i.status)
  );
}

async function changeAdminCode(userId){
  const code=prompt("הזן קוד כניסה חדש ל-ADMIN:");
  if(!code)return;
  const confirmCode=prompt("הקלד שוב את הקוד החדש:");
  if(code!==confirmCode){alert("הקודים אינם תואמים");return;}
  try{
    await api(`/api/users/${userId}`,{method:"PATCH",body:JSON.stringify({code})});
    alert("קוד ADMIN עודכן בהצלחה");
    await refresh();
  }catch(e){alert(e.message||"לא ניתן לעדכן קוד ADMIN");}
}
function renderUsers(){
  if(!document.getElementById("usersTable"))return;
  usersTable.innerHTML=table(["שם משתמש","קוד","הרשאה","פעיל","פעולה"],
    users.map(u=>{
      const admin=String(u.username).toLowerCase()==="admin";
      const actions=admin
        ? `<button class="orange" onclick="changeAdminCode(${u.id})">שנה קוד ADMIN</button>`
        : `<div class="actions"><button class="gray" onclick="toggleUser(${u.id},${isActive(u)})">${isActive(u)?"השבת":"הפעל"}</button><button class="orange" onclick="editUser(${u.id},'${esc(u.username)}','${esc(u.code_plain)}','${esc(u.role)}')">ערוך</button><button class="red" onclick="deleteUser(${u.id},'${esc(u.username)}')">מחק</button></div>`;
      return [esc(u.username), admin?"********":esc(u.code_plain), esc(u.role_label), isActive(u)?"כן":"לא", actions];
    })
  );
}
setTimeout(()=>{if(me?.role==="worker")renderWorkerPage();},500);
setTimeout(()=>{if(me?.role==="worker")renderWorkerPage();},1500);


// ===== KLC v2.3 - סורק ברקוד משופר למחסן =====
// מצלמה נפתחת רק בלחיצה על "סרוק", ונסגרת מיד בסריקה/ביטול.
// אין שמירת תמונה/וידאו. נשמר רק ערך הברקוד.

let klcBarcodeStreamV23 = null;
let klcBarcodeTimerV23 = null;
let klcBarcodeTargetItemIdV23 = null;
let klcBarcodeDetectorV23 = null;
let klcLastDetectedV23 = "";
let klcStableDetectedCountV23 = 0;
let klcBarcodeCanvasV23 = null;
let klcBarcodeCtxV23 = null;

function klcEnsureBarcodeModalV23(){
  let modal = document.getElementById("barcodeModal");
  if(modal) return modal;

  modal = document.createElement("div");
  modal.id = "barcodeModal";
  modal.className = "barcode-modal hidden";
  modal.innerHTML = `
    <div class="barcode-box barcode-box-v23">
      <h2>סריקת ברקוד</h2>
      <p>כוון את הברקוד למרכז המסגרת. מומלץ לקרב את הטלפון עד שהקווים ממלאים את המסגרת.</p>

      <div class="barcode-video-wrap">
        <video id="barcodeVideo" playsinline muted autoplay></video>
        <div class="barcode-guide"></div>
        <div id="barcodeScanStatus" class="barcode-scan-status">מחפש ברקוד...</div>
      </div>

      <div class="barcode-controls">
        <label id="barcodeZoomWrap" class="barcode-zoom hidden">
          זום
          <input id="barcodeZoom" type="range" min="1" max="1" step="0.1" value="1" />
        </label>
        <button id="barcodeTorchBtn" class="orange hidden" onclick="klcToggleTorchV23()">פנס</button>
      </div>

      <div class="actions barcode-actions">
        <button class="gray" onclick="stopBarcodeScanner()">ביטול וסגירת מצלמה</button>
      </div>

      <div class="small">
        אבטחה: המצלמה פעילה רק במסך זה. בסיום הסריקה או ביטול, זרם המצלמה נסגר.
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

async function klcApplyCameraEnhancementsV23(){
  const track = klcBarcodeStreamV23?.getVideoTracks?.()[0];
  if(!track) return;

  const caps = track.getCapabilities ? track.getCapabilities() : {};
  const settings = track.getSettings ? track.getSettings() : {};

  // פוקוס רציף אם נתמך
  try{
    if(caps.focusMode && caps.focusMode.includes("continuous")){
      await track.applyConstraints({advanced:[{focusMode:"continuous"}]});
    }
  }catch(e){}

  // זום אם נתמך
  const zoomWrap = document.getElementById("barcodeZoomWrap");
  const zoomInput = document.getElementById("barcodeZoom");
  if(caps.zoom && zoomInput && zoomWrap){
    zoomWrap.classList.remove("hidden");
    zoomInput.min = caps.zoom.min || 1;
    zoomInput.max = caps.zoom.max || 1;
    zoomInput.step = caps.zoom.step || 0.1;
    const targetZoom = Math.min(caps.zoom.max || 1, Math.max(caps.zoom.min || 1, (settings.zoom || 1) + 1));
    zoomInput.value = targetZoom;
    try{ await track.applyConstraints({advanced:[{zoom: Number(targetZoom)}]}); }catch(e){}
    zoomInput.oninput = async ()=>{
      try{ await track.applyConstraints({advanced:[{zoom: Number(zoomInput.value)}]}); }catch(e){}
    };
  }else if(zoomWrap){
    zoomWrap.classList.add("hidden");
  }

  // פנס אם נתמך
  const torchBtn = document.getElementById("barcodeTorchBtn");
  if(torchBtn && caps.torch){
    torchBtn.classList.remove("hidden");
    torchBtn.dataset.torch = "off";
  }else if(torchBtn){
    torchBtn.classList.add("hidden");
  }
}

async function klcToggleTorchV23(){
  const track = klcBarcodeStreamV23?.getVideoTracks?.()[0];
  if(!track) return;
  const btn = document.getElementById("barcodeTorchBtn");
  const on = btn?.dataset?.torch !== "on";
  try{
    await track.applyConstraints({advanced:[{torch:on}]});
    if(btn){
      btn.dataset.torch = on ? "on" : "off";
      btn.textContent = on ? "כבה פנס" : "פנס";
    }
  }catch(e){
    alert("פנס לא נתמך במכשיר הזה");
  }
}

function klcSetScanStatusV23(text){
  const el = document.getElementById("barcodeScanStatus");
  if(el) el.textContent = text;
}

function klcAcceptBarcodeV23(raw){
  const val = String(raw || "").trim();
  if(!val) return;

  // דרישת יציבות: אותו ברקוד מזוהה פעמיים, כדי למנוע קריאה שגויה.
  if(val === klcLastDetectedV23){
    klcStableDetectedCountV23++;
  }else{
    klcLastDetectedV23 = val;
    klcStableDetectedCountV23 = 1;
  }

  klcSetScanStatusV23(`זוהה: ${val}`);

  if(klcStableDetectedCountV23 < 2) return;

  const itemId = klcBarcodeTargetItemIdV23 || window.klcCurrentScanTarget;
  if(itemId){
    if(typeof klcSetBarcodeValue === "function") klcSetBarcodeValue(itemId, val);
    const input = document.getElementById(`picked_model_${itemId}`) || document.getElementById(`barcode_${itemId}`);
    if(input) input.value = val;
  }

  stopBarcodeScanner(false);
  alert("הברקוד נסרק ונשמר בשדה. כעת לחץ לוקט.");
}

async function klcDetectFrameV23(video){
  if(!klcBarcodeDetectorV23 || !video || video.readyState < 2) return;

  // ניסיון 1: זיהוי ישיר מהווידאו
  try{
    const codes = await klcBarcodeDetectorV23.detect(video);
    if(codes && codes.length){
      klcAcceptBarcodeV23(codes[0].rawValue);
      return;
    }
  }catch(e){}

  // ניסיון 2: חיתוך מרכז התמונה והגדלה על Canvas.
  // זה עוזר לברקודים קטנים כמו במדבקת מכנסיים.
  try{
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if(!vw || !vh) return;

    if(!klcBarcodeCanvasV23){
      klcBarcodeCanvasV23 = document.createElement("canvas");
      klcBarcodeCtxV23 = klcBarcodeCanvasV23.getContext("2d", {willReadFrequently:true});
    }

    // אזור מרכזי רחב, כי הברקוד לרוב אופקי/אנכי במרכז המסך
    const cropW = Math.floor(vw * 0.72);
    const cropH = Math.floor(vh * 0.42);
    const sx = Math.floor((vw - cropW) / 2);
    const sy = Math.floor((vh - cropH) / 2);

    klcBarcodeCanvasV23.width = 1280;
    klcBarcodeCanvasV23.height = 520;
    klcBarcodeCtxV23.drawImage(video, sx, sy, cropW, cropH, 0, 0, klcBarcodeCanvasV23.width, klcBarcodeCanvasV23.height);

    const codes2 = await klcBarcodeDetectorV23.detect(klcBarcodeCanvasV23);
    if(codes2 && codes2.length){
      klcAcceptBarcodeV23(codes2[0].rawValue);
      return;
    }
  }catch(e){}
}

// שם הפונקציה נשאר זהה כדי שכל הכפתורים הקיימים ימשיכו לעבוד.
async function startBarcodeScanner(itemId){
  klcBarcodeTargetItemIdV23 = itemId;
  window.klcCurrentScanTarget = itemId;
  klcLastDetectedV23 = "";
  klcStableDetectedCountV23 = 0;

  const modal = klcEnsureBarcodeModalV23();

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    alert("הדפדפן לא מאפשר גישה למצלמה.");
    return;
  }

  if(!("BarcodeDetector" in window)){
    alert("סריקת ברקוד אוטומטית לא נתמכת בדפדפן הזה.");
    return;
  }

  modal.classList.remove("hidden");
  klcSetScanStatusV23("פותח מצלמה...");

  try{
    const video = document.getElementById("barcodeVideo");

    klcBarcodeStreamV23 = await navigator.mediaDevices.getUserMedia({
      video:{
        facingMode:{ideal:"environment"},
        width:{ideal:1920},
        height:{ideal:1080},
        frameRate:{ideal:30}
      },
      audio:false
    });

    video.srcObject = klcBarcodeStreamV23;
    await video.play();

    await klcApplyCameraEnhancementsV23();

    klcBarcodeDetectorV23 = new BarcodeDetector({
      formats:[
        "ean_13",
        "ean_8",
        "upc_a",
        "upc_e",
        "code_128",
        "code_39",
        "code_93",
        "itf",
        "codabar",
        "qr_code"
      ]
    });

    klcSetScanStatusV23("מחפש ברקוד...");

    if(klcBarcodeTimerV23) clearInterval(klcBarcodeTimerV23);
    klcBarcodeTimerV23 = setInterval(()=>klcDetectFrameV23(video), 160);

  }catch(e){
    stopBarcodeScanner(false);
    alert("לא ניתנה הרשאה למצלמה או שהמצלמה אינה זמינה.");
  }
}

function stopBarcodeScanner(showAlert=true){
  if(klcBarcodeTimerV23){
    clearInterval(klcBarcodeTimerV23);
    klcBarcodeTimerV23 = null;
  }

  if(klcBarcodeStreamV23){
    klcBarcodeStreamV23.getTracks().forEach(t=>t.stop());
    klcBarcodeStreamV23 = null;
  }

  const video = document.getElementById("barcodeVideo");
  if(video) video.srcObject = null;

  const modal = document.getElementById("barcodeModal");
  if(modal) modal.classList.add("hidden");

  klcBarcodeTargetItemIdV23 = null;
  window.klcCurrentScanTarget = null;
  klcBarcodeDetectorV23 = null;
  klcLastDetectedV23 = "";
  klcStableDetectedCountV23 = 0;
}

// תאימות לשמות אחרים אם קיימים בקוד
function openBarcodeScanner(itemId){ return startBarcodeScanner(itemId); }
function scanBarcode(itemId){ return startBarcodeScanner(itemId); }

// ===== KLC v2.4 - צבעי שורות + שמירת מיקס + תיקוני שורות עם מיקס =====
function klcStatusRowClass(status){
  if(status === "picked") return "picked picked-light";
  if(status === "alt_mix") return "alt_mix alt-mix-light";
  if(status === "not_found") return "not_found not-found-light";
  return "";
}
function klcRegularActions(i){
  const selectedMix = i.actual_mix || i.mix || "A";
  return `<div class="actions regular-actions-final">
    <button class="green" onclick="klcSaveItemStatus('${i.id}','picked')">לוקט</button>
    <select id="mix_${i.id}" style="width:90px">${MIXES.map(m=>`<option value="${m}" ${m===selectedMix?"selected":""}>${m}</option>`).join("")}</select>
    <button class="orange" onclick="klcSaveItemStatus('${i.id}','alt_mix',document.getElementById('mix_${i.id}').value)">לוקט מיקס אחר</button>
    <button class="red" onclick="klcSaveItemStatus('${i.id}','not_found')">לא נמצא</button>
    <button class="gray" onclick="klcSaveItemStatus('${i.id}','open')">בטל סימון</button>
  </div>`;
}
function renderWorkerPage(){
  if(!document.getElementById("workerWaveSelect"))return;
  const selectedId=workerWaveSelect.value;
  workerWaveSelect.innerHTML=waves.map(w=>`<option value="${esc(w.id)}">${esc(w.wave_no)} | ${esc(w.source_label)} | ${esc(w.store)}</option>`).join("")||"<option value='__none__'>אין גלי ליקוט</option>";
  const w=waves.find(x=>x.id===selectedId)||waves[0];
  if(!w){workerCards.innerHTML="";workerActions.innerHTML="";workerItems.innerHTML=`<div class="panel">אין גלים משויכים כרגע.</div>`;nextWave.innerHTML="";return}
  workerWaveSelect.value=w.id;
  const idx=waves.findIndex(x=>x.id===w.id),next=waves[idx+1];
  nextWave.innerHTML=next?`הגל הבא: <b>${esc(next.source_label)}</b> | <b>${esc(next.store)}</b> | ${next.items.length} שורות`:"אין גל הבא כרגע";
  const c=counts(w);
  workerCards.innerHTML=`<div class="card"><b>${esc(w.wave_no)}</b><span>גל</span></div><div class="card"><b>${esc(w.source_label)}</b><span>סוג גל</span></div><div class="card"><b>${esc(w.store)}</b><span>חנות</span></div><div class="card"><b>${c.total}</b><span>יחידות</span></div><div class="card"><b>${c.done}</b><span>טופלו</span></div><div class="card"><b>${c.total-c.done}</b><span>נשאר</span></div>`;
  workerActions.innerHTML=`<div class="panel actions"><button class="orange" onclick="palletFull('${w.id}')">משטח מלא</button><button class="green" onclick="completeWave('${w.id}')">ליקוט הושלם - סגור משטח</button></div>`;
  const sortedItems=typeof sortItemsByLocation==="function"?sortItemsByLocation(w.items):(w.items||[]);
  const waveType=typeof klcWaveType==="function"?klcWaveType(w):(isPantsWave(w)?"pants":"regular");
  workerItems.innerHTML=table(["מיקום","דגם","מיקס / מידה","כמות","סטטוס","פעולות"],
    sortedItems.map(i=>[
      esc(i.location||"ללא מיקום"),
      waveType==="pants"?`<div class="pants-model-clean"><div class="pants-required-clean">${esc(i.model)}</div>${klcPantsInput(i)}</div>`:esc(i.model),
      esc(i.mix||"A"),
      esc(i.qty||1),
      `${statusLabel(i.status)}${i.actual_mix?`<br><span class="small">מיקס שלוקט: ${esc(i.actual_mix)}</span>`:""}${i.picked_model?`<br><span class="small">${waveType==="pants"?"ברקוד":"דגם"}: ${esc(i.picked_model)}</span>`:""}`,
      waveType==="pants"?klcPantsActions(i):klcRegularActions(i)
    ]),
    sortedItems.map(i=>klcStatusRowClass(i.status))
  );
}
function correctionMixSelect(id, actualMix){
  const selected=actualMix||"A";
  return `<select id="corr_mix_${id}" style="min-width:90px">${MIXES.map(m=>`<option value="${m}" ${m===selected?"selected":""}>${m}</option>`).join("")}</select>`;
}
function correctionSelect(id, st, actualMix=""){
  return `<div class="actions correction-actions">
    <select id="corr_${id}" onchange="klcToggleCorrectionMix('${id}')">
      <option value="picked" ${st==="picked"?"selected":""}>לוקט</option>
      <option value="alt_mix" ${st==="alt_mix"?"selected":""}>לוקט מיקס אחר</option>
      <option value="not_found" ${st==="not_found"?"selected":""}>לא נמצא</option>
      <option value="open" ${st==="open"?"selected":""}>פתוח</option>
    </select>
    <span id="corr_mix_wrap_${id}" style="${st==="alt_mix"?"":"display:none"}">${correctionMixSelect(id, actualMix)}</span>
    <button onclick="saveCorrection('${id}')">שמור</button>
  </div>`;
}
function klcToggleCorrectionMix(id){
  const st=document.getElementById(`corr_${id}`)?.value;
  const wrap=document.getElementById(`corr_mix_wrap_${id}`);
  if(wrap)wrap.style.display=st==="alt_mix"?"":"none";
}
function showCorrectionWave(id){
  const rows=analytics.filter(r=>r.wave_id===id);
  correctionItems.innerHTML=table(["דגם","מיקס","כמות","מיקום","סטטוס","מיקס בפועל","ברקוד/דגם שלוקט","תיקון"],
    rows.map(r=>[esc(r.model),esc(r.mix),r.qty,esc(r.location||""),statusLabel(r.status),esc(r.actual_mix||""),esc(r.picked_model||""),correctionSelect(r.item_id,r.status,r.actual_mix||r.mix||"A")]),
    rows.map(r=>klcStatusRowClass(r.status))
  );
}
async function saveCorrection(id){
  const st=document.getElementById(`corr_${id}`).value;
  const mix=document.getElementById(`corr_mix_${id}`)?.value||"";
  if(st==="alt_mix") await klcSaveItemStatus(id,st,mix,"");
  else await klcSaveItemStatus(id,st,"","");
  analytics=await api("/api/analytics");
  renderCorrections();
}
setTimeout(()=>{if(me?.role==="worker")renderWorkerPage();},700);
