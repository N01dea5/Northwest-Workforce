(function (NW) {
  NW.renderRetentionMatrix = function (view) {
    const esc = NW.escapeHtml;
    const thead = document.getElementById("retention-matrix-thead");
    const tbody = document.getElementById("retention-matrix-tbody");
    if (!thead || !tbody) return;

    // Limit to shutdowns where at least one filtered worker has an outcome —
    // keeps the matrix readable when filters narrow the worker set.
    const allShutdowns = view.data.shutdowns || [];
    const relevantIds = new Set();
    view.workers.forEach((w) => {
      if (!w.shutdown_outcomes) return;
      Object.keys(w.shutdown_outcomes).forEach((id) => relevantIds.add(id));
    });
    const shutdowns = allShutdowns
      .filter((s) => relevantIds.has(s.id))
      .sort((a, b) => (a.commence_date || "").localeCompare(b.commence_date || ""));

    if (!shutdowns.length || !view.workers.length) {
      thead.innerHTML = "";
      tbody.innerHTML = `<tr><td class="muted" style="padding:14px;">No shutdown outcomes for the current filter.</td></tr>`;
      return;
    }

    const byMonth = {};
    shutdowns.forEach((s) => {
      const mk = s.commence_month || "unknown";
      if (!byMonth[mk]) byMonth[mk] = [];
      byMonth[mk].push(s);
    });
    const months = Object.keys(byMonth).sort();

    const monthRow = `<tr><th class="cell-left" rowspan="2">Employee</th>${months
      .map((m) => `<th colspan="${byMonth[m].length}">${esc(NW.fmtMonth(m))}</th>`)
      .join("")}</tr>`;
    const shutdownRow = `<tr>${months
      .map((m) =>
        byMonth[m]
          .map((s) => `<th title="${esc(s.name)}">${esc(s.name)}</th>`)
          .join("")
      )
      .join("")}</tr>`;
    thead.innerHTML = monthRow + shutdownRow;
    tbody.innerHTML = "";

    const workers = view.workers.slice().sort((a, b) => a.name.localeCompare(b.name));
    workers.forEach((w) => {
      const tr = document.createElement("tr");
      const cells = [
        `<td class="worker-name"><a href="${esc(NW.workerUrl(w.id))}">${esc(w.name)}</a></td>`,
      ];
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
