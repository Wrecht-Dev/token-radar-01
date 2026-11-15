// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail drawer with the
// model's own inputs and the protocol's farm plan, the live-token view and the method tab.
// No network: every byte it shows is in data.js. The page recomputes each row's implied
// value from the snapshot figures and checks the number board.json carries, so the page's
// code and the board's data are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  var drawer = document.getElementById('drawer');
  if (!DATA || !app) return;
  var MODEL = DATA.model;

  var state = { q: '', category: 'all', chain: 'all', watchlist: false, sort: 'implied', dir: -1, page: 1, tab: 'board', selected: null };
  var PAGE_SIZE = 50;

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtUsdFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // The model in one function, from lib/model.ts: comps x growth x maturity.
  function impliedOf(row) {
    var growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * MODEL.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var maturity = MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.comp_ratio * growthMult * maturity));
  }

  function bySlug(slug) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i];
    return null;
  }
  // The watchlist slugs ride in data.js: the board's own flag for each row.
  var WATCHLIST = {};
  (DATA.watchlist || []).forEach(function (s) { WATCHLIST[s] = true; });

  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    if (html !== undefined && html !== null) node.innerHTML = html;
    return node;
  }

  /* ---------- header stats ---------- */
  function renderStats() {
    var vals = DATA.rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
    var median = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
    var top = DATA.rows[0];
    var stats = document.getElementById('stats');
    stats.innerHTML =
      '<div><dt>Board rows</dt><dd>' + DATA.board_size + '</dd></div>' +
      '<div><dt>Watchlist</dt><dd>' + DATA.watchlist_size + ' <small>covered</small></dd></div>' +
      '<div><dt>Early finds</dt><dd>' + DATA.early_size + ' <small>below the floor</small></dd></div>' +
      '<div><dt>Median implied</dt><dd>' + fmtUsd(median) + '</dd></div>' +
      '<div><dt>Top implied</dt><dd>' + fmtUsd(top ? top.implied_value_usd : 0) + '</dd></div>';
    var src = document.getElementById('source-line');
    if (src) src.textContent = 'Snapshot: ' + DATA.source + ' · Floor: ' + fmtUsdFull(DATA.floor_usd) + ' · ' + DATA.rows.length + ' pre-token protocols ranked · ' + DATA.live_size + ' live-token protocols shown separately · ' + DATA.excluded_size + ' wrapped, staked or bridged products set aside.';
  }

  /* ---------- routing ---------- */
  function parseHash() {
    var raw = window.location.hash || '#/board';
    var parts = raw.slice(2).split('?');
    var segments = (parts[0] || 'board').split('/');
    var path = segments[0] || 'board';
    var slug = segments[1] || null;
    var query = {};
    if (parts[1]) {
      parts[1].split('&').forEach(function (kv) {
        var p = kv.split('=');
        if (p[0]) query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
    }
    return { path: path, slug: slug, query: query };
  }
  function go(hash) {
    if (window.location.hash === hash) render();
    else window.location.hash = hash;
  }
  function boardHash() {
    var q = [];
    if (state.q) q.push('q=' + encodeURIComponent(state.q));
    if (state.category !== 'all') q.push('category=' + encodeURIComponent(state.category));
    if (state.chain !== 'all') q.push('chain=' + encodeURIComponent(state.chain));
    if (state.watchlist) q.push('watchlist=1');
    if (state.sort !== 'implied') q.push('sort=' + state.sort);
    if (state.page > 1) q.push('page=' + state.page);
    return '#/board' + (q.length ? '?' + q.join('&') : '');
  }

  /* ---------- filtering & sorting ---------- */
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watchlist && !WATCHLIST[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var d = 0;
      if (key === 'implied') d = a.implied_value_usd - b.implied_value_usd;
      else if (key === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (key === 'growth') d = (a.change_7d || 0) - (b.change_7d || 0);
      else if (key === 'age') d = (a.age_days === null ? -1 : a.age_days) - (b.age_days === null ? -1 : b.age_days);
      else if (key === 'name') d = a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      return d * state.dir;
    });
    return rows;
  }

  /* ---------- board view ---------- */
  function renderBoard() {
    var cats = {};
    var chains = {};
    DATA.rows.forEach(function (r) {
      cats[r.category || 'Uncategorised'] = true;
      r.chains.forEach(function (c) { chains[c] = true; });
    });
    var catOpts = ['<option value="all">All categories</option>'].concat(Object.keys(cats).sort().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    })).join('');
    var chainOpts = ['<option value="all">All chains</option>'].concat(Object.keys(chains).sort().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    })).join('');

    var rows = filteredRows();
    var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    var pageRows = rows.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    var maxImplied = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;

    var head =
      '<p class="lede">The board ranks <strong>' + DATA.board_size + ' protocols that record no token</strong> — all ' + DATA.watchlist_size + ' of the snapshot&rsquo;s watchlist, plus ' + DATA.early_size + ' early ones below the $50M floor. Implied value is TVL priced off live-token comparables in the same category, adjusted for seven-day growth and for how long the protocol has run with no token. Click any row for its model and farm plan.</p>' +
      '<div class="filters">' +
      '<div class="field"><label for="f-q">Search</label><input id="f-q" type="search" placeholder="Name or slug…" value="' + esc(state.q) + '"></div>' +
      '<div class="field"><label for="f-cat">Category</label><select id="f-cat">' + catOpts + '</select></div>' +
      '<div class="field"><label for="f-chain">Chain</label><select id="f-chain">' + chainOpts + '</select></div>' +
      '<div class="field"><label for="f-sort">Sort by</label><select id="f-sort">' +
      '<option value="implied"' + (state.sort === 'implied' ? ' selected' : '') + '>Implied value</option>' +
      '<option value="tvl"' + (state.sort === 'tvl' ? ' selected' : '') + '>TVL</option>' +
      '<option value="growth"' + (state.sort === 'growth' ? ' selected' : '') + '>7-day growth</option>' +
      '<option value="age"' + (state.sort === 'age' ? ' selected' : '') + '>Age with no token</option>' +
      '<option value="name"' + (state.sort === 'name' ? ' selected' : '') + '>Name</option>' +
      '</select></div>' +
      '<label class="field check"><input id="f-wl" type="checkbox"' + (state.watchlist ? ' checked' : '') + '> Watchlist only</label>' +
      '<span class="result-line"><strong>' + rows.length + '</strong> of ' + DATA.board_size + ' rows</span>' +
      '</div>';

    var body = pageRows.map(function (r) {
      var wl = WATCHLIST[r.slug];
      var pct = r.change_7d;
      var pctCls = pct === null ? '' : pct >= 0 ? 'up' : 'down';
      var barW = Math.max(4, Math.round((r.implied_value_usd / maxImplied) * 120));
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="selected"' : '') + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td class="namecell">' + esc(r.name) + (wl ? '<span class="badge">Watchlist</span>' : '<span class="badge early">Early</span>') +
        '<span class="sub">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ') || '—') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + pctCls + '">' + fmtPct(pct) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num"><span class="bar" style="width:' + barW + 'px"></span>' + fmtUsd(r.implied_value_usd) + '</td>' +
        '</tr>';
    }).join('');
    if (!pageRows.length) body = '<tr><td colspan="8" class="empty">No protocols match these filters. Loosen the search or clear the watchlist filter.</td></tr>';

    var table =
      '<div class="table-wrap"><table><thead><tr>' +
      '<th>#</th><th>Protocol</th><th>Category</th><th>Chains</th>' +
      '<th style="text-align:right">TVL</th><th style="text-align:right">7d</th><th style="text-align:right">Age</th><th style="text-align:right">Implied value</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<div class="pager"><button id="pg-prev"' + (state.page <= 1 ? ' disabled' : '') + '>← Previous</button>' +
      '<span>Page ' + state.page + ' of ' + pages + '</span>' +
      '<button id="pg-next"' + (state.page >= pages ? ' disabled' : '') + '>Next →</button></div>';

    app.innerHTML = head + table;
    app.setAttribute('aria-busy', 'false');

    document.getElementById('f-q').addEventListener('input', function (e) { state.q = e.target.value; state.page = 1; refreshBoard(false); });
    document.getElementById('f-cat').addEventListener('change', function (e) { state.category = e.target.value; state.page = 1; go(boardHash()); });
    document.getElementById('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; state.page = 1; go(boardHash()); });
    document.getElementById('f-sort').addEventListener('change', function (e) {
      state.sort = e.target.value;
      state.dir = state.sort === 'name' ? 1 : -1;
      state.page = 1; go(boardHash());
    });
    document.getElementById('f-wl').addEventListener('change', function (e) { state.watchlist = e.target.checked; state.page = 1; go(boardHash()); });
    var prev = document.getElementById('pg-prev');
    var next = document.getElementById('pg-next');
    if (prev) prev.addEventListener('click', function () { if (state.page > 1) { state.page--; go(boardHash()); } });
    if (next) next.addEventListener('click', function () { state.page++; go(boardHash()); });
    app.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { go('#/protocol/' + tr.getAttribute('data-slug')); });
    });
  }

  // Re-render the board without pushing a new hash (live search typing).
  function refreshBoard(push) {
    var keepScroll = window.scrollY;
    renderBoard();
    window.scrollTo(0, keepScroll);
    if (push) go(boardHash());
  }

  /* ---------- detail drawer ---------- */
  function parseStep(s) {
    var ci = s.indexOf(' Cost: ');
    var ti = s.indexOf(' Time: ');
    if (ci === -1 || ti === -1 || ti < ci) return { text: s, cost: null, time: null };
    var time = s.slice(ti + 7).replace(/\.$/, '');
    return { text: s.slice(0, ci), cost: s.slice(ci + 7, ti), time: time };
  }

  function renderDetail(slug) {
    var row = bySlug(slug);
    if (!row) { drawer.hidden = true; drawer.innerHTML = ''; return; }
    state.selected = slug;
    var recomputed = impliedOf(row);
    var match = recomputed === row.implied_value_usd;
    var compLabel = row.comp_n > 0
      ? row.comp_category + ' (' + row.comp_n + ' live comparables)'
      : 'all live-token protocols (no category comps)';
    var steps = row.farm_steps.map(function (s) {
      var p = parseStep(s);
      var chips = '';
      if (p.cost) chips += '<span class="chip">Cost: ' + esc(p.cost) + '</span>';
      if (p.time) chips += '<span class="chip">Time: ' + esc(p.time) + '</span>';
      return '<li>' + esc(p.text) + '<span class="chips">' + chips + '</span></li>';
    }).join('');

    drawer.innerHTML =
      '<button class="close" id="d-close" aria-label="Close detail">✕</button>' +
      '<h2>' + esc(row.name) + '</h2>' +
      '<p class="meta">Rank <b>#' + row.rank + '</b> · ' + esc(row.category || 'Uncategorised') + ' · ' + esc(row.chains.join(', ') || '—') +
      (WATCHLIST[row.slug] ? ' · <b>On the watchlist</b>' : ' · Early find, below the $50M floor') + '</p>' +
      '<div class="big-value">' + fmtUsdFull(row.implied_value_usd) + '</div>' +
      '<div class="big-label">Implied value if it launched today</div>' +
      '<table class="math"><tbody>' +
      '<tr><td>TVL</td><td>' + fmtUsdFull(row.tvl_usd) + '</td></tr>' +
      '<tr><td>Comparables: ' + esc(compLabel) + '</td><td>× ' + row.comp_ratio.toFixed(2) + '</td></tr>' +
      '<tr><td>Seven-day TVL change</td><td>' + fmtPct(row.change_7d) + ' → × ' + row.growth_multiplier.toFixed(2) + '</td></tr>' +
      '<tr><td>Time running with no token</td><td>' + fmtAge(row.age_days) + ' → × ' + row.maturity_multiplier.toFixed(2) + '</td></tr>' +
      '<tr><td>Page recomputes from the same figures</td><td>' + fmtUsdFull(recomputed) + (match ? ' ✓' : ' — differs') + '</td></tr>' +
      '</tbody></table>' +
      '<h3 class="section-title">How to farm it</h3>' +
      '<ol class="steps">' + steps + '</ol>' +
      '<p class="note"><b>Read this first:</b> ' + esc(row.name) + ' records no token in the snapshot — that is not proof it has none, and it is not a promise one will launch. Farm only with money you can afford to lose, never pay anyone to claim an airdrop, and claim only from links the protocol itself publishes.</p>';
    drawer.hidden = false;
    document.getElementById('d-close').addEventListener('click', function () { go(boardHash()); });
  }

  function closeDetail() {
    drawer.hidden = true;
    drawer.innerHTML = '';
    state.selected = null;
  }

  /* ---------- live view ---------- */
  function renderLive() {
    var cards = DATA.live.map(function (p) {
      var ratio = p.tvl_usd > 0 && p.mcap_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) : 'n/a';
      return '<article class="card"><h3>' + esc(p.name) + '</h3>' +
        '<div class="mcap">' + fmtUsdFull(p.mcap_usd) + '</div>' +
        '<p>Market cap, as the market prices it — not a model.</p>' +
        '<p><b>TVL</b> ' + fmtUsd(p.tvl_usd) + ' · <b>7d</b> <span class="' + (p.change_7d === null ? '' : p.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(p.change_7d) + '</span></p>' +
        '<p><b>Category</b> ' + esc(p.category || '—') + ' · <b>Chains</b> ' + esc(p.chains.slice(0, 3).join(', ') || '—') + '</p>' +
        '<p><b>Market cap / TVL</b> ' + ratio + ' — one of the comparables the board is priced off.</p></article>';
    }).join('');
    app.innerHTML =
      '<p class="lede">These <strong>' + DATA.live_size + ' protocols already have a token that trades</strong>, so they are not launches to farm. They are shown because they are the board&rsquo;s price reference: each category&rsquo;s implied values are priced off the median market-cap / TVL of the live tokens in that category.</p>' +
      '<div class="cards">' + cards + '</div>';
    app.setAttribute('aria-busy', 'false');
  }

  /* ---------- method view ---------- */
  function renderMethod() {
    var compRows = DATA.comps.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td>' + c.n + ' comparables</td><td>' + c.ratio.toFixed(2) + '</td></tr>';
    }).join('');
    var excluded = DATA.excluded.slice(0, 12).map(function (p) {
      return '<tr><td>' + esc(p.name) + '</td><td>' + fmtUsd(p.tvl_usd) + '</td><td>' + esc(p.reason) + '</td></tr>';
    }).join('');
    app.innerHTML =
      '<div class="method-block"><h2>The model, in one line</h2>' +
      '<p class="formula">implied value = TVL × category comp ratio × growth multiplier × maturity multiplier</p>' +
      '<p><b>Comps.</b> The market&rsquo;s own price for a dollar of TVL in the protocol&rsquo;s category: the median market-cap / TVL of the live-token protocols in that category (at least 3 comparables, otherwise the median across all live tokens), capped at 2.00.</p>' +
      '<p><b>Growth.</b> The protocol&rsquo;s seven-day TVL change, clamped to −60%…+120%, at half weight: <code>1 + growth / 100 × 0.5</code>.</p>' +
      '<p><b>Maturity.</b> How long it has run with no token: <code>0.60 + min(age, 1095) / 1095 × 0.40</code>. Age unknown counts as 365 days.</p>' +
      '<p>Nothing is hard-coded by name. The same function scores every row, and the detail view shows each row&rsquo;s own inputs — including the page recomputing the number from the snapshot figures, so the code and the board agree.</p></div>' +
      '<div class="method-block"><h2>Comparables by category</h2>' +
      '<table class="comps"><thead><tr><th>Category</th><th>Comparables</th><th style="text-align:right">Median mcap / TVL</th></tr></thead><tbody>' + compRows + '</tbody></table>' +
      '<p>Categories with fewer than 3 live-token comparables use the global median, <code>' + DATA.global_comp_ratio.toFixed(2) + '</code>.</p></div>' +
      '<div class="method-block"><h2>What the board leaves out, and why</h2>' +
      '<p>The watchlist is the floor, never the ceiling: the board ranks all ' + DATA.watchlist_size + ' of it, plus ' + DATA.early_size + ' pre-token protocols below the $50M floor. These ' + DATA.excluded_size + ' record no token but are not launches — a wrapped, staked or bridged product of a token that already trades, a versioned pool, or an exchange&rsquo;s own product. The largest twelve:</p>' +
      '<table class="comps"><thead><tr><th>Protocol</th><th>TVL</th><th>Reason set aside</th></tr></thead><tbody>' + excluded + '</tbody></table></div>' +
      '<div class="method-block"><h2>What this radar does not claim</h2>' +
      '<p>A protocol that <b>records no token</b> may still have one its DefiLlama record does not carry. An implied value is what a token would be worth <b>if the protocol&rsquo;s record stayed as it is</b> — it does not predict whether or when a token is issued. Farm plans are generic steps derived from the protocol&rsquo;s category, chains, TVL and age; check the protocol&rsquo;s own pages before acting on them.</p>' +
      '<p>Data: ' + esc(DATA.source) + ' · ' + DATA.rows.length + ' protocols ranked, ' + DATA.live_size + ' live tokens shown, ' + DATA.excluded_size + ' set aside · Model ' + esc(DATA.model_version) + '.</p></div>';
    app.setAttribute('aria-busy', 'false');
  }

  /* ---------- render ---------- */
  function render() {
    var route = parseHash();
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === (route.path === 'protocol' ? 'board' : route.path));
    });
    if (route.path === 'protocol') {
      state.tab = 'board';
      state.page = 1;
      renderBoard();
      renderDetail(route.slug ? decodeURIComponent(route.slug) : '');
      return;
    }
    closeDetail();
    if (route.path === 'live') { state.tab = 'live'; renderLive(); return; }
    if (route.path === 'method') { state.tab = 'method'; renderMethod(); return; }
    state.tab = 'board';
    var q = route.query;
    state.q = q.q || '';
    state.category = q.category || 'all';
    state.chain = q.chain || 'all';
    state.watchlist = q.watchlist === '1';
    state.sort = q.sort || 'implied';
    state.dir = state.sort === 'name' ? 1 : -1;
    state.page = Math.max(1, parseInt(q.page || '1', 10) || 1);
    renderBoard();
  }

  renderStats();
  window.addEventListener('hashchange', render);
  render();
})();
