(function () {

  // === KRD_UNIFIED_STYLE_START ===
  function injectUnifiedLayoutCss() {
    let st = document.getElementById('krdUnifiedLayoutCss');
    if (!st) {
      st = document.createElement('style');
      st.id = 'krdUnifiedLayoutCss';
      document.head.appendChild(st);
    }
    st.textContent = `
      html { overflow-anchor: none; }
      #krdPinnedAnn {
        box-sizing: border-box !important;
        width: calc(100% - 24px) !important; max-width: 960px !important;
        margin: 8px auto 6px !important; padding: 10px 14px !important; border-radius: 12px !important;
        background: linear-gradient(90deg, rgba(234,88,12,.28), rgba(250,204,21,.2)) !important;
        border: 1.5px solid rgba(250,204,21,.55) !important; color: #fef08a !important;
        font-size: 13px !important; font-weight: 700 !important; text-align: left !important;
      }
      #krdNavTabs {
        box-sizing: border-box !important;
        position: sticky !important; top: 8px !important; z-index: 950 !important;
        width: calc(100% - 24px) !important; max-width: 960px !important;
        margin: 8px auto 12px !important;
        display: flex !important; align-items: center !important; gap: 6px !important;
        overflow-x: auto !important; scrollbar-width: none !important;
        padding: 7px 8px !important; border-radius: 14px !important;
        background: #0b1120 !important;
        border: 1px solid rgba(56, 189, 248, 0.42) !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6) !important;
      }
      #krdNavTabs::-webkit-scrollbar { display: none; }
      #krdNavTabs * { box-sizing: border-box !important; min-width: 0 !important; }
      .krd-tab-btn {
        flex: 0 0 auto !important; padding: 8px 13px !important; border-radius: 10px !important;
        font-size: 12px !important; font-weight: 800 !important; cursor: pointer !important;
        border: 1px solid rgba(148, 163, 184, 0.25) !important;
        background: #131c31 !important; color: #cbd5e1 !important;
        white-space: nowrap !important; user-select: none !important; margin: 0 !important;
      }
      .krd-tab-btn.active {
        background: linear-gradient(135deg, #0284c7, #2563eb) !important;
        color: #fff !important; border-color: #38bdf8 !important;
      }
      #krdDedicatedView {
        box-sizing: border-box !important;
        width: calc(100% - 24px) !important; max-width: 960px !important;
        margin: 10px auto 18px !important;
        display: grid !important; gap: 12px !important;
      }
      #krdDedicatedView * { box-sizing: border-box !important; min-width: 0 !important; }
      .krd-clean-card {
        background: rgba(15, 23, 42, 0.94) !important;
        border: 1px solid rgba(148, 163, 184, 0.24) !important;
        border-radius: 14px !important; padding: 14px 16px !important;
        display: grid !important; gap: 10px !important; text-align: left !important;
      }
      .krd-adm-box, #krdMasterAdmBox {
        box-sizing: border-box !important;
        width: 100% !important; max-width: 960px !important;
        margin: 16px auto !important;
        background: rgba(15, 23, 42, 0.96) !important;
        border: 1.5px solid rgba(250, 204, 21, 0.42) !important;
        border-radius: 14px !important; padding: 15px 16px !important;
        display: grid !important; gap: 11px !important;
        text-align: left !important; overflow-x: hidden !important;
      }
      #krdMasterAdmBox * { box-sizing: border-box !important; min-width: 0 !important; }
      #krdMasterAdmBox input[type="text"], #krdMasterAdmBox textarea {
        width: 100% !important;
      }
    `;
  }
  injectUnifiedLayoutCss();
  // === KRD_UNIFIED_STYLE_END ===

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  // Bildirim ve push rotalarina dokunmadan sadece lig verisini yakala
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
        origFetch('/api/krd-extras?_=' + Date.now()),
        origFetch('/api/krd-mega-data?_=' + Date.now()),
        origFetch('/api/krd-pro5-data?_=' + Date.now())
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
      #krdPinnedAnn {
        box-sizing: border-box;
        width: calc(100% - 24px); max-width: 960px;
        margin: 8px auto 6px; padding: 10px 14px; border-radius: 12px;
        background: linear-gradient(90deg, rgba(234,88,12,.28), rgba(250,204,21,.2));
        border: 1.5px solid rgba(250,204,21,.55); color: #fef08a;
        font-size: 13px; font-weight: 700; text-align: left;
      }
      #krdNavTabs {
        box-sizing: border-box;
        position: sticky; top: 8px; z-index: 950;
        width: calc(100% - 24px); max-width: 960px;
        margin: 8px auto 12px;
        display: flex; align-items: center; gap: 6px;
        overflow-x: auto; scrollbar-width: none;
        padding: 7px 8px; border-radius: 14px;
        background: #0b1120;
        border: 1px solid rgba(56, 189, 248, 0.42);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      }
      #krdNavTabs::-webkit-scrollbar { display: none; }
      .krd-tab-btn {
        box-sizing: border-box;
        flex: 0 0 auto; padding: 8px 13px; border-radius: 10px;
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
        box-sizing: border-box;
        width: calc(100% - 24px); max-width: 960px;
        margin: 10px auto 18px;
        display: grid; gap: 12px;
      }
      .krd-clean-card {
        background: rgba(15, 23, 42, 0.94);
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 14px; padding: 14px 16px;
        display: grid; gap: 10px;
      }
      .krd-form-dots { display: inline-flex; gap: 3px; margin-left: 6px; vertical-align: middle; }
      .krd-dot {
        width: 15px; height: 15px; border-radius: 4px; font-size: 9px; font-weight: 900;
        display: inline-flex; align-items: center; justify-content: center; color: #fff;
      }
      .krd-dot-G { background: #16a34a; }
      .krd-dot-B { background: #ca8a04; }
      .krd-dot-M { background: #dc2626; }
      .krd-h2h-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; }
      .krd-h2h-grid select {
        padding: 8px; border-radius: 9px; border: 1px solid #334155;
        background: #020617; color: #fff; font-size: 12.5px; font-weight: 700;
      }
      .krd-tab-hidden { display: none !important; }
    `;
    document.head.appendChild(st);
  }

  // #app disinda sabit duran Ust Menu ve Duyuru Bandini olustur (asla silinmez)
  function ensurePersistentChrome() {
    const app = document.getElementById('app');
    if (!app || !app.parentNode) return;

    if (isAdm()) {
      document.getElementById('krdNavTabs')?.remove();
      document.getElementById('krdDedicatedView')?.remove();
      document.getElementById('krdPinnedAnn')?.remove();
      return;
    }

    injectTabStyles();
    const ex = (window._krdData && window._krdData.extras) || {};

    // Duyuru Bandi (#app hemen ustunde)
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

    // Sabit Sekme Cubugu (#app hemen ustunde, bu yuzden #app yenilense bile silinmez)
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

  // Son 5 mac form baloncuklarini puan tablosuna ekle
  function enrichFormBadges() {
    const tblCheck = document.querySelector('#app table:not(#krdSplitTableWrap table) tbody tr td');
    if (tblCheck && tblCheck.dataset.krdFormDone) return;
    const st = getS();
    const app = document.getElementById('app');
    if (!st || !app || isAdm()) return;
    const tbl = app.querySelector('table:not(#krdSplitTableWrap table)');
    if (!tbl) return;
    const played = (st.matches || []).filter(m => m.played).sort((a, b) => (+a.week - +b.week) || (+a.id - +b.id));

    tbl.querySelectorAll('tbody tr').forEach(tr => {
      const cell = tr.children[1] || tr.children[0];
      if (!cell || cell.dataset.krdFormDone) return;
      const tm = (st.teams || []).find(t => (tr.textContent || '').toLowerCase().includes((t.name || '').toLowerCase()));
      if (!tm) return;
      cell.dataset.krdFormDone = '1';

      const last5 = played.filter(m => m.home_id === tm.id || m.away_id === tm.id).slice(-5);
      if (!last5.length) return;
      const dots = last5.map(m => {
        const gf = m.home_id === tm.id ? +m.hs : +m.aws;
        const ga = m.home_id === tm.id ? +m.aws : +m.hs;
        const res = gf > ga ? 'G' : gf < ga ? 'M' : 'B';
        return `<span class="krd-dot krd-dot-${res}" title="Hafta ${m.week}: ${m.hs}-${m.aws}">${res}</span>`;
      }).join('');
      cell.insertAdjacentHTML('beforeend', `<span class="krd-form-dots">${dots}</span>`);
    });
  }

  // Iki Takim Kafa Kafaya (H2H) Karsilastirma Hesabi
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

      // Canli Tahmin Liderlik Tablosu
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

  window.krdSwitchTab = function (tab) {
    window._krdActiveTab = tab;
    document.querySelectorAll('.krd-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    syncView(true);
  };

  function filterAppChildren() {
    const app = document.getElementById('app');
    if (!app || isAdm()) return;
    const tab = window._krdActiveTab || 'all';
    const hideExtras = new Set(['krdRulesBox', 'krdReportBox', 'krdPredictBox', 'krdSuperCupBox']);

    Array.from(app.children).forEach(el => {
      const id = el.id || '';
      if (tab === 'predict' || tab === 'rules') {
        el.classList.add('krd-tab-hidden');
        return;
      }
      if (tab === 'all') {
        el.classList.remove('krd-tab-hidden');
        return;
      }

      const txt = (el.textContent || '').toLowerCase();
      const hasTable = Boolean(el.querySelector('table')) || el.tagName === 'TABLE';
      const hasGrid = el.classList.contains('grid') || Boolean(el.querySelector('.grid'));

      let group = 'table';
      if (hideExtras.has(id)) {
        group = 'extra';
      } else if (
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

  function syncView(rebuildDedicated) {
    if (_isApplying) return;
    _isApplying = true;
    try {
      ensurePersistentChrome();
      if (isAdm()) {
        renderAdminPanel();
      } else {
        renderAll(false);
        enrichFormBadges();
        filterAppChildren();
        if (rebuildDedicated) buildDedicatedPanels();
      }
    } finally {
      _isApplying = false;
    }
  }

  // #app icerigi sunucudan veya skordan dolayi yeniden cizilirse aninda yakala (menuler asla kaybolmaz)
  function attachAppObserver() {
    const app = document.getElementById('app');
    if (!app || app.dataset.krdObs) return;
    app.dataset.krdObs = '1';
    let _obsTimer = null;
    const obs = new MutationObserver(() => {
      if (_isApplying) return;
      clearTimeout(_obsTimer);
      _obsTimer = setTimeout(() => syncView(false), 180);
    });
    obs.observe(app, { childList: true });
  }

  pullAll().then(() => {
    attachAppObserver();
    syncView(true);
  });
  window.addEventListener('hashchange', () => setTimeout(() => { attachAppObserver(); syncView(true); }, 80));
  setTimeout(() => { attachAppObserver(); syncView(true); }, 500);
  // === KRD_SECTIONS_END ===
})();
