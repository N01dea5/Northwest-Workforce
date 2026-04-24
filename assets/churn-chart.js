// Section 06 — grouped bars of new starts vs drop-offs, + churn rate line.
(function (NW) {
  let chart = null;

  function compute(view) {
    const { data, workers } = view;
    const months = data.reporting_months;
    const curIdx = months.indexOf(data.current_month);
    const window = months.slice(Math.max(0, curIdx - data.months_behind), curIdx + 1);

    const labels = window.map(NW.fmtMonth);
    const newStarts = window.map((m) =>
      workers.filter((w) => (w.employment_start || "").slice(0, 7) === m).length
    );
    const dropoffs = window.map((m) => {
      const mIdx = months.indexOf(m);
      const later = months.slice(mIdx + 1);
      let n = 0;
      workers.forEach((w) => {
        if ((w.monthly[m]?.hours || 0) === 0) return;
        const hasLater = later.some(
          (lm) => (w.monthly[lm]?.hours || 0) > 0
        );
        if (!hasLater) n += 1;
      });
      return n;
    });
    const churnRate = window.map((m, i) => {
      const mIdx = months.indexOf(m);
      if (mIdx <= 0) return null;
      const prev = months[mIdx - 1];
      const prevN = workers.filter((w) => (w.monthly[prev]?.hours || 0) > 0).length;
      return prevN ? (dropoffs[i] / prevN) * 100 : null;
    });

    return { labels, newStarts, dropoffs, churnRate };
  }

  NW.renderChurnChart = function (view) {
    const { labels, newStarts, dropoffs, churnRate } = compute(view);
    const canvas = document.getElementById("churn-chart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "New starts",
            data: newStarts,
            backgroundColor: "rgba(22,163,74,0.75)",
            borderColor: "#16A34A",
            borderWidth: 1,
            yAxisID: "y",
            order: 2,
          },
          {
            type: "bar",
            label: "Drop-offs",
            data: dropoffs.map((n) => -n),
            backgroundColor: "rgba(220,38,38,0.75)",
            borderColor: "#DC2626",
            borderWidth: 1,
            yAxisID: "y",
            order: 2,
          },
          {
            type: "line",
            label: "Churn rate %",
            data: churnRate,
            borderColor: "#E30613",
            backgroundColor: "#E30613",
            borderWidth: 2.5,
            tension: 0.25,
            yAxisID: "y2",
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } },
          tooltip: {
            callbacks: {
              label: (c) => {
                if (c.dataset.label === "Drop-offs") return `Drop-offs: ${Math.abs(c.parsed.y)}`;
                if (c.dataset.label === "Churn rate %") {
                  return `Churn rate: ${c.parsed.y == null ? "—" : c.parsed.y.toFixed(1) + "%"}`;
                }
                return `${c.dataset.label}: ${c.parsed.y}`;
              },
            },
          },
        },
        scales: {
          y: {
            title: { display: true, text: "Workers" },
            ticks: { callback: (v) => Math.abs(v) },
          },
          y2: {
            position: "right",
            title: { display: true, text: "Churn rate" },
            grid: { drawOnChartArea: false },
            ticks: { callback: (v) => v + "%" },
            suggestedMin: 0,
            suggestedMax: 20,
          },
        },
      },
    });
  };
})(window.NW);
