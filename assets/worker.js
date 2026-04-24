// Worker drill-down page.
(function (NW) {
  function tenureMonths(start, now) {
    if (!start) return 0;
    const [sy, sm] = start.slice(0, 7).split("-").map(Number);
    const [ny, nm] = now.split("-").map(Number);
    return (ny - sy) * 12 + (nm - sm);
  }

  function computeMetrics(worker, data) {
    const months = data.reporting_months;
    const curIdx = months.indexOf(data.current_month);
    const trailing = months.slice(Math.max(0, curIdx - data.months_behind), curIdx);
    const forward = months.slice(curIdx + 1, curIdx + 1 + data.months_ahead);

    const trailingHrs = trailing.map((m) => worker.monthly[m]?.hours || 0);
    const trailAvg = trailingHrs.reduce((a, b) => a + b, 0) / (trailing.length || 1);
    const forwardHrs = forward.map((m) =>
      worker.monthly[m]?.committed ? worker.monthly[m]?.hours || 0 : 0
    );
    const forwardSum = forwardHrs.reduce((a, b) => a + b, 0);

    const distinctClients = new Set();
    months.forEach((m) => {
      const c = worker.monthly[m]?.client;
      if (c) distinctClients.add(c);
    });

    const curH = worker.monthly[data.current_month]?.hours || 0;
    const prevH = worker.monthly[months[curIdx - 1]]?.hours || 0;
    const delta = curH - prevH;
    const atRisk = trailAvg >= 120 && (worker.monthly[forward[0]]?.hours || 0) <= 40;

    return { trailAvg, forwardSum, distinctClients, delta, atRisk };
  }

  function render(worker, data) {
    const root = document.getElementById("worker-root");
    if (!worker) {
      root.innerHTML = `<div class="card" style="padding:30px;">
        <h2>Worker not found</h2>
        <p>No worker with that id in <code>workforce.json</code>.
        <a href="index.html">Back to dashboard</a></p></div>`;
      return;
    }
    const metrics = computeMetrics(worker, data);
    const tenure = tenureMonths(worker.employment_start, data.current_month);

    root.innerHTML = `
      <div class="worker-head">
        <div class="who">
          <h1>${worker.name} ${metrics.atRisk ? '<span class="pill alert">At risk</span>' : ""}</h1>
          <div class="meta">
            <strong>${worker.position}</strong> ·
            primary client <span class="dot ${NW.clientSlug(worker.primary_client)}"></span> ${worker.primary_client} ·
            id <code>${worker.id}</code> ·
            started ${worker.employment_start} (${tenure} mo tenure)
            ${worker.employment_end ? ` · ended ${worker.employment_end}` : ""}
          </div>
        </div>
      </div>

      <div class="worker-kpis">
        <div class="kpi-tile">
          <div class="label">Trailing 3mo avg</div>
          <div class="value">${NW.fmtInt(metrics.trailAvg)}<span class="unit">h</span></div>
          <div class="delta">per month</div>
        </div>
        <div class="kpi-tile">
          <div class="label">Forward committed</div>
          <div class="value">${NW.fmtInt(metrics.forwardSum)}<span class="unit">h</span></div>
          <div class="delta">next 3 months</div>
        </div>
        <div class="kpi-tile">
          <div class="label">Clients worked</div>
          <div class="value">${metrics.distinctClients.size}</div>
          <div class="delta">in window</div>
        </div>
        <div class="kpi-tile">
          <div class="label">MoM change</div>
          <div class="value ${metrics.delta >= 0 ? "" : ""}">${metrics.delta >= 0 ? "▲" : "▼"} ${NW.fmtInt(Math.abs(metrics.delta))}<span class="unit">h</span></div>
          <div class="delta ${metrics.delta > 0 ? "up" : metrics.delta < 0 ? "down" : ""}">vs previous month</div>
        </div>
      </div>

      <section class="card">
        <header><h2><span class="section-number">01</span> Hours by month</h2>
          <span class="hint">Hatched bars = forward committed work</span>
        </header>
        <div class="body">
          <div class="chart-box"><canvas id="worker-hours"></canvas></div>
        </div>
      </section>

      <section class="card">
        <header><h2><span class="section-number">02</span> Client timeline</h2>
          <span class="hint">One cell per month; pale = forward committed</span>
        </header>
        <div class="body" id="client-timeline-body"></div>
      </section>

      <section class="card">
        <header><h2><span class="section-number">03</span> Monthly breakdown</h2></header>
        <div class="body">
          <div class="table-scroll">
            <table class="tbl" id="worker-monthly">
              <thead><tr>
                <th>Month</th><th>Client</th><th class="num">Hours</th>
                <th>Committed?</th><th class="num">Δ vs prior</th>
              </tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </section>
    `;

    renderHoursChart(worker, data);
    renderTimeline(worker, data);
    renderMonthlyTable(worker, data);
  }

  function renderHoursChart(worker, data) {
    const months = data.reporting_months;
    const curIdx = months.indexOf(data.current_month);
    const labels = months.map(NW.fmtMonth);
    const hours = months.map((m) => worker.monthly[m]?.hours || 0);
    const colours = months.map((m, i) => {
      const c = worker.monthly[m]?.client;
      if (!c) return "#D1D5DB";
      const col = NW.clientColour(c);
      return i > curIdx ? col + "88" : col;
    });

    new Chart(document.getElementById("worker-hours").getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Hours",
          data: hours,
          backgroundColor: colours,
          borderColor: colours,
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => {
                const m = months[c.dataIndex];
                const mm = worker.monthly[m];
                const client = mm?.client || "—";
                const committed = c.dataIndex > curIdx ? " (committed)" : "";
                return `${client}: ${c.parsed.y}h${committed}`;
              },
            },
          },
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "Hours" } },
          x: {
            ticks: {
              callback: function (val, i) {
                const lbl = this.getLabelForValue(val);
                return i === curIdx ? lbl + " ▲" : i > curIdx ? lbl + " (fwd)" : lbl;
              },
            },
          },
        },
      },
    });
  }

  function renderTimeline(worker, data) {
    const body = document.getElementById("client-timeline-body");
    const months = data.reporting_months;
    const curIdx = months.indexOf(data.current_month);
    body.innerHTML = `
      <div class="client-timeline">
        <div class="labels">
          ${months.map((m, i) => `<div>${NW.fmtMonth(m)}${i === curIdx ? " ▲" : ""}</div>`).join("")}
        </div>
        <div class="row">
          ${months.map((m, i) => {
            const mm = worker.monthly[m];
            const c = mm?.client;
            const slug = c ? NW.clientSlug(c) : "none";
            const committed = i > curIdx ? " committed" : "";
            const label = c ? c.replace(" ", " ") : "—";
            const hrs = mm?.hours || 0;
            return `<div class="cell ${slug}${committed}" title="${m}: ${c || "no work"} · ${hrs}h">
              ${label}<div style="font-size:10px; opacity:0.85; margin-top:2px;">${hrs}h</div>
            </div>`;
          }).join("")}
        </div>
      </div>
      <div class="small muted" style="margin-top:10px;">
        <span class="dot fortescue"></span> Fortescue
        &nbsp;<span class="dot rio"></span> Rio Tinto
        &nbsp;<span class="dot bhp"></span> BHP
        &nbsp;<span class="dot royhill"></span> Roy Hill/Hancock
      </div>`;
  }

  function renderMonthlyTable(worker, data) {
    const tbody = document.querySelector("#worker-monthly tbody");
    const months = data.reporting_months;
    const curIdx = months.indexOf(data.current_month);
    tbody.innerHTML = "";
    let prevH = null;
    months.forEach((m, i) => {
      const mm = worker.monthly[m] || {};
      const tr = document.createElement("tr");
      const h = mm.hours || 0;
      const delta = prevH == null ? null : h - prevH;
      tr.innerHTML = `
        <td class="nowrap">${NW.fmtMonth(m)} ${i === curIdx ? "<span class='pill'>now</span>" : i > curIdx ? "<span class='pill'>fwd</span>" : ""}</td>
        <td>${mm.client ? `<span class="dot ${NW.clientSlug(mm.client)}"></span> ${mm.client}` : "<span class='muted'>—</span>"}</td>
        <td class="num">${NW.fmtInt(h)}h</td>
        <td>${mm.committed ? "Yes" : "No"}</td>
        <td class="num">${delta == null ? "—" : (delta >= 0 ? "+" : "") + delta + "h"}</td>`;
      tbody.appendChild(tr);
      prevH = h;
    });
  }

  async function boot() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) {
      document.getElementById("worker-root").innerHTML =
        `<div class="card" style="padding:30px;">Missing <code>?id=</code> parameter.</div>`;
      return;
    }
    const res = await fetch("data/workforce.json");
    const data = await res.json();
    const worker = data.workers.find((w) => w.id === id);
    render(worker, data);
  }

  document.addEventListener("DOMContentLoaded", boot);
})(window.NW);
