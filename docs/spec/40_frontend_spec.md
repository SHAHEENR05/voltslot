# Frontend specification – VoltSlot web app (React + Vite, dark theme)

Goal: a polished, mostly-dark, "product quality" web app comparable to PlugShare / Tata Power EZ Charge / Statiq / Ather Grid for EV charging, with the analytics
section clearly better than https://food-analytics.onrender.com/ (rich, interactive, colourful on dark). It is served by Spring Boot from `backend/src/main/resources/static`
(Vite `build.outDir` → `../backend/src/main/resources/static`, `emptyOutDir: true`, `base: '/'`) so all API calls use **relative URLs `/api/...`**; in dev Vite proxies `/api` → `http://localhost:8080`.
Language: plain JavaScript + JSX (no TypeScript). React 18, react-router-dom 6 (BrowserRouter; Spring forwards unknown routes to index.html), **recharts**, **leaflet + react-leaflet 4**
(tiles `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`, attribution OSM+CARTO), **qrcode.react** (check-in QR), **lucide-react** icons, **date-fns**. No UI kit, no Tailwind: hand-written CSS with
CSS variables (one `theme.css` + component css modules or a single `app.css`). The app must still look good when map tiles cannot load (dark background).

## Design language (dark)
Tokens (CSS variables on :root): bg `#070b12`, surface `#0e1522`, surface-2 `#141d2e`, surface-3 `#1b2740`, border `rgba(255,255,255,.07)`, text `#e8eefc`, muted `#8b9bb8`,
primary (electric cyan) `#22d3ee`, primary-2 `#38bdf8`, accent green (available/eco) `#34d399`, amber (medium/peak) `#fbbf24`, red (busy/error) `#f87171`, violet `#a78bfa`, pink `#f472b6`.
Gradient hero `linear-gradient(135deg,#22d3ee22,#a78bfa22)`; glass cards (`backdrop-filter: blur(12px)`, 1px border, 16px radius, soft shadow, subtle glow on hover); font stack `Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`
(do NOT load external fonts); numbers use `font-variant-numeric: tabular-nums`. Rounded pills for chips/tags, smooth 150–200 ms transitions, skeleton loaders (shimmer), toast notifications, empty states with icons,
focus rings, responsive (works from 360 px phones to 1920 px; sidebar collapses to bottom tab bar on mobile). Crowding colours: LOW green, MEDIUM amber, HIGH red. Slot grid colours: FREE green-tint, BOOKED red-tint, PAST grey, UNAVAILABLE hatched.
Currency helper `inr(n)` → Indian grouping (`₹1,25,000.50`, use `toLocaleString('en-IN')`); dates via date-fns, 24-h times; kWh with 1 decimal; distances 1 decimal km.
Every page has loading + error + empty states. Buttons have disabled/loading states. Forms validate client-side AND display server `fieldErrors` (error body: `{timestamp,status,error,message,path,fieldErrors:[{field,message}]?, alternatives?}`).

## App shell
Left sidebar (collapsible) with logo "⚡ VoltSlot" gradient wordmark; top bar with: global search, **app clock chip** (shows "Sat 3 Oct 2026 · 09:30" from `GET /api/clock`, polls every 30 s – tooltip explains demo time machine),
notification bell with unread badge + dropdown (latest 8, mark all read), wallet balance chip (₹), user menu (profile, change password, logout). Nav items depend on role:
USER: Find chargers (home `/`), Trip planner `/trip`, My bookings `/bookings`, Garage `/garage`, Smart reminders `/reminders`, Wallet `/wallet`, Notifications `/notifications`, Profile `/profile`.
OPERATOR: Operator console `/operator`, Insights `/insights`, plus Find chargers. ADMIN: Admin console `/admin`, Insights `/insights`, Operator console, Fleet console, plus user pages. FLEET_MANAGER: Fleet console `/fleet`, Garage (fleet vehicles), plus Find chargers/Trip.
Guests may use `/` (locator + recommendations), `/station/:id`, `/trip`, `/login`, `/register`; booking asks them to sign in (redirect back after login).
Login page: split layout – left animated gradient/map-grid hero with the tagline "Charge smarter, not harder." and 3 feature bullets (Demand-aware recommendations · Predictive recharge reminders · Live slot booking),
right form + **demo account chips** (Driver – Aarav, Driver – Rahul (overdue), Fleet manager, Operator, Admin) which fill/login with the demo credentials from 00_overview.md.
Auth state: JWT in `localStorage` key `chargeiq.token` (+ user in context); axios/fetch wrapper adds `Authorization: Bearer`; on 401 → clear + redirect to /login.

