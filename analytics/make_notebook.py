"""Builds and executes analytics/VoltSlot_Analytics.ipynb (PS-IV style narrative analysis of the VoltSlot data warehouse)."""
import sys
from pathlib import Path
import nbformat as nbf
from nbconvert.preprocessors import ExecutePreprocessor

HERE = Path(__file__).resolve().parent
OUT = HERE / "VoltSlot_Analytics.ipynb"
nb = nbf.v4.new_notebook()
C = []


def md(t):
    C.append(nbf.v4.new_markdown_cell(t.strip()))


def code(t):
    C.append(nbf.v4.new_code_cell(t.strip()))


md("""# VoltSlot - Analytics Notebook
**TCET IT: PBL + IP + PS-IV** - EV charging locator and slot-booking system.
All data is **synthetic** (seed 42). This notebook walks through the PS-IV topics on the VoltSlot data warehouse:
data cleaning verification, EDA, statistics and hypothesis tests, regression, time-series forecasting, K-Means segmentation,
text sentiment, and a business summary.

Table convention: every table printed here starts with a **Sr No** column, headers are bold and centred, numbers are right-aligned
and rupee values use Indian digit grouping (e.g. Rs 12,34,567).""")

code("""
import sys, warnings
warnings.filterwarnings("ignore")
sys.path.insert(0, "..")
sys.path.insert(0, ".")
from pathlib import Path
import numpy as np, pandas as pd, matplotlib.pyplot as plt, seaborn as sns
from scipy import stats
import statsmodels.api as sm
from common import get_conn, query, indian, inr

plt.rcParams.update({"figure.facecolor": "#0f1720", "axes.facecolor": "#0f1720", "savefig.facecolor": "#0f1720", "text.color": "#e6edf3",
    "axes.labelcolor": "#e6edf3", "xtick.color": "#9fb0c0", "ytick.color": "#9fb0c0", "axes.edgecolor": "#3a4756", "grid.color": "#243241",
    "axes.grid": True, "figure.dpi": 100})
PAL = ["#2ec4b6", "#ff9f1c", "#5aa9ff", "#e56b6f", "#b388eb", "#8bd450"]
np.random.seed(42)
conn = get_conn()

def show(df, money=(), ints=(), dec=2):
    \"\"\"Org table standard: Sr No first column, bold centred headers, numbers right, text left, INR in Indian grouping.\"\"\"
    d = df.reset_index(drop=True).copy()
    d.insert(0, "Sr No", range(1, len(d) + 1))
    fm = {}
    for c in d.columns[1:]:
        if c in money:
            fm[c] = lambda v: "" if pd.isna(v) else "Rs " + indian(v, 2)
        elif pd.api.types.is_numeric_dtype(d[c]) and c not in ints:
            fm[c] = (lambda v, dec=dec: "" if pd.isna(v) else (f"{v:,.0f}" if float(v).is_integer() else f"{v:,.{dec}f}"))
        elif c in ints:
            fm[c] = lambda v: "" if pd.isna(v) else f"{int(v):,}"
    num = [c for c in d.columns if pd.api.types.is_numeric_dtype(d[c])]
    txt = [c for c in d.columns if c not in num]
    sty = d.style.hide(axis="index").format(fm)
    sty = sty.set_table_styles([{"selector": "th", "props": [("text-align", "center"), ("font-weight", "bold")]}])
    sty = sty.set_properties(subset=num, **{"text-align": "right"}).set_properties(subset=txt, **{"text-align": "left"})
    from IPython.display import display
    display(sty)
""")

md("## 1. Data model and row counts\nThirty OLTP tables plus the `dw_` star schema (dimensions: date, station, connector, vehicle; fact: session).")
code("""
tabs = query("SELECT table_name AS tbl, table_rows AS approx_rows FROM information_schema.tables WHERE table_schema='chargeiq' ORDER BY table_name")
exact = []
for t in tabs["tbl"]:
    exact.append(int(query(f"SELECT COUNT(*) n FROM `{t}`")["n"][0]))
tabs = pd.DataFrame({"table": tabs["tbl"], "rows": exact})
show(tabs, ints=("rows",))
""")

