"""Step 9 - Matplotlib + Seaborn charts (dark style) -> analytics/reports/*.png  (>= 14 charts).

Palette: validated categorical set from the dataviz skill (dark surface), blue sequential ramp for magnitude.
"""
import warnings
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
import seaborn as sns
import statsmodels.api as sm
from common import *

warnings.filterwarnings("ignore")
BG, INK, INK2, GRID = "#1a1a19", "#ffffff", "#c3c2b7", "#383835"
C = dict(blue="#3987e5", orange="#d95926", aqua="#199e70", yellow="#c98500", magenta="#d55181", violet="#9085e9", red="#e66767", green="#0ca30c")
CAT = [C["blue"], C["orange"], C["aqua"], C["yellow"], C["magenta"], C["violet"], C["red"]]
SEQ = LinearSegmentedColormap.from_list("seq", ["#14304f", "#256abf", "#3987e5", "#86b6ef", "#cde2fb"])
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

plt.rcParams.update({"figure.facecolor": BG, "axes.facecolor": BG, "savefig.facecolor": BG, "axes.edgecolor": GRID, "axes.labelcolor": INK2,
                     "xtick.color": INK2, "ytick.color": INK2, "text.color": INK, "axes.titlecolor": INK, "axes.titlesize": 13, "axes.titleweight": "bold",
                     "axes.titlelocation": "left", "grid.color": GRID, "grid.linewidth": .6, "axes.grid": True, "axes.axisbelow": True,
                     "axes.spines.top": False, "axes.spines.right": False, "legend.facecolor": BG, "legend.edgecolor": GRID, "legend.labelcolor": INK,
                     "font.size": 10, "figure.dpi": 100})
OUT = REPORTS
SAVED = []


def save(fig, name, note=None):
    if note:
        fig.text(0.01, -0.035, note, fontsize=8, color=INK2, ha="left", va="top", wrap=True)
    fig.savefig(OUT / name, dpi=130, bbox_inches="tight")
    plt.close(fig)
    SAVED.append(name)


def load(conn):
    d = {}
    d["sess"] = query("""SELECT cs.id, cs.started_at, cs.ended_at, cs.energy_kwh, cs.amount, cs.tariff, cs.soc_start, cs.soc_end, cs.avg_kw, cs.co2_avoided_kg,
                         b.station_id, b.user_id, b.vehicle_id, b.source, b.created_at, b.start_time, s.zone, s.tier, s.name station_name, ct.code connector,
                         vm.category, vm.model, v.fleet_id
                         FROM charging_sessions cs JOIN bookings b ON b.id=cs.booking_id JOIN stations s ON s.id=b.station_id
                         JOIN charging_points cp ON cp.id=b.charging_point_id JOIN connector_types ct ON ct.id=cp.connector_type_id
                         JOIN vehicles v ON v.id=b.vehicle_id JOIN vehicle_models vm ON vm.id=v.model_id""", conn=conn)
    s = d["sess"]
    for c in ("started_at", "ended_at", "created_at", "start_time"):
        s[c] = pd.to_datetime(s[c])
    for c in ("energy_kwh", "amount", "tariff", "avg_kw", "co2_avoided_kg"):
        s[c] = s[c].astype(float)
    s["duration_min"] = (s.ended_at - s.started_at).dt.total_seconds() / 60
    s["hour"] = s.started_at.dt.hour
    s["dow"] = s.started_at.dt.dayofweek
    s["date"] = s.started_at.dt.normalize()
    s["lead_h"] = ((s.start_time - s.created_at).dt.total_seconds() / 3600).clip(lower=0)
    d["weather"] = query("SELECT * FROM weather_daily", conn=conn)
    d["weather"]["weather_date"] = pd.to_datetime(d["weather"].weather_date)
    d["hol"] = query("SELECT * FROM holidays", conn=conn)
    d["hol"]["holiday_date"] = pd.to_datetime(d["hol"].holiday_date)
    return d


