// Shared page bootstrap — call NW.bootPage(renderFn) from each page's script.
// Handles: data loading, filter state, name search, hash sync, stale banner.
window.NW = window.NW || {};

NW.bootPage = function (renderFn) {
  const state = {
    data: null,
    filters: {
      clients: new Set(),
      disciplines: new Set(),
      position: "",
      nameSearch: "",
      hideZero: false,
    },
  };

  function parseHash() {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.has("client")) {
      state.filters.clients = new Set(
        params.get("client").split(",").map((s) => s.trim()).filter(Boolean)
      );
    }
    if (params.has("discipline")) {
      state.filters.disciplines = new Set(
        params.get("discipline").split(",").map((s) => s.trim()).filter(Boolean)
      );
    }
    if (params.has("position")) state.filters.position = params.get("position");
    if (params.get("zero") === "1") state.filters.hideZero = true;
  }

  function writeHash() {
    const parts = [];
    if (state.filters.clients.size) parts.push(`client=${[...state.filters.clients].join(",")}`);
    if (state.filters.disciplines.size) parts.push(`discipline=${[...state.filters.disciplines].map(encodeURIComponent).join(",")}`);
    if (state.filters.position) parts.push(`position=${encodeURIComponent(state.filters.position)}`);
    if (state.filters.hideZero) parts.push("zero=1");
    const h = parts.join("&");
    if (h) window.location.hash = h;
    else history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  NW.filteredWorkers = function () {
    const { workers } = state.data;
    const months = state.data.reporting_months;
    const q = state.filters.nameSearch.toLowerCase();
    return workers.filter((w) => {
      if (q && !w.name.toLowerCase().includes(q)) return false;
      if (state.filters.position && w.position !== state.filters.position) return false;
      if (state.filters.disciplines.size && !state.filters.disciplines.has(w.discipline)) return false;
      if (state.filters.clients.size) {
        const touched = months.some((m) => state.filters.clients.has(w.monthly[m]?.client));
        if (!touched) return false;
      }
      if (state.filters.hideZero) {
        const total = months.reduce((s, m) => s + (w.monthly[m]?.hours || 0), 0);
        if (total === 0) return false;
      }
      return true;
    });
  };

  function renderFilterStrip() {
    const chips = document.getElementById("client-chips");
    if (chips) {
      chips.innerHTML = "";
      state.data.clients.forEach((c) => {
        const b = document.createElement("span");
        b.className = "filter-chip";
        if (state.filters.clients.has(c)) b.classList.add("active");
        b.innerHTML = `<span class="dot ${NW.escapeHtml(NW.clientSlug(c))}"></span> ${NW.escapeHtml(c)}`;
        b.addEventListener("click", () => {
          if (state.filters.clients.has(c)) state.filters.clients.delete(c);
          else state.filters.clients.add(c);
          writeHash();
          renderFilterStrip();
          renderAll();
        });
        chips.appendChild(b);
      });
    }

    const discChips = document.getElementById("discipline-chips");
    if (discChips) {
      discChips.innerHTML = "";
      const disciplines = state.data.disciplines || [];
      disciplines.forEach((d) => {
        const b = document.createElement("span");
        b.className = "filter-chip";
        if (state.filters.disciplines.has(d)) b.classList.add("active");
        b.textContent = d;
        b.addEventListener("click", () => {
          if (state.filters.disciplines.has(d)) state.filters.disciplines.delete(d);
          else state.filters.disciplines.add(d);
          writeHash();
          renderFilterStrip();
          renderAll();
        });
        discChips.appendChild(b);
      });
    }

    const sel = document.getElementById("position-select");
    if (sel) {
      if (!sel.options.length) {
        sel.innerHTML = `<option value="">All positions</option>` +
          state.data.positions_top20.map((p) => `<option value="${NW.escapeHtml(p)}">${NW.escapeHtml(p)}</option>`).join("");
      }
      sel.value = state.filters.position;
      sel.onchange = () => { state.filters.position = sel.value; writeHash(); renderAll(); };
    }

    const ns = document.getElementById("name-search");
    if (ns) {
      ns.value = state.filters.nameSearch;
      ns.oninput = () => { state.filters.nameSearch = ns.value.trim(); renderAll(); };
    }

    const hz = document.getElementById("hide-zero");
    if (hz) {
      hz.checked = state.filters.hideZero;
      hz.onchange = () => { state.filters.hideZero = hz.checked; writeHash(); renderAll(); };
    }

    const rb = document.getElementById("reset-filters");
    if (rb) rb.onclick = () => {
      state.filters.clients = new Set();
      state.filters.disciplines = new Set();
      state.filters.position = "";
      state.filters.nameSearch = "";
      state.filters.hideZero = false;
      if (ns) ns.value = "";
      writeHash();
      renderFilterStrip();
      renderAll();
    };
  }

  function renderHeader() {
    const months = state.data.reporting_months;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("hdr-window", `${NW.fmtMonth(months[0])} – ${NW.fmtMonth(months[months.length - 1])}`);
    set("hdr-current", NW.fmtMonthLong(state.data.current_month));
    set("hdr-refreshed", state.data.generated_at);
  }

  function renderStaleBanner() {
    const banner = document.getElementById("stale-banner");
    if (!banner || !state.data.generated_at) return;
    const gen = new Date(state.data.generated_at.slice(0, 10));
    const days = Math.floor((Date.now() - gen.getTime()) / 86400000);
    if (days > 7) {
      banner.style.display = "";
      banner.textContent =
        `Data was last refreshed ${days} days ago — figures may not reflect recent roster changes.`;
    }
  }

  function renderAll() {
    const view = { data: state.data, workers: NW.filteredWorkers() };
    renderFn(view);
  }

  async function boot() {
    try {
      const res = await fetch("data/workforce.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
    } catch (err) {
      document.querySelector("main").innerHTML =
        `<div class="card" style="padding:30px;">
          <h2>Could not load data</h2><p class="muted">${err.message}</p>
        </div>`;
      return;
    }
    parseHash();
    renderHeader();
    renderStaleBanner();
    renderFilterStrip();
    renderAll();
    window.addEventListener("hashchange", () => { parseHash(); renderFilterStrip(); renderAll(); });
  }

  document.addEventListener("DOMContentLoaded", boot);
  window.NW_APP = { state, renderAll };
};
