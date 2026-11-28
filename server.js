// === KRD_MEGA_PACK_START ===
const krdLoginGuard = new Map();
const krdAuditTrail = [];
function pushAudit(action, detail) {
  krdAuditTrail.unshift({ ts: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }), action, detail });
  if (krdAuditTrail.length > 40) krdAuditTrail.length = 40;
}
// === KRD_MEGA_PACK_END ===
'use strict';
// KRD Ligi — takım tabanlı lig. Veritabanı: PostgreSQL (Neon), bağlantı: DATABASE_URL.

// === KRD_SEC_GUARD ===
const _krdRateMap = new Map();
const _krdRateCleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of _krdRateMap.entries()) {
    const valid = arr.filter(t => now - t < 60000);
    if (!valid.length) _krdRateMap.delete(k); else _krdRateMap.set(k, valid);
  }
}, 60000);
_krdRateCleanup.unref?.();
const _krdLoginFail = new Map();
function krdCheckRate(ip, key, maxPerMin) {
  const now = Date.now();
  const k = ip + ':' + key;
  const arr = (_krdRateMap.get(k) || []).filter(t => now - t < 60000);
  if (arr.length >= maxPerMin) return false;
  arr.push(now);
  _krdRateMap.set(k, arr);
  return true;
}
function krdGetIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '');
  if (fwd) {
    const parts = fwd.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return String(req.socket?.remoteAddress || '0.0.0.0');
}

const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { Pool } = require('pg');
let webpush = null; try { webpush = require('web-push'); } catch (e) { console.warn('web-push yuklenemedi:', e.message); }
const { ADMIN, TEAMS, MATCHES, SETTINGS, SECRETS, GOALS, ARCHIVES, DDL } = require('./schema')(process.env.KL_PREFIX || 'kl_');
const PORT = +process.env.PORT || 3000;
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('HATA: DATABASE_URL tanımlı değil. Yerelde: node --env-file=.env.local server.js — Render\'da: Environment bölümüne ekleyin.'); process.exit(1); }
const needSsl = !/sslmode=/.test(DB_URL) && !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(DB_URL);
const pool = new Pool({ connectionString: DB_URL, max: +process.env.PG_POOL_MAX || 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 20000, ...(needSsl ? { ssl: true } : {}) });
pool.on('error', e => console.error('PG havuz hatası:', e.message));

const bind = ex => ({ q: async (s, ...p) => (await ex(s, p)).rows, one: async (s, ...p) => (await ex(s, p)).rows[0], run: (s, ...p) => ex(s, p) });
const { q, one, run } = bind((s, p) => pool.query(s, p));
async function tx(f) {
  const c = await pool.connect(); let broken = false;
  try { await c.query('BEGIN'); const r = await f(bind((s, p) => c.query(s, p))); await c.query('COMMIT'); return r; }
  catch (e) { try { await c.query('ROLLBACK'); } catch { broken = true; } throw e; }
  finally { c.release(broken); }
}