md("""## 2. Data cleaning (PS-IV: pre-processing)
The raw extracts (`data/raw/*_raw.csv`) were generated with realistic defects: duplicates, mixed date formats (ISO vs DD/MM/YYYY),
inconsistent spellings, trailing blanks, phone variants, swapped latitude/longitude, negative and 10x energy outliers, `N/A` / `-` tokens.
`clean_data.py` repairs them and writes a log and a cell-level verification against the clean truth.""")
code("""
D = Path("..") / "data"
log = pd.read_csv(D / "cleaning_log.csv")
ver = pd.read_csv(D / "cleaning_verification.csv")
print("Cleaning log columns:", list(log.columns))
show(log.head(25))
""")
code("""
show(ver)
""")

md("## 3. Exploratory data analysis\n### 3.1 Bookings by status and by source")
code("""
bs = query("SELECT status, COUNT(*) bookings FROM bookings GROUP BY status ORDER BY bookings DESC")
bs["share_pct"] = (bs["bookings"] / bs["bookings"].sum() * 100).round(2)
show(bs, ints=("bookings",))
src = query("SELECT source, COUNT(*) bookings, ROUND(AVG(est_cost),2) avg_est_cost FROM bookings GROUP BY source ORDER BY bookings DESC")
show(src, money=("avg_est_cost",), ints=("bookings",))
""")

md("### 3.2 Monthly sessions, energy and revenue (growth, monsoon dip)")
code("""
m = query(\"\"\"SELECT d.month_key AS month, COUNT(*) sessions, ROUND(SUM(f.energy_kwh),1) energy_kwh, ROUND(SUM(f.revenue),2) revenue
              FROM dw_fact_session f JOIN dw_dim_date d ON d.date_key=f.date_key GROUP BY d.month_key ORDER BY 1\"\"\")
show(m, money=("revenue",), ints=("sessions",))
fig, ax = plt.subplots(figsize=(10, 4))
ax.bar(m["month"], m["sessions"], color=PAL[0], width=.65)
ax.set_title("Sessions per month"); ax.set_xlabel("Month"); ax.set_ylabel("Sessions"); plt.xticks(rotation=45); plt.show()
""")

md("### 3.3 Hour-of-day by weekday heatmap")
code("""
h = query(\"\"\"SELECT d.day_of_week dow, f.time_key hr, COUNT(*) n FROM dw_fact_session f JOIN dw_dim_date d ON d.date_key=f.date_key GROUP BY 1,2\"\"\")
pv = h.pivot(index="dow", columns="hr", values="n").fillna(0)
fig, ax = plt.subplots(figsize=(11, 3.8))
sns.heatmap(pv, cmap="mako", ax=ax, cbar_kws={"label": "sessions"})
ax.set_title("Sessions by weekday (1=Sun..7=Sat per dim_date) and hour"); ax.set_xlabel("Hour of day"); ax.set_ylabel("Day of week"); plt.show()
""")

md("### 3.4 Energy and duration by connector / vehicle category")
code("""
e = query(\"\"\"SELECT c.code connector, v.category, COUNT(*) sessions, ROUND(AVG(f.energy_kwh),2) avg_kwh, ROUND(AVG(f.duration_min),1) avg_min,
              ROUND(AVG(f.effective_tariff),2) avg_tariff FROM dw_fact_session f JOIN dw_dim_connector c ON c.connector_key=f.connector_key
              JOIN dw_dim_vehicle v ON v.vehicle_key=f.vehicle_key GROUP BY 1,2 ORDER BY 1,2\"\"\")
show(e, money=("avg_tariff",), ints=("sessions",))
""")

md("### 3.5 Revenue by zone")
code("""
z = query(\"\"\"SELECT s.zone, COUNT(*) sessions, ROUND(SUM(f.revenue),2) revenue, ROUND(SUM(f.energy_kwh),1) energy_kwh
              FROM dw_fact_session f JOIN dw_dim_station s ON s.station_key=f.station_key GROUP BY 1 ORDER BY revenue DESC\"\"\")
show(z, money=("revenue",), ints=("sessions",))
fig, ax = plt.subplots(figsize=(9, 4))
ax.barh(z["zone"][::-1], z["revenue"][::-1].astype(float) / 1e5, color=PAL[2]); ax.set_xlabel("Revenue (Rs lakh)"); ax.set_title("Revenue by zone"); plt.show()
""")

md("## 4. Descriptive statistics and correlation")
code("""
fs = query("SELECT energy_kwh, duration_min, revenue, effective_tariff, lead_time_hours, soc_start, soc_end FROM dw_fact_session").astype(float)
desc = fs.describe().T.reset_index().rename(columns={"index": "variable"})
show(desc.round(2))
fig, ax = plt.subplots(figsize=(7, 5.5))
sns.heatmap(fs.corr(), annot=True, fmt=".2f", cmap="vlag", center=0, ax=ax); ax.set_title("Correlation matrix"); plt.show()
""")
md("Energy, duration and revenue are strongly positively correlated (a longer charge delivers more kWh and costs more); "
   "`soc_start` is negatively correlated with energy delivered (a lower start state-of-charge leaves more room to charge).")

