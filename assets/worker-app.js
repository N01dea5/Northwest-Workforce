// Worker detail page bootstrap.
(function () {
  function render(worker, data) {
    const esc = NW.escapeHtml;
    const months = data.reporting_months;
    const cur = data.current_month;
    const curIdx = months.indexOf(cur);
    const trailing = months.slice(Math.max(0, curIdx - 3), curIdx);
    const forward  = months.slice(curIdx + 1, curIdx + 2);

    // Header
    document.title = `${worker.name} — Northwest Workforce`;
    document.getElementById("worker-name").textContent = worker.name;
    document.getElementById("worker-meta").innerHTML = [
      `<span>${esc(worker.position)}</span>`,
      `<span class="sep">/</span>`,
      `<span>${esc(worker.discipline)}</span>`,
      `<span class="sep">/</span>`,
      `<span class="dot ${esc(NW.clientSlug(worker.primary_client))}"></span> ${esc(worker.primary_client)}`,
    ].join(" ");

    // Compliance check
    const { total: wTotal, start: wStart } = NW.worstWindow(worker, months);
    const complianceEl = document.getElementById("worker-compliance");
    if (wTotal >= NW.FATIGUE_WARN) {
      const wWindow = months.slice(wStart, wStart + 3);
      const label = wTotal >= NW.FATIGUE_LIMIT
        ? `<span class="badge risk">Breach — ${NW.fmtInt(wTotal)}h in ${NW.fmtMonth(wWindow[0])}–${NW.fmtMonth(wWindow[2])} (+${NW.fmtInt(wTotal - NW.FATIGUE_LIMIT)}h over limit)</span>`
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
    if (trailingAvg >= NW.ATRISK_MIN_TRAILING && nextHrs <= NW.ATRISK_MAX_NEXT) {
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
          ${mm.client ? `<span class="dot ${esc(NW.clientSlug(mm.client))}"></span> ${esc(mm.client)}` : `<span class="muted">—</span>`}
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
          <p class="muted">No record for ID: <code>${NW.escapeHtml(id || "(none)")}</code></p>
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