const DEF = { name: 'KRD Ligi', season: '2026', win: '3', draw: '1', loss: '0', week: '1' };
async function init() {
  await tx(async t => {
    await t.run('SELECT pg_advisory_xact_lock(724119)');
    for (const s of DDL) await t.run(s);
    for (const [k, v] of Object.entries(DEF)) await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES($1,$2) ON CONFLICT DO NOTHING`, k, v);
  });
}

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
const mkToken = (uname = 'Yusuf') => {
  const e = Date.now() + 12 * 36e5;
  const u = Buffer.from(String(uname || 'Yusuf'), 'utf8').toString('base64url');
  return `${e}.${u}.${sign('s' + e + '.' + u)}`;
};
const getAdminUser = req => {
  const m = /(?:^|; )kl_s=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length === 3) {
    const [e, u, s] = parts;
    if (+e > Date.now() && s && eq(s, sign('s' + e + '.' + u))) {
      try { return Buffer.from(u, 'base64url').toString('utf8') || 'Yusuf'; } catch { return 'Yusuf'; }
    }
    return null;
  }
  if (parts.length === 2) {
    const [e, s] = parts;
    if (+e > Date.now() && s && eq(s, sign('s' + e))) return 'Yusuf';
  }
  return null;
};
const isAdmin = req => !!getAdminUser(req);
const DEFAULT_SUB_PERMS = ['m', 't', 'c', 'f', 'canli'];
const ALL_ADMIN_PERMS = ['m', 't', 'c', 'f', 's', 'kupa', 'canli', 'bildirim', 'yetki'];

async function getAdminSessionInfo(req) {
  const uname = getAdminUser(req);
  if (!uname) return null;
  const aRow = await one(`SELECT username FROM ${ADMIN} WHERE id=1`);
  const primaryName = (aRow && aRow.username) ? String(aRow.username) : 'yusuf';
  const isPrimary = uname.toLowerCase() === primaryName.toLowerCase() || uname.toLowerCase() === 'yusuf';
  if (isPrimary) {
    return { admin: true, username: uname, isPrimary: true, perms: ALL_ADMIN_PERMS.slice() };
  }
  const extra = await getSettingJson('extra_admins', []);
  const found = (Array.isArray(extra) ? extra : []).find(x => String(x.username || '').toLowerCase() === uname.toLowerCase());
  if (!found) return null; // Kaldirilmis yonetici aninda duser
  const perms = Array.isArray(found.perms) ? found.perms : DEFAULT_SUB_PERMS.slice();
  return { admin: true, username: found.username, isPrimary: false, perms };
}

const needsSetup = async () => !(await one(`SELECT 1 x FROM ${ADMIN}`));
let setupCode = null;
const fails = new Map();
const limited = ip => { const f = fails.get(ip); return f && f.n >= 8 && Date.now() - f.t < 15 * 6e4; };
const fail = ip => { const f = fails.get(ip) || { n: 0 }; fails.set(ip, { n: f.n + 1, t: Date.now() }); };
const pwOk = p => typeof p === 'string' && p.length >= 8 && p.length <= 100;

const MAXID = 2147483647;
const E = (code, msg) => Object.assign(new Error(msg), { code });
const int = (v, lo, hi, name) => { v = Number(v); if (!Number.isInteger(v) || v < lo || v > hi) throw E(400, `${name} geçersiz`); return v; };
const okId = id => Number.isInteger(id) && id > 0 && id <= MAXID;
const clean = s => String(s ?? '').replace(/\u0000/g, '').trim();
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const settings = async () => Object.fromEntries((await q(`SELECT k,v FROM ${SETTINGS}`)).map(r => [r.k, r.v]));
async function standings() {
  const s = await settings(), W = +s.win, D = +s.draw, L = +s.loss, T = {};
  for (const t of await q(`SELECT * FROM ${TEAMS}`)) T[t.id] = { id: t.id, name: t.name, short: t.short, color: t.color, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  for (const m of await q(`SELECT * FROM ${MATCHES} WHERE played=1`)) {
    const h = T[m.home_id], a = T[m.away_id]; if (!h || !a) continue;
    h.p++; a.p++; h.gf += m.hs; h.ga += m.aws; a.gf += m.aws; a.ga += m.hs;
    if (m.hs > m.aws) { h.w++; a.l++; h.pts += W; a.pts += L; } else if (m.hs < m.aws) { a.w++; h.l++; a.pts += W; h.pts += L; } else { h.d++; a.d++; h.pts += D; a.pts += D; }
  }
  let penList = [];
  try { penList = JSON.parse(s.penalties || '[]'); } catch {}
  for (const x of penList) {
    const tm = T[x.team_id];
    if (tm) { const d = Number(x.pts) || 0; tm.pts += d; tm.adj = (tm.adj || 0) + d; }
  }
  return Object.values(T).map(t => ({ ...t, gd: t.gf - t.ga })).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name, 'tr'));
}
const league = async () => ({
  settings: await settings(),
  teams: await q(`SELECT * FROM ${TEAMS} ORDER BY name`),
  matches: await q(`SELECT * FROM ${MATCHES} ORDER BY week,id`),
  table: await standings(),
  goals: await q(`SELECT * FROM ${GOALS} ORDER BY id`),
  archives: await q(`SELECT * FROM ${ARCHIVES} ORDER BY id DESC`)
});
async function insertMatches(t, rows) {
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
  const m = { week: old.week ?? 1, home_id: old.home_id, away_id: old.away_id, hs: old.hs ?? 0, aws: old.aws ?? 0, played: old.played ?? 0, note: old.note ?? '', ...b };
  m.week = int(m.week, 1, 200, 'Hafta'); m.hs = int(m.hs, 0, 99, 'Skor'); m.aws = int(m.aws, 0, 99, 'Skor'); m.played = m.played ? 1 : 0;
  m.note = clean(m.note).slice(0, 80);
  m.home_id = int(m.home_id, 1, MAXID, 'Takım'); m.away_id = int(m.away_id, 1, MAXID, 'Takım');
  if (!(await one(`SELECT 1 x FROM ${TEAMS} WHERE id=$1`, m.home_id)) || !(await one(`SELECT 1 x FROM ${TEAMS} WHERE id=$1`, m.away_id))) throw E(400, 'Takım bulunamadı');
  if (m.home_id === m.away_id) throw E(400, 'Bir takım kendisiyle oynayamaz'); return m;
}

async function restoreBackup(b) {
  if (!b || typeof b !== 'object' || !Array.isArray(b.teams) || !Array.isArray(b.matches) || !b.settings || typeof b.settings !== 'object') {
    throw E(400, 'Geçersiz yedek dosyası biçimi');
  }
  const s = b.settings;
  const newSet = {
    name: clean(s.name || DEF.name).slice(0, 40) || DEF.name,
    season: clean(s.season || DEF.season).slice(0, 20) || DEF.season,
    win: String(int(s.win ?? DEF.win, 0, 10, 'Puan')),
    draw: String(int(s.draw ?? DEF.draw, 0, 10, 'Puan')),
    loss: String(int(s.loss ?? DEF.loss, 0, 10, 'Puan')),
    week: String(int(s.week ?? DEF.week, 1, 200, 'Hafta'))
  };

  const teamIds = new Set();
  const cleanTeams = b.teams.map(tm => {
    const id = int(tm.id, 1, MAXID, 'Takım ID');
    if (teamIds.has(id)) throw E(400, 'Yedekte tekrarlayan takım ID var');
    teamIds.add(id);
    const [name, short, color] = teamData(tm);
    return { id, name, short, color };
  });

  const matchIds = new Set();
  const cleanMatches = b.matches.map(m => {
    const id = int(m.id, 1, MAXID, 'Maç ID');
    if (matchIds.has(id)) throw E(400, 'Yedekte tekrarlayan maç ID var');
    matchIds.add(id);
    const week = int(m.week, 1, 200, 'Hafta');
    const home_id = int(m.home_id, 1, MAXID, 'Ev sahibi');
    const away_id = int(m.away_id, 1, MAXID, 'Deplasman');
    if (!teamIds.has(home_id) || !teamIds.has(away_id) || home_id === away_id) throw E(400, 'Yedekte geçersiz maç takımı var');
    const hs = int(m.hs ?? 0, 0, 99, 'Skor');
    const aws = int(m.aws ?? 0, 0, 99, 'Skor');
    const played = m.played ? 1 : 0;
    const updated = m.updated ? clean(m.updated).slice(0, 40) : null;
    const note = clean(m.note).slice(0, 80);
    return { id, week, home_id, away_id, hs, aws, played, updated, note };
  });

  const cleanGoals = (Array.isArray(b.goals) ? b.goals : []).map(g => {
    const id = int(g.id, 1, MAXID, 'Gol ID');
    const match_id = int(g.match_id, 1, MAXID, 'Maç ID');
    const team_id = int(g.team_id, 1, MAXID, 'Takım ID');
    if (!matchIds.has(match_id) || !teamIds.has(team_id)) throw E(400, 'Yedekte geçersiz gol kaydı var');
    const player = clean(g.player).slice(0, 40);
    if (!player) throw E(400, 'Yedekte boş oyuncu adı var');
    const goals = int(g.goals ?? 1, 0, 50, 'Gol');
    const assists = int(g.assists ?? 0, 0, 50, 'Asist');
    return { id, match_id, team_id, player, goals, assists };
  });

  const cleanArchives = (Array.isArray(b.archives) ? b.archives : []).map(a => {
    const id = int(a.id, 1, MAXID, 'Arşiv ID');
    const season = clean(a.season).slice(0, 20) || 'Sezon';
    const champion = clean(a.champion).slice(0, 40) || 'Şampiyon';
    const data = typeof a.data === 'string' ? a.data : JSON.stringify(a.data || []);
    const archived_at = a.archived_at ? clean(a.archived_at).slice(0, 40) : null;
    return { id, season, champion, data, archived_at };
  });

  await tx(async t => {
    await t.run(`DELETE FROM ${GOALS}`);
    await t.run(`DELETE FROM ${MATCHES}`);
    await t.run(`DELETE FROM ${TEAMS}`);
    await t.run(`DELETE FROM ${ARCHIVES}`);
    for (const [k, v] of Object.entries(newSet)) {
      await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES($1,$2) ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v`, k, v);
    }
    for (const tm of cleanTeams) {
      await t.run(`INSERT INTO ${TEAMS}(id,name,short,color) VALUES($1,$2,$3,$4)`, tm.id, tm.name, tm.short, tm.color);
    }
    for (const m of cleanMatches) {
      await t.run(`INSERT INTO ${MATCHES}(id,week,home_id,away_id,hs,aws,played,updated,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        m.id, m.week, m.home_id, m.away_id, m.hs, m.aws, m.played, m.updated, m.note);
    }
    for (const g of cleanGoals) {
      await t.run(`INSERT INTO ${GOALS}(id,match_id,team_id,player,goals,assists) VALUES($1,$2,$3,$4,$5,$6)`,
        g.id, g.match_id, g.team_id, g.player, g.goals, g.assists);
    }
    for (const a of cleanArchives) {
      await t.run(`INSERT INTO ${ARCHIVES}(id,season,champion,data,archived_at) VALUES($1,$2,$3,$4,$5)`,
        a.id, a.season, a.champion, a.data, a.archived_at);
    }
    for (const tbl of [TEAMS, MATCHES, GOALS, ARCHIVES]) {
      await t.run(`SELECT setval(pg_get_serial_sequence('${tbl}', 'id'), COALESCE((SELECT MAX(id) FROM ${tbl}), 1), (SELECT MAX(id) IS NOT NULL FROM ${tbl}))`);
    }
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
const send = (res, code, obj, h = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...h }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, no) => { let d = ''; req.on('data', c => { d += c; if (d.length > 2e6) { no(E(413, 'Çok büyük')); req.destroy(); } }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch { no(E(400, 'Geçersiz JSON')); } }); });
const cookie = (v, age) => `kl_s=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

async function api(req, res, u) {
  const M = req.method, P = u.pathname, ip = (typeof krdGetIp === 'function' ? krdGetIp(req) : req.socket.remoteAddress);
  if (M === 'GET' && P === '/api/league') return send(res, 200, await league());
  if (M === 'GET' && P === '/api/music-list') {
    const dir = path.join(__dirname, 'public', 'music');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /.(mp3|ogg|wav|m4a)$/i.test(f)).map(f => ({ name: f.replace(/.[^.]+$/, ''), url: '/music/' + encodeURIComponent(f) })) : [];
    return send(res, 200, { tracks: files });
  }
  if (M === 'GET' && P === '/api/me') { const info = await getAdminSessionInfo(req); return send(res, 200, { admin: !!info, username: info ? info.username : '', isPrimary: info ? info.isPrimary : false, perms: info ? info.perms : [], needsSetup: await needsSetup() }); }
  if (M !== 'GET' && req.headers['x-kl'] !== '1') throw E(403, 'Geçersiz istek');
  if (M === 'POST' && P === '/api/admin/setup') {
    const b = await body(req); if (!(await needsSetup()) || !setupCode) throw E(409, 'Yönetici zaten oluşturulmuş');
    if (limited(ip)) throw E(429, 'Çok fazla deneme'); if (!eq(String(b.code || '').trim(), setupCode)) { fail(ip); throw E(403, 'Kurulum kodu yanlış'); }
    if (!pwOk(b.password)) throw E(400, 'Şifre en az 8 karakter olmalı');
    const salt = crypto.randomBytes(16).toString('hex'); await run(`INSERT INTO ${ADMIN}(id,username,salt,hash) VALUES(1,$1,$2,$3)`, 'yusuf', salt, hashPw(b.password, salt)); setupCode = null;
    return send(res, 200, { ok: 1 }, { 'Set-Cookie': cookie(mkToken(), 43200) });
  }
  if (req.method === 'POST' && u.pathname === '/api/admin/login') {
    const b = await body(req); if (limited(ip)) throw E(429, 'Çok fazla deneme; 15 dk sonra tekrar dene');
    const inUser = String(b.username || '').trim().toLowerCase();
    const inPass = String(b.password || '');
    const a = await one(`SELECT * FROM ${ADMIN} WHERE id=1`);
    let matchedUser = null;
    if (a && inUser === String(a.username || '').toLowerCase() && eq(hashPw(inPass, a.salt), a.hash)) {
      matchedUser = a.username;
    } else if (typeof getSettingJson === 'function') {
      const extra = await getSettingJson('extra_admins', []);
      const found = (Array.isArray(extra) ? extra : []).find(x => String(x.username || '').toLowerCase() === inUser);
      if (found && found.salt && found.hash && eq(hashPw(inPass, found.salt), found.hash)) {
        matchedUser = found.username;
      }
    }
    if (!matchedUser) {
      fail(ip);
      if (typeof recordAuditLog === 'function') await recordAuditLog(inUser || 'Bilinmiyor', '❌ Hatalı Giriş Denemesi', req);
      throw E(401, 'Kullanıcı adı veya şifre hatalı');
    }
    fails.delete(ip);
    if (typeof recordAuditLog === 'function') await recordAuditLog(matchedUser, '🟢 Yönetici Girişi Yaptı', req);
    const isPrimLogin = a && String(matchedUser).toLowerCase() === String(a.username || '').toLowerCase(); return send(res, 200, { ok: 1, username: matchedUser, isPrimary: !!isPrimLogin }, { 'Set-Cookie': cookie(mkToken(matchedUser), 43200) });
  }
  if (M === 'POST' && P === '/api/admin/logout') {
    const outUser = getAdminUser(req) || 'Yönetici'; if (typeof recordAuditLog === 'function') await recordAuditLog(outUser, '🔴 Oturumu Kapattı (Çıkış)', req);
    return send(res, 200, { ok: 1 }, { 'Set-Cookie': cookie('', 0) });
  }
  // === KRD_HARD_AUTH_GUARD ===
  if ((M !== 'GET' && P === '/api/krd-extras') || P.startsWith('/api/admin/')) {
    const sess = await getAdminSessionInfo(req);
    if (!sess) throw E(401, 'Yönetici girişi gerekli');
    if (!sess.isPrimary) {
      const pSet = new Set(sess.perms || []);
      const needPerm = (
        P.startsWith('/api/admin/users') || P === '/api/admin/slug' || P === '/api/admin/email-notify' ? 'yetki' :
        P === '/api/admin/announce' ? 'bildirim' :
        P === '/api/admin/settings' ? 's' :
        P === '/api/krd-extras' || P === '/api/admin/krd-pro5-save' || P === '/api/admin/extras' ? 'kupa' :
        P.startsWith('/api/admin/penalties') ? 'c' :
        P.startsWith('/api/admin/teams') ? 't' :
        P.startsWith('/api/admin/matches') ? 'm' : null
      );
      if (needPerm && !pSet.has(needPerm)) {
        throw E(403, 'Bu işlem için ana yönetici (Yusuf) tarafından verilmiş yetkiniz yok.');
      }
    }
    if (M !== 'GET' && P !== '/api/admin/login' && P !== '/api/admin/logout' && P !== '/api/admin/users' && P !== '/api/admin/users/delete' && typeof recordAuditLog === 'function') {
      const actor = getAdminUser(req) || 'Yönetici';
      const actionMap = {
        '/api/krd-extras': '⚙️ Duyuru / Bakım / Kurallar Güncellendi',
        '/api/admin/krd-pro5-save': '✨ Kulüp Armaları / Play-Off Kaydedildi',
        '/api/admin/matches': '⚽ Maç Eklendi / Güncellendi',
        '/api/admin/teams': '👕 Takım Eklendi / Güncellendi',
        '/api/admin/penalties': '⚖️ Ceza / Puan İşlemi Yapıldı',
        '/api/admin/settings': '🔧 Lig Ayarları Güncellendi',
        '/api/admin/slug': '🔐 Gizli Giriş Yolu Değiştirildi',
        '/api/admin/announce': '🔔 Bildirim / Duyuru Gönderildi',
        '/api/admin/extras': '🎨 Görüntü & Vitrin Ayarları Güncellendi'
      };
      let desc = actionMap[P];
      if (!desc) {
        if (P.startsWith('/api/admin/matches')) desc = M === 'DELETE' ? '🗑️ Maç Silindi' : '⚽ Maç Skoru / Detayı Güncellendi';
        else if (P.startsWith('/api/admin/teams')) desc = M === 'DELETE' ? '🗑️ Takım Silindi' : '👕 Takım Düzenlendi';
        else if (P.startsWith('/api/admin/penalties')) desc = M === 'DELETE' ? '🗑️ Ceza Kaydı Silindi' : '⚖️ Disiplin / Hükmen İşlemi';
        else desc = '🛠️ Panel Değişikliği (' + P.replace('/api/admin/', '') + ')';
      }
      recordAuditLog(actor, desc, req).catch(() => {});
    }
  }
  if (M === 'POST' && P === '/api/krd-extras') {
    const b = await body(req);
    await pool.query(`DELETE FROM ${SETTINGS} WHERE k=$1`, ['krd_extras_v2']);
    await pool.query(`INSERT INTO ${SETTINGS}(k,v) VALUES($1,$2)`, ['krd_extras_v2', JSON.stringify(b || {})]);
    if (typeof pushAudit === 'function') pushAudit('Ayarlar Güncellendi', 'Duyuru/Bakım/Kurallar kaydedildi.');
    if (typeof notifyClients === 'function') notifyClients();
    return send(res, 200, { ok: 1 });
  }
  if (M === 'GET' && P === '/api/admin/krd-reports') {
    const r = await pool.query(`SELECT v FROM ${SETTINGS} WHERE k=$1`, ['krd_reports_v1']);
    let reports = [];
    try { if (r.rows && r.rows[0] && r.rows[0].v) reports = JSON.parse(r.rows[0].v); } catch {}
    return send(res, 200, { ok: 1, reports });
  }
  if (M === 'POST' && P === '/api/admin/krd-reports-clear') {
    await pool.query(`DELETE FROM ${SETTINGS} WHERE k=$1`, ['krd_reports_v1']);
    return send(res, 200, { ok: 1 });
  }
  if (M === 'POST' && P === '/api/admin/krd-pro5-save') {
    const b = await body(req);
    await tx(async t => {
      if (b.badges !== undefined) {
        await t.run(`DELETE FROM ${SETTINGS} WHERE k=$1`, 'krd_club_badges');
        await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES($1,$2)`, 'krd_club_badges', JSON.stringify(b.badges));
      }
      if (b.cup !== undefined) {
        await t.run(`DELETE FROM ${SETTINGS} WHERE k=$1`, 'krd_super_cup');
        await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES($1,$2)`, 'krd_super_cup', JSON.stringify(b.cup));
      }
    });
    if (typeof pushAudit === 'function') pushAudit('Kulüp/Kupa Güncellendi', 'Arma veya Süper Kupa ayarları kaydedildi.');
    if (typeof notifyClients === 'function') notifyClients();
    return send(res, 200, { ok: 1 });
  }
  if (M === 'GET' && P === '/api/admin/krd-audit') return send(res, 200, { ok: 1, logs: krdAuditTrail });
  if (M === 'POST' && P === '/api/admin/krd-archive-season') {
    const b = await body(req);
    const seasonTitle = String(b.seasonTitle || 'Sezon 2027').trim(), championName = String(b.championName || '').trim(), summaryNote = String(b.summaryNote || '').trim();
    if (!championName) return send(res, 400, { error: 'Şampiyon adı gerekli.' });
    let archive = [];
    await tx(async t => {
      const hRow = await t.get(`SELECT v FROM ${SETTINGS} WHERE k=$1`, 'krd_hof_archive');
      try { if (hRow && hRow.v) archive = JSON.parse(hRow.v); } catch {}
      archive.unshift({ id: Date.now(), season: seasonTitle, champion: championName, note: summaryNote });
      await t.run(`DELETE FROM ${SETTINGS} WHERE k=$1`, 'krd_hof_archive');
      await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES($1,$2)`, 'krd_hof_archive', JSON.stringify(archive));
      if (b.resetMatches) {
        await t.run(`UPDATE ${MATCHES} SET hs=0, aws=0, played=0`);
        await t.run(`DELETE FROM ${SETTINGS} WHERE k=$1`, 'krd_predictions');
      }
    });
    pushAudit('Sezon Arşivlendi', seasonTitle + ' • ' + championName);
    if (typeof notifyClients === 'function') notifyClients();
    return send(res, 200, { ok: 1, archive });
  }
  if (M === 'POST' && P === '/api/admin/krd-clear-predictions') {
    await tx(async t => { await t.run(`DELETE FROM ${SETTINGS} WHERE k=$1`, 'krd_predictions'); });
    pushAudit('Tahminler Sıfırlandı', 'Tüm skor tahminleri silindi.');
    if (typeof notifyClients === 'function') notifyClients();
    return send(res, 200, { ok: 1 });
  }

  

  if (M === 'POST' && P === '/api/admin/krd-cl') {
    const b = await body(req);
    const cl = b.cl || {};
    await tx(async t => {
      await t.run(`DELETE FROM ${SETTINGS} WHERE k=$1`, 'krd_champions_league');
      await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES($1,$2)`, 'krd_champions_league', JSON.stringify(cl));
    });
    if (typeof pushAudit === 'function') pushAudit('KRD Şampiyonlar Ligi Güncellendi', (cl.season || 'Devler Ligi') + ' kaydedildi.');
    if (typeof notifyClients === 'function') notifyClients();
    return send(res, 200, { ok: 1, cl });
  }

  if (M === 'POST' && P === '/api/admin/live-matches') {
    const b = await body(req);
    const list = Array.isArray(b.live) ? b.live.slice(0, 4).map(x => ({
      id: Number(x.id),
      hs: Math.max(0, Number(x.hs) || 0),
      aws: Math.max(0, Number(x.aws) || 0)
    })).filter(x => x.id) : [];
    await tx(async t => {
      await t.run(`DELETE FROM ${SETTINGS} WHERE k='live_matches'`);
      await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES('live_matches',$1)`, JSON.stringify(list));
    });
    if (typeof notifyClients === 'function') notifyClients();
    return send(res, 200, { ok: 1, live: list });
  }

  
  if (!P.startsWith('/api/admin/')) throw E(404, 'Bulunamadı');
  if (!isAdmin(req)) throw E(401, 'Yönetici girişi gerekli');
  const seg = P.split('/'), id = +seg[4], kind = seg[3];
  if (M === 'GET' && kind === 'backup') return send(res, 200, await league(), { 'Content-Disposition': 'attachment; filename="kardesler-ligi-yedek.json"' });
  const b = M === 'DELETE' ? {} : await body(req);
  if (M === 'POST' && kind === 'restore') { await restoreBackup(b); return send(res, 200, { ok: 1 }); }
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
    if (M === 'POST') {
      const prevTbl = await standings();
      const prevLeaderId = prevTbl.length ? prevTbl[0].id : null;
      const m = await matchData(b);
      const r = await run(`INSERT INTO ${MATCHES}(week,home_id,away_id,hs,aws,played,updated,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, m.week, m.home_id, m.away_id, m.hs, m.aws, m.played, new Date().toISOString(), m.note);
      if (m.played) {
        const ht = await one(`SELECT name FROM ${TEAMS} WHERE id=$1`, m.home_id);
        const at = await one(`SELECT name FROM ${TEAMS} WHERE id=$1`, m.away_id);
        sendPushAll({ title: '⚽ Maç Sonucu — KRD Ligi', body: `${ht ? ht.name : 'Ev'} ${m.hs} - ${m.aws} ${at ? at.name : 'Dep'}` });
        await checkMatchDrama(prevLeaderId, m);
      }
      return send(res, 200, { id: Number(r.rows[0].id) });
    }
    if (!okId(id)) throw E(404, 'Maç yok');
    const old = await one(`SELECT * FROM ${MATCHES} WHERE id=$1`, id); if (!old) throw E(404, 'Maç yok');
    if (M === 'PUT') {
      const prevTbl = await standings();
      const prevLeaderId = prevTbl.length ? prevTbl[0].id : null;
      const m = await matchData(b, old);
      await run(`UPDATE ${MATCHES} SET week=$1,home_id=$2,away_id=$3,hs=$4,aws=$5,played=$6,updated=$7,note=$8 WHERE id=$9`, m.week, m.home_id, m.away_id, m.hs, m.aws, m.played, new Date().toISOString(), m.note, id);
      if (m.played && (!old.played || old.hs !== m.hs || old.aws !== m.aws)) {
        const ht = await one(`SELECT name FROM ${TEAMS} WHERE id=$1`, m.home_id);
        const at = await one(`SELECT name FROM ${TEAMS} WHERE id=$1`, m.away_id);
        sendPushAll({ title: '⚽ Maç Sonucu — KRD Ligi', body: `${ht ? ht.name : 'Ev'} ${m.hs} - ${m.aws} ${at ? at.name : 'Dep'}` });
        await checkMatchDrama(prevLeaderId, m);
      }
      return send(res, 200, { ok: 1 });
    }
    if (M === 'DELETE') { await run(`DELETE FROM ${MATCHES} WHERE id=$1`, id); return send(res, 200, { ok: 1 }); }
  }
  if (kind === 'goals') {
    if (M === 'POST') {
      const mid = int(b.match_id, 1, MAXID, 'Maç'), tid = int(b.team_id, 1, MAXID, 'Takım');
      const player = clean(b.player).slice(0, 40); if (!player) throw E(400, 'Oyuncu adı gerekli');
      const goals = int(b.goals ?? 1, 0, 50, 'Gol'), assists = int(b.assists ?? 0, 0, 50, 'Asist');
      if (goals + assists < 1) throw E(400, 'En az 1 gol veya asist girilmeli');
      const m = await one(`SELECT * FROM ${MATCHES} WHERE id=$1`, mid); if (!m) throw E(404, 'Maç bulunamadı');
      if (tid !== m.home_id && tid !== m.away_id) throw E(400, 'Takım bu maçta oynamıyor');
      const r = await run(`INSERT INTO ${GOALS}(match_id,team_id,player,goals,assists) VALUES($1,$2,$3,$4,$5) RETURNING id`, mid, tid, player, goals, assists);
      return send(res, 200, { id: Number(r.rows[0].id) });
    }
    if (M === 'DELETE') { if (!okId(id)) throw E(404, 'Kayıt yok'); await run(`DELETE FROM ${GOALS} WHERE id=$1`, id); return send(res, 200, { ok: 1 }); }
  }
  if (kind === 'archives' && M === 'DELETE') {
    if (!okId(id)) throw E(404, 'Arşiv yok');
    await run(`DELETE FROM ${ARCHIVES} WHERE id=$1`, id);
    return send(res, 200, { ok: 1 });
  }
  if (kind === 'fixture' && M === 'POST') return send(res, 200, { weeks: await fixture(!!b.double) });
  if (kind === 'season' && M === 'POST') {
    const n = clean(b.name); if (!n) throw E(400, 'Sezon adı gerekli');
    const curS = (await settings()).season || '2026';
    const tbl = await standings();
    const hasPlayed = await one(`SELECT 1 x FROM ${MATCHES} WHERE played=1`);
    await tx(async t => {
      if (hasPlayed && tbl.length) {
        await t.run(`INSERT INTO ${ARCHIVES}(season,champion,data,archived_at) VALUES($1,$2,$3,$4)`, curS, tbl[0].name, JSON.stringify(tbl), new Date().toISOString());
      }
      await t.run(`DELETE FROM ${GOALS}`);
      await t.run(`DELETE FROM ${MATCHES}`);
      await t.run(`UPDATE ${TEAMS} SET penalty=0`);
      await t.run(`DELETE FROM ${SETTINGS} WHERE k='krd_predictions'`);
      await t.run(`UPDATE ${SETTINGS} SET v=$1 WHERE k='season'`, n);
      await t.run(`UPDATE ${SETTINGS} SET v='1' WHERE k='week'`);
    });
    return send(res, 200, { ok: 1 });
  }
  if (kind === 'settings' && M === 'PUT') {
    if (b.penalties !== undefined) {
      let arr = [];
      try { arr = JSON.parse(String(b.penalties)); } catch { throw E(400, 'Ceza verisi geçersiz'); }
      if (!Array.isArray(arr)) throw E(400, 'Ceza verisi geçersiz');
      await tx(async t => {
        await t.run(`DELETE FROM ${SETTINGS} WHERE k='penalties'`);
        await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES('penalties',$1)`, JSON.stringify(arr));
      });
      return send(res, 200, { ok: 1 });
    }
    const v = { name: clean(b.name).slice(0, 40), season: clean(b.season).slice(0, 20), win: int(b.win, 0, 10, 'Puan'), draw: int(b.draw, 0, 10, 'Puan'), loss: int(b.loss, 0, 10, 'Puan'), week: int(b.week, 1, 200, 'Hafta') };
    if (!v.name || !v.season) throw E(400, 'Lig ve sezon adı gerekli'); await tx(async t => { for (const [k, x] of Object.entries(v)) await t.run(`UPDATE ${SETTINGS} SET v=$1 WHERE k=$2`, String(x), k); }); return send(res, 200, { ok: 1 });
  }
  throw E(404, 'Bulunamadı');
}

const PUB = path.join(__dirname, 'public');

let VAPID_PUBLIC = '';
async function initPush() { if (!webpush) return;
  let pub = await one(`SELECT v FROM ${SECRETS} WHERE k='vapid_pub'`);
  let priv = await one(`SELECT v FROM ${SECRETS} WHERE k='vapid_priv'`);
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    await run(`INSERT INTO ${SECRETS}(k,v) VALUES('vapid_pub',$1) ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v`, keys.publicKey);
    await run(`INSERT INTO ${SECRETS}(k,v) VALUES('vapid_priv',$1) ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v`, keys.privateKey);
    pub = { v: keys.publicKey };
    priv = { v: keys.privateKey };
  }
  VAPID_PUBLIC = pub.v;
  webpush.setVapidDetails('mailto:admin@kardeslerligi.com', pub.v, priv.v);
}

async function sendPushAll(payload) {
  try {
    if (!webpush || !VAPID_PUBLIC) return;
    const row = await one(`SELECT v FROM ${SETTINGS} WHERE k='push_subs'`);
    let subs = [];
    try { subs = JSON.parse((row && row.v) || '[]'); } catch { subs = []; }
    if (!Array.isArray(subs) || !subs.length) return;
    const msg = JSON.stringify({ title: 'KRD Ligi', url: '/', ...payload });
    const alive = [];
    await Promise.all(subs.map(async sub => {
      try {
        await webpush.sendNotification(sub, msg, { TTL: 60, headers: { Urgency: 'high' } });
        alive.push(sub);
      } catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) return;
        alive.push(sub);
      }
    }));
    if (alive.length !== subs.length) {
      await tx(async t => {
        await t.run(`DELETE FROM ${SETTINGS} WHERE k='push_subs'`);
        await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES('push_subs',$1)`, JSON.stringify(alive));
      });
    }
  } catch (e) {
    console.error('Push gonderim hatasi:', e.message);
  }
}


