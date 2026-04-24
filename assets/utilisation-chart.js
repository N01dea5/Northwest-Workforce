// Section 05 — avg hours/worker trend, per client + overall.
(function (NW) {
  let chart = null;

  function seriesFor(view, client) {
    const { data, workers } = view;
    return data.reporting_months.map((m) => {
      let hrs = 0, n = 0;
      workers.forEach((w) => {
        const mm = w.monthly[m];
        if (!mm) return;
        if (client && mm.client !== client) return;
        if ((mm.hours || 0) > 0) { hrs += mm.hours; n += 1; }
      });
      return n ? hrs / n : null;
    });
  }

  NW.renderTrendChart = function (view) {
    const ctx = document.getElementById("trend-chart").getContext("2d");
    const labels = view.data.reporting_months.map(NW.fmtMonth);
    const curIdx = view.data.reporting_months.indexOf(view.data.current_month);

    const datasets = [
      {
        label: "All clients",
        data: seriesFor(view, null),
        borderColor: "#1A1A1A",
        backgroundColor: "#1A1A1A",
        borderWidth: 2.5,
        tension: 0.2,
      },
      ...view.data.clients.map((c) => ({
        label: c,
        data: seriesFor(view, c),
        borderColor: NW.clientColour(c),
        backgroundColor: NW.clientColour(c),
        borderWidth: 1.6,
        tension: 0.2,
      })),
    ];

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } },
          tooltip: {
            callbacks: {
              label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? "—" : Math.round(c.parsed.y) + "h"}`,
            },
          },
          annotation: {},
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Avg hours / worker" },
            ticks: { callback: (v) => v + "h" },
          },
          x: {
            ticks: {
              callback: function (val, i) {
                const lbl = this.getLabelForValue(val);
                return i === curIdx ? `${lbl} ▲` : i > curIdx ? `${lbl} (fwd)` : lbl;
              },
            },
          },
        },
      },
    });
  };
})(window.NW);