md("""## 5. Hypothesis tests
### 5.1 Is weekend demand different from weekday demand? (Welch t-test on daily sessions)""")
code("""
daily = query(\"\"\"SELECT d.full_date dt, d.is_weekend wk, d.is_holiday hol, d.weather_label wx, COUNT(*) n
                 FROM dw_fact_session f JOIN dw_dim_date d ON d.date_key=f.date_key GROUP BY 1,2,3,4 ORDER BY 1\"\"\")
daily["dt"] = pd.to_datetime(daily["dt"])
a = daily.loc[daily.wk == 1, "n"].astype(float); b = daily.loc[daily.wk == 0, "n"].astype(float)
t, p = stats.ttest_ind(a, b, equal_var=False)
print(f"Weekend mean {a.mean():.1f} vs weekday mean {b.mean():.1f} sessions/day;  Welch t = {t:.2f},  p = {p:.4g}")
print("Reject H0 (equal means) at 5%" if p < .05 else "Fail to reject H0 at 5%")
""")
md("### 5.2 Does the connector type change energy per session? (one-way ANOVA)")
code("""
g = query("SELECT c.code, f.energy_kwh FROM dw_fact_session f JOIN dw_dim_connector c ON c.connector_key=f.connector_key")
groups = [x["energy_kwh"].astype(float).values for _, x in g.groupby("code") if len(x) > 5]
F, p = stats.f_oneway(*groups)
print(f"ANOVA over {len(groups)} connector types: F = {F:.2f}, p = {p:.4g}")
""")
md("### 5.3 Is rating independent of sentiment label? (chi-square test of independence)")
code("""
r = query("SELECT rating, sentiment_label FROM reviews WHERE sentiment_label IS NOT NULL")
ct = pd.crosstab(r["rating"], r["sentiment_label"])
chi2, p, dof, _ = stats.chi2_contingency(ct)
print(f"chi2 = {chi2:.1f}, dof = {dof}, p = {p:.3g}  -> rating and sentiment are strongly associated")
show(ct.reset_index())
""")

md("""## 6. Regression
### 6.1 Rain vs daily sessions (OLS, detrended)
Raw OLS of sessions on rainfall is confounded by network growth, so we detrend with a linear time term and a weekend dummy.""")
code("""
w = query("SELECT weather_date dt, rainfall_mm, avg_temp_c FROM weather_daily")
w["dt"] = pd.to_datetime(w["dt"])
df = daily.merge(w, on="dt", how="left")
df["t"] = np.arange(len(df)); df["rain"] = df["rainfall_mm"].astype(float)
X = sm.add_constant(df[["t", "wk", "rain"]].astype(float)); mod = sm.OLS(df["n"].astype(float), X).fit()
print(mod.summary().tables[1])
print(f"R-squared = {mod.rsquared:.3f}")
idx = df.groupby("wx")["n"].mean()
print("Mean daily sessions by weather label:\\n", idx.round(2).to_string())
""")
md("### 6.2 Energy delivered from duration and start state-of-charge")
code("""
d2 = fs.dropna()
X = sm.add_constant(d2[["duration_min", "soc_start"]]); m2 = sm.OLS(d2["energy_kwh"], X).fit()
print(m2.summary().tables[1]); print(f"R-squared = {m2.rsquared:.3f}")
""")

md("## 7. Time-series forecasting (Holt-Winters)\n`forecast.py` fits additive damped-trend Holt-Winters with weekly seasonality per zone, back-tests on the last 28 days, and stores 42-day forecasts in `network_forecast`.")
code("""
ev = pd.read_csv(D.parent / "analytics" / "reports" / "forecast_eval.csv") if (D.parent / "analytics" / "reports" / "forecast_eval.csv").exists() else pd.read_csv("reports/forecast_eval.csv")
show(ev.round(3))
nf = query("SELECT forecast_date dt, predicted_sessions, lower_bound, upper_bound FROM network_forecast WHERE zone='ALL' ORDER BY 1")
hist = daily.groupby("dt")["n"].sum().tail(90)
fig, ax = plt.subplots(figsize=(10, 4))
ax.plot(hist.index, hist.values, color=PAL[0], lw=1.6, label="Actual")
nf["dt"] = pd.to_datetime(nf["dt"])
ax.plot(nf["dt"], nf["predicted_sessions"].astype(float), color=PAL[1], lw=2, label="Forecast")
ax.fill_between(nf["dt"], nf["lower_bound"].astype(float), nf["upper_bound"].astype(float), color=PAL[1], alpha=.2, label="Interval")
ax.set_title("Network sessions: last 90 days and 42-day forecast"); ax.legend(); plt.show()
""")

