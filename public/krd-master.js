(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  // Canli S verisini yakala
  window._krdLiveS = window._krdLiveS || null;
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const c = res.clone();
      if ((c.headers.get('content-type') || '').includes('application/json')) {
        c.json().then(d => {
          if (d && Array.isArray(d.teams) && Array.isArray(d.matches)) window._krdLiveS = d;
        }).catch(() => {});
      }
    } catch {}
    return res;
  };

  // Eski Service Worker onbellegini temizle
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  }

  const getS = () => (typeof S !== 'undefined' ? S : window._krdLiveS);
  const isAdm = () => {
    const st = getS();
    const sl = (st && st.settings && st.settings.admin_slug) || 'krd-kontrol';
    return location.hash.startsWith('#/yonetici') || location.hash.startsWith('#/' + sl);
  };

  window._krdData = { extras: {}, predictions: {}, archive: [], badges: {}, cup: {} };

  const DEFAULT_RULES = [
    '📅 Yürürlük Tarihi: Bu kurallar 22 Kasım 2026 tarihinden itibaren oynanacak maçlarda geçerlidir.',
    '1️⃣ Maç Süresi: Maçlar 11 veya 12 dk oynanır. Yanlış kuran tarafa -1 Puan silme cezası uygulanır ve maç tekrarlanır.',
    '2️⃣ Maçtan Çekilme: Maçı terk eden veya çekilen kulüp 3-0 hükmen mağlup sayılır ve -3 Puan silinir.',
    '3️⃣ Bağlantı Kopması: Kalan süre ve skor korunarak maç tamamlanır; bilerek koparana -3 Puan cezası uygulanır.'
  ].join('\n');

  async function pullAll() {
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch('/api/krd-extras?_=' + Date.now()),
        fetch('/api/krd-mega-data?_=' + Date.now()),
        fetch('/api/krd-pro5-data?_=' + Date.now())
      ]);
      if (r1.ok) { const d1 = await r1.json(); window._krdData.extras = d1.extras || {}; }
      if (r2.ok) { const d2 = await r2.json(); window._krdData.predictions = d2.predictions || {}; window._krdData.archive = d2.archive || []; }
      if (r3.ok) { const d3 = await r3.json(); window._krdData.badges = d3.badges || {}; window._krdData.cup = d3.cup || {}; }
    } catch {}
  }

  function injectStyles() {
    if (document.getElementById('krdMasterCss')) return;
    const st = document.createElement('style');
    st.id = 'krdMasterCss';
    st.textContent = `
      #krdMaintScreen{position:fixed;inset:0;z-index:99999;background:radial-gradient(circle at top,#1e293b,#020617);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px}
      #krdPinnedAnn{margin:8px 0;padding:10px 14px;border-radius:12px;background:linear-gradient(90deg,rgba(234,88,12,.25),rgba(250,204,21,.18));border:1.5px solid rgba(250,204,21,.5);color:#fef08a;font-size:13px;font-weight:700}
      .krd-crest{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;font-size:9.5px;font-weight:900;margin-right:6px;color:#fff;border:1px solid rgba(255,255,255,.3)}
      .krd-delta-up{color:#4ade80;font-size:10px;font-weight:900;margin-left:4px}
      .krd-delta-dn{color:#f87171;font-size:10px;font-weight:900;margin-left:4px}
      .krd-streak{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;font-size:9.5px;font-weight:800;background:rgba(250,204,21,.16);color:#fde047;border:1px solid rgba(250,204,21,.32)}
      #krdPodium{margin:10px 0;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      @media(max-width:560px){#krdPodium{grid-template-columns:1fr}}
      .krd-pod-item{background:rgba(15,23,42,.92);border:1px solid rgba(250,204,21,.28);border-radius:12px;padding:9px 11px;display:grid;gap:2px}
      .krd-box-acc{margin:10px 0;padding:10px 13px}
      .krd-box-acc summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:800}
      .krd-box-acc summary::-webkit-details-marker{display:none}
      .krd-pred-line{display:grid;grid-template-columns:1fr 44px 12px 44px 1fr auto;align-items:center;gap:5px;padding:6px 8px;border-radius:9px;background:rgba(15,23,42,.75);border:1px solid rgba(148,163,184,.18);font-size:11.5px}
      .krd-pred-line input{width:100%;text-align:center;padding:3px;border-radius:6px;border:1px solid #334155;background:#020617;color:#fff;font-weight:800}
      .krd-derby{border:1.5px solid rgba(250,204,21,.7)!important;box-shadow:0 0 18px rgba(250,204,21,.18)}
      .krd-derby-badge{display:inline-block;margin-bottom:5px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:900;background:linear-gradient(90deg,#facc15,#f97316);color:#090d16}
      .krd-png-btn{margin-top:6px;width:100%;padding:5px 8px!important;font-size:11px!important;font-weight:700!important;border-radius:8px!important;background:rgba(250,204,21,.15)!important;border:1px solid rgba(250,204,21,.35)!important;color:#fde047!important;cursor:pointer}
      #krdPosterPop{position:fixed;inset:0;z-index:10000;background:rgba(2,6,23,.85);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:16px}
      #krdPosterPop.open{display:flex}
      .krd-poster-in{width:100%;max-width:440px;background:#0f172a;border:1px solid rgba(250,204,21,.4);border-radius:16px;padding:14px;display:grid;gap:10px;text-align:center}
      .krd-poster-in img{width:100%;border-radius:10px}
      .krd-adm-box{margin-top:14px;background:rgba(15,23,42,.95);border:1.5px solid rgba(250,204,21,.38);border-radius:14px;padding:13px 15px;display:grid;gap:10px}
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
    const r = await fetch('/api/krd-predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nick, matchId: mid, hs, aws }) });
    const d = await r.json();
    if (!r.ok) return alert(d.error || 'Hata');
    window._krdData.predictions = d.predictions || {};
    if (typeof toast === 'function') toast('🎯 Tahminin kaydedildi!');
    renderAll(true);
  };

  window.krdSendReport = async function () {
    const sender = (document.getElementById('krdRepSender')?.value || '').trim() || 'Ziyaretçi';
    const msg = (document.getElementById('krdRepMsg')?.value || '').trim();
    if (!msg) return alert('Lütfen bildirmek istediğiniz sorunu yazın.');
    const r = await fetch('/api/krd-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sender, msg }) });
    if (r.ok) {
      document.getElementById('krdRepMsg').value = '';
      if (typeof toast === 'function') toast('📩 Sorun bildiriminiz yöneticiye iletildi!');
    } else alert('Gönderilemedi.');
  };

  function renderAll(force) {
    injectStyles();
    const st = getS();
    if (!st || !Array.isArray(st.teams) || !st.teams.length) return;
    const app = document.getElementById('app');
    if (!app) return;

    const ex = window._krdData.extras || {};

    // BAKIM MODU (Ziyaretcilere tam ekran kilit, yoneticiye acik)
    let maint = document.getElementById('krdMaintScreen');
    if (ex.maintenance && !isAdm()) {
      if (!maint) {
        maint = document.createElement('div');
        maint.id = 'krdMaintScreen';
        document.body.appendChild(maint);
      }
      maint.innerHTML = `<div style="font-size:44px;margin-bottom:10px;">🛠️</div><h2 style="margin:0 0 8px;color:#facc15;">KRD LİGİ BAKIMDA</h2><p style="max-width:380px;opacity:.85;font-size:14px;">${esc(ex.maintNote || 'Fikstür ve puan durumu güncelleniyor. Kısa süre sonra tekrar açılacaktır.')}</p>`;
      return;
    } else if (maint) {
      maint.remove();
    }

    if (isAdm()) return;

    const { table, streaks } = calcStats();
    const top3 = new Set(table.slice(0, 3).map(x => x.id));
    const tMap = Object.fromEntries(st.teams.map(t => [t.id, t.name]));

    // 1. SABIT DUYURU BANDI
    let ann = document.getElementById('krdPinnedAnn');
    if (ex.announcement || ex.mvp) {
      if (!ann) { ann = document.createElement('div'); ann.id = 'krdPinnedAnn'; app.prepend(ann); }
      ann.innerHTML = (ex.announcement ? `📌 <b>DUYURU:</b> ${esc(ex.announcement)}` : '') +
        (ex.announcement && ex.mvp ? ' &nbsp;|&nbsp; ' : '') +
        (ex.mvp ? `⭐ <b>Haftanın MVP Kulübü:</b> ${esc(ex.mvp)}` : '');
    } else if (ann) ann.remove();

    // Sohbet kilidi
    const cw = document.getElementById('krdChatWidget');
    if (cw) cw.style.display = ex.chatLocked ? 'none' : '';

    // 2. PUAN TABLOSUNA KULUP ARMASI + SIRA OKLARI + SERI ROZETI
    const tbl = app.querySelector('table:not(#krdSplitTableWrap table)');
    if (tbl) {
      tbl.querySelectorAll('tbody tr').forEach(tr => {
        const cell = tr.children[1] || tr.children[0];
        if (!cell || cell.dataset.krdDone) return;
        const tm = st.teams.find(t => (tr.textContent || '').toLowerCase().includes((t.name || '').toLowerCase()));
        if (!tm) return;
        cell.dataset.krdDone = '1';
        const b = (window._krdData.badges || {})[String(tm.id)] || {};
        const code = b.code || tm.name.replace(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]/g, '').slice(0, 3).toUpperCase();
        cell.insertAdjacentHTML('afterbegin', `<span class="krd-crest" style="background:${esc(b.color || '#1e293b')};">${esc(code)}</span>`);
        const sI = streaks[tm.id];
        if (sI && sI.delta > 0) cell.insertAdjacentHTML('beforeend', `<span class="krd-delta-up">▲${sI.delta}</span>`);
        else if (sI && sI.delta < 0) cell.insertAdjacentHTML('beforeend', `<span class="krd-delta-dn">▼${Math.abs(sI.delta)}</span>`);
        if (sI && sI.badge) cell.insertAdjacentHTML('beforeend', `<span class="krd-streak">${sI.badge}</span>`);
      });
    }

    // 3. ODUL PODYUMU
    const played = (st.matches || []).filter(m => m.played);
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

    // PNG Puan Tablosu Butonu
    const hubBody = document.querySelector('#krdLeagueHubDrawer .krd-hub-body');
    if (hubBody && !document.getElementById('krdPngTableBtn')) {
      const b = document.createElement('button'); b.id = 'krdPngTableBtn'; b.type = 'button'; b.className = 'pri';
      b.style.cssText = 'width:100%;font-size:12px;font-weight:800;';
      b.textContent = '📸 Puan Tablosu Afişi İndir (PNG)';
      b.onclick = window.krdStandingsPng;
      hubBody.appendChild(b);
    }

    // 4. RESMI KURALLAR KUTUSU (22 Kasim 2026)
    let rBox = document.getElementById('krdRulesBox');
    if (!rBox || force) {
      if (!rBox) {
        rBox = document.createElement('details'); rBox.id = 'krdRulesBox'; rBox.className = 'card krd-box-acc';
        const anc = document.getElementById('krdPodium') || tbl;
        if (anc && anc.parentNode) anc.parentNode.insertBefore(rBox, anc.nextSibling);
      }
      const txt = (ex.rules && ex.rules.trim()) ? ex.rules : DEFAULT_RULES;
      rBox.innerHTML = `<summary style="color:#fb923c;"><span>📜 Resmi Lig Kuralları & Cezalar</span><span style="font-size:11px;opacity:.85;">Kuralları Oku ▾</span></summary>
        <div style="margin-top:8px;display:grid;gap:6px;font-size:12px;">${txt.split('\n').filter(Boolean).map(l => `<div style="padding:6px 9px;border-radius:8px;background:rgba(2,6,23,.55);border:1px solid rgba(251,146,60,.22);">${esc(l)}</div>`).join('')}</div>`;
    }

    // 5. HAFTALIK SKOR TAHMINI
    let pBox = document.getElementById('krdPredictBox');
    if (!pBox || force) {
      if (!pBox) {
        pBox = document.createElement('details'); pBox.id = 'krdPredictBox'; pBox.className = 'card krd-box-acc';
        const anc = document.getElementById('krdRulesBox') || tbl;
        if (anc && anc.parentNode) anc.parentNode.insertBefore(pBox, anc.nextSibling);
      }
      const up = (st.matches || []).filter(m => !m.played).slice(0, 6);
      const nick = localStorage.getItem('krd_pred_nick') || '';
      const myP = (window._krdData.predictions || {})[nick] || {};
      pBox.innerHTML = `<summary style="color:#c084fc;"><span>🎯 Haftalık Skor Tahmini</span><span style="font-size:11px;opacity:.85;">Tahmin Yap ▾</span></summary>
        <div style="margin-top:8px;display:grid;gap:7px;">
          <input type="text" id="krdPredNick" value="${esc(nick)}" placeholder="Adınız / Lakabınız" style="padding:7px 10px;border-radius:9px;border:1px solid rgba(192,132,252,.4);background:#020617;color:#fff;font-size:12px;">
          ${up.length ? up.map(m => {
            const o = myP[String(m.id)];
            return `<div class="krd-pred-line"><span style="text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(tMap[m.home_id] || 'Ev')}</span><input type="number" id="phs_${m.id}" value="${o ? o.hs : ''}" placeholder="0"><span>-</span><input type="number" id="paws_${m.id}" value="${o ? o.aws : ''}" placeholder="0"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(tMap[m.away_id] || 'Dep')}</span><button type="button" onclick="window.krdSendPredict(${m.id})" style="padding:4px 8px;font-size:11px;">${o ? '✓' : 'Kaydet'}</button></div>`;
          }).join('') : '<div class="mut" style="font-size:12px;">Tahmin yapılacak maç yok.</div>'}
        </div>`;
    }

    // 6. SORUN / HATA BILDIR KUTUSU (Dogrudan Yonetici Paneline Duser)
    if (!document.getElementById('krdReportBox')) {
      const rep = document.createElement('details'); rep.id = 'krdReportBox'; rep.className = 'card krd-box-acc';
      rep.innerHTML = `<summary style="color:#f87171;"><span>🐞 Sorun / Hata Bildir (Yöneticiye İlet)</span><span style="font-size:11px;opacity:.85;">Mesaj Yaz ▾</span></summary>
        <div style="margin-top:8px;display:grid;gap:7px;">
          <input type="text" id="krdRepSender" placeholder="Adınız / Kulübünüz" style="padding:7px 10px;border-radius:8px;border:1px solid rgba(248,113,113,.35);background:#020617;color:#fff;font-size:12px;">
          <textarea id="krdRepMsg" rows="2" placeholder="Karşılaştığınız hatayı veya kural itirazını yazın..." style="padding:7px 10px;border-radius:8px;border:1px solid rgba(248,113,113,.35);background:#020617;color:#fff;font-size:12px;"></textarea>
          <button type="button" class="pri" onclick="window.krdSendReport()" style="background:#ef4444;color:#fff;">📩 Yöneticiye Gönder</button>
        </div>`;
      const anc = document.getElementById('krdPredictBox') || tbl;
      if (anc && anc.parentNode) anc.parentNode.insertBefore(rep, anc.nextSibling);
    }

    // 7. FIKSTUR KARTLARINA DERBI & TEK MAC PNG
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

  window.krdSaveAdminMaster = async function () {
    const st = getS() || {};
    const badges = {};
    (st.teams || []).forEach(t => {
      badges[String(t.id)] = {
        code: (document.getElementById('bc_' + t.id)?.value || '').trim().toUpperCase(),
        color: document.getElementById('bcol_' + t.id)?.value || '#2563eb'
      };
    });
    const ex = {
      announcement: document.getElementById('admAnn')?.value.trim() || '',
      mvp: document.getElementById('admMvp')?.value.trim() || '',
      maintenance: !!document.getElementById('admMaint')?.checked,
      maintNote: document.getElementById('admMaintNote')?.value.trim() || '',
      chatLocked: !!document.getElementById('admChatLock')?.checked,
      rules: document.getElementById('admRules')?.value.trim() || DEFAULT_RULES
    };
    await api('POST', '/api/krd-extras', ex);
    await api('POST', '/api/admin/krd-pro5-save', { badges });
    await pullAll();
    if (typeof toast === 'function') toast('✅ Duyuru, Bakım Modu, Kurallar ve Armalar kaydedildi!');
  };

  async function renderAdminPanel() {
    const st = getS();
    if (!isAdm() || !st) return;
    const app = document.getElementById('app');
    if (!app) return;
    const ok = app.querySelector('button') && (app.textContent || '').includes('Çıkış');
    if (!ok || document.getElementById('krdMasterAdmBox')) return;

    const ex = window._krdData.extras || {}, bMap = window._krdData.badges || {};
    const box = document.createElement('div'); box.id = 'krdMasterAdmBox'; box.className = 'krd-adm-box';
    box.innerHTML = `
      <b style="color:#facc15;font-size:14px;">⚙️ Duyuru Sabitleme, Bakım Modu, Kurallar & Gelen Sorunlar</b>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">
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

  pullAll().then(() => renderAll(false));
  setInterval(pullAll, 5000);
  setInterval(() => { renderAll(false); renderAdminPanel(); }, 1000);
})();
