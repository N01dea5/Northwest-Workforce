// Shared formatting helpers for the Northwest Workforce dashboard.
// Exposed on the global `NW` namespace to avoid a bundler.

window.NW = window.NW || {};

(function (NW) {
  const CLIENT_SLUGS = {
    "Fortescue": "fortescue",
    "Rio Tinto": "rio",
    "BHP": "bhp",
    "Roy Hill/Hancock": "royhill",
  };
  const CLIENT_FILE_SLUG = {
    "Fortescue": "fortescue",
    "Rio Tinto": "rio-tinto",
    "BHP": "bhp",
    "Roy Hill/Hancock": "roy-hill",
  };
  const CLIENT_COLOUR = {
    "Fortescue": "#6B3E8C",
    "Rio Tinto": "#C0392B",
    "BHP": "#0E7C4A",
    "Roy Hill/Hancock": "#1F4E79",
  };

  NW.clientSlug = (name) => CLIENT_SLUGS[name] || "none";
  NW.clientFileSlug = (name) => CLIENT_FILE_SLUG[name];
  NW.clientColour = (name) => CLIENT_COLOUR[name] || "#999";

  NW.fmtInt = (n) => {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return Math.round(n).toLocaleString("en-AU");
  };
  NW.fmtHours = (n) => {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return Math.round(n).toLocaleString("en-AU") + "h";
  };
  NW.fmtPct = (n, digits = 0) => {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return (n * 100).toFixed(digits) + "%";
  };
  NW.fmtDelta = (n) => {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    const sign = n > 0 ? "+" : "";
    return sign + Math.round(n).toLocaleString("en-AU");
  };

  // "2026-04" -> "Apr '26"
  NW.fmtMonth = (ym) => {
    if (!ym) return "";
    const [y, m] = ym.split("-").map((x) => parseInt(x, 10));
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${names[m - 1]} '${String(y).slice(-2)}`;
  };
  NW.fmtMonthLong = (ym) => {
    if (!ym) return "";
    const [y, m] = ym.split("-").map((x) => parseInt(x, 10));
    const names = ["January", "February", "March", "April", "May", "June",
                   "July", "August", "September", "October", "November", "December"];
    return `${names[m - 1]} ${y}`;
  };

  NW.workerUrl = (id) => `worker.html?id=${encodeURIComponent(id)}`;

  // Traffic-light classifier used for retention % and churn %.
  NW.retentionClass = (pct) => {
    if (pct === null || Number.isNaN(pct)) return "";
    if (pct >= 0.70) return "is-ok";
    if (pct >= 0.50) return "is-warn";
    return "is-risk";
  };
  NW.churnClass = (pct) => {
    if (pct === null || Number.isNaN(pct)) return "";
    if (pct < 0.05) return "is-ok";
    if (pct < 0.12) return "is-warn";
    return "is-risk";
  };

  // Simple SVG sparkline from an array of numbers.
  NW.sparkline = (values, { width = 80, height = 20 } = {}) => {
    if (!values.length) return "";
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const step = width / Math.max(values.length - 1, 1);
    const pts = values.map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / span) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const d = "M" + pts.join(" L ");
    const lastX = (values.length - 1) * step;
    const lastY = height - ((values[values.length - 1] - min) / span) * (height - 2) - 1;
    return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <path d="${d}"></path>
      <circle class="dot" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="1.8"></circle>
    </svg>`;
  };

  // CSV export helper.
  NW.downloadCsv = (filename, rows) => {
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  };
})(window.NW);
