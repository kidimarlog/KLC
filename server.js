const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "klc.db");
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH);
const upload = multer({ dest: UPLOAD_DIR });

app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.db", dir: __dirname }),
  secret: process.env.SESSION_SECRET || "replace-this-secret-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 }
}));
app.use(express.static(path.join(__dirname, "public")));

function run(sql, params = []) { return new Promise((resolve, reject) => db.run(sql, params, function(err){ err ? reject(err) : resolve(this); })); }
function get(sql, params = []) { return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))); }
function all(sql, params = []) { return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))); }
function id(){ return crypto.randomUUID(); }
function now(){ return new Date().toISOString(); }
function normalizeRole(role){ const r=String(role||"").trim().toLowerCase(); return (r==="admin"||r==="מנהל") ? "admin" : "worker"; }
function roleLabel(role){ return normalizeRole(role)==="admin" ? "מנהל" : "עובד"; }
function normalizeActive(v){ return v===1 || v===true || v==="1" || String(v).toLowerCase()==="true" || v==="כן"; }
function requireLogin(req,res,next){ if(!req.session.user) return res.status(401).json({error:"נדרשת כניסה"}); next(); }
function requireAdmin(req,res,next){ if(!req.session.user || normalizeRole(req.session.user.role)!=="admin") return res.status(403).json({error:"מנהל בלבד"}); next(); }
function storeNumber(store){ const m=String(store||"").match(/\d+/); return m ? m[0].padStart(2,"0") : "00"; }
function typeCode(sourceType){ return {pants:"P",daily:"D",melange:"M"}[sourceType] || "X"; }
function sourceLabel(sourceType){ return {pants:"השלמת מכנסיים",daily:"ליקוט יומי",melange:"מלאנז׳"}[sourceType] || sourceType; }
function qtyValue(v){ const n=Number(String(v??"").replace(",",".")); return Number.isFinite(n)&&n>0 ? n : 1; }
function normalizeStore(store){ return String(store||"").trim(); }
function clean(v){ return String(v ?? "").trim(); }
function normHeader(v){
  return String(v ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u200E\u200F]/g, "")
    .replace(/["׳״']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function rowVal(row, names){
  const wanted = names.map(normHeader);
  for(const key of Object.keys(row || {})){
    const nk = normHeader(key);
    if(wanted.includes(nk) && row[key]!==undefined && row[key]!==null && String(row[key]).trim()!==""){
      return String(row[key]).trim();
    }
  }
  return "";
}
function sheetRowsByHeader(wb, headerNames){
  const wanted = headerNames.map(normHeader);
  for(const s of wb.SheetNames){
    const ws = wb.Sheets[s];
    if(!ws) continue;
    const aoa = XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false});
    let headerIndex = -1;
    let header = [];
    for(let i=0;i<Math.min(30, aoa.length);i++){
      const row = (aoa[i] || []).map(normHeader);
      if(wanted.every(w => row.includes(w))){
        headerIndex = i;
        header = row;
        break;
      }
    }
    if(headerIndex >= 0){
      const rows = [];
      for(let r=headerIndex+1; r<aoa.length; r++){
        const obj = {};
        (aoa[r] || []).forEach((v,i)=>{ obj[header[i] || `COL_${i}`] = v; });
        rows.push(obj);
      }
      return rows;
    }
  }
  return [];
}
async function ensureColumn(table,column,type){ const cols=await all(`PRAGMA table_info(${table})`); if(!cols.some(c=>c.name===column)) await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`); }
async function nextWaveNo(store,sourceType){ const sn=storeNumber(store), code=typeCode(sourceType), key=`${sn}-${code}`; const ex=await get("SELECT counter FROM counters WHERE counter_key=?",[key]); const next=(ex?.counter||0)+1; await run("INSERT OR REPLACE INTO counters(counter_key,counter) VALUES(?,?)",[key,next]); return `${sn}-${code}-${String(next).padStart(5,"0")}`; }

async function initDb(){
  await run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, code_plain TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`);
  await run(`CREATE TABLE IF NOT EXISTS waves (id TEXT PRIMARY KEY, wave_no TEXT NOT NULL, store TEXT NOT NULL, store_no TEXT NOT NULL, source_type TEXT NOT NULL, source_label TEXT NOT NULL, status TEXT NOT NULL, assigned_to TEXT, created_at TEXT NOT NULL, closed_at TEXT, close_reason TEXT, parent_wave_no TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS wave_items (id TEXT PRIMARY KEY, wave_id TEXT NOT NULL, model TEXT NOT NULL, mix TEXT NOT NULL DEFAULT 'A', qty REAL NOT NULL DEFAULT 1, location TEXT, source_file TEXT, status TEXT NOT NULL DEFAULT 'open', actual_mix TEXT, picked_by TEXT, picked_at TEXT, created_at TEXT NOT NULL)`);
  await run(`CREATE TABLE IF NOT EXISTS locations (kind TEXT NOT NULL, model_key TEXT NOT NULL, location TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(kind, model_key))`);
  await run(`CREATE TABLE IF NOT EXISTS counters (counter_key TEXT PRIMARY KEY, counter INTEGER NOT NULL)`);
  await run(`CREATE TABLE IF NOT EXISTS imports (id TEXT PRIMARY KEY, filename TEXT NOT NULL, source_type TEXT NOT NULL, rows_count INTEGER NOT NULL, created_at TEXT NOT NULL)`);
  await ensureColumn("wave_items","import_id","TEXT");
  await run("UPDATE users SET role='admin' WHERE role='מנהל'");
  await run("UPDATE users SET role='worker' WHERE role='עובד'");
  const admin=await get("SELECT id FROM users WHERE username='admin'");
  if(!admin){ await run("INSERT INTO users(username,password_hash,code_plain,role,active,created_at) VALUES(?,?,?,?,1,?)",["admin",bcrypt.hashSync("1234",10),"1234","admin",now()]); }
}

