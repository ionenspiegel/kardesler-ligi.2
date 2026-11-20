'use strict';
// KRD Ligi — takım tabanlı lig. Veritabanı: PostgreSQL (Neon), bağlantı: DATABASE_URL.
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
const mkToken = () => { const e = Date.now() + 12 * 36e5; return `${e}.${sign('s' + e)}`; };
const isAdmin = req => { const m = /(?:^|; )kl_s=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return false; const [e, s] = m[1].split('.'); return +e > Date.now() && s && eq(s, sign('s' + e)); };
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

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const send = (res, code, obj, h = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...h }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, no) => { let d = ''; req.on('data', c => { d += c; if (d.length > 2e6) { no(E(413, 'Çok büyük')); req.destroy(); } }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch { no(E(400, 'Geçersiz JSON')); } }); });
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
      const m = await matchData(b);
      const r = await run(`INSERT INTO ${MATCHES}(week,home_id,away_id,hs,aws,played,updated,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, m.week, m.home_id, m.away_id, m.hs, m.aws, m.played, new Date().toISOString(), m.note);
      if (m.played) {
        const ht = await one(`SELECT name FROM ${TEAMS} WHERE id=$1`, m.home_id);
        const at = await one(`SELECT name FROM ${TEAMS} WHERE id=$1`, m.away_id);
        sendPushAll({ title: '⚽ Maç Sonucu — KRD Ligi', body: `${ht ? ht.name : 'Ev'} ${m.hs} - ${m.aws} ${at ? at.name : 'Dep'}` });
      }
      return send(res, 200, { id: Number(r.rows[0].id) });
    }
    if (!okId(id)) throw E(404, 'Maç yok');
    const old = await one(`SELECT * FROM ${MATCHES} WHERE id=$1`, id); if (!old) throw E(404, 'Maç yok');
    if (M === 'PUT') {
      const m = await matchData(b, old);
      await run(`UPDATE ${MATCHES} SET week=$1,home_id=$2,away_id=$3,hs=$4,aws=$5,played=$6,updated=$7,note=$8 WHERE id=$9`, m.week, m.home_id, m.away_id, m.hs, m.aws, m.played, new Date().toISOString(), m.note, id);
      if (m.played && (!old.played || old.hs !== m.hs || old.aws !== m.aws)) {
        const ht = await one(`SELECT name FROM ${TEAMS} WHERE id=$1`, m.home_id);
        const at = await one(`SELECT name FROM ${TEAMS} WHERE id=$1`, m.away_id);
        sendPushAll({ title: '⚽ Maç Sonucu — KRD Ligi', body: `${ht ? ht.name : 'Ev'} ${m.hs} - ${m.aws} ${at ? at.name : 'Dep'}` });
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
      await t.run(`DELETE FROM ${MATCHES}`);
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
  webpush.setVapidDetails('mailto:admin@krdligi.local', pub.v, priv.v);
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
        await webpush.sendNotification(sub, msg);
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

const sseClients = new Set();
function notifyClients() {
  for (const client of sseClients) {
    try { client.write('data: update\n\n'); }
    catch { sseClients.delete(client); }
  }
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
  if (req.url.startsWith('/sw.js')) res.setHeader('Service-Worker-Allowed', '/');
  try {
    const u = new URL(req.url, 'http://x');
    
    
    if (u.pathname === '/api/push/test' && req.method === 'POST') {
      const row = await one(`SELECT v FROM ${SETTINGS} WHERE k='push_subs'`);
      let subs = [];
      try { subs = JSON.parse((row && row.v) || '[]'); } catch { subs = []; }
      await sendPushAll({ title: '🔔 Test Bildirimi — KRD Ligi', body: 'Canlı bildirim sistemi sorunsuz çalışıyor!' });
      return send(res, 200, { ok: 1, count: subs.length, ready: !!webpush && !!VAPID_PUBLIC });
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
      return send(res, 200, { ok: 1 });
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
    let f = path.normalize(path.join(PUB, u.pathname === '/' ? 'index.html' : u.pathname));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || !fs.statSync(f).isFile()) f = path.join(PUB, 'index.html');
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
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).on('error', () => res.destroy()).pipe(res);
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
