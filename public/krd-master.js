
(function () {
  if (window._krdMasterLoaded) return;
  window._krdMasterLoaded = true;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  window._krdLiveS = window._krdLiveS || null;
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const res = await origFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.includes('/api/state') || url.includes('/api/data') || url.includes('/api/league')) {
        res.clone().json().then(d => {
          if (d && Array.isArray(d.teams) && Array.isArray(d.matches)) window._krdLiveS = d;
        }).catch(() => {});
      }
    } catch {}
    return res;
  };

  const getS = () => (typeof S !== 'undefined' ? S : window._krdLiveS);
  const isAdm = () => {
    const st = getS();
    const sl = (st && st.settings && st.settings.admin_slug) || 'krd-kontrol';
    const h = (location.hash || '').toLowerCase();
    return h.startsWith('#/yonetici') || h.startsWith('#/' + sl.toLowerCase());
  };

  window._krdData = { extras: {}, predictions: {}, archive: [], badges: {}, cup: {} };
  window._krdActiveTab = window._krdActiveTab || 'all';
  let _isApplying = false;

  const DEFAULT_RULES = [
    '📅 Yürürlük Tarihi: Bu kurallar 22 Kasım 2026 tarihinden itibaren oynanacak maçlarda geçerlidir.',
    '1️⃣ Maç Süresi: Maçlar 11 veya 12 dk oynanır. Yanlış kuran tarafa -1 Puan silme cezası uygulanır ve maç tekrarlanır.',
    '2️⃣ Maçtan Çekilme: Maçı terk eden veya çekilen kulüp 3-0 hükmen mağlup sayılır ve -3 Puan silinir.',
    '3️⃣ Bağlantı Kopması: Kalan süre ve skor korunarak maç tamamlanır; bilerek koparana -3 Puan cezası uygulanır.'
  ].join('\n');

  async function pullAll() {
    try {
      const [r1, r2, r3] = await Promise.all([
        origFetch('/api/krd-extras?_=' + Date.now()),
        origFetch('/api/krd-mega-data?_=' + Date.now()),
        origFetch('/api/krd-pro5-data?_=' + Date.now())
      ]);
      if (r1.ok) { const d1 = await r1.json(); window._krdData.extras = d1.extras || {}; }
      if (r2.ok) { const d2 = await r2.json(); window._krdData.predictions = d2.predictions || {}; window._krdData.archive = d2.archive || []; }
      if (r3.ok) { const d3 = await r3.json(); window._krdData.badges = d3.badges || {}; window._krdData.cup = d3.cup || {}; }
    } catch {}
  }

  
  // === KRD_WAKE_AND_CLOCK ===
  let _wakeTimer = setTimeout(() => {
    if (window._krdLiveS) return;
    const w = document.createElement('div');
    w.id = 'krdWakeBanner';
    w.style.cssText = 'position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:9999;background:#0f172a;color:#fde047;border:1px solid rgba(250,204,21,.45);padding:9px 15px;border-radius:999px;font-size:12px;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.5);';
    w.textContent = '⏳ Sunucu uyanıyor, canlı veriler yükleniyor...';
    document.body.appendChild(w);
  }, 2200);

  function updateLastSyncBadge() {
    const w = document.getElementById('krdWakeBanner');
    if (w) w.remove();
    clearTimeout(_wakeTimer);
    const nav = document.getElementById('krdNavTabs');
    if (!nav || isAdm()) return;
    let clk = document.getElementById('krdSyncClock');
    if (!clk) {
      clk = document.createElement('span');
      clk.id = 'krdSyncClock';
      clk.style.cssText = 'margin-left:auto;padding:4px 8px;font-size:10.5px;font-weight:700;color:#94a3b8;white-space:nowrap;';
      nav.appendChild(clk);
    }
    const d = new Date();
    clk.textContent = '🕒 ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }

  function injectStyles() {
    if (document.getElementById('krdMasterCleanCss')) return;
    const st = document.createElement('style');
    st.id = 'krdMasterCleanCss';
    st.textContent = `
      html { overflow-anchor: none; }
      #krdMaintScreen {
        position: fixed; inset: 0; z-index: 99999;
        background: radial-gradient(circle at top, #1e293b, #020617);
        color: #fff; display: flex; flex-direction: column;
        align-items: center; justify-content: center; text-align: center; padding: 24px;
      }
      #krdPinnedAnn {
        box-sizing: border-box; width: calc(100% - 24px); max-width: 960px;
        margin: 8px auto 6px; padding: 10px 14px; border-radius: 12px;
        background: linear-gradient(90deg, rgba(234,88,12,.28), rgba(250,204,21,.2));
        border: 1.5px solid rgba(250,204,21,.55); color: #fef08a;
        font-size: 13px; font-weight: 700; text-align: left;
      }
      #krdNavTabs {
        box-sizing: border-box; position: sticky; top: 8px; z-index: 950;
        width: calc(100% - 24px); max-width: 960px; margin: 8px auto 12px;
        display: flex; align-items: center; gap: 6px;
        overflow-x: auto; scrollbar-width: none;
        padding: 7px 8px; border-radius: 14px;
        background: #0b1120; border: 1px solid rgba(56, 189, 248, 0.42);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      }
      #krdNavTabs::-webkit-scrollbar { display: none; }
      .krd-tab-btn {
        box-sizing: border-box; flex: 0 0 auto; padding: 8px 13px; border-radius: 10px;
        font-size: 12px; font-weight: 800; cursor: pointer;
        border: 1px solid rgba(148, 163, 184, 0.25);
        background: #131c31; color: #cbd5e1;
        white-space: nowrap; user-select: none; margin: 0;
      }
      .krd-tab-btn.active {
        background: linear-gradient(135deg, #0284c7, #2563eb);
        color: #fff; border-color: #38bdf8;
      }
      #krdDedicatedView {
        box-sizing: border-box; width: calc(100% - 24px); max-width: 960px;
        margin: 10px auto 18px; display: grid; gap: 12px;
      }
      #krdDedicatedView * { box-sizing: border-box; min-width: 0; }
      .krd-clean-card {
        background: rgba(15, 23, 42, 0.94);
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 14px; padding: 14px 16px;
        display: grid; gap: 10px; text-align: left;
      }
      .krd-crest {
        display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; border-radius: 6px; font-size: 9.5px;
        font-weight: 900; margin-right: 6px; color: #fff;
        border: 1px solid rgba(255,255,255,.3);
      }
      .krd-delta-up { color: #4ade80; font-size: 10px; font-weight: 900; margin-left: 4px; }
      .krd-delta-dn { color: #f87171; font-size: 10px; font-weight: 900; margin-left: 4px; }
      .krd-streak {
        display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 999px;
        font-size: 9.5px; font-weight: 800; background: rgba(250,204,21,.16);
        color: #fde047; border: 1px solid rgba(250,204,21,.32);
      }
      .krd-form-dots { display: inline-flex; gap: 3px; margin-left: 6px; vertical-align: middle; }
      .krd-dot {
        width: 15px; height: 15px; border-radius: 4px; font-size: 9px; font-weight: 900;
        display: inline-flex; align-items: center; justify-content: center; color: #fff;
      }
      .krd-dot-G { background: #16a34a; }
      .krd-dot-B { background: #ca8a04; }
      .krd-dot-M { background: #dc2626; }
      #krdPodium { margin: 10px 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      @media(max-width: 560px) { #krdPodium { grid-template-columns: 1fr; } }
      .krd-pod-item {
        background: rgba(15, 23, 42, .92); border: 1px solid rgba(250, 204, 21, .28);
        border-radius: 12px; padding: 9px 11px; display: grid; gap: 2px;
      }
      .krd-pred-line {
        display: grid; grid-template-columns: 1fr 44px 12px 44px 1fr auto;
        align-items: center; gap: 5px; padding: 6px 8px; border-radius: 9px;
        background: rgba(15, 23, 42, .75); border: 1px solid rgba(148, 163, 184, .18); font-size: 11.5px;
      }
      .krd-pred-line input {
        width: 100%; text-align: center; padding: 3px; border-radius: 6px;
        border: 1px solid #334155; background: #020617; color: #fff; font-weight: 800;
      }
      .krd-cup-grid { margin-top: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      @media(max-width: 540px) { .krd-cup-grid { grid-template-columns: 1fr; } }
      .krd-cup-box {
        background: rgba(2, 6, 23, .65); border: 1px solid rgba(56, 189, 248, .25);
        border-radius: 10px; padding: 8px 10px; font-size: 12px; display: grid; gap: 4px;
      }
      .krd-h2h-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; }
      .krd-h2h-grid select {
        padding: 8px; border-radius: 9px; border: 1px solid #334155;
        background: #020617; color: #fff; font-size: 12.5px; font-weight: 700;
      }
      .krd-derby { border: 1.5px solid rgba(250,204,21,.7) !important; box-shadow: 0 0 18px rgba(250,204,21,.18); }
      .krd-derby-badge {
        display: inline-block; margin-bottom: 5px; padding: 2px 8px; border-radius: 999px;
        font-size: 10px; font-weight: 900; background: linear-gradient(90deg,#facc15,#f97316); color: #090d16;
      }
      .krd-png-btn {
        margin-top: 6px; width: 100%; padding: 5px 8px !important; font-size: 11px !important;
        font-weight: 700 !important; border-radius: 8px !important;
        background: rgba(250,204,21,.15) !important; border: 1px solid rgba(250,204,21,.35) !important;
        color: #fde047 !important; cursor: pointer;
      }
      #krdPosterPop {
        position: fixed; inset: 0; z-index: 10000; background: rgba(2,6,23,.85);
        display: none; align-items: center; justify-content: center; padding: 16px;
      }
      #krdPosterPop.open { display: flex; }
      .krd-poster-in {
        width: 100%; max-width: 440px; background: #0f172a;
        border: 1px solid rgba(250,204,21,.4); border-radius: 16px;
        padding: 14px; display: grid; gap: 10px; text-align: center;
      }
      .krd-poster-in img { width: 100%; border-radius: 10px; }
      #krdMasterAdmBox {
        box-sizing: border-box; width: 100%; max-width: 960px; margin: 16px auto;
        background: rgba(15, 23, 42, .96); border: 1.5px solid rgba(250, 204, 21, .42);
        border-radius: 14px; padding: 15px 16px; display: grid; gap: 11px;
        text-align: left; overflow-x: hidden;
      }
      #krdMasterAdmBox * { box-sizing: border-box; min-width: 0; }
      #krdMasterAdmBox input[type="text"], #krdMasterAdmBox textarea { width: 100%; }
      .krd-tab-hidden { display: none !important; }
    `;
    document.head.appendChild(st);
  }

  function calcStats() {
    const st = getS() || {}, teams = st.teams || [], matches = st.matches || [];
    const wP = Number((st.settings && st.settings.win) ?? 3), dP = Number((st.settings && st.settings.draw) ?? 1);
    const played = matches.filter(m => m.played);
    const maxW = played.length ? Math.max(...played.map(m => Number(m.week || 1))) : 1;
    const run = sub => {
      const m = {};
      teams.forEach(t => { m[t.id] = { id: t.id, name: t.name, o: 0, g: 0, b: 0, m: 0, ag: 0, yg: 0, av: 0, p: 0 }; });
      sub.forEach(x => {
        if (!m[x.home_id] || !m[x.away_id]) return;
        const hs = +x.hs || 0, aw = +x.aws || 0;
        m[x.home_id].o++; m[x.away_id].o++;
        m[x.home_id].ag += hs; m[x.home_id].yg += aw;
        m[x.away_id].ag += aw; m[x.away_id].yg += hs;
        m[x.home_id].av += hs - aw; m[x.away_id].av += aw - hs;
        if (hs > aw) { m[x.home_id].g++; m[x.home_id].p += wP; m[x.away_id].m++; }
        else if (aw > hs) { m[x.away_id].g++; m[x.away_id].p += wP; m[x.home_id].m++; }
        else { m[x.home_id].b++; m[x.away_id].b++; m[x.home_id].p += dP; m[x.away_id].p += dP; }
      });
      return Object.values(m).sort((a, b) => (b.p - a.p) || (b.av - a.av) || (b.ag - a.ag));
    };
    const table = run(played), nowR = {}, prevR = {}, streaks = {};
    table.forEach((r, i) => { nowR[r.id] = i + 1; });
    run(played.filter(x => Number(x.week || 1) < maxW)).forEach((r, i) => { prevR[r.id] = i + 1; });
    teams.forEach(t => {
      const my = played.filter(x => x.home_id === t.id || x.away_id === t.id).sort((a, b) => (+a.week - +b.week) || (+a.id - +b.id));
      let unb = 0, win = 0;
      for (let i = my.length - 1; i >= 0; i--) {
        const gf = my[i].home_id === t.id ? +my[i].hs : +my[i].aws, ga = my[i].home_id === t.id ? +my[i].aws : +my[i].hs;
        if (gf >= ga) unb++; else break;
      }
      for (let i = my.length - 1; i >= 0; i--) {
        const gf = my[i].home_id === t.id ? +my[i].hs : +my[i].aws, ga = my[i].home_id === t.id ? +my[i].aws : +my[i].hs;
        if (gf > ga) win++; else break;
      }
      streaks[t.id] = {
        delta: maxW > 1 ? ((prevR[t.id] || nowR[t.id]) - nowR[t.id]) : 0,
        badge: win >= 3 ? ('🔥 ' + win + 'G Seri') : unb >= 3 ? ('🛡️ ' + unb + 'M Yenilmez') : ''
      };
    });
    return { table, streaks };
  }

  function openPoster(title, url, file) {
    let pop = document.getElementById('krdPosterPop');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'krdPosterPop';
      pop.onclick = e => { if (e.target === pop) pop.classList.remove('open'); };
      document.body.appendChild(pop);
    }
    pop.innerHTML = `<div class="krd-poster-in"><div style="display:flex;justify-content:space-between;align-items:center;"><b style="color:#facc15;">${title}</b><button type="button" id="krdClosePop">✕</button></div><img src="${url}"><a href="${url}" download="${file}" class="btn pri" style="display:block;padding:10px;border-radius:10px;text-decoration:none;font-weight:800;background:#22c55e;color:#052e16;">⬇️ Görseli İndir (PNG)</a></div>`;
    document.getElementById('krdClosePop').onclick = () => pop.classList.remove('open');
    pop.classList.add('open');
  }

  window.krdStandingsPng = function () {
    const st = getS() || {}, { table } = calcStats();
    const c = document.createElement('canvas'); c.width = 900; c.height = 300 + table.length * 64;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 900, c.height); g.addColorStop(0, '#090f1e'); g.addColorStop(1, '#111c33');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 900, c.height);
    ctx.fillStyle = '#facc15'; ctx.fillRect(0, 0, 900, 10); ctx.font = 'bold 20px sans-serif';
    ctx.fillText('✦ İONELSPIEGEL SUNAR • RESMİ PUAN DURUMU', 46, 58);
    ctx.fillStyle = '#fff'; ctx.font = '900 38px sans-serif';
    ctx.fillText(((st.settings && st.settings.name) || 'KRD LİGİ').toUpperCase(), 46, 106);
    const sy = 175; ctx.fillStyle = 'rgba(56,189,248,0.16)'; ctx.fillRect(40, sy - 30, 820, 42);
    ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 18px sans-serif';
    ctx.fillText('#', 58, sy); ctx.fillText('KULÜP', 110, sy); ctx.fillText('O', 500, sy); ctx.fillText('G', 565, sy); ctx.fillText('B', 625, sy); ctx.fillText('M', 685, sy); ctx.fillText('AV', 745, sy); ctx.fillText('P', 820, sy);
    table.forEach((r, i) => {
      const y = sy + 56 + i * 62;
      ctx.fillStyle = i === 0 ? 'rgba(250,204,21,0.16)' : 'rgba(255,255,255,0.04)'; ctx.fillRect(40, y - 34, 820, 50);
      ctx.fillStyle = i === 0 ? '#facc15' : '#e2e8f0'; ctx.font = 'bold 21px sans-serif';
      ctx.fillText(String(i + 1), 58, y); ctx.fillText(r.name, 110, y);
      ctx.fillStyle = '#cbd5e1'; ctx.font = '600 20px sans-serif';
      ctx.fillText(String(r.o), 500, y); ctx.fillText(String(r.g), 565, y); ctx.fillText(String(r.b), 625, y); ctx.fillText(String(r.m), 685, y); ctx.fillText(r.av > 0 ? '+' + r.av : String(r.av), 745, y);
      ctx.fillStyle = i === 0 ? '#facc15' : '#38bdf8'; ctx.font = '900 22px sans-serif'; ctx.fillText(String(r.p), 820, y);
    });
    openPoster('📸 Puan Tablosu Afişi', c.toDataURL('image/png'), 'krd-puan-durumu.png');
  };

  window.krdMatchPng = function (mid) {
    const st = getS() || {}, m = (st.matches || []).find(x => Number(x.id) === Number(mid));
    if (!m) return;
    const tMap = Object.fromEntries((st.teams || []).map(t => [t.id, t.name]));
    const h = tMap[m.home_id] || 'Ev', a = tMap[m.away_id] || 'Dep';
    const c = document.createElement('canvas'); c.width = 900; c.height = 460;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#090f1e'; ctx.fillRect(0, 0, 900, 460);
    ctx.fillStyle = '#facc15'; ctx.fillRect(0, 0, 900, 10); ctx.font = 'bold 20px sans-serif';
    ctx.fillText('✦ İONELSPIEGEL SUNAR • ' + m.week + '. HAFTA MAÇ SONUCU', 46, 58);
    ctx.fillStyle = '#fff'; ctx.font = '800 26px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(h, 210, 220); ctx.fillText(a, 690, 220);
    ctx.fillStyle = '#facc15'; ctx.font = '900 74px sans-serif';
    ctx.fillText(m.hs + ' - ' + m.aws, 450, 235);
    openPoster('🃏 Maç Sonucu Afişi', c.toDataURL('image/png'), 'mac-sonucu-h' + m.week + '.png');
  };

  window.krdSendPredict = async function (mid) {
    const nick = (document.getElementById('krdPredNick')?.value || localStorage.getItem('krd_pred_nick') || '').trim();
    if (!nick) return alert('Lütfen adınızı yazın.');
    localStorage.setItem('krd_pred_nick', nick);
    const hs = Number(document.getElementById('phs_' + mid)?.value), aws = Number(document.getElementById('paws_' + mid)?.value);
    if (Number.isNaN(hs) || Number.isNaN(aws)) return alert('Skor girin.');
    const r = await origFetch('/api/krd-predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nick, matchId: mid, hs, aws }) });
    const d = await r.json();
    if (!r.ok) return alert(d.error || 'Hata');
    window._krdData.predictions = d.predictions || {};
    if (typeof toast === 'function') toast('🎯 Tahminin kaydedildi!');
    buildDedicatedPanels();
  };

  window.krdSendReport = async function () {
    const sender = (document.getElementById('krdRepSender')?.value || '').trim() || 'Ziyaretçi';
    const msg = (document.getElementById('krdRepMsg')?.value || '').trim();
    if (!msg) return alert('Lütfen bildirmek istediğiniz sorunu yazın.');
    const r = await origFetch('/api/krd-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sender, msg }) });
    if (r.ok) {
      document.getElementById('krdRepMsg').value = '';
      if (typeof toast === 'function') toast('📩 Sorun bildiriminiz yöneticiye iletildi!');
    } else {
      let errTxt = 'Gönderilemedi.';
      try { const ed = await r.json(); if (ed && ed.error) errTxt = ed.error; } catch {}
      alert(errTxt);
    }
  };

  window.krdUpdateH2H = function () {
    const st = getS() || {};
    const t1 = Number(document.getElementById('krdH2H_A')?.value);
    const t2 = Number(document.getElementById('krdH2H_B')?.value);
    const out = document.getElementById('krdH2HResult');
    if (!out || !t1 || !t2 || t1 === t2) {
      if (out) out.innerHTML = '<div class="mut" style="font-size:12px;">Karşılaştırmak için iki farklı kulüp seçin.</div>';
      return;
    }
    const tMap = Object.fromEntries((st.teams || []).map(t => [t.id, t.name]));
    const between = (st.matches || []).filter(m =>
      m.played && ((m.home_id === t1 && m.away_id === t2) || (m.home_id === t2 && m.away_id === t1))
    );
    if (!between.length) {
      out.innerHTML = '<div class="mut" style="font-size:12px;">Bu iki kulüp arasında henüz oynanmış maç yok.</div>';
      return;
    }
    let w1 = 0, w2 = 0, dr = 0, g1 = 0, g2 = 0;
    between.forEach(m => {
      const s1 = m.home_id === t1 ? +m.hs : +m.aws;
      const s2 = m.home_id === t1 ? +m.aws : +m.hs;
      g1 += s1; g2 += s2;
      if (s1 > s2) w1++; else if (s2 > s1) w2++; else dr++;
    });
    out.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr auto 1fr;text-align:center;background:rgba(2,6,23,.65);padding:10px;border-radius:10px;border:1px solid rgba(56,189,248,.25);">
        <div><b style="color:#38bdf8;font-size:18px;">${w1}</b><div style="font-size:11px;">${esc(tMap[t1])} Galibiyet (${g1} Gol)</div></div>
        <div style="padding:0 12px;"><b style="color:#facc15;font-size:18px;">${dr}</b><div style="font-size:11px;">Beraberlik</div></div>
        <div><b style="color:#fb7185;font-size:18px;">${w2}</b><div style="font-size:11px;">${esc(tMap[t2])} Galibiyet (${g2} Gol)</div></div>
      </div>
      <div style="margin-top:6px;display:grid;gap:4px;font-size:12px;">
        ${between.map(m => `<div style="padding:5px 8px;border-radius:7px;background:rgba(255,255,255,.04);">Hafta ${m.week}: <b>${esc(tMap[m.home_id])} ${m.hs} - ${m.aws} ${esc(tMap[m.away_id])}</b></div>`).join('')}
      </div>`;
  };

  function ensurePersistentChrome() {
    const app = document.getElementById('app');
    if (!app || !app.parentNode) return;

    if (isAdm()) {
      document.getElementById('krdNavTabs')?.remove();
      document.getElementById('krdDedicatedView')?.remove();
      document.getElementById('krdPinnedAnn')?.remove();
      return;
    }

    injectStyles();
    const ex = (window._krdData && window._krdData.extras) || {};

    let ann = document.getElementById('krdPinnedAnn');
    if (ex.announcement || ex.mvp) {
      if (!ann) {
        ann = document.createElement('div');
        ann.id = 'krdPinnedAnn';
        app.parentNode.insertBefore(ann, app);
      }
      const nextHtml = (ex.announcement ? `📌 <b>DUYURU:</b> ${esc(ex.announcement)}` : '') +
        (ex.announcement && ex.mvp ? ' &nbsp;|&nbsp; ' : '') +
        (ex.mvp ? `⭐ <b>Haftanın MVP Kulübü:</b> ${esc(ex.mvp)}` : '');
      if (ann.innerHTML !== nextHtml) ann.innerHTML = nextHtml;
    } else if (ann) {
      ann.remove();
    }

    if (!document.getElementById('krdNavTabs')) {
      const bar = document.createElement('div');
      bar.id = 'krdNavTabs';
      const tabs = [
        { id: 'all', label: '🏠 Tümü' },
        { id: 'table', label: '📊 Puan & İstatistik' },
        { id: 'fixtures', label: '📅 Fikstür & H2H' },
        { id: 'predict', label: '🎯 Tahmin & Kupa' },
        { id: 'rules', label: '📜 Kurallar & Bildir' }
      ];
      bar.innerHTML = tabs.map(t =>
        `<button type="button" class="krd-tab-btn ${window._krdActiveTab === t.id ? 'active' : ''}" data-tab="${t.id}" onclick="window.krdSwitchTab('${t.id}')">${t.label}</button>`
      ).join('');
      app.parentNode.insertBefore(bar, app);
    }
  }

  function buildDedicatedPanels() {
    const app = document.getElementById('app');
    if (!app || isAdm()) return;
    const tab = window._krdActiveTab || 'all';
    let host = document.getElementById('krdDedicatedView');

    if (tab === 'all' || tab === 'table') {
      if (host) host.remove();
      return;
    }

    if (!host) {
      host = document.createElement('div');
      host.id = 'krdDedicatedView';
      app.parentNode.insertBefore(host, app);
    }

    const st = getS() || {};
    const teams = st.teams || [];
    const matches = st.matches || [];
    const tMap = Object.fromEntries(teams.map(t => [t.id, t.name]));
    const ex = (window._krdData && window._krdData.extras) || {};

    if (tab === 'fixtures') {
      const opts = teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
      const opts2 = teams.map((t, i) => `<option value="${t.id}" ${i === 1 ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
      host.innerHTML = `
        <div class="krd-clean-card">
          <b style="color:#38bdf8;font-size:14px;">⚔️ Kafa Kafaya (H2H) Rekabet Analizi</b>
          <div class="krd-h2h-grid">
            <select id="krdH2H_A" onchange="window.krdUpdateH2H()">${opts}</select>
            <b style="color:#facc15;">VS</b>
            <select id="krdH2H_B" onchange="window.krdUpdateH2H()">${opts2}</select>
          </div>
          <div id="krdH2HResult"></div>
        </div>`;
      window.krdUpdateH2H();
    } else if (tab === 'predict') {
      const up = matches.filter(m => !m.played).slice(0, 8);
      const playedMap = Object.fromEntries(matches.filter(m => m.played).map(m => [String(m.id), m]));
      const nick = localStorage.getItem('krd_pred_nick') || '';
      const preds = (window._krdData && window._krdData.predictions) || {};
      const myP = preds[nick] || {};

      const board = Object.entries(preds).map(([nk, uP]) => {
        let pts = 0, exact = 0;
        for (const [mid, p] of Object.entries(uP || {})) {
          const m = playedMap[mid]; if (!m) continue;
          if (p.hs === +m.hs && p.aws === +m.aws) { pts += 3; exact++; }
          else if (Math.sign(p.hs - p.aws) === Math.sign(+m.hs - +m.aws)) pts += 1;
        }
        return { nk, pts, exact };
      }).sort((a, b) => (b.pts - a.pts) || (b.exact - a.exact));

      const { table } = calcStats();
      const cD = (window._krdData && window._krdData.cup) || {};
      let cupHtml = '<div class="mut" style="font-size:12px;">Süper Kupa eşleşmeleri için en az 4 kulüp gereklidir.</div>';
      if (table.length >= 4) {
        const [c1, c2, c3, c4] = table;
        const sf1Ok = cD.sf1_h !== '' && cD.sf1_h !== undefined && cD.sf1_a !== '' && cD.sf1_a !== undefined;
        const sf2Ok = cD.sf2_h !== '' && cD.sf2_h !== undefined && cD.sf2_a !== '' && cD.sf2_a !== undefined;
        const f1 = sf1Ok ? (Number(cD.sf1_h) >= Number(cD.sf1_a) ? c1 : c4) : { name: '1. Yarı Final Galibi' };
        const f2 = sf2Ok ? (Number(cD.sf2_h) >= Number(cD.sf2_a) ? c2 : c3) : { name: '2. Yarı Final Galibi' };
        cupHtml = `
          <div class="krd-cup-grid">
            <div class="krd-cup-box"><b style="color:#facc15;">YARI FİNAL 1 (1. vs 4.)</b><div>${esc(c1.name)} <b>${sf1Ok ? cD.sf1_h : '-'}</b></div><div>${esc(c4.name)} <b>${sf1Ok ? cD.sf1_a : '-'}</b></div></div>
            <div class="krd-cup-box"><b style="color:#facc15;">YARI FİNAL 2 (2. vs 3.)</b><div>${esc(c2.name)} <b>${sf2Ok ? cD.sf2_h : '-'}</b></div><div>${esc(c3.name)} <b>${sf2Ok ? cD.sf2_a : '-'}</b></div></div>
          </div>
          <div class="krd-cup-box" style="margin-top:6px;border-color:rgba(250,204,21,.45);"><b style="color:#4ade80;">👑 SÜPER KUPA FİNALİ</b><div>${esc(f1.name)} <b>${cD.f_h !== undefined && cD.f_h !== '' ? cD.f_h : '-'}</b> vs <b>${cD.f_a !== undefined && cD.f_a !== '' ? cD.f_a : '-'}</b> ${esc(f2.name)}</div></div>`;
      }

      host.innerHTML = `
        <div class="krd-clean-card">
          <b style="color:#c084fc;font-size:14px;">🎯 Haftalık Skor Tahmini</b>
          <input type="text" id="krdPredNick" value="${esc(nick)}" placeholder="Adınız / Lakabınız" style="padding:8px 10px;border-radius:9px;border:1px solid rgba(192,132,252,.45);background:#020617;color:#fff;font-size:12.5px;">
          ${up.length ? up.map(m => {
            const o = myP[String(m.id)];
            return `<div class="krd-pred-line"><span style="text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(tMap[m.home_id] || 'Ev')}</span><input type="number" id="phs_${m.id}" value="${o ? o.hs : ''}" placeholder="0"><span>-</span><input type="number" id="paws_${m.id}" value="${o ? o.aws : ''}" placeholder="0"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(tMap[m.away_id] || 'Dep')}</span><button type="button" onclick="window.krdSendPredict(${m.id})" style="padding:5px 9px;font-size:11.5px;">${o ? '✓' : 'Kaydet'}</button></div>`;
          }).join('') : '<div class="mut" style="font-size:12px;">Şu an tahmin yapılacak oynanmamış maç bulunmuyor.</div>'}
          ${board.length ? `<div style="border-top:1px solid rgba(148,163,184,.2);padding-top:8px;font-size:12px;"><b style="color:#facc15;">🏅 Tahmin Ligi Puan Durumu (Tam Skor +3P, Sonuç +1P):</b><div style="margin-top:5px;display:grid;gap:4px;">${board.map((b, i) => `<div>${i + 1}. <b>${esc(b.nk)}</b> — <span style="color:#4ade80;font-weight:800;">${b.pts} Puan</span> (${b.exact} Tam Skor)</div>`).join('')}</div></div>` : ''}
        </div>
        <div class="krd-clean-card">
          <b style="color:#38bdf8;font-size:14px;">🏆 İlk 4 KRD Süper Kupa Eleme Ağacı</b>
          ${cupHtml}
        </div>`;
    } else if (tab === 'rules') {
      const txt = (ex.rules && ex.rules.trim()) ? ex.rules : DEFAULT_RULES;
      host.innerHTML = `
        <div class="krd-clean-card">
          <b style="color:#fb923c;font-size:14px;">📜 Resmi Lig Kuralları & Ceza Talimatnamesi</b>
          <div style="display:grid;gap:7px;font-size:12.5px;line-height:1.5;">
            ${txt.split('\n').filter(Boolean).map(l => `<div style="padding:8px 10px;border-radius:9px;background:rgba(2,6,23,.65);border:1px solid rgba(251,146,60,.28);">${esc(l)}</div>`).join('')}
          </div>
        </div>
        <div class="krd-clean-card">
          <b style="color:#f87171;font-size:14px;">🐞 Hata / Sorun Bildir (Doğrudan Yöneticiye İlet)</b>
          <input type="text" id="krdRepSender" placeholder="Adınız / Kulübünüz" style="padding:8px 10px;border-radius:9px;border:1px solid rgba(248,113,113,.38);background:#020617;color:#fff;font-size:12.5px;">
          <textarea id="krdRepMsg" rows="3" placeholder="Karşılaştığınız hatayı veya itirazınızı yazın..." style="padding:8px 10px;border-radius:9px;border:1px solid rgba(248,113,113,.38);background:#020617;color:#fff;font-size:12.5px;"></textarea>
          <button type="button" class="pri" onclick="window.krdSendReport()" style="background:#ef4444;color:#fff;font-weight:800;">📩 Yöneticiye Gönder</button>
        </div>`;
    }
  }

  function enhanceTableAndFixtures() {
    const app = document.getElementById('app');
    const st = getS();
    if (!app || !st || !Array.isArray(st.teams) || !st.teams.length || isAdm()) return;

    const ex = (window._krdData && window._krdData.extras) || {};
    let maint = document.getElementById('krdMaintScreen');
    if (ex.maintenance) {
      if (!maint) {
        maint = document.createElement('div'); maint.id = 'krdMaintScreen';
        document.body.appendChild(maint);
      }
      maint.innerHTML = `<div style="font-size:44px;margin-bottom:10px;">🛠️</div><h2 style="margin:0 0 8px;color:#facc15;">KRD LİGİ BAKIMDA</h2><p style="max-width:380px;opacity:.85;font-size:14px;">${esc(ex.maintNote || 'Fikstür ve puan durumu güncelleniyor. Kısa süre sonra tekrar açılacaktır.')}</p>`;
      return;
    } else if (maint) maint.remove();

    const cw = document.getElementById('krdChatWidget');
    if (cw) cw.style.display = ex.chatLocked ? 'none' : '';

    const { table, streaks } = calcStats();
    const top3 = new Set(table.slice(0, 3).map(x => x.id));
    const tMap = Object.fromEntries(st.teams.map(t => [t.id, t.name]));
    const played = (st.matches || []).filter(m => m.played).sort((a, b) => (+a.week - +b.week) || (+a.id - +b.id));

    const tbl = app.querySelector('table:not(#krdSplitTableWrap table)');
    if (tbl) {
      tbl.querySelectorAll('tbody tr').forEach(tr => {
        const cell = tr.children[1] || tr.children[0];
        if (!cell || cell.dataset.krdDone) return;
        const tm = st.teams.find(t => (tr.textContent || '').toLowerCase().includes((t.name || '').toLowerCase()));
        if (!tm) return;
        cell.dataset.krdDone = '1';

        const b = ((window._krdData && window._krdData.badges) || {})[String(tm.id)] || {};
        const code = b.code || tm.name.replace(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]/g, '').slice(0, 3).toUpperCase();
        cell.insertAdjacentHTML('afterbegin', `<span class="krd-crest" style="background:${esc(b.color || '#1e293b')};">${esc(code)}</span>`);

        const sI = streaks[tm.id];
        if (sI && sI.delta > 0) cell.insertAdjacentHTML('beforeend', `<span class="krd-delta-up">▲${sI.delta}</span>`);
        else if (sI && sI.delta < 0) cell.insertAdjacentHTML('beforeend', `<span class="krd-delta-dn">▼${Math.abs(sI.delta)}</span>`);
        if (sI && sI.badge) cell.insertAdjacentHTML('beforeend', `<span class="krd-streak">${sI.badge}</span>`);

        const last5 = played.filter(m => m.home_id === tm.id || m.away_id === tm.id).slice(-5);
        if (last5.length) {
          const dots = last5.map(m => {
            const gf = m.home_id === tm.id ? +m.hs : +m.aws;
            const ga = m.home_id === tm.id ? +m.aws : +m.hs;
            const res = gf > ga ? 'G' : gf < ga ? 'M' : 'B';
            return `<span class="krd-dot krd-dot-${res}" title="Hafta ${m.week}: ${m.hs}-${m.aws}">${res}</span>`;
          }).join('');
          cell.insertAdjacentHTML('beforeend', `<span class="krd-form-dots">${dots}</span>`);
        }
      });
    }

    if (played.length && table.length && !document.getElementById('krdPodium')) {
      const pod = document.createElement('div'); pod.id = 'krdPodium';
      const atk = [...table].sort((a, b) => b.ag - a.ag)[0];
      const def = [...table].filter(x => x.o > 0).sort((a, b) => (a.yg / a.o) - (b.yg / b.o))[0] || table[0];
      const hm = [...played].sort((a, b) => ((+b.hs + +b.aws) - (+a.hs + +a.aws)))[0];
      pod.innerHTML = `
        <div class="krd-pod-item"><span style="font-size:10px;font-weight:800;color:#facc15;">⚽ ALTIN AYAKKABI</span><b>${esc(atk.name)}</b><span style="font-size:11px;opacity:.8;">${atk.ag} Gol</span></div>
        <div class="krd-pod-item"><span style="font-size:10px;font-weight:800;color:#38bdf8;">🧤 ALTIN ELDİVEN</span><b>${esc(def.name)}</b><span style="font-size:11px;opacity:.8;">${def.yg} Yenen Gol</span></div>
        <div class="krd-pod-item"><span style="font-size:10px;font-weight:800;color:#fb7185;">⚡ EN GOLLÜ MAÇ</span><b>${esc(tMap[hm.home_id] || 'Ev')} ${hm.hs}-${hm.aws} ${esc(tMap[hm.away_id] || 'Dep')}</b><span style="font-size:11px;opacity:.8;">Hafta ${hm.week}</span></div>`;
      const anc = document.getElementById('krdLeagueHubDrawer') || tbl;
      if (anc && anc.parentNode) anc.parentNode.insertBefore(pod, anc.nextSibling);
    }

    const hubBody = document.querySelector('#krdLeagueHubDrawer .krd-hub-body');
    if (hubBody && !document.getElementById('krdPngTableBtn')) {
      const b = document.createElement('button'); b.id = 'krdPngTableBtn'; b.type = 'button'; b.className = 'pri';
      b.style.cssText = 'width:100%;font-size:12px;font-weight:800;';
      b.textContent = '📸 Puan Tablosu Afişi İndir (PNG)';
      b.onclick = window.krdStandingsPng;
      hubBody.appendChild(b);
    }

    const grid = app.querySelector('.grid');
    if (grid) {
      Array.from(grid.children).forEach(card => {
        const txt = card.textContent || '';
        const m = (st.matches || []).find(x => {
          const h = tMap[x.home_id] || '', a = tMap[x.away_id] || '';
          return h && a && txt.includes(h) && txt.includes(a);
        });
        if (!m) return;
        if (!m.played && top3.has(m.home_id) && top3.has(m.away_id) && !card.dataset.krdD) {
          card.dataset.krdD = '1'; card.classList.add('krd-derby');
          card.insertAdjacentHTML('afterbegin', '<span class="krd-derby-badge">🔥 HAFTANIN DERBİSİ</span>');
        }
        if (m.played && !card.querySelector('.krd-png-btn')) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'krd-png-btn';
          b.textContent = '📸 Maç Sonucu Afişi (PNG)';
          b.onclick = e => { e.stopPropagation(); window.krdMatchPng(m.id); };
          card.appendChild(b);
        }
      });
    }
  }

  function filterAppChildren() {
    const app = document.getElementById('app');
    if (!app || isAdm()) return;
    const tab = window._krdActiveTab || 'all';

    Array.from(app.children).forEach(el => {
      if (tab === 'predict' || tab === 'rules') {
        el.classList.add('krd-tab-hidden');
        return;
      }
      if (tab === 'all') {
        el.classList.remove('krd-tab-hidden');
        return;
      }

      const id = el.id || '';
      const txt = (el.textContent || '').toLowerCase();
      const hasTable = Boolean(el.querySelector('table')) || el.tagName === 'TABLE';
      const hasGrid = el.classList.contains('grid') || Boolean(el.querySelector('.grid'));

      let group = 'table';
      if (
        hasGrid ||
        id === 'krdRemainingMatchesBox' ||
        id === 'krdUnifiedSearchBar' ||
        (txt.includes('hafta') && !hasTable && id !== 'krdPodium' && id !== 'krdLeagueHubDrawer')
      ) {
        group = 'fixtures';
      } else if (
        hasTable ||
        id === 'krdPodium' ||
        id === 'krdTitleRaceBar' ||
        id === 'krdLeagueHubDrawer' ||
        id === 'krdSplitTableWrap'
      ) {
        group = 'table';
      }

      el.classList.toggle('krd-tab-hidden', group !== tab);
    });
  }

  window.krdSwitchTab = function (tab) {
    window._krdActiveTab = tab;
    document.querySelectorAll('.krd-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    syncView(true);
  };

  window.krdSaveAdminMaster = async function () {
    const st = getS() || {};
    const badges = {};
    (st.teams || []).forEach(t => {
      badges[String(t.id)] = {
        code: (document.getElementById('bc_' + t.id)?.value || '').trim().toUpperCase(),
        color: document.getElementById('bcol_' + t.id)?.value || '#2563eb'
      };
    });
    const cup = {
      sf1_h: document.getElementById('cup_sf1_h')?.value ?? '',
      sf1_a: document.getElementById('cup_sf1_a')?.value ?? '',
      sf2_h: document.getElementById('cup_sf2_h')?.value ?? '',
      sf2_a: document.getElementById('cup_sf2_a')?.value ?? '',
      f_h: document.getElementById('cup_f_h')?.value ?? '',
      f_a: document.getElementById('cup_f_a')?.value ?? ''
    };
    const ex = {
      announcement: document.getElementById('admAnn')?.value.trim() || '',
      mvp: document.getElementById('admMvp')?.value.trim() || '',
      maintenance: !!document.getElementById('admMaint')?.checked,
      maintNote: document.getElementById('admMaintNote')?.value.trim() || '',
      chatLocked: !!document.getElementById('admChatLock')?.checked,
      rules: document.getElementById('admRules')?.value.trim() || DEFAULT_RULES
    };
    await api('POST', '/api/krd-extras', ex);
    await api('POST', '/api/admin/krd-pro5-save', { badges, cup });
    await pullAll();
    if (typeof toast === 'function') toast('✅ Duyuru, Bakım Modu, Kurallar ve Armalar kaydedildi!');
  };

  
  window._krdAdmSubTab = window._krdAdmSubTab || 'main';

  window.krdOpenAdmMasterTab = function (openMaster) {
    window._krdAdmSubTab = openMaster ? 'master' : 'main';
    renderAdminPanel();
  };

  async function renderAdminPanel() {
    const app = document.getElementById('app');
    if (!app) return;

    if (!isAdm()) {
      document.querySelectorAll('#krdMasterAdmBox, #krdAdmSwitchBar').forEach(el => el.remove());
      return;
    }

    const hasLogout = Array.from(app.querySelectorAll('button')).some(b => (b.textContent || '').trim() === 'Çıkış');
    if (!hasLogout) {
      document.querySelectorAll('#krdMasterAdmBox, #krdAdmSwitchBar').forEach(el => el.remove());
      return;
    }

    // Yonetici ust gecis cubugu: [Lig Yonetimi] vs [Duyuru, Bakim & Kurallar]
    let bar = document.getElementById('krdAdmSwitchBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'krdAdmSwitchBar';
      bar.style.cssText = 'box-sizing:border-box;width:100%;max-width:960px;margin:10px auto 12px;display:flex;gap:8px;padding:7px;border-radius:12px;background:#0b1120;border:1px solid rgba(250,204,21,0.4);';
      app.prepend(bar);
    }
    const isMaster = window._krdAdmSubTab === 'master';
    bar.innerHTML = `
      <button type="button" onclick="window.krdOpenAdmMasterTab(false)" style="flex:1;padding:8px 12px;border-radius:9px;font-size:12px;font-weight:800;cursor:pointer;border:1px solid ${!isMaster ? '#38bdf8' : 'rgba(148,163,184,0.25)'};background:${!isMaster ? 'linear-gradient(135deg,#0284c7,#2563eb)' : '#131c31'};color:#fff;">📋 Lig & Maç Yönetimi</button>
      <button type="button" onclick="window.krdOpenAdmMasterTab(true)" style="flex:1;padding:8px 12px;border-radius:9px;font-size:12px;font-weight:800;cursor:pointer;border:1px solid ${isMaster ? '#facc15' : 'rgba(148,163,184,0.25)'};background:${isMaster ? 'linear-gradient(135deg,#d97706,#eab308)' : '#131c31'};color:${isMaster ? '#090d16' : '#fef08a'};">⚙️ Duyuru, Bakım & Kurallar</button>
    `;

    // Diger yonetici ogelerini sekme secimine gore gizle/goster
    Array.from(app.children).forEach(el => {
      if (el.id === 'krdAdmSwitchBar' || el.id === 'krdMasterAdmBox') return;
      el.style.display = isMaster ? 'none' : '';
    });

    let box = document.getElementById('krdMasterAdmBox');
    if (!isMaster) {
      if (box) box.style.display = 'none';
      return;
    }

    if (box) {
      box.style.display = 'grid';
      return;
    }

    const st = getS() || {};
    const ex = (window._krdData && window._krdData.extras) || {};
    const bMap = (window._krdData && window._krdData.badges) || {};
    const c = (window._krdData && window._krdData.cup) || {};

    box = document.createElement('div');
    box.id = 'krdMasterAdmBox';
    box.innerHTML = `
      <b style="color:#facc15;font-size:14px;">⚙️ Duyuru Sabitleme, Bakım Modu, Kurallar & Gelen Sorunlar</b>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;font-size:12px;">
        <input type="text" id="admAnn" value="${esc(ex.announcement || '')}" placeholder="📌 Üste Sabitlenecek Duyuru" style="padding:7px;border-radius:8px;border:1px solid #334155;background:#020617;color:#fff;">
        <input type="text" id="admMvp" value="${esc(ex.mvp || '')}" placeholder="⭐ Haftanın MVP Kulübü" style="padding:7px;border-radius:8px;border:1px solid #334155;background:#020617;color:#fff;">
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:12px;background:rgba(2,6,23,.6);padding:8px 10px;border-radius:8px;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;color:#f87171;font-weight:800;"><input type="checkbox" id="admMaint" ${ex.maintenance ? 'checked' : ''}><span>🛠️ Ligi Bakıma Al (Ziyaretçilere Kapat)</span></label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" id="admChatLock" ${ex.chatLocked ? 'checked' : ''}><span>🔒 Canlı Sohbeti Kilitle</span></label>
      </div>
      <input type="text" id="admMaintNote" value="${esc(ex.maintNote || '')}" placeholder="Bakım Modu Açıklaması (isteğe bağlı)" style="padding:7px;border-radius:8px;border:1px solid #334155;background:#020617;color:#fff;font-size:12px;">
      <label style="font-size:12px;font-weight:700;color:#fb923c;">📜 Resmi Lig Kuralları & Cezalar (22 Kasım 2026 Sonrası):</label>
      <textarea id="admRules" rows="4" style="padding:8px;border-radius:8px;border:1px solid #334155;background:#020617;color:#fff;font-size:12px;">${esc((ex.rules && ex.rules.trim()) ? ex.rules : DEFAULT_RULES)}</textarea>
      <b style="color:#38bdf8;font-size:12px;">🛡️ Kulüp Arma Kodları & Renkleri:</b>
      <div style="display:grid;gap:5px;font-size:12px;">
        ${(st.teams || []).map(t => {
          const o = bMap[String(t.id)] || {};
          return `<div style="display:grid;grid-template-columns:1fr 70px 44px;gap:6px;align-items:center;"><span>${esc(t.name)}</span><input type="text" maxlength="4" id="bc_${t.id}" value="${esc(o.code || '')}" placeholder="Kod" style="padding:4px;border-radius:6px;border:1px solid #334155;background:#020617;color:#fff;text-align:center;"><input type="color" id="bcol_${t.id}" value="${esc(o.color || '#2563eb')}" style="width:100%;height:28px;border:none;background:none;"></div>`;
        }).join('')}
      </div>
      <b style="color:#4ade80;font-size:12px;">🏆 Süper Kupa Play-Off Skorları:</b>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;font-size:12px;background:rgba(2,6,23,.55);padding:8px 10px;border-radius:9px;">
        <div>YF1: <input type="number" id="cup_sf1_h" value="${esc(c.sf1_h ?? '')}" style="width:42px;background:#020617;color:#fff;border:1px solid #334155;border-radius:6px;text-align:center;">-<input type="number" id="cup_sf1_a" value="${esc(c.sf1_a ?? '')}" style="width:42px;background:#020617;color:#fff;border:1px solid #334155;border-radius:6px;text-align:center;"></div>
        <div>YF2: <input type="number" id="cup_sf2_h" value="${esc(c.sf2_h ?? '')}" style="width:42px;background:#020617;color:#fff;border:1px solid #334155;border-radius:6px;text-align:center;">-<input type="number" id="cup_sf2_a" value="${esc(c.sf2_a ?? '')}" style="width:42px;background:#020617;color:#fff;border:1px solid #334155;border-radius:6px;text-align:center;"></div>
        <div>FİNAL: <input type="number" id="cup_f_h" value="${esc(c.f_h ?? '')}" style="width:42px;background:#020617;color:#fff;border:1px solid #334155;border-radius:6px;text-align:center;">-<input type="number" id="cup_f_a" value="${esc(c.f_a ?? '')}" style="width:42px;background:#020617;color:#fff;border:1px solid #334155;border-radius:6px;text-align:center;"></div>
      </div>
      <button type="button" class="pri" onclick="window.krdSaveAdminMaster()">💾 Tüm Ayarları Kaydet</button>
      <div id="krdInboxReports" style="border-top:1px solid rgba(148,163,184,.2);padding-top:8px;font-size:12px;">📩 Gelen sorun bildirimleri yükleniyor...</div>
    `;
    app.appendChild(box);

    try {
      const repRes = await api('GET', '/api/admin/krd-reports');
      const inbox = document.getElementById('krdInboxReports');
      if (inbox && repRes && Array.isArray(repRes.reports)) {
        inbox.innerHTML = repRes.reports.length
          ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><b style="color:#f87171;">📩 Gelen Sorun Bildirimleri (${repRes.reports.length}):</b><button type="button" onclick="api('POST','/api/admin/krd-reports-clear').then(()=>toast('Bildirimler temizlendi'))" style="font-size:11px;padding:3px 8px;">Temizle</button></div>` +
            repRes.reports.map(r => `<div style="padding:6px 8px;margin-bottom:5px;border-radius:8px;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);"><span style="color:#38bdf8;">[${esc(r.ts)}]</span> <b>${esc(r.sender)}:</b> ${esc(r.msg)}</div>`).join('')
          : '📩 Henüz gelen sorun bildirimi yok.';
      }
    } catch {}
  }

  function syncView(rebuildDedicated) {
    if (_isApplying) return;
    _isApplying = true;
    try {
      injectStyles();
      ensurePersistentChrome(); updateLastSyncBadge();
      if (isAdm()) {
        renderAdminPanel();
      } else {
        document.querySelectorAll('#krdMasterAdmBox, .krd-adm-box').forEach(el => el.remove());
        enhanceTableAndFixtures();
        filterAppChildren();
        if (rebuildDedicated) buildDedicatedPanels();
      }
    } finally {
      _isApplying = false;
    }
  }

  function attachAppObserver() {
    const app = document.getElementById('app');
    if (!app || app.dataset.krdObs) return;
    app.dataset.krdObs = '1';
    let timer = null;
    const obs = new MutationObserver(() => {
      if (_isApplying) return;
      clearTimeout(timer);
      timer = setTimeout(() => syncView(false), 160);
    });
    obs.observe(app, { childList: true });
  }

  pullAll().then(() => {
    attachAppObserver();
    syncView(true);
  });
  setInterval(() => { if (!document.hidden) pullAll(); }, 25000);
  window.addEventListener('hashchange', () => setTimeout(() => { attachAppObserver(); syncView(true); }, 80));
  setTimeout(() => { attachAppObserver(); syncView(true); }, 450);
})();