## The headline interactions (must feel great)
1. **Locator + Smart recommendation (home `/`)**: split view – left panel (filters + results), right Leaflet dark map (markers coloured by crowding level, number badges for ranked picks, popup card, "my location" blue dot using
   browser geolocation with fallback to Thane West 19.2183, 72.9781 or user's home). Left panel has two tabs: **"Smart pick"** (default) and **"Browse all"**. Smart pick: vehicle selector (user's vehicles; guests choose a connector chips),
   SoC range slider (start→target), arrival time picker ("Now" / pick), preset segmented control (Balanced / Fastest / Cheapest / Least crowded) + an "Advanced weights" popover with 6 sliders; results are cards showing rank, score ring (0–100), station + zone,
   key facts (distance/ETA, free slot time with wait, charge duration, cost, crowding pill), tag chips (Best overall, Fastest, Cheapest, Quietest, Nearest), reasons list (✓ lines) and an expandable **"Why this score?"** stacked horizontal bar of the six weighted components
   (animated), plus a **savings banner** vs the nearest station ("Saves 18 min and ₹42 compared with the nearest charger"). Clicking a card flies the map to it and opens the station panel; "Book this slot" opens the booking drawer prefilled.
   Browse all: filters (search box, connector chips, min kW, amenity, zone, open now, sort) + station cards (rating, reliability, connector badges, free points now, crowding now).
2. **Station detail `/station/:id`**: hero (name, address, tier badge HUB, open hours, rating stars, reliability gauge, sentiment bar), connector/point table, amenities chips, **availability heat-grid** (rows = charging points, columns = 30-min slots, click a free cell(s) to select start; vehicle selector sets compatibility),
   24-hour **crowding forecast bar chart** (recharts) for the chosen date highlighting quiet hours + "Quietest in next 24 h" chips, reviews list with sentiment chip + write review form (only if eligible – show server error), "Join waitlist" button when the chosen slot is booked.
3. **Booking drawer / stepper**: choose vehicle, point (auto-assign option), start, SoC start/target sliders → live estimate (`POST /api/bookings/estimate`: energy, duration, cost with peak/off-peak band chip, CO₂ avoided, km added) → "Hold slot" (`POST /api/bookings`) → **5-minute hold countdown ring** → payment method (Wallet with balance / UPI / Card, mock) → confirm → success screen with animated check, booking code, QR, "Add to calendar" (.ics download generated client-side), and "View booking".
   On 409 show the **alternatives panel** (same-station other slots chips + other stations cards) with one-click rebook; 402 → "Top up wallet" inline action.
4. **Smart recharge reminder (BigBasket-style) – the teacher-requested feature.** After login (and whenever `/api/reminders/active` returns items, re-checked on route change and every 60 s) show a **full-screen-ish modal popup** (animated battery icon with pulsing glow):
   "Time to recharge your Tata Nexon EV ⚡ – You usually charge every ~6 days; your last charge was 5 days ago." with the suggested slot card (station, zone, time, crowding pill, ₹ estimate, distance), buttons **[Book this slot]** (calls `/api/reminders/{id}/book` → opens payment step of booking drawer),
   **[Remind me in 3 h]** / **[Tomorrow]** (snooze), **[Not now]** (dismiss) – plus a small "Why am I seeing this?" disclosure (median interval, confidence %, sessions used). Don't spam: remember per session (sessionStorage) that a snoozed/closed reminder was handled. Same data on `/reminders` page:
   per-vehicle **prediction cards** (state chip UPCOMING / DUE_SOON / OVERDUE / NO_DATA, countdown ring "due in 14 h", cadence history sparkline from `cadenceHistory`, preferred hour/station, avg kWh, confidence meter), settings (enable reminders toggle, lead hours slider via `PUT /api/users/me`), and a **Demo trigger** button (`POST /api/reminders/demo-trigger`) shown because demo mode is on.
5. **My bookings `/bookings`**: tabs Upcoming / Active / Past / Waitlist; booking cards with status chips, countdown, QR modal, Check in, Cancel (shows `refundIfCancelled` first), Simulate "Complete charge" (demo, `POST /complete`), invoice view/print, "Rate this station" after completion.
6. **Trip planner `/trip`**: origin/destination from dropdown of zones + free lat/lon + "swap", vehicle & start SoC slider, shows the map polyline with charging stops (numbered markers), a vertical timeline of legs (Drive 52 km · 58 min → Charge at … 20→80 % · ₹… → Drive …), summary chips (distance, time, stops, arrival SoC), notes.
7. **Garage `/garage`**: vehicle cards (model image-less – use a gradient with category icon, battery/range/connector chips), add/edit/delete modal (vehicle-model dropdown from `/api/reference/vehicle-models`), per-vehicle prediction mini card.
8. **Wallet `/wallet`**: balance card, top-up (quick chips ₹500/1,000/2,000/5,000 + custom, method), transactions table paginated with +/- colours.
9. **Fleet console `/fleet`**: KPI cards, vehicle table with prediction state + upcoming booking, **Smart scheduler** (select vehicles, window, preset, max per station → "Generate plan" → timeline/gantt-like table of the plan + unassigned list + totals → "Apply plan" books & pays from wallet).
10. **Operator console `/operator`**: dashboard KPI cards + live station cards, stations table with CRUD modal (map pin picker), points CRUD with status toggle, day schedule (gantt rows per point) with date picker, walk-in log form.
11. **Admin console `/admin`**: stats tiles, user table (search, role/status change modals), **Time machine card** (current app time, buttons +1 h, +6 h, +1 day, +3 days, Reset, "Run reminders now"), **Data warehouse card** ("Refresh warehouse" with row counts), links to Swagger UI `/swagger-ui.html`.
12. **Insights `/insights`** (PS-IV analytics; ADMIN/OPERATOR) – see below.

