NW.bootPage(function (view) {
  const esc = NW.escapeHtml;
  const fulfilment = view.data.fulfilment || { by_client_month: {}, by_trade: [], totals: {} };
  const byClientMonth = fulfilment.by_client_month || {};
  const byTrade = fulfilment.by_trade || [];

  // The reporting window already runs 3-back / current / 3-forward — clamp
  // the table columns to that range regardless of what JobPlanningView held.
  const months = view.data.reporting_months.slice();

  // Honour the client chips: empty Set = show all dashboard clients.
  const activeClients = window.NW_APP?.state.filters.clients || new Set();
  const clients = view.data.clients.filter(
    (c) => !activeClients.size || activeClients.has(c)
  );

  // KPIs — sum within the (filtered clients × reporting months) view so the
  // tiles match the table the user is looking at.
  let requested = 0;
  let filled = 0;
  clients.forEach((c) => {
    months.forEach((m) => {
      const v = byClientMonth[c]?.[m];
      if (!v) return;
      requested += v.requested || 0;
      filled    += v.filled    || 0;
    });
  });

  const setVal = (id, html) => {
    const el = document.querySelector(`#${id} .value`);
    if (el) el.innerHTML = html;
  };
  setVal("kpi-req", NW.fmtInt(requested));
  setVal("kpi-fill", NW.fmtInt(filled));
  setVal("kpi-gap", NW.fmtInt(Math.max(0, requested - filled)));
  setVal(
    "kpi-rate",
    requested
      ? `${Math.round((filled / requested) * 100)}<span class="unit">%</span>`
      : "—"
  );

  // ---- Client × month table -------------------------------------------------
  const fthead = document.getElementById("fulfilment-thead");
  const ftbody = document.getElementById("fulfilment-tbody");
  if (fthead && ftbody) {
    if (!clients.length || !requested) {
      fthead.innerHTML = "";
      ftbody.innerHTML = `<tr><td class="muted" style="padding:14px;">No requested positions in the reporting window for the current filter.</td></tr>`;
    } else {
      const curIdx = months.indexOf(view.data.current_month);
      fthead.innerHTML = `<tr><th class="cell-left">Client</th>${months
        .map((m, i) => {
          const cls = i < curIdx ? "month-past" : i === curIdx ? "month-cur" : "month-future";
          return `<th class="${cls}">${esc(NW.fmtMonth(m))}</th>`;
        })
        .join("")}<th>Total</th></tr>`;
      ftbody.innerHTML = "";

      clients.forEach((client) => {
        let rowReq = 0;
        let rowFill = 0;
        const cells = [
          `<td class="cell-left"><span class="dot ${esc(NW.clientSlug(client))}"></span> ${esc(client)}</td>`,
        ];
        months.forEach((m) => {
          const v = byClientMonth[client]?.[m] || { requested: 0, filled: 0 };
          rowReq  += v.requested;
          rowFill += v.filled;
          if (!v.requested) {
            cells.push(`<td class="num muted">—</td>`);
            return;
          }
          const pct = Math.round((v.filled / v.requested) * 100);
          cells.push(
            `<td class="num" title="Requested ${v.requested} · Filled ${v.filled}">${NW.fmtInt(v.filled)}/${NW.fmtInt(v.requested)} (${pct}%)</td>`
          );
        });
        const rowPct = rowReq ? Math.round((rowFill / rowReq) * 100) : null;
        cells.push(
          `<td class="num"><strong>${
            rowReq
              ? `${NW.fmtInt(rowFill)}/${NW.fmtInt(rowReq)}${rowPct !== null ? ` (${rowPct}%)` : ""}`
              : "—"
          }</strong></td>`
        );
        const tr = document.createElement("tr");
        tr.innerHTML = cells.join("");
        ftbody.appendChild(tr);
      });
    }
  }

  // ---- CSV export for the client × month table -----------------------------
  const csvBtn = document.getElementById("fulfilment-csv");
  if (csvBtn) {
    csvBtn.onclick = () => {
      const header = ["Client", ...months.map((m) => NW.fmtMonth(m)), "Requested total", "Filled total", "Fill rate"];
      const body = clients.map((client) => {
        const cells = [client];
        let req = 0;
        let fil = 0;
        months.forEach((m) => {
          const v = byClientMonth[client]?.[m] || { requested: 0, filled: 0 };
          req += v.requested;
          fil += v.filled;
          cells.push(v.requested ? `${v.filled}/${v.requested}` : "");
        });
        cells.push(req, fil, req ? `${Math.round((fil / req) * 100)}%` : "");
        return cells;
      });
      NW.downloadCsv(`northwest-fulfilment-${view.data.current_month}.csv`, [header, ...body]);
    };
  }

  // ---- Discipline / trade pressure -----------------------------------------
  // Trade rollup is pre-computed across the *whole* JobPlanningView window;
  // clamp here to dashboard clients via the same active-clients filter.
  // (The python aggregation already drops non-dashboard clients, but it's
  // not split per-client — so the chip filter just doesn't narrow this
  // section. We surface that via the hint text.)
  const disciplineBody = document.getElementById("discipline-fulfilment-body");
  if (!disciplineBody) return;

  const summaryEl = document.getElementById("discipline-fulfilment-summary");
  if (summaryEl) {
    summaryEl.textContent = byTrade.length
      ? `${byTrade.length} trades · ${fulfilment.totals?.requested || 0} requested · ${fulfilment.totals?.filled || 0} filled (all dashboard clients)`
      : "No trade requests in scope";
  }

  disciplineBody.innerHTML = "";
  if (!byTrade.length) {
    disciplineBody.innerHTML = `<tr><td class="muted" colspan="5" style="padding:14px;">No trade requests in scope.</td></tr>`;
  } else {
    byTrade.forEach((t) => {
      const req = t.requested;
      const fil = t.filled;
      const gap = req - fil;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="cell-left">${esc(t.trade)}${t.discipline ? ` <span class="small muted">(${esc(t.discipline)})</span>` : ""}</td><td class="num">${NW.fmtInt(req)}</td><td class="num">${NW.fmtInt(fil)}</td><td class="num">${NW.fmtInt(gap)}</td><td class="num">${req ? Math.round((fil / req) * 100) + "%" : "—"}</td>`;
      disciplineBody.appendChild(tr);
    });
  }

  const discBtn = document.getElementById("discipline-csv");
  if (discBtn) {
    discBtn.onclick = () => {
      const header = ["Trade", "Discipline", "Requested", "Filled", "Gap", "Fill rate"];
      const body = byTrade.map((t) => [
        t.trade,
        t.discipline || "",
        t.requested,
        t.filled,
        t.requested - t.filled,
        t.requested ? `${Math.round((t.filled / t.requested) * 100)}%` : "",
      ]);
      NW.downloadCsv(`northwest-fulfilment-discipline-${view.data.current_month}.csv`, [header, ...body]);
    };
  }
});