// --- ANLIK BAKIM MODU SENKRONIZASYONU (YENILEME GEREKTIRMEZ) ---
(function(){
  if (window.__krdLiveMaintTimer) clearInterval(window.__krdLiveMaintTimer);
  let lastMaintState = null;
  let lastMaintNote = null;

  function applyMaintFromData(data) {
    const ex = (data && data.settings && data.settings.extra) ? data.settings.extra
      : (typeof S !== 'undefined' && S && S.settings && S.settings.extra) ? S.settings.extra : null;
    if (!ex) return;

    const isMaint = !!ex.maintenance;
    const noteText = String(ex.maintNote || '');
    if (lastMaintState === isMaint && lastMaintNote === noteText) return;
    lastMaintState = isMaint;
    lastMaintNote = noteText;

    if (typeof S !== 'undefined' && S && S.settings) {
      S.settings.extra = { ...(S.settings.extra || {}), maintenance: isMaint, maintNote: noteText };
    }

    let maint = document.getElementById('krdMaintScreen');
    if (isMaint) {
      if (!maint) {
        maint = document.createElement('div');
        maint.id = 'krdMaintScreen';
        document.body.appendChild(maint);
      }
      const safeNote = (typeof esc === 'function')
        ? esc(noteText)
        : noteText.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      maint.innerHTML = '<div style="font-size:44px;margin-bottom:10px;">🛠️</div><h2 style="margin:0 0 8px;color:#facc15;">KRD LİGİ BAKIMDA</h2>' + (safeNote ? '<p style="max-width:440px;opacity:.9;line-height:1.5;">' + safeNote + '</p>' : '<p style="opacity:.8;">Kısa bir güncelleme yapılıyor, az sonra tekrar dene.</p>');
      if (typeof render === 'function') {
        try { render(); } catch {}
      }
    } else if (maint) {
      maint.remove();
      if (typeof render === 'function') {
        try { render(); } catch {}
      }
    }
  }

  async function pollMaintenanceStatus() {
    try {
      const res = await fetch('/api/league?_t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      applyMaintFromData(json);
    } catch {}
  }

  window.__krdLiveMaintTimer = setInterval(pollMaintenanceStatus, 3000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pollMaintenanceStatus();
  });
  setTimeout(pollMaintenanceStatus, 800);
})();


