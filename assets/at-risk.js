// At-risk dropoff list: historically strong utilisation that drops off next month.
(function (NW) {
  function compute(view) {
    const { data, workers } = view;
    const months = data.reporting_months;
    const curIdx = months.indexOf(data.current_month);
    const trailing = months.slice(Math.max(0, curIdx - data.months_behind), curIdx);
    const nextMonth = months[curIdx + 1];

    const rows = [];
    workers.forEach((w) => {
      const ph = trailing.map((m) => w.monthly[m]?.hours || 0);
      const avg = ph.reduce((a, b) => a + b, 0) / (ph.length || 1);
      const nextH = w.monthly[nextMonth]?.hours || 0;
      if (avg >= 120 && nextH <= 40) {
        const curClient = w.monthly[data.current_month]?.client || w.primary_client;
        rows.push({
          id: w.id,
          name: w.name,
          position: w.position,
          client: curClient,
          avg,
          next: nextH,
          drop: avg - nextH,
        });
      }
    });
    rows.sort((a, b) => b.drop - a.drop);
    return rows;
  }

  NW.renderAtRisk = function (view) {
    const rows = compute(view);
    const tbody = document.querySelector("#atrisk-table tbody");
    tbody.innerHTML = "";
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="worker-name"><a href="${NW.workerUrl(r.id)}">${r.name}</a></td>
        <td class="cell-left">${r.position}</td>
        <td class="cell-left"><span class="dot ${NW.clientSlug(r.client)}"></span> ${r.client}</td>
        <td class="num">${NW.fmtInt(r.avg)}h</td>
        <td class="num">${NW.fmtInt(r.next)}h</td>
        <td class="num"><strong>${NW.fmtInt(r.drop)}h</strong></td>`;
      tbody.appendChild(tr);
    });

    const summary = document.getElementById("atrisk-summary");
    if (rows.length === 0) {
      summary.innerHTML = `<span class="badge ok">No at-risk workers in current view</span>`;
    } else {
      const totalHrs = rows.reduce((s, r) => s + r.drop, 0);
      summary.innerHTML = `<strong>${rows.length}</strong> workers · combined dropoff ${NW.fmtInt(totalHrs)}h`;
    }

    document.getElementById("atrisk-csv").onclick = () => {
      const header = ["Name", "Position", "Client", "Trailing 3mo avg (h)", "Next month committed (h)", "Drop (h)"];
      const body = rows.map((r) => [r.name, r.position, r.client, Math.round(r.avg), Math.round(r.next), Math.round(r.drop)]);
      NW.downloadCsv(`northwest-at-risk-${view.data.current_month}.csv`, [header, ...body]);
    };
  };
})(window.NW);
