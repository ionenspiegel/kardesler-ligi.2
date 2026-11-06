// Uçtan uca test: sunucuyu PostgreSQL'de İZOLE geçici tablolarla (klt_... ön ekli) başlatır, tüm API akışını dener.
// Çalıştırma: node --env-file=.env.local test.js   (gerçek kl_ tablolarına dokunmaz; sonunda yalnızca kendi klt_ tablolarını siler)
const { spawn } = require('child_process'), assert = require('assert');
const DB = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!DB) { console.error('DATABASE_URL (veya TEST_DATABASE_URL) gerekli: node --env-file=.env.local test.js'); process.exit(1); }
const prefix = 'klt_' + Date.now().toString(36) + '_';
const port = 4100 + Math.floor(Math.random() * 500), base = `http://localhost:${port}`;
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: port, DATABASE_URL: DB, KL_PREFIX: prefix, SESSION_SECRET: '', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'inherit'] });
let out = '', dead = false; srv.stdout.on('data', d => out += d); srv.on('exit', () => dead = true);
let cookie = '';
const call = async (m, u, b, auth = true) => { const r = await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-KL': '1', ...(auth && cookie ? { Cookie: cookie } : {}) }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { s: r.status, d: await r.json().catch(() => ({})) }; };
const ok = (n, c) => { assert(c, n); console.log('✔', n); };
async function cleanup() {
  srv.kill(); if (!prefix.startsWith('klt_')) return;
  try { const { Pool } = require('pg'); const p = new Pool({ connectionString: DB, max: 1 });
    for (const t of ['matches', 'teams', 'admin', 'settings', 'secret']) await p.query(`DROP TABLE IF EXISTS ${prefix}${t}`).catch(() => { }); await p.end(); } catch { }
}
(async () => {
  for (let i = 0; ; i++) { if (dead) throw new Error('Sunucu başlamadı (yukarıdaki hataya bakın)'); if (i > 120) throw new Error('Sunucu 60 sn içinde açılmadı'); try { if ((await fetch(base + '/api/me')).ok) break; } catch { } await new Promise(r => setTimeout(r, 500)); }
  const code = /KODU[^:]*: (\w+)/.exec(out)[1];
  ok('kurulum gerekli', (await call('GET', '/api/me')).d.needsSetup);
  ok('yanlış kurulum kodu reddedilir', (await call('POST', '/api/admin/setup', { code: 'x', password: 'sifre1234' })).s === 403);
  ok('yetkisiz yazma reddedilir', (await call('POST', '/api/admin/teams', { name: 'A' }, false)).s === 401);
  ok('X-KL başlığı yoksa reddedilir', (await fetch(base + '/api/admin/logout', { method: 'POST' })).status === 403);
  ok('Yusuf hesabı oluşur', (await call('POST', '/api/admin/setup', { code, password: 'sifre1234' })).s === 200);
  ok('ikinci kurulum engellenir', (await call('POST', '/api/admin/setup', { code, password: 'baska1234' })).s === 409);
  await call('POST', '/api/admin/logout'); cookie = '';
  ok('Yunus girişi reddedilir', (await call('POST', '/api/admin/login', { username: 'yunus', password: 'sifre1234' })).s === 401);
  ok('yanlış şifre reddedilir', (await call('POST', '/api/admin/login', { username: 'yusuf', password: 'yanlis' })).s === 401);
  ok('Yusuf girişi', (await call('POST', '/api/admin/login', { username: 'yusuf', password: 'sifre1234' })).s === 200);
  const ids = []; for (const n of ['Aslanlar', 'Kartallar', 'Kurtlar']) ids.push((await call('POST', '/api/admin/teams', { name: n, color: '#ff0000' })).d.id);
  ok('takım ekleme + tekrar isim engeli', (await call('POST', '/api/admin/teams', { name: 'Aslanlar' })).s === 409);
  ok('takım düzenleme', (await call('PUT', '/api/admin/teams/' + ids[0], { name: 'Aslanlar FK', short: 'asl', color: '#00ff00' })).s === 200);
  ok('olmayan/geçersiz takım id 404 verir (500 değil)', (await call('PUT', '/api/admin/teams/abc', { name: 'X' })).s === 404 && (await call('DELETE', '/api/admin/teams/99999999999')).s === 404);
  ok('çift devre fikstür (3 takım → 6 hafta, 6 maç)', (await call('POST', '/api/admin/fixture', { double: true })).d.weeks === 6);
  let L = (await call('GET', '/api/league')).d; ok('6 maç oluştu', L.matches.length === 6);
  const m = L.matches[0];
  await call('PUT', '/api/admin/matches/' + m.id, { hs: 3, aws: 1, played: 1 });
  L = (await call('GET', '/api/league')).d; const top = L.table[0];
  ok('puan tablosu doğru (3 puan, +2 averaj)', top.pts === 3 && top.gd === 2 && top.id === m.home_id);
  await call('PUT', '/api/admin/matches/' + m.id, { hs: 1, aws: 1 });
  L = (await call('GET', '/api/league')).d; ok('yanlış skor düzeltilince tablo güncellenir (beraberlik)', L.table.every(t => t.pts <= 1) && L.table.filter(t => t.pts === 1).length === 2);
  ok('oynanmış maç varken fikstür engellenir', (await call('POST', '/api/admin/fixture', {})).s === 409);
  ok('aynı takımla maç reddedilir', (await call('PUT', '/api/admin/matches/' + m.id, { away_id: m.home_id })).s === 400);
  ok('geçersiz takım id\'li maç 400 verir (500 değil)', (await call('POST', '/api/admin/matches', { home_id: 'abc', away_id: ids[1] })).s === 400);
  ok('manuel maç ekleme', (await call('POST', '/api/admin/matches', { week: 9, home_id: ids[0], away_id: ids[1] })).d.id > 0);
  ok('ayarlar (galibiyet 2 puan)', (await call('PUT', '/api/admin/settings', { name: 'Test Ligi', season: '2027', win: 2, draw: 1, loss: 0, week: 2 })).s === 200);
  ok('şifre değişimi', (await call('POST', '/api/admin/password', { current: 'sifre1234', next: 'yeni12345' })).s === 200);
  ok('takım silinince maçları da silinir', (await call('DELETE', '/api/admin/teams/' + ids[2])).s === 200 && (await call('GET', '/api/league')).d.matches.length === 3);
  ok('yeni sezon', (await call('POST', '/api/admin/season', { name: '2028' })).s === 200 && (await call('GET', '/api/league')).d.matches.length === 0);
  ok('yedek indirilebilir', (await call('GET', '/api/admin/backup')).d.teams.length === 2);
  ok('ana sayfa servis edilir', (await fetch(base + '/')).status === 200);
  console.log('\nTüm testler geçti'); await cleanup();
})().catch(async e => { console.error('✖', e.message); await cleanup(); process.exit(1); });
