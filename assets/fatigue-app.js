// Bootstrap for the standalone fatigue / hours-compliance page.
(function () {
  const state = {
    data: null,
    filters: {
      clients: new Set(),
      position: "",
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
    if (params.has("position")) state.filters.position = params.get("position");
    if (params.get("zero") === "1") state.filters.hideZero = true;
  }

  function writeHash() {
    const parts = [];
    if (state.filters.clients.size) parts.push(`client=${[...state.filters.clients].join(",")}`);
    if (state.filters.position) parts.push(`position=${encodeURIComponent(state.filters.position)}`);
    if (state.filters.hideZero) parts.push("zero=1");
    const h = parts.join("&");
    if (h) window.location.hash = h;
    else history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  function filteredWorkers() {
    const { workers } = state.data;
    const months = state.data.reporting_months;
    return workers.filter((w) => {
      if (state.filters.position && w.position !== state.filters.position) return false;
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
  }

  function renderFilterStrip() {
    const chips = document.getElementById("client-chips");
    chips.innerHTML = "";
    state.data.clients.forEach((c) => {
      const b = document.createElement("span");
      b.className = "filter-chip";
      if (state.filters.clients.has(c)) b.classList.add("active");
      b.dataset.client = c;
      b.innerHTML = `<span class="dot ${NW.clientSlug(c)}"></span> ${c}`;
      b.addEventListener("click", () => {
        if (state.filters.clients.has(c)) state.filters.clients.delete(c);
        else state.filters.clients.add(c);
        writeHash();
        renderFilterStrip();
        renderAll();
      });
      chips.appendChild(b);
    });

    const sel = document.getElementById("position-select");
    if (!sel.options.length) {
      sel.innerHTML = `<option value="">All positions</option>` +
        state.data.positions_top20.map((p) => `<option>${p}</option>`).join("");
    }
    sel.value = state.filters.position;
    sel.onchange = () => {
      state.filters.position = sel.value;
      writeHash();
      renderAll();
    };

    const hz = document.getElementById("hide-zero");
    hz.checked = state.filters.hideZero;
    hz.onchange = () => {
      state.filters.hideZero = hz.checked;
      writeHash();
      renderAll();
    };

    document.getElementById("reset-filters").onclick = () => {
      state.filters.clients = new Set();
      state.filters.position = "";
      state.filters.hideZero = false;
      writeHash();
      renderFilterStrip();
      renderAll();
    };
  }

  function renderHeader() {
    const months = state.data.reporting_months;
    document.getElementById("hdr-window").textContent =
      `${NW.fmtMonth(months[0])} – ${NW.fmtMonth(months[months.length - 1])}`;
    document.getElementById("hdr-current").textContent = NW.fmtMonthLong(state.data.current_month);
    document.getElementById("hdr-refreshed").textContent = state.data.generated_at;
  }

  function renderAll() {
    const view = {
      data: state.data,
      workers: filteredWorkers(),
    };
    NW.renderCompliance(view);
  }

  async function boot() {
    try {
      const res = await fetch("data/workforce.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
    } catch (err) {
      document.querySelector("main").innerHTML =
        `<div class="card" style="padding:30px;">
          <h2>Could not load data</h2>
          <p class="muted">${err.message}</p>
        </div>`;
      return;
    }
    parseHash();
    renderHeader();
    renderFilterStrip();
    renderAll();

    window.addEventListener("hashchange", () => {
      parseHash();
      renderFilterStrip();
      renderAll();
    });
  }

  document.addEventListener("DOMContentLoaded", boot);

  window.NW_APP = { state, renderAll };
})();
