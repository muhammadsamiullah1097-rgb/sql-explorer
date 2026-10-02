# SQL Explorer — Real SQL on Real Pakistan Data

A fully static, mobile-first web app where anyone can run **real SQL queries against real
World Bank data** (Pakistan 1960–2024, plus India & Bangladesh for comparisons) — entirely
in the browser via SQLite compiled to WebAssembly (sql.js). No server, no sign-up, no fake data.

**Live structure:** `index.html` + `css/` + `js/` + `data/` — drop on any static host (GitHub Pages ready).

## Data provenance

| Item | Detail |
|---|---|
| Source | World Bank **World Development Indicators (WDI)** |
| Access | Public API, no key: `https://api.worldbank.org/v2/country/{COUNTRY}/indicator/{CODE}?format=json&per_page=100&date=1960:2024` |
| License | **CC BY-4.0** (World Bank data terms of use) |
| Snapshot date | **2026-10-02** (see `data/meta.json`) |
| Tables | `pakistan` — 65 rows (1960–2024) × 12 indicators; `countries` — 195 rows (PAK/IND/BGD × 1960–2024) × 4 headline indicators |

### Indicator codes used (`pakistan` table)

| Column | WDI code | Latest year in snapshot |
|---|---|---|
| population | SP.POP.TOTL | 2024 |
| gdp | NY.GDP.MKTP.CD | 2024 |
| gdp_per_capita | NY.GDP.PCAP.CD | 2024 |
| inflation_pct | FP.CPI.TOTL.ZG | 2024 |
| life_expectancy | SP.DYN.LE00.IN | 2024 |
| literacy_pct | SE.ADT.LITR.ZS | 2021 |
| unemployment_pct | SL.UEM.TOTL.NE.ZS | 2021 |
| exports_pct_gdp | NE.EXP.GNFS.ZS | 2024 |
| imports_pct_gdp | NE.IMP.GNFS.ZS | 2024 |
| poverty_pct | SI.POV.DDAY | 2024 |
| remittances_pct_gdp | BX.TRF.PWKR.DT.GD.ZS | 2024 |
| internet_pct | IT.NET.USER.ZS | 2024 |

The `countries` table reuses SP.POP.TOTL, NY.GDP.MKTP.CD, NY.GDP.PCAP.CD, SP.DYN.LE00.IN for PAK/IND/BGD.

**Honesty notes:** series have different end years (literacy stops at 2021) — the app shows this per indicator and renders missing values as "–" instead of inventing them. One candidate series (EN.ATM.CO2E.PC, CO₂ per capita) was dropped because the World Bank API reports it deleted/archived; it was replaced with personal remittances (BX.TRF.PWKR.DT.GD.ZS), which is far more meaningful for Pakistan anyway.

## Refreshing the data

```bash
cd ~/workspace/projects/sql-explorer
python3 fetch_data.py     # re-downloads from the World Bank API, rebuilds data/seed.sql + snapshot.json + meta.json
```

Then redeploy the folder. No build step — the browser loads `data/seed.sql` + `data/meta.json` directly.

## App features

- **🧭 Learn mode** — 10 guided queries from `SELECT` → `WHERE` → `GROUP BY` → `JOIN`, each with a plain-English explanation and a verified "what this tells you" insight.
- **💻 Analyst mode** — free SQL editor (Ctrl+Enter to run), schema sidebar with plain-language column descriptions, row count + query time, **CSV export**, **query history** (localStorage), challenge prompts with hints, and SQLite errors translated into plain language.
- **📦 Data source tab** — provenance, CC BY-4.0 license, API pattern, per-indicator vintage table. No fake "LIVE" badges.
- Graceful failure if the sql.js CDN/WASM can't load, with a retry button.

## QA

- `node --check js/app.js` — syntax OK
- Served locally, HTTP 200 on `/`
- Spot-checked queries: Pakistan 2023 population = 247,504,495 ✓; 2024 GDP per capita = $1,479.5 ✓; 2023 inflation = 30.8% (record high) ✓; Bangladesh overtook Pakistan in GDP per capita in 2016 ✓; 2024 life expectancy BGD 74.9 / IND 72.2 / PAK 67.8 ✓
