#!/usr/bin/env python3
"""
Fetch real World Bank World Development Indicators data and generate:
  - data/snapshot.json : raw long-format records (country, indicator, year, value)
  - data/seed.sql      : CREATE TABLE + INSERTs for the browser SQLite DB
  - data/meta.json     : provenance, license, indicator list, last available year

License: World Bank WDI is CC BY-4.0 (https://datahelpdesk.worldbank.org/knowledgebase/articles/898599-api-terms-of-use)
API docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation

Re-run this script to refresh the snapshot:
    python3 fetch_data.py
Then redeploy the site (data/ files are loaded directly by the app).
"""
import json, time, urllib.request, datetime, os

BASE = "https://api.worldbank.org/v2"
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
os.makedirs(DATA, exist_ok=True)

# 12 deep-dive indicators for Pakistan (wide table: pakistan)
PAK_INDICATORS = [
    ("SP.POP.TOTL",     "population",       "Total population", "people"),
    ("NY.GDP.MKTP.CD",  "gdp",              "GDP (current US$)", "US$"),
    ("NY.GDP.PCAP.CD",  "gdp_per_capita",   "GDP per capita (current US$)", "US$"),
    ("FP.CPI.TOTL.ZG",  "inflation_pct",    "Inflation, consumer prices (annual %)", "%"),
    ("SP.DYN.LE00.IN",  "life_expectancy",  "Life expectancy at birth (years)", "years"),
    ("SE.ADT.LITR.ZS",  "literacy_pct",     "Adult literacy rate (% of people 15+)", "%"),
    ("SL.UEM.TOTL.NE.ZS","unemployment_pct","Unemployment, total (% of labor force)", "%"),
    ("NE.EXP.GNFS.ZS",  "exports_pct_gdp",  "Exports of goods and services (% of GDP)", "%"),
    ("NE.IMP.GNFS.ZS",  "imports_pct_gdp",  "Imports of goods and services (% of GDP)", "%"),
    ("SI.POV.DDAY",     "poverty_pct",      "Poverty headcount ratio at $2.15/day (% of population)", "%"),
    ("BX.TRF.PWKR.DT.GD.ZS","remittances_pct_gdp","Personal remittances received (% of GDP)", "%"),
    ("IT.NET.USER.ZS",  "internet_pct",     "Individuals using the Internet (% of population)", "%"),
]

# Comparator countries + headline indicators (wide table: countries, for JOINs)
COMP_COUNTRIES = [("PAK", "Pakistan"), ("IND", "India"), ("BGD", "Bangladesh")]
COMP_INDICATORS = [
    ("SP.POP.TOTL",    "population",     "Total population", "people"),
    ("NY.GDP.MKTP.CD", "gdp",            "GDP (current US$)", "US$"),
    ("NY.GDP.PCAP.CD", "gdp_per_capita", "GDP per capita (current US$)", "US$"),
    ("SP.DYN.LE00.IN", "life_expectancy","Life expectancy at birth (years)", "years"),
]

YEARS = "1960:2024"

