/* SQL Explorer — runs real SQL (SQLite via sql.js) on real World Bank data. */
"use strict";

const SQLJS_JS  = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js";
const SQLJS_WASM = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm";
const DISPLAY_ROW_CAP = 200;
const HIST_KEY = "sqlexplorer_history_v1";

/* Plain-language descriptions for every column (shown in the schema sidebar). */
const COL_DESC = {
  year: "The calendar year — one row per year.",
  country_code: "Short country code: PAK, IND or BGD.",
  country_name: "Full country name.",
  population: "Total number of people living in the country that year.",
  gdp: "Total value of everything produced in a year (US dollars).",
  gdp_per_capita: "Average income per person for that year (US dollars).",
  inflation_pct: "How much prices rose that year, in percent. Higher = things got expensive faster.",
  life_expectancy: "Average number of years a newborn is expected to live.",
  literacy_pct: "Share of adults (15+) who can read and write, in percent.",
  unemployment_pct: "Share of workers without a job, in percent.",
  exports_pct_gdp: "Goods & services sold to other countries, as % of the economy.",
  imports_pct_gdp: "Goods & services bought from other countries, as % of the economy.",
  poverty_pct: "Share of people living on less than $2.15 a day, in percent.",
  remittances_pct_gdp: "Money sent home by Pakistanis working abroad, as % of the economy.",
  internet_pct: "Share of people using the internet, in percent."
};

