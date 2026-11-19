/* Zara supply globe: renders window.SUPPLY_DATA (built by scripts/build_data.py). */
(function () {
  const { buyer, suppliers, source } = window.SUPPLY_DATA;
  const COUNTRY_NAMES = { IN: "India", VN: "Vietnam", ES: "Spain" };
  const LOW = [240, 163, 94];   // lower score in band: matches --low
  const HIGH = [95, 211, 192];  // higher score in band: matches --high

  const scores = suppliers.map((s) => s.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);

  const state = { countries: new Set(), materials: new Set(), query: "", hideUncertain: false, sort: "score-asc", selected: null };

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
        const hay = [s.name, s.place, COUNTRY_NAMES[s.country] || s.country, ...s.materials, ...s.products].join(" ").toLowerCase();
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
    .pointAltitude((s) => 0.02 + 0.08 * ((s.score - minScore) / Math.max(1, maxScore - minScore)))
    .pointRadius((s) => (s === state.selected ? 0.32 : 0.18))
    .pointColor((s) => scoreColor(s.score, s.uncertain ? 0.45 : 0.95))
    .pointsMerge(false)
    .onPointHover(onHover)
    .onPointClick((s) => select(s))
    // shipments to HQ
    .arcStartLat((a) => a.from.lat).arcStartLng((a) => a.from.lng)
    .arcEndLat(buyer.lat).arcEndLng(buyer.lng)
    .arcColor((a) => [scoreColor(a.from.score, 0.05), scoreColor(a.from.score, a.from === state.selected ? 0.95 : 0.35)])
    .arcStroke((a) => (a.from === state.selected ? 0.9 : 0.25))
    .arcAltitudeAutoScale(0.35)
    .arcDashLength(0.4).arcDashGap(0.2)
    .arcDashAnimateTime(() => 2500 + Math.random() * 2000)
    // rings for uncertain locations + HQ pulse
    .ringLat("lat").ringLng("lng")
    .ringColor((r) => (r.hq ? () => "rgba(233,216,180,.8)" : () => scoreColor(r.score, 0.6)))
    .ringMaxRadius((r) => (r.hq ? 4 : 1.6))
    .ringPropagationSpeed((r) => (r.hq ? 2 : 0.8))
    .ringRepeatPeriod((r) => (r.hq ? 1400 : 2400))
    // HQ label
    .labelsData([{ lat: buyer.lat, lng: buyer.lng, text: "Inditex HQ · Arteixo" }])
    .labelLat("lat").labelLng("lng").labelText("text")
    .labelSize(0.9).labelDotRadius(0.5).labelColor(() => "#e9d8b4").labelResolution(2);

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

  function renderDetail() {
    const s = state.selected;
    const box = $("detail");
    if (!s) { box.hidden = true; return; }
    const note = s.locationMissing
      ? "No usable address on file. The marker sits at the country's centre."
      : s.uncertain
        ? `This record has ${s.addressCount.toLocaleString()} addresses, so it likely merges several companies with the same name. The location shown may not be the factory that supplies Inditex.`
        : "";
    box.innerHTML = `
      <button class="close" aria-label="Close">×</button>
      <h2>${esc(s.name)}</h2>
      <div class="v-sub">${esc(s.place)} · ${esc(COUNTRY_NAMES[s.country] || s.country)}</div>
      <div class="score-row"><b style="color:${scoreColor(s.score)}">${s.score}</b>
        <span class="badge">${esc(s.level)} risk</span>
        ${s.uncertain ? '<span class="badge warn">Location approximate</span>' : ""}</div>
      <dl>
        <dt>Materials</dt><dd>${esc(s.materials.join(", ") || "n/a")}</dd>
        <dt>Products</dt><dd>${esc(s.products.slice(0, 8).join(", "))}${s.products.length > 8 ? "…" : ""}</dd>
        <dt>HS codes</dt><dd>${s.hsCount} product lines</dd>
      </dl>
      ${note ? `<p class="note">${esc(note)}</p>` : ""}
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
    globe
      .pointsData(list)
      .arcsData(list.filter((s) => !s.locationMissing).map((s) => ({ from: s })))
      .ringsData([{ lat: buyer.lat, lng: buyer.lng, hq: true }, ...list.filter((s) => s.uncertain)]);
  }

  function select(s) {
    state.selected = s;
    if (s) {
      globe.controls().autoRotate = false;
      globe.pointOfView({ lat: s.lat, lng: s.lng, altitude: s.locationMissing ? 1.4 : 0.7 }, 1200);
    }
    render();
    if (s) $("detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- wire up ----------
  $("search").addEventListener("input", (e) => { state.query = e.target.value; render(); });
  $("sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  $("hide-uncertain").addEventListener("change", (e) => { state.hideUncertain = e.target.checked; render(); });
  $("legend-range").textContent = `${minScore}–${maxScore}`;
  $("source-line").textContent = `Source: ${source}.`;

  render();
})();