## Insights (analytics) page – must look spectacular
Sticky filter bar: date range (presets 30D / 90D / 6M / 1Y / All + custom), zone, connector, tier, (operator for admin), "Export CSV" button (`/api/analytics/export/sessions.csv` with the auth header → blob download).
Sections (responsive grid of glass cards, each with title + subtitle + info tooltip; all charts recharts or small custom SVG; animated count-up KPIs):
1. Hero KPI strip (8 cards with sparkline + delta% arrow vs previous period): sessions, energy (MWh/kWh), revenue (₹), utilisation %, unique users, cancellation %, no-show %, CO₂ avoided (t).
2. **Demand trend** composed chart (area sessions + line revenue on 2nd axis, DAY/WEEK/MONTH toggle), **14-day forecast** with confidence band (dashed), **anomaly markers** (red dots with tooltip reason).
3. **Hour × weekday heatmap** (custom SVG/CSS grid, sessions|revenue toggle, colour scale cyan→violet→pink, tooltips).
4. **Zone performance**: Leaflet dark map with circle markers sized by sessions & coloured by growth + ranked horizontal bar list (revenue, share, utilisation, growth chip).
5. **Booking funnel** (6 stages, trapezoid/funnel look with step conversion & drop-off %), **Lead-time** distribution bar.
6. **Mix**: 4 donut/radial charts (connector, vehicle category, payment, source) with a segmented selector for dayPart/tier.
7. **Customer segments** (K-Means): bubble/scatter or radial bars + table (users, share, revenue/user, night %, weekend %), segment legend with persona names.
8. **Station leaderboard** table (sortable, sparkline-free; utilisation bars, rating stars, reliability dots, cluster badge, recommendation text).
9. **Sentiment**: donut of labels, keyword cloud (positive green / negative red, sized by freq – custom flex cloud), best/worst stations, monthly sentiment line.
10. **Weather & holiday impact**: bar chart of avg sessions by condition + adjusted impact cards (rain −x %, heavy rain, holiday, weekend).
11. **Cohort retention** heatmap table (cohort rows × month offset, green intensity).
12. **AI-style insight cards** from `/api/analytics/insights` (category icon, sentence) as a scrolling ribbon/grid.
All data comes from `/api/analytics/*` (shapes are in `backend/src/main/java/com/chargeiq/dto/AnalyticsDtos.java`).

## API usage notes (shapes: backend/src/main/java/com/chargeiq/dto/*.java – records are serialised with camelCase component names; `RecommendationDtos.WeightsDto.waiting` is serialised as `wait`)
* Pagination envelope `{content,page,size,totalElements,totalPages}`. Errors as above. LocalDateTime strings are ISO without zone (`2026-10-03T19:30:00`) – treat as IST wall-clock and never convert time zones.
* Public endpoints: stations, availability, forecast, recommendations, trips/plan, reference, clock. Everything else needs the token.
* `GET /api/notifications/unread-count` → `{"count":n}`, `POST /api/notifications/read-all` → `{"updated":n}`, `POST /api/reminders/refresh` → `{"active":n}`, snooze/dismiss/demo-trigger → `{"message":"..."}`.
* The in-app clock is the source of "now" for every date calculation in the UI (never `new Date()` for booking logic); keep it in a React context refreshed from `/api/clock`.

## Mock backend for development/testing in the sandbox (the real backend cannot run here)
`frontend/mock/server.js` – dependency-free Node http server on port 8080 that emulates the API with realistic fixture data (JSON files in `frontend/mock/fixtures/`, handlers in `frontend/mock/routes/*.js`),
including auth (the 7 demo accounts + fake JWT), stations (generated from `frontend/mock/fixtures/stations.json`, built from the real MySQL data), availability, recommendations (simple deterministic ranking producing the full response shape with breakdown/reasons/savings),
estimate/bookings lifecycle (in-memory), wallet, notifications, reminders (the demo user gets an ACTIVE reminder), vehicles, trips, fleet, operator, admin, analytics (fixtures dumped from the real DB). It must also serve `frontend/dist`/the built static files for a full end-to-end check with Playwright screenshots
(Chromium is installed; `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; map tiles will not load in the sandbox – that is expected).