function readWorkbook(filePath){ return XLSX.readFile(filePath,{cellDates:false,raw:false}); }
function sheetToRows(wb,sheetName){ const ws=wb.Sheets[sheetName]; if(!ws) return []; return XLSX.utils.sheet_to_json(ws,{defval:"",raw:false}); }
function sheetAoA(wb,sheetName){ const ws=wb.Sheets[sheetName]; if(!ws) return []; return XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false}); }
function firstSheetRows(wb){ return sheetToRows(wb, wb.SheetNames[0]); }

function normalizePants(wb){
  const rows = sheetToRows(wb,"ליקוט");
  return rows.map(r=>({
    store: normalizeStore(rowVal(r,["קוד ושם מחסן","חנות","מחסן / חנות","מחסן"])),
    model: [rowVal(r,["סוג מכנסיים","סוג"]), rowVal(r,["צבע"])].filter(Boolean).join(" ").trim(),
    mix: rowVal(r,["מידה","מיקס","מיקס / מידה"]) || "A",
    qty: qtyValue(rowVal(r,["כמות לליקוט","כמות","ליקוט"]))
  })).filter(x=>x.store&&x.model);
}
// קובץ 2: דוח ליקוט לעדכון יומי — גליון "ליקוט יומי", עמודות A-D בלבד.
// A=דגם, B=מיקס, C=חנות, D=כמות. מדלג על שורת כותרת אם קיימת.
function normalizeDaily(wb){
  const arr = sheetAoA(wb,"ליקוט יומי");
  const out = [];
  for(let i=0;i<arr.length;i++){
    const r = arr[i] || [];
    let model=clean(r[0]), mix=clean(r[1])||"A", store=normalizeStore(r[2]), qty=qtyValue(r[3]);
    const headerWords = ["דגם","קוד פריט","פריט","מיקס","סוג אריזה","חנות","מחסן","כמות"];
    if(i===0 && headerWords.some(w => [model,mix,store,clean(r[3])].includes(w) || store.includes(w))) continue;
    if(model && store) out.push({model,mix,store,qty});
  }
  return out;
}
function normalizeMelange(wb){
  let rows=firstSheetRows(wb);
  for(const s of wb.SheetNames){
    const tmp=sheetToRows(wb,s);
    if(tmp.some(r=>r["קוד ושם מחסן"]!==undefined && r["קוד פריט"]!==undefined)){ rows=tmp; break; }
  }
  return rows.map(r=>({
    store: normalizeStore(rowVal(r,["קוד ושם מחסן"])),
    model: rowVal(r,["קוד פריט"]),
    mix: [rowVal(r,["צבע"]), rowVal(r,["מידה"])].filter(Boolean).join("-") || "A",
    qty: qtyValue(rowVal(r,["ליקוט"]))
  })).filter(x=>x.store&&x.model&&x.qty>0);
}
function detectPickingFile(wb, originalName=""){
  const name = String(originalName||"").toLowerCase();
  if(name.includes("השלמות") || name.includes("מכנס")) return {sourceType:"pants",rows:normalizePants(wb)};
  if(name.includes("דוח ליקוט") || name.includes("עדכון יומי") || wb.SheetNames.includes("ליקוט יומי")) return {sourceType:"daily",rows:normalizeDaily(wb)};
  if(name.includes("מלאנז") || name.includes("מלנז")) return {sourceType:"melange",rows:normalizeMelange(wb)};
  if(wb.SheetNames.includes("ליקוט")) return {sourceType:"pants",rows:normalizePants(wb)};
  return {sourceType:"melange",rows:normalizeMelange(wb)};
}
async function locationFor(model,sourceType){
  const m = clean(model);
  if(sourceType==="daily"){
    const r=await get("SELECT location FROM locations WHERE kind='daily' AND model_key=?",[m]);
    return r?.location||"";
  }
  if(sourceType==="melange"){
    const full=m, partial=full.length>=9?full.substring(3,9):full;
    const r1=await get("SELECT location FROM locations WHERE kind='melange' AND model_key=?",[partial]); if(r1) return r1.location;
    const r2=await get("SELECT location FROM locations WHERE kind='melange' AND model_key=?",[full]); return r2?.location||"";
  }
  return "";
}
async function findOpenWave(store,sourceType){ return await get(`SELECT * FROM waves WHERE store=? AND source_type=? AND status IN ('open','assigned','active') ORDER BY created_at DESC LIMIT 1`,[store,sourceType]); }
async function waveWithItems(w){ const items=await all("SELECT * FROM wave_items WHERE wave_id=? ORDER BY COALESCE(location,'ZZZZZZ'), model, mix",[w.id]); return {...w,items}; }
async function refreshLocationsForKind(kind){ const items=await all(`SELECT wi.id, wi.model, w.source_type FROM wave_items wi JOIN waves w ON w.id=wi.wave_id WHERE w.source_type=?`,[kind]); for(const it of items){ await run("UPDATE wave_items SET location=? WHERE id=?",[await locationFor(it.model,it.source_type),it.id]); } }
async function cleanupEmptyWaves(){ const empty=await all(`SELECT w.id FROM waves w LEFT JOIN wave_items wi ON wi.wave_id=w.id GROUP BY w.id HAVING COUNT(wi.id)=0`); for(const w of empty) await run("DELETE FROM waves WHERE id=?",[w.id]); }