// --- KRD LIGI MOBIL PERFORMANS & LIG YARDIMCILARI ---
(function krdPerfGuard() {
  if (typeof window === 'undefined') return;
  window.KRD_PERF = {
    isMobile: () => window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
    debounce(fn, wait = 150) {
      let t;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    }
  };

  // Kalan maclar ve hukmen (3-0) hesaplama yardimcisi
  window.krdComputeRemainingAndWalkover = function (matches, teams, excludedPlayers = ['Mert', 'Omer', 'Ömer']) {
    const excl = new Set(excludedPlayers.map(x => String(x).toLowerCase()));
    const list = Array.isArray(matches) ? matches : [];
    const remainingByPlayer = {};
    (teams || []).forEach(t => {
      const name = typeof t === 'string' ? t : (t.name || t.team || '');
      if (name && !excl.has(name.toLowerCase())) remainingByPlayer[name] = [];
    });

    const normalized = list.map(m => {
      const home = m.home || m.ev || '';
      const away = m.away || m.dep || '';
      const homeExcluded = excl.has(String(home).toLowerCase());
      const awayExcluded = excl.has(String(away).toLowerCase());
      let hGoals = m.homeGoals ?? m.evGol ?? null;
      let aGoals = m.awayGoals ?? m.depGol ?? null;
      let status = m.status || 'scheduled';

      if ((homeExcluded || awayExcluded) && (hGoals === null || aGoals === null)) {
        hGoals = homeExcluded ? 0 : 3;
        aGoals = awayExcluded ? 0 : 3;
        status = 'walkover';
      }

      const isPlayed = status === 'played' || status === 'walkover' || (hGoals !== null && aGoals !== null);
      if (!isPlayed) {
        if (remainingByPlayer[home]) remainingByPlayer[home].push(m);
        if (remainingByPlayer[away]) remainingByPlayer[away].push(m);
      }
      return Object.assign({}, m, { home, away, homeGoals: hGoals, awayGoals: aGoals, status, isPlayed });
    });

    return { matches: normalized, remainingByPlayer };
  };
})();