def ch_heatmap(d):
    s = d["sess"]
    pv = s.pivot_table(index="dow", columns="hour", values="id", aggfunc="count").reindex(index=range(7), columns=range(24)).fillna(0)
    fig, ax = plt.subplots(figsize=(11, 4))
    sns.heatmap(pv, cmap=SEQ, ax=ax, cbar_kws={"label": "sessions (Oct 2025 - Sep 2026)"}, linewidths=.6, linecolor=BG)
    ax.set_yticklabels(DAYS, rotation=0)
    ax.set_xlabel("hour of day (session start)")
    ax.set_ylabel("")
    ax.set_title("When do people charge? Sessions by weekday and hour")
    ax.grid(False)
    save(fig, "01_hourly_weekday_heatmap.png", "Peaks at 09-11 h and 18-21 h on weekdays; weekends shift to midday; night-charger bump after 22 h. Synthetic data.")


def ch_monthly(d):
    s = d["sess"]
    m = s.groupby(s.started_at.dt.to_period("M")).agg(sessions=("id", "size"), revenue=("amount", "sum")).iloc[:-1]
    fig, axs = plt.subplots(1, 2, figsize=(12, 4))
    x = [str(p) for p in m.index]
    axs[0].bar(x, m.sessions, color=C["blue"], width=.7)
    axs[0].set_title("Completed sessions per month")
    axs[0].tick_params(axis="x", rotation=60)
    for i, v in enumerate(m.sessions):
        if i in (0, len(m) - 1):
            axs[0].text(i, v + 8, f"{v:,}", ha="center", fontsize=8, color=INK)
    axs[1].bar(x, m.revenue / 1e5, color=C["aqua"], width=.7)
    axs[1].set_title("Revenue per month (Rs lakh)")
    axs[1].tick_params(axis="x", rotation=60)
    fig.suptitle("")
    save(fig, "02_monthly_sessions_revenue.png", "Steady growth (~2.5 %/month) with a monsoon dip in June; Oct-2026 partial month excluded.")


def ch_forecast(conn):
    nf = query("SELECT forecast_date d, predicted_sessions p, lower_bound lo, upper_bound hi FROM network_forecast WHERE zone='ALL' ORDER BY d", conn=conn)
    nf["d"] = pd.to_datetime(nf.d)
    hist = pd.read_csv(REPORTS / "daily_sessions_by_zone.csv", parse_dates=["date"]).set_index("date")["ALL"]
    fig, ax = plt.subplots(figsize=(12, 4.2))
    h = hist.iloc[-120:]
    ax.plot(h.index, h.values, color=C["blue"], lw=1.2, label="actual daily sessions")
    ax.plot(h.index, h.rolling(7).mean(), color=INK2, lw=2, label="7-day average")
    ax.fill_between(nf.d, nf.lo.astype(float), nf.hi.astype(float), color=C["orange"], alpha=.22, label="95 % interval")
    ax.plot(nf.d, nf.p.astype(float), color=C["orange"], lw=2, label="Holt-Winters forecast (42 d)")
    ax.axvline(pd.Timestamp("2026-10-03"), color=INK2, ls="--", lw=1)
    ax.set_title("Network demand forecast: daily sessions (damped-trend Holt-Winters, weekly seasonality)")
    ax.legend(loc="upper left", ncol=2)
    save(fig, "03_forecast_network.png")
    ev = pd.read_csv(REPORTS / "forecast_eval.csv")
    ev = ev[ev.zone == "ALL"]
    fig, axs = plt.subplots(1, 3, figsize=(12, 3.4))
    for ax, m in zip(axs, ("MAE", "RMSE", "MAPE_pct")):
        ax.bar(range(len(ev)), ev[m], color=[C["orange"], C["blue"], C["aqua"]], width=.6)
        ax.set_xticks(range(len(ev)))
        ax.set_xticklabels(["Holt-\nWinters", "Seasonal\nnaive", "7-day\nMA"], fontsize=8)
        ax.set_title(m.replace("_pct", " %"))
        for i, v in enumerate(ev[m]):
            ax.text(i, v, f"{v:.1f}", ha="center", va="bottom", fontsize=8)
    save(fig, "04_forecast_backtest.png", "28-day hold-out backtest, zone ALL (lower is better).")


