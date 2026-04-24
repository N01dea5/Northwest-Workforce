// Section 04b — Hours compliance: 724h per any rolling 3-month window.
(function (NW) {
  const LIMIT = 724;
  const WARN  = Math.ceil(LIMIT * 0.9); // 652h — "close"

  // Returns { total, start } for the worst consecutive 3-month window.
  function worstWindow(worker, months) {
    let best = { total: 0, start: 0 };
    for (let i = 0; i <= months.length - 3; i++) {
      const total = months.slice(i, i + 3)
        .reduce((s, m) => s + (worker.monthly[m]?.hours || 0), 0);
      if (total > best.total) best = { total, start: i };
    }
    return best;
  }

  function compute(view) {
    const { data, workers } = view;
    const months = data.reporting_months;
    const rows = [];

    workers.forEach((w) => {
      const { total, start } = worstWindow(w, months);
      if (total < WARN) return;
      const window = months.slice(start, start + 3);
      const status = total >= LIMIT ? "over" : "warn";
      rows.push({
        id: w.id,
        name: w.name,
        position: w.position,
        discipline: w.discipline || "—",
        client: w.monthly[data.current_month]?.client || w.primary_client || "—",
        total,
        overage: total - LIMIT,
        window,
        windowLabel: `${NW.fmtMonth(window[0])} – ${NW.fmtMonth(window[2])}`,
        status,
        allMonths: months,
        monthly: w.monthly,
      });
    });

    rows.sort((a, b) => b.total - a.total);
    return rows;
  }

  NW.renderCompliance = function (view) {
    const rows = compute(view);
    const months = view.data.reporting_months;
    const curIdx = months.indexOf(view.data.current_month);

    // Build header with dynamic month columns
    const thead = document.getElementById("compliance-thead");
    thead.innerHTML = "";
    const htr = document.createElement("tr");
    htr.innerHTML =
      `<th class="cell-left">Name</th><th class="cell-left">Position</th><th class="cell-left">Current client</th>` +
      months.map((m, i) => {
        const cls = i < curIdx ? "month-past" : i === curIdx ? "month-cur" : "month-future";
        return `<th class="${cls} num" style="min-width:52px;">${NW.fmtMonth(m)}</th>`;
      }).join("") +
      `<th class="num">Window total</th><th class="cell-left">Worst window</th><th>Status</th>`;
    thead.appendChild(htr);

    const tbody = document.querySelector("#compliance-table tbody");
    tbody.innerHTML = "";

    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.className = r.status === "over" ? "compliance-over" : "compliance-warn";

      const monthCells = r.allMonths.map((m) => {
        const h = r.monthly[m]?.hours || 0;
        const inWindow = r.window.includes(m);
        const cls = inWindow
          ? (r.status === "over" ? "compliance-cell-over" : "compliance-cell-warn")
          : "compliance-cell-dim";
        return `<td class="num ${cls}">${h ? NW.fmtInt(h) + "h" : "·"}</td>`;
      }).join("");

      const badge = r.status === "over"
        ? `<span class="badge risk">+${NW.fmtInt(r.overage)}h over</span>`
        : `<span class="badge warn">Close</span>`;

      tr.innerHTML = `
        <td class="worker-name"><a href="${NW.workerUrl(r.id)}">${r.name}</a></td>
        <td class="cell-left">${r.position}</td>
        <td class="cell-left"><span class="dot ${NW.clientSlug(r.client)}"></span> ${r.client}</td>
        ${monthCells}
        <td class="num compliance-total"><strong>${NW.fmtInt(r.total)}h</strong></td>
        <td class="nowrap cell-left">${r.windowLabel}</td>
        <td>${badge}</td>`;
      tbody.appendChild(tr);
    });

    const over = rows.filter((r) => r.status === "over").length;
    const warn = rows.filter((r) => r.status === "warn").length;
    const summary = document.getElementById("compliance-summary");
    if (!rows.length) {
      summary.innerHTML = `<span class="badge ok">No compliance issues in current view</span>`;
    } else {
      const parts = [];
      if (over) parts.push(`<strong>${over}</strong> over 724h`);
      if (warn) parts.push(`<strong>${warn}</strong> approaching limit`);
      summary.innerHTML = parts.join(" &nbsp;·&nbsp; ");
    }

    document.getElementById("compliance-csv").onclick = () => {
      const header = ["Name", "Position", "Discipline", "Client",
        "Worst window", "Window total (h)", "Limit (h)", "Over/under (h)"];
      const body = rows.map((r) => [
        r.name, r.position, r.discipline, r.client,
        r.windowLabel, Math.round(r.total), LIMIT, Math.round(r.total - LIMIT),
      ]);
      NW.downloadCsv(`northwest-compliance-${view.data.current_month}.csv`, [header, ...body]);
    };
  };
})(window.NW);