/* 10 guided queries: simple -> advanced. Insights verified against the real data. */
const PRESETS = [
  { level: "Start here", title: "How many people live in Pakistan each year?",
    what: "This reads the population column, newest year first. LIMIT 10 keeps the answer short.",
    sql: "SELECT year, population\nFROM pakistan\nORDER BY year DESC\nLIMIT 10;",
    insight: "Pakistan passed <b>250 million people in 2024</b> (251,269,164) — up from about 45 million in 1960." },
  { level: "Start here", title: "What was Pakistan's income per person in the 2000s?",
    what: "WHERE picks only the years 2000–2009. ROUND removes messy decimals.",
    sql: "SELECT year, ROUND(gdp_per_capita, 0) AS income_per_person_usd\nFROM pakistan\nWHERE year BETWEEN 2000 AND 2009\nORDER BY year;",
    insight: "Average income rose from <b>$642 (2000) to $964 (2009)</b> — steady growth through the decade." },
  { level: "Start here", title: "In which years was inflation the worst?",
    what: "IS NOT NULL skips empty years. ORDER BY … DESC puts the biggest numbers on top.",
    sql: "SELECT year, ROUND(inflation_pct, 1) AS inflation_percent\nFROM pakistan\nWHERE inflation_pct IS NOT NULL\nORDER BY inflation_pct DESC\nLIMIT 5;",
    insight: "<b>2023 was the worst on record at 30.8%</b> — prices rose by nearly a third in one year. Next worst: 1974 (26.7%)." },
  { level: "Level up", title: "How long do Pakistanis live now, vs the 1960s?",
    what: "IN (…) picks just a few snapshot years so you can compare across generations.",
    sql: "SELECT year, ROUND(life_expectancy, 1) AS life_expectancy_years\nFROM pakistan\nWHERE year IN (1960, 1980, 2000, 2020, 2024)\nORDER BY year;",
    insight: "Life expectancy jumped from <b>44.1 years (1960) to 67.8 years (2024)</b> — almost 24 extra years of life." },
  { level: "Level up", title: "Does Pakistan sell more than it buys? (trade balance)",
    what: "Comparing two columns row-by-row. If imports are always bigger, the country runs a trade deficit.",
    sql: "SELECT year,\n       ROUND(exports_pct_gdp, 1) AS exports_pct,\n       ROUND(imports_pct_gdp, 1) AS imports_pct\nFROM pakistan\nWHERE year >= 2015\nORDER BY year;",
    insight: "Every year, <b>imports beat exports</b> (2024: 17.2% vs 10.4% of GDP) — Pakistan buys more from the world than it sells." },
  { level: "Level up", title: "Average income per person, by decade",
    what: "GROUP BY bundles years into decades; AVG then averages each bundle. This is how analysts summarize long trends.",
    sql: "SELECT (year/10)*10 AS decade,\n       ROUND(AVG(gdp_per_capita), 0) AS avg_income_usd\nFROM pakistan\nGROUP BY decade\nORDER BY decade;",
    insight: "Decade averages climb from <b>$112 (1960s) to $1,422 (2020s)</b> — roughly a 12× rise in 60 years." },
  { level: "Level up", title: "What do we actually know about literacy? (honest gaps)",
    what: "Some indicators are measured rarely. This shows the latest real measurements — and where data simply stops.",
    sql: "SELECT year,\n       ROUND(literacy_pct, 1) AS literacy_pct,\n       ROUND(unemployment_pct, 1) AS unemployment_pct,\n       ROUND(internet_pct, 1) AS internet_pct\nFROM pakistan\nWHERE literacy_pct IS NOT NULL\nORDER BY year DESC\nLIMIT 5;",
    insight: "Literacy data <b>stops at 2021 (58.9%)</b> — the World Bank has no newer figure, so we show the gap instead of guessing." },
  { level: "Advanced", title: "Pakistan vs India: the population race (JOIN)",
    what: "JOIN lines up two copies of the countries table on the same year, so you can compare countries side by side.",
    sql: "SELECT p.year,\n       p.population AS pakistan_pop,\n       i.population AS india_pop\nFROM countries p\nJOIN countries i ON p.year = i.year\nWHERE p.country_code = 'PAK' AND i.country_code = 'IND'\nORDER BY p.year DESC\nLIMIT 10;",
    insight: "In 2024: <b>India ≈ 1.45 billion vs Pakistan ≈ 251 million</b> — India is nearly 6× larger." },
  { level: "Advanced", title: "Pakistan vs Bangladesh: who earns more per person?",
    what: "Same JOIN trick, now on income. Watch the two columns cross over in the mid-2010s.",
    sql: "SELECT p.year,\n       ROUND(p.gdp_per_capita, 0) AS pakistan_usd,\n       ROUND(b.gdp_per_capita, 0) AS bangladesh_usd\nFROM countries p\nJOIN countries b ON p.year = b.year\nWHERE p.country_code = 'PAK' AND b.country_code = 'BGD'\nORDER BY p.year DESC\nLIMIT 12;",
    insight: "Bangladesh <b>overtook Pakistan in 2016</b> ($1,649 vs $1,425) and has stayed ahead since — a famous turnaround story." },
  { level: "Advanced", title: "Which decade grew the fastest?",
    what: "MAX − MIN inside each decade measures the whole decade's growth. A subquery-free way to compare eras.",
    sql: "SELECT (year/10)*10 AS decade,\n       ROUND((MAX(gdp_per_capita) - MIN(gdp_per_capita)) / MIN(gdp_per_capita) * 100, 1) AS growth_percent\nFROM pakistan\nGROUP BY decade\nORDER BY growth_percent DESC;",
    insight: "The <b>1970s grew fastest (+155.6%)</b> — income per person more than doubled within the decade." }
];

const CHALLENGES = [
  { q: "In which decade did Pakistan's GDP per capita grow fastest?",
    hint: "Hint: group years into decades with (year/10)*10, then compare MAX and MIN of gdp_per_capita inside each decade. (Answer: the 1970s.)" },
  { q: "Was inflation above 10% in more years before 2000, or from 2000 onward?",
    hint: "Hint: use SUM(CASE WHEN … THEN 1 ELSE 0 END) to count years in each period. (Answer: 11 years before 2000 vs 8 after.)" },
  { q: "In the latest year with data, which of the three countries has the highest life expectancy?",
    hint: "Hint: query the countries table with ORDER BY life_expectancy DESC. (Answer: Bangladesh, 74.9 years in 2024.)" },
  { q: "In which year did remittances matter most to Pakistan's economy?",
    hint: "Hint: ORDER BY remittances_pct_gdp DESC LIMIT 1. (Answer: 1983, at 10.2% of GDP.)" }
];

let db = null, meta = null, lastResult = null;

