// Worker detail page bootstrap.
(function () {
  const LIMIT = 724;
  const WARN  = 652;

  function worstWindow(worker, months) {
    let best = { total: 0, start: 0 };
    for (let i = 0; i <= months.length - 3; i++) {
      const total = months.slice(i, i + 3)
        .reduce((s, m) => s + (worker.monthly[m]?.hours || 0), 0);
      if (total > best.total) best = { total, start: i };
    }
    return best;
  }

  function render(worker, data) {
    const months = data.reporting_months;
    const cur = data.current_month;
    const curIdx = months.indexOf(cur);
    const trailing = months.slice(Math.max(0, curIdx - 3), curIdx);
    const forward  = months.slice(curIdx + 1, curIdx + 2);

    // Header
    document.title = `${worker.name} — Northwest Workforce`;
    document.getElementById("worker-name").textContent = worker.name;
    document.getElementById("worker-meta").innerHTML = [
      `<span>${worker.position}</span>`,
      `<span class="sep">/</span>`,
      `<span>${worker.discipline}</span>`,
      `<span class="sep">/</span>`,
      `<span class="dot ${NW.clientSlug(worker.primary_client)}"></span> ${worker.primary_client}`,
    ].join(" ");

    // Compliance check
    const { total: wTotal, start: wStart } = worstWindow(worker, months);
    const complianceEl = document.getElementById("worker-compliance");
    if (wTotal >= WARN) {
      const wWindow = months.slice(wStart, wStart + 3);
      const label = wTotal >= LIMIT
        ? `<span class="badge risk">Breach — ${NW.fmtInt(wTotal)}h in ${NW.fmtMonth(wWindow[0])}–${NW.fmtMonth(wWindow[2])} (+${NW.fmtInt(wTotal - LIMIT)}h over limit)</span>`
        : `<span class="badge warn">Approaching limit — ${NW.fmtInt(wTotal)}h in ${NW.fmtMonth(wWindow[0])}–${NW.fmtMonth(wWindow[2])}</span>`;
      complianceEl.innerHTML = label;
    } else {
      complianceEl.innerHTML = `<span class="badge ok">No compliance issues</span>`;
    }

    // At-risk check
    const trailingHrs = trailing.map((m) => worker.monthly[m]?.hours || 0);
    const trailingAvg = trailingHrs.reduce((a, b) => a + b, 0) / (trailing.length || 1);
    const nextHrs = worker.monthly[forward[0]]?.hours || 0;
    const atRiskEl = document.getElementById("worker-atrisk");
    if (trailingAvg >= 120 && nextHrs <= 40) {
      atRiskEl.innerHTML = `<span class="badge risk">At-risk — avg ${NW.fmtInt(trailingAvg)}h/mo trailing, only ${NW.fmtInt(nextHrs)}h next month</span>`;
    } else {
      atRiskEl.innerHTML = `<span class="badge ok">Not at risk</span>`;
    }

    // Monthly table
    const tbody = document.querySelector("#worker-hours-table tbody");
    tbody.innerHTML = "";
    months.forEach((m, i) => {
      const mm = worker.monthly[m] || {};
      const hrs = mm.hours || 0;
      const isPast = i < curIdx;
      const isCur  = i === curIdx;
      const isFut  = i > curIdx;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="cell-left ${isCur ? "month-cur" : isFut ? "month-future" : "month-past"}">
          ${NW.fmtMonth(m)}${isCur ? " ▲" : isFut ? " (fwd)" : ""}
        </td>
        <td class="cell-left">
          ${mm.client ? `<span class="dot ${NW.clientSlug(mm.client)}"></span> ${mm.client}` : `<span class="muted">—</span>`}
        </td>
        <td class="num">${hrs ? NW.fmtInt(hrs) + "h" : `<span class="muted">—</span>`}</td>
        <td>${mm.committed ? `<span class="badge warn">Scheduled</span>` : isPast ? `<span class="badge ok">Worked</span>` : `<span class="muted">—</span>`}</td>`;
      tbody.appendChild(tr);
    });

    // Employment info
    const startEl = document.getElementById("worker-start");
    if (startEl && worker.employment_start) {
      startEl.textContent = worker.employment_start;
    }
  }

  async function boot() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    let data;
    try {
      const res = await fetch("data/workforce.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (err) {
      document.querySelector("main").innerHTML =
        `<div class="card" style="padding:30px;"><h2>Could not load data</h2><p class="muted">${err.message}</p></div>`;
      return;
    }

    const worker = data.workers.find((w) => w.id === id);
    if (!worker) {
      document.querySelector("main").innerHTML =
        `<div class="card" style="padding:30px;">
          <h2>Worker not found</h2>
          <p class="muted">No record for ID: <code>${id || "(none)"}</code></p>
          <p><a href="index.html">← Back to Utilisation</a></p>
        </div>`;
      return;
    }

    // Header meta
    const months = data.reporting_months;
    const set = (elId, v) => { const el = document.getElementById(elId); if (el) el.textContent = v; };
    set("hdr-window", `${NW.fmtMonth(months[0])} – ${NW.fmtMonth(months[months.length - 1])}`);
    set("hdr-current", NW.fmtMonthLong(data.current_month));
    set("hdr-refreshed", data.generated_at);

    render(worker, data);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
