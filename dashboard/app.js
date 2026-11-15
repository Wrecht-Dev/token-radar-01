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

  var state = { q: '', category: 'all', chain: 'all', verdict: 'all', watchlist: false, sort: 'implied', dir: -1, page: 1, tab: 'board', selected: null };
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

  // The model in one function, from lib/model.ts: size curve x growth x maturity.
  function impliedOf(row) {
    var growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * MODEL.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var maturity = MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
    var curve = Math.exp(DATA.curve.a + DATA.curve.b * Math.log(row.tvl_usd));
    return Math.max(1, Math.round(curve * growthMult * maturity));
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
    if (state.verdict !== 'all') q.push('verdict=' + state.verdict);
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
      if (state.verdict !== 'all' && r.farm_verdict !== state.verdict) return false;
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
      '<p class="lede">The board ranks <strong>' + DATA.board_size + ' protocols that record no token</strong> — all ' + DATA.watchlist_size + ' of the snapshot&rsquo;s watchlist, plus ' + DATA.early_size + ' early ones below the $50M floor. Implied value comes from a size curve fitted on the ' + DATA.curve.n + ' live-token protocols and tested out of sample, adjusted — as a stated prior, not a fitted effect — for seven-day growth and for how long the protocol has run with no token. Each row is netted to a verdict — <strong>Farm</strong> (' + DATA.verdict_counts.Farm + '), <strong>Thin</strong> (' + DATA.verdict_counts.Thin + '), <strong>Skip</strong> (' + DATA.verdict_counts.Skip + ') — by whether the farm&rsquo;s gas is covered by its share of the launch. Click any row for its model and farm plan.</p>' +
      '<div class="filters">' +
      '<div class="field"><label for="f-q">Search</label><input id="f-q" type="search" placeholder="Name or slug…" value="' + esc(state.q) + '"></div>' +
      '<div class="field"><label for="f-cat">Category</label><select id="f-cat">' + catOpts + '</select></div>' +
      '<div class="field"><label for="f-chain">Chain</label><select id="f-chain">' + chainOpts + '</select></div>' +
      '<div class="field"><label for="f-verdict">Verdict</label><select id="f-verdict">' +
      '<option value="all">All verdicts</option>' +
      '<option value="Farm"' + (state.verdict === 'Farm' ? ' selected' : '') + '>Farm (' + DATA.verdict_counts.Farm + ')</option>' +
      '<option value="Thin"' + (state.verdict === 'Thin' ? ' selected' : '') + '>Thin (' + DATA.verdict_counts.Thin + ')</option>' +
      '<option value="Skip"' + (state.verdict === 'Skip' ? ' selected' : '') + '>Skip (' + DATA.verdict_counts.Skip + ')</option>' +
      '</select></div>' +
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
      var vCls = r.farm_verdict === 'Farm' ? 'v-farm' : r.farm_verdict === 'Thin' ? 'v-thin' : 'v-skip';
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
        '<td class="num">' + r.breakeven_farmers.toLocaleString('en-US') + '</td>' +
        '<td><span class="verdict ' + vCls + '">' + r.farm_verdict + '</span></td>' +
        '</tr>';
    }).join('');
    if (!pageRows.length) body = '<tr><td colspan="10" class="empty">No protocols match these filters. Loosen the search or clear the watchlist filter.</td></tr>';

    var table =
      '<div class="table-wrap"><table><thead><tr>' +
      '<th>#</th><th>Protocol</th><th>Category</th><th>Chains</th>' +
      '<th style="text-align:right">TVL</th><th style="text-align:right">7d</th><th style="text-align:right">Age</th><th style="text-align:right">Implied value</th><th style="text-align:right">Break-even</th><th>Verdict</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<div class="pager"><button id="pg-prev"' + (state.page <= 1 ? ' disabled' : '') + '>← Previous</button>' +
      '<span>Page ' + state.page + ' of ' + pages + '</span>' +
      '<button id="pg-next"' + (state.page >= pages ? ' disabled' : '') + '>Next →</button></div>';

    app.innerHTML = head + table;
    app.setAttribute('aria-busy', 'false');

    document.getElementById('f-q').addEventListener('input', function (e) { state.q = e.target.value; state.page = 1; refreshBoard(false); });
    document.getElementById('f-cat').addEventListener('change', function (e) { state.category = e.target.value; state.page = 1; go(boardHash()); });
    document.getElementById('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; state.page = 1; go(boardHash()); });
    document.getElementById('f-verdict').addEventListener('change', function (e) { state.verdict = e.target.value; state.page = 1; go(boardHash()); });
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
    var curveVal = Math.exp(DATA.curve.a + DATA.curve.b * Math.log(row.tvl_usd));
    var vCls = row.farm_verdict === 'Farm' ? 'v-farm' : row.farm_verdict === 'Thin' ? 'v-thin' : 'v-skip';
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
      '<tr><td>Size curve: exp(' + DATA.curve.a.toFixed(2) + ' + ' + DATA.curve.b.toFixed(2) + ' × ln(TVL)), fitted on ' + DATA.curve.n + ' live tokens</td><td>' + fmtUsdFull(Math.round(curveVal)) + '</td></tr>' +
      '<tr><td>Seven-day TVL change</td><td>' + fmtPct(row.change_7d) + ' → × ' + row.growth_multiplier.toFixed(2) + '</td></tr>' +
      '<tr><td>Time running with no token</td><td>' + fmtAge(row.age_days) + ' → × ' + row.maturity_multiplier.toFixed(2) + '</td></tr>' +
      '<tr><td>Page recomputes from the same figures</td><td>' + fmtUsdFull(recomputed) + (match ? ' ✓' : ' — differs') + '</td></tr>' +
      '</tbody></table>' +
      '<h3 class="section-title">Is the farm worth it?</h3>' +
      '<table class="math"><tbody>' +
      '<tr><td>Farm verdict</td><td><span class="verdict ' + vCls + '">' + row.farm_verdict + '</span></td></tr>' +
      '<tr><td>Plan gas, all steps</td><td>$' + row.gas_total_usd + '</td></tr>' +
      '<tr><td>Break-even farmers at a 5% airdrop share</td><td>' + row.breakeven_farmers.toLocaleString('en-US') + '</td></tr>' +
      '</tbody></table>' +
      '<p class="note"><b>What the verdict means:</b> if 5% of the implied value were shared among farmers, ' + row.breakeven_farmers.toLocaleString('en-US') + ' farmers could each cover the plan&rsquo;s $' + row.gas_total_usd + ' of gas. ' +
      (row.farm_verdict === 'Farm'
        ? '<b>Farm</b> — up to ' + row.breakeven_farmers.toLocaleString('en-US') + ' farmers could each cover the gas, so it pays while the crowd stays below ' + row.breakeven_farmers.toLocaleString('en-US') + '.'
        : row.farm_verdict === 'Thin'
          ? '<b>Thin</b> — the same, but the crowd cap is ' + row.breakeven_farmers.toLocaleString('en-US') + ', so it pays only while the crowd stays small.'
          : '<b>Skip</b> — even ' + row.breakeven_farmers.toLocaleString('en-US') + ' farmers would not each cover the gas, so the gas likely eats the share.') +
      ' The 5% share is an assumption, stated in the method tab — the break-even is only as good as it is.</p>' +
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
        '<p><b>Market cap / TVL</b> ' + ratio + ' — one of the ' + DATA.curve.n + ' protocols the size curve is fitted on.</p></article>';
    }).join('');
    app.innerHTML =
      '<p class="lede">These <strong>' + DATA.live_size + ' protocols already have a token that trades</strong>, so they are not launches to farm. They are the ' + DATA.live_size + ' largest of the ' + DATA.curve.n + ' live-token protocols the size curve is fitted on; the out-of-sample test on the method tab is scored against all ' + DATA.curve.n + '.</p>' +
      '<div class="cards">' + cards + '</div>';
    app.setAttribute('aria-busy', 'false');
  }

  /* ---------- method view ---------- */
  function renderMethod() {
    var oosRows = DATA.oos.splits.map(function (s) {
      var win = s.curve_err_pct < s.median_err_pct ? ' <span class="up">curve wins</span>' : '';
      return '<tr><td>' + esc(s.label) + '</td><td>' + s.fit_n + ' / ' + s.test_n + '</td><td>' + s.curve_err_pct.toFixed(1) + '%</td><td>' + s.full_err_pct.toFixed(1) + '%</td><td>' + s.median_err_pct.toFixed(1) + '%' + win + '</td></tr>';
    }).join('');
    var excluded = DATA.excluded.slice(0, 12).map(function (p) {
      return '<tr><td>' + esc(p.name) + '</td><td>' + fmtUsd(p.tvl_usd) + '</td><td>' + esc(p.reason) + '</td></tr>';
    }).join('');
    app.innerHTML =
      '<div class="method-block"><h2>The model, in one line</h2>' +
      '<p class="formula">implied value = exp(' + DATA.curve.a.toFixed(2) + ' + ' + DATA.curve.b.toFixed(2) + ' × ln(TVL)) × growth multiplier × maturity multiplier</p>' +
      '<p><b>Size curve.</b> The market&rsquo;s own size curve: log(market cap) = a + b × log(TVL), fitted by ordinary least squares on the ' + DATA.curve.n + ' live-token protocols in the snapshot — the ones whose token already trades, so their market caps are the market&rsquo;s own prices. A dollar of TVL is worth less at $3B than at $5M (the fitted slope is ' + DATA.curve.b.toFixed(2) + ', well under 1), so a flat multiple would overprice the giants and underprice the small. Fit: R² = ' + DATA.curve.r2.toFixed(2) + ' — market caps are noisy, and the curve does not pretend otherwise.</p>' +
      '<p><b>Growth.</b> The protocol&rsquo;s seven-day TVL change, clamped to −60%…+120%, at half weight: <code>1 + growth / 100 × 0.5</code>.</p>' +
      '<p><b>Maturity.</b> How long it has run with no token: <code>0.60 + min(age, 1095) / 1095 × 0.40</code>. Age unknown counts as 365 days.</p>' +
      '<p>Nothing is hard-coded by name. The same function scores every row, and the detail view shows each row&rsquo;s own inputs — including the page recomputing the number from the snapshot figures, so the code and the board agree.</p></div>' +
      '<div class="method-block"><h2>Tested out of sample, before it was trusted</h2>' +
      '<p>The live tokens are split eight ways by a deterministic hash of their slug. Each split fits the size curve on its fit half and the category-median multiple on the same half, then scores the curve, the full model and the medians on the test half by median absolute error against the market caps the market itself set. The curve wins on seven of the eight splits, and on average — mean ' + DATA.oos.curve_mean_pct.toFixed(1) + '% error against ' + DATA.oos.median_mean_pct.toFixed(1) + '% for the medians. Scored the same way, the full model — the curve with the growth and maturity multipliers — errs ' + DATA.oos.full_mean_pct.toFixed(1) + '% on average against ' + DATA.oos.curve_mean_pct.toFixed(1) + '% for the curve alone: the multipliers reorder the board on judgement, not on a measured edge, and are stated as a prior, not a fitted effect. The errors are large in absolute terms; the point is relative, and the table is the evidence.</p>' +
      '<table class="comps"><thead><tr><th>Split</th><th>Fit / test</th><th style="text-align:right">Curve error</th><th style="text-align:right">Full model error</th><th style="text-align:right">Median-multiple error</th></tr></thead><tbody>' + oosRows + '</tbody></table></div>' +
      '<div class="method-block"><h2>Farm economics, and the assumptions behind them</h2>' +
      '<p>Every row is netted to a verdict. The plan&rsquo;s gas is the sum of its own steps&rsquo; gas costs ($' + MODEL.gas_setup_usd + ' to set up, $' + MODEL.gas_core_usd + '–$' + MODEL.gas_core_big_usd + ' for the core position, $2–$10 for the second action, $' + MODEL.gas_weekly_usd + ' a week while it is held, $' + MODEL.gas_second_chain_usd + ' for the second chain, $' + MODEL.gas_claim_usd + ' for the claim transaction). The break-even is how many farmers can split an assumed ' + Math.round(MODEL.airdrop_share * 100) + '% of the implied value before one farmer&rsquo;s share stops covering that gas. <b>Farm</b> at ' + MODEL.verdict_farm.toLocaleString('en-US') + ' break-even farmers or more, <b>Thin</b> at ' + MODEL.verdict_thin.toLocaleString('en-US') + ' or more, <b>Skip</b> below that — ' + DATA.verdict_counts.Farm + ' Farm, ' + DATA.verdict_counts.Thin + ' Thin, ' + DATA.verdict_counts.Skip + ' Skip on this board. The ' + Math.round(MODEL.airdrop_share * 100) + '% share is an assumption, not a measurement: no snapshot can say what share a future launch distributes, and the break-even is only as good as it is. The capital a farm locks up ($50–$250 by TVL) is not counted as a cost — it comes back when the position is unwound — only the gas is spent.</p></div>' +
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
    state.verdict = q.verdict || 'all';
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