def ch_kde(d):
    s = d["sess"]
    fig, ax = plt.subplots(figsize=(10, 4.2))
    cols = dict(CCS2=C["blue"], TYPE2=C["orange"], CHADEMO=C["aqua"], LECCS=C["magenta"], BHARAT_DC=C["violet"])
    for k, g in s.groupby("connector"):
        if len(g) > 30:
            sns.kdeplot(g.energy_kwh, ax=ax, color=cols[k], label=f"{k} (n={len(g):,})", lw=2, clip=(0, None), bw_adjust=.8)
    ax.set_xlabel("energy delivered per session (kWh)")
    ax.set_title("Energy per session by connector type (KDE)")
    ax.legend()
    save(fig, "05_energy_kde_by_connector.png", "Light-EV (LECCS) sessions are small; AC Type 2 sessions are long and large; DC sessions cluster at the 80 % SoC cut-off.")


def ch_box(d):
    s = d["sess"]
    fig, ax = plt.subplots(figsize=(9, 4.4))
    order = ["TWO_WHEELER", "THREE_WHEELER", "CAR", "LCV"]
    sns.boxplot(data=s, x="category", y="duration_min", order=order, ax=ax, palette=[C["magenta"], C["violet"], C["blue"], C["yellow"]], linewidth=1.2,
                flierprops=dict(marker=".", markersize=2, markerfacecolor=INK2, markeredgecolor=INK2), medianprops=dict(color=INK, lw=2))
    ax.set_xlabel("")
    ax.set_ylabel("session duration (min)")
    ax.set_title("Charging duration by vehicle category")
    save(fig, "06_duration_box_by_category.png")


def ch_corr(d):
    s = d["sess"].merge(d["weather"][["weather_date", "rainfall_mm", "avg_temp_c"]], left_on="date", right_on="weather_date", how="left")
    cols = ["energy_kwh", "duration_min", "amount", "tariff", "soc_start", "soc_end", "avg_kw", "hour", "lead_h", "rainfall_mm", "co2_avoided_kg"]
    cm = s[cols].corr()
    fig, ax = plt.subplots(figsize=(8.5, 6.5))
    sns.heatmap(cm, annot=True, fmt=".2f", cmap=sns.diverging_palette(25, 255, s=80, l=45, center="dark", as_cmap=True), center=0, vmin=-1, vmax=1, ax=ax,
                annot_kws={"size": 7.5}, linewidths=.5, linecolor=BG, cbar_kws={"label": "Pearson r"})
    ax.set_title("Correlation matrix of session features")
    ax.grid(False)
    save(fig, "07_correlation_heatmap.png")


def ch_rain(d):
    s = d["sess"]
    daily = s[s.started_at < "2026-10-03"].groupby("date").size().rename("sessions").to_frame()
    daily = daily.join(d["weather"].set_index("weather_date")[["rainfall_mm", "condition_label"]], how="left")
    daily["trend"] = daily.sessions.rolling(29, center=True, min_periods=10).mean()
    daily["wkend"] = (daily.index.dayofweek >= 5).astype(int)
    daily["holiday"] = daily.index.isin(d["hol"].holiday_date).astype(int)
    daily["index"] = daily.sessions / daily.trend
    daily["heavy"] = (daily.rainfall_mm > 20).astype(int)
    X = sm.add_constant(daily[["rainfall_mm", "wkend", "holiday"]])
    fit = sm.OLS(daily["index"], X, missing="drop").fit()
    fig, axs = plt.subplots(1, 2, figsize=(12, 4.3), gridspec_kw={"width_ratios": [1.3, 1]})
    ax = axs[0]
    col = daily.condition_label.map({"CLEAR": C["yellow"], "CLOUDY": INK2, "RAIN": C["blue"], "HEAVY_RAIN": C["red"]})
    ax.scatter(daily.rainfall_mm, daily["index"], c=col, s=14, alpha=.8, linewidths=0)
    xs = np.linspace(0, daily.rainfall_mm.max(), 50)
    ax.plot(xs, fit.params["const"] + fit.params["rainfall_mm"] * xs + fit.params["wkend"] * daily.wkend.mean(), color=INK, lw=2)
    ax.set_xlabel("rainfall (mm/day)")
    ax.set_ylabel("sessions / 29-day trend (demand index)")
    ax.set_title(f"Rain vs demand: slope {fit.params['rainfall_mm']:.4f} per mm (p={fit.pvalues['rainfall_mm']:.3g})")
    handles = [plt.Line2D([], [], marker="o", ls="", color=v, label=k.replace("_", " ").title()) for k, v in
               dict(CLEAR=C["yellow"], CLOUDY=INK2, RAIN=C["blue"], HEAVY_RAIN=C["red"]).items()]
    ax.legend(handles=handles, fontsize=8, loc="upper right")
    g = daily.groupby(["condition_label"])["index"].mean().reindex(["CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN"])
    axs[1].bar(range(4), g.values, color=[C["yellow"], INK2, C["blue"], C["red"]], width=.6)
    axs[1].set_xticks(range(4))
    axs[1].set_xticklabels(["Clear", "Cloudy", "Rain", "Heavy\nrain"])
    axs[1].axhline(1, color=INK2, lw=1, ls="--")
    axs[1].set_ylim(.7, 1.1)
    axs[1].set_title("Demand index by weather")
    for i, v in enumerate(g.values):
        axs[1].text(i, v + .005, f"{v:.2f}", ha="center", fontsize=9)
    save(fig, "08_rain_vs_sessions.png", "Demand index removes the growth trend (sessions / 29-day centred mean); OLS on rainfall, weekend and holiday flags.")
    return fit


