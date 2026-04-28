// Fatigue compliance: client-specific rules using parser-derived fatigueMetrics.
(function (NW) {
  const STATUS_ORDER = ["breach", "standDownRequired", "approvalRequired", "watch", "ok"];

  function rank(status) {
    return NW.fatigueStatusRank ? NW.fatigueStatusRank(status) : ({ ok: 0, watch: 1, approvalRequired: 2, standDownRequired: 3, breach: 4 }[status] || 0);
  }

  function worse(a, b) {
    return rank(a) >= rank(b) ? a : b;
  }

  function addIssue(issues, status, rule, action) {
    issues.push({ status, rule, action });
  }

  function metric(w, key) {
    return Number(w.fatigueMetrics?.[key] || 0);
  }

  function currentClient(w, view) {
    return w.fatigueMetrics?.currentClient || w.monthly?.[view.data.current_month]?.client || w.primary_client || "—";
  }

  function evaluateWorker(w, view) {
    const client = currentClient(w, view);
    const rules = NW.FATIGUE_RULES?.[client];
    const issues = [];

    if (!rules) {
      return { status: "ok", client, issues, action: "—", rule: "—" };
    }

    const hours21 = metric(w, "hoursLast21Days");
    const hoursMonth = metric(w, "hoursCurrentMonth");
    const consec = metric(w, "consecutiveShifts");
    const consecDays = metric(w, "consecutiveDayShifts");
    const consecNights = metric(w, "consecutiveNightShifts");
    const daysOnSite = metric(w, "daysOnSiteCurrentRun");
    const maxConsec = metric(w, "maxConsecutiveShifts");
    const maxNights = metric(w, "maxConsecutiveNightShifts");

    if (client === "BHP") {
      if (hours21 > rules.maxHoursIn21ConsecutiveDays) {
        addIssue(issues, "breach", `BHP: ${hours21}h in 21 days > ${rules.maxHoursIn21ConsecutiveDays}h`, "Remove from roster or reduce hours before next shift");
      } else if (hours21 >= rules.maxHoursIn21ConsecutiveDays * 0.9) {
        addIssue(issues, "watch", `BHP: ${hours21}h in 21 days approaching ${rules.maxHoursIn21ConsecutiveDays}h`, "Monitor 21-day exposure");
      }
      if (consec > rules.maxConsecutiveFifoShifts) {
        addIssue(issues, "breach", `BHP: ${consec} consecutive shifts > ${rules.maxConsecutiveFifoShifts}`, "Schedule R&R before further work");
      } else if (consec >= rules.maxConsecutiveFifoShifts - 1) {
        addIssue(issues, "watch", `BHP: ${consec} consecutive shifts`, "Plan R&R before limit");
      }
      if (consecNights > rules.maxConsecutiveFifoNightShifts) {
        addIssue(issues, "breach", `BHP: ${consecNights} consecutive night shifts > ${rules.maxConsecutiveFifoNightShifts}`, "Remove from night shift and schedule recovery");
      } else if (consecNights >= rules.maxConsecutiveFifoNightShifts - 1) {
        addIssue(issues, "watch", `BHP: ${consecNights} consecutive night shifts`, "Plan night-shift recovery");
      }
    }

    if (client === "Rio Tinto") {
      if (hoursMonth > rules.maxMonthlyHoursFifoShutdown) {
        addIssue(issues, "breach", `RTIO: ${hoursMonth}h this month > ${rules.maxMonthlyHoursFifoShutdown}h FIFO shutdown limit`, "Reduce monthly shutdown hours");
      } else if (hoursMonth >= rules.maxMonthlyHoursFifoShutdown * 0.9) {
        addIssue(issues, "watch", `RTIO: ${hoursMonth}h this month approaching ${rules.maxMonthlyHoursFifoShutdown}h`, "Monitor monthly shutdown hours");
      }
      if (consec > rules.maxConsecutiveFifoShifts) {
        addIssue(issues, "breach", `RTIO: ${consec} consecutive shifts > ${rules.maxConsecutiveFifoShifts}`, "Schedule R&R before further work");
      } else if (consec >= rules.maxConsecutiveFifoShifts - 1) {
        addIssue(issues, "watch", `RTIO: ${consec} consecutive shifts`, "Plan R&R before limit");
      }
      if (consecNights > rules.maxConsecutiveFifoNightShiftsException) {
        addIssue(issues, "breach", `RTIO: ${consecNights} consecutive night shifts > ${rules.maxConsecutiveFifoNightShiftsException}`, "Remove from night shift immediately");
      } else if (consecNights > rules.maxConsecutiveFifoNightShiftsStandard) {
        addIssue(issues, "approvalRequired", `RTIO: ${consecNights} nights exceeds standard ${rules.maxConsecutiveFifoNightShiftsStandard}`, "Client approval / fatigue risk controls required outside dashboard");
      } else if (consecNights >= rules.maxConsecutiveFifoNightShiftsStandard - 1) {
        addIssue(issues, "watch", `RTIO: ${consecNights} consecutive night shifts`, "Plan recovery before night-shift limit");
      }
      if (maxNights >= 4 && maxNights <= 7) {
        addIssue(issues, "watch", `RTIO: prior/current night block reached ${maxNights} nights`, "Check 2:1 work/rest recovery has been planned");
      }
    }

    if (client === "Roy Hill/Hancock") {
      if (daysOnSite > rules.maxConsecutiveDaysOnSite) {
        addIssue(issues, "breach", `Hancock: ${daysOnSite} days on site > ${rules.maxConsecutiveDaysOnSite}`, "Remove from site / schedule R&R");
      } else if (daysOnSite >= rules.maxConsecutiveDaysOnSite - 1) {
        addIssue(issues, "watch", `Hancock: ${daysOnSite} days on site`, "Plan demobilisation or stand-down before day 21");
      }
      if (consecDays >= rules.mandatoryDayShiftStandDownAfterConsecutiveDayShifts) {
        addIssue(issues, "standDownRequired", `Hancock: ${consecDays} consecutive day shifts`, "Mandatory stand-down before further day-shift work");
      } else if (consecDays >= rules.mandatoryDayShiftStandDownAfterConsecutiveDayShifts - 1) {
        addIssue(issues, "watch", `Hancock: ${consecDays} consecutive day shifts`, "Plan mandatory day-shift stand-down");
      }
      if (consecNights > rules.maxConsecutiveNightShiftsBeforeStandDown) {
        addIssue(issues, "standDownRequired", `Hancock: ${consecNights} consecutive night shifts`, "Mandatory 24h stand-down required");
      } else if (consecNights >= rules.maxConsecutiveNightShiftsBeforeStandDown - 1) {
        addIssue(issues, "watch", `Hancock: ${consecNights} consecutive night shifts`, "Plan 24h night-shift stand-down");
      }
    }

    if (client === "Fortescue") {
      if (consec > 13) {
        addIssue(issues, "approvalRequired", `Fortescue: ${consec} consecutive shifts`, "Review roster controls / RCAT where roster change applies");
      } else if (consec >= 13) {
        addIssue(issues, "watch", `Fortescue: ${consec} consecutive shifts`, "Review fatigue exposure before further work");
      }
      if (maxConsec > 13) {
        addIssue(issues, "watch", `Fortescue: prior/current run reached ${maxConsec} consecutive shifts`, "Confirm fatigue controls for extended roster run");
      }
    }

    let status = "ok";
    issues.forEach((i) => { status = worse(i.status, status); });
    const primary = issues.slice().sort((a, b) => rank(b.status) - rank(a.status))[0];

    return {
      status,
      client,
      issues,
      rule: primary?.rule || "—",
      action: primary?.action || "—",
      metrics: { hours21, hoursMonth, consec, consecDays, consecNights, daysOnSite },
    };
  }

  function compute(view) {
    const rows = [];
    view.workers.forEach((w) => {
      const e = evaluateWorker(w, view);
      if (e.status === "ok") return;
      rows.push({
        id: w.id,
        name: w.name,
        position: w.position,
        discipline: w.discipline || "—",
        client: e.client,
        status: e.status,
        rule: e.rule,
        action: e.action,
        issues: e.issues,
        metrics: e.metrics,
      });
    });
    rows.sort((a, b) => rank(b.status) - rank(a.status) || a.name.localeCompare(b.name));
    return rows;
  }

  NW.renderFatigueKpis = function (view) {
    const rows = compute(view);
    const count = (status) => rows.filter((r) => r.status === status).length;
    const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };

    set("kpi-fatigue-breach", (el) => {
      el.querySelector(".value").textContent = count("breach");
      el.querySelector(".delta").textContent = "Hard client-rule breaches";
      el.classList.toggle("alert", count("breach") > 0);
    });

    set("kpi-fatigue-close", (el) => {
      el.querySelector(".value").textContent = count("watch");
      el.querySelector(".delta").textContent = "Approaching client limits";
    });

    set("kpi-fatigue-worst", (el) => {
      const actionCount = count("approvalRequired") + count("standDownRequired");
      el.querySelector(".value").textContent = actionCount;
      el.querySelector(".delta").textContent = "Approval or stand-down required";
      el.classList.toggle("alert", actionCount > 0);
    });
  };

  NW.renderDisciplineRollup = function (view) {
    const el = document.getElementById("discipline-rollup");
    if (!el) return;
    const rows = compute(view);
    if (!rows.length) { el.innerHTML = ""; return; }

    const byDisc = {};
    rows.forEach((r) => {
      const disc = r.discipline || "Other";
      if (!byDisc[disc]) byDisc[disc] = { breach: 0, standDownRequired: 0, approvalRequired: 0, watch: 0 };
      byDisc[disc][r.status] += 1;
    });

    const sorted = Object.entries(byDisc).sort((a, b) =>
      Object.values(b[1]).reduce((s, n) => s + n, 0) - Object.values(a[1]).reduce((s, n) => s + n, 0)
    );

    el.innerHTML = sorted.map(([disc, c]) => `
      <div class="disc-rollup-tile">
        <div class="disc-rollup-name">${NW.escapeHtml(disc)}</div>
        <div class="disc-rollup-counts">
          ${c.breach ? `<span class="badge risk">${c.breach} breach</span>` : ""}
          ${c.standDownRequired ? `<span class="badge risk">${c.standDownRequired} stand-down</span>` : ""}
          ${c.approvalRequired ? `<span class="badge warn">${c.approvalRequired} approval</span>` : ""}
          ${c.watch ? `<span class="badge warn">${c.watch} watch</span>` : ""}
        </div>
      </div>`).join("");
  };

  NW.renderCompliance = function (view) {
    const rows = compute(view);
    const thead = document.getElementById("compliance-thead");
    thead.innerHTML = "";
    const htr = document.createElement("tr");
    htr.innerHTML = `
      <th class="cell-left">Name</th>
      <th class="cell-left">Position</th>
      <th class="cell-left">Client</th>
      <th class="num">21d h</th>
      <th class="num">Month h</th>
      <th class="num">Run</th>
      <th class="num">Day run</th>
      <th class="num">Night run</th>
      <th>Status</th>
      <th class="cell-left">Trigger</th>
      <th class="cell-left">Required action</th>`;
    thead.appendChild(htr);

    const tbody = document.querySelector("#compliance-table tbody");
    tbody.innerHTML = "";

    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.className = `compliance-${r.status}`;
      const badge = `<span class="badge ${NW.fatigueBadgeClass(r.status)}">${NW.escapeHtml(NW.fatigueStatusLabel(r.status))}</span>`;
      tr.innerHTML = `
        <td class="worker-name"><a href="${NW.escapeHtml(NW.workerUrl(r.id))}">${NW.escapeHtml(r.name)}</a></td>
        <td class="cell-left">${NW.escapeHtml(r.position)}</td>
        <td class="cell-left"><span class="dot ${NW.escapeHtml(NW.clientSlug(r.client))}"></span> ${NW.escapeHtml(r.client)}</td>
        <td class="num">${NW.fmtInt(r.metrics.hours21)}h</td>
        <td class="num">${NW.fmtInt(r.metrics.hoursMonth)}h</td>
        <td class="num">${NW.fmtInt(r.metrics.consec)}</td>
        <td class="num">${NW.fmtInt(r.metrics.consecDays)}</td>
        <td class="num">${NW.fmtInt(r.metrics.consecNights)}</td>
        <td>${badge}</td>
        <td class="cell-left">${NW.escapeHtml(r.rule)}</td>
        <td class="cell-left">${NW.escapeHtml(r.action)}</td>`;
      tbody.appendChild(tr);
    });

    const summary = document.getElementById("compliance-summary");
    if (!rows.length) {
      summary.innerHTML = `<span class="badge ok">No fatigue issues in current view</span>`;
    } else {
      const parts = STATUS_ORDER
        .map((s) => [s, rows.filter((r) => r.status === s).length])
        .filter(([, n]) => n)
        .map(([s, n]) => `<strong>${n}</strong> ${NW.escapeHtml(NW.fatigueStatusLabel(s).toLowerCase())}`);
      summary.innerHTML = parts.join(" &nbsp;·&nbsp; ");
    }

    const csv = document.getElementById("compliance-csv");
    if (csv) {
      csv.onclick = () => {
        const header = ["Name", "Position", "Discipline", "Client", "Status", "Trigger", "Required action", "Hours last 21 days", "Hours current month", "Consecutive shifts", "Consecutive day shifts", "Consecutive night shifts"];
        const body = rows.map((r) => [
          r.name, r.position, r.discipline, r.client, NW.fatigueStatusLabel(r.status), r.rule, r.action,
          r.metrics.hours21, r.metrics.hoursMonth, r.metrics.consec, r.metrics.consecDays, r.metrics.consecNights,
        ]);
        NW.downloadCsv(`northwest-fatigue-compliance-${view.data.current_month}.csv`, [header, ...body]);
      };
    }
  };
})(window.NW);
