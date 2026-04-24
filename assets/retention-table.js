// Summary position × month table + per-client clones.
(function (NW) {
  // Build {position: discipline} from worker list.
  function disciplineMap(workers) {
    const map = {};
    workers.forEach((w) => {
      if (w.position && w.discipline && !map[w.position]) map[w.position] = w.discipline;
    });
    return map;
  }

  // Aggregate stats across a set of positions (discipline subtotal).
  function discCellStats(workers, positions, month, monthPrev) {
    const posSet = new Set(positions);
    const inThis = new Set();
    let hrsSum = 0;
    workers.forEach((w) => {
      if (!posSet.has(w.position)) return;
      const mm = w.monthly[month];
      if (mm && (mm.hours || 0) > 0) { inThis.add(w.id); hrsSum += mm.hours; }
    });
    const hc = inThis.size;
    const avg = hc ? hrsSum / hc : 0;
    let retention = null;
    if (monthPrev) {
      const inPrev = new Set();
      workers.forEach((w) => {
        if (!posSet.has(w.position)) return;
        if ((w.monthly[monthPrev]?.hours || 0) > 0) inPrev.add(w.id);
      });
      if (inPrev.size) {
        let intersect = 0;
        inPrev.forEach((id) => { if (inThis.has(id)) intersect++; });
        retention = intersect / inPrev.size;
      }
    }
    return { hc, avg, retention };
  }

  // For each (position, client-filter, month): compute headcount,
  // avg hours, and retention % from prior month.
  function cellStats(workers, position, month, monthPrev) {
    const inThis = new Set();
    let hrsSum = 0;
    workers.forEach((w) => {
      if (w.position !== position) return;
      const mm = w.monthly[month];
      if (!mm) return;
      if ((mm.hours || 0) > 0) {
        inThis.add(w.id);
        hrsSum += (mm.hours || 0);
      }
    });
    const hc = inThis.size;
    const avg = hc ? hrsSum / hc : 0;

    let retention = null;
    if (monthPrev) {
      const inPrev = new Set();
      workers.forEach((w) => {
        if (w.position !== position) return;
        if ((w.monthly[monthPrev]?.hours || 0) > 0) inPrev.add(w.id);
      });
      if (inPrev.size) {
        let intersect = 0;
        inPrev.forEach((id) => { if (inThis.has(id)) intersect += 1; });
        retention = intersect / inPrev.size;
      }
    }
    return { hc, avg, retention };
  }

  function buildTable(view, { scopeClient = null, tableEl }) {
    const { data, workers } = view;
    const months = data.reporting_months;
    const curIdx = months.indexOf(data.current_month);
    const positions = data.positions_top20.filter(
      (p) => !view.state?.position || p === view.state.position
    );

    const scopedWorkers = scopeClient
      ? workers.filter((w) => months.some((m) => w.monthly[m]?.client === scopeClient))
      : workers;

    // For per-client view: treat the "worker is in this position/month" predicate
    // as ALSO requiring monthly[m].client === scopeClient.
    const effectiveWorkers = scopeClient
      ? scopedWorkers.map((w) => {
          const monthly = {};
          months.forEach((m) => {
            const mm = w.monthly[m];
            if (mm && mm.client === scopeClient) monthly[m] = mm;
            else monthly[m] = { client: null, hours: 0, committed: mm?.committed || false };
          });
          return { ...w, monthly };
        })
      : scopedWorkers;

    // Head row
    const thead = tableEl.querySelector("thead");
    const tbody = tableEl.querySelector("tbody");
    thead.innerHTML = "";
    tbody.innerHTML = "";

    const topRow = document.createElement("tr");
    topRow.innerHTML = `<th rowspan="2">Discipline / Position</th>` +
      months.map((m, i) => {
        const past = i < curIdx;
        const cur = i === curIdx;
        const future = i > curIdx;
        const cls = past ? "month-past" : cur ? "month-cur" : "month-future";
        const div = i === curIdx + 1 ? " div-future" : "";
        return `<th class="${cls}${div}" style="text-align:center;">${NW.fmtMonth(m)}${cur ? " <span class='pill now'>now</span>" : ""}${future ? " <span class='pill fwd'>fwd</span>" : ""}</th>`;
      }).join("");
    thead.appendChild(topRow);

    // Group positions by discipline, preserving top-positions order within each group.
    const discMap = disciplineMap(effectiveWorkers);
    const groupOrder = [];
    const groupPositions = {};
    positions.forEach((pos) => {
      const disc = discMap[pos] || "Other";
      if (!groupPositions[disc]) { groupPositions[disc] = []; groupOrder.push(disc); }
      groupPositions[disc].push(pos);
    });

    // Data rows grouped by discipline
    groupOrder.forEach((disc) => {
      // Discipline header row
      const discTr = document.createElement("tr");
      discTr.className = "disc-group-header";
      discTr.innerHTML = `<td class="disc-label" colspan="${months.length + 1}">${disc}</td>`;
      tbody.appendChild(discTr);

      groupPositions[disc].forEach((pos) => {
        const tr = document.createElement("tr");
        const cells = [`<td class="pos-name pos-indent">${pos}</td>`];
        months.forEach((m, i) => {
          const mPrev = i > 0 ? months[i - 1] : null;
          const { hc, avg, retention } = cellStats(effectiveWorkers, pos, m, mPrev);
          const clsBits = ["ret-cell"];
          if (i > curIdx) clsBits.push("future");
          if (i === curIdx) clsBits.push("current");
          if (i === curIdx + 1) clsBits.push("div-future");
          clsBits.push(NW.retentionClass(retention));
          const retTxt = retention == null ? "" : ` · ret ${NW.fmtPct(retention)}`;
          const title = `Headcount ${hc} · avg ${NW.fmtHours(avg)}${retTxt}`;
          cells.push(
            `<td class="${clsBits.join(" ")}" title="${title}">
              <div class="hc">${hc || "·"}</div>
              <div class="hrs">${hc ? NW.fmtInt(avg) + "h" : ""}</div>
            </td>`
          );
        });
        tr.innerHTML = cells.join("");
        tbody.appendChild(tr);
      });

      // Discipline subtotal row
      if (groupPositions[disc].length > 1) {
        const subTr = document.createElement("tr");
        subTr.className = "disc-subtotal";
        const subCells = [`<td class="subtotal-label">${disc} total</td>`];
        months.forEach((m, i) => {
          const mPrev = i > 0 ? months[i - 1] : null;
          const { hc, avg, retention } = discCellStats(effectiveWorkers, groupPositions[disc], m, mPrev);
          const clsBits = ["ret-cell"];
          if (i > curIdx) clsBits.push("future");
          if (i === curIdx) clsBits.push("current");
          if (i === curIdx + 1) clsBits.push("div-future");
          clsBits.push(NW.retentionClass(retention));
          const retTxt = retention == null ? "" : ` · ret ${NW.fmtPct(retention)}`;
          subCells.push(
            `<td class="${clsBits.join(" ")}" title="${disc} total · ${hc} workers · avg ${NW.fmtHours(avg)}${retTxt}">
              <div class="hc">${hc || "·"}</div>
              <div class="hrs">${hc ? NW.fmtInt(avg) + "h" : ""}</div>
            </td>`
          );
        });
        subTr.innerHTML = subCells.join("");
        tbody.appendChild(subTr);
      }
    });
  }

  NW.renderSummaryTable = function (view) {
    const tbl = document.getElementById("summary-table");
    buildTable(
      { ...view, state: window.NW_APP?.state.filters },
      { scopeClient: null, tableEl: tbl }
    );
  };

  NW.renderClientTables = function (view) {
    const host = document.getElementById("client-tables");
    host.innerHTML = "";
    const lastOpen = localStorage.getItem("nw-last-open-client");
    view.data.clients.forEach((client) => {
      const det = document.createElement("details");
      det.className = "client-block";
      if (client === lastOpen) det.open = true;
      det.innerHTML = `
        <summary>
          <span class="dot ${NW.clientSlug(client)}"></span>
          ${client}
          <span class="small muted" style="margin-left:10px;">Position × month retention &amp; utilisation</span>
        </summary>
        <div class="body">
          <div class="table-scroll">
            <table class="tbl">
              <thead></thead><tbody></tbody>
            </table>
          </div>
        </div>`;
      det.addEventListener("toggle", () => {
        if (det.open) localStorage.setItem("nw-last-open-client", client);
      });
      host.appendChild(det);
      const tbl = det.querySelector("table");
      buildTable(
        { ...view, state: window.NW_APP?.state.filters },
        { scopeClient: client, tableEl: tbl }
      );
    });
  };
})(window.NW);