def ch_segments(conn):
    sg = query("SELECT * FROM user_segments", conn=conn)
    for c in ("avg_energy_kwh", "total_spend"):
        sg[c] = sg[c].astype(float)
    fig, ax = plt.subplots(figsize=(10, 5))
    for i, (k, g) in enumerate(sg.groupby("segment_label")):
        ax.scatter(g.sessions_12m + np.random.default_rng(1).uniform(-.3, .3, len(g)), g.avg_energy_kwh, s=22 + g.total_spend / 400, color=CAT[i % 7], alpha=.75,
                   label=f"{k} ({len(g)})", linewidths=.4, edgecolors=BG)
    ax.set_xscale("symlog", linthresh=10)
    ax.set_xlabel("sessions in last 12 months (symlog)")
    ax.set_ylabel("average energy per session (kWh)")
    ax.set_title("K-Means user segments (bubble size = total spend)")
    ax.legend(loc="upper right", fontsize=8)
    save(fig, "09_segment_scatter.png")
    sc = query("SELECT sc.*, s.zone, s.tier FROM station_clusters sc JOIN stations s ON s.id=sc.station_id", conn=conn)
    for c in ("avg_daily_sessions", "peak_crowding", "revenue_12m"):
        sc[c] = sc[c].astype(float)
    fig, ax = plt.subplots(figsize=(9, 5))
    for i, (k, g) in enumerate(sc.groupby("cluster_label")):
        ax.scatter(g.avg_daily_sessions, g.revenue_12m / 1e5, s=90, color=CAT[i], label=f"{k} ({len(g)})", edgecolors=BG, linewidths=1)
        for r in g.itertuples():
            if r.avg_daily_sessions > 1.5 or r.revenue_12m > 2.5e5:
                ax.annotate(r.zone, (r.avg_daily_sessions, r.revenue_12m / 1e5), fontsize=8, xytext=(5, 4), textcoords="offset points", color=INK)
    ax.set_xlabel("average sessions per day")
    ax.set_ylabel("12-month revenue (Rs lakh)")
    ax.set_title("K-Means station clusters")
    ax.legend()
    save(fig, "10_station_clusters.png")