async function checkMatchDrama(prevLeaderId, m) {
  try {
    if (!m || !m.played) return;
    const tbl = await standings();
    const teams = await q(`SELECT id, name FROM ${TEAMS}`);
    const tMap = Object.fromEntries(teams.map(t => [t.id, t.name]));
    const ht = tMap[m.home_id] || 'Ev Sahibi';
    const at = tMap[m.away_id] || 'Deplasman';
    const diff = Math.abs(m.hs - m.aws);

    let alertText = '';
    let alertTag = 'SON DAKİKA';

    if (tbl.length && prevLeaderId && tbl[0].id !== prevLeaderId) {
      alertTag = 'LİDER DEĞİŞTİ';
      alertText = `🚨 LİDER DEĞİŞTİ! ${tbl[0].name} (${tbl[0].pts} P) zirveyi ele geçirdi!`;
      sendPushAll({ title: '🚨 LİDER DEĞİŞTİ! — KRD Ligi', body: alertText });
    } else if (diff >= 5) {
      const winner = m.hs > m.aws ? ht : at;
      alertTag = 'TARİHİ FARK';
      alertText = `💥 TARİHİ FARK! ${winner}, rakibini ${m.hs}-${m.aws} mağlup etti!`;
      sendPushAll({ title: '💥 TARİHİ FARK! — KRD Ligi', body: alertText });
    }

    if (alertText) {
      await tx(async t => {
        await t.run(`DELETE FROM ${SETTINGS} WHERE k='custom_news'`);
        await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES('custom_news',$1)`, JSON.stringify({ tag: alertTag, text: alertText, updated: new Date().toISOString() }));
      });
    }
  } catch (e) {
    console.error('Drama kontrol hatasi:', e.message);
  }
}


const chatOnline = new Map(); // clientId -> { name, lastSeen }
function getActiveChatUsers() {
  const now = Date.now();
  const names = [];
  for (const [cid, info] of chatOnline.entries()) {
    if (now - info.lastSeen > 35000) {
      chatOnline.delete(cid);
    } else if (info.name) {
      names.push(info.name);
    }
  }
  return [...new Set(names)];
}


async function getSettingJson(key, fallback) {
  const row = await one(`SELECT v FROM ${SETTINGS} WHERE k=$1`, key);
  if (!row || !row.v) return fallback;
  try { return JSON.parse(row.v); } catch { return fallback; }
}
async function setSettingJson(key, val) {
  await tx(async t => {
    await t.run(`DELETE FROM ${SETTINGS} WHERE k=$1`, key);
    await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES($1,$2)`, key, JSON.stringify(val));
  });
}
async function sendAdminAuditEmail(user, action, ip, forceTest = false) {
  try {
    const cfg = await getSettingJson('admin_email_notify', null);
    if (!forceTest && (!cfg || !cfg.enabled || !cfg.email)) return { ok: false, reason: 'disabled' };
    const to = String((cfg && cfg.email) || '').trim();
    if (!to.includes('@')) return { ok: false, reason: 'invalid_email' };
    const actor = String(user || '').trim();
    if (!forceTest && actor.toLowerCase() === 'yusuf' && !String(action).includes('Hatalı')) {
      return { ok: false, reason: 'self_skip' };
    }
    const subject = `[KRD Ligi Yönetici Bildirimi] ${actor} — ${action}`;
    const timeStr = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    const htmlBody = `<div style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:18px;border-radius:12px;border:1px solid #1e293b;">
      <h3 style="color:#38bdf8;margin-top:0;">🛡️ KRD Ligi Yönetici Hareket Bildirimi</h3>
      <p><b>Yönetici:</b> ${actor}</p>
      <p><b>İşlem:</b> ${action}</p>
      <p><b>IP Adresi:</b> ${ip || '-'}</p>
      <p><b>Zaman:</b> ${timeStr}</p>
    </div>`;

    // 1. Yol: RESEND_API_KEY tanimliysa Resend API ile gonder
    if (process.env.RESEND_API_KEY) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'KRD Ligi <onboarding@resend.dev>',
          to: [to],
          subject,
          html: htmlBody
        })
      });
      return { ok: r.ok, provider: 'resend' };
    }

    // 2. Yol: SMTP_USER ve SMTP_PASS (Gmail Uygulama Sifresi) tanimliysa dogrudan TLS SMTP ile gonder
    const smtpUser = String(process.env.SMTP_USER || '').trim();
    const smtpPass = String(process.env.SMTP_PASS || '').replace(/s+/g, '');
    if (smtpUser && smtpPass) {
      const tls = require('tls');
      const host = process.env.SMTP_HOST || 'smtp.gmail.com';
      const port = Number(process.env.SMTP_PORT || 465);
      await new Promise((resolve, reject) => {
        const sock = tls.connect(port, host, { rejectUnauthorized: false }, () => {});
        let step = 0;
        const b64 = s => Buffer.from(s, 'utf8').toString('base64');
        const rawMsg = [
          `From: "KRD Ligi" <${smtpUser}>`,
          `To: <${to}>`,
          `Subject: =?UTF-8?B?${b64(subject)}?=`,
          'MIME-Version: 1.0',
          'Content-Type: text/html; charset=UTF-8',
          '',
          htmlBody,
          '.'
        ].join('\r\n');

        sock.on('data', chunk => {
          const line = chunk.toString('utf8');
          if (line.startsWith('4') || line.startsWith('5')) { sock.destroy(); return reject(new Error(line)); }
          if (step === 0 && line.includes('220')) { step = 1; sock.write('EHLO krd-ligi\r\n'); }
          else if (step === 1 && line.includes('250')) { step = 2; sock.write('AUTH LOGIN\r\n'); }
          else if (step === 2 && line.includes('334')) { step = 3; sock.write(b64(smtpUser) + '\r\n'); }
          else if (step === 3 && line.includes('334')) { step = 4; sock.write(b64(smtpPass) + '\r\n'); }
          else if (step === 4 && line.includes('235')) { step = 5; sock.write(`MAIL FROM:<${smtpUser}>\r\n`); }
          else if (step === 5 && line.includes('250')) { step = 6; sock.write(`RCPT TO:<${to}>\r\n`); }
          else if (step === 6 && line.includes('250')) { step = 7; sock.write('DATA\r\n'); }
          else if (step === 7 && line.includes('354')) { step = 8; sock.write(rawMsg + '\r\n'); }
          else if (step === 8 && line.includes('250')) { step = 9; sock.write('QUIT\r\n'); sock.end(); resolve(); }
        });
        sock.on('error', reject);
        setTimeout(() => { sock.destroy(); reject(new Error('SMTP timeout')); }, 10000);
      });
      return { ok: true, provider: 'smtp' };
    }
    return { ok: false, reason: 'no_mail_env' };
  } catch (err) {
    return { ok: false, reason: err.message || 'mail_err' };
  }
}