app.post("/api/login", async (req,res)=>{ const username=String(req.body.username||"").trim(), code=String(req.body.code||"").trim(); const u=await get("SELECT * FROM users WHERE username=? AND active=1",[username]); if(!u||!bcrypt.compareSync(code,u.password_hash)) return res.status(401).json({error:"שם משתמש או קוד שגויים"}); req.session.user={username:u.username,role:normalizeRole(u.role)}; res.json({user:req.session.user}); });
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",(req,res)=>res.json({user:req.session.user||null}));

app.get("/api/users", requireAdmin, async (req,res)=>{ const list=await all("SELECT id, username, code_plain, role, active, created_at FROM users ORDER BY id"); res.json(list.map(u=>({...u,role:normalizeRole(u.role),role_label:roleLabel(u.role),active:normalizeActive(u.active)}))); });
app.post("/api/users", requireAdmin, async (req,res)=>{ const username=String(req.body.username||"").trim(), code=String(req.body.code||"").trim(), role=normalizeRole(req.body.role||"worker"); if(!username||!code) return res.status(400).json({error:"חובה למלא שם משתמש וקוד"}); try{ await run("INSERT INTO users(username,password_hash,code_plain,role,active,created_at) VALUES(?,?,?,?,1,?)",[username,bcrypt.hashSync(code,10),code,role,now()]); res.json({ok:true}); }catch(e){ res.status(400).json({error:"שם משתמש כבר קיים"}); } });
app.patch("/api/users/:id", requireAdmin, async (req,res)=>{ const {active,code,role,username}=req.body; const user=await get("SELECT * FROM users WHERE id=?",[req.params.id]); if(!user) return res.status(404).json({error:"יוזר לא נמצא"}); if(user.username==="admin" && username && username!=="admin") return res.status(400).json({error:"לא ניתן לשנות את שם admin"}); if(user.username==="admin"&&active===false) return res.status(400).json({error:"לא ניתן להשבית את admin"}); if(username && username.trim() && username.trim()!==user.username){ await run("UPDATE users SET username=? WHERE id=?",[username.trim(),req.params.id]); await run("UPDATE waves SET assigned_to=? WHERE assigned_to=?",[username.trim(),user.username]); await run("UPDATE wave_items SET picked_by=? WHERE picked_by=?",[username.trim(),user.username]); } if(active!==undefined) await run("UPDATE users SET active=? WHERE id=?",[active?1:0,req.params.id]); if(role) await run("UPDATE users SET role=? WHERE id=?",[normalizeRole(role),req.params.id]); if(code) await run("UPDATE users SET password_hash=?, code_plain=? WHERE id=?",[bcrypt.hashSync(String(code),10),String(code),req.params.id]); res.json({ok:true}); });
app.delete("/api/users/:id", requireAdmin, async (req,res)=>{ const user=await get("SELECT * FROM users WHERE id=?",[req.params.id]); if(!user) return res.status(404).json({error:"יוזר לא נמצא"}); if(user.username==="admin") return res.status(400).json({error:"לא ניתן למחוק את admin"}); await run("UPDATE waves SET assigned_to=NULL, status=CASE WHEN status IN ('assigned','active') THEN 'open' ELSE status END WHERE assigned_to=?",[user.username]); await run("DELETE FROM users WHERE id=?",[req.params.id]); res.json({ok:true}); });