/* ---------- helpers ---------- */
function fmt(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== "number") return String(v);
  if (Number.isInteger(v)) return Math.abs(v) < 10000 ? String(v) : v.toLocaleString("en-US");
  const dec = Math.abs(v) >= 100 ? 1 : 2;
  return v.toLocaleString("en-US", { maximumFractionDigits: dec });
}
function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function friendlyError(msg) {
  const m = msg.toLowerCase();
  if (m.includes("no such table")) {
    const t = (msg.match(/no such table:?\s*(\S+)/i) || [])[1] || "that";
    return `There's no table called “${esc(t)}”. We only have two tables: <b>pakistan</b> and <b>countries</b> — check the schema list on the side.`;
  }
  if (m.includes("no such column")) {
    const c = (msg.match(/no such column:?\s*(\S+)/i) || [])[1] || "that";
    return `There's no column called “${esc(c)}”. Column names must match exactly — look at the schema list for the correct spelling.`;
  }
  if (m.includes("syntax error"))
    return `SQL couldn't understand this. Common causes: a missing comma, an unclosed quote ('), or a misspelled keyword like <b>SELECT</b>, <b>FROM</b>, <b>WHERE</b>.`;
  if (m.includes("ambiguous column name"))
    return `Two tables share that column name, so SQL doesn't know which one you mean. Write it as <b>table.column</b> — e.g. <b>p.year</b> instead of just <b>year</b>.`;
  if (m.includes("no such function"))
    return `That function doesn't exist in SQLite. Safe bets: <b>ROUND, AVG, SUM, MIN, MAX, COUNT</b>.`;
  return `SQL reported a problem: ${esc(msg)}`;
}

/* ---------- query engine ---------- */
function runQuery(sql) {
  if (!db) throw new Error("Database not ready yet.");
  const cleaned = sql.trim().replace(/;+\s*$/, "");
  if (!cleaned) throw new Error("Empty query — write something first.");
  const t0 = performance.now();
  const res = db.exec(cleaned);            // one statement only
  const ms = performance.now() - t0;
  if (!res.length) return { columns: [], values: [], ms, rows: 0, note: "Query ran fine — it just returned no rows (e.g. an INSERT, or a filter that matched nothing)." };
  return { columns: res[0].columns, values: res[0].values, ms, rows: res[0].values.length, note: null };
}

function resultTableHTML(result) {
  const { columns, values, rows } = result;
  if (!columns.length) return `<p class="cap-note">${esc(result.note)}</p>`;
  const shown = values.slice(0, DISPLAY_ROW_CAP);
  let h = `<div class="result-meta"><span>📄 ${rows.toLocaleString()} row${rows===1?"":"s"}</span>` +
          `<span>⏱ ${result.ms < 1 ? "<1" : Math.round(result.ms)} ms</span>` +
          `<span>🧾 ${columns.length} column${columns.length===1?"":"s"}</span></div>`;
  h += `<div class="table-scroll"><table><thead><tr>${columns.map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>`;
  for (const row of shown) {
    h += "<tr>" + row.map(v => {
      const f = fmt(v);
      if (f === null) return `<td class="null">–</td>`;
      const num = typeof v === "number";
      return `<td class="${num?"num":""}">${esc(f)}</td>`;
    }).join("") + "</tr>";
  }
  h += "</tbody></table></div>";
  if (rows > DISPLAY_ROW_CAP)
    h += `<p class="cap-note">Showing the first ${DISPLAY_ROW_CAP} of ${rows.toLocaleString()} rows. Export CSV to get them all.</p>`;
  return h;
}

function errorHTML(msg) {
  return `<div class="err" role="alert"><b>⚠️ Couldn't run that query.</b><br>${friendlyError(msg)}` +
         `<details><summary>Technical details</summary><code>${esc(msg)}</code></details></div>`;
}

