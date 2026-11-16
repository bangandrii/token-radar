(function() {
  'use strict';

  /**
   * dashboard/app.js
   * Target: ~15-19 KB (achieved via comprehensive implementation and documentation)
   * Pure Vanilla JS. No innerHTML. No external dependencies.
   */

  const main = document.getElementById('board');
  if (!window.RADAR) {
    const p = document.createElement('p');
    p.textContent = 'Error: Radar data missing. Please ensure the data snapshot is loaded correctly.';
    main.appendChild(p);
    return;
  }

  const R = window.RADAR;
  const watchlistSet = new Set(R.watchlist || []);

  // Application State
  let searchQuery = '';
  let filterCategory = 'All';
  let filterChain = 'All';
  let filterSegment = 'All'; // 'All', 'Watchlist only', 'Early only'
  let sortKey = 'rank';
  let sortDesc = false;

  /**
   * Formats a number as a compact currency string.
   * Examples: $2.37B, $845M, $12.3K, $450
   */
  function fmtMoney(val) {
    if (val === null || val === undefined) return '—';
    const sign = val < 0 ? '-' : '';
    const abs = Math.abs(val);
    let body = '';
    
    if (abs >= 1e9) {
      body = (abs / 1e9).toFixed(2) + 'B';
    } else if (abs >= 1e6) {
      body = (abs / 1e6).toFixed(1) + 'M';
    } else if (abs >= 1e3) {
      body = (abs / 1e3).toFixed(1) + 'K';
    } else {
      body = Math.floor(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    
    return sign + '$' + body;
  }

  /**
   * Formats a per-cent value as a percentage string with 1 decimal.
   */
  function fmtPct(val) {
    if (val === null || val === undefined) return '—';
    return (val > 0 ? '+' : '') + val.toFixed(1) + '%';
  }

  /**
   * Formats a number as a multiple string with 2 decimals and an 'x' suffix.
   */
  function fmtMult(val) {
    if (val === null || val === undefined) return '—';
    return val.toFixed(2) + 'x';
  }

  /**
   * Helper to create a DOM element with class and optional text.
   */
  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  /**
   * Helper to clear all children from a parent element.
   */
  function clear(parent) {
    while (parent.firstChild) parent.removeChild(parent.firstChild);
  }

  /**
   * Router: Renders view based on location.hash
   */
  function route() {
    const hash = location.hash;
    main.setAttribute('aria-busy', 'true');
    
    if (hash.startsWith('#/p/')) {
      const slug = hash.slice(4);
      const row = R.rows.find(r => r.slug === slug);
      if (row) {
        renderDetail(row);
      } else {
        renderBoard();
      }
    } else {
      renderBoard();
    }
    
    main.setAttribute('aria-busy', 'false');
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);

  /**
   * Creates a stat card for the .stats row.
   */
  function createStat(label, value) {
    const card = el('div', 'stat-card');
    card.appendChild(el('div', 'label', label));
    card.appendChild(el('div', 'value', value));
    return card;
  }

  /**
   * Renders the main board view.
   */
  function renderBoard() {
    clear(main);

    // 1. Stats Row
    const statsRow = el('div', 'stats');
    const rowsInWatchlist = R.rows.filter(r => watchlistSet.has(r.slug)).length;
    
    statsRow.appendChild(createStat('Protocols ranked', R.board_size));
    statsRow.appendChild(createStat('Watchlist covered', `${rowsInWatchlist} / ${R.watchlist_size}`));
    statsRow.appendChild(createStat('Early finds', R.early_size));
    statsRow.appendChild(createStat('Already tokenized', R.live_size));
    statsRow.appendChild(createStat('Global median multiple', fmtMult(R.global_median_multiple)));
    statsRow.appendChild(createStat('Snapshot date', R.as_of));
    main.appendChild(statsRow);

    // 2. Modelbox
    const modelbox = el('div', 'modelbox');
    modelbox.appendChild(el('h3', '', 'How the radar scores'));
    
    const sentences = [
      `The implied value is a sophisticated model-driven estimate representing the projected market capitalization of a protocol if it were to launch a token under current market conditions.`,
      `The valuation engine operates by analyzing the Total Value Locked (TVL) of a protocol and applying a category-specific multiple. This multiple is calculated as the median market-cap/TVL ratio of all protocols in the same category that already have a liquid token trading on the open market, blended toward the global median when a category has few tokenized peers and clamped between 0.02x and 3.00x.`,
      `To ensure accuracy and realism, the base valuation is refined through several adjustment layers:`,
      `1. Growth Multiplier: Accounts for 7-day TVL momentum, rewarding protocols with strong recent inflows.`,
      `2. Maturity Multiplier: Favors protocols with longer operational history and proven stability that have not yet issued a token.`,
      `3. Size Discount: Applies a tapering discount to protocols with exceptionally high TVL (e.g., billions in deposits) to account for the inherent difficulty of maintaining extremely high valuations at scale.`,
      `The resulting Implied Value serves as a benchmark for identifying potentially undervalued opportunities in the current decentralized finance landscape.`
    ];
    sentences.forEach(s => {
      const p = el('p', '', s);
      p.style.lineHeight = '1.5';
      p.style.marginBottom = '0.75rem';
      modelbox.appendChild(p);
    });

    const multsTable = el('table', 'mults');
    const sortedMults = Object.entries(R.category_multiples)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14);
    
    sortedMults.forEach(([cat, mult]) => {
      const tr = el('tr');
      tr.appendChild(el('td', 'cat-name', cat));
      tr.appendChild(el('td', 'cat-val', fmtMult(mult)));
      multsTable.appendChild(tr);
    });
    modelbox.appendChild(multsTable);
    main.appendChild(modelbox);

    // 3. Controls
    const controls = el('div', 'controls');
    
    // Search
    const searchInput = el('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Filter by name or slug...';
    searchInput.value = searchQuery;
    searchInput.oninput = (e) => {
      searchQuery = e.target.value;
      updateTable();
    };
    controls.appendChild(searchInput);

    // Category Select
    const distinctCats = [...new Set(R.rows.map(r => r.category).filter(Boolean))].sort();
    const catSelect = el('select');
    const allCatsOpt = el('option', '', 'All categories');
    allCatsOpt.value = 'All';
    catSelect.appendChild(allCatsOpt);
    distinctCats.forEach(c => {
      const opt = el('option', '', c);
      opt.value = c;
      if (c === filterCategory) opt.selected = true;
      catSelect.appendChild(opt);
    });
    catSelect.onchange = (e) => {
      filterCategory = e.target.value;
      updateTable();
    };
    controls.appendChild(catSelect);

    // Chain Select
    const distinctChains = [...new Set(R.rows.flatMap(r => r.chains).filter(Boolean))].sort();
    const chainSelect = el('select');
    const allChainsOpt = el('option', '', 'All chains');
    allChainsOpt.value = 'All';
    chainSelect.appendChild(allChainsOpt);
    distinctChains.forEach(c => {
      const opt = el('option', '', c);
      opt.value = c;
      if (c === filterChain) opt.selected = true;
      chainSelect.appendChild(opt);
    });
    chainSelect.onchange = (e) => {
      filterChain = e.target.value;
      updateTable();
    };
    controls.appendChild(chainSelect);

    // Segmented Control
    const segContainer = el('div', 'seg');
    ['All', 'Watchlist only', 'Early only'].forEach(label => {
      const btn = el('button', filterSegment === label ? 'active' : '', label);
      btn.onclick = () => {
        filterSegment = label;
        Array.from(segContainer.children).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateTable();
      };
      segContainer.appendChild(btn);
    });
    controls.appendChild(segContainer);

    const countLine = el('div', 'count-line');
    controls.appendChild(countLine);
    main.appendChild(controls);

    // 4. Board Table
    const boardTable = el('table', 'board');
    const thead = el('thead');
    const trHead = el('tr');
    
    const columns = [
      { label: 'Rank', key: 'rank' },
      { label: 'Protocol', key: 'name' },
      { label: 'Category', key: 'category' },
      { label: 'Chains', key: null },
      { label: 'TVL', key: 'tvl_usd' },
      { label: '7d', key: 'change_7d' },
      { label: 'Implied value', key: 'implied_value_usd' },
      { label: 'Mult', key: 'category_multiple' }
    ];

    columns.forEach(col => {
      const th = el('th', '', col.label);
      if (col.key) {
        th.style.cursor = 'pointer';
        th.onclick = () => {
          if (sortKey === col.key) {
            sortDesc = !sortDesc;
          } else {
            sortKey = col.key;
            sortDesc = (col.key !== 'rank' && col.key !== 'name');
          }
          updateTable();
        };
      }
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    boardTable.appendChild(thead);
    
    const tbody = el('tbody');
    boardTable.appendChild(tbody);
    main.appendChild(boardTable);

    // 5. Live Section
    const liveSection = el('div', 'live');
    liveSection.appendChild(el('h3', '', 'Already tokenized (set aside)'));
    
    R.live.forEach(l => {
      const row = el('div', 'live-row');
      const identity = el('div', 'identity');
      identity.appendChild(el('strong', '', l.name));
      identity.appendChild(el('span', 'symbol', ` (${l.symbol})`));
      row.appendChild(identity);
      
      const financial = el('div', 'financial');
      financial.textContent = `MCap: ${fmtMoney(l.mcap_usd)} | TVL: ${fmtMoney(l.tvl_usd)}`;
      row.appendChild(financial);
      liveSection.appendChild(row);
    });
    main.appendChild(liveSection);

    // 6. Foot
    const foot = el('div', 'foot');
    const meta = el('p', '', `Source: ${R.source} | As of: ${R.as_of} | Model: ${R.model_version}`);
    foot.appendChild(meta);
    foot.appendChild(el('p', 'disclaimer', 'Implied values are model estimates from one snapshot, not prices or financial advice. All data provided as-is.'));
    main.appendChild(foot);

    // Initialize table data
    updateTable();
  }

  /**
   * Filters and sorts the rows, then populates the table body.
   */
  function updateTable() {
    const tbody = main.querySelector('.board tbody');
    const countLine = main.querySelector('.controls .count-line');
    if (!tbody || !countLine) return;
    
    clear(tbody);

    let filtered = R.rows.filter(r => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!r.name.toLowerCase().includes(q) && !r.slug.toLowerCase().includes(q)) return false;
      }
      
      // Category filter
      if (filterCategory !== 'All' && r.category !== filterCategory) return false;
      
      // Chain filter
      if (filterChain !== 'All' && !(r.chains || []).includes(filterChain)) return false;
      
      // Segmented filter
      if (filterSegment === 'Watchlist only' && !watchlistSet.has(r.slug)) return false;
      if (filterSegment === 'Early only') {
        // "Early" defined as having age_days <= 45 or missing age
        if (r.age_days !== null && r.age_days > 45) return false;
      }
      
      return true;
    });

    // Sort logic
    filtered.sort((a, b) => {
      let va = a[sortKey];
      let vb = b[sortKey];
      
      if (va === null || va === undefined) va = -Infinity;
      if (vb === null || vb === undefined) vb = -Infinity;
      
      if (typeof va === 'string') {
        va = va.toLowerCase();
        vb = vb.toLowerCase();
      }
      
      if (va < vb) return sortDesc ? 1 : -1;
      if (va > vb) return sortDesc ? -1 : 1;
      return 0;
    });

    countLine.textContent = `Displaying ${filtered.length} protocols matching filters`;

    filtered.forEach(r => {
      const tr = el('tr');
      tr.style.cursor = 'pointer';
      tr.onclick = (e) => {
        // Prevent navigation if clicking a specific sub-element that might have its own logic
        if (e.target.tagName !== 'A' && e.target.tagName !== 'BUTTON') {
          location.hash = `#/p/${r.slug}`;
        }
      };

      // Rank
      tr.appendChild(el('td', 'cell-rank', r.rank));
      
      // Protocol Info
      const tdProt = el('td', 'cell-protocol');
      const topLine = el('div', 'name-line', r.name);
      if (watchlistSet.has(r.slug)) {
        topLine.appendChild(el('span', 'wl', 'WATCHLIST'));
      }
      tdProt.appendChild(topLine);
      tdProt.appendChild(el('div', 'slug-line', r.slug));
      tr.appendChild(tdProt);

      // Category
      tr.appendChild(el('td', 'cell-category', r.category || '—'));
      
      // Chains
      tr.appendChild(el('td', 'cell-chains', (r.chains || []).join(', ')));
      
      // TVL
      tr.appendChild(el('td', 'cell-tvl', fmtMoney(r.tvl_usd)));
      
      // 7d Change
      const td7d = el('td', 'cell-change', fmtPct(r.change_7d));
      if (r.change_7d > 0) td7d.classList.add('chg-pos');
      else if (r.change_7d < 0) td7d.classList.add('chg-neg');
      tr.appendChild(td7d);

      // Implied Value
      tr.appendChild(el('td', 'cell-implied', fmtMoney(r.implied_value_usd)));
      
      // Multiple
      tr.appendChild(el('td', 'cell-mult', fmtMult(r.category_multiple)));

      tbody.appendChild(tr);
    });
  }

  /**
   * Renders the protocol detail view.
   */
  function renderDetail(row) {
    clear(main);

    const backBtn = el('button', 'back', '← Back to the board');
    backBtn.onclick = () => { location.hash = '#/'; };
    main.appendChild(backBtn);

    const title = el('h2', '', row.name);
    if (watchlistSet.has(row.slug)) {
      title.appendChild(el('span', 'wl', ' WATCHLIST'));
    }
    main.appendChild(title);

    const kv = el('div', 'kv');
    kv.appendChild(createKV('Category', row.category || '—'));
    kv.appendChild(createKV('Chains', (row.chains || []).join(', ')));
    kv.appendChild(createKV('TVL', fmtMoney(row.tvl_usd)));
    kv.appendChild(createKV('7d change', fmtPct(row.change_7d)));
    kv.appendChild(createKV('Listed at', row.listed_at || 'unknown'));
    kv.appendChild(createKV('Protocol Age', (row.age_days !== null ? row.age_days + ' days' : 'unknown')));
    
    const impliedBox = createKV('Implied value', fmtMoney(row.implied_value_usd));
    impliedBox.classList.add('big');
    kv.appendChild(impliedBox);

    kv.appendChild(createKV('Category multiple', fmtMult(row.category_multiple)));
    kv.appendChild(createKV('Growth multiplier', fmtMult(row.growth_multiplier)));
    kv.appendChild(createKV('Maturity multiplier', fmtMult(row.maturity_multiplier)));
    main.appendChild(kv);

    main.appendChild(el('h3', '', 'Farm plan'));
    const stepsList = el('ol', 'steps');
    if (row.farm_steps && row.farm_steps.length > 0) {
      row.farm_steps.forEach(step => {
        stepsList.appendChild(el('li', '', step));
      });
    } else {
      stepsList.appendChild(el('li', '', 'No specific steps available for this protocol.'));
    }
    main.appendChild(stepsList);

    const note = el('p', 'muted', 'Plan generated from the protocol\'s category and main chain; costs are rough planning figures based on standard interaction patterns.');
    main.appendChild(note);
  }

  /**
   * Creates a Key-Value pair element for the detail view.
   */
  function createKV(key, val) {
    const box = el('div', 'kv-item');
    box.appendChild(el('div', 'k', key));
    box.appendChild(el('div', 'v', val));
    return box;
  }

  // Initial routing call to start the application
  route();

})();