// --- KRD PES LIGI SEZON 2027: HUKMEN 3-0 & HERKESIN KALAN MACI ---
(function krdSeason2027Engine() {
  if (typeof window === 'undefined') return;
  const REMOVED_PLAYERS = new Set(['mert', 'omer', 'ömer']);

  function normName(v) {
    return String(v || '').trim();
  }

  function isRemoved(name) {
    return REMOVED_PLAYERS.has(normName(name).toLowerCase());
  }

  window.KRD_SEASON_2027 = {
    applyWalkovers(matches) {
      return (Array.isArray(matches) ? matches : []).map(m => {
        const home = normName(m.home || m.ev || m.teamA || m.p1);
        const away = normName(m.away || m.dep || m.teamB || m.p2);
        const hRem = isRemoved(home);
        const aRem = isRemoved(away);

        if (hRem || aRem) {
          const homeGoals = hRem ? 0 : 3;
          const awayGoals = aRem ? 0 : 3;
          return Object.assign({}, m, {
            home,
            away,
            homeGoals,
            awayGoals,
            evGol: homeGoals,
            depGol: awayGoals,
            played: true,
            status: 'walkover',
            walkover: true,
            note: m.note || 'Hukmen (3-0)'
          });
        }

        const hasScore = m.homeGoals !== undefined && m.homeGoals !== null && m.homeGoals !== '' &&
                         m.awayGoals !== undefined && m.awayGoals !== null && m.awayGoals !== '';
        return Object.assign({}, m, {
          home,
          away,
          played: Boolean(m.played || hasScore || m.status === 'played' || m.status === 'walkover')
        });
      });
    },

    getRemainingByPlayer(matches, players) {
      const processed = this.applyWalkovers(matches);
      const map = {};
      (players || []).forEach(p => {
        const name = normName(typeof p === 'string' ? p : (p.name || p.player || p.team));
        if (name && !isRemoved(name)) map[name] = [];
      });

      processed.forEach(m => {
        if (m.played) return;
        if (map[m.home]) map[m.home].push(m);
        if (map[m.away]) map[m.away].push(m);
      });

      return map;
    }
  };

  // Sayfa yuklendiginde mevcut lig verisi varsa hesaplayip window'a bagla
  window.addEventListener('DOMContentLoaded', () => {
    try {
      if (window.__KRD_DATA__ && Array.isArray(window.__KRD_DATA__.matches)) {
        window.__KRD_DATA__.matches = window.KRD_SEASON_2027.applyWalkovers(window.__KRD_DATA__.matches);
        window.__KRD_DATA__.remainingByPlayer = window.KRD_SEASON_2027.getRemainingByPlayer(
          window.__KRD_DATA__.matches,
          window.__KRD_DATA__.players || window.__KRD_DATA__.teams || []
        );
      }
    } catch (_) {}
  });
})();






