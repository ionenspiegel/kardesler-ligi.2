
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