app.post("/api/upload/picking", requireAdmin, upload.array("files",20), async (req,res)=>{
  let total={added:0,created:0,merged:0,files:[]};
  for(const file of req.files||[]){
    const wb=readWorkbook(file.path);
    const {sourceType,rows}=detectPickingFile(wb,file.originalname);
    if(!rows.length){ total.files.push({filename:file.originalname,sourceType,label:sourceLabel(sourceType),rows:0,error:"לא נמצאו שורות לפי מבנה הקובץ"}); continue; }
    const importId=id();
    await run("INSERT INTO imports(id,filename,source_type,rows_count,created_at) VALUES(?,?,?,?,?)",[importId,file.originalname,sourceType,rows.length,now()]);
    const byStore={};
    for(const r of rows){ if(!r.store||!r.model) continue; (byStore[r.store]??=[]).push(r); }
    for(const [store,items] of Object.entries(byStore)){
      let wave=await findOpenWave(store,sourceType); let waveId;
      if(wave){ waveId=wave.id; total.merged++; }
      else { waveId=id(); const waveNo=await nextWaveNo(store,sourceType); await run(`INSERT INTO waves(id,wave_no,store,store_no,source_type,source_label,status,created_at) VALUES(?,?,?,?,?,?,?,?)`,[waveId,waveNo,store,storeNumber(store),sourceType,sourceLabel(sourceType),"open",now()]); total.created++; }
      for(const it of items){ await run(`INSERT INTO wave_items(id,wave_id,model,mix,qty,location,source_file,status,created_at,import_id) VALUES(?,?,?,?,?,?,?,?,?,?)`,[id(),waveId,it.model,it.mix||"A",it.qty||1,await locationFor(it.model,sourceType),file.originalname,"open",now(),importId]); total.added++; }
    }
    total.files.push({id:importId,filename:file.originalname,sourceType,label:sourceLabel(sourceType),rows:rows.length});
  }
  res.json(total);
});
app.post("/api/upload/locations/:kind", requireAdmin, upload.single("file"), async (req,res)=>{
  const kind=req.params.kind;
  if(!req.file) return res.status(400).json({error:"לא נבחר קובץ"});
  const wb=readWorkbook(req.file.path);
  let count=0;

  if(kind==="daily"){
    // קובץ מיקומים ליקוט יומי:
    // קוד פריט = דגם, תאור/תיאור = מיקום
    let rows = sheetRowsByHeader(wb, ["קוד פריט","תאור"]);
    if(!rows.length) rows = sheetRowsByHeader(wb, ["קוד פריט","תיאור"]);
    if(!rows.length) rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:"",raw:false});

    for(const r of rows){
      const model = rowVal(r,["קוד פריט","דגם","פריט"]);
      const loc = rowVal(r,["תאור","תיאור","מיקום","תא אחסון"]);
      if(model && loc){
        await run("INSERT OR REPLACE INTO locations(kind,model_key,location,updated_at) VALUES(?,?,?,?)",["daily",clean(model),clean(loc),now()]);
        count++;
      }
    }
    await refreshLocationsForKind("daily");
  } else if(kind==="melange"){
    let rows=sheetToRows(wb,"מתעדכן קבוע");
    if(!rows.length) rows = sheetRowsByHeader(wb, ["דגם","מיקום"]);
    for(const r of rows){
      const model=rowVal(r,["דגם"]);
      const loc=rowVal(r,["מיקום","תאור","תיאור"]);
      if(model&&loc){
        await run("INSERT OR REPLACE INTO locations(kind,model_key,location,updated_at) VALUES(?,?,?,?)",["melange",clean(model),clean(loc),now()]);
        count++;
      }
    }
    await refreshLocationsForKind("melange");
  } else return res.status(400).json({error:"סוג מיקומים לא תקין"});
  res.json({count});
});