async function sendAdminAuditPush(user, action) {
  try {
    if (!webpush) return;
    const cfg = await getSettingJson('admin_push_notify', null);
    if (!cfg || !cfg.enabled || !Array.isArray(cfg.subs) || !cfg.subs.length) return;
    const actor = String(user || '').trim();
    // Sadece diger yoneticilerin (mirror vb.) hareketlerinde veya hatali girislerde bildirim at (kendi isleminde spam yapmasin)
    if (actor.toLowerCase() === 'yusuf' && !action.includes('Hatalı')) return;
    const payload = JSON.stringify({
      title: '🛡️ KRD Yönetici Hareketi',
      body: actor + ' — ' + action,
      url: '/#/krd-kontrol'
    });
    const alive = [];
    for (const sub of cfg.subs) {
      try {
        await webpush.sendNotification(sub, payload);
        alive.push(sub);
      } catch (err) {
        if (!err || (err.statusCode !== 404 && err.statusCode !== 410)) alive.push(sub);
      }
    }
    if (alive.length !== cfg.subs.length) {
      await setSettingJson('admin_push_notify', { enabled: cfg.enabled, subs: alive });
    }
  } catch {}
}

async function recordAuditLog(user, action, req) {
  try {
    const ip = String((req && req.headers && req.headers['x-forwarded-for']) || (req && req.socket && req.socket.remoteAddress) || '-').split(',')[0].trim();
    const list = await getSettingJson('admin_logs', []);
    const arr = Array.isArray(list) ? list : [];
    arr.unshift({ id: Date.now() + '_' + Math.random().toString(36).slice(2, 5), user: String(user || 'Bilinmiyor'), action, ip, time: new Date().toISOString() });
    if (arr.length > 80) arr.length = 80;
    await setSettingJson('admin_logs', arr);
    sendAdminAuditEmail(user, action, ip).catch(() => {});
    sendAdminAuditPush(user, action).catch(() => {});
  } catch {}
}