// --- KRD PES LIGI SEZON 2027: TEMIZ HUKMEN (3-0) & BUTON YERLESIMI ---
(function krdCleanSeason2027Fix() {
  if (typeof window === 'undefined') return;
  const EXCLUDED = ['mert', 'omer', 'ömer'];

  function isExcl(txt) {
    const s = String(txt || '').toLowerCase();
    return EXCLUDED.some(name => s.includes(name));
  }

  function applyWalkoverOnlyToMatches() {
    // Puan tablosu (table tr / standings) haric sadece mac/fikstur kartlarina uygula
    const candidates = document.querySelectorAll('.match-row, .fixture-item, .match-card, .fixture-card, [class*="match"], [class*="fixture"]');
    candidates.forEach(el => {
      if (el.closest('table, .standings, .points-table, #krdSeason2027Box')) return;
      if (el.dataset.krdWoClean === '1') return;
      const text = (el.textContent || '').trim();
      if (!text || !isExcl(text)) return;

      el.dataset.krdWoClean = '1';
      el.style.borderLeft = '3px solid #22c55e';

      if (!el.querySelector('.krd-wo-badge')) {
        const badge = document.createElement('span');
        badge.className = 'krd-wo-badge';
        badge.textContent = 'Hükmen 3-0';
        badge.style.cssText = 'display:inline-block;margin-left:6px;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(34,197,94,0.18);color:#86efac;white-space:nowrap;';
        el.appendChild(badge);
      }
    });

    // Puan tablosuna yanlislikla eklenmis eski .krd-wo-badge varsa temizle
    document.querySelectorAll('table .krd-wo-badge, .standings .krd-wo-badge').forEach(b => b.remove());
  }

  function fixFloatingButtons() {
    // Sag alttaki yukari cik butonu ile Sohbet butonunun ust uste binmesini engelle
    const chatFab = document.getElementById('krdChatFab');
    if (chatFab) {
      chatFab.style.position = 'fixed';
      chatFab.style.right = '14px';
      chatFab.style.bottom = '14px';
      chatFab.style.zIndex = '998';
    }
    const allBtns = Array.from(document.querySelectorAll('button, a'));
    allBtns.forEach(btn => {
      if (btn.id === 'krdChatFab') return;
      const txt = (btn.textContent || '').trim();
      const st = window.getComputedStyle(btn);
      if ((txt === '↑' || txt === '▲' || /top|up|scroll/i.test(btn.id || '') || /top|up|scroll/i.test(btn.className || '')) && st.position === 'fixed') {
        btn.style.right = '14px';
        btn.style.bottom = '72px';
        btn.style.zIndex = '999';
      }
    });
  }

  function runClean() {
    applyWalkoverOnlyToMatches();
    fixFloatingButtons();
  }

  window.addEventListener('load', () => {
    runClean();
    setTimeout(runClean, 500);
    setTimeout(runClean, 1500);
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('button, [role="tab"], .tab, .nav-item, a')) {
      setTimeout(runClean, 120);
    }
  });
})();










// --- KRD OPTIMIZED: TEKIL API SENKRONIZASYONU, CANLI AKIS & BILDIRIMLER ---
(function krdOptimizedRealtime() {
  if (typeof window === 'undefined' || !window.fetch) return;
  const origFetch = window.fetch.bind(window);
  const EXCLUDED = new Set(['mert', 'omer', 'ömer']);
  const inflight = new Map();

  function isExcl(name) {
    return EXCLUDED.has(String(name || '').trim().toLowerCase());
  }

  // Ayni anda cift giden GET /api/ isteklerini tekillestir
  window.fetch = function(input, init) {
    const method = (init && init.method ? init.method : 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    if (method !== 'GET' || !url.includes('/api/')) {
      return origFetch(input, init);
    }
    const baseKey = url.split('?')[0];
    if (inflight.has(baseKey)) {
      return inflight.get(baseKey).then(r => r.clone());
    }
    const headers = new Headers((init && init.headers) || {});
    headers.set('Cache-Control', 'no-cache');
    const p = origFetch(input, Object.assign({}, init, { cache: 'no-store', headers }))
      .finally(() => inflight.delete(baseKey));
    inflight.set(baseKey, p);
    return p.then(r => r.clone());
  };

  function fixButtonsAndContrast() {
    const pushBtn = document.getElementById('krdPushBtn');
    if (pushBtn && !pushBtn.dataset.krdPermBound) {
      pushBtn.dataset.krdPermBound = '1';
      pushBtn.addEventListener('click', () => {
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {});
        }
      });
    }

    document.querySelectorAll('button, a').forEach(btn => {
      if (btn.id === 'krdChatFab' || btn.id === 'krdPushBtn') return;
      const txt = (btn.textContent || '').trim();
      if (txt === '↑' || txt === '▲' || /scroll|top|up/i.test(btn.id || '') || /scroll|top|up/i.test(btn.className || '')) {
        btn.style.setProperty('bottom', '74px', 'important');
        btn.style.setProperty('right', '14px', 'important');
        btn.style.setProperty('z-index', '1050', 'important');
      }
    });
  }

  function showInstantNotification(title, body) {
    const cleanBody = String(body || '').trim();
    if (!cleanBody) return;
    let toast = document.getElementById('krdInstantToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'krdInstantToast';
      toast.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:9999;max-width:92vw;width:360px;padding:12px 14px;border-radius:12px;background:#111827;color:#f9fafb;border:1px solid #22c55e;box-shadow:0 10px 25px rgba(0,0,0,0.45);font-size:13px;line-height:1.4;transition:opacity 0.25s;';
      document.body.appendChild(toast);
    }
    toast.innerHTML = '<div style="font-weight:700;color:#86efac;margin-bottom:2px;">🔔 ' + title + '</div><div>' + cleanBody + '</div>';
    toast.style.opacity = '1';
    toast.style.display = 'block';
    clearTimeout(window.__krdToastTimer);
    window.__krdToastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => { toast.style.display = 'none'; }, 260);
    }, 5000);

    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body: cleanBody, tag: 'krd-ligi-live' }); } catch (_) {}
    }
  }

  function renderLiveMatchTicker(data) {
    const matches = Array.isArray(data && data.matches) ? data.matches : (Array.isArray(data && data.fixtures) ? data.fixtures : []);
    const teams = Array.isArray(data && data.teams) ? data.teams : (Array.isArray(data && data.players) ? data.players : []);

    const lookup = new Map();
    teams.forEach((t, idx) => {
      const name = String(typeof t === 'string' ? t : (t.name || t.player || t.username || t.team || '')).trim();
      if (!name) return;
      [name, name.toLowerCase(), t.id, String(t.id ?? ''), t.code, t.short, String(idx)]
        .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
        .forEach(k => lookup.set(String(k).trim().toLowerCase(), name));
    });

    function resolveName(raw) {
      if (raw && typeof raw === 'object') raw = raw.name || raw.player || raw.id || '';
      const k = String(raw ?? '').trim();
      return lookup.get(k.toLowerCase()) || k;
    }

    const items = [];
    matches.slice(-14).reverse().forEach(m => {
      const h = resolveName(m.home ?? m.homeId ?? m.ev ?? m.teamA ?? m.team1 ?? m.t1);
      const a = resolveName(m.away ?? m.awayId ?? m.dep ?? m.teamB ?? m.team2 ?? m.t2);
      if (!h || !a) return;

      if (isExcl(h) || isExcl(a)) {
        const score = isExcl(h) ? '0 - 3' : '3 - 0';
        items.push('<span class="krd-tick-item krd-tick-wo"><span class="krd-badge-wo">HÜKMEN</span> ' + h + ' <b>' + score + '</b> ' + a + '</span>');
        return;
      }

      const hg = m.homeGoals ?? m.homeScore ?? m.evGol ?? m.score1;
      const ag = m.awayGoals ?? m.awayScore ?? m.depGol ?? m.score2;
      const hasScore = hg !== undefined && hg !== null && String(hg).trim() !== '' &&
                       ag !== undefined && ag !== null && String(ag).trim() !== '';

      if (hasScore) {
        items.push('<span class="krd-tick-item krd-tick-done"><span class="krd-badge-done">MS</span> ' + h + ' <b>' + hg + ' - ' + ag + '</b> ' + a + '</span>');
      } else {
        items.push('<span class="krd-tick-item krd-tick-live"><span class="krd-dot-live"></span><span class="krd-badge-live">SIRADAKİ</span> ' + h + ' <b>vs</b> ' + a + '</span>');
      }
    });

    if (items.length === 0) {
      var _ct = (window.__krdLiveTickerVal || '').trim();
    if (_ct) {
      items.unshift('<span class="krd-tick-item krd-tick-live"><span class="krd-dot-live"></span> 📢 ' + _ct.replace(/[<>&]/g, '') + '</span>');
    }
    items.push('<span class="krd-tick-item krd-tick-live"><span class="krd-dot-live"></span> KRD PES LİGİ SEZON 2027 CANLI YAYIN AKIŞI AKTİF</span>');
    }

    const hero = Array.from(document.querySelectorAll('section, div')).find(el =>
      (el.textContent || '').includes('KRD PES LİGİ') && (el.textContent || '').includes('Sezon 2027')
    );
    const host = hero ? hero.parentElement : (document.getElementById('main-content') || document.body);
    if (!host) return;

    let bar = document.getElementById('krdLiveTickerBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'krdLiveTickerBar';
      if (hero && hero.nextSibling) host.insertBefore(bar, hero.nextSibling);
      else host.prepend(bar);
    }

    const trackHtml = items.join('<span class="krd-tick-sep">✦</span>');
    bar.innerHTML =
      '<div class="krd-ticker-label"><span class="krd-pulse-dot"></span>CANLI AKIŞ</div>' +
      '<div class="krd-ticker-viewport">' +
        '<div class="krd-ticker-track">' + trackHtml + '<span class="krd-tick-sep">✦</span>' + trackHtml + '</div>' +
      '</div>';
  }

  let lastAnnouncement = '';
  let lastMatchesSig = '';
  let initialized = false;

  async function pollOnce() {
    if (document.hidden) return;
    try {
      const res = await window.fetch('/api/league', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();

      renderLiveMatchTicker(data);

      const ann = String(data.announcement || data.duyuru || data.banner || (data.news && data.news[0] && (data.news[0].title || data.news[0])) || '').trim();
      const matches = Array.isArray(data.matches) ? data.matches : [];
      const matchesSig = matches.map(m => (m.id || '') + ':' + (m.homeGoals ?? m.evGol ?? '') + '-' + (m.awayGoals ?? m.depGol ?? '') + ':' + (m.played || m.status || '')).join('|');

      if (!initialized) {
        lastAnnouncement = ann;
        lastMatchesSig = matchesSig;
        initialized = true;
        return;
      }

      if (ann && ann !== lastAnnouncement) {
        lastAnnouncement = ann;
        showInstantNotification('Yeni Duyuru', ann);
      }

      if (matchesSig && matchesSig !== lastMatchesSig) {
        lastMatchesSig = matchesSig;
        showInstantNotification('Maç Güncellendi', 'Lig verileri, puan durumu ve fikstür güncellendi.');
        if (typeof window.loadLeague === 'function') window.loadLeague(true);
        else if (typeof window.fetchLeague === 'function') window.fetchLeague(true);
      }
    } catch (_) {}
  }

  window.addEventListener('load', () => {
    fixButtonsAndContrast();
    // Ilk acilista sayfanin kendi /api/league istegiyle birlessin diye 1.2sn sonra baslat, sonra 7sn aralikla kontrol et
    setTimeout(pollOnce, 1200);
    setInterval(pollOnce, 7000);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pollOnce();
  });
})();










