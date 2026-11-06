'use strict';
// Kardeşler Ligi — takım tabanlı lig. Veritabanı: PostgreSQL (Neon), bağlantı: DATABASE_URL.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { Pool } = require('pg');
const { ADMIN, TEAMS, MATCHES, SETTINGS, SECRETS, DDL } = require('./schema')(process.env.KL_PREFIX || 'kl_');
const PORT = +process.env.PORT || 3000;
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('HATA: DATABASE_URL tanımlı değil. Yerelde: node --env-file=.env.local server.js — Render\'da: Environment bölümüne ekleyin.'); process.exit(1); }
const needSsl = !/sslmode=/.test(DB_URL) && !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(DB_URL);
const pool = new Pool({ connectionString: DB_URL, max: +process.env.PG_POOL_MAX || 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 20000, ...(needSsl ? { ssl: true } : {}) });
pool.on('error', e => console.error('PG havuz hatası:', e.message));

// Veri erişimi: q = satırlar, one = ilk satır, run = ham sonuç. Parametreler $1,$2,...
const bind = ex => ({ q: async (s, ...p) => (await ex(s, p)).rows, one: async (s, ...p) => (await ex(s, p)).rows[0], run: (s, ...p) => ex(s, p) });
const { q, one, run } = bind((s, p) => pool.query(s, p));
async function tx(f) {
  const c = await pool.connect(); let broken = false;
  try { await c.query('BEGIN'); const r = await f(bind((s, p) => c.query(s, p))); await c.query('COMMIT'); return r; }
  catch (e) { try { await c.query('ROLLBACK'); } catch { broken = true; } throw e; }
  finally { c.release(broken); }
}

