/* Zara supply globe: renders window.SUPPLY_DATA (built by scripts/build_data.py). */
(function () {
  const { buyer, suppliers, source } = window.SUPPLY_DATA;
  const COUNTRY_NAMES = {
    IN: "India", VN: "Vietnam", ES: "Spain", CN: "China", HK: "Hong Kong", KR: "South Korea", DE: "Germany",
    IT: "Italy", JP: "Japan", TR: "Turkey", PT: "Portugal", SG: "Singapore", BD: "Bangladesh", FR: "France",
    BE: "Belgium", AU: "Australia", GB: "United Kingdom", US: "United States", CH: "Switzerland",
    NL: "Netherlands", RO: "Romania", BR: "Brazil", TW: "Taiwan", LK: "Sri Lanka",
  };
  // Where tier-2 lines start: roughly the middle of each country (or its main
  // industrial region for very large ones). Country-level only, not addresses.
  const COUNTRY_POINTS = {
    CN: [30.5, 117], HK: [22.3, 114.2], VN: [16, 107.5], IN: [22, 79], ES: [40.4, -3.7], KR: [36.5, 127.8],
    DE: [51.2, 10.4], IT: [43, 12.5], JP: [36.2, 138.3], TR: [39, 35.2], PT: [39.6, -8], SG: [1.35, 103.8],
    BD: [23.7, 90.4], FR: [46.6, 2.2], BE: [50.6, 4.6], AU: [-25.3, 133.8], GB: [52.4, -1.5], US: [39.8, -98.6],
    CH: [46.8, 8.2], NL: [52.1, 5.3], RO: [45.9, 24.9], BR: [-14.2, -51.9], TW: [23.7, 121], LK: [7.9, 80.7],
  };
  const TIER2 = [233, 216, 180]; // matches --accent
  const LOW = [240, 163, 94];   // lower score in band: matches --low
  const HIGH = [95, 211, 192];  // higher score in band: matches --high

  const scores = suppliers.map((s) => s.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);

  const state = { countries: new Set(), materials: new Set(), query: "", hideUncertain: false, sort: "score-asc", selected: null, overview: false };

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function scoreColor(score, alpha = 1) {
    const t = maxScore === minScore ? 1 : (score - minScore) / (maxScore - minScore);
    const c = LOW.map((v, i) => Math.round(v + (HIGH[i] - v) * t));
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
  }

  function filtered() {
    const q = state.query.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (state.countries.size && !state.countries.has(s.country)) return false;
      if (state.materials.size && !s.materials.some((m) => state.materials.has(m))) return false;
      if (state.hideUncertain && s.uncertain) return false;
      if (q) {
        const d = s.details || {};
        const hay = [s.name, s.place, COUNTRY_NAMES[s.country] || s.country, ...s.materials, ...s.products,
          d.legalName, d.industry, ...(d.otherBuyers || []), ...(d.tier2 || []).map((t) => t.name)].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function sorted(list) {
    const by = {
      "score-asc": (a, b) => a.score - b.score || a.name.localeCompare(b.name),
      "score-desc": (a, b) => b.score - a.score || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      hs: (a, b) => b.hsCount - a.hsCount,
    }[state.sort];
    return [...list].sort(by);
  }

  // ---------- globe ----------
  const globe = Globe()($("globe"))
    .globeImageUrl("https://unpkg.com/three-globe@2.27.2/example/img/earth-night.jpg")
    .bumpImageUrl("https://unpkg.com/three-globe@2.27.2/example/img/earth-topology.png")
    .backgroundImageUrl("https://unpkg.com/three-globe@2.27.2/example/img/night-sky.png")
    .atmosphereColor("#e9d8b4")
    .atmosphereAltitude(0.18)
    // supplier columns
    .pointLat("lat").pointLng("lng")
    .pointAltitude((s) => (s.hq ? 0.14 : 0.02 + 0.08 * ((s.score - minScore) / Math.max(1, maxScore - minScore))))
    .pointRadius((s) => (s.hq ? 0.55 : s === state.selected ? 0.32 : 0.18))
    .pointColor((s) => (s.hq ? "#e9d8b4" : scoreColor(s.score, s.uncertain ? 0.45 : 0.95)))
    .pointsMerge(false)
    .onPointHover(onHover)
    .onPointClick((s) => (s.hq ? openOverview() : select(s)))
    // shipments to HQ, plus the selected supplier's own suppliers (tier 2)
    .arcStartLat("sLat").arcStartLng("sLng").arcEndLat("eLat").arcEndLng("eLng")
    .arcColor((a) => a.tier2
      ? [`rgba(${TIER2},0.08)`, `rgba(${TIER2},0.9)`]
      : [scoreColor(a.from.score, 0.05), scoreColor(a.from.score, a.from === state.selected ? 0.95 : state.selected ? 0.12 : 0.35)])
    .arcStroke((a) => (a.tier2 ? 0.45 : a.from === state.selected ? 0.9 : 0.25))
    .arcAltitudeAutoScale(0.35)
    .arcDashLength(0.4).arcDashGap(0.2)
    .arcDashAnimateTime(() => 2500 + Math.random() * 2000)
    // rings for uncertain locations + HQ pulse
    .ringLat("lat").ringLng("lng")
    .ringColor((r) => (r.hq ? () => "rgba(233,216,180,.8)" : () => scoreColor(r.score, 0.6)))
    .ringMaxRadius((r) => (r.hq ? 4 : 1.6))
    .ringPropagationSpeed((r) => (r.hq ? 2 : 0.8))
    .ringRepeatPeriod((r) => (r.hq ? 1400 : 2400))
    // HQ label, plus tier-2 countries for the selected supplier
    .labelLat("lat").labelLng("lng").labelText("text")
    .labelSize((l) => (l.hq ? 0.9 : 0.6)).labelDotRadius((l) => (l.hq ? 0.5 : 0.3))
    .labelColor((l) => (l.hq ? "#e9d8b4" : `rgba(${TIER2},0.85)`)).labelResolution(2)
    .onLabelClick((l) => l.hq && openOverview())
    // Lines converge on HQ, so a click there often lands on a line or the globe
    // surface instead of the HQ column. Treat any click close to HQ as HQ.
    .onArcClick((a, e, c) => (nearHQ(c) ? openOverview() : a.from ? select(a.from) : null))
    .onGlobeClick((c) => nearHQ(c) && openOverview())
    .onLabelHover((l) => { document.body.style.cursor = l && l.hq ? "pointer" : ""; });
  const HQ_LABEL = { lat: buyer.lat, lng: buyer.lng, text: "Inditex HQ · Arteixo", hq: true };
  const HQ_POINT = { lat: buyer.lat, lng: buyer.lng, hq: true };
  function nearHQ(c) {
    return !!c && Math.abs(c.lat - buyer.lat) < 2.5 && Math.abs(c.lng - buyer.lng) < 3;
  }

  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.35;
  globe.pointOfView({ lat: 25, lng: 60, altitude: 2.3 }, 0);

  window.addEventListener("resize", () => globe.width(innerWidth).height(innerHeight));

  // ---------- tooltip ----------
  const tooltip = $("tooltip");
  let mouse = { x: 0, y: 0 };
  document.addEventListener("mousemove", (e) => {
    mouse = { x: e.clientX, y: e.clientY };
    if (!tooltip.hidden) placeTooltip();
  });
  function placeTooltip() {
    tooltip.style.left = Math.min(mouse.x + 14, innerWidth - 270) + "px";
    tooltip.style.top = mouse.y + 14 + "px";
  }
  function onHover(s) {
    document.body.style.cursor = s ? "pointer" : "";
    if (!s) { tooltip.hidden = true; return; }
    if (s.hq) {
      tooltip.innerHTML = "<b>Inditex HQ</b>Arteixo, Spain<br>Click for an overview of Inditex and its supply chain";
      tooltip.hidden = false;
      return placeTooltip();
    }
    tooltip.innerHTML = `<b>${esc(s.name)}</b>${esc(s.place)}<br>Score ${s.score} · ${esc(s.level)} risk<br>${esc(s.materials.slice(0, 3).join(", ") || s.products[0] || "")}`;
    tooltip.hidden = false;
    placeTooltip();
  }

  // ---------- panel ----------
  function chip(label, count, active, onClick) {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.setAttribute("aria-pressed", active);
    b.innerHTML = `${esc(label)}<small>${count}</small>`;
    b.onclick = onClick;
    return b;
  }

  function toggle(set, key) {
    set.has(key) ? set.delete(key) : set.add(key);
    render();
  }

  function renderChips() {
    const countries = {};
    const materials = {};
    suppliers.forEach((s) => {
      countries[s.country] = (countries[s.country] || 0) + 1;
      s.materials.forEach((m) => (materials[m] = (materials[m] || 0) + 1));
    });
    const cc = $("country-chips");
    cc.replaceChildren(...Object.entries(countries).sort((a, b) => b[1] - a[1])
      .map(([c, n]) => chip(COUNTRY_NAMES[c] || c, n, state.countries.has(c), () => toggle(state.countries, c))));
    const mc = $("material-chips");
    mc.replaceChildren(...Object.entries(materials).sort((a, b) => b[1] - a[1])
      .map(([m, n]) => chip(m, n, state.materials.has(m), () => toggle(state.materials, m))));
  }

  function renderStats(list) {
    const avg = list.length ? Math.round(list.reduce((t, s) => t + s.score, 0) / list.length) : 0;
    const countries = new Set(list.map((s) => s.country)).size;
    $("stats").innerHTML = `
      <div class="stat"><b>${list.length}</b><span>vendors shown</span></div>
      <div class="stat"><b>${avg || "–"}</b><span>avg. score</span></div>
      <div class="stat"><b>${countries}</b><span>countries</span></div>`;
  }

  function renderList(list) {
    const ul = $("vendor-list");
    ul.replaceChildren(...sorted(list).map((s) => {
      const li = document.createElement("li");
      if (s === state.selected) li.className = "active";
      li.innerHTML = `
        <span class="dot ${s.uncertain ? "hollow" : ""}" style="background:${scoreColor(s.score)};color:${scoreColor(s.score)}"></span>
        <span><span class="v-name">${esc(s.name)}</span><br><span class="v-sub">${esc(s.place)} · ${esc(s.materials[0] || s.products[0] || "")}</span></span>
        <span class="v-score">${s.score}</span>`;
      li.onclick = () => select(s);
      return li;
    }));
  }

  function list(items) {
    return items.map((t) => `<li>${esc(t)}</li>`).join("");
  }

  function companySection(d) {
    const rows = [];
    if (d.legalName) rows.push(["Registered as", esc(d.legalName)]);
    if (d.aliases.length) rows.push(["Also known as", esc(d.aliases.slice(0, 3).join(" · ")) +
      (d.aliasCount > 4 ? ` <span class="muted">+${d.aliasCount - 4} more</span>` : "")]);
    rows.push(["Industry", d.industry ? esc(d.industry) : '<span class="muted">Not on file</span>']);
    if (d.legalForm) rows.push(["Company type", esc(d.legalForm)]);
    if (d.companyNumber) rows.push(["Registration no.", `<code>${esc(d.companyNumber)}</code>`]);
    if (d.lei) rows.push(["Global ID (LEI)", `<a href="https://search.gleif.org/#/record/${encodeURIComponent(d.lei)}" target="_blank" rel="noopener">${esc(d.lei)} ↗</a>` +
      (d.leiCount > 1 ? ` <span class="muted">+${d.leiCount - 1} more</span>` : "")]);
    return `<h3>The company</h3><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
  }

  function buyersSection(d) {
    if (!d.buyersTotal) return "";
    const brands = d.inditexBrands.filter((b) => b !== "Inditex");
    return `<h3>Who else it sells to</h3>
      <p class="big-num"><b>${d.buyersTotal.toLocaleString()}</b> buyers on record</p>
      ${d.otherBuyers.length ? `<p class="muted small">Including:</p><ul class="pills">${list(d.otherBuyers.slice(0, 6))}</ul>` : ""}
      ${brands.length ? `<p class="small">Also ships to Inditex brands: <b>${esc(brands.join(", "))}</b></p>` : ""}`;
  }

  function tier2Section(d) {
    if (!d.tier2Total) return `<h3>Where its materials come from</h3><p class="muted small">No suppliers on record.</p>`;
    const rows = d.tier2.map((t) => `
      <li><span class="t2-name">${esc(t.name)}</span>
        <span class="t2-sub">${esc(t.supplies.slice(0, 3).join(", ") || "Unlabelled goods")}</span>
        <span class="t2-country">${t.country ? esc(COUNTRY_NAMES[t.country] || t.country) : '<span class="muted">Unknown</span>'}</span></li>`).join("");
    const mapped = d.tier2.filter((t) => COUNTRY_POINTS[t.country]).length;
    return `<h3>Where its materials come from</h3>
      <p class="big-num"><b>${d.tier2Total.toLocaleString()}</b> suppliers of its own on record. Top ${d.tier2.length}:</p>
      <ul class="tier2">${rows}</ul>
      <p class="muted small">${mapped ? "Gold lines on the globe show these countries. " : ""}Countries are inferred from company names, so they're approximate and left blank when unclear.</p>`;
  }

  // ---------- Inditex overview ----------
  function tally(items) {
    const t = {};
    items.forEach((k) => k && (t[k] = (t[k] || 0) + 1));
    return Object.entries(t).sort((a, b) => b[1] - a[1]);
  }

  function renderOverview(box) {
    const withD = suppliers.filter((s) => s.details);
    const tier2 = withD.flatMap((s) => s.details.tier2);
    const t2Countries = tally(tier2.map((t) => t.country)).slice(0, 5)
      .map(([c, n]) => `${esc(COUNTRY_NAMES[c] || c)} <span class="muted">${n}</span>`).join(" · ");
    const t2Goods = tally(tier2.flatMap((t) => t.supplies)).slice(0, 6).map(([g]) => esc(g.toLowerCase())).join(", ");
    const fibres = tally(suppliers.flatMap((s) => s.materials)).filter(([m]) => !["Plastic", "Paper", "Base metal"].includes(m))
      .slice(0, 4).map(([m, n]) => `${esc(m)} <span class="muted">${n}</span>`).join(" · ");
    const tagged = suppliers.filter((s) => s.hs.some((h) => h.startsWith("8531"))).length;
    const shared = withD.filter((s) => s.details.buyersTotal > 100).length;
    const step = (n, title, body) => `<li><span class="step-n">${n}</span><div><b>${title}</b><p>${body}</p></div></li>`;

    box.innerHTML = `
      <button class="close" aria-label="Close">×</button>
      <p class="eyebrow">Inditex HQ · Arteixo, A Coruña, Spain</p>
      <h2>What Inditex is</h2>
      <p class="summary">Inditex (Industria de Diseño Textil) is the Spanish group behind <b>Zara</b>, along with Pull&amp;Bear,
        Massimo Dutti, Bershka, Stradivarius, Oysho, Zara Home and Lefties. It's one of the world's largest fashion retailers.
        It designs and sells clothes but buys most of its production from independent suppliers, like the ones on this globe.</p>
      <div class="ov-stats">
        <div><b>€39.9bn</b><span>sales, 2025 financial year</span></div>
        <div><b>€6.2bn</b><span>net profit</span></div>
        <div><b>5,460</b><span>stores worldwide</span></div>
        <div><b>€10.7bn</b><span>sold online</span></div>
      </div>
      <p class="muted small">Financial year Feb 2025 to Jan 2026, as reported in March 2026.</p>

      <h3>How materials become a Zara garment</h3>
      <ol class="flow">
        ${step(1, "Fibre and yarn", `Cotton, polyester, viscose, wool and other fibres are spun into yarn. Inditex doesn't usually buy at this stage. Its suppliers' suppliers do.`)}
        ${step(2, "Fabric and trims (tier 2)", `Mills weave or knit the yarn into fabric, and other firms make labels, buttons and zips. Across the 57 suppliers here, their own suppliers are mostly in ${t2Countries || "Asia"}, and ship ${t2Goods || "fabric and trims"}.`)}
        ${step(3, "Garment factories (tier 1)", `Factories cut, sew and finish the garments. These are the ${suppliers.length} vendors on the globe, in India and Vietnam. Their main fibres: ${fibres}.`)}
        ${step(4, "Tagged and shipped to Spain", `Before shipping, factories attach Inditex's security and RFID tags. ${tagged} of the ${suppliers.length} vendors here declare security-tag codes (HS 8531) in their shipments, and at least 10 list Tyco's Spanish security unit among their own suppliers. Goods then go to Inditex's logistics centres in Spain.`)}
        ${step(5, "Sorted and sent to stores", `From the Spanish hubs, new stock reaches stores twice a week: within about 24 hours in Europe and up to 48 hours in the Americas and Asia.`)}
      </ol>

      <h3>Why it works this way</h3>
      <ul class="plain">
        <li><b>Proximity sourcing.</b> A large share of production, often reported as half or more, comes from factories near Spain (Spain, Portugal, Morocco, Turkey). Trend-driven items can be made and restocked within weeks. Basics with steadier demand are made further away, in places like India and Vietnam.</li>
        <li><b>Small batches, frequent restocks.</b> Stores order twice a week, so Inditex can make more of what sells and stop making what doesn't.</li>
        <li><b>Shared factories.</b> ${shared} of these ${withD.length} vendors trade with more than 100 buyers on record, so Zara often shares factory capacity with other brands.</li>
      </ul>

      <h3>What this globe doesn't show</h3>
      <p class="small muted">These are only the suppliers in Tradeverifyd's trade records for one Inditex entity. Inditex's own public supplier list is far larger and includes the nearby countries above, which have no markers here. Figures on this card come from Inditex's reported results and press coverage. Supplier figures come from Tradeverifyd.</p>`;
    box.querySelector(".close").onclick = () => { state.overview = false; render(); };
    box.hidden = false;
  }

  function openOverview() {
    state.selected = null;
    state.overview = true;
    globe.controls().autoRotate = false;
    globe.pointOfView({ lat: 35, lng: 30, altitude: 2.4 }, 1200);
    render();
    $("detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderDetail() {
    const s = state.selected;
    const box = $("detail");
    box.classList.toggle("overview", !s && state.overview);
    if (!s && state.overview) return renderOverview(box);
    if (!s) { box.hidden = true; return; }
    const d = s.details;
    const note = s.locationMissing
      ? "No usable address on file. The marker sits at the country's centre."
      : s.uncertain
        ? `This record has ${s.addressCount.toLocaleString()} addresses, so it likely merges several companies with the same name. The location shown may not be the factory that supplies Inditex.`
        : "";
    const flags = d ? d.flags.map((f) => `<p class="note ${f.kind}">${esc(f.text)}</p>`).join("") : "";
    const mapsQuery = encodeURIComponent(`${d ? d.legalName : s.name} ${s.place.split(" (")[0]}`);
    box.innerHTML = `
      <button class="close" aria-label="Close">×</button>
      <h2>${esc(s.name)}</h2>
      <div class="v-sub">${esc(s.place)} · ${esc(COUNTRY_NAMES[s.country] || s.country)}</div>
      ${d ? `<p class="summary">${esc(d.summary)}</p>` : ""}
      <div class="score-row"><b style="color:${scoreColor(s.score)}">${s.score}</b>
        <span class="badge">${esc(s.level)} risk</span>
        ${s.uncertain ? '<span class="badge warn">Location approximate</span>' : ""}</div>
      ${flags}
      <h3>What it ships to Inditex</h3>
      <dl>
        <dt>Materials</dt><dd>${esc(s.materials.join(", ") || "n/a")}</dd>
        <dt>Products</dt><dd>${esc(s.products.slice(0, 8).join(", "))}${s.products.length > 8 ? "…" : ""}</dd>
        <dt>HS codes</dt><dd>${s.hsCount} product lines</dd>
      </dl>
      ${note ? `<p class="note warn">${esc(note)}</p>` : ""}
      ${d ? companySection(d) + buyersSection(d) + tier2Section(d) : ""}
      <p class="links"><a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener">Look it up on Google Maps ↗</a></p>
      <details><summary>All HS codes</summary><code>${esc(s.hs.join(" "))}</code></details>
      <details><summary>Tradeverifyd entity ID</summary><code>${esc(s.id)}</code></details>`;
    box.querySelector(".close").onclick = () => select(null);
    box.hidden = false;
  }

  function render() {
    const list = filtered();
    if (state.selected && !list.includes(state.selected)) state.selected = null;
    renderChips();
    renderStats(list);
    renderList(list);
    renderDetail();
    const sel = state.selected;
    const tier2 = sel && sel.details ? sel.details.tier2.filter((t) => COUNTRY_POINTS[t.country]) : [];
    const tier2Countries = [...new Set(tier2.map((t) => t.country))];
    globe
      .pointsData([...list, HQ_POINT])
      .arcsData([
        ...list.filter((s) => !s.locationMissing)
          .map((s) => ({ from: s, sLat: s.lat, sLng: s.lng, eLat: buyer.lat, eLng: buyer.lng })),
        ...tier2Countries.map((c) => ({ tier2: true, sLat: COUNTRY_POINTS[c][0], sLng: COUNTRY_POINTS[c][1], eLat: sel.lat, eLng: sel.lng })),
      ])
      .labelsData([HQ_LABEL, ...tier2Countries.map((c) => ({ lat: COUNTRY_POINTS[c][0], lng: COUNTRY_POINTS[c][1], text: COUNTRY_NAMES[c] }))])
      .ringsData([{ lat: buyer.lat, lng: buyer.lng, hq: true }, ...list.filter((s) => s.uncertain)]);
  }

  function select(s) {
    state.selected = s;
    if (s) state.overview = false;
    if (s) {
      globe.controls().autoRotate = false;
      const far = s.details && s.details.tier2.some((t) => COUNTRY_POINTS[t.country]);
      globe.pointOfView({ lat: s.lat, lng: s.lng, altitude: far ? 2 : s.locationMissing ? 1.4 : 0.7 }, 1200);
    }
    render();
    if (s) $("detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- wire up ----------
  $("about-inditex").addEventListener("click", openOverview);
  $("search").addEventListener("input", (e) => { state.query = e.target.value; render(); });
  $("sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  $("hide-uncertain").addEventListener("change", (e) => { state.hideUncertain = e.target.checked; render(); });
  $("legend-range").textContent = `${minScore}–${maxScore}`;
  $("source-line").textContent = `Source: ${source}.`;

  render();
})();
