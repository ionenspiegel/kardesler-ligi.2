'use strict';
// Kardeşler Ligi — takım tabanlı lig. Bağımlılık yok (Node 22+); better-sqlite3 kuruluysa o kullanılır.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = +process.env.PORT || 3000;
const DBP = process.env.DB_PATH || path.join(__dirname, 'data', 'league.db');
fs.mkdirSync(path.dirname(DBP), { recursive: true });
let db;
try { db = new (require('better-sqlite3'))(DBP); }
catch { db = new (require('node:sqlite').DatabaseSync)(DBP); }
const tx = f => { db.exec('BEGIN'); try { const r = f(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const q = (s, ...p) => db.prepare(s).all(...p), one = (s, ...p) => db.prepare(s).get(...p), run = (s, ...p) => db.prepare(s).run(...p);

// Şema: yalnızca "IF NOT EXISTS". Eski tablolara (users, goals, players...) dokunulmaz, silinmez.
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS kl_admin(id INTEGER PRIMARY KEY CHECK(id=1),username TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kl_teams(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,short TEXT,color TEXT NOT NULL DEFAULT '#22c55e');
CREATE TABLE IF NOT EXISTS kl_matches(id INTEGER PRIMARY KEY AUTOINCREMENT,week INTEGER NOT NULL DEFAULT 1,
 home_id INTEGER NOT NULL REFERENCES kl_teams(id) ON DELETE CASCADE,away_id INTEGER NOT NULL REFERENCES kl_teams(id) ON DELETE CASCADE,
 hs INTEGER NOT NULL DEFAULT 0,aws INTEGER NOT NULL DEFAULT 0,played INTEGER NOT NULL DEFAULT 0,updated TEXT);
CREATE TABLE IF NOT EXISTS kl_settings(k TEXT PRIMARY KEY,v TEXT);`);
const DEF = { name: 'Kardeşler Ligi', season: '2026', win: '3', draw: '1', loss: '0', week: '1' };
for (const [k, v] of Object.entries(DEF)) run('INSERT OR IGNORE INTO kl_settings(k,v) VALUES(?,?)', k, v);

// Eski veriyi (varsa) kopyala: eski tablolar okunur, değiştirilmez. Tanınmayan şema atlanır.
(function importLegacy() {
  try {
    if (one('SELECT COUNT(*) c FROM kl_teams').c) return;
    const cols = t => { try { return q(`PRAGMA table_info(${t})`).map(c => c.name); } catch { return []; } };
    const pick = (c, a) => a.find(x => c.includes(x));
    const tc = cols('teams'); if (!tc.includes('name')) return;
    const colr = pick(tc, ['color', 'colour']);
    for (const t of q('SELECT * FROM teams')) run('INSERT OR IGNORE INTO kl_teams(id,name,color) VALUES(?,?,?)', t.id, t.name, /^#[0-9a-f]{6}$/i.test(t[colr]) ? t[colr] : '#22c55e');
    const mc = cols('matches'), H = pick(mc, ['home_team_id', 'home_id']), A = pick(mc, ['away_team_id', 'away_id']),
      HS = pick(mc, ['home_score', 'home_goals']), AS = pick(mc, ['away_score', 'away_goals']), W = pick(mc, ['week', 'round', 'matchday']);
    if (H && A && HS && AS) for (const m of q('SELECT * FROM matches')) { try { run('INSERT INTO kl_matches(week,home_id,away_id,hs,aws,played) VALUES(?,?,?,?,?,?)', +m[W] || 1, m[H], m[A], +m[HS] || 0, +m[AS] || 0, m[HS] != null && m[AS] != null ? 1 : 0); } catch { } }
    console.log('Eski veri içe aktarıldı.');
  } catch (e) { console.log('Eski veri atlandı:', e.message); }
})();

// Güvenlik: scrypt parola, HMAC imzalı oturum çerezi, tek seferlik kurulum kodu.
const SECRET = process.env.SESSION_SECRET || (() => { const f = path.join(path.dirname(DBP), '.secret'); try { return fs.readFileSync(f, 'utf8'); } catch { const s = crypto.randomBytes(48).toString('hex'); fs.writeFileSync(f, s, { mode: 0o600 }); return s; } })();
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const eq = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const mkToken = () => { const e = Date.now() + 12 * 36e5; return `${e}.${sign('s' + e)}`; };
const isAdmin = req => { const m = /(?:^|; )kl_s=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return false; const [e, s] = m[1].split('.'); return +e > Date.now() && s && eq(s, sign('s' + e)); };
const needsSetup = () => !one('SELECT 1 x FROM kl_admin');
let setupCode = null;
if (needsSetup()) { setupCode = crypto.randomBytes(5).toString('hex'); console.log(`\n>>> YÖNETİCİ KURULUM KODU (yalnızca bu oturum için): ${setupCode}\n>>> http://localhost:${PORT}/#/yonetici adresinde bu kodla Yusuf'un şifresini belirle.\n`); }
const fails = new Map();
const limited = ip => { const f = fails.get(ip); return f && f.n >= 8 && Date.now() - f.t < 15 * 6e4; };
const fail = ip => { const f = fails.get(ip) || { n: 0 }; fails.set(ip, { n: f.n + 1, t: Date.now() }); };
const pwOk = p => typeof p === 'string' && p.length >= 8 && p.length <= 100;

// Lig mantığı
const settings = () => Object.fromEntries(q('SELECT k,v FROM kl_settings').map(r => [r.k, r.v]));
function standings() {
  const s = settings(), W = +s.win, D = +s.draw, L = +s.loss, T = {};
  for (const t of q('SELECT * FROM kl_teams')) T[t.id] = { id: t.id, name: t.name, short: t.short, color: t.color, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  for (const m of q('SELECT * FROM kl_matches WHERE played=1')) {
    const h = T[m.home_id], a = T[m.away_id]; if (!h || !a) continue;
    h.p++; a.p++; h.gf += m.hs; h.ga += m.aws; a.gf += m.aws; a.ga += m.hs;
    if (m.hs > m.aws) { h.w++; a.l++; h.pts += W; a.pts += L; } else if (m.hs < m.aws) { a.w++; h.l++; a.pts += W; h.pts += L; } else { h.d++; a.d++; h.pts += D; a.pts += D; }
  }
  return Object.values(T).map(t => ({ ...t, gd: t.gf - t.ga })).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name, 'tr'));
}
const league = () => ({ settings: settings(), teams: q('SELECT * FROM kl_teams ORDER BY name'), matches: q('SELECT * FROM kl_matches ORDER BY week,id'), table: standings() });
function fixture(double) {
  const ids = q('SELECT id FROM kl_teams ORDER BY id').map(t => t.id); if (ids.length < 2) throw E(400, 'En az 2 takım gerekli');
  if (one('SELECT 1 x FROM kl_matches WHERE played=1')) throw E(409, 'Oynanmış maç var; önce yeni sezon başlat veya maçları sil');
  const a = [...ids]; if (a.length % 2) a.push(null); const n = a.length, rounds = []; 
  for (let r = 0; r < n - 1; r++) { const R = []; for (let i = 0; i < n / 2; i++) { const x = a[i], y = a[n - 1 - i]; if (x && y) R.push(r % 2 ? [y, x] : [x, y]); } rounds.push(R); a.splice(1, 0, a.pop()); }
  tx(() => { run('DELETE FROM kl_matches'); let w = 1; for (const R of rounds) { for (const [h, g] of R) run('INSERT INTO kl_matches(week,home_id,away_id) VALUES(?,?,?)', w, h, g); w++; }
    if (double) for (const R of rounds) { for (const [h, g] of R) run('INSERT INTO kl_matches(week,home_id,away_id) VALUES(?,?,?)', w, g, h); w++; } });
  return rounds.length * (double ? 2 : 1);
}
const E = (code, msg) => Object.assign(new Error(msg), { code });
const int = (v, lo, hi, name) => { v = Number(v); if (!Number.isInteger(v) || v < lo || v > hi) throw E(400, `${name} geçersiz`); return v; };
const teamData = b => {
  const name = String(b.name || '').trim(); if (!name || name.length > 40) throw E(400, 'Takım adı 1-40 karakter olmalı');
  const color = /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#22c55e', short = String(b.short || '').trim().slice(0, 4).toUpperCase() || null;
  return [name, short, color];
};
function matchData(b, old = {}) {
  const m = { week: old.week ?? 1, home_id: old.home_id, away_id: old.away_id, hs: old.hs ?? 0, aws: old.aws ?? 0, played: old.played ?? 0, ...b };
  m.week = int(m.week, 1, 200, 'Hafta'); m.hs = int(m.hs, 0, 99, 'Skor'); m.aws = int(m.aws, 0, 99, 'Skor'); m.played = m.played ? 1 : 0;
  if (!one('SELECT 1 x FROM kl_teams WHERE id=?', m.home_id) || !one('SELECT 1 x FROM kl_teams WHERE id=?', m.away_id)) throw E(400, 'Takım bulunamadı');
  if (m.home_id === m.away_id) throw E(400, 'Bir takım kendisiyle oynayamaz'); return m;
}

// HTTP
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const send = (res, code, obj, h = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...h }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, no) => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e6) { no(E(413, 'Çok büyük')); req.destroy(); } }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch { no(E(400, 'Geçersiz JSON')); } }); });
const cookie = (v, age) => `kl_s=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

async function api(req, res, u) {
  const M = req.method, P = u.pathname, ip = req.socket.remoteAddress;
  if (M === 'GET' && P === '/api/league') return send(res, 200, league());
  if (M === 'GET' && P === '/api/me') return send(res, 200, { admin: isAdmin(req), needsSetup: needsSetup() });
  if (M !== 'GET' && req.headers['x-kl'] !== '1') throw E(403, 'Geçersiz istek');
  if (M === 'POST' && P === '/api/admin/setup') {
    const b = await body(req); if (!needsSetup() || !setupCode) throw E(409, 'Yönetici zaten oluşturulmuş');
    if (limited(ip)) throw E(429, 'Çok fazla deneme'); if (!eq(String(b.code || '').trim(), setupCode)) { fail(ip); throw E(403, 'Kurulum kodu yanlış'); }
    if (!pwOk(b.password)) throw E(400, 'Şifre en az 8 karakter olmalı');
    const salt = crypto.randomBytes(16).toString('hex'); run('INSERT INTO kl_admin(id,username,salt,hash) VALUES(1,?,?,?)', 'yusuf', salt, hashPw(b.password, salt)); setupCode = null;
    return send(res, 200, { ok: 1 }, { 'Set-Cookie': cookie(mkToken(), 43200) });
  }
  if (M === 'POST' && P === '/api/admin/login') {
    const b = await body(req); if (limited(ip)) throw E(429, 'Çok fazla deneme; 15 dk sonra tekrar dene');
    const a = one('SELECT * FROM kl_admin WHERE id=1'); const ok = a && String(b.username || '').toLowerCase() === a.username && eq(hashPw(String(b.password || ''), a.salt), a.hash);
    if (!ok) { fail(ip); throw E(401, 'Kullanıcı adı veya şifre hatalı'); } fails.delete(ip);
    return send(res, 200, { ok: 1 }, { 'Set-Cookie': cookie(mkToken(), 43200) });
  }
  if (M === 'POST' && P === '/api/admin/logout') return send(res, 200, { ok: 1 }, { 'Set-Cookie': cookie('', 0) });
  if (!P.startsWith('/api/admin/')) throw E(404, 'Bulunamadı');
  if (!isAdmin(req)) throw E(401, 'Yönetici girişi gerekli');
  const seg = P.split('/'), id = +seg[4], kind = seg[3];
  if (M === 'GET' && kind === 'backup') return send(res, 200, league(), { 'Content-Disposition': 'attachment; filename="kardesler-ligi-yedek.json"' });
  const b = M === 'DELETE' ? {} : await body(req);
  if (kind === 'password') {
    const a = one('SELECT * FROM kl_admin WHERE id=1'); if (!eq(hashPw(String(b.current || ''), a.salt), a.hash)) throw E(403, 'Mevcut şifre yanlış'); if (!pwOk(b.next)) throw E(400, 'Yeni şifre en az 8 karakter olmalı');
    const salt = crypto.randomBytes(16).toString('hex'); run('UPDATE kl_admin SET salt=?,hash=? WHERE id=1', salt, hashPw(b.next, salt)); return send(res, 200, { ok: 1 });
  }
  if (kind === 'teams') {
    try {
      if (M === 'POST') { const r = run('INSERT INTO kl_teams(name,short,color) VALUES(?,?,?)', ...teamData(b)); return send(res, 200, { id: Number(r.lastInsertRowid) }); }
      if (M === 'PUT') { if (!one('SELECT 1 x FROM kl_teams WHERE id=?', id)) throw E(404, 'Takım yok'); run('UPDATE kl_teams SET name=?,short=?,color=? WHERE id=?', ...teamData(b), id); return send(res, 200, { ok: 1 }); }
      if (M === 'DELETE') { run('DELETE FROM kl_teams WHERE id=?', id); return send(res, 200, { ok: 1 }); }
    } catch (e) { if (/UNIQUE/.test(e.message)) throw E(409, 'Bu isimde takım var'); throw e; }
  }
  if (kind === 'matches') {
    if (M === 'POST') { const m = matchData(b); const r = run('INSERT INTO kl_matches(week,home_id,away_id,hs,aws,played,updated) VALUES(?,?,?,?,?,?,?)', m.week, m.home_id, m.away_id, m.hs, m.aws, m.played, new Date().toISOString()); return send(res, 200, { id: Number(r.lastInsertRowid) }); }
    const old = one('SELECT * FROM kl_matches WHERE id=?', id); if (!old) throw E(404, 'Maç yok');
    if (M === 'PUT') { const m = matchData(b, old); run('UPDATE kl_matches SET week=?,home_id=?,away_id=?,hs=?,aws=?,played=?,updated=? WHERE id=?', m.week, m.home_id, m.away_id, m.hs, m.aws, m.played, new Date().toISOString(), id); return send(res, 200, { ok: 1 }); }
    if (M === 'DELETE') { run('DELETE FROM kl_matches WHERE id=?', id); return send(res, 200, { ok: 1 }); }
  }
  if (kind === 'fixture' && M === 'POST') return send(res, 200, { weeks: fixture(!!b.double) });
  if (kind === 'season' && M === 'POST') { const n = String(b.name || '').trim(); if (!n) throw E(400, 'Sezon adı gerekli'); tx(() => { run('DELETE FROM kl_matches'); run("UPDATE kl_settings SET v=? WHERE k='season'", n); run("UPDATE kl_settings SET v='1' WHERE k='week'"); }); return send(res, 200, { ok: 1 }); }
  if (kind === 'settings' && M === 'PUT') {
    const v = { name: String(b.name || '').trim().slice(0, 40), season: String(b.season || '').trim().slice(0, 20), win: int(b.win, 0, 10, 'Puan'), draw: int(b.draw, 0, 10, 'Puan'), loss: int(b.loss, 0, 10, 'Puan'), week: int(b.week, 1, 200, 'Hafta') };
    if (!v.name || !v.season) throw E(400, 'Lig ve sezon adı gerekli'); tx(() => { for (const [k, x] of Object.entries(v)) run('UPDATE kl_settings SET v=? WHERE k=?', String(x), k); }); return send(res, 200, { ok: 1 });
  }
  throw E(404, 'Bulunamadı');
}

const PUB = path.join(__dirname, 'public');
http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/api/')) return await api(req, res, u);
    let f = path.normalize(path.join(PUB, u.pathname === '/' ? 'index.html' : u.pathname));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || !fs.statSync(f).isFile()) f = path.join(PUB, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  } catch (e) { if (!e.code) console.error(e); if (!res.headersSent) send(res, e.code || 500, { error: e.code ? e.message : 'Sunucu hatası' }); }
}).listen(PORT, () => console.log(`Kardeşler Ligi: http://localhost:${PORT}`));