const sseClients = new Set();
function notifyClients() {
  for (const client of sseClients) {
    try { client.write('data: update\n\n'); }
    catch { sseClients.delete(client); }
  }
}

function normNickTr(s) {
  return String(s || '').trim().replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr-TR');
}

const server = http.createServer(async (req, res) => {
  
  if (req.url && req.url.split('?')[0] === '/api/settings') {
    if (req.method === 'GET') {
      let deadline = null;
      try {
        const r = await pool.query(`SELECT v FROM ${SETTINGS} WHERE k=if (req.url && req.url.split('?')[0] === '/api/ticker') {`, ['krd_deadline_cfg']);
        if (r.rows && r.rows[0] && r.rows[0].v) deadline = JSON.parse(r.rows[0].v);
      } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, deadline }));
    }
    if (req.method === 'POST') {
      if (!isAdmin(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: false, error: 'Yönetici girişi gerekli' }));
      }
      let raw = '';
      req.on('data', ch => { raw += ch; });
      req.on('end', async () => {
        try {
          const b = JSON.parse(raw || '{}');
          const val = JSON.stringify({
            deadlineIso: String(b.deadlineIso || '').slice(0, 40),
            deadlineLabel: String(b.deadlineLabel || '').slice(0, 80)
          });
          await pool.query(`DELETE FROM ${SETTINGS} WHERE k=if (req.url && req.url.split('?')[0] === '/api/ticker') {`, ['krd_deadline_cfg']);
          await pool.query(`INSERT INTO ${SETTINGS}(k,v) VALUES(if (req.url && req.url.split('?')[0] === '/api/ticker') {,$2)`, ['krd_deadline_cfg', val]);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Geçersiz veri' }));
        }
      });
      return;
    }
  }

  if (req.url && req.url.split('?')[0] === '/api/ticker') {
    if (req.method !== 'GET' && !isAdmin(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: 'Yönetici girişi gerekli' }));
    }
    if (req.method === 'GET') {
      let text = '';
      try {
        const r = await pool.query(`SELECT v FROM ${SETTINGS} WHERE k=$1`, ['live_ticker']);
        if (r.rows && r.rows[0] && typeof r.rows[0].v === 'string') text = r.rows[0].v;
      } catch (e) { console.error('Ticker GET hata:', e.message); }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: true, text }));
    }
    if (req.method === 'POST') {
      let raw = '';
      req.on('data', c => { raw += c; });
      req.on('end', async () => {
        let text = '';
        try {
          const parsed = JSON.parse(raw || '{}');
          text = String(parsed.text || '').trim().slice(0, 240);
          await pool.query(`DELETE FROM ${SETTINGS} WHERE k=$1`, ['live_ticker']);
          await pool.query(`INSERT INTO ${SETTINGS}(k,v) VALUES($1,$2)`, ['live_ticker', text]);
        } catch (e) { console.error('Ticker POST hata:', e.message); }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, text }));
      });
      return;
    }
  }

  


  


  // === KRD_HARD_AUTH_GUARD ===
  try {
    const _rawPath = String(req.url || '').split('?')[0].replace(/\/+$/, '') || '/';
    const _rawMethod = String(req.method || 'GET').toUpperCase();
    const _openLoginPaths = ["/api/login","/api/admin/login","/api/auth","/api/admin/auth"];
    if (!_openLoginPaths.includes(_rawPath)) {
      if ((_rawPath === '/api/krd-extras' && _rawMethod !== 'GET') || _rawPath.startsWith('/api/admin/')) {
        if (!isAdmin(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Yönetici girişi gerekli' }));
        }
      }
    }
  } catch (_e) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'Yetkisiz erişim' }));
  }

  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
  if (req.url.startsWith('/sw.js')) res.setHeader('Service-Worker-Allowed', '/');
  try {
    
async function krdDbGet(sql, ...params) {
  if (typeof get === 'function') return await get(sql, ...params);
  if (typeof pool !== 'undefined' && typeof pool.query === 'function') {
    const r = await pool.query(sql, params);
    return r && r.rows ? r.rows[0] : null;
  }
  if (typeof db !== 'undefined' && typeof db.get === 'function') {
    return await db.get(sql, ...params);
  }
  return null;
}

const u = new URL(req.url, 'http://x');



  // === KRD_EXTRAS_START ===
  if (req.method === 'GET' && u.pathname === '/api/krd-extras') {
    try {
      const r = await pool.query(`SELECT v FROM ${SETTINGS} WHERE k=$1`, ['krd_extras_v2']);
      const extras = (r.rows && r.rows[0] && r.rows[0].v) ? JSON.parse(r.rows[0].v) : {};
      let lastBroadcast = null;
      try {
        const bRow = await pool.query(`SELECT v FROM ${SETTINGS} WHERE k=$1`, ['krd_last_broadcast']);
        if (bRow.rows && bRow.rows[0] && bRow.rows[0].v) lastBroadcast = JSON.parse(bRow.rows[0].v);
      } catch {}
      return send(res, 200, { ok: 1, extras, lastBroadcast });
    } catch (e) {
      return send(res, 200, { ok: 1, extras: {} });
    }
  }
  if (req.method === 'POST' && u.pathname === '/api/krd-report') {
    try {
      const b = await body(req);
      const sender = String(b.sender || 'Ziyaretçi').trim().slice(0, 30);
      const msg = String(b.msg || '').trim().slice(0, 400);
      if (!msg) return send(res, 400, { error: 'Lütfen sorununuzu yazın.' });
      const r = await pool.query(`SELECT v FROM ${SETTINGS} WHERE k=$1`, ['krd_reports_v1']);
      let list = [];
      try { if (r.rows && r.rows[0] && r.rows[0].v) list = JSON.parse(r.rows[0].v); } catch {}
      list.unshift({
        id: Date.now(),
        ts: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        sender,
        msg
      });
      if (list.length > 50) list.length = 50;
      await pool.query(`DELETE FROM ${SETTINGS} WHERE k=$1`, ['krd_reports_v1']);
      await pool.query(`INSERT INTO ${SETTINGS}(k,v) VALUES($1,$2)`, ['krd_reports_v1', JSON.stringify(list)]);
      if (typeof pushAudit === 'function') pushAudit('Sorun Bildirildi', sender + ': ' + msg.slice(0, 60));
      return send(res, 200, { ok: 1 });
    } catch (err) {
      return send(res, 500, { error: 'Kayıt hatası: ' + (err.message || 'Bilinmiyor') });
    }
  }
  // === KRD_EXTRAS_END ===
  
  
  // === KRD_CHAMPIONS_LEAGUE_START ===
  if (req.method === 'GET' && u.pathname === '/api/krd-cl') {
    const row = await krdDbGet(`SELECT v FROM ${SETTINGS} WHERE k=$1`, 'krd_champions_league');
    let cl = { active: false, season: '1. Devler Ligi', teamIds: [], matches: [], ko: { sf1_h: '', sf1_a: '', sf2_h: '', sf2_a: '', f_h: '', f_a: '' } };
    try { if (row && row.v) cl = Object.assign(cl, JSON.parse(row.v)); } catch {}
    return send(res, 200, { ok: 1, cl });
  }
  // === KRD_CHAMPIONS_LEAGUE_END ===

  // === KRD_PRO5_START ===
  if (req.method === 'GET' && u.pathname === '/api/krd-pro5-data') {
    const bRow = await krdDbGet(`SELECT v FROM ${SETTINGS} WHERE k=$1`, 'krd_club_badges');
    const cRow = await krdDbGet(`SELECT v FROM ${SETTINGS} WHERE k=$1`, 'krd_super_cup');
    let badges = {}, cup = {};
    try { if (bRow && bRow.v) badges = JSON.parse(bRow.v); } catch {}
    try { if (cRow && cRow.v) cup = JSON.parse(cRow.v); } catch {}
    return send(res, 200, { ok: 1, badges, cup });
  }
  // === KRD_PRO5_END ===
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.method === 'POST' && u.pathname === '/api/admin/login') {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x').split(',')[0].trim();
    const rec = krdLoginGuard.get(ip);
    if (rec && rec.lockUntil && Date.now() < rec.lockUntil) {
      return send(res, 429, { error: 'Çok fazla hatalı deneme. ' + Math.ceil((rec.lockUntil - Date.now()) / 60000) + ' dk bekleyin.' });
    }
  }
  if (req.method === 'GET' && u.pathname === '/api/krd-mega-data') {
    try {
      const pRes = await pool.query(`SELECT v FROM ${SETTINGS} WHERE k=$1`, ['krd_predictions']);
      const hRes = await pool.query(`SELECT v FROM ${SETTINGS} WHERE k=$1`, ['krd_hof_archive']);
      let predictions = {}, archive = [];
      try { if (pRes.rows && pRes.rows[0] && pRes.rows[0].v) predictions = JSON.parse(pRes.rows[0].v); } catch {}
      try { if (hRes.rows && hRes.rows[0] && hRes.rows[0].v) archive = JSON.parse(hRes.rows[0].v); } catch {}
      const mergedPreds = {};
      for (const [rawNick, userMap] of Object.entries(predictions || {})) {
        const key = normNickTr(rawNick);
        if (!key) continue;
        if (!mergedPreds[key]) mergedPreds[key] = { _display: rawNick.trim(), items: {} };
        if (/[İÇŞĞÜÖ]/.test(rawNick)) mergedPreds[key]._display = rawNick.trim();
        Object.assign(mergedPreds[key].items, userMap || {});
      }
      const cleanPredictions = {};
      for (const obj of Object.values(mergedPreds)) {
        cleanPredictions[obj._display] = obj.items;
      }
      return send(res, 200, { ok: 1, predictions: cleanPredictions, archive });
    } catch {
      return send(res, 200, { ok: 1, predictions: {}, archive: [] });
    }
  }
  if (req.method === 'POST' && ['/api/chat','/api/krd-predict','/api/krd-report'].includes(u.pathname)) {
    if (!krdCheckRate(krdGetIp(req), u.pathname, 12)) {
      return send(res, 429, { error: 'Çok hızlı işlem yapıyorsunuz, lütfen biraz bekleyin.' });
    }
  }
  if (req.method === 'POST' && u.pathname === '/api/krd-predict') {
    try {
      const b = await body(req);
      const nick = String(b.nick || '').trim().slice(0, 24);
    if (!nick || ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf'].includes(nick)) return send(res, 400, { error: 'Geçersiz kullanıcı adı' });
      const matchId = Number(b.matchId);
      const hs = Math.max(0, Math.min(99, Number(b.hs)));
      const aws = Math.max(0, Math.min(99, Number(b.aws)));
      if (!nick || !matchId || Number.isNaN(hs) || Number.isNaN(aws)) {
        return send(res, 400, { error: 'Geçersiz tahmin.' });
      }
      const mRes = await pool.query(`SELECT played FROM ${MATCHES} WHERE id=$1`, [matchId]);
      const mRow = mRes.rows && mRes.rows[0];
      if (!mRow || mRow.played) {
        return send(res, 400, { error: 'Bu maça tahmin yapılamaz.' });
      }
      const pRes = await pool.query(`SELECT v FROM ${SETTINGS} WHERE k=$1`, ['krd_predictions']);
      let predictions = {};
      try {
        if (pRes.rows && pRes.rows[0] && pRes.rows[0].v) predictions = JSON.parse(pRes.rows[0].v);
      } catch {}
      if (!predictions[nick]) predictions[nick] = {};
      predictions[nick][String(matchId)] = { hs, aws, at: Date.now() };
      await pool.query(`DELETE FROM ${SETTINGS} WHERE k=$1`, ['krd_predictions']);
      await pool.query(`INSERT INTO ${SETTINGS}(k,v) VALUES($1,$2)`, ['krd_predictions', JSON.stringify(predictions)]);
      if (typeof notifyClients === 'function') notifyClients();
      return send(res, 200, { ok: 1, predictions });
    } catch (err) {
      return send(res, 500, { error: 'Tahmin kayıt hatası: ' + (err.message || 'Bilinmiyor') });
    }
  }

  

  if (req.method === 'GET' && u.pathname === '/.well-known/assetlinks.json') {
    const raw = process.env.ASSETLINKS_JSON || (fs.existsSync(path.join(__dirname, 'public/.well-known/assetlinks.json')) ? fs.readFileSync(path.join(__dirname, 'public/.well-known/assetlinks.json'), 'utf8') : '[]');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(raw);
  }
    
    
    
    if (u.pathname === '/api/admin/stats' && req.method === 'GET') {
      if (!isAdmin(req)) throw E(401, 'Yönetici girişi gerekli');
      const row = await one(`SELECT v FROM ${SETTINGS} WHERE k='push_subs'`);
      let subs = [];
      try { subs = JSON.parse((row && row.v) || '[]'); } catch { subs = []; }
      return send(res, 200, { subscribers: Array.isArray(subs) ? subs.length : 0, pushReady: !!webpush && !!VAPID_PUBLIC });
    }

    
    if (u.pathname === '/api/admin/users' && req.method === 'GET') {
      if (!isAdmin(req)) throw E(401, 'Yönetici yetkisi gerekli');
      const aRow = await one(`SELECT username FROM ${ADMIN} WHERE id=1`);
      const mainAdm = { username: (aRow && aRow.username) || 'Yönetici' };
      const extra = await getSettingJson('extra_admins', []);
      const logs = await getSettingJson('admin_logs', []);
      const slugRow = await one(`SELECT v FROM ${SETTINGS} WHERE k='admin_slug'`);
      const emailNotify = await getSettingJson('admin_email_notify', { enabled: false, email: '' });
      const pushNotify = await getSettingJson('admin_push_notify', { enabled: false, subs: [] });
      return send(res, 200, {
        primary: mainAdm.username || 'Yönetici',
        admins: (Array.isArray(extra) ? extra : []).map(x => ({ username: x.username, created: x.created || '', perms: Array.isArray(x.perms) ? x.perms : DEFAULT_SUB_PERMS.slice() })),
        logs: Array.isArray(logs) ? logs : [],
        adminSlug: (slugRow && slugRow.v) || 'krd-kontrol',
        emailNotify,
        pushNotify: { enabled: !!(pushNotify && pushNotify.enabled), deviceCount: Array.isArray(pushNotify && pushNotify.subs) ? pushNotify.subs.length : 0 }
      });
    }
    if (u.pathname === '/api/admin/users' && req.method === 'POST') {
      if (!isAdmin(req)) throw E(401, 'Yönetici yetkisi gerekli');
      const raw = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', ch => { d += ch; if (d.length > 8192) reject(E(413, 'Veri çok büyük')); });
        req.on('end', () => resolve(d));
        req.on('error', reject);
      });
      let b = {};
      try { b = JSON.parse(raw || '{}'); } catch { throw E(400, 'Geçersiz JSON'); }
      const uname = clean(String(b.username || '')).trim().slice(0, 24);
      const pass = String(b.password || '');
      if (uname.length < 3 || pass.length < 4) throw E(400, 'Kullanıcı adı en az 3, şifre en az 4 karakter olmalı');

      const aRow = await one(`SELECT v FROM ${SETTINGS} WHERE k='admin'`);
      let mainAdm = {};
      try { mainAdm = JSON.parse((aRow && aRow.v) || '{}'); } catch {}
      if (mainAdm.username && mainAdm.username.toLowerCase() === uname.toLowerCase()) throw E(400, 'Bu kullanıcı adı ana yöneticiye ait');

      const extra = await getSettingJson('extra_admins', []);
      const filtered = (Array.isArray(extra) ? extra : []).filter(x => x.username.toLowerCase() !== uname.toLowerCase());
      const rawPerms = Array.isArray(b.perms) ? b.perms.filter(k => ALL_ADMIN_PERMS.includes(k)) : DEFAULT_SUB_PERMS.slice();
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPw(pass, salt);
      filtered.push({ username: uname, salt, hash, perms: rawPerms, created: new Date().toISOString() });
      await setSettingJson('extra_admins', filtered);
      await recordAuditLog((getAdminUser(req) || 'Yönetici') + ' → ' + uname, '➕ Yeni Yönetici Ekledi', req);
      return send(res, 200, { ok: 1 });
    }
        if (u.pathname === '/api/admin/users/perms' && req.method === 'POST') {
      const sess = await getAdminSessionInfo(req);
      if (!sess || !sess.isPrimary) throw E(403, 'Sadece ana kurucu yönetici yetkileri değiştirebilir');
      const raw = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', ch => { d += ch; if (d.length > 4096) reject(E(413, 'Veri çok büyük')); });
        req.on('end', () => resolve(d));
        req.on('error', reject);
      });
      let b = {};
      try { b = JSON.parse(raw || '{}'); } catch { throw E(400, 'Geçersiz JSON'); }
      const uname = clean(String(b.username || '')).trim();
      const perms = Array.isArray(b.perms) ? b.perms.filter(k => ALL_ADMIN_PERMS.includes(k)) : DEFAULT_SUB_PERMS.slice();
      const extra = await getSettingJson('extra_admins', []);
      const updated = (Array.isArray(extra) ? extra : []).map(x =>
        String(x.username || '').toLowerCase() === uname.toLowerCase() ? { ...x, perms } : x
      );
      await setSettingJson('extra_admins', updated);
      await recordAuditLog(sess.username + ' → ' + uname, '🛡️ Yönetici Yetkileri Güncellendi', req);
      return send(res, 200, { ok: 1 });
    }

    if (u.pathname === '/api/admin/users/delete' && req.method === 'POST') {
      if (!isAdmin(req)) throw E(401, 'Yönetici yetkisi gerekli');
      const raw = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', ch => { d += ch; if (d.length > 4096) reject(E(413, 'Veri çok büyük')); });
        req.on('end', () => resolve(d));
        req.on('error', reject);
      });
      let b = {};
      try { b = JSON.parse(raw || '{}'); } catch { throw E(400, 'Geçersiz JSON'); }
      const uname = clean(String(b.username || '')).trim();
      const extra = await getSettingJson('extra_admins', []);
      const filtered = (Array.isArray(extra) ? extra : []).filter(x => x.username.toLowerCase() !== uname.toLowerCase());
      await setSettingJson('extra_admins', filtered);
      await recordAuditLog((getAdminUser(req) || 'Yönetici') + ' → ' + uname, '🗑️ Yöneticiyi Kaldırdı', req);
      return send(res, 200, { ok: 1 });
    }
                if (u.pathname === '/api/admin/test-notify' && req.method === 'POST') {
      const sess = await getAdminSessionInfo(req);
      if (!sess || !sess.isPrimary) throw E(403, 'Sadece ana kurucu yönetici test gönderebilir');
      const ip = krdGetIp(req);
      // 1. Push Testi
      let pushSent = 0;
      const pCfg = await getSettingJson('admin_push_notify', null);
      if (webpush && pCfg && pCfg.enabled && Array.isArray(pCfg.subs) && pCfg.subs.length) {
        const payload = JSON.stringify({
          title: '🧪 KRD Ligi Test Bildirimi',
          body: 'Telefon Push + E-Posta bildirim merkezi sorunsuz çalışıyor!',
          url: '/#/krd-kontrol'
        });
        for (const sub of pCfg.subs) {
          try { await webpush.sendNotification(sub, payload); pushSent++; } catch {}
        }
      }
      // 2. E-Posta Testi
      const mailRes = await sendAdminAuditEmail('Test Sistemi', '🧪 Yönetici Bildirim Testi', ip, true);
      return send(res, 200, { ok: 1, pushSent, mail: mailRes });
    }

    if (u.pathname === '/api/admin/push-notify' && req.method === 'POST') {
      const sess = await getAdminSessionInfo(req);
      if (!sess || !sess.isPrimary) throw E(403, 'Sadece ana kurucu yönetici bu ayarı değiştirebilir');
      const raw = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', ch => { d += ch; if (d.length > 8192) reject(E(413, 'Veri çok büyük')); });
        req.on('end', () => resolve(d));
        req.on('error', reject);
      });
      let b = {};
      try { b = JSON.parse(raw || '{}'); } catch { throw E(400, 'Geçersiz JSON'); }
      const cur = await getSettingJson('admin_push_notify', { enabled: false, subs: [] });
      let subs = Array.isArray(cur && cur.subs) ? cur.subs : [];
      if (b.sub && b.sub.endpoint) {
        subs = subs.filter(s => s && s.endpoint !== b.sub.endpoint);
        subs.push(b.sub);
      }
      const enabled = !!b.enabled;
      if (!enabled) subs = [];
      await setSettingJson('admin_push_notify', { enabled, subs });
      return send(res, 200, { ok: 1, enabled, deviceCount: subs.length });
    }

    if (u.pathname === '/api/admin/email-notify' && req.method === 'POST') {
      if (!isAdmin(req)) throw E(401, 'Yönetici yetkisi gerekli');
      const raw = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', ch => { d += ch; if (d.length > 4096) reject(E(413, 'Veri çok büyük')); });
        req.on('end', () => resolve(d));
        req.on('error', reject);
      });
      let b = {};
      try { b = JSON.parse(raw || '{}'); } catch { throw E(400, 'Geçersiz JSON'); }
      const email = clean(String(b.email || '')).trim().slice(0, 120);
      const enabled = !!b.enabled && email.includes('@');
      await setSettingJson('admin_email_notify', { enabled, email });
      return send(res, 200, { ok: 1, enabled, email });
    }

    if (u.pathname === '/api/admin/slug' && req.method === 'POST') {
      if (!isAdmin(req)) throw E(401, 'Yönetici yetkisi gerekli');
      const raw = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', ch => { d += ch; if (d.length > 4096) reject(E(413, 'Veri çok büyük')); });
        req.on('end', () => resolve(d));
        req.on('error', reject);
      });
      let b = {};
      try { b = JSON.parse(raw || '{}'); } catch { throw E(400, 'Geçersiz JSON'); }
      const slug = String(b.slug || '').toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 30);
      if (slug.length < 4) throw E(400, 'Giriş yolu en az 4 karakter (harf/rakam) olmalı');
      await tx(async t => {
        await t.run(`DELETE FROM ${SETTINGS} WHERE k='admin_slug'`);
        await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES('admin_slug',$1)`, slug);
      });
      send(res, 200, { ok: 1, slug });
      notifyClients();
      return;
    }
    

    if (u.pathname === '/api/admin/announce' && req.method === 'POST') {
      if (!isAdmin(req)) throw E(401, 'Yönetici girişi gerekli');
      const raw = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', ch => { d += ch; if (d.length > 16384) reject(E(413, 'Veri çok büyük')); });
        req.on('end', () => resolve(d));
        req.on('error', reject);
      });
      let b = {};
      try { b = JSON.parse(raw || '{}'); } catch { throw E(400, 'Geçersiz JSON'); }
      const title = clean(String(b.title || '📢 KRD Ligi Duyuru')).slice(0, 60);
      const body = clean(String(b.body || '')).slice(0, 200);
      if (!body) throw E(400, 'Duyuru metni boş olamaz');
      const row = await one(`SELECT v FROM ${SETTINGS} WHERE k='push_subs'`);
      let subs = [];
      try { subs = JSON.parse((row && row.v) || '[]'); } catch { subs = []; }
      await run(`INSERT INTO ${SETTINGS}(k,v) VALUES('krd_last_broadcast',$1) ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v`, JSON.stringify({ id: Date.now(), title, body }));
      await sendPushAll({ title, body }); if (typeof notifyClients === "function") notifyClients();
      return send(res, 200, { ok: 1, count: subs.length });
    }

    if (u.pathname === '/api/push/key' && req.method === 'GET') {
      return send(res, 200, { publicKey: VAPID_PUBLIC });
    }
    if (u.pathname === '/api/push/subscribe' && req.method === 'POST') {
      const raw = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', ch => { d += ch; if (d.length > 32768) reject(E(413, 'Veri çok büyük')); });
        req.on('end', () => resolve(d));
        req.on('error', reject);
      });
      let b = {};
      try { b = JSON.parse(raw || '{}'); } catch { throw E(400, 'Geçersiz JSON'); }
      const sub = b.subscription;
      if (!sub || !sub.endpoint || !sub.keys) throw E(400, 'Geçersiz abonelik');
      const s = await settings();
      let subs = [];
      try { subs = JSON.parse(s.push_subs || '[]'); } catch { subs = []; }
      if (!Array.isArray(subs)) subs = [];
      subs = subs.filter(x => x && x.endpoint !== sub.endpoint);
      subs.push(sub);
      if (subs.length > 200) subs = subs.slice(-200);
      await tx(async t => {
        await t.run(`DELETE FROM ${SETTINGS} WHERE k='push_subs'`);
        await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES('push_subs',$1)`, JSON.stringify(subs));
      });
      return send(res, 200, { ok: 1, count: subs.length });
    }

    
    if (u.pathname === '/api/chat' && req.method === 'GET') {
      const cid = clean(u.searchParams.get('cid') || '').slice(0, 40);
      const cname = clean(u.searchParams.get('name') || '').slice(0, 24);
      if (cid) chatOnline.set(cid, { name: cname || 'Misafir', lastSeen: Date.now() });
      const row = await one(`SELECT v FROM ${SETTINGS} WHERE k='chat_msgs'`);
      let msgs = [];
      try { msgs = JSON.parse((row && row.v) || '[]'); } catch { msgs = []; }
      const safeMsgs = (Array.isArray(msgs) ? msgs : []).map(({ ip, ...rest }) => rest);
      const pinRow = await one(`SELECT v FROM ${SETTINGS} WHERE k='chat_pinned'`);
      const pinned = pinRow ? (pinRow.v || '') : '';
      let bans = [], mutes = [];
      if (isAdmin(req)) {
        const banRow = await one(`SELECT v FROM ${SETTINGS} WHERE k='chat_bans'`);
        try { bans = JSON.parse((banRow && banRow.v) || '[]'); } catch { bans = []; }
        const muteRow = await one(`SELECT v FROM ${SETTINGS} WHERE k='chat_mutes'`);
        try { mutes = JSON.parse((muteRow && muteRow.v) || '[]'); } catch { mutes = []; }
      }
      return send(res, 200, { messages: safeMsgs, online: getActiveChatUsers(), pinned, bans: Array.isArray(bans) ? bans : [], mutes: Array.isArray(mutes) ? mutes : [] });
    }
    if (u.pathname === '/api/chat' && req.method === 'POST') {
      const raw = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', ch => { d += ch; if (d.length > 16384) reject(E(413, 'Veri çok büyük')); });
        req.on('end', () => resolve(d));
        req.on('error', reject);
      });
      let b = {};
      try { b = JSON.parse(raw || '{}'); } catch { throw E(400, 'Geçersiz JSON'); }
      const user = clean(String(b.user || '')).slice(0, 24);
      const text = clean(String(b.text || '')).slice(0, 240);
      const cid = clean(String(b.cid || '')).slice(0, 40);
      const clientIp = (typeof krdGetIp === 'function' ? krdGetIp(req) : req.socket.remoteAddress) || '';
      if (!user || !text) throw E(400, 'İsim ve mesaj gerekli');
      if (text.length > 220) throw E(400, 'Mesaj en fazla 220 karakter olabilir');
      if (/(.)\1{9,}/.test(text)) throw E(400, 'Spam karakter tekrarı engellendi');

      const adm = isAdmin(req);
      if (!adm) {
        const muteRow = await one(`SELECT v FROM ${SETTINGS} WHERE k='chat_mutes'`);
        let mutes = [];
        try { mutes = JSON.parse((muteRow && muteRow.v) || '[]'); } catch { mutes = []; }
        if (Array.isArray(mutes) && mutes.some(x => (cid && x.cid === cid) || (clientIp && x.ip === clientIp))) {
          throw E(403, 'Sohbette sessize alındınız. Mesaj gönderemezsiniz.');
        }
        const banRow = await one(`SELECT v FROM ${SETTINGS} WHERE k='chat_bans'`);
        let bans = [];
        try { bans = JSON.parse((banRow && banRow.v) || '[]'); } catch { bans = []; }
        if (Array.isArray(bans) && bans.some(x => (cid && x.cid === cid) || (clientIp && x.ip === clientIp))) {
          throw E(403, 'Sohbetten engellendiniz.');
        }
      }

      if (cid) chatOnline.set(cid, { name: user, lastSeen: Date.now() });

      const row = await one(`SELECT v FROM ${SETTINGS} WHERE k='chat_msgs'`);
      let msgs = [];
      try { msgs = JSON.parse((row && row.v) || '[]'); } catch { msgs = []; }
      if (!Array.isArray(msgs)) msgs = [];

      if (!adm && msgs.length) {
        const myRec = msgs.filter(m => (cid && m.cid === cid) || (!m.cid && m.user.toLowerCase() === user.toLowerCase()));
        const lastM = myRec[myRec.length - 1];
        if (lastM) {
          const diff = Date.now() - new Date(lastM.time || 0).getTime();
          if (diff < 3000) throw E(429, 'Çok hızlı mesaj gönderiyorsunuz (3 sn bekleyin).');
          if (lastM.text.trim().toLowerCase() === text.trim().toLowerCase() && diff < 60000) {
            throw E(429, 'Aynı mesajı art arda gönderemezsiniz.');
          }
        }
      }

      msgs.push({ id: Date.now() + '_' + Math.random().toString(36).slice(2, 6), cid, ip: clientIp, user, text, time: new Date().toISOString(), admin: adm });
      if (msgs.length > 60) msgs = msgs.slice(-60);

      await tx(async t => {
        await t.run(`DELETE FROM ${SETTINGS} WHERE k='chat_msgs'`);
        await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES('chat_msgs',$1)`, JSON.stringify(msgs));
      });
      send(res, 200, { ok: 1, messages: msgs, online: getActiveChatUsers() });
      notifyClients();
      return;
    }
    if (u.pathname === '/api/chat/admin-manage' && req.method === 'POST') {
      if (!isAdmin(req)) throw E(401, 'Yönetici yetkisi gerekli');
      const raw = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', ch => { d += ch; if (d.length > 16384) reject(E(413, 'Veri çok büyük')); });
        req.on('end', () => resolve(d));
        req.on('error', reject);
      });
      const b = JSON.parse(raw || '{}');

      if (b.action === 'pin') {
        const pinText = clean(String(b.text || '')).slice(0, 220);
        await tx(async t => {
          await t.run(`DELETE FROM ${SETTINGS} WHERE k='chat_pinned'`);
          if (pinText) await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES('chat_pinned',$1)`, pinText);
        });
        send(res, 200, { ok: 1, pinned: pinText });
        notifyClients();
        return;
      }

      if (b.action === 'edit') {
        const newText = clean(String(b.text || '')).slice(0, 220);
        if (!b.id || !newText) throw E(400, 'Mesaj ID ve yeni metin gerekli');
        const row = await one(`SELECT v FROM ${SETTINGS} WHERE k='chat_msgs'`);
        let msgs = [];
        try { msgs = JSON.parse((row && row.v) || '[]'); } catch { msgs = []; }
        msgs = (Array.isArray(msgs) ? msgs : []).map(m => m.id === b.id ? { ...m, text: newText, edited: true } : m);
        await tx(async t => {
          await t.run(`DELETE FROM ${SETTINGS} WHERE k='chat_msgs'`);
          await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES('chat_msgs',$1)`, JSON.stringify(msgs));
        });
        send(res, 200, { ok: 1, messages: msgs });
        notifyClients();
        return;
      }

      if (b.action === 'mute') {
        const msgRow = await one(`SELECT v FROM ${SETTINGS} WHERE k='chat_msgs'`);
        let msgs = [];
        try { msgs = JSON.parse((msgRow && msgRow.v) || '[]'); } catch { msgs = []; }
        const tm = msgs.find(m => m.id === b.msgId);
        if (tm && !tm.admin) {
          const muteRow = await one(`SELECT v FROM ${SETTINGS} WHERE k='chat_mutes'`);
          let mutes = [];
          try { mutes = JSON.parse((muteRow && muteRow.v) || '[]'); } catch { mutes = []; }
          if (!Array.isArray(mutes)) mutes = [];
          if (!mutes.some(x => (tm.cid && x.cid === tm.cid) || (tm.ip && x.ip === tm.ip))) {
            mutes.push({ cid: tm.cid || '', ip: tm.ip || '', user: tm.user || 'Kullanıcı', at: new Date().toISOString() });
          }
          await tx(async t => {
            await t.run(`DELETE FROM ${SETTINGS} WHERE k='chat_mutes'`);
            await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES('chat_mutes',$1)`, JSON.stringify(mutes));
          });
        }
        send(res, 200, { ok: 1 });
        notifyClients();
        return;
      }

      if (b.action === 'unmute') {
        const muteRow = await one(`SELECT v FROM ${SETTINGS} WHERE k='chat_mutes'`);
        let mutes = [];
        try { mutes = JSON.parse((muteRow && muteRow.v) || '[]'); } catch { mutes = []; }
        mutes = (Array.isArray(mutes) ? mutes : []).filter((_, idx) => idx !== Number(b.index));
        await tx(async t => {
          await t.run(`DELETE FROM ${SETTINGS} WHERE k='chat_mutes'`);
          await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES('chat_mutes',$1)`, JSON.stringify(mutes));
        });
        send(res, 200, { ok: 1, mutes });
        notifyClients();
        return;
      }

      if (b.action === 'unban') {
        const banRow = await one(`SELECT v FROM ${SETTINGS} WHERE k='chat_bans'`);
        let bans = [];
        try { bans = JSON.parse((banRow && banRow.v) || '[]'); } catch { bans = []; }
        bans = (Array.isArray(bans) ? bans : []).filter((_, idx) => idx !== Number(b.index));
        await tx(async t => {
          await t.run(`DELETE FROM ${SETTINGS} WHERE k='chat_bans'`);
          await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES('chat_bans',$1)`, JSON.stringify(bans));
        });
        send(res, 200, { ok: 1, bans });
        notifyClients();
        return;
      }
    }
    if (u.pathname === '/api/chat/delete' && req.method === 'POST') {
      if (!isAdmin(req)) throw E(401, 'Yönetici yetkisi gerekli');
      const raw = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', ch => { d += ch; if (d.length > 8192) reject(E(413, 'Veri çok büyük')); });
        req.on('end', () => resolve(d));
        req.on('error', reject);
      });
      let b = {};
      try { b = JSON.parse(raw || '{}'); } catch { throw E(400, 'Geçersiz JSON'); }
      let msgs = [];
      if (!b.clearAll) {
        const row = await one(`SELECT v FROM ${SETTINGS} WHERE k='chat_msgs'`);
        try { msgs = JSON.parse((row && row.v) || '[]'); } catch { msgs = []; }
        msgs = Array.isArray(msgs) ? msgs.filter(m => m.id !== b.id) : [];
      }
      await tx(async t => {
        await t.run(`DELETE FROM ${SETTINGS} WHERE k='chat_msgs'`);
        await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES('chat_msgs',$1)`, JSON.stringify(msgs));
      });
      send(res, 200, { ok: 1, messages: msgs });
      notifyClients();
      return;
    }

    if (u.pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      res.on('close', () => sseClients.delete(res));
      return;
    }
    if (u.pathname === '/api/admin/extras' && req.method === 'POST') {
      if (!isAdmin(req)) throw E(401, 'Yetkisiz');
      const raw = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', ch => { d += ch; if (d.length > 65536) reject(E(413, 'Veri çok büyük')); });
        req.on('end', () => resolve(d));
        req.on('error', reject);
      });
      let b = {};
      try { b = JSON.parse(raw || '{}'); } catch { throw E(400, 'Geçersiz JSON'); }
      const allowed = ['playoff_cfg', 'custom_news', 'predictions'];
      const key = String(b.key || '');
      if (!allowed.includes(key)) throw E(400, 'Geçersiz ayar anahtarı');
      const val = typeof b.value === 'string' ? b.value : JSON.stringify(b.value ?? {});
      await tx(async t => {
        await t.run(`DELETE FROM ${SETTINGS} WHERE k=$1`, key);
        await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES($1,$2)`, key, val);
      });
      send(res, 200, { ok: 1 });
      notifyClients();
      if (key === 'custom_news') {
        try {
          const nw = typeof b.value === 'string' ? JSON.parse(b.value) : b.value;
          if (nw && nw.text) sendPushAll({ title: `📰 ${nw.tag || 'SON DAKİKA'} — KRD Ligi`, body: String(nw.text).slice(0, 140) });
        } catch {}
      }
      return;
    }
    if (u.pathname === '/api/predictions' && req.method === 'POST') {
      global.__predRate = global.__predRate || new Map();
      const _pIp = (typeof krdGetIp === 'function' ? krdGetIp(req) : req.socket.remoteAddress) || 'unknown';
      const _pNow = Date.now();
      const _pRec = global.__predRate.get(_pIp) || { n: 0, t: _pNow };
      if (_pNow - _pRec.t > 60000) { _pRec.n = 0; _pRec.t = _pNow; }
      _pRec.n++;
      global.__predRate.set(_pIp, _pRec);
      if (_pRec.n > 15) throw E(429, 'Çok fazla tahmin gönderildi, 1 dakika bekleyin');
    global.__predRate = global.__predRate || new Map();
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const now = Date.now();
    const rec = global.__predRate.get(ip) || { count: 0, ts: now };
    if (now - rec.ts > 60000) { rec.count = 0; rec.ts = now; }
    rec.count++;
    global.__predRate.set(ip, rec);
    if (rec.count > 15) {
      res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: 'Cok fazla tahmin istegi, 1 dakika bekleyin.' }));
    }
      const raw = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', ch => { d += ch; if (d.length > 32768) reject(E(413, 'Veri çok büyük')); });
        req.on('end', () => resolve(d));
        req.on('error', reject);
      });
      let b = {};
      try { b = JSON.parse(raw || '{}'); } catch { throw E(400, 'Geçersiz JSON'); }
      const mid = String(parseInt(b.match_id, 10) || '');
      const user = clean(String(b.user || '')).slice(0, 24);
      const pick = String(b.pick || '');
      if (!mid || !user) throw E(400, 'İsim ve maç bilgisi gerekli');
      if (!['H', 'D', 'A', ''].includes(pick)) throw E(400, 'Geçersiz tahmin');
      const s = await settings();
      let preds = {};
      try { preds = JSON.parse(s.predictions || '{}') || {}; } catch { preds = {}; }
      if (!preds[mid] || typeof preds[mid] !== 'object') preds[mid] = {};
      if (pick === '') delete preds[mid][user];
      else preds[mid][user] = pick;
      await tx(async t => {
        await t.run(`DELETE FROM ${SETTINGS} WHERE k='predictions'`);
        await t.run(`INSERT INTO ${SETTINGS}(k,v) VALUES('predictions',$1)`, JSON.stringify(preds));
      });
      send(res, 200, { ok: 1, predictions: preds });
      notifyClients();
      return;
    }
    if (u.pathname.startsWith('/api/')) {
      await api(req, res, u);
      if (req.method !== 'GET') notifyClients();
      return;
    }
    let reqPath = '/';
    try { reqPath = decodeURIComponent(u.pathname); } catch { reqPath = u.pathname; }
    let f = path.normalize(path.join(PUB, reqPath === '/' ? 'index.html' : reqPath));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
      if (reqPath.startsWith('/music/')) { res.writeHead(404); return res.end('Muzik bulunamadi'); }
      f = path.join(PUB, 'index.html');
    }
    if (path.basename(f) === 'index.html') {
      let html = fs.readFileSync(f, 'utf8');
      try {
        const s = await settings();
        const ogTitle = escHtml(`${s.name || DEF.name} — ${s.season || DEF.season}`);
        const ogDesc = escHtml(`${s.name || DEF.name} canlı puan durumu, fikstür, kafa kafaya rekabet ve gol krallığı istatistikleri.`);
        html = html.replace(/__OG_TITLE__/g, ogTitle).replace(/__OG_DESC__/g, ogDesc);
      } catch {
        html = html.replace(/__OG_TITLE__/g, 'KRD Ligi').replace(/__OG_DESC__/g, 'Canlı puan durumu, fikstür ve istatistikler.');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(html);
      return;
    }
    const ext = path.extname(f).toLowerCase();
    const mimeType = MIME[ext] || 'application/octet-stream';
    if (ext === '.mp3' || ext === '.ogg' || ext === '.wav' || ext === '.m4a') {
      const stat = fs.statSync(f);
      const total = stat.size;
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? Math.min(parseInt(parts[1], 10), total - 1) : total - 1;
        res.writeHead(206, {
          'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
          'Accept-Ranges': 'bytes',
          'Content-Length': (end - start) + 1,
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600'
        });
        fs.createReadStream(f, { start, end }).on('error', () => res.destroy()).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': total,
          'Accept-Ranges': 'bytes',
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600'
        });
        fs.createReadStream(f).on('error', () => res.destroy()).pipe(res);
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeType }); fs.createReadStream(f).on('error', () => res.destroy()).pipe(res);
  } catch (e) { const mine = Number.isInteger(e.code); if (!mine) console.error(e); if (!res.headersSent) send(res, mine ? e.code : 500, { error: mine ? e.message : 'Sunucu hatası' }); }
});

(async () => {
  try {
    await init(); SECRET = await loadSecret(); await initPush();
    if (await needsSetup()) { setupCode = crypto.randomBytes(5).toString('hex'); console.log(`\n>>> YÖNETİCİ KURULUM KODU (yalnızca bu oturum için): ${setupCode}\n>>> Sitenin /#/yonetici adresinde bu kodla Yusuf'un şifresini belirle.\n`); }
  } catch (e) { console.error('Veritabanı başlatılamadı:', e.message); process.exit(1); }
  server.listen(PORT, () => console.log(`KRD Ligi: http://localhost:${PORT}`));
})();
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { server.close(); pool.end().finally(() => process.exit(0)); });


