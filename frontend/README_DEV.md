# VoltSlot frontend – developer guide

React 18 + Vite + plain JS/JSX. Hand-written CSS (no UI kit). Built into `../backend/src/main/resources/static`.

```
npm install
node mock/server.js        # mock API + built UI on http://localhost:8080  (needs `npm run build` once for the UI part)
npm run dev                # Vite on :5173, proxies /api -> :8080 (mock or real backend)
npm run build              # -> ../backend/src/main/resources/static  (emptyOutDir)
```
Demo logins (one-click chips on /login): demo@voltslot.in/User@123 (Aarav, 2 vehicles), rahul@/priya@/sneha@voltslot.in (User@123), fleet@voltslot.in/Fleet@123, operator@voltslot.in/Operator@123, admin@voltslot.in/Admin@123.

## Folder map
```
src/main.jsx            providers: Router > Toast > Auth > Clock > Reference > Booking > <App/>
src/App.jsx             ALL routes (lazy pages). Page = src/pages/<Name>.jsx with a default export
src/styles/theme.css    tokens (:root vars), reset, text/layout/margin utilities, grid helpers, keyframes
src/styles/app.css      every component class (card, btn, chip, table, modal, drawer, toast, shell, map, locator, auth…)
src/lib/                api.js format.js hooks.js auth.jsx clock.jsx toast.jsx booking.jsx reference.jsx constants.js nav.js
src/components/ui/      shared widgets (import from '../components/ui' barrel or the file)
src/components/map/     StationMap, MapPicker
src/components/layout/  Layout Sidebar Topbar MobileTabBar ProtectedRoute NotFound
src/components/locator/ Home-page pieces (SmartPanel, BrowsePanel, ResultCard, WhyBar, StationCard, ConnectorBadges, AdvancedWeights, StationQuickPanel) – reuse ConnectorBadges / StationCard elsewhere
src/components/booking/BookingDrawer.jsx   PLACEHOLDER (Booking agent owns)
src/components/reminders/ReminderPopup.jsx PLACEHOLDER (Reminders agent owns; Layout renders it for signed-in users)
src/pages/              Home, Login, Register (done) + stubs: StationDetail Bookings Garage Reminders Wallet Notifications Profile Trip Fleet Operator Admin Insights
mock/                   server.js, lib/ (state, util, estimator, availability, stations), routes/*.js, fixtures/
```
**Ownership rule:** an agent overwrites ONLY its own page files / components folder (+ its own `mock/routes/<area>.js`, plus CSS appended at the END of `app.css` under a `/* ---- <area> ---- */` banner). Do not edit shared files (lib/*, ui/*, layout/*, theme.css) except to append; if you need a change there, add a small local helper instead.

## Conventions
* **Language/style:** JSX, function components, hooks, 2-space indent, single quotes. No TypeScript, no Tailwind, no external fonts.
* **API:** always `import { api } from '../lib/api'` → `api.get(path, params)`, `api.post(path, body)`, `api.put`, `api.del`. Paths are WITHOUT the `/api` prefix (`api.get('/stations/3')`). Token (`localStorage['chargeiq.token']`) is attached automatically; a 401 on an authenticated call clears the session and redirects to /login. Pass `{auth:false}` as 3rd arg for public calls (optional).
  Errors are `ApiError`: `{status, message, fieldErrors:{field:message}, alternatives, raw}`. Show `err.message` in a toast / `ErrorState`, bind `err.fieldErrors.<field>` to `<Field error=…>`; for 409 booking conflicts use `err.alternatives`; 402 = insufficient wallet.
  Downloads: `download('/analytics/export/sessions.csv', params, 'sessions.csv')`; client files: `downloadText(text, 'x.ics', 'text/calendar')`.
* **Data loading:** `useFetch(path, {params, enabled, deps})` or `useAsync(() => promise, deps)` → `{data, loading, error, reload, setData}`. Every page must render **loading (Skeleton), error (ErrorState with onRetry) and empty (EmptyState)** states. `usePolling(fn, ms, {enabled, immediate})`.
* **Time:** NEVER `new Date()` for business logic. `const {now, iso, today, label} = useClock()` – `now` is a Date whose *local fields are the IST wall-clock*, `iso`=`2026-10-03T09:30:00`, `today`=`2026-10-03`. API LocalDateTime strings are naive IST: parse with `parseLocal(str)`, build with `toIso(date)`; never convert time zones. The clock refreshes from `/api/clock` every 30 s (`useClock().refresh()` after an admin time-machine action).
* **Money/units:** `inr(n)` (₹1,25,000.50 – Indian grouping; `inr0` no decimals), `kwh`, `kw`, `km`, `pct`, `minutesHuman(95)`→"1 h 35 min", `dateTime`, `dateTimeShort`, `day`, `time`, `relative(iso, now)`, `whenLabel(iso, now)`, `compact(n)` (L / Cr), `num(n, decimals)`.
* **Tables:** house style = first column **Sr No**, centred bold headers, numbers right-aligned, text left. `<Table>` does this automatically (`columns[{key,header,numeric,render,sortable}]`; `serial={false}` to opt out; pass `startIndex={page*size}` when paginated).
* **Auth/roles:** `const {user, isAuthed, hasRole, isAdmin, login, logout, refreshUser} = useAuth()`. Call `refreshUser()` after anything that changes wallet balance (topup, payment, refund) so the topbar chip updates. Route protection is declared in `App.jsx` (`<P roles={[…]}>`). Guests allowed: `/`, `/station/:id`, `/trip`, `/login`, `/register`.
* **Toasts:** `const toast = useToast(); toast.success('Saved'); toast.error(err);` (accepts ApiError).
* **Booking:** `const {openBooking} = useBooking(); openBooking({stationId, pointId, slotStart, vehicleId, socStart, socTarget, heldBooking})` – handles guest redirect to /login and re-opens the drawer after login. The Booking agent implements `components/booking/BookingDrawer.jsx` (props `{opts, onClose}`; stub currently prints opts). Reminder flow: `openBooking({heldBooking, step:'payment'})`.
* **Map:** Leaflet only through `components/map/*` (divIcons – never default marker PNGs). Tiles are CARTO dark; the page must still look fine when tiles fail.
* **Styling:** use tokens (`var(--primary)` …) – never hard-code palette hex in CSS; recharts colours come from the same hexes (cyan `#22d3ee`, violet `#a78bfa`, pink `#f472b6`, green `#34d399`, amber `#fbbf24`, red `#f87171`, blue `#38bdf8`; grid/axis `rgba(255,255,255,.08)` / `#8b9bb8`). Page wrapper: `<div className="page"><div className="page-head"><div><h1>…</h1><p>…</p></div><actions/></div>…</div>`. Responsive: 360 px phones → 1920 px; use `.grid.cols-N` (collapses automatically), `.grid.auto`, `.row/.col/.gap-*`, `.mt-*`.
* Pagination envelope `{content,page,size,totalElements,totalPages}` is 0-based → `<Pagination page totalPages totalElements size onChange/>`.

## How to…
**Add a page/route:** create `src/pages/Foo.jsx` (default export) → in `App.jsx` add `const Foo = lazy(()=>import('./pages/Foo.jsx'))` and `<Route path="/foo" element={<P roles={[…]}><Foo/></P>} />` → add a nav entry in `src/lib/nav.js` (`navFor`). The 12 future pages already have routes + nav entries; just overwrite the stub.
**Add a mock route:** create `mock/routes/<area>.js`:
```js
const state = require('../lib/state');
const { HttpError, reply, paginate } = require('../lib/util');
module.exports = [
  { method: 'GET', pattern: '/api/bookings/:id', handler: ({ params, query, body, user, auth }) => {
      const u = auth();                       // 401 if no token; auth('ADMIN','OPERATOR') also checks role (403)
      const b = state.bookings.find(x => x.id === +params.id && x.userId === u.id);
      if (!b) throw new HttpError(404, 'Booking not found');
      return b;                               // 200 JSON. reply(201, body) / reply(204, null) for other codes
  } },
];
```
Files in `mock/routes/` are auto-loaded alphabetically (`routes/index.js`), first matching route wins; restart `node mock/server.js` after edits. `ctx` = `{req,res,params,query,queryAll,body,user,auth,state,util}`. Errors: `throw new HttpError(409, msg, {alternatives})` / `throw fieldErrors([['rating','must be 1-5']])` → body `{timestamp,status,error,message,path,fieldErrors?,alternatives?}`.
Shared in-memory `mock/lib/state.js`: `users, vehicles, notifications, wallets, bookings, bookedSlots (Set of "pointId|slotStartIso" → shows BOOKED in availability), stations, ref, nextId(name), now()/nowMs() (app clock), advance(ms), addTxn(userId,type,amount,ref) (updates wallet balance), addNotification(userId,{...}), findStation/findPoint/findUser/model, crowding(stationId,dow,hour)`. Helpers: `lib/estimator.js` (`estimate({vehicle,point,socStart,socTarget,startMs})` – exact spec formulas, use for `/bookings/estimate`), `lib/availability.js` (`slotState`, `findEarliest`), `lib/stations.js` (`liveSummary`), `routes/recommendations.js` exports `.recommend(body)` (reuse for alternatives / trips / fleet / reminder suggestions). Time in the mock is "naive ms" (UTC fields = IST wall-clock): use `util.parseNaive/toNaive`, never `new Date()`/local TZ.
Already mocked: auth (register/login/me, `PUT /users/me`, change-password), clock (+admin advance/reset), reference, stations (list/detail/availability/forecast/reviews), recommendations, vehicles, notifications, wallet. Fixtures for analytics are in `mock/fixtures/analytics` (see its README) – serve them from an `analytics.js` route.
Mock deviations from the real backend: best point per station = earliest *finish* (not earliest start); `waitMinutes` is measured from the arrival rounded up to the 30-min grid; `breakdown.<k>.score` is 0–100 and `contribution` is in points (Σ = total score).

## Component catalogue (`components/ui`, barrel `components/ui/index.js`)
| Component | Props |
|---|---|
| `Button` | `variant` primary\|ghost\|danger\|success\|link, `size` sm\|lg, `icon`, `loading`, `block`, `iconOnly`, + button props |
| `Card` | `title, subtitle, icon, actions, hover, clickable, selected, flat, hero, pad('0'\|'lg')` |
| `Modal` | `open, title, onClose, size('sm'\|'lg'\|'xl'), footer, dismissable` (portal, Esc/backdrop closes) |
| `Drawer` | `open, title, onClose, wide, footer` (right sheet; bottom sheet on mobile) |
| `ConfirmDialog` | `open, title, message, confirmLabel, danger, loading, onConfirm, onCancel` |
| `Chip` | `active, onClick (makes it a toggle button), icon, size('sm'), onRemove` |
| `Badge` | `tone` primary\|green\|amber\|red\|violet\|pink\|hub |
| `StatusChip` | `status` (HOLD, CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED, NO_SHOW, EXPIRED) |
| `CrowdingPill` | `level` LOW\|MEDIUM\|HIGH, `index?`, `short?`, `live?` |
| `RatingStars` | `value, size, count, onChange (input mode), showValue` |
| `ScoreRing` | `value 0-100, size, stroke, label, color?, decimals, children` |
| `CountdownRing` | `value (remaining s), total (s), size, label` – parent ticks the value from the app clock |
| `Gauge` | `value, max, label, size, unit, color?` (semi-circle) |
| `Skeleton` | `w, h, r`; `Skeleton.Lines n`, `Skeleton.Card h` |
| `EmptyState` / `ErrorState` | `icon,title,text,action` / `error,onRetry,title` |
| `Field` / `FormRow` | `label, error, hint` around `.input/.select/.textarea` / responsive grid |
| `Segmented` | `options [{value,label,icon}] or strings, value, onChange, size, block` |
| `Tabs` | `tabs [{value,label,count,icon}], value, onChange` |
| `Slider` | number value → single range; `[lo,hi]` → dual-thumb (`min,max,step,minGap,ticks,showValues,format`) |
| `Toggle` | `checked, onChange(bool), disabled, label` |
| `Pagination` | `page(0-based), totalPages, totalElements, size, onChange` |
| `Sparkline` | `data[], color, width, height, fill` |
| `KpiCard` (=`Stat`) / `Delta` | `label, value, icon, delta, invertDelta, hint, spark, onClick` / `value, invert` |
| `Table` | see Tables above (+ `loading, onRowClick, empty, compact, defaultSort`) |
| `Tooltip` / `InfoTip` | `text, bottom, right` (hover/focus) |
| `Popover` | `trigger(open,toggle), align, width`, children as `(close)=>node` |
Map: `StationMap` (`markers[{id,lat,lon,level,rank?,title,subtitle,popup?,small?,color?}], selectedId, onSelect, onOpen, me, flyTo{lat,lon,zoom,key}, fitKey, polyline, polylineColor, circles[{lat,lon,radius,color,tooltip}], center, zoom, onMapClick, children`), `MapPicker` (`value{lat,lon}, onChange, height`). Locator extras: `ConnectorBadges({connectors})`, `StationCard`, `WhyBar`.
Layout helpers (CSS): `.card .card.hoverable .btn(.primary/.ghost/.danger/.sm/.icon) .chip .pill(.green/.amber/.red…) .badge .tag .segmented .tabs .table .skeleton .tip .progress(.green/.amber/.red) .stackbar .ring .grid(.cols-2/3/4,.auto) .row .col .page .page-head .kpi .stars .hatched` (slot grid: FREE `--green-soft`, BOOKED `--red-soft`, PAST grey, UNAVAILABLE `.hatched`).

## Theme tokens (`:root`)
`--bg #070b12 · --surface #0e1522 · --surface-2 #141d2e · --surface-3 #1b2740 · --border rgba(255,255,255,.07) · --text #e8eefc · --muted #8b9bb8 · --faint #5d6b86 · --primary #22d3ee · --primary-2 #38bdf8 · --green #34d399 · --amber #fbbf24 · --red #f87171 · --violet #a78bfa · --pink #f472b6` + `*-soft` tints, `--grad-hero`, `--grad-primary`, `--grad-text`, `--glass`, `--radius 16px`, `--shadow`, `--shadow-glow`, `--ease`. Animations: `fade-up fade-in pop-in pulse-glow pulse-dot shimmer float` (+ `.fade-up .stagger .pulse-glow` classes). `useCountUp(target)` hook for animated KPI numbers.

## Constants (`lib/constants.js`)
`CROWD {LOW,MEDIUM,HIGH → color/glow/cls}`, `BOOKING_STATUS`, `PRESETS`, `PRESET_WEIGHTS`, `WEIGHT_KEYS`, `CONNECTOR_LABEL`, `DEFAULT_LOCATION` (Thane West 19.2183, 72.9781), `SLOT_STATE`. Reference lists (connectors, vehicle models, amenities, zones, pricing bands): `useReference()`.