def ch_funnel(conn):
    f = query("SELECT event_type, COUNT(DISTINCT session_key) n FROM funnel_events GROUP BY event_type", conn=conn).set_index("event_type").n
    order = ["SEARCH", "VIEW_STATION", "SELECT_SLOT", "BOOK", "CHECK_IN", "COMPLETE"]
    v = [int(f[k]) for k in order]
    fig, ax = plt.subplots(figsize=(9.5, 4.4))
    ax.barh(range(6)[::-1], v, color=C["blue"], height=.62)
    for i, (k, n) in enumerate(zip(order, v)):
        y = 5 - i
        pct = f"{100 * n / v[0]:.0f}% of searches" + (f"  |  step conv. {100 * n / v[i - 1]:.0f}%" if i else "")
        ax.text(n + v[0] * .01, y, f"{n:,}   {pct}", va="center", fontsize=9, color=INK)
    ax.set_yticks(range(6)[::-1])
    ax.set_yticklabels([k.replace("_", " ").title() for k in order])
    ax.set_xlim(0, v[0] * 1.55)
    ax.set_title("Booking funnel (distinct sessions reaching each stage)")
    ax.grid(False)
    save(fig, "11_funnel.png")


def ch_util(conn):
    u = query("""SELECT station_name, zone, tier, num_points, sessions, utilization_pct FROM v_station_performance""", conn=conn)
    u["utilization_pct"] = u.utilization_pct.astype(float)
    u = u.sort_values("utilization_pct")
    fig, ax = plt.subplots(figsize=(9.5, 8))
    ax.barh(u.station_name.str.replace(" Hub", "").str.slice(0, 38), u.utilization_pct, color=np.where(u.tier == "HUB", C["blue"], C["aqua"]), height=.7)
    for i, v in enumerate(u.utilization_pct):
        ax.text(v + .03, i, f"{v:.1f}%", va="center", fontsize=7.5)
    ax.set_xlabel("utilisation % (charging minutes / point-minutes in a year)")
    ax.set_title("Station utilisation (blue = hub, green = standard)")
    ax.tick_params(axis="y", labelsize=7.5)
    save(fig, "12_station_utilisation.png", "Whole-year utilisation of 100+ points is low by nature (public EV charging in India runs at single digits); hub peaks are far higher - see chart 17.")


def ch_sentiment(conn):
    r = query("SELECT rating, sentiment_label l, sentiment_score s FROM reviews", conn=conn)
    r["s"] = r.s.astype(float)
    fig, axs = plt.subplots(1, 2, figsize=(12, 4))
    ct = pd.crosstab(r.rating, r.l).reindex(columns=["NEGATIVE", "NEUTRAL", "POSITIVE"])
    bottom = np.zeros(len(ct))
    for lab, col in zip(ct.columns, [C["red"], INK2, C["aqua"]]):
        axs[0].bar(ct.index, ct[lab], bottom=bottom, color=col, label=lab.title(), width=.65, edgecolor=BG)
        bottom += ct[lab].values
    axs[0].set_xlabel("star rating")
    axs[0].set_ylabel("reviews")
    axs[0].set_title("Review sentiment by star rating")
    axs[0].legend()
    sns.histplot(r.s, bins=40, color=C["blue"], ax=axs[1], edgecolor=BG)
    axs[1].axvline(.14, color=C["aqua"], ls="--"); axs[1].axvline(-.08, color=C["red"], ls="--")
    axs[1].set_xlabel("TextBlob polarity")
    axs[1].set_title("Polarity distribution (thresholds dashed)")
    pc = (r.l.value_counts(normalize=True) * 100).round(1).to_dict()
    save(fig, "13_sentiment_distribution.png", f"Label split: {pc}")


def ch_lead(d):
    s = d["sess"][d["sess"].source != "WALK_IN"]
    fig, ax = plt.subplots(figsize=(10, 4.2))
    sns.histplot(s.lead_h.clip(upper=72), bins=72, color=C["blue"], ax=ax, edgecolor=BG)
    ax.set_xlabel("booking lead time (hours, clipped at 72)")
    ax.set_title("Lead time between booking and slot start (app bookings)")
    save(fig, "14_lead_time_hist.png", "Most bookings are made 1-24 h ahead; the 2-20 h cluster includes REMINDER-sourced bookings; fleet plans 12-30 h ahead.")


def ch_zone(d):
    s = d["sess"]
    z = s.groupby(["zone", "tier"]).amount.sum().reset_index().sort_values("amount")
    fig, ax = plt.subplots(figsize=(9.5, 6))
    ax.barh(z.zone, z.amount / 1e5, color=np.where(z.tier == "HUB", C["blue"], C["aqua"]), height=.68)
    for i, v in enumerate(z.amount / 1e5):
        ax.text(v + .02, i, f"Rs {v:.2f} L", va="center", fontsize=8)
    ax.set_xlabel("revenue Oct 2025 - Sep 2026 (Rs lakh)")
    ax.set_title("Revenue by zone")
    save(fig, "15_revenue_by_zone.png")