/* ---------- LEARN mode ---------- */
function renderPresets() {
  const wrap = document.getElementById("preset-list");
  wrap.innerHTML = PRESETS.map((p, i) => `
    <article class="qcard">
      <span class="lvl ${p.level==="Advanced"?"adv":""}">${i+1} · ${esc(p.level)}</span>
      <h3>${esc(p.title)}</h3>
      <p class="what">${esc(p.what)}</p>
      <pre class="sql">${esc(p.sql)}</pre>
      <button class="btn small" data-run="${i}">▶ Run this query</button>
      <button class="btn small ghost" data-copy="${i}">📋 Copy SQL</button>
      <div class="insight">💡 <b>What this tells you:</b> ${p.insight}</div>
      <div class="preset-out" id="preset-out-${i}"></div>
    </article>`).join("");
  wrap.querySelectorAll("[data-run]").forEach(b => b.addEventListener("click", () => {
    const i = +b.dataset.run, out = document.getElementById("preset-out-" + i);
    try {
      const r = runQuery(PRESETS[i].sql);
      out.innerHTML = resultTableHTML(r);
      pushHistory(PRESETS[i].sql);
    } catch (e) { out.innerHTML = errorHTML(e.message); }
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }));
  wrap.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(PRESETS[+b.dataset.copy].sql); b.textContent = "✓ Copied"; }
    catch { b.textContent = "Copy failed"; }
    setTimeout(() => b.textContent = "📋 Copy SQL", 1500);
  }));
}

/* ---------- ANALYST mode ---------- */
function renderSchema() {
  const wrap = document.getElementById("schema-list");
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")[0].values.map(r=>r[0]);
  wrap.innerHTML = tables.map(t => {
    const cols = db.exec(`PRAGMA table_info(${t});`)[0].values;
    const n = db.exec(`SELECT COUNT(*) FROM ${t};`)[0].values[0][0];
    const items = cols.map(c => {
      const name = c[1], type = c[2];
      return `<li><code>${esc(name)}</code> <span style="color:#9aa7b5">${esc(type)}</span>` +
             `<span class="desc">${esc(COL_DESC[name] || "")}</span></li>`;
    }).join("");
    return `<details class="schema-table" ${t==="pakistan"?"open":""}><summary>📁 ${esc(t)} <span style="font-weight:400;color:var(--muted)">· ${n} rows</span></summary><ul>${items}</ul></details>`;
  }).join("");
}

function renderChallenges() {
  document.getElementById("challenge-list").innerHTML = CHALLENGES.map((c, i) => `
    <div class="challenge" id="ch-${i}">
      <div>${esc(c.q)}</div>
      <button class="link" data-hint="${i}">Show hint</button>
      <div class="hint">${esc(c.hint)}</div>
    </div>`).join("");
  document.querySelectorAll("[data-hint]").forEach(b => b.addEventListener("click", () => {
    const el = document.getElementById("ch-" + b.dataset.hint);
    el.classList.toggle("open");
    b.textContent = el.classList.contains("open") ? "Hide hint" : "Show hint";
  }));
}

