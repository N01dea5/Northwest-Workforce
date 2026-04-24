// KPI tile computation & rendering.
(function (NW) {
  function windowIndices(data) {
    const months = data.reporting_months;
    const curIdx = months.indexOf(data.current_month);
    const trailing = months.slice(Math.max(0, curIdx - data.months_behind), curIdx);
    const forward = months.slice(curIdx + 1, curIdx + 1 + data.months_ahead);
    return { months, curIdx, trailing, forward, cur: data.current_month };
  }

  NW.computeKpis = function (view) {
    const { data, workers } = view;
    const { months, curIdx, trailing, forward, cur } = windowIndices(data);
    const prev = months[curIdx - 1];

    // Active workforce: distinct workers with hours > 0 in current month
    const active = workers.filter((w) => (w.monthly[cur]?.hours || 0) > 0).length;

    // Avg hrs / worker / month across trailing 3mo
    let hrsSum = 0;
    const distinct = new Set();
    trailing.forEach((m) => {
      workers.forEach((w) => {
        const h = w.monthly[m]?.hours || 0;
        if (h > 0) { hrsSum += h; distinct.add(w.id); }
      });
    });
    const avgHrs = distinct.size ? hrsSum / (distinct.size * trailing.length) : 0;

    // Forward committed hours (next 3mo)
    let committedSum = 0;
    forward.forEach((m) => {
      workers.forEach((w) => {
        const mm = w.monthly[m];
        if (mm && mm.committed) committedSum += (mm.hours || 0);
      });
    });

    // New starts this month and last month
    const newThis = workers.filter((w) => (w.employment_start || "").slice(0, 7) === cur).length;
    const newPrev = workers.filter((w) => (w.employment_start || "").slice(0, 7) === prev).length;

    // Drop-offs this month: had hours last month, 0 this month
    const dropsThis = prev
      ? workers.filter((w) => (w.monthly[prev]?.hours || 0) > 0 && (w.monthly[cur]?.hours || 0) === 0).length
      : 0;
    const dropsPrev = months[curIdx - 2]
      ? workers.filter((w) => (w.monthly[months[curIdx - 2]]?.hours || 0) > 0 && (w.monthly[prev]?.hours || 0) === 0).length
      : 0;

    // Churn rate trailing 3mo average
    const ratios = [];
    for (let i = 0; i < trailing.length; i++) {
      const m = trailing[i];
      const mIdx = months.indexOf(m);
      const mPrev = months[mIdx - 1];
      if (!mPrev) continue;
      const hadPrev = workers.filter((w) => (w.monthly[mPrev]?.hours || 0) > 0);
      if (!hadPrev.length) continue;
      let drops = 0;
      hadPrev.forEach((w) => {
        if ((w.monthly[m]?.hours || 0) === 0) drops += 1;
      });
      ratios.push(drops / hadPrev.length);
    }
    const churnRate = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;

    // At-risk: trailing avg ≥ 120h AND next month committed ≤ 40h
    const atRisk = workers.filter((w) => {
      const ph = trailing.map((m) => w.monthly[m]?.hours || 0);
      const avg = ph.reduce((a, b) => a + b, 0) / (ph.length || 1);
      const nextH = w.monthly[forward[0]]?.hours || 0;
      return avg >= 120 && nextH <= 40;
    }).length;

    return { active, avgHrs, committedSum, newThis, newPrev, dropsThis, dropsPrev, churnRate, atRisk };
  };

  // Renders whichever KPI tiles are present in the DOM — missing tiles are skipped.
  NW.renderKpis = function (view) {
    const k = NW.computeKpis(view);

    const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };

    set("kpi-active", (el) => {
      el.querySelector(".value").innerHTML = NW.fmtInt(k.active);
    });

    set("kpi-avg-hours", (el) => {
      el.querySelector(".value").innerHTML = `${NW.fmtInt(k.avgHrs)}<span class="unit">h</span>`;
    });

    set("kpi-committed", (el) => {
      el.querySelector(".value").innerHTML = `${NW.fmtInt(k.committedSum / 1000)}<span class="unit">k h</span>`;
    });

    set("kpi-newstart", (el) => {
      el.querySelector(".value").innerHTML = NW.fmtInt(k.newThis);
      const delta = k.newThis - k.newPrev;
      const d = el.querySelector(".delta");
      d.className = "delta " + (delta > 0 ? "up" : delta < 0 ? "down" : "");
      d.textContent = `${NW.fmtDelta(delta)} vs last month`;
    });

    set("kpi-drops", (el) => {
      el.querySelector(".value").innerHTML = NW.fmtInt(k.dropsThis);
      const delta = k.dropsThis - k.dropsPrev;
      const d = el.querySelector(".delta");
      d.className = "delta " + (delta > 0 ? "down" : delta < 0 ? "up" : "");
      d.textContent = `${NW.fmtDelta(delta)} vs last month`;
    });

    set("kpi-churn", (el) => {
      el.querySelector(".value").innerHTML = `${(k.churnRate * 100).toFixed(1)}<span class="unit">%</span>`;
    });

    set("kpi-atrisk", (el) => {
      el.querySelector(".value").textContent = NW.fmtInt(k.atRisk);
      el.classList.toggle("alert", k.atRisk > 0);
      el.onclick = () => {
        const sec = document.getElementById("sec-atrisk");
        if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    });
  };
})(window.NW);