md("## 8. Segmentation (K-Means)\nUsers are clustered on usage features (standardised); k chosen by silhouette. Stations are clustered similarly.")
code("""
sg = query("SELECT segment_label, COUNT(*) users, ROUND(AVG(sessions_12m),1) avg_sessions, ROUND(AVG(avg_energy_kwh),1) avg_kwh, ROUND(AVG(night_share)*100,1) night_pct, ROUND(AVG(weekend_share)*100,1) weekend_pct, ROUND(AVG(total_spend),2) avg_spend FROM user_segments GROUP BY 1 ORDER BY users DESC")
show(sg, money=("avg_spend",), ints=("users",))
sil = pd.read_csv("reports/silhouette_scores.csv")
show(sil.round(3))
sc = query("SELECT cluster_label, COUNT(*) stations, ROUND(AVG(avg_daily_sessions),2) avg_daily, ROUND(AVG(revenue_12m),2) avg_revenue FROM station_clusters GROUP BY 1 ORDER BY stations DESC")
show(sc, money=("avg_revenue",), ints=("stations",))
""")

md("## 9. Review sentiment (TextBlob)")
code("""
sn = query("SELECT sentiment_label, COUNT(*) reviews, ROUND(AVG(rating),2) avg_rating, ROUND(AVG(sentiment_score),3) avg_polarity FROM reviews GROUP BY 1 ORDER BY reviews DESC")
show(sn, ints=("reviews",))
kw = query("SELECT word, freq FROM sentiment_keywords ORDER BY freq DESC LIMIT 15")
show(kw, ints=("freq",))
""")

md("## 10. Booking funnel and lead time")
code("""
fn = query("SELECT event_type, COUNT(DISTINCT session_key) journeys FROM funnel_events GROUP BY 1")
order = ["SEARCH", "VIEW_STATION", "SELECT_SLOT", "BOOK", "CHECK_IN", "COMPLETE"]
fn = fn.set_index("event_type").reindex(order).reset_index()
fn["pct_of_search"] = (fn["journeys"] / fn["journeys"].iloc[0] * 100).round(1)
show(fn, ints=("journeys",))
lt = query("SELECT lead_time_hours FROM dw_fact_session").astype(float)["lead_time_hours"]
fig, ax = plt.subplots(figsize=(9, 3.6)); ax.hist(lt.clip(upper=72), bins=36, color=PAL[4]); ax.set_title("Booking lead time (hours, clipped at 72)"); plt.show()
print(f"median lead time {lt.median():.1f} h, mean {lt.mean():.1f} h")
""")

md("## 11. Business summary")
code("""
k = query(\"\"\"SELECT COUNT(*) sessions, SUM(energy_kwh) kwh, SUM(revenue) revenue, SUM(co2_avoided_kg) co2 FROM dw_fact_session\"\"\").astype(float).iloc[0]
print(f"Sessions: {int(k.sessions):,}")
print(f"Energy delivered: {k.kwh:,.0f} kWh")
print(f"Revenue: Rs {indian(k.revenue, 2)}")
print(f"CO2 avoided: {k.co2:,.0f} kg")
""")
md("""**Findings.** Demand grows through the year with a monsoon dip; weekday demand is modestly higher than weekend demand (commuter and fleet use dominate); evening peaks at office hubs drive crowding;
a small set of stations carries most revenue (Pareto); DC fast connectors deliver more energy per session; reviews are mostly positive and
cluster around reliability, price and waiting time. These patterns are what the booking system's slot suggestion, crowding forecast and
recharge reminders exploit.""")

nb["cells"] = C
nb["metadata"]["kernelspec"] = {"display_name": "Python 3", "language": "python", "name": "python3"}

if __name__ == "__main__":
    ExecutePreprocessor(timeout=900, kernel_name="python3").preprocess(nb, {"metadata": {"path": str(HERE)}})
    nbf.write(nb, OUT)
    print("wrote", OUT, f"({OUT.stat().st_size/1024:.0f} KB)")
