// Position flow table: current headcount, 7-month sparkline,
// avg new / drops per month, and churn rate.
(function (NW) {
  function headcount(workers, position, month, client = null) {
    let n = 0;
    workers.forEach((w) => {
      if (w.position !== position) return;
      const mm = w.monthly[month];
      if (!mm) return;
      if (client && mm.client !== client) return;
      if ((mm.hours || 0) > 0 || mm.committed) n += 1;
    });
    return n;
  }

  function flowRow(view, position, client = null) {
    const { data, workers } = view;
    const months = data.reporting_months;
    const curIdx = months.indexOf(data.current_month);
    const trailing = months.slice(Math.max(0, curIdx - data.months_behind), curIdx);

    const trend = months.map((m) => headcount(workers, position, m, client));
    const current = trend[curIdx];

    // New / mo: workers whose employment_start falls in trailing 3 months
    // AND who match position (AND if client-scoped, touched this client in that month)
    let newCount = 0;
    workers.forEach((w) => {
      if (w.position !== position) return;
      const es = (w.employment_start || "").slice(0, 7);
      if (!trailing.includes(es)) return;
      if (client && w.monthly[es]?.client !== client) return;
      newCount += 1;
    });
    const newPerMo = newCount / (trailing.length || 1);

    // Drops / mo: workers who had hours in trailing[i] (at client) but 0
    // hours and no committed in trailing[i+1] onwards
    let dropCount = 0;
    trailing.forEach((m, i) => {
      const later = months.slice(months.indexOf(m) + 1);
      workers.forEach((w) => {
        if (w.position !== position) return;
        const mm = w.monthly[m];
        if (!mm || (mm.hours || 0) === 0) return;
        if (client && mm.client !== client) return;
        const hasLater = later.some((lm) => {
          const lmm = w.monthly[lm];
          if (!lmm) return false;
          if (client && lmm.client !== client) return false;
          return (lmm.hours || 0) > 0 || lmm.committed;
        });
        if (!hasLater) dropCount += 1;
      });
    });
    const dropsPerMo = dropCount / (trailing.length || 1);

    // Churn rate: avg drops(m)/headcount(m-1) across trailing months
    const ratios = [];
    trailing.forEach((m) => {
      const mIdx = months.indexOf(m);
      if (mIdx <= 0) return;
      const prev = months[mIdx - 1];
      const prevHc = headcount(workers, position, prev, client);
      if (!prevHc) return;
      const later = months.slice(mIdx + 1);
      let drops = 0;
      workers.forEach((w) => {
        if (w.position !== position) return;
        const mm = w.monthly[m];
        if (!mm || (mm.hours || 0) === 0) return;
        if (client && mm.client !== client) return;
        const hasLater = later.some((lm) => {
          const lmm = w.monthly[lm];
          if (!lmm) return false;
          if (client && lmm.client !== client) return false;
          return (lmm.hours || 0) > 0 || lmm.committed;
        });
        if (!hasLater) drops += 1;
      });
      ratios.push(drops / prevHc);
    });
    const churn = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;

    return { position, current, trend, newPerMo, dropsPerMo, churn };
  }

  function cellHtml(row) {
    return `
      <td class="pos-name">${row.position}</td>
      <td class="num">${NW.fmtInt(row.current)}</td>
      <td>${NW.sparkline(row.trend, { width: 90, height: 22 })}</td>
      <td class="num">${row.newPerMo.toFixed(1)}</td>
      <td class="num">${row.dropsPerMo.toFixed(1)}</td>
      <td class="num">
        <span class="badge ${
          row.churn < 0.05 ? "ok" : row.churn < 0.12 ? "warn" : "risk"
        }">${(row.churn * 100).toFixed(1)}%</span>
      </td>`;
  }

  NW.renderPositionFlow = function (view) {
    const tbody = document.querySelector("#flow-table tbody");
    tbody.innerHTML = "";
    const positions = view.data.positions_top20;
    const posFilter = window.NW_APP?.state.filters.position;
    positions.forEach((pos) => {
      if (posFilter && pos !== posFilter) return;
      const row = flowRow(view, pos, null);
      const tr = document.createElement("tr");
      tr.innerHTML = cellHtml(row);
      tr.style.cursor = "pointer";
      tr.addEventListener("click", () => toggleExpand(view, pos, tr));
      tbody.appendChild(tr);
    });
  };

  function toggleExpand(view, position, parentTr) {
    const next = parentTr.nextElementSibling;
    if (next && next.classList.contains("row-expand")) {
      next.remove();
      return;
    }
    const tr = document.createElement("tr");
    tr.className = "row-expand";
    const td = document.createElement("td");
    td.colSpan = 6;
    const table = document.createElement("table");
    table.className = "tbl";
    table.innerHTML = `
      <thead><tr>
        <th>Client</th><th class="num">Headcount</th><th>Trend</th>
        <th class="num">New / mo</th><th class="num">Drops / mo</th>
        <th class="num">Churn</th>
      </tr></thead><tbody></tbody>`;
    const tbody = table.querySelector("tbody");
    view.data.clients.forEach((client) => {
      const r = flowRow(view, position, client);
      const ctr = document.createElement("tr");
      ctr.innerHTML = `
        <td><span class="dot ${NW.clientSlug(client)}"></span> ${client}</td>
        <td class="num">${NW.fmtInt(r.current)}</td>
        <td>${NW.sparkline(r.trend, { width: 90, height: 22 })}</td>
        <td class="num">${r.newPerMo.toFixed(1)}</td>
        <td class="num">${r.dropsPerMo.toFixed(1)}</td>
        <td class="num"><span class="badge ${
          r.churn < 0.05 ? "ok" : r.churn < 0.12 ? "warn" : "risk"
        }">${(r.churn * 100).toFixed(1)}%</span></td>`;
      tbody.appendChild(ctr);
    });
    td.appendChild(table);
    tr.appendChild(td);
    parentTr.after(tr);
  }
})(window.NW);