app.get("/api/waves", requireLogin, async (req,res)=>{ const waves = normalizeRole(req.session.user.role)==="admin" ? await all("SELECT * FROM waves ORDER BY created_at DESC") : await all(`SELECT * FROM waves WHERE assigned_to=? AND status IN ('open','assigned','active') ORDER BY created_at ASC`,[req.session.user.username]); res.json(await Promise.all(waves.map(waveWithItems))); });
app.post("/api/assign", requireAdmin, async (req,res)=>{ const waveId=req.body.waveId||req.body.wave_id, username=req.body.username; if(!waveId||!username||username==="__none__") return res.status(400).json({error:"יש לבחור גל ועובד"}); const w=await get("SELECT assigned_to FROM waves WHERE id=?",[waveId]); if(w?.assigned_to) return res.status(400).json({error:"הגל כבר משויך לעובד. יש להסיר שיוך לפני שיוך מחדש."}); await run("UPDATE waves SET assigned_to=?, status=CASE WHEN status='open' THEN 'assigned' ELSE status END WHERE id=?",[username,waveId]); res.json({ok:true}); });
app.post("/api/wave/unassign", requireAdmin, async (req,res)=>{ const waveId=req.body.waveId||req.body.wave_id; await run("UPDATE waves SET assigned_to=NULL, status=CASE WHEN status IN ('assigned','active') THEN 'open' ELSE status END WHERE id=?",[waveId]); res.json({ok:true}); });
app.delete("/api/waves/:id", requireAdmin, async (req,res)=>{ await run("DELETE FROM wave_items WHERE wave_id=?",[req.params.id]); await run("DELETE FROM waves WHERE id=?",[req.params.id]); res.json({ok:true}); });
app.post("/api/item/status", requireLogin, async (req,res)=>{ const itemId=req.body.itemId||req.body.item_id, status=req.body.status, actualMix=req.body.actualMix||req.body.actual_mix||""; const item=await get(`SELECT wi.*, w.assigned_to, w.id AS wave_id FROM wave_items wi JOIN waves w ON w.id=wi.wave_id WHERE wi.id=?`,[itemId]); if(!item) return res.status(404).json({error:"פריט לא נמצא"}); if(normalizeRole(req.session.user.role)!=="admin" && item.assigned_to!==req.session.user.username) return res.status(403).json({error:"אין הרשאה לפריט הזה"}); if(status==="open") await run(`UPDATE wave_items SET status='open', actual_mix='', picked_by='', picked_at='' WHERE id=?`,[itemId]); else { await run(`UPDATE wave_items SET status=?, actual_mix=?, picked_by=?, picked_at=? WHERE id=?`,[status,actualMix||"",req.session.user.username,now(),itemId]); await run("UPDATE waves SET status='active' WHERE id=? AND status IN ('open','assigned')",[item.wave_id]); } res.json({ok:true}); });
app.post("/api/wave/complete", requireLogin, async (req,res)=>{
  const waveId=req.body.waveId||req.body.wave_id;
  const open = await get("SELECT COUNT(*) AS c FROM wave_items WHERE wave_id=? AND status='open'", [waveId]);
  if((open?.c || 0) > 0){
    return res.status(400).json({error:`יש עוד ${open.c} קרטונים פתוחים בגל הזה. אפשר לסגור משטח מלא, או להשלים סטטוס לכל השורות.`});
  }
  await run("UPDATE waves SET status='completed', closed_at=?, close_reason='ליקוט הושלם' WHERE id=?",[now(),waveId]);
  res.json({ok:true,message:"ליקוט הושלם - סגור משטח"});
});
app.post("/api/wave/pallet-full", requireLogin, async (req,res)=>{ const waveId=req.body.waveId||req.body.wave_id; const w=await get("SELECT * FROM waves WHERE id=?",[waveId]); if(!w) return res.status(404).json({error:"גל לא נמצא"}); const openItems=await all("SELECT * FROM wave_items WHERE wave_id=? AND status='open'",[waveId]); if(!openItems.length) return res.status(400).json({error:"אין פריטים פתוחים לגל המשך"}); const newId=id(), newWaveNo=await nextWaveNo(w.store,w.source_type); await run(`INSERT INTO waves(id,wave_no,store,store_no,source_type,source_label,status,assigned_to,created_at,parent_wave_no) VALUES(?,?,?,?,?,?,?,?,?,?)`,[newId,newWaveNo,w.store,w.store_no,w.source_type,w.source_label,w.assigned_to?"assigned":"open",w.assigned_to,now(),w.wave_no]); for(const it of openItems){ await run(`INSERT INTO wave_items(id,wave_id,model,mix,qty,location,source_file,status,created_at,import_id) VALUES(?,?,?,?,?,?,?,?,?,?)`,[id(),newId,it.model,it.mix,it.qty,it.location,it.source_file,"open",now(),it.import_id]); await run("DELETE FROM wave_items WHERE id=?",[it.id]); } await run("UPDATE waves SET status='pallet_full', closed_at=?, close_reason='משטח מלא' WHERE id=?",[now(),waveId]); res.json({ok:true,newWaveNo}); });