def ch_cohort(conn):
    u = query("SELECT id, DATE_FORMAT(created_at,'%Y-%m') cohort FROM users WHERE role='USER'", conn=conn)
    b = query("SELECT user_id, DATE_FORMAT(start_time,'%Y-%m') m FROM bookings WHERE status='COMPLETED' GROUP BY user_id, m", conn=conn)
    df = b.merge(u, left_on="user_id", right_on="id")
    df["age"] = (pd.PeriodIndex(df.m, freq="M") - pd.PeriodIndex(df.cohort, freq="M")).map(lambda x: x.n)
    coh = df[df.age >= 0].groupby(["cohort", "age"]).user_id.nunique().unstack(fill_value=0)
    size = u.groupby("cohort").size().reindex(coh.index)
    ret = coh.div(size, axis=0) * 100
    ret = ret[ret.index >= "2025-07"]
    ret = ret.loc[:, :12]
    mask = np.triu(np.ones_like(ret, dtype=bool), 0)[:, ::-1] if False else None
    fig, ax = plt.subplots(figsize=(11, 5.5))
    sns.heatmap(ret, annot=True, fmt=".0f", cmap=SEQ, ax=ax, cbar_kws={"label": "% of cohort with >=1 completed session"}, annot_kws={"size": 7}, linewidths=.5, linecolor=BG)
    ax.set_xlabel("months since signup")
    ax.set_ylabel("signup month")
    ax.set_title("Cohort activity (users charging in month N after signup)")
    ax.grid(False)
    save(fig, "16_cohort_retention.png", "Cohorts are sized differently; months with no calendar data yet are blank.")


def ch_crowding(conn):
    df = query("""SELECT s.zone, s.tier, d.day_of_week, d.hour_of_day, d.crowding_index c FROM demand_forecast d JOIN stations s ON s.id=d.station_id WHERE s.tier='HUB'""", conn=conn)
    df["c"] = df.c.astype(float)
    fig, axs = plt.subplots(1, 2, figsize=(14, 4.6), sharey=True)
    for ax, (nm, days) in zip(axs, (("Weekday (Mon-Fri)", range(1, 6)), ("Weekend (Sat-Sun)", (6, 7)))):
        pv = df[df.day_of_week.isin(days)].pivot_table(index="zone", columns="hour_of_day", values="c", aggfunc="mean")
        sns.heatmap(pv, cmap=SEQ, vmin=0, vmax=100, ax=ax, linewidths=.4, linecolor=BG, cbar=(ax is axs[1]), cbar_kws={"label": "crowding index (0-100)"})
        ax.set_title(f"Hub crowding forecast - {nm}")
        ax.set_xlabel("hour of day")
        ax.set_ylabel("")
        ax.grid(False)
    save(fig, "17_hub_crowding_heatmap.png", "Index = percentile of expected sessions per point; >=65 is HIGH.")
    zt = {"OFFICE": ["BKC", "Powai", "Andheri East", "Lower Parel", "Worli"], "RESIDENTIAL": ["Thane West", "Borivali", "Malad", "Goregaon", "Ghatkopar", "Mulund", "Chembur", "Kharghar", "Nerul", "Dombivli", "Kalyan"],
          "TRANSIT": ["Dadar", "Vashi", "Panvel", "Airport"]}
    dd = query("""SELECT s.zone, d.day_of_week dow, d.hour_of_day h, SUM(d.expected_sessions) e FROM demand_forecast d JOIN stations s ON s.id=d.station_id GROUP BY s.zone, d.day_of_week, d.hour_of_day""", conn=conn)
    dd["e"] = dd.e.astype(float)
    dd["type"] = dd.zone.map({z: k for k, v in zt.items() for z in v})
    fig, axs = plt.subplots(1, 3, figsize=(14, 3.8), sharey=False)
    for ax, (k, col) in zip(axs, zip(zt, [C["blue"], C["orange"], C["aqua"]])):
        for lab, days, ls in (("weekday", range(1, 6), "-"), ("weekend", (6, 7), "--")):
            g = dd[(dd.type == k) & dd.dow.isin(days)].groupby("h").e.sum() / len(list(days))
            ax.plot(g.index, g.values, color=col, ls=ls, lw=2, label=lab)
        ax.set_title(f"{k.title()} zones")
        ax.set_xlabel("hour of day")
        ax.legend()
    axs[0].set_ylabel("expected sessions / hour")
    save(fig, "18_zone_type_hour_profiles.png", "Office zones peak 09-11/13-15/18-20 and drop on weekends; residential zones peak in the evening and gain on weekends; transit peaks early morning and late night.")