;(function(){
  window.__krdLiveTickerVal = '';

  function forceRedrawTicker() {
    if (typeof renderLiveMatchTicker === 'function') {
      try { renderLiveMatchTicker(window.__lastLeagueData || window.DATA || {}); } catch(e) {}
    }
    // Eger renderLiveMatchTicker henuz veri bekleme asamasindaysa DOM'daki mevcut seride de aninda bas
    var txt = (window.__krdLiveTickerVal || '').trim();
    var tracks = document.querySelectorAll('#krdLiveTickerBar .krd-ticker-track');
    tracks.forEach(function(tr){
      if (!txt) return;
      if (tr.innerHTML.indexOf(txt.replace(/[<>&]/g, '')) === -1) {
        var span = '<span class="krd-tick-item krd-tick-live"><span class="krd-dot-live"></span> 📢 ' + txt.replace(/[<>&]/g, '') + '</span><span class="krd-tick-sep">✦</span>';
        tr.innerHTML = span + tr.innerHTML;
      }
    });
  }

  function fetchTicker() {
    fetch('/api/ticker?_=' + Date.now())
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d && typeof d.text === 'string') {
          window.__krdLiveTickerVal = d.text;
          var inp = document.getElementById('admLiveTickerInp');
          if (inp && document.activeElement !== inp) inp.value = d.text;
          forceRedrawTicker();
        }
      }).catch(function(){});
  }

  function checkAdminUI() {
    var box = document.getElementById('krdAdminTickerBox');

    // "Duyuru, Bakim & Kurallar" sekme butonunu bul
    var btns = document.querySelectorAll('button, [role="tab"], .tab');
    var duyuruBtn = null;
    for (var i = 0; i < btns.length; i++) {
      var txt = (btns[i].textContent || '').trim();
      if (txt.indexOf('Duyuru') !== -1 && (txt.indexOf('Bakım') !== -1 || txt.indexOf('Kurallar') !== -1)) {
        duyuruBtn = btns[i];
        break;
      }
    }

    if (!duyuruBtn) {
      if (box) box.remove();
      forceRedrawTicker();
      return;
    }

    // Sekme butonunun aktif olup olmadigini kontrol et (class veya aria-selected veya renk/arka plan)
    var isActive = duyuruBtn.classList.contains('active') ||
                   duyuruBtn.classList.contains('pri') ||
                   duyuruBtn.classList.contains('sel') ||
                   duyuruBtn.getAttribute('aria-selected') === 'true' ||
                   (duyuruBtn.style && duyuruBtn.style.background && duyuruBtn.style.background.indexOf('transparent') === -1);

    // Eger sekme pasifse kutuyu kaldir
    if (!isActive) {
      if (box) box.remove();
      return;
    }
    if (box) return;

    // Sekme cubugunun hemen altindaki icerik alanini bul
    var tabBar = duyuruBtn.parentElement;
    var mountParent = (tabBar && tabBar.parentElement) || document.getElementById('main-content') || document.getElementById('app');
    if (!mountParent) return;

    box = document.createElement('div');
    box.id = 'krdAdminTickerBox';
    box.className = 'card';
    box.style.cssText = 'margin:12px 0 14px;padding:12px;border:1px solid rgba(56,189,248,0.45);background:rgba(15,23,42,0.92)';
    box.innerHTML =
      '<div style="font-weight:700;font-size:13px;color:#38bdf8;margin-bottom:6px">📡 Canlı Yayın Akışı Duyurusu</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<input id="admLiveTickerInp" type="text" maxlength="220" placeholder="Örn: Bu akşam 21:00 THXEDO - akifl38 derbisi canlı!" style="flex:1;min-width:200px;padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:13px">' +
        '<button id="admLiveTickerBtn" type="button" class="pri">Yayınla</button>' +
      '</div>';

    if (tabBar && tabBar.nextSibling) {
      mountParent.insertBefore(box, tabBar.nextSibling);
    } else {
      mountParent.appendChild(box);
    }

    var inp = document.getElementById('admLiveTickerInp');
    var btn = document.getElementById('admLiveTickerBtn');
    inp.value = window.__krdLiveTickerVal || '';

    btn.onclick = function() {
      var v = inp.value.trim();
      btn.disabled = true;
      btn.textContent = 'Kaydediliyor...';
      fetch('/api/ticker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: v })
      })
      .then(function(r){ return r.json(); })
      .then(function(res){
        window.__krdLiveTickerVal = (res && typeof res.text === 'string') ? res.text : v;
        forceRedrawTicker();
        btn.textContent = 'Yayınlandı ✓';
        setTimeout(function(){ btn.textContent = 'Yayınla'; btn.disabled = false; }, 1200);
      })
      .catch(function(){
        btn.textContent = 'Yayınla';
        btn.disabled = false;
      });
    };
  }

  fetchTicker();
  setInterval(fetchTicker, 10000);
  setInterval(checkAdminUI, 600);
})();




;(function(){
  if (window.__krdUiPolish) return;
  window.__krdUiPolish = true;

  function polishLayout() {
    var isAdmin = (location.hash && location.hash.indexOf('admin') !== -1) ||
                  !!document.querySelector('[onclick*="saveAdminExtra"], [onclick*="/api/admin/"]') ||
                  document.body.textContent.indexOf('Notu Kaydet') !== -1;

    // 1. Sadece metni olmayan (icerisinde "Bildirim" yazisi bulunmayan) kucuk yuzen zili sol alta al
    document.querySelectorAll('button, a, div').forEach(function(el) {
      var txt = (el.textContent || '').trim();
      if (txt.indexOf('Bildirim') !== -1) return; // Sekme butonuna dokunma!
      var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (!rect) return;
      var isFloatingBell = ((el.innerHTML && el.innerHTML.indexOf('🔔') !== -1 && txt.length <= 2) ||
                           (el.id && (el.id.toLowerCase().indexOf('bell') !== -1 || el.id.toLowerCase().indexOf('push') !== -1))) &&
                           rect.width > 24 && rect.width < 58 && rect.height > 24 && rect.height < 58;
      if (isFloatingBell) {
        el.style.position = 'fixed';
        el.style.top = 'auto';
        el.style.bottom = '16px';
        el.style.left = '14px';
        el.style.zIndex = '9999';
      }
    });

    // 2. Yonetici ekraninda mac kartlari kapsayicisini mobilde tek sutun yap (sagdan tasmayi bitir)
    if (isAdmin && window.innerWidth <= 768) {
      document.querySelectorAll('div, section').forEach(function(parent) {
        if (parent.textContent && parent.textContent.indexOf('Notu Kaydet') !== -1 && parent.children.length >= 2) {
          var firstChildTxt = parent.children[0].textContent || '';
          if (firstChildTxt.indexOf('Notu Kaydet') !== -1) {
            parent.style.display = 'grid';
            parent.style.gridTemplateColumns = '1fr';
            parent.style.gap = '12px';
          }
        }
      });
    }

    // 3. Ana ekrandaki istatistik kutularini (En Golcu Takim / Altin Ayakkabi) 2'li izgaraya al
    if (!isAdmin) {
      var statTitles = ['En Golcü Takım', 'Altın Ayakkabı'];
      document.querySelectorAll('div, section').forEach(function(parent) {
        if (parent.children && parent.children.length >= 3 && parent.children.length <= 6) {
          var firstTxt = parent.children[0].textContent || '';
          if (statTitles.some(function(t){ return firstTxt.indexOf(t) !== -1; })) {
            parent.style.display = 'grid';
            parent.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
            parent.style.gap = '8px';
            var kids = Array.from(parent.children);
            kids.forEach(function(card, idx) {
              var colors = ['#10b981', '#38bdf8', '#f59e0b', '#a855f7', '#ec4899'];
              card.style.margin = '0';
              card.style.background = '#0f172a';
              card.style.border = '1px solid rgba(148,163,184,0.16)';
              card.style.borderLeft = '3px solid ' + colors[idx % colors.length];
              card.style.borderRadius = '12px';
              card.style.padding = '10px 12px';
              if (kids.length % 2 === 1 && idx === kids.length - 1) {
                card.style.gridColumn = '1 / -1';
              }
            });
          }
        }
      });
    }

    // 4. Puan tablosundaki cift yuvarlak takim rozetlerinden fazlaligi gizle
    document.querySelectorAll('table td').forEach(function(td) {
      var badges = td.querySelectorAll('span, div');
      var circleCount = 0;
      badges.forEach(function(b) {
        var t = (b.textContent || '').trim();
        if (/^[A-ZÇĞİÖŞÜ]{2,4}$/.test(t) && b.children.length === 0) {
          circleCount++;
          if (circleCount > 1) b.style.display = 'none';
        }
      });
    });

    // 5. 1v1 Tahmin Oyunu satirinin sagdan kesilmesini onle & yukari cik butonunu duzelt
    document.querySelectorAll('div, p, span, button, a').forEach(function(el) {
      var txt = el.textContent || '';
      if (txt.indexOf('1v1 Tahmin Oyunu') !== -1 && el.children.length <= 2) {
        el.style.whiteSpace = 'normal';
        el.style.wordBreak = 'break-word';
      }
      var t = txt.trim();
      if ((t === '↑' || t === '▲') && el.offsetWidth > 0 && el.offsetWidth < 55) {
        el.style.position = 'fixed';
        el.style.bottom = '74px';
        el.style.right = '14px';
        el.style.zIndex = '9995';
      }
    });
  }

  polishLayout();
  setInterval(polishLayout, 700);
})();


;(function(){
  if (window.__krdSafeVisitorPolish) return;
  window.__krdSafeVisitorPolish = true;

  function isAdminScreen() {
    if (location.hash && location.hash.indexOf('admin') !== -1) return true;
    if (document.getElementById('admSubVal')) return true;
    if (document.querySelector('[onclick*="saveAdminExtra"], [onclick*="/api/admin/"]')) return true;
    if (document.body && document.body.textContent.indexOf('Notu Kaydet') !== -1) return true;
    return false;
  }

  function applyVisitorOnlyPolish() {
    var admin = isAdminScreen();
    if (admin) {
      document.body.classList.add('krd-admin-active');
      return; // Yonetici ekranina HICBIR sekilde dokunma!
    }
    document.body.classList.remove('krd-admin-active');

    // A. Ustteki sari bildirim zili butonunu CANLI AKIS uzerinden alip sol alta sabitle
    document.querySelectorAll('button, a, div').forEach(function(el) {
      var txt = (el.textContent || '').trim();
      if (txt.length > 3) return;
      var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (!rect) return;
      var isTopLeftBell = (rect.top >= 65 && rect.top <= 175 && rect.left >= 0 && rect.left <= 55 &&
                           rect.width >= 26 && rect.width <= 56 && rect.height >= 26 && rect.height <= 56);
      if (isTopLeftBell || (el.id && (el.id.toLowerCase().indexOf('bell') !== -1 || el.id.toLowerCase().indexOf('push') !== -1) && rect.width < 60)) {
        el.style.position = 'fixed';
        el.style.top = 'auto';
        el.style.bottom = '16px';
        el.style.left = '14px';
        el.style.zIndex = '9998';
      }
    });

    // B. Istatistik kartlarini (En Golcu Takim & Altin Ayakkabi gruplari) 2'li izgaraya al, tek kalan son karti tam genislik yap
    var groups = ['En Golcü Takım', 'Altın Ayakkabı'];
    document.querySelectorAll('div, section').forEach(function(parent) {
      if (!parent.children || parent.children.length < 3 || parent.children.length > 6) return;
      var firstTxt = parent.children[0].textContent || '';
      if (!groups.some(function(g){ return firstTxt.indexOf(g) !== -1; })) return;

      parent.style.display = 'grid';
      parent.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
      parent.style.gap = '8px';
      var kids = Array.from(parent.children);
      var colors = ['#10b981', '#38bdf8', '#f59e0b', '#a855f7', '#ec4899'];
      kids.forEach(function(card, idx) {
        card.style.margin = '0';
        card.style.background = '#0f172a';
        card.style.border = '1px solid rgba(148,163,184,0.16)';
        card.style.borderLeft = '3px solid ' + colors[idx % colors.length];
        card.style.borderRadius = '12px';
        card.style.padding = '10px 12px';
        if (kids.length % 2 === 1 && idx === kids.length - 1) {
          card.style.gridColumn = '1 / -1';
        }
      });
    });

    // C. Puan tablosundaki cift yuvarlak rozetlerden fazlaligi gizle
    document.querySelectorAll('table td').forEach(function(td) {
      var circleCount = 0;
      td.querySelectorAll('span, div').forEach(function(b) {
        var t = (b.textContent || '').trim();
        if (/^[A-ZÇĞİÖŞÜ]{2,4}$/.test(t) && b.children.length === 0) {
          circleCount++;
          if (circleCount > 1) b.style.display = 'none';
        }
      });
    });

    // D. En altta tekrar eden ikinci H2H blokunu gizle (ortadaki tam H2H karti kalsin)
    var h2hCount = 0;
    document.querySelectorAll('div, section').forEach(function(el) {
      var t = (el.textContent || '').trim();
      if (t.indexOf('Kafa Kafaya (H2H) Rekabet & PNG Tablo İndir') === 0 && el.children.length <= 4) {
        h2hCount++;
        // Baslik satirini sadece "PNG Tablo Indir" olarak sadeleştir
        var hdr = el.firstElementChild;
        if (hdr && hdr.textContent.indexOf('Kafa Kafaya') !== -1) {
          hdr.innerHTML = '📸 Puan Tablosunu Kaydet & Paylaş';
        }
      }
    });

    // E. 1v1 Tahmin Oyunu metin sarma, Simulator basligi ve Sag alt Yukari Cik (↑) konumu
    document.querySelectorAll('div, p, span, button, a, summary').forEach(function(el) {
      var txt = el.textContent || '';
      if (txt.indexOf('1v1 Tahmin Oyunu') !== -1 && el.children.length <= 2) {
        el.style.whiteSpace = 'normal';
        el.style.wordBreak = 'break-word';
      }
      if (txt.indexOf('Canlı Şampiyonluk & Averaj Simülatörü') !== -1 && txt.indexOf('Tahmini Skor Gir') !== -1 && el.children.length >= 2) {
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.alignItems = 'flex-start';
        el.style.gap = '4px';
      }
      var t = txt.trim();
      if ((t === '↑' || t === '▲') && el.offsetWidth > 0 && el.offsetWidth < 55) {
        el.style.position = 'fixed';
        el.style.bottom = '74px';
        el.style.right = '14px';
        el.style.zIndex = '9995';
      }
      if (t === '' && el.children.length === 0 && el.offsetHeight > 20 && el.offsetHeight < 55 && el.offsetWidth > 35 && el.offsetWidth < 90) {
        var r = el.getBoundingClientRect();
        if (r.top > 500) el.style.display = 'none';
      }
    });
  }

  applyVisitorOnlyPolish();
  setInterval(applyVisitorOnlyPolish, 700);
})();