const DEF = { name: 'Kardeşler Ligi', season: '2026', win: '3', draw: '1', loss: '0', week: '1' };
async function init() {
  await tx(async t => {
    await t.run('SELECT pg_advisory_xact_lock(724119)'); // aynı anda iki örnek şema kurmasın
    for (const s of DDL) await t.run(s);
    for (const [k, v] of Object.entries(DEF)) await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES($1,$2) ON CONFLICT DO NOTHING`, k, v);
  });
}

// Güvenlik: scrypt parola, HMAC imzalı oturum çerezi, tek seferlik kurulum kodu.
let SECRET = '';
async function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  let r = await one(`SELECT v FROM ${SECRETS} WHERE k='session'`); if (r) return r.v;
  await run(`INSERT INTO ${SECRETS}(k,v) VALUES('session',$1) ON CONFLICT DO NOTHING`, crypto.randomBytes(48).toString('hex'));
  return (await one(`SELECT v FROM ${SECRETS} WHERE k='session'`)).v;
}
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const eq = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const mkToken = () => { const e = Date.now() + 12 * 36e5; return `${e}.${sign('s' + e)}`; };
const isAdmin = req => { const m = /(?:^|; )kl_s=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return false; const [e, s] = m[1].split('.'); return +e > Date.now() && s && eq(s, sign('s' + e)); };
const needsSetup = async () => !(await one(`SELECT 1 x FROM ${ADMIN}`));
let setupCode = null;
const fails = new Map();
const limited = ip => { const f = fails.get(ip); return f && f.n >= 8 && Date.now() - f.t < 15 * 6e4; };
const fail = ip => { const f = fails.get(ip) || { n: 0 }; fails.set(ip, { n: f.n + 1, t: Date.now() }); };
const pwOk = p => typeof p === 'string' && p.length >= 8 && p.length <= 100;

// Lig mantığı
const MAXID = 2147483647;
const E = (code, msg) => Object.assign(new Error(msg), { code });
const int = (v, lo, hi, name) => { v = Number(v); if (!Number.isInteger(v) || v < lo || v > hi) throw E(400, `${name} geçersiz`); return v; };
const okId = id => Number.isInteger(id) && id > 0 && id <= MAXID;
const clean = s => String(s ?? '').replace(/\u0000/g, '').trim();
const settings = async () => Object.fromEntries((await q(`SELECT k,v FROM ${SETTINGS}`)).map(r => [r.k, r.v]));
async function standings() {
  const s = await settings(), W = +s.win, D = +s.draw, L = +s.loss, T = {};
  for (const t of await q(`SELECT * FROM ${TEAMS}`)) T[t.id] = { id: t.id, name: t.name, short: t.short, color: t.color, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  for (const m of await q(`SELECT * FROM ${MATCHES} WHERE played=1`)) {
    const h = T[m.home_id], a = T[m.away_id]; if (!h || !a) continue;
    h.p++; a.p++; h.gf += m.hs; h.ga += m.aws; a.gf += m.aws; a.ga += m.hs;
    if (m.hs > m.aws) { h.w++; a.l++; h.pts += W; a.pts += L; } else if (m.hs < m.aws) { a.w++; h.l++; a.pts += W; h.pts += L; } else { h.d++; a.d++; h.pts += D; a.pts += D; }
  }
  return Object.values(T).map(t => ({ ...t, gd: t.gf - t.ga })).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name, 'tr'));
}
const league = async () => ({ settings: await settings(), teams: await q(`SELECT * FROM ${TEAMS} ORDER BY name`), matches: await q(`SELECT * FROM ${MATCHES} ORDER BY week,id`), table: await standings() });
async function insertMatches(t, rows) { // [hafta, ev, deplasman] — toplu ekleme (Neon'da gidiş-dönüş sayısını azaltır)
  for (let i = 0; i < rows.length; i += 500) {
    const ch = rows.slice(i, i + 500);
    await t.run(`INSERT INTO ${MATCHES}(week,home_id,away_id) VALUES ${ch.map((_, j) => `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`).join(',')}`, ...ch.flat());
  }
}
async function fixture(double) {
  const ids = (await q(`SELECT id FROM ${TEAMS} ORDER BY id`)).map(t => t.id); if (ids.length < 2) throw E(400, 'En az 2 takım gerekli');
  if (await one(`SELECT 1 x FROM ${MATCHES} WHERE played=1`)) throw E(409, 'Oynanmış maç var; önce yeni sezon başlat veya maçları sil');
  const a = [...ids]; if (a.length % 2) a.push(null); const n = a.length, rounds = [];
  for (let r = 0; r < n - 1; r++) { const R = []; for (let i = 0; i < n / 2; i++) { const x = a[i], y = a[n - 1 - i]; if (x && y) R.push(r % 2 ? [y, x] : [x, y]); } rounds.push(R); a.splice(1, 0, a.pop()); }
  const rows = []; let w = 1;
  for (const R of rounds) { for (const [h, g] of R) rows.push([w, h, g]); w++; }
  if (double) for (const R of rounds) { for (const [h, g] of R) rows.push([w, g, h]); w++; }
  await tx(async t => { await t.run(`DELETE FROM ${MATCHES}`); await insertMatches(t, rows); });
  return rounds.length * (double ? 2 : 1);
}
const teamData = b => {
  const name = clean(b.name); if (!name || name.length > 40) throw E(400, 'Takım adı 1-40 karakter olmalı');
  const color = /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#22c55e', short = clean(b.short).slice(0, 4).toUpperCase() || null;
  return [name, short, color];
};
async function matchData(b, old = {}) {
  const m = { week: old.week ?? 1, home_id: old.home_id, away_id: old.away_id, hs: old.hs ?? 0, aws: old.aws ?? 0, played: old.played ?? 0, ...b };
  m.week = int(m.week, 1, 200, 'Hafta'); m.hs = int(m.hs, 0, 99, 'Skor'); m.aws = int(m.aws, 0, 99, 'Skor'); m.played = m.played ? 1 : 0;
  m.home_id = int(m.home_id, 1, MAXID, 'Takım'); m.away_id = int(m.away_id, 1, MAXID, 'Takım');
  if (!(await one(`SELECT 1 x FROM ${TEAMS} WHERE id=$1`, m.home_id)) || !(await one(`SELECT 1 x FROM ${TEAMS} WHERE id=$1`, m.away_id))) throw E(400, 'Takım bulunamadı');
  if (m.home_id === m.away_id) throw E(400, 'Bir takım kendisiyle oynayamaz'); return m;
}

// HTTP
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const send = (res, code, obj, h = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...h }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, no) => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e6) { no(E(413, 'Çok büyük')); req.destroy(); } }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch { no(E(400, 'Geçersiz JSON')); } }); });
const cookie = (v, age) => `kl_s=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

async function api(req, res, u) {
  const M = req.method, P = u.pathname, ip = req.socket.remoteAddress;
  if (M === 'GET' && P === '/api/league') return send(res, 200, await league());
  if (M === 'GET' && P === '/api/me') return send(res, 200, { admin: isAdmin(req), needsSetup: await needsSetup() });
  if (M !== 'GET' && req.headers['x-kl'] !== '1') throw E(403, 'Geçersiz istek');
  if (M === 'POST' && P === '/api/admin/setup') {
    const b = await body(req); if (!(await needsSetup()) || !setupCode) throw E(409, 'Yönetici zaten oluşturulmuş');
    if (limited(ip)) throw E(429, 'Çok fazla deneme'); if (!eq(String(b.code || '').trim(), setupCode)) { fail(ip); throw E(403, 'Kurulum kodu yanlış'); }
    if (!pwOk(b.password)) throw E(400, 'Şifre en az 8 karakter olmalı');
    const salt = crypto.randomBytes(16).toString('hex'); await run(`INSERT INTO ${ADMIN}(id,username,salt,hash) VALUES(1,$1,$2,$3)`, 'yusuf', salt, hashPw(b.password, salt)); setupCode = null;
    return send(res, 200, { ok: 1 }, { 'Set-Cookie': cookie(mkToken(), 43200) });
  }
  if (M === 'POST' && P === '/api/admin/login') {
    const b = await body(req); if (limited(ip)) throw E(429, 'Çok fazla deneme; 15 dk sonra tekrar dene');
    const a = await one(`SELECT * FROM ${ADMIN} WHERE id=1`); const ok = a && String(b.username || '').toLowerCase() === a.username && eq(hashPw(String(b.password || ''), a.salt), a.hash);
    if (!ok) { fail(ip); throw E(401, 'Kullanıcı adı veya şifre hatalı'); } fails.delete(ip);
    return send(res, 200, { ok: 1 }, { 'Set-Cookie': cookie(mkToken(), 43200) });
  }
  if (M === 'POST' && P === '/api/admin/logout') return send(res, 200, { ok: 1 }, { 'Set-Cookie': cookie('', 0) });
  if (!P.startsWith('/api/admin/')) throw E(404, 'Bulunamadı');
  if (!isAdmin(req)) throw E(401, 'Yönetici girişi gerekli');
  const seg = P.split('/'), id = +seg[4], kind = seg[3];
  if (M === 'GET' && kind === 'backup') return send(res, 200, await league(), { 'Content-Disposition': 'attachment; filename="kardesler-ligi-yedek.json"' });
  const b = M === 'DELETE' ? {} : await body(req);
  if (kind === 'password') {
    const a = await one(`SELECT * FROM ${ADMIN} WHERE id=1`); if (!eq(hashPw(String(b.current || ''), a.salt), a.hash)) throw E(403, 'Mevcut şifre yanlış'); if (!pwOk(b.next)) throw E(400, 'Yeni şifre en az 8 karakter olmalı');
    const salt = crypto.randomBytes(16).toString('hex'); await run(`UPDATE ${ADMIN} SET salt=$1,hash=$2 WHERE id=1`, salt, hashPw(b.next, salt)); return send(res, 200, { ok: 1 });
  }
  if (kind === 'teams') {
    try {
      if (M === 'POST') { const r = await run(`INSERT INTO ${TEAMS}(name,short,color) VALUES($1,$2,$3) RETURNING id`, ...teamData(b)); return send(res, 200, { id: Number(r.rows[0].id) }); }
      if (M === 'PUT' || M === 'DELETE') if (!okId(id)) throw E(404, 'Takım yok');
      if (M === 'PUT') { if (!(await one(`SELECT 1 x FROM ${TEAMS} WHERE id=$1`, id))) throw E(404, 'Takım yok'); await run(`UPDATE ${TEAMS} SET name=$1,short=$2,color=$3 WHERE id=$4`, ...teamData(b), id); return send(res, 200, { ok: 1 }); }
      if (M === 'DELETE') { await run(`DELETE FROM ${TEAMS} WHERE id=$1`, id); return send(res, 200, { ok: 1 }); }
    } catch (e) { if (e.code === '23505') throw E(409, 'Bu isimde takım var'); throw e; }
  }
  if (kind === 'matches') {
    if (M === 'POST') { const m = await matchData(b); const r = await run(`INSERT INTO ${MATCHES}(week,home_id,away_id,hs,aws,played,updated) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, m.week, m.home_id, m.away_id, m.hs, m.aws, m.played, new Date().toISOString()); return send(res, 200, { id: Number(r.rows[0].id) }); }
    if (!okId(id)) throw E(404, 'Maç yok');
    const old = await one(`SELECT * FROM ${MATCHES} WHERE id=$1`, id); if (!old) throw E(404, 'Maç yok');
    if (M === 'PUT') { const m = await matchData(b, old); await run(`UPDATE ${MATCHES} SET week=$1,home_id=$2,away_id=$3,hs=$4,aws=$5,played=$6,updated=$7 WHERE id=$8`, m.week, m.home_id, m.away_id, m.hs, m.aws, m.played, new Date().toISOString(), id); return send(res, 200, { ok: 1 }); }
    if (M === 'DELETE') { await run(`DELETE FROM ${MATCHES} WHERE id=$1`, id); return send(res, 200, { ok: 1 }); }
  }
  if (kind === 'fixture' && M === 'POST') return send(res, 200, { weeks: await fixture(!!b.double) });
  if (kind === 'season' && M === 'POST') { const n = clean(b.name); if (!n) throw E(400, 'Sezon adı gerekli'); await tx(async t => { await t.run(`DELETE FROM ${MATCHES}`); await t.run(`UPDATE ${SETTINGS} SET v=$1 WHERE k='season'`, n); await t.run(`UPDATE ${SETTINGS} SET v='1' WHERE k='week'`); }); return send(res, 200, { ok: 1 }); }
  if (kind === 'settings' && M === 'PUT') {
    const v = { name: clean(b.name).slice(0, 40), season: clean(b.season).slice(0, 20), win: int(b.win, 0, 10, 'Puan'), draw: int(b.draw, 0, 10, 'Puan'), loss: int(b.loss, 0, 10, 'Puan'), week: int(b.week, 1, 200, 'Hafta') };
    if (!v.name || !v.season) throw E(400, 'Lig ve sezon adı gerekli'); await tx(async t => { for (const [k, x] of Object.entries(v)) await t.run(`UPDATE ${SETTINGS} SET v=$1 WHERE k=$2`, String(x), k); }); return send(res, 200, { ok: 1 });
  }
  throw E(404, 'Bulunamadı');
}

const PUB = path.join(__dirname, 'public');
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/api/')) return await api(req, res, u);
    let f = path.normalize(path.join(PUB, u.pathname === '/' ? 'index.html' : u.pathname));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || !fs.statSync(f).isFile()) f = path.join(PUB, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).on('error', () => res.destroy()).pipe(res);
  } catch (e) { const mine = Number.isInteger(e.code); if (!mine) console.error(e); if (!res.headersSent) send(res, mine ? e.code : 500, { error: mine ? e.message : 'Sunucu hatası' }); }
});

(async () => {
  try {
    await init(); SECRET = await loadSecret();
    if (await needsSetup()) { setupCode = crypto.randomBytes(5).toString('hex'); console.log(`\n>>> YÖNETİCİ KURULUM KODU (yalnızca bu oturum için): ${setupCode}\n>>> Sitenin /#/yonetici adresinde bu kodla Yusuf'un şifresini belirle.\n`); }
  } catch (e) { console.error('Veritabanı başlatılamadı:', e.message); process.exit(1); }
  server.listen(PORT, () => console.log(`Kardeşler Ligi: http://localhost:${PORT}`));
})();
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { server.close(); pool.end().finally(() => process.exit(0)); });