app.get("/api/my-performance", requireLogin, async (req,res)=>{
  const user = req.session.user.username;
  const rows = await all(`SELECT w.id AS wave_id, w.wave_no, w.store, w.source_label, w.status AS wave_status, w.closed_at, w.close_reason,
    wi.id AS item_id, wi.model, wi.mix, wi.qty, wi.location, wi.status, wi.actual_mix, wi.picked_by, wi.picked_at, wi.source_file
    FROM wave_items wi JOIN waves w ON w.id=wi.wave_id
    WHERE w.assigned_to=? OR wi.picked_by=?
    ORDER BY COALESCE(w.closed_at, wi.picked_at, wi.created_at) DESC`, [user,user]);
  res.json(rows);
});

app.get("/api/imports", requireAdmin, async (req,res)=>{ const imports=await all(`SELECT id, filename, source_type, rows_count, created_at FROM imports ORDER BY created_at DESC`); const output=[]; for(const im of imports){ let stats=await get(`SELECT COUNT(*) AS total, SUM(CASE WHEN status!='open' THEN 1 ELSE 0 END) AS done, SUM(CASE WHEN status='not_found' THEN 1 ELSE 0 END) AS not_found FROM wave_items WHERE import_id=?`,[im.id]); if(!stats||stats.total===0) stats=await get(`SELECT COUNT(*) AS total, SUM(CASE WHEN wi.status!='open' THEN 1 ELSE 0 END) AS done, SUM(CASE WHEN wi.status='not_found' THEN 1 ELSE 0 END) AS not_found FROM wave_items wi JOIN waves w ON w.id=wi.wave_id WHERE wi.source_file=? AND w.source_type=?`,[im.filename,im.source_type]); const total=stats?.total||0, done=stats?.done||0; output.push({...im,source_label:sourceLabel(im.source_type),total_items:total,done_items:done,not_found_items:stats?.not_found||0,percent:total?Math.round(done/total*100):0,completed:total>0&&done===total}); } res.json(output); });
app.delete("/api/imports/:id", requireAdmin, async (req,res)=>{ const im=await get("SELECT * FROM imports WHERE id=?",[req.params.id]); if(!im) return res.status(404).json({error:"קובץ לא נמצא"}); const byImport=await get("SELECT COUNT(*) AS c FROM wave_items WHERE import_id=?",[im.id]); if(byImport?.c>0) await run("DELETE FROM wave_items WHERE import_id=?",[im.id]); else await run(`DELETE FROM wave_items WHERE source_file=? AND wave_id IN (SELECT id FROM waves WHERE source_type=?)`,[im.filename,im.source_type]); await run("DELETE FROM imports WHERE id=?",[im.id]); await cleanupEmptyWaves(); res.json({ok:true}); });

