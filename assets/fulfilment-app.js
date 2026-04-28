NW.bootPage(function (view) {
  const workerIds = new Set(view.workers.map((w) => w.id));
  const shutdowns = (view.data.shutdowns || []).filter((s) => {
    // Respect page filters by only keeping shutdowns touched by filtered workers.
    return view.data.workers.some((w) => workerIds.has(w.id) && w.shutdown_outcomes && w.shutdown_outcomes[s.id]);
  });

  const allTrades = [];
  shutdowns.forEach((s) => (s.trades || []).forEach((t) => allTrades.push({ ...t, client: s.client, month: s.commence_month })));
  const requested = allTrades.reduce((n, t) => n + (t.requested || 0), 0);
  const filled = allTrades.reduce((n, t) => n + (t.filled || 0), 0);

  const setVal = (id, html) => {
    const el = document.querySelector(`#${id} .value`);
    if (el) el.innerHTML = html;
  };
  setVal("kpi-req", NW.fmtInt(requested));
  setVal("kpi-fill", NW.fmtInt(filled));
  setVal("kpi-gap", NW.fmtInt(Math.max(0, requested - filled)));
  setVal("kpi-rate", requested ? `${Math.round((filled / requested) * 100)}<span class=\"unit\">%</span>` : "—");

  const clients = view.data.clients.slice();
  const months = [...new Set(shutdowns.map((s) => s.commence_month).filter(Boolean))].sort();

  const byClientMonth = {};
  allTrades.forEach((t) => {
    const c = t.client || "Unassigned";
    const m = t.month || "Unknown";
    byClientMonth[c] = byClientMonth[c] || {};
    byClientMonth[c][m] = byClientMonth[c][m] || { requested: 0, filled: 0 };
    byClientMonth[c][m].requested += t.requested || 0;
    byClientMonth[c][m].filled += t.filled || 0;
  });

  const fthead = document.getElementById("fulfilment-thead");
  const ftbody = document.getElementById("fulfilment-tbody");
  if (fthead && ftbody) {
    fthead.innerHTML = `<tr><th class=\"cell-left\">Client</th>${months.map((m) => `<th>${NW.fmtMonth(m)}</th>`).join("")}<th>Total</th></tr>`;
    ftbody.innerHTML = "";

    const rowOrder = [...clients, ...Object.keys(byClientMonth).filter((c) => !clients.includes(c))];
    rowOrder.forEach((client) => {
      const tr = document.createElement("tr");
      let rowReq = 0;
      let rowFill = 0;
      const cells = [`<td class=\"cell-left\"><span class=\"dot ${NW.clientSlug(client)}\"></span> ${client}</td>`];
      months.forEach((m) => {
        const v = byClientMonth[client]?.[m] || { requested: 0, filled: 0 };
        rowReq += v.requested;
        rowFill += v.filled;
        const pct = v.requested ? Math.round((v.filled / v.requested) * 100) : null;
        cells.push(`<td class=\"num\" title=\"Requested ${v.requested} · Filled ${v.filled}\">${v.requested ? `${NW.fmtInt(v.filled)}/${NW.fmtInt(v.requested)}${pct !== null ? ` (${pct}%)` : ""}` : "—"}</td>`);
      });
      const rowPct = rowReq ? Math.round((rowFill / rowReq) * 100) : null;
      cells.push(`<td class=\"num\"><strong>${rowReq ? `${NW.fmtInt(rowFill)}/${NW.fmtInt(rowReq)}${rowPct !== null ? ` (${rowPct}%)` : ""}` : "—"}</strong></td>`);
      tr.innerHTML = cells.join("");
      ftbody.appendChild(tr);
    });
  }

  const disciplineBody = document.getElementById("discipline-fulfilment-body");
  if (!disciplineBody) return;
  const byTrade = {};
  allTrades.forEach((t) => {
    if (!byTrade[t.trade]) byTrade[t.trade] = { requested: 0, filled: 0 };
    byTrade[t.trade].requested += t.requested || 0;
    byTrade[t.trade].filled += t.filled || 0;
  });

  const rows = Object.entries(byTrade).sort((a, b) => ((b[1].requested - b[1].filled) - (a[1].requested - a[1].filled)));
  disciplineBody.innerHTML = "";
  rows.forEach(([trade, v]) => {
    const req = v.requested;
    const fil = v.filled;
    const gap = req - fil;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class=\"cell-left\">${trade}</td><td class=\"num\">${NW.fmtInt(req)}</td><td class=\"num\">${NW.fmtInt(fil)}</td><td class=\"num\">${NW.fmtInt(gap)}</td><td class=\"num\">${req ? Math.round((fil / req) * 100) + "%" : "—"}</td>`;
    disciplineBody.appendChild(tr);
  });
});
