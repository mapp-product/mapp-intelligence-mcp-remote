const baseStyles = `
  :root {
    color-scheme: light;
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  body {
    margin: 0;
    padding: 16px;
    background: linear-gradient(160deg, #f8fafc 0%, #eef2ff 100%);
    color: #0f172a;
  }

  .card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  }

  h2 {
    font-size: 14px;
    margin: 0 0 12px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  th,
  td {
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
    padding: 6px 8px;
  }

  th {
    color: #334155;
    font-weight: 600;
    position: sticky;
    top: 0;
    background: #f8fafc;
  }

  .meta {
    margin-top: 10px;
    font-size: 11px;
    color: #475569;
  }

  .bullets {
    margin: 0;
    padding-left: 16px;
  }

  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px;
  }

  .kpi {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 10px;
    background: #f8fafc;
  }

  .kpi .label {
    font-size: 11px;
    color: #475569;
  }

  .kpi .value {
    font-size: 20px;
    font-weight: 700;
    margin-top: 4px;
    color: #0f172a;
  }

  .kpi .delta {
    margin-top: 4px;
    font-size: 11px;
  }

  .delta.positive {
    color: #166534;
  }

  .delta.negative {
    color: #991b1b;
  }
`;

export const ANALYTICS_WIDGET_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Analytics Widget</title>
    <style>${baseStyles}</style>
  </head>
  <body>
    <div class="card">
      <h2 id="title">Analytics Result</h2>
      <div style="max-height: 360px; overflow: auto">
        <table id="result-table"></table>
      </div>
      <div class="meta">
        <strong>Summary</strong>
        <ul class="bullets" id="summary"></ul>
      </div>
    </div>

    <script>
      const state = {
        structured:
          window.openai?.toolOutput?.structuredContent ||
          window.openai?.toolOutput ||
          {},
      };

      function renderTable(structured) {
        const title = document.getElementById("title");
        const table = document.getElementById("result-table");
        const summary = document.getElementById("summary");

        title.textContent = structured.title || "Analytics Result";

        const columns = Array.isArray(structured.columns) ? structured.columns : [];
        const rows = Array.isArray(structured.rows) ? structured.rows : [];

        const header = document.createElement("thead");
        const headerRow = document.createElement("tr");

        columns.forEach((column) => {
          const th = document.createElement("th");
          th.textContent = column.label || column.key;
          headerRow.appendChild(th);
        });

        header.appendChild(headerRow);

        const body = document.createElement("tbody");
        rows.forEach((row) => {
          const tr = document.createElement("tr");
          columns.forEach((column) => {
            const td = document.createElement("td");
            const value = row[column.key];
            td.textContent = value === null || value === undefined ? "-" : String(value);
            tr.appendChild(td);
          });
          body.appendChild(tr);
        });

        table.innerHTML = "";
        table.appendChild(header);
        table.appendChild(body);

        const bullets = structured.summary?.bullets || [];
        summary.innerHTML = "";
        bullets.forEach((bullet) => {
          const li = document.createElement("li");
          li.textContent = bullet;
          summary.appendChild(li);
        });

        window.openai?.setWidgetState?.({ lastRenderedAt: Date.now() });
      }

      renderTable(state.structured);
    </script>
  </body>
</html>`;

export const KPI_WIDGET_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KPI Widget</title>
    <style>${baseStyles}</style>
  </head>
  <body>
    <div class="card">
      <h2 id="title">KPI Snapshot</h2>
      <div class="kpis" id="kpis"></div>
      <div class="meta">
        <strong>Summary</strong>
        <ul class="bullets" id="summary"></ul>
      </div>
    </div>

    <script>
      const state = {
        structured:
          window.openai?.toolOutput?.structuredContent ||
          window.openai?.toolOutput ||
          {},
      };

      function toDeltaClass(delta) {
        if (typeof delta !== "number") return "delta";
        if (delta > 0) return "delta positive";
        if (delta < 0) return "delta negative";
        return "delta";
      }

      function render(structured) {
        const title = document.getElementById("title");
        const kpis = document.getElementById("kpis");
        const summary = document.getElementById("summary");

        title.textContent = structured.title || "KPI Snapshot";

        const metrics = Array.isArray(structured.metrics) ? structured.metrics : [];
        kpis.innerHTML = "";

        metrics.forEach((metric) => {
          const card = document.createElement("div");
          card.className = "kpi";

          const label = document.createElement("div");
          label.className = "label";
          label.textContent = metric.label || metric.metric;

          const value = document.createElement("div");
          value.className = "value";
          value.textContent =
            metric.current === null || metric.current === undefined
              ? "-"
              : String(metric.current);

          const delta = document.createElement("div");
          delta.className = toDeltaClass(metric.deltaPercent);
          delta.textContent =
            metric.deltaPercent === null || metric.deltaPercent === undefined
              ? "No comparison"
              : metric.deltaPercent.toFixed(2) + "% vs baseline";

          card.appendChild(label);
          card.appendChild(value);
          card.appendChild(delta);
          kpis.appendChild(card);
        });

        const bullets = structured.summary?.bullets || [];
        summary.innerHTML = "";
        bullets.forEach((bullet) => {
          const li = document.createElement("li");
          li.textContent = bullet;
          summary.appendChild(li);
        });

        window.openai?.setWidgetState?.({ lastRenderedAt: Date.now() });
      }

      render(state.structured);
    </script>
  </body>
</html>`;
