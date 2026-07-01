// KLC v1.6.3 - מצב עובד מותאם מובייל
// להדביק בסוף public/app.js

async function boot(){
  const res = await api("/api/me").catch(()=>({user:null}));
  me = res.user;

  loginScreen.classList.toggle("hidden", !!me);
  appScreen.classList.toggle("hidden", !me);

  if(!me) return;

  document.body.classList.toggle("worker-mode", me.role === "worker");
  document.body.classList.toggle("admin-mode", me.role === "admin");

  meBox.innerHTML = `מחובר: <b>${esc(me.username)}</b><br>${me.role==="admin"?"מנהל":"עובד"}`;

  document.querySelectorAll(".admin-only").forEach(x => x.style.display = me.role==="admin" ? "block" : "none");
  document.querySelectorAll(".worker-only").forEach(x => x.style.display = me.role==="worker" ? "block" : "none");

  await refresh();

  showPage(me.role === "admin" ? "dashboardPage" : "workerPage");
}
