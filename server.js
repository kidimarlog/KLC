
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "klc.db");
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH);
const upload = multer({ dest: UPLOAD_DIR });

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.db", dir: __dirname }),
  secret: process.env.SESSION_SECRET || "replace-this-secret-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 }
}));
app.use(express.static(path.join(__dirname, "public")));

function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function(err) {
    if (err) reject(err); else resolve(this);
  }));
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}
function now() {
  return new Date().toISOString();
}
function roleName(role) {
  return role === "admin" ? "מנהל" : "עובד";
}
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "נדרשת כניסה" });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") return res.status(403).json({ error: "מנהל בלבד" });
  next();
}
function storeNumber(store) {
  const m = String(store || "").match(/\d+/);
  return m ? m[0].padStart(2, "0") : "00";
}
function typeCode(sourceType) {
  return { pants: "P", daily: "D", melange: "M" }[sourceType] || "X";
}
function sourceLabel(sourceType) {
  return { pants: "השלמת מכנסיים", daily: "ליקוט יומי", melange: "מלאנז׳" }[sourceType] || sourceType;
}
function value(row, names) {
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== "") return String(row[n]).trim();
  }
  return "";
}
function qtyValue(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function normalizeStore(store) {
  return String(store || "").trim();
}
async function nextWaveNo(store, sourceType) {
  const sn = storeNumber(store);
  const code = typeCode(sourceType);
  const key = `${sn}-${code}`;
  const existing = await get("SELECT counter FROM counters WHERE counter_key=?", [key]);
  const next = (existing?.counter || 0) + 1;
  await run("INSERT OR REPLACE INTO counters(counter_key, counter) VALUES(?,?)", [key, next]);
  return `${sn}-${code}-${String(next).padStart(5, "0")}`;
}
async function initDb() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    code_plain TEXT NOT NULL,
    role TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS waves (
    id TEXT PRIMARY KEY,
    wave_no TEXT NOT NULL,
    store TEXT NOT NULL,
    store_no TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_label TEXT NOT NULL,
    status TEXT NOT NULL,
    assigned_to TEXT,
    created_at TEXT NOT NULL,
    closed_at TEXT,
    close_reason TEXT,
    parent_wave_no TEXT
  )`);
  await run(`CREATE TABLE IF NOT EXISTS wave_items (
    id TEXT PRIMARY KEY,
    wave_id TEXT NOT NULL,
    model TEXT NOT NULL,
    mix TEXT NOT NULL DEFAULT 'A',
    qty REAL NOT NULL DEFAULT 1,
    location TEXT,
    source_file TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    actual_mix TEXT,
    picked_by TEXT,
    picked_at TEXT,
    created_at TEXT NOT NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS locations (
    kind TEXT NOT NULL,
    model_key TEXT NOT NULL,
    location TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(kind, model_key)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS counters (
    counter_key TEXT PRIMARY KEY,
    counter INTEGER NOT NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS imports (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    source_type TEXT NOT NULL,
    rows_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`);
  const admin = await get("SELECT id FROM users WHERE username='admin'");
  if (!admin) {
    const hash = bcrypt.hashSync("1234", 10);
    await run("INSERT INTO users(username,password_hash,code_plain,role,active,created_at) VALUES(?,?,?,?,1,?)", ["admin", hash, "1234", "admin", now()]);
  }
}
function readWorkbook(filePath) {
  return XLSX.readFile(filePath, { cellDates: false, raw: false });
}
function sheetToRows(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
}
function firstSheetRows(wb) {
  return sheetToRows(wb, wb.SheetNames[0]);
}
function normalizePants(wb) {
  const rows = sheetToRows(wb, "ליקוט");
  return rows.map(r => {
    const pants = value(r, ["סוג מכנסיים"]);
    const color = value(r, ["צבע"]);
    return {
      store: normalizeStore(value(r, ["קוד ושם מחסן", "חנות"])),
      model: [pants, color].filter(Boolean).join(" ").trim(),
      mix: value(r, ["מידה"]) || "A",
      qty: qtyValue(value(r, ["כמות לליקוט", "כמות"]))
    };
  }).filter(x => x.store && x.model);
}
function normalizeDaily(wb) {
  const rows = sheetToRows(wb, "ליקוט יומי");
  return rows.map(r => ({
    model: value(r, ["דגם"]),
    mix: value(r, ["מיקס"]) || "A",
    store: normalizeStore(value(r, ["חנות"])),
    qty: qtyValue(value(r, ["כמות"]))
  })).filter(x => x.store && x.model);
}
function normalizeMelange(wb) {
  let rows = firstSheetRows(wb);
  for (const s of wb.SheetNames) {
    const tmp = sheetToRows(wb, s);
    if (tmp.some(r => r["קוד ושם מחסן"] !== undefined && r["קוד פריט"] !== undefined)) {
      rows = tmp;
      break;
    }
  }
  return rows.map(r => {
    const color = value(r, ["צבע"]);
    const size = value(r, ["מידה"]);
    return {
      store: normalizeStore(value(r, ["קוד ושם מחסן"])),
      model: value(r, ["קוד פריט"]),
      mix: [color, size].filter(Boolean).join("-") || "A",
      qty: qtyValue(value(r, ["ליקוט", "כמות"]))
    };
  }).filter(x => x.store && x.model && x.qty > 0);
}
function detectPickingFile(wb) {
  if (wb.SheetNames.includes("ליקוט יומי")) return { sourceType: "daily", rows: normalizeDaily(wb) };
  if (wb.SheetNames.includes("ליקוט")) return { sourceType: "pants", rows: normalizePants(wb) };
  return { sourceType: "melange", rows: normalizeMelange(wb) };
}
async function locationFor(model, sourceType) {
  if (sourceType === "daily") {
    const r = await get("SELECT location FROM locations WHERE kind='daily' AND model_key=?", [model]);
    return r?.location || "";
  }
  if (sourceType === "melange") {
    const full = String(model || "");
    const partial = full.length >= 9 ? full.substring(3, 9) : full;
    const r1 = await get("SELECT location FROM locations WHERE kind='melange' AND model_key=?", [partial]);
    if (r1) return r1.location;
    const r2 = await get("SELECT location FROM locations WHERE kind='melange' AND model_key=?", [full]);
    return r2?.location || "";
  }
  return "";
}
// IMPORTANT: merge only same store + same source type + open/assigned/active.
// This keeps "השלמת מכנסיים", "ליקוט יומי", and "מלאנז׳" as separate waves.
async function findOpenWave(store, sourceType) {
  return await get(`SELECT * FROM waves
    WHERE store=? AND source_type=? AND status IN ('open','assigned','active')
    ORDER BY created_at DESC LIMIT 1`, [store, sourceType]);
}
async function refreshLocationsForKind(kind) {
  const items = await all(`SELECT wi.id, wi.model, w.source_type
    FROM wave_items wi JOIN waves w ON w.id=wi.wave_id
    WHERE w.source_type=?`, [kind]);
  for (const it of items) {
    const loc = await locationFor(it.model, it.source_type);
    await run("UPDATE wave_items SET location=? WHERE id=?", [loc, it.id]);
  }
}
async function waveWithItems(w) {
  const items = await all("SELECT * FROM wave_items WHERE wave_id=? ORDER BY COALESCE(location,'ZZZZZZ'), model, mix", [w.id]);
  return { ...w, items };
}
function statusHeb(s) {
  return { open: "פתוח", assigned: "משויך", active: "פעיל", completed: "הושלם", pallet_full: "משטח מלא", picked: "לוקט", alt_mix: "לוקט מיקס אחר", not_found: "לא נמצא" }[s] || s;
}

app.post("/api/login", async (req, res) => {
  const { username, code } = req.body;
  const u = await get("SELECT * FROM users WHERE username=? AND active=1", [String(username || "").trim()]);
  if (!u || !bcrypt.compareSync(String(code || "").trim(), u.password_hash)) {
    return res.status(401).json({ error: "שם משתמש או קוד שגויים" });
  }
  req.session.user = { username: u.username, role: u.role };
  res.json({ user: req.session.user });
});
app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/me", (req, res) => res.json({ user: req.session.user || null }));

app.get("/api/users", requireAdmin, async (req, res) => {
  res.json(await all("SELECT id, username, code_plain, role, active, created_at FROM users ORDER BY id"));
});
app.post("/api/users", requireAdmin, async (req, res) => {
  const { username, code, role } = req.body;
  if (!username || !code) return res.status(400).json({ error: "חובה למלא שם משתמש וקוד" });
  const hash = bcrypt.hashSync(String(code), 10);
  try {
    await run("INSERT INTO users(username,password_hash,code_plain,role,active,created_at) VALUES(?,?,?,?,1,?)", [username.trim(), hash, String(role || "worker"), String(code), now()]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: "שם משתמש כבר קיים" });
  }
});
app.patch("/api/users/:id", requireAdmin, async (req, res) => {
  const { active, code, role } = req.body;
  const user = await get("SELECT * FROM users WHERE id=?", [req.params.id]);
  if (!user) return res.status(404).json({ error: "יוזר לא נמצא" });
  if (user.username === "admin" && active === false) return res.status(400).json({ error: "לא ניתן להשבית את admin" });
  if (active !== undefined) await run("UPDATE users SET active=? WHERE id=?", [active ? 1 : 0, req.params.id]);
  if (role) await run("UPDATE users SET role=? WHERE id=?", [role, req.params.id]);
  if (code) await run("UPDATE users SET password_hash=?, code_plain=? WHERE id=?", [bcrypt.hashSync(String(code), 10), String(code), req.params.id]);
  res.json({ ok: true });
});

app.post("/api/upload/picking", requireAdmin, upload.array("files", 20), async (req, res) => {
  let total = { added: 0, created: 0, merged: 0, files: [] };
  for (const file of req.files || []) {
    const wb = readWorkbook(file.path);
    const { sourceType, rows } = detectPickingFile(wb);
    await run("INSERT INTO imports(id,filename,source_type,rows_count,created_at) VALUES(?,?,?,?,?)", [cryptoId(), file.originalname, sourceType, rows.length, now()]);
    const byStore = {};
    for (const r of rows) {
      if (!r.store || !r.model) continue;
      byStore[r.store] ??= [];
      byStore[r.store].push(r);
    }
    for (const [store, items] of Object.entries(byStore)) {
      let wave = await findOpenWave(store, sourceType);
      let waveId;
      if (wave) {
        waveId = wave.id;
        total.merged++;
      } else {
        waveId = cryptoId();
        const waveNo = await nextWaveNo(store, sourceType);
        await run(`INSERT INTO waves(id,wave_no,store,store_no,source_type,source_label,status,created_at)
          VALUES(?,?,?,?,?,?,?,?)`, [waveId, waveNo, store, storeNumber(store), sourceType, sourceLabel(sourceType), "open", now()]);
        total.created++;
      }
      for (const it of items) {
        const loc = await locationFor(it.model, sourceType);
        await run(`INSERT INTO wave_items(id,wave_id,model,mix,qty,location,source_file,status,created_at)
          VALUES(?,?,?,?,?,?,?,?,?)`, [cryptoId(), waveId, it.model, it.mix || "A", it.qty || 1, loc, file.originalname, "open", now()]);
        total.added++;
      }
    }
    total.files.push({ filename: file.originalname, sourceType, label: sourceLabel(sourceType), rows: rows.length });
  }
  res.json(total);
});
app.post("/api/upload/locations/:kind", requireAdmin, upload.single("file"), async (req, res) => {
  const kind = req.params.kind;
  if (!req.file) return res.status(400).json({ error: "לא נבחר קובץ" });
  const wb = readWorkbook(req.file.path);
  let rows = [];
  let count = 0;
  if (kind === "daily") {
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
    for (const r of rows) {
      const model = value(r, ["קוד פריט"]);
      const loc = value(r, ["תאור"]);
      if (model && loc) {
        await run("INSERT OR REPLACE INTO locations(kind,model_key,location,updated_at) VALUES(?,?,?,?)", ["daily", model, loc, now()]);
        count++;
      }
    }
    await refreshLocationsForKind("daily");
  } else if (kind === "melange") {
    rows = sheetToRows(wb, "מתעדכן קבוע");
    for (const r of rows) {
      const model = value(r, ["דגם"]);
      const loc = value(r, ["מיקום"]);
      if (model && loc) {
        await run("INSERT OR REPLACE INTO locations(kind,model_key,location,updated_at) VALUES(?,?,?,?)", ["melange", model, loc, now()]);
        count++;
      }
    }
    await refreshLocationsForKind("melange");
  } else {
    return res.status(400).json({ error: "סוג מיקומים לא תקין" });
  }
  res.json({ count });
});

app.get("/api/waves", requireLogin, async (req, res) => {
  let waves;
  if (req.session.user.role === "admin") {
    waves = await all("SELECT * FROM waves ORDER BY created_at DESC");
  } else {
    waves = await all(`SELECT * FROM waves
      WHERE assigned_to=? AND status IN ('open','assigned','active')
      ORDER BY created_at ASC`, [req.session.user.username]);
  }
  res.json(await Promise.all(waves.map(waveWithItems)));
});
app.post("/api/assign", requireAdmin, async (req, res) => {
  const { waveId, username } = req.body;
  await run("UPDATE waves SET assigned_to=?, status=CASE WHEN status='open' THEN 'assigned' ELSE status END WHERE id=?", [username, waveId]);
  res.json({ ok: true });
});
app.post("/api/item/status", requireLogin, async (req, res) => {
  const { itemId, status, actualMix } = req.body;
  const item = await get(`SELECT wi.*, w.assigned_to, w.id AS wave_id
    FROM wave_items wi JOIN waves w ON w.id=wi.wave_id WHERE wi.id=?`, [itemId]);
  if (!item) return res.status(404).json({ error: "פריט לא נמצא" });
  if (req.session.user.role !== "admin" && item.assigned_to !== req.session.user.username) {
    return res.status(403).json({ error: "אין הרשאה לפריט הזה" });
  }
  await run(`UPDATE wave_items SET status=?, actual_mix=?, picked_by=?, picked_at=? WHERE id=?`, [status, actualMix || "", req.session.user.username, now(), itemId]);
  await run("UPDATE waves SET status='active' WHERE id=? AND status IN ('open','assigned')", [item.wave_id]);
  res.json({ ok: true });
});
app.post("/api/wave/complete", requireLogin, async (req, res) => {
  const { waveId } = req.body;
  await run("UPDATE waves SET status='completed', closed_at=?, close_reason='ליקוט הושלם' WHERE id=?", [now(), waveId]);
  res.json({ ok: true, message: "ליקוט הושלם - סגור משטח" });
});
app.post("/api/wave/pallet-full", requireLogin, async (req, res) => {
  const { waveId } = req.body;
  const w = await get("SELECT * FROM waves WHERE id=?", [waveId]);
  if (!w) return res.status(404).json({ error: "גל לא נמצא" });
  const openItems = await all("SELECT * FROM wave_items WHERE wave_id=? AND status='open'", [waveId]);
  if (!openItems.length) return res.status(400).json({ error: "אין פריטים פתוחים לגל המשך" });
  const newId = cryptoId();
  const newWaveNo = await nextWaveNo(w.store, w.source_type);
  await run(`INSERT INTO waves(id,wave_no,store,store_no,source_type,source_label,status,assigned_to,created_at,parent_wave_no)
    VALUES(?,?,?,?,?,?,?,?,?,?)`, [newId, newWaveNo, w.store, w.store_no, w.source_type, w.source_label, w.assigned_to ? "assigned" : "open", w.assigned_to, now(), w.wave_no]);
  for (const it of openItems) {
    await run(`INSERT INTO wave_items(id,wave_id,model,mix,qty,location,source_file,status,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`, [cryptoId(), newId, it.model, it.mix, it.qty, it.location, it.source_file, "open", now()]);
    await run("DELETE FROM wave_items WHERE id=?", [it.id]);
  }
  await run("UPDATE waves SET status='pallet_full', closed_at=?, close_reason='משטח מלא' WHERE id=?", [now(), waveId]);
  res.json({ ok: true, newWaveNo });
});

app.get("/api/analytics", requireAdmin, async (req, res) => {
  const rows = await all(`SELECT w.wave_no, w.store, w.source_label, w.assigned_to, w.status AS wave_status,
    wi.model, wi.mix, wi.qty, wi.location, wi.status, wi.actual_mix, wi.picked_by, wi.picked_at, wi.source_file
    FROM wave_items wi JOIN waves w ON w.id=wi.wave_id
    ORDER BY COALESCE(wi.picked_at, wi.created_at) DESC`);
  res.json(rows);
});
app.get("/api/analytics/export", requireAdmin, async (req, res) => {
  const rows = await all(`SELECT w.wave_no AS 'גל', w.store AS 'חנות', w.source_label AS 'סוג גל',
    w.assigned_to AS 'עובד משויך', wi.model AS 'דגם', wi.mix AS 'מיקס נדרש', wi.qty AS 'כמות',
    wi.location AS 'מיקום', wi.status AS 'סטטוס', wi.actual_mix AS 'מיקס בפועל',
    wi.picked_by AS 'בוצע ע״י', wi.picked_at AS 'תאריך', wi.source_file AS 'קובץ מקור'
    FROM wave_items wi JOIN waves w ON w.id=wi.wave_id`);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ניתוח נתונים");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", `attachment; filename="KLC_analytics.xlsx"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

function cryptoId() {
  return require("crypto").randomUUID();
}
initDb().then(() => {
  app.listen(PORT, () => console.log(`KLC running on port ${PORT}`));
});