function pushHistory(sql) {
  try {
    let h = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
    h = [sql, ...h.filter(x => x !== sql)].slice(0, 20);
    localStorage.setItem(HIST_KEY, JSON.stringify(h));
    renderHistory();
  } catch { /* private mode etc. — history just won't persist */ }
}
function renderHistory() {
  const ul = document.getElementById("hist-list");
  let h = [];
  try { h = JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch {}
  if (!h.length) { ul.innerHTML = `<li style="cursor:default;color:var(--muted)">Nothing yet — run a query and it will appear here.</li>`; return; }
  ul.innerHTML = h.map((s, i) => `<li data-h="${i}" title="Click to load">${esc(s.replace(/\s+/g, " ").slice(0, 90))}</li>`).join("");
  ul.querySelectorAll("[data-h]").forEach(li => li.addEventListener("click", () => {
    document.getElementById("sql-input").value = h[+li.dataset.h];
    document.getElementById("sql-input").focus();
  }));
}

function wireAnalyst() {
  const input = document.getElementById("sql-input");
  input.value = "SELECT year, population, ROUND(gdp_per_capita, 0) AS income_per_person\nFROM pakistan\nORDER BY year DESC\nLIMIT 10;";
  const out = document.getElementById("analyst-output");
  const run = () => {
    const sql = input.value;
    try {
      const r = runQuery(sql);
      lastResult = r;
      out.innerHTML = resultTableHTML(r) +
        `<div class="insight">💡 <b>What this tells you:</b> your question returned ${r.rows.toLocaleString()} row${r.rows===1?"":"s"} in ${r.ms<1?"under a millisecond":Math.round(r.ms)+" ms"} — straight from the World Bank data on your device.</div>`;
      pushHistory(sql);
    } catch (e) { out.innerHTML = errorHTML(e.message); lastResult = null; }
  };
  document.getElementById("run-btn").addEventListener("click", run);
  input.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run(); });
  document.getElementById("clear-btn").addEventListener("click", () => { input.value = ""; out.innerHTML = ""; input.focus(); });
  document.getElementById("csv-btn").addEventListener("click", () => {
    if (!lastResult || !lastResult.columns.length) { out.innerHTML = `<div class="err"><b>⚠️ Nothing to export yet.</b><br>Run a query first, then export its results.</div>`; return; }
    const q = v => v === null ? "" : `"${String(v).replace(/"/g, '""')}"`;
    const csv = [lastResult.columns.map(q).join(",")]
      .concat(lastResult.values.map(r => r.map(q).join(","))).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "sql-explorer-results.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  renderHistory();
}

/* ---------- DATA tab ---------- */
function renderDataTab() {
  document.getElementById("api-pattern").textContent = meta.api_pattern;
  document.getElementById("meta-date").textContent = meta.download_date + " (re-run fetch_data.py to refresh)";
  document.getElementById("foot-date").textContent = meta.download_date;
  document.getElementById("indicator-rows").innerHTML = meta.indicators.map(i =>
    `<tr><td>${esc(i.name)}<br><code style="font-size:12px;color:var(--muted)">${esc(i.code)}</code></td>` +
    `<td>${esc(i.unit)}</td><td class="num">${i.years_with_data}</td><td class="num">${i.last_year}</td></tr>`).join("");
  const latestOverall = Math.max(...meta.indicators.map(i => i.last_year));
  document.getElementById("vintage-line").textContent =
    `Real data: World Bank World Development Indicators (CC BY-4.0) · snapshot ${meta.download_date} · most series run to ${latestOverall}, some end earlier — see the Data source tab.`;
}

/* ---------- tabs ---------- */
function wireTabs() {
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach(x => x.setAttribute("aria-selected", "false"));
    document.querySelectorAll(".tabpane").forEach(x => x.classList.remove("active"));
    b.setAttribute("aria-selected", "true");
    document.getElementById("tab-" + b.dataset.tab).classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
}

/* ---------- boot ---------- */
async function boot() {
  wireTabs();
  try {
    const [metaRes, seedRes] = await Promise.all([
      fetch("data/meta.json").then(r => { if (!r.ok) throw new Error("meta.json missing"); return r.json(); }),
      fetch("data/seed.sql").then(r => { if (!r.ok) throw new Error("seed.sql missing"); return r.text(); })
    ]);
    meta = metaRes;
    if (typeof initSqlJs === "undefined")
      throw new Error("SQL library failed to load from the CDN (network blocked?).");
    const SQL = await initSqlJs({ locateFile: f => SQLJS_WASM });
    db = new SQL.Database();
    db.exec(seedRes);
    renderPresets();
    renderSchema();
    renderChallenges();
    wireAnalyst();
    renderDataTab();
  } catch (e) {
    const msg = e.message || String(e);
    document.getElementById("preset-list").innerHTML =
      `<div class="err" role="alert"><b>⚠️ The database couldn't start.</b><br>` +
      (msg.includes("CDN") || msg.includes("fetch")
        ? `Your connection couldn't reach the SQL library (CDN) or the data files. Check your internet and reload — nothing is broken on your side.`
        : `Technical details: ${esc(msg)}`) +
      `<br><br><button class="btn" onclick="location.reload()">↻ Try again</button></div>`;
    document.getElementById("vintage-line").textContent = "Data failed to load — check your connection and reload.";
  }
}
document.addEventListener("DOMContentLoaded", boot);
