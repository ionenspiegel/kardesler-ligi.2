'use strict';
// Canlı sitenin "Yedek indir" ile aldığın JSON dosyasını Neon PostgreSQL'e aktarır.
//   Deneme (hiçbir şey yazmaz):  node --env-file=.env.local scripts/import-backup.js yedek.json
//   Gerçek aktarım:              node --env-file=.env.local scripts/import-backup.js yedek.json --apply
// Güvenlik: hiçbir tabloyu silmez/DROP etmez. Hedefte zaten takım veya maç varsa DURUR.
const fs = require('fs');
const { Pool } = require('pg');
const { ADMIN, TEAMS, MATCHES, SETTINGS, DDL } = require('../schema')(process.env.KL_PREFIX || 'kl_');
const file = process.argv[2], apply = process.argv.includes('--apply');
if (!file || !process.env.DATABASE_URL) { console.error('Kullanım: node --env-file=.env.local scripts/import-backup.js <yedek.json> [--apply]'); process.exit(1); }
const bad = m => { console.error('HATA:', m); process.exit(1); };
let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { bad('Yedek dosyası okunamadı: ' + e.message); }
const teams = j.teams, matches = j.matches || [];
if (!Array.isArray(teams) || !Array.isArray(matches)) bad('Yedek biçimi tanınmadı (teams/matches dizileri yok).');
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const ids = new Set(), names = new Set();
for (const t of teams) {
  if (!isInt(t.id, 1, 2147483647) || typeof t.name !== 'string' || !t.name.trim()) bad('Geçersiz takım: ' + JSON.stringify(t));
  if (ids.has(t.id) || names.has(t.name)) bad('Yinelenen takım: ' + t.name); ids.add(t.id); names.add(t.name);
}
const mids = new Set();
for (const m of matches) {
  if (!isInt(m.id, 1, 2147483647) || mids.has(m.id) || !ids.has(m.home_id) || !ids.has(m.away_id) || m.home_id === m.away_id || !isInt(m.week, 1, 200) || !isInt(m.hs, 0, 99) || !isInt(m.aws, 0, 99)) bad('Geçersiz maç: ' + JSON.stringify(m));
  mids.add(m.id);
}
const S = j.settings && typeof j.settings === 'object' ? Object.entries(j.settings).filter(([k]) => ['name', 'season', 'win', 'draw', 'loss', 'week'].includes(k)) : [];
const adm = j.admin && j.admin.username && j.admin.salt && j.admin.hash ? j.admin : null; // yalnızca dosyada varsa
console.log(`Yedekte: ${teams.length} takım, ${matches.length} maç, ${S.length} ayar${adm ? ', yönetici kaydı' : ' (yönetici kaydı YOK — ilk açılışta kurulum koduyla şifre belirlenir)'}.`);

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(724119)');
    for (const s of DDL) await c.query(s);
    const n = async t => +(await c.query(`SELECT COUNT(*)::int n FROM ${t}`)).rows[0].n;
    const [nt, nm] = [await n(TEAMS), await n(MATCHES)];
    if (nt || nm) throw new Error(`Hedefte zaten ${nt} takım / ${nm} maç var. Üzerine yazmamak için duruyorum; hiçbir şey değişmedi.`);
    if (!apply) { await c.query('ROLLBACK'); console.log('DENEME tamam: yedek geçerli, hedef boş. Yazmak için komutun sonuna --apply ekle.'); return; }
    for (const t of teams) await c.query(`INSERT INTO ${TEAMS}(id,name,short,color) VALUES($1,$2,$3,$4)`, [t.id, t.name, t.short || null, /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : '#22c55e']);
    for (const m of matches) await c.query(`INSERT INTO ${MATCHES}(id,week,home_id,away_id,hs,aws,played,updated) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [m.id, m.week, m.home_id, m.away_id, m.hs, m.aws, m.played ? 1 : 0, m.updated || null]);
    for (const [k, v] of S) await c.query(`INSERT INTO ${SETTINGS}(k,v) VALUES($1,$2) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v`, [k, String(v)]);
    if (adm) await c.query(`INSERT INTO ${ADMIN}(id,username,salt,hash) VALUES(1,$1,$2,$3) ON CONFLICT DO NOTHING`, [String(adm.username).toLowerCase(), adm.salt, adm.hash]);
    for (const t of [TEAMS, MATCHES]) await c.query(`SELECT setval(pg_get_serial_sequence('${t}','id'), COALESCE(MAX(id),1), MAX(id) IS NOT NULL) FROM ${t}`);
    const [nt2, nm2] = [await n(TEAMS), await n(MATCHES)];
    if (nt2 !== teams.length || nm2 !== matches.length) throw new Error('Sayılar uyuşmadı; işlem geri alındı.');
    await c.query('COMMIT'); console.log(`AKTARILDI: ${nt2} takım, ${nm2} maç Neon'a yazıldı.`);
  } catch (e) { try { await c.query('ROLLBACK'); } catch { } console.error('DURDU:', e.message); process.exitCode = 1; }
  finally { c.release(); await pool.end(); }
})();
