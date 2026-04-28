NW.bootPage(function (view) {
  const shutdowns = (view.data.shutdowns || []).filter((s) => {
    if (!view.workers.length) return true;
    const workerIds = new Set(view.workers.map((w) => w.id));
    return view.data.workers.some((w) => workerIds.has(w.id) && w.shutdown_outcomes && w.shutdown_outcomes[s.id]);
  });

  const allTrades = [];
  shutdowns.forEach((s) => (s.trades || []).forEach((t) => allTrades.push(t)));
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

  const byMonth = {};
  shutdowns.forEach((s) => {
    const mk = s.commence_month || "Unknown";
    if (!byMonth[mk]) byMonth[mk] = [];
    byMonth[mk].push(s);
  });

  const months = Object.keys(byMonth).sort();
  const fthead = document.getElementById("fulfilment-thead");
  const ftbody = document.getElementById("fulfilment-tbody");
  if (fthead && ftbody) {
    fthead.innerHTML = `<tr><th class=\"cell-left\">Month</th><th class=\"cell-left\">Shutdown</th><th class=\"cell-left\">Trade</th><th class=\"num\">Requested</th><th class=\"num\">Filled</th><th class=\"num\">Gap</th><th class=\"num\">Fill rate</th></tr>`;
    ftbody.innerHTML = "";

    months.forEach((m) => {
      const list = byMonth[m];
      let firstMonthRow = true;
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      list.forEach((s) => {
        const trades = s.trades && s.trades.length ? s.trades : [{ trade: "(none)", requested: 0, filled: 0, gap: 0, fill_rate: null }];
        trades.forEach((t, i) => {
          const tr = document.createElement("tr");
          const monthCell = firstMonthRow && i === 0 ? `<td class=\"cell-left\" rowspan=\"${list.reduce((n, x) => n + Math.max((x.trades || []).length, 1), 0)}\">${NW.fmtMonth(m)}</td>` : "";
          const shutdownCell = i === 0
            ? `<td class=\"cell-left\" rowspan=\"${trades.length}\">${s.name}${s.client ? ` <span class=\"small muted\">(${s.client})</span>` : ""}</td>`
            : "";
          tr.innerHTML = `${monthCell}${shutdownCell}<td class=\"cell-left\">${t.trade}</td><td class=\"num\">${NW.fmtInt(t.requested)}</td><td class=\"num\">${NW.fmtInt(t.filled)}</td><td class=\"num\">${NW.fmtInt((t.requested || 0) - (t.filled || 0))}</td><td class=\"num\">${t.requested ? Math.round((t.filled / t.requested) * 100) + "%" : "—"}</td>`;
          ftbody.appendChild(tr);
          firstMonthRow = false;
        });
      });
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
