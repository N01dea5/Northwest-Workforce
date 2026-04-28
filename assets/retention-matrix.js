(function (NW) {
  NW.renderRetentionMatrix = function (view) {
    const shutdowns = (view.data.shutdowns || []).slice().sort((a, b) => (a.commence_date || "").localeCompare(b.commence_date || ""));
    const thead = document.getElementById("retention-matrix-thead");
    const tbody = document.getElementById("retention-matrix-tbody");
    if (!thead || !tbody) return;

    const byMonth = {};
    shutdowns.forEach((s) => {
      const mk = s.commence_month || "unknown";
      if (!byMonth[mk]) byMonth[mk] = [];
      byMonth[mk].push(s);
    });
    const months = Object.keys(byMonth).sort();

    const monthRow = `<tr><th class=\"cell-left\" rowspan=\"2\">Employee</th>${months.map((m) => `<th colspan=\"${byMonth[m].length}\">${NW.fmtMonth(m)}</th>`).join("")}</tr>`;
    const shutdownRow = `<tr>${months.map((m) => byMonth[m].map((s) => `<th title=\"${s.name}\">${s.name}</th>`).join("")).join("")}</tr>`;
    thead.innerHTML = monthRow + shutdownRow;
    tbody.innerHTML = "";

    const workers = view.workers.slice().sort((a, b) => a.name.localeCompare(b.name));
    workers.forEach((w) => {
      const tr = document.createElement("tr");
      const cells = [`<td class=\"worker-name\"><a href=\"${NW.workerUrl(w.id)}\">${w.name}</a></td>`];
      months.forEach((m) => {
        byMonth[m].forEach((s) => {
          const outcome = (w.shutdown_outcomes || {})[s.id] || "";
          if (outcome === "worked") {
            cells.push('<td class="matrix-worked" title="Worked">✓</td>');
          } else if (outcome === "declined") {
            cells.push('<td class="matrix-declined" title="Declined or rejected">✕</td>');
          } else {
            cells.push('<td class="matrix-empty">&nbsp;</td>');
          }
        });
      });
      tr.innerHTML = cells.join("");
      tbody.appendChild(tr);
    });
  };
})(window.NW);