;(function(){
  if (window.__krdProSuite) return;
  window.__krdProSuite = true;

  function normTr(s) {
    return String(s || '').trim().replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr-TR');
  }

  // A. TAHMIN KRALI SIRALAMASINDA AYNI KISIYI TEK SATIRDA BIRLESTIR
  function mergePredictionRows() {
    var tables = document.querySelectorAll('table');
    tables.forEach(function(tbl) {
      var headTxt = (tbl.querySelector('thead') || tbl).textContent || '';
      if (headTxt.indexOf('TAHMİNCİ') === -1 || headTxt.indexOf('OYNANAN') === -1) return;
      var tbody = tbl.querySelector('tbody');
      if (!tbody || tbody.dataset.merged === '1') return;

      var rows = Array.from(tbody.querySelectorAll('tr'));
      if (rows.length < 2) return;

      var map = {};
      rows.forEach(function(tr) {
        var tds = tr.querySelectorAll('td');
        if (tds.length < 3) return;
        var rawName = (tds[1].textContent || '').replace(/👑/g, '').trim();
        var key = normTr(rawName);
        if (!key) return;
        var count = parseInt((tds[2].textContent || '').replace(/\D/g, ''), 10) || 0;
        var pts = tds[3] ? (parseInt((tds[3].textContent || '').replace(/\D/g, ''), 10) || 0) : null;

        if (!map[key]) {
          map[key] = { display: rawName, count: 0, pts: 0, hasPts: pts !== null };
        }
        if (/[İÇŞĞÜÖ]/.test(rawName)) map[key].display = rawName;
        map[key].count += count;
        if (pts !== null) map[key].pts += pts;
      });

      var list = Object.values(map).sort(function(a, b) {
        if (a.hasPts && b.pts !== a.pts) return b.pts - a.pts;
        return b.count - a.count;
      });

      tbody.innerHTML = list.map(function(item, idx) {
        var crown = idx === 0 ? '👑 ' : '';
        var rankStyle = idx === 0 ? 'background:#facc15;color:#0f172a;font-weight:800;' : 'background:#1e293b;color:#cbd5e1;';
        var ptsCell = item.hasPts ? '<td style="text-align:right;font-weight:700;color:#10b981">' + item.pts + '</td>' : '';
        return '<tr>' +
          '<td><span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:7px;font-size:12px;' + rankStyle + '">' + (idx + 1) + '</span></td>' +
          '<td style="font-weight:600">' + crown + item.display + '</td>' +
          '<td style="text-align:right;font-weight:700">' + item.count + '</td>' +
          ptsCell +
        '</tr>';
      }).join('');
      tbody.dataset.merged = '1';
    });
  }

  // B. HAFTANIN DERBISI VURGUSU (Siradaki Maclar icindeki en kritik ust sira macina rozet ekle)
  function highlightMatchOfTheWeek() {
    var cards = document.querySelectorAll('.card, [class*="match"]');
    var highlighted = false;
    cards.forEach(function(card) {
      if (highlighted || card.dataset.derbyChecked === '1') return;
      var txt = card.textContent || '';
      if (txt.indexOf('Hafta') !== -1 && (txt.indexOf('Berabere') !== -1 || txt.indexOf('İlk tahmini sen yap') !== -1)) {
        card.dataset.derbyChecked = '1';
        if (txt.indexOf('THXEDO') !== -1 || txt.indexOf('akifl38') !== -1 || txt.indexOf('Mustafa') !== -1) {
          highlighted = true;
          card.style.border = '1.5px solid rgba(245, 158, 11, 0.65)';
          card.style.boxShadow = '0 0 22px rgba(245, 158, 11, 0.16)';
          if (!card.querySelector('.krd-derby-badge')) {
            var badge = document.createElement('div');
            badge.className = 'krd-derby-badge';
            badge.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:linear-gradient(90deg,#f59e0b,#ef4444);color:#fff;font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;margin-bottom:8px;letter-spacing:0.4px';
            badge.textContent = '🔥 HAFTANIN DERBİSİ • 2X PRESTİJ MAÇI';
            card.insertBefore(badge, card.firstChild);
          }
        }
      }
    });
  }

  // C. TIKLANABILIR OYUNCU PROFIL KARTI (Puan tablosundaki isimlere tiklayinca detay modal acilir)
  function openPlayerModal(playerName) {
    var existing = document.getElementById('krdPlayerModal');
    if (existing) existing.remove();

    var data = window.__lastLeagueData || window.DATA || {};
    var matches = Array.isArray(data.matches) ? data.matches : [];
    var played = matches.filter(function(m) {
      return m && m.played && (m.home === playerName || m.away === playerName || m.h === playerName || m.a === playerName);
    });

    var w = 0, d = 0, l = 0, gf = 0, ga = 0;
    var recentHtml = '';
    played.slice(-6).reverse().forEach(function(m) {
      var h = m.home || m.h, a = m.away || m.a;
      var hs = Number(m.hs != null ? m.hs : m.hg) || 0;
      var as = Number(m.as != null ? m.as : m.ag) || 0;
      var isHome = (h === playerName);
      var myG = isHome ? hs : as, opG = isHome ? as : hs;
      gf += myG; ga += opG;
      var resBadge = '<span style="background:#64748b;color:#fff;padding:2px 6px;border-radius:5px;font-size:11px">B</span>';
      if (myG > opG) { w++; resBadge = '<span style="background:#10b981;color:#fff;padding:2px 6px;border-radius:5px;font-size:11px">G</span>'; }
      else if (myG < opG) { l++; resBadge = '<span style="background:#ef4444;color:#fff;padding:2px 6px;border-radius:5px;font-size:11px">M</span>'; }
      else { d++; }

      recentHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#1e293b;border-radius:8px;margin-bottom:6px;font-size:12px">' +
        '<span><b>' + h + '</b> ' + hs + ' - ' + as + ' <b>' + a + '</b></span>' + resBadge +
      '</div>';
    });

    // Tum maclardan toplam istatistik hesapla (son 6 disindakiler dahil)
    w = 0; d = 0; l = 0; gf = 0; ga = 0;
    played.forEach(function(m) {
      var h = m.home || m.h;
      var hs = Number(m.hs != null ? m.hs : m.hg) || 0;
      var as = Number(m.as != null ? m.as : m.ag) || 0;
      var myG = (h === playerName) ? hs : as;
      var opG = (h === playerName) ? as : hs;
      gf += myG; ga += opG;
      if (myG > opG) w++; else if (myG < opG) l++; else d++;
    });

    var winRate = played.length ? Math.round((w / played.length) * 100) : 0;

    var modal = document.createElement('div');
    modal.id = 'krdPlayerModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.82);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML =
      '<div style="width:100%;max-width:420px;background:#0f172a;border:1px solid rgba(56,189,248,0.4);border-radius:18px;padding:18px;color:#f8fafc;box-shadow:0 20px 50px rgba(0,0,0,0.6)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
          '<div><div style="font-size:11px;color:#38bdf8;font-weight:700">OYUNCU KARNESİ • SEZON 2027</div><h3 style="margin:2px 0 0;font-size:20px">' + playerName + '</h3></div>' +
          '<button id="krdClosePlayerModal" style="background:#1e293b;color:#fff;border:none;width:32px;height:32px;border-radius:10px;font-size:16px;cursor:pointer">✕</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;text-align:center">' +
          '<div style="background:#1e293b;padding:8px;border-radius:10px"><div style="font-size:10px;color:#94a3b8">MAÇ</div><b style="font-size:15px">' + played.length + '</b></div>' +
          '<div style="background:#1e293b;padding:8px;border-radius:10px"><div style="font-size:10px;color:#94a3b8">G-B-M</div><b style="font-size:14px;color:#10b981">' + w + '-' + d + '-' + l + '</b></div>' +
          '<div style="background:#1e293b;padding:8px;border-radius:10px"><div style="font-size:10px;color:#94a3b8">GOL</div><b style="font-size:14px;color:#38bdf8">' + gf + '/' + ga + '</b></div>' +
          '<div style="background:#1e293b;padding:8px;border-radius:10px"><div style="font-size:10px;color:#94a3b8">GALİBİYET</div><b style="font-size:14px;color:#f59e0b">%' + winRate + '</b></div>' +
        '</div>' +
        '<div style="font-size:12px;font-weight:700;color:#94a3b8;margin-bottom:8px">Son Maç Performansı</div>' +
        (recentHtml || '<div style="font-size:12px;color:#64748b">Henüz oynanmış maç kaydı bulunamadı.</div>') +
      '</div>';

    document.body.appendChild(modal);
    document.getElementById('krdClosePlayerModal').onclick = function() { modal.remove(); };
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
  }

  function bindStandingsClick() {
    document.querySelectorAll('table tbody tr').forEach(function(tr) {
      var tds = tr.querySelectorAll('td');
      if (tds.length < 6 || tr.dataset.playerBound === '1') return;
      var nameCell = tds[1];
      if (!nameCell) return;
      // Oyuncu adini ayikla
      var raw = (nameCell.textContent || '').trim();
      var clean = raw.replace(/^[A-ZÇĞİÖŞÜ]{2,4}\s+/, '').replace(/▲\d+|▼\d+|\d+G Seri|[GBM](?=\s|$)/g, '').trim().split(/\s+/)[0];
      if (!clean || clean.length < 2) return;
      tr.dataset.playerBound = '1';
      nameCell.style.cursor = 'pointer';
      nameCell.title = clean + ' oyuncu profilini aç';
      nameCell.addEventListener('click', function() {
        openPlayerModal(clean);
      });
    });
  }

  // D. İONENSPIEGEL SPOR GAZETESİ HAFTA BÜLTENİ PNG OLUŞTURUCU
  function downloadNewspaperBulletin() {
    var canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    var ctx = canvas.getContext('2d');

    // Gazete kagit / gece manset arka plani
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, 1080, 1350);

    // Ust Kirmizi-Altin Spor Gazetesi Masthead
    var grad = ctx.createLinearGradient(0, 0, 1080, 0);
    grad.addColorStop(0, '#991b1b');
    grad.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = grad;
    ctx.fillRect(40, 40, 1000, 150);

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('İONENSPIEGEL SPOR BÜLTENİ • RESMİ LİG ÖZETİ', 70, 90);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 52px sans-serif';
    ctx.fillText('KRD PES LİGİ — SEZON 2027', 70, 155);

    // Puan tablosundan ilk 5 sirayi oku
    ctx.fillStyle = '#111827';
    ctx.fillRect(40, 220, 1000, 520);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 220, 1000, 520);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('🏆 ZİRVE YARIŞI (İLK 5)', 70, 275);

    var rows = Array.from(document.querySelectorAll('table tbody tr')).filter(function(r){ return r.querySelectorAll('td').length >= 6; }).slice(0, 5);
    rows.forEach(function(tr, i) {
      var tds = tr.querySelectorAll('td');
      var y = 345 + (i * 76);
      ctx.fillStyle = i === 0 ? 'rgba(250, 204, 21, 0.14)' : 'rgba(30, 41, 59, 0.7)';
      ctx.fillRect(65, y - 42, 950, 60);

      var pName = (tds[1].textContent || '').replace(/^[A-ZÇĞİÖŞÜ]{2,4}\s+/, '').replace(/▲\d+|▼\d+|\d+G Seri/g, '').trim().split(/\s+/)[0];
      var o = (tds[2] && tds[2].textContent || '').trim();
      var g = (tds[3] && tds[3].textContent || '').trim();
      var pts = (tds[tds.length - 1] && tds[tds.length - 1].textContent || '').trim();

      ctx.fillStyle = i === 0 ? '#facc15' : '#ffffff';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText((i + 1) + '.  ' + pName, 90, y);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '24px sans-serif';
      ctx.fillText('O: ' + o + '   G: ' + g, 580, y);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText(pts + ' P', 860, y);
    });

    // Canli Yayin Akisi / Manset Kutusu
    ctx.fillStyle = '#111827';
    ctx.fillRect(40, 770, 1000, 390);
    ctx.strokeStyle = '#ef4444';
    ctx.strokeRect(40, 770, 1000, 390);

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('📰 HAFTANIN MANŞETİ & CANLI AKIŞ', 70, 825);

    var tickerTxt = (window.__krdLiveTickerVal || 'KRD PES Ligi Sezon 2027 heyecanı tüm hızıyla devam ediyor!').trim();
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 30px sans-serif';
    var words = tickerTxt.split(' ');
    var line = '', lineY = 895;
    words.forEach(function(w) {
      if ((line + w).length > 44) {
        ctx.fillText(line, 70, lineY);
        line = w + ' ';
        lineY += 46;
      } else {
        line += w + ' ';
      }
    });
    if (line) ctx.fillText(line, 70, lineY);

    // Alt Imza
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('✦ YAPIMCI: İONENSPIEGEL (@ionenspiegel) • kardesler-ligi-2.onrender.com', 70, 1270);

    var a = document.createElement('a');
    a.download = 'ionenspiegel-krd-bulten.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  function injectBulletinButton() {
    if (document.getElementById('krdBulletinBtn')) return;
    var pngBtns = Array.from(document.querySelectorAll('button')).filter(function(b) {
      return (b.textContent || '').indexOf('Puan Tablosunu PNG İndir') !== -1;
    });
    if (!pngBtns.length) return;
    var targetBtn = pngBtns[0];
    var btn = document.createElement('button');
    btn.id = 'krdBulletinBtn';
    btn.type = 'button';
    btn.style.cssText = 'margin-top:8px;width:100%;padding:11px 14px;border-radius:12px;border:1px solid rgba(250,204,21,0.45);background:linear-gradient(90deg,#991b1b,#1e3a8a);color:#fff;font-weight:800;font-size:13px;cursor:pointer';
    btn.textContent = '📰 İonenSpiegel Hafta Bülteni İndir (PNG)';
    btn.onclick = downloadNewspaperBulletin;
    targetBtn.parentElement.appendChild(btn);
  }

  setInterval(function() {
    mergePredictionRows();
    highlightMatchOfTheWeek();
    bindStandingsClick();
    injectBulletinButton();
  }, 900);
})();


