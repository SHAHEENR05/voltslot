# Analytics fixtures

Real output of `AnalyticsService` over the live MySQL `chargeiq` data (demo clock 2026-10-03 09:30), serialised like Jackson
(camelCase, ISO dates, nulls kept). Default filters = last 90 days up to 2026-10-03 unless the query says otherwise.

| file | endpoint + query string |
|---|---|
| `overview.json` | `/api/analytics/overview` |
| `trend__day.json` | `/api/analytics/trend?granularity=DAY&from=2025-10-01&to=2026-10-03` |
| `trend__week.json` | `/api/analytics/trend?granularity=WEEK&from=2025-10-01&to=2026-10-03` |
| `trend__month.json` | `/api/analytics/trend?granularity=MONTH&from=2025-10-01&to=2026-10-03` |
| `trend.json` | `/api/analytics/trend?granularity=DAY (default 90-day window)` |
| `heatmap__sessions.json` | `/api/analytics/heatmap?metric=sessions` |
| `heatmap__revenue.json` | `/api/analytics/heatmap?metric=revenue` |
| `zones.json` | `/api/analytics/zones` |
| `mix__connector.json` | `/api/analytics/mix?by=connector` |
| `mix__vehicleCategory.json` | `/api/analytics/mix?by=vehicleCategory` |
| `mix__payment.json` | `/api/analytics/mix?by=payment` |
| `mix__source.json` | `/api/analytics/mix?by=source` |
| `mix__tier.json` | `/api/analytics/mix?by=tier` |
| `mix__dayPart.json` | `/api/analytics/mix?by=dayPart` |
| `funnel.json` | `/api/analytics/funnel` |
| `segments.json` | `/api/analytics/segments` |
| `stations.json` | `/api/analytics/stations?sort=sessions&limit=10` |
| `stations__revenue.json` | `/api/analytics/stations?sort=revenue&limit=25` |
| `stations__utilization_asc.json` | `/api/analytics/stations?sort=utilization&order=asc&limit=10` |
| `sentiment.json` | `/api/analytics/sentiment` |
| `weather-impact.json` | `/api/analytics/weather-impact` |
| `cohorts.json` | `/api/analytics/cohorts?from=2025-10-01` |
| `lead-time.json` | `/api/analytics/lead-time` |
| `insights.json` | `/api/analytics/insights` |
| `overview__operator1.json` | `/api/analytics/overview (logged in as OPERATOR of operator 1)` |
| `overview__hub_zone_powai.json` | `/api/analytics/overview?zone=Powai&tier=HUB` |

Also: `admin_stats.json` (table row counts, `AdminStatsDto`-like), see below.
| `admin_stats.json` | `GET /api/admin/stats` (row counts per table, `AdminStatsDto`-like; produced by `../../scripts/dump_fixtures.py`) |

Regenerate: analytics files come from the Java harness (not in repo); the rest via `python3 frontend/mock/scripts/dump_fixtures.py`.
