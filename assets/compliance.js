// Fatigue compliance: client-specific rules + SRG 728h / 91-day rolling rule.
(function (NW) {
  const STATUS_ORDER = ["breach", "standDownRequired", "approvalRequired", "watch", "ok"];
  const TIMING_ORDER = { current: 0, planned: 1, historical: 2 };
  const GLOBAL_ROLLING_LIMIT = 728;
  const GLOBAL_ROLLING_WARN = 655;

  function rank(status) {
    return NW.fatigueStatusRank ? NW.fatigueStatusRank(status) : ({ ok: 0, watch: 1, approvalRequired: 2, standDownRequired: 3, breach: 4 }[status] || 0);
  }

  function worse(a, b) {
    return rank(a) >= rank(b) ? a : b;
  }

  function timingLabel(timing) {
    return { current: "Current", planned: "Planned", historical: "Historical" }[timing] || "Current";
  }

  function timingBadge(timing) {
    return { current: "risk", planned: "warn", historical: "ok" }[timing] || "warn";
  }

  function addIssue(issues, status, rule, action, timing = "current", period = "—") {
    issues.push({ status, rule, action, timing, period });
  }

  function metric(w, key) {
    return Number(w.fatigueMetrics?.[key] || 0);
  }

  function currentClient(w, view) {
    return w.fatigueMetrics?.currentClient || w.monthly?.[view.data.current_month]?.client || w.primary_client || "—";
  }

  function fmtIsoDate(s) {
    if (!s) return "—";
    const d = new Date(`${s}T00:00:00`);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
  }

  function evaluateGlobalRollingRule(w, issues) {
    const fm = w.fatigueMetrics || {};
    const currentHours = Number(fm.rolling13WeekCurrentHours || 0);
    const maxHours = Number(fm.rolling13WeekMaxHours || 0);
    const daysToBreach = fm.daysToBreach;
    const breachDate = fm.rolling13WeekBreachDate;
    const maxStart = fm.rolling13WeekMaxPeriodStart;
    const maxEnd = fm.rolling13WeekMaxPeriodEnd;
    const period = maxStart && maxEnd ? `${fmtIsoDate(maxStart)} – ${fmtIsoDate(maxEnd)}` : "Rolling 91 days";

    if (currentHours >= GLOBAL_ROLLING_LIMIT) {
      addIssue(
        issues,
        "breach",
        `SRG: ${NW.fmtInt(currentHours)}h in rolling 13 weeks > ${GLOBAL_ROLLING_LIMIT}h`,
        "Reduce roster exposure immediately",
        "current",
        "Current rolling 91 days",
      );
      return;
    }

    if (daysToBreach !== null && daysToBreach !== undefined && Number(daysToBreach) > 0) {
      addIssue(
        issues,
        "breach",
        `SRG: forecast breach of ${GLOBAL_ROLLING_LIMIT}h rolling 13-week limit on ${fmtIsoDate(breachDate)}`,
        `Planned breach in ${NW.fmtInt(daysToBreach)} days — reduce future roster before breach occurs`,
        "planned",
        fmtIsoDate(breachDate),
      );
      return;
    }

    if (maxHours >= GLOBAL_ROLLING_LIMIT) {
      addIssue(
        issues,
        "breach",
        `SRG: ${NW.fmtInt(maxHours)}h max rolling 13-week exposure > ${GLOBAL_ROLLING_LIMIT}h`,
        "Review historical/forecast roster exposure and reduce recurrence",
        "historical",
        period,
      );
      return;
    }

    if (currentHours >= GLOBAL_ROLLING_WARN) {
      addIssue(
        issues,
        "watch",
        `SRG: ${NW.fmtInt(currentHours)}h in rolling 13 weeks approaching ${GLOBAL_ROLLING_LIMIT}h`,
        "Monitor rolling 13-week exposure",
        "current",
        "Current rolling 91 days",
      );
    } else if (maxHours >= GLOBAL_ROLLING_WARN) {
      addIssue(
        issues,
        "watch",
        `SRG: ${NW.fmtInt(maxHours)}h max rolling 13-week exposure approaching ${GLOBAL_ROLLING_LIMIT}h`,
        "Review future roster loading before the 13-week limit is reached",
        maxEnd && new Date(`${maxEnd}T00:00:00`) > new Date() ? "planned" : "historical",
        period,
      );
    }
  }

  function evaluateWorker(w, view) {
    const client = currentClient(w, view);
    const rules = NW.FATIGUE_RULES?.[client];
    const issues = [];

    evaluateGlobalRollingRule(w, issues);

    const hours21 = metric(w, "hoursLast21Days");
    const hoursMonth = metric(w, "hoursCurrentMonth");
    const consec = metric(w, "consecutiveShifts");
    const consecDays = metric(w, "consecutiveDayShifts");
    const consecNights = metric(w, "consecutiveNightShifts");
    const daysOnSite = metric(w, "daysOnSiteCurrentRun");
    const maxConsec = metric(w, "maxConsecutiveShifts");
    const maxNights = metric(w, "maxConsecutiveNightShifts");
    const rolling13 = metric(w, "rolling13WeekCurrentHours");
    const rolling13Max = metric(w, "rolling13WeekMaxHours");
    const evenTime = Boolean(w.fatigueMetrics?.evenTimeAssumed);
    const currentPeriod = NW.fmtMonth(view.data.current_month);

    if (rules && client === "BHP") {
      if (hours21 > rules.maxHoursIn21ConsecutiveDays) {
        addIssue(issues, "breach", `BHP: ${hours21}h in 21 days > ${rules.maxHoursIn21ConsecutiveDays}h`, "Remove from roster or reduce hours before next shift", "current", currentPeriod);
      } else if (hours21 >= rules.maxHoursIn21ConsecutiveDays * 0.9) {
        addIssue(issues, "watch", `BHP: ${hours21}h in 21 days approaching ${rules.maxHoursIn21ConsecutiveDays}h`, "Monitor 21-day exposure", "current", currentPeriod);
      }
      if (!evenTime && consec > rules.maxConsecutiveFifoShifts) {
        addIssue(issues, "breach", `BHP: ${consec} consecutive shifts > ${rules.maxConsecutiveFifoShifts}`, "Schedule R&R before further work", "current", currentPeriod);
      } else if (!evenTime && consec >= rules.maxConsecutiveFifoShifts - 1) {
        addIssue(issues, "watch", `BHP: ${consec} consecutive shifts`, "Plan R&R before limit", "current", currentPeriod);
      }
      if (!evenTime && consecNights > rules.maxConsecutiveFifoNightShifts) {
        addIssue(issues, "breach", `BHP: ${consecNights} consecutive night shifts > ${rules.maxConsecutiveFifoNightShifts}`, "Remove from night shift and schedule recovery", "current", currentPeriod);
      } else if (!evenTime && consecNights >= rules.maxConsecutiveFifoNightShifts - 1) {
        addIssue(issues, "watch", `BHP: ${consecNights} consecutive night shifts`, "Plan night-shift recovery", "current", currentPeriod);
      }
    }

    if (rules && client === "Rio Tinto") {
      if (hoursMonth > rules.maxMonthlyHoursFifoShutdown) {
        addIssue(issues, "breach", `RTIO: ${hoursMonth}h this month > ${rules.maxMonthlyHoursFifoShutdown}h FIFO shutdown limit`, "Reduce monthly shutdown hours", "current", currentPeriod);
      } else if (hoursMonth >= rules.maxMonthlyHoursFifoShutdown * 0.9) {
        addIssue(issues, "watch", `RTIO: ${hoursMonth}h this month approaching ${rules.maxMonthlyHoursFifoShutdown}h`, "Monitor monthly shutdown hours", "current", currentPeriod);
      }
      if (!evenTime && consec > rules.maxConsecutiveFifoShifts) {
        addIssue(issues, "breach", `RTIO: ${consec} consecutive shifts > ${rules.maxConsecutiveFifoShifts}`, "Schedule R&R before further work", "current", currentPeriod);
      } else if (!evenTime && consec >= rules.maxConsecutiveFifoShifts - 1) {
        addIssue(issues, "watch", `RTIO: ${consec} consecutive shifts`, "Plan R&R before limit", "current", currentPeriod);
      }
      if (!evenTime && consecNights > rules.maxConsecutiveFifoNightShiftsException) {
        addIssue(issues, "breach", `RTIO: ${consecNights} consecutive night shifts > ${rules.maxConsecutiveFifoNightShiftsException}`, "Remove from night shift immediately", "current", currentPeriod);
      } else if (!evenTime && consecNights > rules.maxConsecutiveFifoNightShiftsStandard) {
        addIssue(issues, "approvalRequired", `RTIO: ${consecNights} nights exceeds standard ${rules.maxConsecutiveFifoNightShiftsStandard}`, "Client approval / fatigue risk controls required outside dashboard", "current", currentPeriod);
      } else if (!evenTime && consecNights >= rules.maxConsecutiveFifoNightShiftsStandard - 1) {
        addIssue(issues, "watch", `RTIO: ${consecNights} consecutive night shifts`, "Plan recovery before night-shift limit", "current", currentPeriod);
      }
      if (!evenTime && maxNights >= 4 && maxNights <= 7) {
        addIssue(issues, "watch", `RTIO: prior/current night block reached ${maxNights} nights`, "Check 2:1 work/rest recovery has been planned", "historical", "Prior/current roster window");
      }
    }

    if (rules && client === "Roy Hill/Hancock") {
      if (!evenTime && daysOnSite > rules.maxConsecutiveDaysOnSite) {
        addIssue(issues, "breach", `Hancock: ${daysOnSite} days on site > ${rules.maxConsecutiveDaysOnSite}`, "Remove from site / schedule R&R", "current", currentPeriod);
      } else if (!evenTime && daysOnSite >= rules.maxConsecutiveDaysOnSite - 1) {
        addIssue(issues, "watch", `Hancock: ${daysOnSite} days on site`, "Plan demobilisation or stand-down before day 21", "current", currentPeriod);
      }
      if (!evenTime && consecDays >= rules.mandatoryDayShiftStandDownAfterConsecutiveDayShifts) {
        addIssue(issues, "standDownRequired", `Hancock: ${consecDays} consecutive day shifts`, "Mandatory stand-down before further day-shift work", "current", currentPeriod);
      } else if (!evenTime && consecDays >= rules.mandatoryDayShiftStandDownAfterConsecutiveDayShifts - 1) {
        addIssue(issues, "watch", `Hancock: ${consecDays} consecutive day shifts`, "Plan mandatory day-shift stand-down", "current", currentPeriod);
      }
      if (!evenTime && consecNights > rules.maxConsecutiveNightShiftsBeforeStandDown) {
        addIssue(issues, "standDownRequired", `Hancock: ${consecNights} consecutive night shifts`, "Mandatory 24h stand-down required", "current", currentPeriod);
      } else if (!evenTime && consecNights >= rules.maxConsecutiveNightShiftsBeforeStandDown - 1) {
        addIssue(issues, "watch", `Hancock: ${consecNights} consecutive night shifts`, "Plan 24h night-shift stand-down", "current", currentPeriod);
      }
    }

    if (rules && client === "Fortescue") {
      if (!evenTime && consec > 13) {
        addIssue(issues, "approvalRequired", `Fortescue: ${consec} consecutive shifts`, "Review roster controls / RCAT where roster change applies", "current", currentPeriod);
      } else if (!evenTime && consec >= 13) {
        addIssue(issues, "watch", `Fortescue: ${consec} consecutive shifts`, "Review fatigue exposure before further work", "current", currentPeriod);
      }
      if (!evenTime && maxConsec > 13) {
        addIssue(issues, "watch", `Fortescue: prior/current run reached ${maxConsec} consecutive shifts`, "Confirm fatigue controls for extended roster run", "historical", "Prior/current roster window");
      }
    }

    let status = "ok";
    issues.forEach((i) => { status = worse(i.status, status); });
    const primary = issues.slice().sort((a, b) =>
      rank(b.status) - rank(a.status) ||
      (TIMING_ORDER[a.timing] ?? 9) - (TIMING_ORDER[b.timing] ?? 9)
    )[0];

    return {
      status,
      client,
      issues,
      rule: primary?.rule || "—",
      action: primary?.action || "—",
      timing: primary?.timing || "current",
      period: primary?.period || "—",
      metrics: { hours21, hoursMonth, consec, consecDays, consecNights, daysOnSite, rolling13, rolling13Max, evenTime },
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
        timing: e.timing,
        period: e.period,
        rule: e.rule,
        action: e.action,
        issues: e.issues,
        metrics: e.metrics,
      });
    });
    rows.sort((a, b) => rank(b.status) - rank(a.status) || (TIMING_ORDER[a.timing] ?? 9) - (TIMING_ORDER[b.timing] ?? 9) || a.name.localeCompare(b.name));
    return rows;
  }

  NW.renderFatigueKpis = function (view) {
    const rows = compute(view);
    const active = rows.filter((r) => r.timing !== "historical" && rank(r.status) >= rank("approvalRequired"));
    const currentActions = active.filter((r) => r.timing === "current").length;
    const plannedActions = active.filter((r) => r.timing === "planned").length;
    const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };

    set("kpi-fatigue-breach", (el) => {
      el.querySelector(".value").textContent = currentActions;
      el.querySelector(".delta").textContent = "Current breach, stand-down or approval issues";
      el.classList.toggle("alert", currentActions > 0);
    });

    set("kpi-fatigue-close", (el) => {
      el.querySelector(".value").textContent = plannedActions;
      el.querySelector(".delta").textContent = "Planned future breach, stand-down or approval issues";
    });

    set("kpi-fatigue-worst", (el) => {
      el.querySelector(".value").textContent = active.length;
      el.querySelector(".delta").textContent = "Unique active worker action items";
      el.classList.toggle("alert", active.length > 0);
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
      <th>Timing</th>
      <th class="cell-left">Period</th>
      <th class="num">13wk h</th>
      <th class="num">13wk max</th>
      <th class="num">21d h</th>
      <th class="num">Month h</th>
      <th class="num">Run</th>
      <th class="num">Night run</th>
      <th>Status</th>
      <th class="cell-left">Trigger</th>
      <th class="cell-left">Required action</th>`;
    thead.appendChild(htr);

    const tbody = document.querySelector("#compliance-table tbody");
    tbody.innerHTML = "";

    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.className = `compliance-${r.status} timing-${r.timing}`;
      const badge = `<span class="badge ${NW.fatigueBadgeClass(r.status)}">${NW.escapeHtml(NW.fatigueStatusLabel(r.status))}</span>`;
      const timing = `<span class="badge ${timingBadge(r.timing)}">${NW.escapeHtml(timingLabel(r.timing))}</span>`;
      const even = r.metrics.evenTime ? " <span class=\"badge ok\">even-time</span>" : "";
      tr.innerHTML = `
        <td class="worker-name"><a href="${NW.escapeHtml(NW.workerUrl(r.id))}">${NW.escapeHtml(r.name)}</a></td>
        <td class="cell-left">${NW.escapeHtml(r.position)}</td>
        <td class="cell-left"><span class="dot ${NW.escapeHtml(NW.clientSlug(r.client))}"></span> ${NW.escapeHtml(r.client)}${even}</td>
        <td>${timing}</td>
        <td class="cell-left nowrap">${NW.escapeHtml(r.period)}</td>
        <td class="num">${NW.fmtInt(r.metrics.rolling13)}h</td>
        <td class="num">${NW.fmtInt(r.metrics.rolling13Max)}h</td>
        <td class="num">${NW.fmtInt(r.metrics.hours21)}h</td>
        <td class="num">${NW.fmtInt(r.metrics.hoursMonth)}h</td>
        <td class="num">${NW.fmtInt(r.metrics.consec)}</td>
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
      const current = rows.filter((r) => r.timing === "current").length;
      const planned = rows.filter((r) => r.timing === "planned").length;
      const historical = rows.filter((r) => r.timing === "historical").length;
      summary.innerHTML = `<strong>${current}</strong> current &nbsp;·&nbsp; <strong>${planned}</strong> planned &nbsp;·&nbsp; <strong>${historical}</strong> historical`;
    }

    const csv = document.getElementById("compliance-csv");
    if (csv) {
      csv.onclick = () => {
        const header = ["Name", "Position", "Discipline", "Client", "Timing", "Period", "Status", "Trigger", "Required action", "Rolling 13-week current hours", "Rolling 13-week max hours", "Hours last 21 days", "Hours current month", "Consecutive shifts", "Consecutive night shifts", "Even time assumed"];
        const body = rows.map((r) => [
          r.name, r.position, r.discipline, r.client, timingLabel(r.timing), r.period, NW.fatigueStatusLabel(r.status), r.rule, r.action,
          r.metrics.rolling13, r.metrics.rolling13Max, r.metrics.hours21, r.metrics.hoursMonth, r.metrics.consec, r.metrics.consecNights, r.metrics.evenTime,
        ]);
        NW.downloadCsv(`northwest-fatigue-compliance-${view.data.current_month}.csv`, [header, ...body]);
      };
    }
  };
})(window.NW);