app.get("/api/analytics", requireAdmin, async (req,res)=>{ res.json(await all(`SELECT w.id AS wave_id, w.wave_no, w.store, w.source_label, w.assigned_to, w.status AS wave_status, wi.model, wi.mix, wi.qty, wi.location, wi.status, wi.actual_mix, wi.picked_by, wi.picked_at, wi.source_file FROM wave_items wi JOIN waves w ON w.id=wi.wave_id ORDER BY COALESCE(wi.picked_at, wi.created_at) DESC`)); });
app.get("/api/analytics/export", requireAdmin, async (req,res)=>{ const rows=await all(`SELECT w.wave_no AS 'גל', w.store AS 'חנות', w.source_label AS 'סוג גל', w.assigned_to AS 'עובד משויך', wi.model AS 'דגם', wi.mix AS 'מיקס נדרש', wi.qty AS 'כמות', wi.location AS 'מיקום', wi.status AS 'סטטוס', wi.actual_mix AS 'מיקס בפועל', wi.picked_by AS 'בוצע ע״י', wi.picked_at AS 'תאריך', wi.source_file AS 'קובץ מקור' FROM wave_items wi JOIN waves w ON w.id=wi.wave_id`); const ws=XLSX.utils.json_to_sheet(rows), wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"ניתוח נתונים"); const buf=XLSX.write(wb,{type:"buffer",bookType:"xlsx"}); res.setHeader("Content-Disposition",`attachment; filename="KLC_analytics.xlsx"`); res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); res.send(buf); });

