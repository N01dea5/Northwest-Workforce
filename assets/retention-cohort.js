// Cohort survival table: for each month's new-starters, track what % remain
// active at +1, +2, … months after their start.
(function (NW) {
  NW.renderCohortSurvival = function (view) {
    const { data, workers } = view;
    const months = data.reporting_months;

    // Group workers by their start cohort (month within reporting window only)
    const cohortMap = {};
    workers.forEach((w) => {
      const mk = (w.employment_start || "").slice(0, 7);
      if (!months.includes(mk)) return;
      if (!cohortMap[mk]) cohortMap[mk] = [];
      cohortMap[mk].push(w);
    });

    const cohortMonths = months.filter((m) => cohortMap[m]);

    const tbody = document.getElementById("cohort-tbody");
    const thead = document.getElementById("cohort-thead");
    if (!tbody || !thead) return;

    // Header: cohort | size | +0 | +1 | +2 | …
    const maxLag = months.length - 1;
    thead.innerHTML = `<tr>
      <th class="cell-left">Start cohort</th>
      <th class="num">Starters</th>
      ${Array.from({ length: maxLag + 1 }, (_, i) =>
        `<th class="num">${i === 0 ? "Start mo" : `+${i}mo`}</th>`
      ).join("")}
    </tr>`;

    tbody.innerHTML = "";
    if (!cohortMonths.length) {
      tbody.innerHTML = `<tr><td colspan="${maxLag + 3}" class="muted" style="padding:12px;">
        No new starters recorded within the reporting window.</td></tr>`;
      return;
    }

    cohortMonths.forEach((startMk) => {
      const cohort = cohortMap[startMk];
      const startIdx = months.indexOf(startMk);
      const tr = document.createElement("tr");
      let html = `<td class="cell-left">${NW.fmtMonth(startMk)}</td>`;
      html += `<td class="num">${cohort.length}</td>`;

      for (let lag = 0; lag <= maxLag; lag++) {
        const tIdx = startIdx + lag;
        if (tIdx >= months.length) {
          html += `<td class="muted" style="text-align:center;">—</td>`;
          continue;
        }
        const tm = months[tIdx];
        if (lag === 0) {
          html += `<td class="num">100%</td>`;
        } else {
          const active = cohort.filter((w) => (w.monthly[tm]?.hours || 0) > 0).length;
          const pct = cohort.length ? active / cohort.length : 0;
          const cls = pct >= 0.7 ? "ok" : pct >= 0.5 ? "warn" : "risk";
          html += `<td class="num"><span class="badge ${cls}">${Math.round(pct * 100)}%</span></td>`;
        }
      }

      tr.innerHTML = html;
      tbody.appendChild(tr);
    });
  };
})(window.NW);