def fetch(country, code):
    url = f"{BASE}/country/{country}/indicator/{code}?format=json&per_page=100&date={YEARS}"
    req = urllib.request.Request(url, headers={"User-Agent": "sql-explorer-portfolio/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        payload = json.loads(r.read().decode("utf-8"))
    if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
        raise RuntimeError(f"No data returned for {country}/{code}")
    return payload[1]

def main():
    snapshot = []          # long-format records
    pak_years = {}         # year -> {col: value}
    comp_years = {}        # (country, year) -> {col: value}
    meta_indicators = []

    print("Fetching Pakistan deep-dive indicators...")
    for code, col, name, unit in PAK_INDICATORS:
        recs = fetch("PAK", code); time.sleep(0.2)
        years_with_data = 0
        last_year = None
        for rec in recs:
            y = int(rec["date"]); v = rec["value"]
            if v is not None:
                years_with_data += 1
                if last_year is None or y > last_year:
                    last_year = y
            pak_years.setdefault(y, {})[col] = v
            snapshot.append({"country": "PAK", "indicator_code": code, "indicator": name,
                             "unit": unit, "year": y, "value": v})
        meta_indicators.append({"code": code, "column": col, "name": name, "unit": unit,
                                "country": "PAK", "years_with_data": years_with_data,
                                "first_year": min(int(r["date"]) for r in recs if r["value"] is not None),
                                "last_year": last_year})
        print(f"  {col:16s} years={years_with_data:3d} last={last_year}")

    print("Fetching comparator headline indicators...")
    for ccode, cname in COMP_COUNTRIES:
        for code, col, name, unit in COMP_INDICATORS:
            recs = fetch(ccode, code); time.sleep(0.2)
            for rec in recs:
                y = int(rec["date"]); v = rec["value"]
                comp_years.setdefault((ccode, cname, y), {})[col] = v
                if ccode == "PAK":  # keep snapshot lean: raw PAK records already saved above
                    pass
                else:
                    snapshot.append({"country": ccode, "indicator_code": code, "indicator": name,
                                     "unit": unit, "year": y, "value": v})

    # ---- seed.sql ----
    pak_cols = ["year"] + [c for _, c, _, _ in PAK_INDICATORS]
    lines = ["-- SQL Explorer seed data: World Bank World Development Indicators (CC BY-4.0)",
             f"-- Generated {datetime.date.today().isoformat()} by fetch_data.py",
             "PRAGMA journal_mode=OFF;",
             "DROP TABLE IF EXISTS pakistan;",
             "CREATE TABLE pakistan (" + ", ".join(["year INTEGER PRIMARY KEY"] +
                 [f"{c} REAL" for _, c, _, _ in PAK_INDICATORS]) + ");"]
    for y in sorted(pak_years):
        vals = [y] + [pak_years[y].get(c) for _, c, _, _ in PAK_INDICATORS]
        def lit(v):
            return "NULL" if v is None else repr(float(v))
        lines.append(f"INSERT INTO pakistan ({', '.join(pak_cols)}) VALUES ({', '.join(lit(v) for v in vals)});")
    lines += ["",
              "DROP TABLE IF EXISTS countries;",
              "CREATE TABLE countries (country_code TEXT, country_name TEXT, year INTEGER, " +
              ", ".join(f"{c} REAL" for _, c, _, _ in COMP_INDICATORS) +
              ", PRIMARY KEY (country_code, year));"]
    for (ccode, cname, y) in sorted(comp_years):
        row = comp_years[(ccode, cname, y)]
        vals = [lit(row.get(c)) for _, c, _, _ in COMP_INDICATORS]
        lines.append(f"INSERT INTO countries VALUES ({ccode!r}, {cname!r}, {y}, {', '.join(vals)});")

    def lit(v):
        return "NULL" if v is None else repr(float(v))

    with open(os.path.join(DATA, "seed.sql"), "w") as f:
        f.write("\n".join(lines) + "\n")

    with open(os.path.join(DATA, "snapshot.json"), "w") as f:
        json.dump(snapshot, f)

    meta = {
        "source": "World Bank World Development Indicators (WDI)",
        "api": BASE,
        "api_pattern": f"{BASE}/country/{{COUNTRY}}/indicator/{{CODE}}?format=json&per_page=100&date={YEARS}",
        "license": "CC BY-4.0 (World Bank data terms of use)",
        "download_date": datetime.date.today().isoformat(),
        "note": "Series have different coverage: latest available year varies per indicator (shown honestly in the app).",
        "tables": {
            "pakistan": {"rows": len(pak_years), "columns": pak_cols,
                         "description": "Pakistan, 12 indicators, 1960-2024 (NULL where the World Bank has no data)"},
            "countries": {"rows": len(comp_years),
                          "columns": ["country_code", "country_name", "year"] + [c for _, c, _, _ in COMP_INDICATORS],
                          "description": "Pakistan, India, Bangladesh — 4 headline indicators, for JOIN comparisons"},
        },
        "indicators": meta_indicators,
    }
    with open(os.path.join(DATA, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\nWrote data/seed.sql ({os.path.getsize(os.path.join(DATA,'seed.sql'))/1024:.0f} KB), "
          f"data/snapshot.json ({os.path.getsize(os.path.join(DATA,'snapshot.json'))/1024:.0f} KB), data/meta.json")
    print(f"pakistan rows: {len(pak_years)}, countries rows: {len(comp_years)}")

if __name__ == "__main__":
    main()