;(function(){
  if (window.__krdFinalExtras) return;
  window.__krdFinalExtras = true;

  // 1. MAC SONUCU AFISI (PNG) OLUSTURUCU (IonenSpiegel Tarzi Mac Posteri)
  function downloadMatchPoster(home, hs, as, away, weekInfo) {
    var canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    var ctx = canvas.getContext('2d');

    // Arka plan stadyum gece degradeli
    var bg = ctx.createLinearGradient(0, 0, 1080, 1080);
    bg.addColorStop(0, '#070b14');
    bg.addColorStop(0.5, '#0f2942');
    bg.addColorStop(1, '#064e3b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1080, 1080);

    // Dis cerceve
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 36, 1008, 1008);

    // Ust Baslik
    ctx.fillStyle = '#facc15';
    ctx.font = '900 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KRD PES LİGİ • SEZON 2027 • MAÇ SONUCU', 540, 110);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(weekInfo || 'RESMİ LİG KARŞILAŞMASI', 540, 152);

    // Ev Sahibi ve Deplasman Rozetleri
    function drawTeamBadge(name, cx, cy, color) {
      ctx.beginPath();
      ctx.arc(cx, cy, 95, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.stroke();

      var abbr = name.slice(0, 3).toUpperCase();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 44px sans-serif';
      ctx.fillText(abbr, cx, cy + 15);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 34px sans-serif';
      ctx.fillText(name, cx, cy + 150);
    }

    drawTeamBadge(home, 250, 460, '#1e3a8a');
    drawTeamBadge(away, 830, 460, '#991b1b');

    // Orta Skor Kutusu
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(410, 385, 260, 145);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.strokeRect(410, 385, 260, 145);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 76px sans-serif';
    ctx.fillText(hs + ' - ' + as, 540, 482);

    // Kazanan Vurgusu
    var bannerTxt = 'BERABERLİKLE SONUÇLANDI';
    if (Number(hs) > Number(as)) bannerTxt = '🏆 KAZANAN: ' + home.toUpperCase();
    else if (Number(as) > Number(hs)) bannerTxt = '🏆 KAZANAN: ' + away.toUpperCase();

    ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
    ctx.fillRect(140, 720, 800, 74);
    ctx.fillStyle = '#34d399';
    ctx.font = '900 28px sans-serif';
    ctx.fillText(bannerTxt, 540, 767);

    // Alt IonenSpiegel Imza
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('✦ YAPIMCI: İONENSPIEGEL (@ionenspiegel) • kardesler-ligi-2.onrender.com', 540, 980);

    var a = document.createElement('a');
    a.download = 'krd-' + home + '-' + hs + '-' + as + '-' + away + '.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  function bindMatchPosterButtons() {
    document.querySelectorAll('button').forEach(function(btn) {
      if ((btn.textContent || '').indexOf('Maç Sonucu Afişi') === -1 || btn.dataset.posterBound === '1') return;
      btn.dataset.posterBound = '1';
      btn.addEventListener('click', function(e) {
        var card = btn.closest('.card') || btn.parentElement;
        if (!card) return;
        var txt = (card.textContent || '').replace(/\s+/g, ' ').trim();
        var m = txt.match(/([A-Za-zÇĞİÖŞÜçğıöşü0-9_]+)\s+(\d+)\s*-\s*(\d+)\s+(?:Bitti[^A-Za-z0-9]*)?(?:H\d+\s*)?([A-Za-zÇĞİÖŞÜçğıöşü0-9_]+)/);
        var weekM = txt.match(/Bitti\s*•?\s*(H\d+)/);
        if (m) {
          e.preventDefault();
          e.stopPropagation();
          downloadMatchPoster(m[1], m[2], m[3], m[4], weekM ? ('HAFTA ' + weekM[1].replace('H', '')) : '');
        }
      }, true);
    });
  }

  // 2. HERKESIN KALAN MACI OZET CUBUGU (Siradaki Maclar ustunde aktif fikstur ozeti)
  function renderRemainingSummaryBar() {
    if (document.getElementById('krdRemainingBar')) return;
    var headings = Array.from(document.querySelectorAll('h2, h3, .sh, div')).filter(function(el) {
      return (el.textContent || '').trim() === 'Sıradaki Maçlar';
    });
    if (!headings.length) return;

    var data = window.__lastLeagueData || window.DATA || {};
    var matches = Array.isArray(data.matches) ? data.matches : [];
    var remaining = matches.filter(function(m) {
      if (!m || m.played) return false;
      var h = String(m.home || m.h || ''), a = String(m.away || m.a || '');
      // Hukmen tamamlanan Mert ve Omer maclarini aktif fiksturden ayir
      if (/^(Mert|Ömer|Omer)$/i.test(h) || /^(Mert|Ömer|Omer)$/i.test(a)) return false;
      return true;
    });
    if (!remaining.length) return;

    var counts = {};
    remaining.forEach(function(m) {
      var h = m.home || m.h, a = m.away || m.a;
      counts[h] = (counts[h] || 0) + 1;
      counts[a] = (counts[a] || 0) + 1;
    });

    var pills = Object.keys(counts).sort(function(a, b){ return counts[b] - counts[a]; }).map(function(p) {
      return '<span style="background:#1e293b;border:1px solid rgba(56,189,248,0.3);padding:4px 9px;border-radius:8px;font-size:11px;white-space:nowrap">' +
        '<b>' + p + '</b>: <span style="color:#38bdf8;font-weight:700">' + counts[p] + ' maç</span>' +
      '</span>';
    }).join('');

    var bar = document.createElement('div');
    bar.id = 'krdRemainingBar';
    bar.style.cssText = 'background:#0f172a;border:1px solid rgba(148,163,184,0.18);border-radius:12px;padding:10px 12px;margin:8px 0 12px';
    bar.innerHTML =
      '<div style="font-size:11px;font-weight:800;color:#10b981;margin-bottom:6px">📅 AKTİF KALAN MAÇ SAYILARI (TOPLAM ' + remaining.length + ' MAÇ)</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px">' + pills + '</div>';

    var target = headings[0].closest('.sh') || headings[0];
    target.parentElement.insertBefore(bar, target.nextSibling);
  }

  // 3. YONETICI PANELINDE "BITIR" BUTONUNA BASILDIGINDA CANLI AKISA OTOMATIK SKOR BILDIRIMI
  function hookAdminFinishTicker() {
    document.querySelectorAll('button').forEach(function(btn) {
      if ((btn.textContent || '').trim() !== '✓ Bitir' || btn.dataset.tickerHooked === '1') return;
      btn.dataset.tickerHooked = '1';
      btn.addEventListener('click', function() {
        var card = btn.closest('.card') || btn.parentElement;
        if (!card) return;
        var txt = (card.textContent || '').replace(/\s+/g, ' ').trim();
        var m = txt.match(/([A-Za-zÇĞİÖŞÜçğıöşü0-9_]+)\s+(\d+)\s*-\s*(\d+)\s+(?:Bitti|Oynanmadı|H\d+)?[^A-Za-z0-9_]*([A-Za-zÇĞİÖŞÜçğıöşü0-9_]+)/);
        if (m) {
          var autoMsg = '⚽ MAÇ SONUCU: ' + m[1] + ' ' + m[2] + ' - ' + m[3] + ' ' + m[4] + ' (Puan durumu güncellendi!)';
          fetch('/api/ticker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: autoMsg })
          }).catch(function(){});
        }
      });
    });
  }

  setInterval(function() {
    bindMatchPosterButtons();
    renderRemainingSummaryBar();
    hookAdminFinishTicker();
  }, 900);
})();


;(function(){
  if (window.__krdCeremonyPack) return;
  window.__krdCeremonyPack = true;

  // A. CANLI MAC TESLIM GERI SAYIM SAYACI (24 Kasim 2026 22:30 hedefi)
  function updateDeadlineCountdown() {
    var remBar = document.getElementById('krdRemainingBar');
    if (!remBar) return;

    var badge = document.getElementById('krdDeadlineTimer');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'krdDeadlineTimer';
      badge.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px dashed rgba(148,163,184,0.22);display:flex;justify-content:space-between;align-items:center;font-size:11px';
      remBar.appendChild(badge);
    }

    var target = new Date('2026-11-24T22:30:00+03:00').getTime();
    var now = Date.now();
    var diff = target - now;

    if (diff > 0) {
      var h = Math.floor(diff / 3600000);
      var m = Math.floor((diff % 3600000) / 60000);
      var s = Math.floor((diff % 60000) / 1000);
      var pad = function(n){ return n < 10 ? '0' + n : String(n); };
      badge.innerHTML =
        '<span style="color:#facc15;font-weight:700">⏳ Maç Teslim Süresi (22:30)</span>' +
        '<span style="background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.5);color:#fca5a5;padding:2px 8px;border-radius:6px;font-family:monospace;font-weight:800">' +
          pad(h) + ':' + pad(m) + ':' + pad(s) +
        '</span>';
    } else {
      badge.innerHTML =
        '<span style="color:#f87171;font-weight:800">⚠️ MAÇ TESLİM SÜRESİ DOLDU!</span>' +
        '<span style="color:#cbd5e1">Oynanmayan maçlar hakem kararında</span>';
    }
  }

  // B. SEZON SONU SAMPIYONLUK SEREMONISI (Tum maclar bittiginde otomatik kutlama karti)
  function checkChampionCeremony() {
    if (document.getElementById('krdChampionBanner')) return;
    var data = window.__lastLeagueData || window.DATA || {};
    var matches = Array.isArray(data.matches) ? data.matches : [];
    if (matches.length < 6) return;

    var unplayed = matches.filter(function(m){ return m && !m.played; });
    if (unplayed.length > 0) return; // Hala oynanmamis mac varsa bekle

    var rows = Array.from(document.querySelectorAll('table tbody tr')).filter(function(r){ return r.querySelectorAll('td').length >= 6; });
    if (!rows.length) return;

    var firstTds = rows[0].querySelectorAll('td');
    var champName = (firstTds[1].textContent || '').replace(/^[A-ZÇĞİÖŞÜ]{2,4}\s+/, '').replace(/▲\d+|▼\d+|\d+G Seri/g, '').trim().split(/\s+/)[0];
    var champPts = (firstTds[firstTds.length - 1].textContent || '').trim();
    if (!champName) return;

    var tbl = rows[0].closest('table');
    if (!tbl || !tbl.parentElement) return;

    var banner = document.createElement('div');
    banner.id = 'krdChampionBanner';
    banner.style.cssText = 'margin:12px 0;padding:16px;border-radius:16px;background:linear-gradient(135deg,rgba(250,204,21,0.22),rgba(16,185,129,0.2),#0f172a);border:1.5px solid rgba(250,204,21,0.7);text-align:center;box-shadow:0 12px 35px rgba(250,204,21,0.18)';
    banner.innerHTML =
      '<div style="font-size:12px;font-weight:900;color:#facc15;letter-spacing:1.2px">🏆 KRD PES LİGİ • SEZON 2027 ŞAMPİYONU 🏆</div>' +
      '<div style="font-size:26px;font-weight:900;color:#ffffff;margin:6px 0">' + champName + '</div>' +
      '<div style="font-size:13px;color:#34d399;font-weight:700">' + champPts + ' Puan ile Sezonu Zirvede Tamamladı!</div>';

    tbl.parentElement.insertBefore(banner, tbl);
  }

  setInterval(function() {
    updateDeadlineCountdown();
    checkChampionCeremony();
  }, 1000);
})();


;(function(){
  if (window.__krdTopPillFix) return;
  window.__krdTopPillFix = true;

  function fixHeaderAndBell() {
    // A. Sol ustteki sari zili (icinde 🔔 olan veya CANLI AKIS yanindaki kucuk yuvarlak dugmeyi) sol alta tasi
    document.querySelectorAll('button, div, a').forEach(function(el) {
      var txt = (el.textContent || '').trim();
      if (txt.indexOf('Bildirim') !== -1 || txt.length > 3) return;
      var htmlStr = el.innerHTML || '';
      var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (!rect || rect.width === 0) return;

      var hasBell = htmlStr.indexOf('🔔') !== -1 || htmlStr.indexOf('bell') !== -1;
      var isTopLeftRound = (rect.top >= 70 && rect.top <= 185 && rect.left >= 0 && rect.left <= 65 &&
                            rect.width >= 26 && rect.width <= 54 && rect.height >= 26 && rect.height <= 54);
      if (hasBell || isTopLeftRound) {
        el.style.setProperty('position', 'fixed', 'important');
        el.style.setProperty('top', 'auto', 'important');
        el.style.setProperty('bottom', '16px', 'important');
        el.style.setProperty('left', '14px', 'important');
        el.style.setProperty('z-index', '9998', 'important');
      }
    });

    // B. Sag ustteki kapsulu (tema adi ne olursa olsun: Stadyum, Spor Basini, Gece, Neon vb.) duzenle
    var themeWords = ['Stadyum', 'Spor Basını', 'Gece', 'Klasik', 'Neon', 'Tema'];
    var themeBtn = Array.from(document.querySelectorAll('button, span, div')).find(function(el) {
      var t = (el.textContent || '').trim();
      var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (!r || r.top > 110 || r.width === 0 || r.width > 220) return false;
      return themeWords.some(function(w){ return t.indexOf(w) !== -1; }) && el.children.length <= 2;
    });
    if (!themeBtn) return;

    var outerBox = themeBtn.parentElement;
    if (!outerBox || outerBox.offsetWidth > 340) return;

    outerBox.classList.add('krd-top-controls');
    Array.from(outerBox.children).forEach(function(child) {
      child.style.setProperty('background', 'transparent', 'important');
      child.style.setProperty('border', 'none', 'important');
      child.style.setProperty('padding', '0', 'important');
      child.style.setProperty('margin', '0', 'important');
      child.style.setProperty('box-shadow', 'none', 'important');
    });

    var statusEl = Array.from(outerBox.children).find(function(c){ return c !== themeBtn && !c.contains(themeBtn); });
    if (statusEl && statusEl.dataset.wired !== '1') {
      statusEl.dataset.wired = '1';
      statusEl.classList.add('krd-pill-item');
      statusEl.title = 'Canlı bağlantı aktif • Verileri yenile';
      statusEl.innerHTML = '<span class="krd-live-dot"></span><span style="color:#cbd5e1;font-size:11px">Canlı</span><span class="krd-refresh-ico">↻</span>';
      statusEl.onclick = function(e) {
        e.stopPropagation();
        var ico = statusEl.querySelector('.krd-refresh-ico');
        if (ico) { ico.classList.remove('krd-spinning'); void ico.offsetWidth; ico.classList.add('krd-spinning'); }
        if (typeof load === 'function') load();
        else if (typeof fetchState === 'function') fetchState();
        else location.reload();
      };
    }

    var actualThemeBtn = themeBtn.closest('button') || themeBtn;
    actualThemeBtn.classList.add('krd-pill-item');
    actualThemeBtn.style.setProperty('color', '#facc15', 'important');
  }

  fixHeaderAndBell();
  setInterval(fixHeaderAndBell, 500);
})();