initDb().then(()=>app.listen(PORT,()=>console.log(`KLC v1.6.1 running on port ${PORT}`)));

db.run("ALTER TABLE wave_items ADD COLUMN picked_model TEXT", () => {});

app.post("/api/item/status2", requireLogin, async (req,res)=>{
  const itemId=req.body.itemId||req.body.item_id;
  const status=req.body.status;
  const actualMix=req.body.actualMix||req.body.actual_mix||"";
  const pickedModel=String(req.body.pickedModel||req.body.picked_model||"").trim();

  const item=await get(`SELECT wi.*, w.assigned_to, w.id AS wave_id 
    FROM wave_items wi 
    JOIN waves w ON w.id=wi.wave_id 
    WHERE wi.id=?`,[itemId]);

  if(!item) return res.status(404).json({error:"פריט לא נמצא"});

  if(normalizeRole(req.session.user.role)!=="admin" && item.assigned_to!==req.session.user.username) {
    return res.status(403).json({error:"אין הרשאה לפריט הזה"});
  }

  if(status==="open"){
    await run(`UPDATE wave_items 
      SET status='open', actual_mix='', picked_by='', picked_at='', picked_model=''
      WHERE id=?`,[itemId]);
  } else {
    await run(`UPDATE wave_items 
      SET status=?, actual_mix=?, picked_model=?, picked_by=?, picked_at=?
      WHERE id=?`,[status,actualMix||"",pickedModel||"",req.session.user.username,now(),itemId]);

    await run("UPDATE waves SET status='active' WHERE id=? AND status IN ('open','assigned')",[item.wave_id]);
  }

  res.json({ok:true});
});
app.post("/api/waves/bulk-delete", requireAdmin, async (req,res)=>{
  const ids = Array.isArray(req.body.waveIds) ? req.body.waveIds.filter(Boolean) : [];

  if(!ids.length){
    return res.status(400).json({error:"לא נבחרו גלים למחיקה"});
  }

  for(const waveId of ids){
    await run("DELETE FROM wave_items WHERE wave_id=?", [waveId]);
    await run("DELETE FROM waves WHERE id=?", [waveId]);
  }

  res.json({ok:true, deleted:ids.length});
});

app.post("/api/assign/bulk", requireAdmin, async (req,res)=>{
  const waveIds = Array.isArray(req.body.waveIds) ? req.body.waveIds.filter(Boolean) : [];
  const username = String(req.body.username || "").trim();

  if(!username){
    return res.status(400).json({error:"יש לבחור עובד"});
  }

  if(!waveIds.length){
    return res.status(400).json({error:"לא נבחרו גלים לשיוך"});
  }

  let assigned = 0;
  let skipped = 0;

  for(const waveId of waveIds){
    const w = await get("SELECT assigned_to FROM waves WHERE id=?", [waveId]);

    if(!w){
      skipped++;
      continue;
    }

    if(w.assigned_to){
      skipped++;
      continue;
    }

    await run("UPDATE waves SET assigned_to=?, status=CASE WHEN status='open' THEN 'assigned' ELSE status END WHERE id=?", [username, waveId]);
    assigned++;
  }

  res.json({ok:true, assigned, skipped});
});