def ch_pair(d):
    s = d["sess"].sample(900, random_state=42)[["energy_kwh", "duration_min", "amount", "soc_start", "avg_kw", "category"]]
    g = sns.pairplot(s, hue="category", palette={"CAR": C["blue"], "TWO_WHEELER": C["magenta"], "LCV": C["yellow"], "THREE_WHEELER": C["violet"]}, corner=True,
                     plot_kws=dict(s=10, alpha=.7, linewidth=0), diag_kind="kde", height=1.9)
    g.figure.suptitle("Pair plot of 900 sampled sessions", y=1.01, color=INK, fontweight="bold", x=.08, ha="left")
    for ax in g.axes.flatten():
        if ax is not None:
            ax.grid(False)
    g.figure.savefig(OUT / "19_pairplot_sample.png", dpi=110, bbox_inches="tight")
    plt.close(g.figure)
    SAVED.append("19_pairplot_sample.png")


def ch_effects(d, fit):
    s = d["sess"]
    daily = s[s.started_at < "2026-10-03"].groupby("date").size().rename("n").to_frame().join(d["weather"].set_index("weather_date"), how="left")
    daily["trend"] = daily.n.rolling(29, center=True, min_periods=10).mean()
    daily["idx"] = daily.n / daily.trend
    daily["wk"] = np.where(daily.index.dayofweek >= 5, "Weekend", "Weekday")
    daily["hol"] = daily.index.isin(d["hol"].holiday_date)
    daily["mons"] = daily.index.month.isin([6, 7, 8, 9])
    fig, ax = plt.subplots(figsize=(10, 4.2))
    cats = {"Weekday": daily[(daily.wk == "Weekday") & ~daily.hol].idx.mean(), "Weekend": daily[(daily.wk == "Weekend") & ~daily.hol].idx.mean(),
            "Public holiday": daily[daily.hol].idx.mean(), "Heavy rain (>20 mm)": daily[daily.rainfall_mm > 20].idx.mean(), "Monsoon months": daily[daily.mons].idx.mean()}
    ax.bar(list(cats), list(cats.values()), color=[C["blue"], C["aqua"], C["yellow"], C["red"], C["violet"]], width=.6)
    ax.axhline(1, color=INK2, ls="--", lw=1)
    for i, v in enumerate(cats.values()):
        ax.text(i, v + .01, f"{v:.2f}", ha="center", fontsize=9)
    ax.set_ylim(.6, 1.2)
    ax.set_ylabel("demand index (1.0 = trend)")
    ax.set_title("Calendar and weather effects on daily sessions")
    save(fig, "20_calendar_weather_effects.png", "Index = sessions / 29-day centred mean.")


def main(conn=None):
    own = conn is None
    conn = conn or get_conn()
    d = load(conn)
    ch_heatmap(d); ch_monthly(d); ch_forecast(conn); ch_kde(d); ch_box(d); ch_corr(d)
    fit = ch_rain(d)
    ch_segments(conn); ch_funnel(conn); ch_util(conn); ch_sentiment(conn); ch_lead(d); ch_zone(d); ch_cohort(conn); ch_crowding(conn); ch_pair(d)
    ch_effects(d, fit)
    if own:
        conn.close()
    print(f"{len(SAVED)} charts saved to {OUT}")
    return SAVED


if __name__ == "__main__":
    main()
