(function (NW) {
  NW.renderRetentionMatrix = function (view) {
    const shutdowns = (view.data.shutdowns || []).slice().sort((a, b) => (a.commence_date || "").localeCompare(b.commence_date || ""));
    const thead = document.getElementById("retention-matrix-thead");
    const tbody = document.getElementById("retention-matrix-tbody");
    if (!thead || !tbody) return;

    thead.innerHTML = `<tr><th class=\"cell-left\">Employee</th>${shutdowns.map((s) => `<th title=\"${s.name}\">${NW.fmtMonth(s.commence_month)}</th>`).join("")}</tr>`;
    tbody.innerHTML = "";

    const workers = view.workers.slice().sort((a, b) => a.name.localeCompare(b.name));
    workers.forEach((w) => {
      const tr = document.createElement("tr");
      const cells = [`<td class=\"worker-name\"><a href=\"${NW.workerUrl(w.id)}\">${w.name}</a></td>`];
      shutdowns.forEach((s) => {
        const outcome = (w.shutdown_outcomes || {})[s.id] || "";
        if (outcome === "worked") {
          cells.push('<td class="matrix-worked" title="Worked">✓</td>');
        } else if (outcome === "declined") {
          cells.push('<td class="matrix-declined" title="Declined or rejected">✕</td>');
        } else {
          cells.push('<td class="matrix-empty">&nbsp;</td>');
        }
      });
      tr.innerHTML = cells.join("");
      tbody.appendChild(tr);
    });
  };
})(window.NW);
