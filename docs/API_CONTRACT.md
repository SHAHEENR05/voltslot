# VoltSlot - REST API contract

Base URL `http://localhost:8080`. All endpoints live under `/api`. Interactive docs: `/swagger-ui.html` (OpenAPI JSON at `/v3/api-docs`).
This file was written by reading `backend/src/main/java/com/chargeiq/controller/*` and `dto/*`. **Field names, types, paths, roles and status codes are exact; the values inside the example responses are illustrative** (they were not captured from a running server).
A ready-to-run Postman collection is in `docs/postman/`.

## 1. Conventions

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Topic</b></th><th style="text-align:center"><b>Rule</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top">Content type</td><td style="text-align:left;vertical-align:top">JSON (<code>Content-Type: application/json</code>). CSV export is <code>text/csv</code>.</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top">Authentication</td><td style="text-align:left;vertical-align:top"><code>Authorization: Bearer &lt;JWT&gt;</code> from <code>POST /api/auth/login</code>. HS256, claims <code>sub</code> (e-mail), <code>uid</code>, <code>role</code>; lifetime 12 h (<code>JWT_EXPIRY_HOURS</code>).</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top">Roles</td><td style="text-align:left;vertical-align:top"><code>USER</code>, <code>OPERATOR</code>, <code>ADMIN</code>, <code>FLEET_MANAGER</code>. Rules in <code>config/SecurityConfig.java</code>: <code>/api/admin/**</code> ADMIN; <code>/api/analytics/**</code> and <code>/api/operator/**</code> OPERATOR or ADMIN; <code>/api/fleet/**</code> FLEET_MANAGER or ADMIN; every other <code>/api/**</code> call needs a valid token unless listed Public below.</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left;vertical-align:top">Date/time</td><td style="text-align:left;vertical-align:top">Naive IST (<code>Asia/Kolkata</code>) ISO-8601, e.g. <code>2026-10-03T09:30:00</code>. Never UTC. Dates <code>yyyy-MM-dd</code>. Slots are 30 minutes (:00 / :30).</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left;vertical-align:top">Money</td><td style="text-align:left;vertical-align:top">INR as plain JSON numbers (BigDecimal, 2 decimals).</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left;vertical-align:top">Paging</td><td style="text-align:left;vertical-align:top"><code>page</code> (0-based), <code>size</code>. Response <code>{content, page, size, totalElements, totalPages}</code>.</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left;vertical-align:top">Enums</td><td style="text-align:left;vertical-align:top">Role: USER, OPERATOR, ADMIN, FLEET_MANAGER. BookingStatus: HOLD, CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED, NO_SHOW, EXPIRED. BookingSource: WEB, WALK_IN, FLEET, REMINDER, TRIP, WAITLIST. PaymentMethod: WALLET, UPI, CARD. Preset: BALANCED, FASTEST, CHEAPEST, LEAST_CROWDED. PointStatus: ACTIVE, MAINTENANCE, OFFLINE.</td></tr>
</tbody>
</table>

## 2. Error format

Every failure returns the same body (`exception/ErrorResponse.java`, produced by `GlobalExceptionHandler`):

```json
{
  "timestamp": "2026-10-03T04:00:00.123Z",
  "status": 400,
  "error": "Bad Request",
  "message": "Validation failed: email - Email is not valid",
  "path": "/api/auth/register",
  "fieldErrors": [ { "field": "email", "message": "Email is not valid" } ],
  "alternatives": null
}
```

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Status</b></th><th style="text-align:center"><b>When</b></th><th style="text-align:center"><b>Exception</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top">400</td><td style="text-align:left;vertical-align:top">Bean-validation failure, malformed JSON, bad business input (past start time, off-grid time ...)</td><td style="text-align:left;vertical-align:top"><code>MethodArgumentNotValidException</code>, <code>BadRequestException</code></td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top">401</td><td style="text-align:left;vertical-align:top">Missing, invalid or expired token; wrong login</td><td style="text-align:left;vertical-align:top"><code>RestAuthEntryPoint</code>, <code>UnauthorizedException</code></td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top">402</td><td style="text-align:left;vertical-align:top">Wallet balance too low to confirm a booking</td><td style="text-align:left;vertical-align:top"><code>InsufficientBalanceException</code></td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left;vertical-align:top">403</td><td style="text-align:left;vertical-align:top">Wrong role, someone else's data, blocked account</td><td style="text-align:left;vertical-align:top"><code>RestAccessDeniedHandler</code>, <code>ForbiddenException</code></td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left;vertical-align:top">404</td><td style="text-align:left;vertical-align:top">Unknown id or URL</td><td style="text-align:left;vertical-align:top"><code>ResourceNotFoundException</code></td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left;vertical-align:top">409</td><td style="text-align:left;vertical-align:top">Slot taken (carries <code>alternatives</code>), duplicate e-mail/registration, invalid state change, lock timeout, DB constraint</td><td style="text-align:left;vertical-align:top"><code>SlotUnavailableException</code>, <code>ConflictException</code>, <code>DataIntegrityViolationException</code></td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left;vertical-align:top">500</td><td style="text-align:left;vertical-align:top">Unexpected error (details only in the server log)</td><td style="text-align:left;vertical-align:top"><code>Exception</code> fallback</td></tr>
</tbody>
</table>

**409 slot conflict** (`POST /api/bookings`) also tells the client how to recover:

```json
{
  "status": 409,
  "error": "Conflict",
  "message": "This slot is no longer available",
  "path": "/api/bookings",
  "fieldErrors": null,
  "alternatives": {
    "sameStation": [ { "pointId": 14, "label": "DC-2", "start": "2026-10-04T10:00:00" } ],
    "otherStations": [ "... up to 3 RecommendedItem objects, same shape as in POST /api/recommendations ..." ]
  }
}
```

## 3. Endpoint index

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Module</b></th><th style="text-align:center"><b>Method</b></th><th style="text-align:center"><b>Path</b></th><th style="text-align:center"><b>Auth</b></th><th style="text-align:center"><b>Success</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left;vertical-align:top">Auth</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/auth/register</code></td><td style="text-align:left;vertical-align:top">Public</td><td style="text-align:right;vertical-align:top">201</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left;vertical-align:top">Auth</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/auth/login</code></td><td style="text-align:left;vertical-align:top">Public</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left;vertical-align:top">Auth</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/auth/me</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left;vertical-align:top">Auth</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/auth/change-password</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left;vertical-align:top">Auth</td><td style="text-align:left;vertical-align:top"><code>PUT</code></td><td style="text-align:left;vertical-align:top"><code>/api/users/me</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left;vertical-align:top">Clock</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/clock</code></td><td style="text-align:left;vertical-align:top">Public</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left;vertical-align:top">Reference</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/reference/connectors</code></td><td style="text-align:left;vertical-align:top">Public</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">8</td><td style="text-align:left;vertical-align:top">Reference</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/reference/vehicle-models</code></td><td style="text-align:left;vertical-align:top">Public</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">9</td><td style="text-align:left;vertical-align:top">Reference</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/reference/amenities</code></td><td style="text-align:left;vertical-align:top">Public</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">10</td><td style="text-align:left;vertical-align:top">Reference</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/reference/zones</code></td><td style="text-align:left;vertical-align:top">Public</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">11</td><td style="text-align:left;vertical-align:top">Reference</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/reference/pricing-bands</code></td><td style="text-align:left;vertical-align:top">Public</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">12</td><td style="text-align:left;vertical-align:top">Stations</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/stations</code></td><td style="text-align:left;vertical-align:top">Public</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">13</td><td style="text-align:left;vertical-align:top">Stations</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/stations/{id}</code></td><td style="text-align:left;vertical-align:top">Public</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">14</td><td style="text-align:left;vertical-align:top">Stations</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/stations/{id}/availability</code></td><td style="text-align:left;vertical-align:top">Public</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">15</td><td style="text-align:left;vertical-align:top">Stations</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/stations/{id}/forecast</code></td><td style="text-align:left;vertical-align:top">Public</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">16</td><td style="text-align:left;vertical-align:top">Reviews</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/stations/{stationId}/reviews</code></td><td style="text-align:left;vertical-align:top">Public</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">17</td><td style="text-align:left;vertical-align:top">Reviews</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/stations/{stationId}/reviews</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">201</td></tr>
<tr><td style="text-align:right">18</td><td style="text-align:left;vertical-align:top">Recommendations</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/recommendations</code></td><td style="text-align:left;vertical-align:top">Public</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">19</td><td style="text-align:left;vertical-align:top">Trips</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/trips/plan</code></td><td style="text-align:left;vertical-align:top">Public</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">20</td><td style="text-align:left;vertical-align:top">Vehicles</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/vehicles</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">21</td><td style="text-align:left;vertical-align:top">Vehicles</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/vehicles/{id}</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">22</td><td style="text-align:left;vertical-align:top">Vehicles</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/vehicles</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">201</td></tr>
<tr><td style="text-align:right">23</td><td style="text-align:left;vertical-align:top">Vehicles</td><td style="text-align:left;vertical-align:top"><code>PUT</code></td><td style="text-align:left;vertical-align:top"><code>/api/vehicles/{id}</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">24</td><td style="text-align:left;vertical-align:top">Vehicles</td><td style="text-align:left;vertical-align:top"><code>DELETE</code></td><td style="text-align:left;vertical-align:top"><code>/api/vehicles/{id}</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">204</td></tr>
<tr><td style="text-align:right">25</td><td style="text-align:left;vertical-align:top">Bookings</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/bookings/estimate</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">26</td><td style="text-align:left;vertical-align:top">Bookings</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/bookings</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">201</td></tr>
<tr><td style="text-align:right">27</td><td style="text-align:left;vertical-align:top">Bookings</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/bookings/{id}/confirm</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">28</td><td style="text-align:left;vertical-align:top">Bookings</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/bookings/{id}/cancel</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">29</td><td style="text-align:left;vertical-align:top">Bookings</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/bookings/{id}/check-in</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">30</td><td style="text-align:left;vertical-align:top">Bookings</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/bookings/{id}/complete</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">31</td><td style="text-align:left;vertical-align:top">Bookings</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/bookings</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">32</td><td style="text-align:left;vertical-align:top">Bookings</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/bookings/{id}</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">33</td><td style="text-align:left;vertical-align:top">Bookings</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/bookings/{id}/invoice</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">34</td><td style="text-align:left;vertical-align:top">Wallet</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/wallet</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">35</td><td style="text-align:left;vertical-align:top">Wallet</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/wallet/transactions</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">36</td><td style="text-align:left;vertical-align:top">Wallet</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/wallet/topup</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">37</td><td style="text-align:left;vertical-align:top">Waitlist</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/waitlist</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">201</td></tr>
<tr><td style="text-align:right">38</td><td style="text-align:left;vertical-align:top">Waitlist</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/waitlist</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">39</td><td style="text-align:left;vertical-align:top">Waitlist</td><td style="text-align:left;vertical-align:top"><code>DELETE</code></td><td style="text-align:left;vertical-align:top"><code>/api/waitlist/{id}</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">204</td></tr>
<tr><td style="text-align:right">40</td><td style="text-align:left;vertical-align:top">Notifications</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/notifications</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">41</td><td style="text-align:left;vertical-align:top">Notifications</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/notifications/unread-count</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">42</td><td style="text-align:left;vertical-align:top">Notifications</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/notifications/{id}/read</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">43</td><td style="text-align:left;vertical-align:top">Notifications</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/notifications/read-all</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">44</td><td style="text-align:left;vertical-align:top">Reminders</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/reminders/predictions</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">45</td><td style="text-align:left;vertical-align:top">Reminders</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/reminders/active</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">46</td><td style="text-align:left;vertical-align:top">Reminders</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/reminders/{notificationId}/snooze</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">47</td><td style="text-align:left;vertical-align:top">Reminders</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/reminders/{notificationId}/dismiss</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">48</td><td style="text-align:left;vertical-align:top">Reminders</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/reminders/{notificationId}/book</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">201</td></tr>
<tr><td style="text-align:right">49</td><td style="text-align:left;vertical-align:top">Reminders</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/reminders/refresh</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">50</td><td style="text-align:left;vertical-align:top">Reminders</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/reminders/demo-trigger</code></td><td style="text-align:left;vertical-align:top">Bearer (any role)</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">51</td><td style="text-align:left;vertical-align:top">Fleet</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/fleet/overview</code></td><td style="text-align:left;vertical-align:top">FLEET_MANAGER, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">52</td><td style="text-align:left;vertical-align:top">Fleet</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/fleet/schedule</code></td><td style="text-align:left;vertical-align:top">FLEET_MANAGER, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">53</td><td style="text-align:left;vertical-align:top">Fleet</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/fleet/schedule/apply</code></td><td style="text-align:left;vertical-align:top">FLEET_MANAGER, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">54</td><td style="text-align:left;vertical-align:top">Operator</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/operator/dashboard</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">55</td><td style="text-align:left;vertical-align:top">Operator</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/operator/stations</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">56</td><td style="text-align:left;vertical-align:top">Operator</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/operator/stations</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">201</td></tr>
<tr><td style="text-align:right">57</td><td style="text-align:left;vertical-align:top">Operator</td><td style="text-align:left;vertical-align:top"><code>PUT</code></td><td style="text-align:left;vertical-align:top"><code>/api/operator/stations/{id}</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">58</td><td style="text-align:left;vertical-align:top">Operator</td><td style="text-align:left;vertical-align:top"><code>DELETE</code></td><td style="text-align:left;vertical-align:top"><code>/api/operator/stations/{id}</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">204</td></tr>
<tr><td style="text-align:right">59</td><td style="text-align:left;vertical-align:top">Operator</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/operator/stations/{id}/points</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">201</td></tr>
<tr><td style="text-align:right">60</td><td style="text-align:left;vertical-align:top">Operator</td><td style="text-align:left;vertical-align:top"><code>PUT</code></td><td style="text-align:left;vertical-align:top"><code>/api/operator/points/{id}</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">61</td><td style="text-align:left;vertical-align:top">Operator</td><td style="text-align:left;vertical-align:top"><code>DELETE</code></td><td style="text-align:left;vertical-align:top"><code>/api/operator/points/{id}</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">204</td></tr>
<tr><td style="text-align:right">62</td><td style="text-align:left;vertical-align:top">Operator</td><td style="text-align:left;vertical-align:top"><code>PUT</code></td><td style="text-align:left;vertical-align:top"><code>/api/operator/points/{id}/status</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">63</td><td style="text-align:left;vertical-align:top">Operator</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/operator/stations/{id}/schedule</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">64</td><td style="text-align:left;vertical-align:top">Operator</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/operator/walk-ins</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">201</td></tr>
<tr><td style="text-align:right">65</td><td style="text-align:left;vertical-align:top">Admin</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/admin/users</code></td><td style="text-align:left;vertical-align:top">ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">66</td><td style="text-align:left;vertical-align:top">Admin</td><td style="text-align:left;vertical-align:top"><code>PUT</code></td><td style="text-align:left;vertical-align:top"><code>/api/admin/users/{id}/role</code></td><td style="text-align:left;vertical-align:top">ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">67</td><td style="text-align:left;vertical-align:top">Admin</td><td style="text-align:left;vertical-align:top"><code>PUT</code></td><td style="text-align:left;vertical-align:top"><code>/api/admin/users/{id}/status</code></td><td style="text-align:left;vertical-align:top">ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">68</td><td style="text-align:left;vertical-align:top">Admin</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/admin/stats</code></td><td style="text-align:left;vertical-align:top">ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">69</td><td style="text-align:left;vertical-align:top">Admin</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/admin/warehouse/refresh</code></td><td style="text-align:left;vertical-align:top">ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">70</td><td style="text-align:left;vertical-align:top">Admin</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/admin/clock</code></td><td style="text-align:left;vertical-align:top">ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">71</td><td style="text-align:left;vertical-align:top">Admin</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/admin/clock/advance</code></td><td style="text-align:left;vertical-align:top">ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">72</td><td style="text-align:left;vertical-align:top">Admin</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/admin/clock/reset</code></td><td style="text-align:left;vertical-align:top">ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">73</td><td style="text-align:left;vertical-align:top">Admin</td><td style="text-align:left;vertical-align:top"><code>POST</code></td><td style="text-align:left;vertical-align:top"><code>/api/admin/reminders/run-now</code></td><td style="text-align:left;vertical-align:top">ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">74</td><td style="text-align:left;vertical-align:top">Analytics</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/analytics/overview</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">75</td><td style="text-align:left;vertical-align:top">Analytics</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/analytics/trend</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">76</td><td style="text-align:left;vertical-align:top">Analytics</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/analytics/heatmap</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">77</td><td style="text-align:left;vertical-align:top">Analytics</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/analytics/zones</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">78</td><td style="text-align:left;vertical-align:top">Analytics</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/analytics/mix</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">79</td><td style="text-align:left;vertical-align:top">Analytics</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/analytics/funnel</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">80</td><td style="text-align:left;vertical-align:top">Analytics</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/analytics/segments</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">81</td><td style="text-align:left;vertical-align:top">Analytics</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/analytics/stations</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">82</td><td style="text-align:left;vertical-align:top">Analytics</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/analytics/sentiment</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">83</td><td style="text-align:left;vertical-align:top">Analytics</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/analytics/weather-impact</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">84</td><td style="text-align:left;vertical-align:top">Analytics</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/analytics/cohorts</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">85</td><td style="text-align:left;vertical-align:top">Analytics</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/analytics/lead-time</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">86</td><td style="text-align:left;vertical-align:top">Analytics</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/analytics/insights</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
<tr><td style="text-align:right">87</td><td style="text-align:left;vertical-align:top">Analytics</td><td style="text-align:left;vertical-align:top"><code>GET</code></td><td style="text-align:left;vertical-align:top"><code>/api/analytics/export/sessions.csv</code></td><td style="text-align:left;vertical-align:top">OPERATOR, ADMIN</td><td style="text-align:right;vertical-align:top">200</td></tr>
</tbody>
</table>

# 4. Endpoints in detail

## 4.1 Auth

### POST /api/auth/register

Auth: **Public** | Success: **201**

Password 8-64 chars with a letter and a digit. 409 if the e-mail exists. A wallet with balance 0 is created.

Request body:

```json
{
  "fullName": "Test Driver",
  "email": "test.driver@example.com",
  "password": "Pass@1234",
  "phone": "9876543210",
  "city": "Thane"
}
```

Response 201:

```json
{
  "id": 700,
  "fullName": "Test Driver",
  "email": "test.driver@example.com",
  "phone": "9820012345",
  "role": "USER",
  "city": "Thane",
  "operatorId": null,
  "operatorName": null,
  "fleetId": null,
  "fleetName": null,
  "reminderEnabled": true,
  "reminderLeadHours": 24,
  "noShowCount": 0,
  "walletBalance": 0,
  "homeLat": 19.2183,
  "homeLon": 72.9781
}
```

### POST /api/auth/login

Auth: **Public** | Success: **200**

401 for wrong credentials, 403 if the account is BLOCKED. Send `Authorization: Bearer <token>` afterwards.

Request body:

```json
{
  "email": "demo@voltslot.in",
  "password": "User@123"
}
```

Response 200:

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "tokenType": "Bearer",
  "expiresAt": "2026-10-03T21:30:00",
  "user": {
    "id": 4,
    "fullName": "Aarav Mehta",
    "email": "demo@voltslot.in",
    "phone": "9820012345",
    "role": "USER",
    "city": "Thane",
    "operatorId": null,
    "operatorName": null,
    "fleetId": null,
    "fleetName": null,
    "reminderEnabled": true,
    "reminderLeadHours": 24,
    "noShowCount": 0,
    "walletBalance": 2450.0,
    "homeLat": 19.2183,
    "homeLon": 72.9781
  }
}
```

### GET /api/auth/me

Auth: **Bearer (any role)** | Success: **200**

Response 200:

```json
{
  "id": 4,
  "fullName": "Aarav Mehta",
  "email": "demo@voltslot.in",
  "phone": "9820012345",
  "role": "USER",
  "city": "Thane",
  "operatorId": null,
  "operatorName": null,
  "fleetId": null,
  "fleetName": null,
  "reminderEnabled": true,
  "reminderLeadHours": 24,
  "noShowCount": 0,
  "walletBalance": 2450.0,
  "homeLat": 19.2183,
  "homeLon": 72.9781
}
```

### POST /api/auth/change-password

Auth: **Bearer (any role)** | Success: **200**

400 if the current password is wrong or the new one equals it.

Request body:

```json
{
  "currentPassword": "User@123",
  "newPassword": "NewPass@456"
}
```

Response 200:

```json
{
  "message": "Password changed"
}
```

### PUT /api/users/me

Auth: **Bearer (any role)** | Success: **200**

`reminderLeadHours` 1-72.

Request body:

```json
{
  "fullName": "Aarav Mehta",
  "phone": "9820012345",
  "city": "Thane",
  "homeLat": 19.2183,
  "homeLon": 72.9781,
  "reminderEnabled": true,
  "reminderLeadHours": 24
}
```

Response 200:

```json
{
  "id": 4,
  "fullName": "Aarav Mehta",
  "email": "demo@voltslot.in",
  "phone": "9820012345",
  "role": "USER",
  "city": "Thane",
  "operatorId": null,
  "operatorName": null,
  "fleetId": null,
  "fleetName": null,
  "reminderEnabled": true,
  "reminderLeadHours": 24,
  "noShowCount": 0,
  "walletBalance": 2450.0,
  "homeLat": 19.2183,
  "homeLon": 72.9781
}
```

## 4.2 Clock

### GET /api/clock

Auth: **Public** | Success: **200**

The application clock (demo time machine). All time rules use it, never the system clock.

Response 200:

```json
{
  "now": "2026-10-03T09:30:00",
  "mode": "FIXED",
  "anchor": "2026-10-03T09:30:00",
  "offsetSeconds": 0
}
```

## 4.3 Reference

### GET /api/reference/connectors

Auth: **Public** | Success: **200**

Response 200:

```json
[
  {
    "id": 1,
    "code": "CCS2",
    "displayName": "CCS Combo 2",
    "currentType": "DC",
    "typicalKw": 60.0
  }
]
```

### GET /api/reference/vehicle-models

Auth: **Public** | Success: **200**

Response 200:

```json
[
  {
    "id": 1,
    "make": "Tata",
    "model": "Nexon EV",
    "variant": "Long Range",
    "category": "CAR",
    "batteryKwh": 40.5,
    "acMaxKw": 7.2,
    "dcMaxKw": 50.0,
    "rangeKm": 330,
    "kmPerKwh": 7.0,
    "connectorCodes": [
      "CCS2",
      "TYPE2"
    ]
  }
]
```

### GET /api/reference/amenities

Auth: **Public** | Success: **200**

Response 200:

```json
[
  {
    "id": 1,
    "name": "Cafe",
    "icon": "coffee"
  }
]
```

### GET /api/reference/zones

Auth: **Public** | Success: **200**

Response 200:

```json
[
  {
    "zone": "Thane West",
    "stations": 1,
    "latitude": 19.2183,
    "longitude": 72.9781
  }
]
```

### GET /api/reference/pricing-bands

Auth: **Public** | Success: **200**

24 rows, one per hour.

Response 200:

```json
[
  {
    "hourOfDay": 0,
    "bandName": "OFFPEAK",
    "multiplier": 0.85
  },
  {
    "hourOfDay": 18,
    "bandName": "PEAK",
    "multiplier": 1.2
  }
]
```

## 4.4 Stations

### GET /api/stations

Auth: **Public** | Success: **200**

Example URL: `/api/stations?lat=19.2183&lon=72.9781&radiusKm=10&connector=CCS2&minKw=50&amenity=Cafe&zone=Thane West&q=hub&openNow=true&sort=distance&page=0&size=12`

All query parameters optional. `size` is capped at 100. Paged envelope `{content,page,size,totalElements,totalPages}` (0-based).

Response 200:

```json
{
  "content": [
    {
      "id": 3,
      "name": "AmpereHub Thane West Hub – Ghodbunder Rd",
      "address": "Ghodbunder Rd, Thane West",
      "zone": "Thane West",
      "city": "Thane",
      "latitude": 19.2183,
      "longitude": 72.9781,
      "tier": "HUB",
      "operatorId": 3,
      "operatorName": "AmpereHub",
      "distanceKm": 1.4,
      "connectors": [
        {
          "code": "CCS2",
          "count": 3,
          "maxKw": 120.0
        },
        {
          "code": "TYPE2",
          "count": 1,
          "maxKw": 7.4
        }
      ],
      "totalPoints": 6,
      "activePoints": 6,
      "minTariff": 9.0,
      "avgRating": 4.3,
      "reviewCount": 88,
      "reliabilityScore": 84.2,
      "sentimentLabel": "POSITIVE",
      "openNow": true,
      "openHour": 0,
      "closeHour": 24,
      "freeNowPoints": 4,
      "crowdingIndexNow": 42.5,
      "crowdingLevelNow": "MEDIUM"
    }
  ],
  "page": 0,
  "size": 10,
  "totalElements": 1,
  "totalPages": 1
}
```

### GET /api/stations/{id}

Auth: **Public** | Success: **200**

404 if unknown.

Response 200:

```json
{
  "summary": {
    "id": 3,
    "name": "AmpereHub Thane West Hub – Ghodbunder Rd",
    "address": "Ghodbunder Rd, Thane West",
    "zone": "Thane West",
    "city": "Thane",
    "latitude": 19.2183,
    "longitude": 72.9781,
    "tier": "HUB",
    "operatorId": 3,
    "operatorName": "AmpereHub",
    "distanceKm": 1.4,
    "connectors": [
      {
        "code": "CCS2",
        "count": 3,
        "maxKw": 120.0
      },
      {
        "code": "TYPE2",
        "count": 1,
        "maxKw": 7.4
      }
    ],
    "totalPoints": 6,
    "activePoints": 6,
    "minTariff": 9.0,
    "avgRating": 4.3,
    "reviewCount": 88,
    "reliabilityScore": 84.2,
    "sentimentLabel": "POSITIVE",
    "openNow": true,
    "openHour": 0,
    "closeHour": 24,
    "freeNowPoints": 4,
    "crowdingIndexNow": 42.5,
    "crowdingLevelNow": "MEDIUM"
  },
  "amenities": [
    {
      "id": 1,
      "name": "Cafe",
      "icon": "coffee"
    }
  ],
  "points": [
    {
      "id": 13,
      "label": "DC-1",
      "connectorCode": "CCS2",
      "connectorName": "CCS Combo 2",
      "currentType": "DC",
      "powerKw": 120.0,
      "tariffPerKwh": 23.0,
      "status": "ACTIVE"
    }
  ],
  "ratingBreakdown": {
    "1": 2,
    "2": 3,
    "3": 9,
    "4": 30,
    "5": 44
  },
  "sentiment": {
    "positivePct": 69,
    "neutralPct": 17,
    "negativePct": 14
  },
  "uptimePct": 97.2
}
```

### GET /api/stations/{id}/availability

Auth: **Public** | Success: **200**

Example URL: `/api/stations/{id}/availability?date=2026-10-04&vehicleId=1`

Slot state: FREE, BOOKED, PAST or UNAVAILABLE. `crowdingByHour` has 24 values.

Response 200:

```json
{
  "stationId": 3,
  "date": "2026-10-04",
  "slotMinutes": 30,
  "openHour": 0,
  "closeHour": 24,
  "now": "2026-10-03T09:30:00",
  "points": [
    {
      "pointId": 13,
      "label": "DC-1",
      "connectorCode": "CCS2",
      "powerKw": 120.0,
      "tariffPerKwh": 23.0,
      "compatible": true,
      "slots": [
        {
          "start": "2026-10-04T00:00:00",
          "state": "FREE"
        },
        {
          "start": "2026-10-04T00:30:00",
          "state": "BOOKED"
        }
      ]
    }
  ],
  "crowdingByHour": [
    10,
    8,
    6
  ]
}
```

### GET /api/stations/{id}/forecast

Auth: **Public** | Success: **200**

`grid` has 7x24 = 168 cells (1 = Monday).

Response 200:

```json
{
  "stationId": 3,
  "grid": [
    {
      "dayOfWeek": 1,
      "hour": 18,
      "expectedSessions": 2.4,
      "crowdingIndex": 71.0,
      "level": "HIGH"
    }
  ],
  "quietestNext24h": [
    {
      "start": "2026-10-04T03:00:00",
      "crowdingIndex": 4.0
    }
  ]
}
```

## 4.5 Reviews

### GET /api/stations/{stationId}/reviews

Auth: **Public** | Success: **200**

Example URL: `/api/stations/{stationId}/reviews?page=0&size=10`

Response 200:

```json
{
  "content": [
    {
      "id": 1,
      "userName": "Rahul D.",
      "rating": 5,
      "comment": "Fast charger, very clean.",
      "sentimentLabel": "POSITIVE",
      "sentimentScore": 0.62,
      "createdAt": "2026-09-30T19:10:00"
    }
  ],
  "page": 0,
  "size": 10,
  "totalElements": 1,
  "totalPages": 1
}
```

### POST /api/stations/{stationId}/reviews

Auth: **Bearer (any role)** | Success: **201**

Sentiment is computed by the Java `SentimentService`. 403 unless the caller has charged at the station, 409 if the booking was already reviewed.

Request body:

```json
{
  "rating": 5,
  "comment": "Fast charger, no queue.",
  "bookingId": 9201
}
```

Response 201:

```json
{
  "id": 1719,
  "userName": "Aarav M.",
  "rating": 5,
  "comment": "Fast charger, no queue.",
  "sentimentLabel": "POSITIVE",
  "sentimentScore": 0.55,
  "createdAt": "2026-10-03T09:35:00"
}
```

## 4.6 Recommendations

### POST /api/recommendations

Auth: **Public** | Success: **200**

Required: latitude, longitude. `preset`: BALANCED, FASTEST, CHEAPEST, LEAST_CROWDED. Custom `weights` override the preset and are re-normalised to sum 1. Anonymous callers pass `connectorCodes` instead of `vehicleId`.

Request body:

```json
{
  "latitude": 19.2183,
  "longitude": 72.9781,
  "vehicleId": 1,
  "arrivalTime": null,
  "socStart": 20,
  "socTarget": 80,
  "preset": "BALANCED",
  "weights": {
    "distance": 0.2,
    "wait": 0.3,
    "crowding": 0.2,
    "price": 0.1,
    "reliability": 0.1,
    "speed": 0.1
  },
  "radiusKm": 25,
  "limit": 5
}
```

Response 200:

```json
{
  "generatedAt": "2026-10-03T09:30:00",
  "preset": "BALANCED",
  "weights": {
    "distance": 0.22,
    "wait": 0.22,
    "crowding": 0.2,
    "price": 0.14,
    "reliability": 0.12,
    "speed": 0.1
  },
  "energyKwhNeeded": 26.41,
  "items": [
    {
      "rank": 1,
      "score": 78.6,
      "station": {
        "id": 3,
        "name": "AmpereHub Thane West Hub – Ghodbunder Rd",
        "address": "Ghodbunder Rd, Thane West",
        "zone": "Thane West",
        "city": "Thane",
        "latitude": 19.2183,
        "longitude": 72.9781,
        "tier": "HUB",
        "operatorId": 3,
        "operatorName": "AmpereHub",
        "distanceKm": 1.4,
        "connectors": [
          {
            "code": "CCS2",
            "count": 3,
            "maxKw": 120.0
          },
          {
            "code": "TYPE2",
            "count": 1,
            "maxKw": 7.4
          }
        ],
        "totalPoints": 6,
        "activePoints": 6,
        "minTariff": 9.0,
        "avgRating": 4.3,
        "reviewCount": 88,
        "reliabilityScore": 84.2,
        "sentimentLabel": "POSITIVE",
        "openNow": true,
        "openHour": 0,
        "closeHour": 24,
        "freeNowPoints": 4,
        "crowdingIndexNow": 42.5,
        "crowdingLevelNow": "MEDIUM"
      },
      "point": {
        "pointId": 13,
        "label": "DC-1",
        "connectorCode": "CCS2",
        "powerKw": 120.0,
        "tariffPerKwh": 23.0
      },
      "etaMinutes": 16,
      "arrivalTime": "2026-10-03T09:46:00",
      "slotStart": "2026-10-03T10:00:00",
      "slotEnd": "2026-10-03T10:30:00",
      "slots": 1,
      "waitMinutes": 14,
      "chargeMinutes": 42,
      "estimatedCost": 420.0,
      "effectiveTariff": 15.9,
      "crowdingIndex": 35.0,
      "crowdingLevel": "MEDIUM",
      "breakdown": {
        "distance": {
          "score": 0.82,
          "weight": 0.22,
          "contribution": 18.04
        },
        "wait": {
          "score": 0.844,
          "weight": 0.22,
          "contribution": 18.58
        },
        "crowding": {
          "score": 0.65,
          "weight": 0.2,
          "contribution": 13.0
        },
        "price": {
          "score": 1.0,
          "weight": 0.14,
          "contribution": 14.0
        },
        "reliability": {
          "score": 0.9,
          "weight": 0.12,
          "contribution": 10.8
        },
        "speed": {
          "score": 0.417,
          "weight": 0.1,
          "contribution": 4.17
        }
      },
      "reasons": [
        "Free in 14 min",
        "Quieter than nearby stations",
        "Cheapest of the options"
      ],
      "tags": [
        "Best overall",
        "Cheapest",
        "Quietest"
      ]
    }
  ],
  "nearestBaseline": {
    "stationId": 5,
    "stationName": "Nearest station",
    "distanceKm": 0.9,
    "etaMinutes": 5,
    "waitMinutes": 53,
    "crowdingIndex": 80.0,
    "estimatedCost": 600.0
  },
  "savings": {
    "minutesSaved": 30,
    "rupeesSaved": 180.0,
    "summary": "Saves 30 min and ₹180 compared with the nearest station (Nearest station)."
  }
}
```

## 4.7 Trips

### POST /api/trips/plan

Auth: **Public** | Success: **200**

CHARGE legs additionally carry `station`, `pointId`, `slotStart`, `crowdingLevel`, `estimatedCost`.

Request body:

```json
{
  "originLat": 19.2183,
  "originLon": 72.9781,
  "destLat": 18.9894,
  "destLon": 73.1175,
  "vehicleId": 1,
  "startSocPercent": 35,
  "departAt": "2026-10-04T08:00:00",
  "reserveSocPercent": 10
}
```

Response 200:

```json
{
  "distanceKm": 38.2,
  "drivingMinutes": 62,
  "needsCharging": false,
  "feasible": true,
  "arrivalSocPercent": 24,
  "departAt": "2026-10-04T08:00:00",
  "arriveAt": "2026-10-04T09:02:00",
  "legs": [
    {
      "type": "DRIVE",
      "fromLat": 19.2183,
      "fromLon": 72.9781,
      "toLat": 18.9894,
      "toLon": 73.1175,
      "distanceKm": 38.2,
      "durationMin": 62,
      "socStart": 35,
      "socEnd": 24,
      "startTime": "2026-10-04T08:00:00",
      "endTime": "2026-10-04T09:02:00"
    }
  ],
  "polyline": [
    [
      19.2183,
      72.9781
    ],
    [
      18.9894,
      73.1175
    ]
  ],
  "notes": [
    "No charging stop needed."
  ]
}
```

## 4.8 Vehicles

### GET /api/vehicles

Auth: **Bearer (any role)** | Success: **200**

A fleet manager sees every vehicle of the fleet.

Response 200:

```json
[
  {
    "id": 1,
    "modelId": 1,
    "make": "Tata",
    "model": "Nexon EV",
    "variant": "Long Range",
    "category": "CAR",
    "batteryKwh": 40.5,
    "acMaxKw": 7.2,
    "dcMaxKw": 50.0,
    "rangeKm": 330,
    "kmPerKwh": 7.0,
    "connectorCodes": [
      "CCS2",
      "TYPE2"
    ],
    "regNumber": "MH04 AZ 7733",
    "nickname": "Nexon",
    "avgDailyKm": 48,
    "fleetId": null
  }
]
```

### GET /api/vehicles/{id}

Auth: **Bearer (any role)** | Success: **200**

403 for somebody else's vehicle.

Response 200:

```json
{
  "id": 1,
  "modelId": 1,
  "make": "Tata",
  "model": "Nexon EV",
  "variant": "Long Range",
  "category": "CAR",
  "batteryKwh": 40.5,
  "acMaxKw": 7.2,
  "dcMaxKw": 50.0,
  "rangeKm": 330,
  "kmPerKwh": 7.0,
  "connectorCodes": [
    "CCS2",
    "TYPE2"
  ],
  "regNumber": "MH04 AZ 7733",
  "nickname": "Nexon",
  "avgDailyKm": 48,
  "fleetId": null
}
```

### POST /api/vehicles

Auth: **Bearer (any role)** | Success: **201**

409 if the registration number exists.

Request body:

```json
{
  "modelId": 1,
  "regNumber": "MH04 ZZ 1234",
  "nickname": "Weekend car",
  "avgDailyKm": 40
}
```

Response 201:

```json
{
  "id": 702,
  "modelId": 1,
  "make": "Tata",
  "model": "Nexon EV",
  "variant": "Long Range",
  "category": "CAR",
  "batteryKwh": 40.5,
  "acMaxKw": 7.2,
  "dcMaxKw": 50.0,
  "rangeKm": 330,
  "kmPerKwh": 7.0,
  "connectorCodes": [
    "CCS2",
    "TYPE2"
  ],
  "regNumber": "MH04 ZZ 1234",
  "nickname": "Weekend car",
  "avgDailyKm": 40,
  "fleetId": null
}
```

### PUT /api/vehicles/{id}

Auth: **Bearer (any role)** | Success: **200**

Request body:

```json
{
  "modelId": 1,
  "regNumber": "MH04 ZZ 1234",
  "nickname": "Daily car",
  "avgDailyKm": 55
}
```

Response 200:

```json
{
  "id": 1,
  "modelId": 1,
  "make": "Tata",
  "model": "Nexon EV",
  "variant": "Long Range",
  "category": "CAR",
  "batteryKwh": 40.5,
  "acMaxKw": 7.2,
  "dcMaxKw": 50.0,
  "rangeKm": 330,
  "kmPerKwh": 7.0,
  "connectorCodes": [
    "CCS2",
    "TYPE2"
  ],
  "regNumber": "MH04 AZ 7733",
  "nickname": "Daily car",
  "avgDailyKm": 55,
  "fleetId": null
}
```

### DELETE /api/vehicles/{id}

Auth: **Bearer (any role)** | Success: **204**

409 when the vehicle has upcoming bookings or booking history.

Response: empty body.

## 4.9 Bookings

### POST /api/bookings/estimate

Auth: **Bearer (any role)** | Success: **200**

Pure calculation, nothing stored. `startTime` optional (multiplier 1.0 when omitted).

Request body:

```json
{
  "vehicleId": 1,
  "chargingPointId": 13,
  "startTime": "2026-10-04T10:00:00",
  "socStart": 20,
  "socTarget": 80
}
```

Response 200:

```json
{
  "energyKwh": 26.41,
  "acceptedKw": 50.0,
  "durationMinutes": 42,
  "slots": 2,
  "effectiveTariff": 23.0,
  "estimatedCost": 607.5,
  "co2AvoidedKg": 22.2,
  "kmAdded": 168.6,
  "bandName": "NORMAL",
  "multiplier": 1.0
}
```

### POST /api/bookings

Auth: **Bearer (any role)** | Success: **201**

Creates a 5-minute HOLD (10 min for WAITLIST). Give `chargingPointId` or only `stationId` (best free compatible point is auto-assigned). Start must be on :00/:30, not in the past, at most 14 days ahead. 409 `SlotUnavailable` returns alternatives (see section Errors).

Request body:

```json
{
  "vehicleId": 1,
  "chargingPointId": 13,
  "stationId": 3,
  "startTime": "2026-10-04T10:00:00",
  "socStart": 20,
  "socTarget": 80,
  "source": "WEB"
}
```

Response 201:

```json
{
  "id": 9543,
  "bookingCode": "VSL-7K2M9X",
  "status": "HOLD",
  "source": "WEB",
  "startTime": "2026-10-04T10:00:00",
  "endTime": "2026-10-04T10:30:00",
  "slots": 1,
  "station": {
    "id": 3,
    "name": "AmpereHub Thane West Hub – Ghodbunder Rd",
    "zone": "Thane West",
    "address": "Ghodbunder Rd, Thane West",
    "latitude": 19.2183,
    "longitude": 72.9781
  },
  "point": {
    "id": 13,
    "label": "DC-1",
    "connectorCode": "CCS2",
    "powerKw": 120.0,
    "tariffPerKwh": 23.0
  },
  "vehicle": {
    "id": 1,
    "nickname": "Nexon",
    "regNumber": "MH04 AZ 7733",
    "make": "Tata",
    "model": "Nexon EV"
  },
  "socStart": 20,
  "socTarget": 80,
  "estEnergyKwh": 26.41,
  "estCost": 607.5,
  "holdExpiresAt": "2026-10-03T09:35:00",
  "checkedInAt": null,
  "cancelledAt": null,
  "cancelReason": null,
  "createdAt": "2026-10-03T09:30:00",
  "payment": null,
  "session": null,
  "canCancel": true,
  "canCheckIn": false,
  "refundIfCancelled": 0.0,
  "qrPayload": "VSL-7K2M9X"
}
```

### POST /api/bookings/{id}/confirm

Auth: **Bearer (any role)** | Success: **200**

`paymentMethod`: WALLET, UPI, CARD (UPI/CARD are simulated). 402 if the wallet is too low, 409 if the hold expired.

Request body:

```json
{
  "paymentMethod": "WALLET"
}
```

Response 200:

```json
{
  "id": 9543,
  "bookingCode": "VSL-7K2M9X",
  "status": "CONFIRMED",
  "source": "WEB",
  "startTime": "2026-10-04T10:00:00",
  "endTime": "2026-10-04T10:30:00",
  "slots": 1,
  "station": {
    "id": 3,
    "name": "AmpereHub Thane West Hub – Ghodbunder Rd",
    "zone": "Thane West",
    "address": "Ghodbunder Rd, Thane West",
    "latitude": 19.2183,
    "longitude": 72.9781
  },
  "point": {
    "id": 13,
    "label": "DC-1",
    "connectorCode": "CCS2",
    "powerKw": 120.0,
    "tariffPerKwh": 23.0
  },
  "vehicle": {
    "id": 1,
    "nickname": "Nexon",
    "regNumber": "MH04 AZ 7733",
    "make": "Tata",
    "model": "Nexon EV"
  },
  "socStart": 20,
  "socTarget": 80,
  "estEnergyKwh": 26.41,
  "estCost": 607.5,
  "holdExpiresAt": null,
  "checkedInAt": null,
  "cancelledAt": null,
  "cancelReason": null,
  "createdAt": "2026-10-03T09:30:00",
  "payment": {
    "amount": 607.5,
    "method": "WALLET",
    "status": "PAID",
    "invoiceNo": "INV-2026-009201",
    "refundedAmount": 0.0
  },
  "session": null,
  "canCancel": true,
  "canCheckIn": false,
  "refundIfCancelled": 607.5,
  "qrPayload": "VSL-7K2M9X"
}
```

### POST /api/bookings/{id}/cancel

Auth: **Bearer (any role)** | Success: **200**

Body optional. Refund 100% if cancelled at least 60 min before start, else 50%. Frees the slots and promotes the waitlist.

Request body:

```json
{
  "reason": "Plan changed"
}
```

Response 200:

```json
{
  "id": 9543,
  "bookingCode": "VSL-7K2M9X",
  "status": "CANCELLED",
  "source": "WEB",
  "startTime": "2026-10-04T10:00:00",
  "endTime": "2026-10-04T10:30:00",
  "slots": 1,
  "station": {
    "id": 3,
    "name": "AmpereHub Thane West Hub – Ghodbunder Rd",
    "zone": "Thane West",
    "address": "Ghodbunder Rd, Thane West",
    "latitude": 19.2183,
    "longitude": 72.9781
  },
  "point": {
    "id": 13,
    "label": "DC-1",
    "connectorCode": "CCS2",
    "powerKw": 120.0,
    "tariffPerKwh": 23.0
  },
  "vehicle": {
    "id": 1,
    "nickname": "Nexon",
    "regNumber": "MH04 AZ 7733",
    "make": "Tata",
    "model": "Nexon EV"
  },
  "socStart": 20,
  "socTarget": 80,
  "estEnergyKwh": 26.41,
  "estCost": 607.5,
  "holdExpiresAt": "2026-10-03T09:35:00",
  "checkedInAt": null,
  "cancelledAt": "2026-10-03T09:40:00",
  "cancelReason": "Plan changed",
  "createdAt": "2026-10-03T09:30:00",
  "payment": {
    "amount": 607.5,
    "method": "WALLET",
    "status": "REFUNDED",
    "invoiceNo": "INV-2026-009201",
    "refundedAmount": 607.5
  },
  "session": null,
  "canCancel": false,
  "canCheckIn": false,
  "refundIfCancelled": 0.0,
  "qrPayload": "VSL-7K2M9X"
}
```

### POST /api/bookings/{id}/check-in

Auth: **Bearer (any role)** | Success: **200**

Only from 15 min before to 15 min after the start (400 otherwise); status must be CONFIRMED (409 otherwise).

Response 200:

```json
{
  "id": 9543,
  "bookingCode": "VSL-7K2M9X",
  "status": "CHECKED_IN",
  "source": "WEB",
  "startTime": "2026-10-04T10:00:00",
  "endTime": "2026-10-04T10:30:00",
  "slots": 1,
  "station": {
    "id": 3,
    "name": "AmpereHub Thane West Hub – Ghodbunder Rd",
    "zone": "Thane West",
    "address": "Ghodbunder Rd, Thane West",
    "latitude": 19.2183,
    "longitude": 72.9781
  },
  "point": {
    "id": 13,
    "label": "DC-1",
    "connectorCode": "CCS2",
    "powerKw": 120.0,
    "tariffPerKwh": 23.0
  },
  "vehicle": {
    "id": 1,
    "nickname": "Nexon",
    "regNumber": "MH04 AZ 7733",
    "make": "Tata",
    "model": "Nexon EV"
  },
  "socStart": 20,
  "socTarget": 80,
  "estEnergyKwh": 26.41,
  "estCost": 607.5,
  "holdExpiresAt": null,
  "checkedInAt": "2026-10-04T09:58:00",
  "cancelledAt": null,
  "cancelReason": null,
  "createdAt": "2026-10-03T09:30:00",
  "payment": {
    "amount": 607.5,
    "method": "WALLET",
    "status": "PAID",
    "invoiceNo": "INV-2026-009201",
    "refundedAmount": 0.0
  },
  "session": null,
  "canCancel": true,
  "canCheckIn": false,
  "refundIfCancelled": 0.0,
  "qrPayload": "VSL-7K2M9X"
}
```

### POST /api/bookings/{id}/complete

Auth: **Bearer (any role)** | Success: **200**

Body optional (default: `socTarget`). Only a CHECKED_IN booking. Stores the charging session and settles the bill.

Request body:

```json
{
  "socEnd": 80
}
```

Response 200:

```json
{
  "id": 9543,
  "bookingCode": "VSL-7K2M9X",
  "status": "COMPLETED",
  "source": "WEB",
  "startTime": "2026-10-04T10:00:00",
  "endTime": "2026-10-04T10:30:00",
  "slots": 1,
  "station": {
    "id": 3,
    "name": "AmpereHub Thane West Hub – Ghodbunder Rd",
    "zone": "Thane West",
    "address": "Ghodbunder Rd, Thane West",
    "latitude": 19.2183,
    "longitude": 72.9781
  },
  "point": {
    "id": 13,
    "label": "DC-1",
    "connectorCode": "CCS2",
    "powerKw": 120.0,
    "tariffPerKwh": 23.0
  },
  "vehicle": {
    "id": 1,
    "nickname": "Nexon",
    "regNumber": "MH04 AZ 7733",
    "make": "Tata",
    "model": "Nexon EV"
  },
  "socStart": 20,
  "socTarget": 80,
  "estEnergyKwh": 26.41,
  "estCost": 607.5,
  "holdExpiresAt": null,
  "checkedInAt": null,
  "cancelledAt": null,
  "cancelReason": null,
  "createdAt": "2026-10-03T09:30:00",
  "payment": {
    "amount": 607.5,
    "method": "WALLET",
    "status": "PAID",
    "invoiceNo": "INV-2026-009201",
    "refundedAmount": 0.0
  },
  "session": {
    "startedAt": "2026-10-04T10:00:00",
    "endedAt": "2026-10-04T10:32:00",
    "energyKwh": 26.41,
    "socEnd": 80,
    "amount": 607.5,
    "co2AvoidedKg": 22.2
  },
  "canCancel": false,
  "canCheckIn": false,
  "refundIfCancelled": 0.0,
  "qrPayload": "VSL-7K2M9X"
}
```

### GET /api/bookings

Auth: **Bearer (any role)** | Success: **200**

Example URL: `/api/bookings?status=CONFIRMED&upcoming=true&page=0&size=10`

Own bookings. `upcoming=true` upcoming/in progress, `false` past only.

Response 200:

```json
{
  "content": [
    {
      "id": 9543,
      "bookingCode": "VSL-7K2M9X",
      "status": "CONFIRMED",
      "source": "WEB",
      "startTime": "2026-10-04T10:00:00",
      "endTime": "2026-10-04T10:30:00",
      "slots": 1,
      "station": {
        "id": 3,
        "name": "AmpereHub Thane West Hub – Ghodbunder Rd",
        "zone": "Thane West",
        "address": "Ghodbunder Rd, Thane West",
        "latitude": 19.2183,
        "longitude": 72.9781
      },
      "point": {
        "id": 13,
        "label": "DC-1",
        "connectorCode": "CCS2",
        "powerKw": 120.0,
        "tariffPerKwh": 23.0
      },
      "vehicle": {
        "id": 1,
        "nickname": "Nexon",
        "regNumber": "MH04 AZ 7733",
        "make": "Tata",
        "model": "Nexon EV"
      },
      "socStart": 20,
      "socTarget": 80,
      "estEnergyKwh": 26.41,
      "estCost": 607.5,
      "holdExpiresAt": "2026-10-03T09:35:00",
      "checkedInAt": null,
      "cancelledAt": null,
      "cancelReason": null,
      "createdAt": "2026-10-03T09:30:00",
      "payment": {
        "amount": 607.5,
        "method": "WALLET",
        "status": "PAID",
        "invoiceNo": "INV-2026-009201",
        "refundedAmount": 0.0
      },
      "session": null,
      "canCancel": true,
      "canCheckIn": false,
      "refundIfCancelled": 0.0,
      "qrPayload": "VSL-7K2M9X"
    }
  ],
  "page": 0,
  "size": 10,
  "totalElements": 1,
  "totalPages": 1
}
```

### GET /api/bookings/{id}

Auth: **Bearer (any role)** | Success: **200**

Response 200:

```json
{
  "id": 9543,
  "bookingCode": "VSL-7K2M9X",
  "status": "CONFIRMED",
  "source": "WEB",
  "startTime": "2026-10-04T10:00:00",
  "endTime": "2026-10-04T10:30:00",
  "slots": 1,
  "station": {
    "id": 3,
    "name": "AmpereHub Thane West Hub – Ghodbunder Rd",
    "zone": "Thane West",
    "address": "Ghodbunder Rd, Thane West",
    "latitude": 19.2183,
    "longitude": 72.9781
  },
  "point": {
    "id": 13,
    "label": "DC-1",
    "connectorCode": "CCS2",
    "powerKw": 120.0,
    "tariffPerKwh": 23.0
  },
  "vehicle": {
    "id": 1,
    "nickname": "Nexon",
    "regNumber": "MH04 AZ 7733",
    "make": "Tata",
    "model": "Nexon EV"
  },
  "socStart": 20,
  "socTarget": 80,
  "estEnergyKwh": 26.41,
  "estCost": 607.5,
  "holdExpiresAt": "2026-10-03T09:35:00",
  "checkedInAt": null,
  "cancelledAt": null,
  "cancelReason": null,
  "createdAt": "2026-10-03T09:30:00",
  "payment": {
    "amount": 607.5,
    "method": "WALLET",
    "status": "PAID",
    "invoiceNo": "INV-2026-009201",
    "refundedAmount": 0.0
  },
  "session": null,
  "canCancel": true,
  "canCheckIn": false,
  "refundIfCancelled": 0.0,
  "qrPayload": "VSL-7K2M9X"
}
```

### GET /api/bookings/{id}/invoice

Auth: **Bearer (any role)** | Success: **200**

Only for a paid booking.

Response 200:

```json
{
  "invoiceNo": "INV-2026-009201",
  "bookingCode": "VSL-7K2M9X",
  "issuedAt": "2026-10-03T09:32:00",
  "customerName": "Aarav Mehta",
  "stationName": "AmpereHub Thane West Hub – Ghodbunder Rd",
  "stationAddress": "Ghodbunder Rd, Thane West",
  "vehicle": "Tata Nexon EV MH04 AZ 7733",
  "connector": "CCS2",
  "energyKwh": 26.41,
  "effectiveTariff": 23.0,
  "amount": 607.5,
  "refundedAmount": 0.0,
  "method": "WALLET",
  "status": "PAID"
}
```

## 4.10 Wallet

### GET /api/wallet

Auth: **Bearer (any role)** | Success: **200**

Five most recent transactions.

Response 200:

```json
{
  "balance": 2450.0,
  "recent": [
    {
      "id": 8927,
      "type": "TOPUP",
      "amount": 5000.0,
      "balanceAfter": 7450.0,
      "reference": "TOPUP UPI",
      "createdAt": "2026-10-03T09:31:00"
    }
  ]
}
```

### GET /api/wallet/transactions

Auth: **Bearer (any role)** | Success: **200**

Example URL: `/api/wallet/transactions?page=0&size=20`

Response 200:

```json
{
  "content": [
    {
      "id": 8927,
      "type": "TOPUP",
      "amount": 5000.0,
      "balanceAfter": 7450.0,
      "reference": "TOPUP UPI",
      "createdAt": "2026-10-03T09:31:00"
    }
  ],
  "page": 0,
  "size": 10,
  "totalElements": 1,
  "totalPages": 1
}
```

### POST /api/wallet/topup

Auth: **Bearer (any role)** | Success: **200**

Amount 100 to 50,000 (simulated payment).

Request body:

```json
{
  "amount": 5000,
  "method": "UPI"
}
```

Response 200:

```json
{
  "balance": 7450.0,
  "recent": [
    {
      "id": 8927,
      "type": "TOPUP",
      "amount": 5000.0,
      "balanceAfter": 7450.0,
      "reference": "TOPUP UPI",
      "createdAt": "2026-10-03T09:31:00"
    }
  ]
}
```

## 4.11 Waitlist

### POST /api/waitlist

Auth: **Bearer (any role)** | Success: **201**

`slots` 1-16. When a booking is cancelled/expired, the first matching entry is promoted automatically to a HOLD (10 min to pay) and notified.

Request body:

```json
{
  "vehicleId": 1,
  "stationId": 3,
  "desiredStart": "2026-10-04T18:00:00",
  "slots": 2
}
```

Response 201:

```json
{
  "id": 26,
  "station": {
    "id": 3,
    "name": "AmpereHub Thane West Hub – Ghodbunder Rd"
  },
  "vehicleLabel": "Nexon MH04 AZ 7733",
  "desiredStart": "2026-10-04T18:00:00",
  "slots": 2,
  "status": "WAITING",
  "promotedBookingId": null,
  "createdAt": "2026-10-03T09:30:00"
}
```

### GET /api/waitlist

Auth: **Bearer (any role)** | Success: **200**

Response 200:

```json
[
  {
    "id": 26,
    "station": {
      "id": 3,
      "name": "AmpereHub Thane West Hub – Ghodbunder Rd"
    },
    "vehicleLabel": "Nexon MH04 AZ 7733",
    "desiredStart": "2026-10-04T18:00:00",
    "slots": 2,
    "status": "WAITING",
    "promotedBookingId": null,
    "createdAt": "2026-10-03T09:30:00"
  }
]
```

### DELETE /api/waitlist/{id}

Auth: **Bearer (any role)** | Success: **204**

Response: empty body.

## 4.12 Notifications

### GET /api/notifications

Auth: **Bearer (any role)** | Success: **200**

Example URL: `/api/notifications?unreadOnly=false&page=0&size=20`

Response 200:

```json
{
  "content": [
    {
      "id": 101,
      "type": "RECHARGE_REMINDER",
      "title": "Time to charge your Nexon",
      "message": "You usually charge about now.",
      "payload": "{\"vehicleId\":1}",
      "read": false,
      "status": "ACTIVE",
      "createdAt": "2026-10-03T09:30:00"
    }
  ],
  "page": 0,
  "size": 10,
  "totalElements": 1,
  "totalPages": 1
}
```

### GET /api/notifications/unread-count

Auth: **Bearer (any role)** | Success: **200**

Response 200:

```json
{
  "count": 3
}
```

### POST /api/notifications/{id}/read

Auth: **Bearer (any role)** | Success: **200**

Response 200:

```json
{
  "id": 101,
  "type": "RECHARGE_REMINDER",
  "title": "Time to charge your Nexon",
  "message": "You usually charge about now.",
  "payload": "{\"vehicleId\":1}",
  "read": true,
  "status": "ACTIVE",
  "createdAt": "2026-10-03T09:30:00"
}
```

### POST /api/notifications/read-all

Auth: **Bearer (any role)** | Success: **200**

Response 200:

```json
{
  "updated": 3
}
```

## 4.13 Reminders

### GET /api/reminders/predictions

Auth: **Bearer (any role)** | Success: **200**

`state`: UPCOMING, DUE_SOON, OVERDUE, NO_DATA (fewer than 3 sessions).

Response 200:

```json
[
  {
    "vehicleId": 1,
    "vehicleLabel": "Nexon MH04 AZ 7733",
    "state": "DUE_SOON",
    "lastChargeAt": "2026-09-27T19:40:00",
    "medianIntervalDays": 6.05,
    "avgEnergyKwh": 24.8,
    "preferredHour": 20,
    "preferredStationId": 3,
    "preferredStationName": "AmpereHub Thane West Hub – Ghodbunder Rd",
    "sessionsUsed": 7,
    "confidence": 0.95,
    "nextDueAt": "2026-10-03T20:52:00",
    "hoursUntilDue": 11.4,
    "cadenceHistory": [
      {
        "date": "2026-09-27",
        "intervalDays": 6.3
      }
    ],
    "suggestion": null
  }
]
```

### GET /api/reminders/active

Auth: **Bearer (any role)** | Success: **200**

The pop-up shown after login. Each reminder carries a fresh slot suggestion.

Response 200:

```json
[
  {
    "notificationId": 101,
    "vehicle": {
      "id": 1,
      "label": "Nexon MH04 AZ 7733",
      "make": "Tata",
      "model": "Nexon EV"
    },
    "dueAt": "2026-10-03T20:52:00",
    "hoursUntilDue": 11.4,
    "overdue": false,
    "headline": "Time to charge your Nexon",
    "message": "You usually charge every 6 days.",
    "confidence": 0.95,
    "medianIntervalDays": 6.05,
    "lastChargeAt": "2026-09-27T19:40:00",
    "suggestion": {
      "stationId": 3,
      "stationName": "AmpereHub Thane West Hub – Ghodbunder Rd",
      "zone": "Thane West",
      "pointId": 13,
      "connectorCode": "CCS2",
      "slotStart": "2026-10-03T20:00:00",
      "slotEnd": "2026-10-03T20:30:00",
      "crowdingLevel": "LOW",
      "crowdingIndex": 22.0,
      "estimatedCost": 450.2,
      "chargeMinutes": 38,
      "distanceKm": 1.4,
      "reason": "Off-peak price and low crowding near home"
    }
  }
]
```

### POST /api/reminders/{notificationId}/snooze

Auth: **Bearer (any role)** | Success: **200**

`hours` 1-168.

Request body:

```json
{
  "hours": 4
}
```

Response 200:

```json
{
  "message": "Reminder snoozed for 4 hours"
}
```

### POST /api/reminders/{notificationId}/dismiss

Auth: **Bearer (any role)** | Success: **200**

Response 200:

```json
{
  "message": "Reminder dismissed"
}
```

### POST /api/reminders/{notificationId}/book

Auth: **Bearer (any role)** | Success: **201**

Books the suggested slot as a HOLD with source REMINDER; pay with `/api/bookings/{id}/confirm`.

Response 201:

```json
{
  "id": 9543,
  "bookingCode": "VSL-7K2M9X",
  "status": "HOLD",
  "source": "REMINDER",
  "startTime": "2026-10-04T10:00:00",
  "endTime": "2026-10-04T10:30:00",
  "slots": 1,
  "station": {
    "id": 3,
    "name": "AmpereHub Thane West Hub – Ghodbunder Rd",
    "zone": "Thane West",
    "address": "Ghodbunder Rd, Thane West",
    "latitude": 19.2183,
    "longitude": 72.9781
  },
  "point": {
    "id": 13,
    "label": "DC-1",
    "connectorCode": "CCS2",
    "powerKw": 120.0,
    "tariffPerKwh": 23.0
  },
  "vehicle": {
    "id": 1,
    "nickname": "Nexon",
    "regNumber": "MH04 AZ 7733",
    "make": "Tata",
    "model": "Nexon EV"
  },
  "socStart": 20,
  "socTarget": 80,
  "estEnergyKwh": 26.41,
  "estCost": 607.5,
  "holdExpiresAt": "2026-10-03T09:35:00",
  "checkedInAt": null,
  "cancelledAt": null,
  "cancelReason": null,
  "createdAt": "2026-10-03T09:30:00",
  "payment": null,
  "session": null,
  "canCancel": true,
  "canCheckIn": false,
  "refundIfCancelled": 0.0,
  "qrPayload": "VSL-7K2M9X"
}
```

### POST /api/reminders/refresh

Auth: **Bearer (any role)** | Success: **200**

Response 200:

```json
{
  "active": 1
}
```

### POST /api/reminders/demo-trigger

Auth: **Bearer (any role)** | Success: **200**

Demo only: 404 unless `app.demo-mode=true`.

Request body:

```json
{
  "vehicleId": 1
}
```

Response 200:

```json
{
  "message": "Reminder triggered"
}
```

## 4.14 Fleet

### GET /api/fleet/overview

Auth: **FLEET_MANAGER, ADMIN** | Success: **200**

Response 200:

```json
{
  "fleetId": 1,
  "fleetName": "SwiftLogix Deliveries",
  "vehicleCount": 12,
  "upcomingBookings": 4,
  "sessions30d": 210,
  "energy30dKwh": 2890.4,
  "spend30d": 41250.75,
  "vehicles": [
    {
      "vehicle": {
        "id": 652,
        "modelId": 1,
        "make": "Tata",
        "model": "Nexon EV",
        "variant": "Long Range",
        "category": "CAR",
        "batteryKwh": 40.5,
        "acMaxKw": 7.2,
        "dcMaxKw": 50.0,
        "rangeKm": 330,
        "kmPerKwh": 7.0,
        "connectorCodes": [
          "CCS2",
          "TYPE2"
        ],
        "regNumber": "MH04 AZ 7733",
        "nickname": "Nexon",
        "avgDailyKm": 48,
        "fleetId": 1
      },
      "lastChargeAt": "2026-10-02T22:00:00",
      "nextDueAt": "2026-10-04T06:00:00",
      "predictionState": "UPCOMING",
      "upcomingBookingCode": null,
      "upcomingStart": null,
      "upcomingStation": null
    }
  ]
}
```

### POST /api/fleet/schedule

Auth: **FLEET_MANAGER, ADMIN** | Success: **200**

Proposal only, nothing is booked.

Request body:

```json
{
  "vehicleIds": [
    652,
    653,
    654
  ],
  "windowStart": "2026-10-03T22:00:00",
  "windowEnd": "2026-10-04T06:00:00",
  "startLat": 19.2183,
  "startLon": 72.9781,
  "socStart": 25,
  "socTarget": 90,
  "preset": "CHEAPEST",
  "maxPerStation": 2
}
```

Response 200:

```json
{
  "plan": [
    {
      "vehicleId": 652,
      "vehicleLabel": "Ace EV MH43 YZ 4399",
      "stationId": 3,
      "stationName": "AmpereHub Thane West Hub – Ghodbunder Rd",
      "pointId": 13,
      "pointLabel": "DC-1",
      "connectorCode": "CCS2",
      "slotStart": "2026-10-04T01:00:00",
      "slotEnd": "2026-10-04T02:00:00",
      "socStart": 25,
      "socTarget": 90,
      "estimatedCost": 310.4,
      "waitMinutes": 0,
      "reason": "Off-peak slot, no queue"
    }
  ],
  "unassigned": [
    {
      "vehicleId": 654,
      "vehicleLabel": "Ace EV MH43 NN 1659",
      "reason": "No free compatible slot in the window"
    }
  ],
  "totalCost": 310.4,
  "avgWaitMinutes": 0.0,
  "stationsUsed": 1
}
```

### POST /api/fleet/schedule/apply

Auth: **FLEET_MANAGER, ADMIN** | Success: **200**

Hold + wallet payment per item; failures are reported per item (HTTP 200).

Request body:

```json
{
  "items": [
    {
      "vehicleId": 652,
      "pointId": 13,
      "slotStart": "2026-10-04T01:00:00",
      "socStart": 25,
      "socTarget": 90
    }
  ]
}
```

Response 200:

```json
{
  "created": [
    {
      "id": 9543,
      "bookingCode": "VSL-7K2M9X",
      "status": "CONFIRMED",
      "source": "FLEET",
      "startTime": "2026-10-04T10:00:00",
      "endTime": "2026-10-04T10:30:00",
      "slots": 1,
      "station": {
        "id": 3,
        "name": "AmpereHub Thane West Hub – Ghodbunder Rd",
        "zone": "Thane West",
        "address": "Ghodbunder Rd, Thane West",
        "latitude": 19.2183,
        "longitude": 72.9781
      },
      "point": {
        "id": 13,
        "label": "DC-1",
        "connectorCode": "CCS2",
        "powerKw": 120.0,
        "tariffPerKwh": 23.0
      },
      "vehicle": {
        "id": 1,
        "nickname": "Nexon",
        "regNumber": "MH04 AZ 7733",
        "make": "Tata",
        "model": "Nexon EV"
      },
      "socStart": 20,
      "socTarget": 80,
      "estEnergyKwh": 26.41,
      "estCost": 607.5,
      "holdExpiresAt": "2026-10-03T09:35:00",
      "checkedInAt": null,
      "cancelledAt": null,
      "cancelReason": null,
      "createdAt": "2026-10-03T09:30:00",
      "payment": {
        "amount": 607.5,
        "method": "WALLET",
        "status": "PAID",
        "invoiceNo": "INV-2026-009201",
        "refundedAmount": 0.0
      },
      "session": null,
      "canCancel": true,
      "canCheckIn": false,
      "refundIfCancelled": 0.0,
      "qrPayload": "VSL-7K2M9X"
    }
  ],
  "failures": []
}
```

## 4.15 Operator

### GET /api/operator/dashboard

Auth: **OPERATOR, ADMIN** | Success: **200**

Response 200:

```json
{
  "operatorName": "VoltGrid",
  "stations": 4,
  "points": 22,
  "activePoints": 21,
  "bookingsToday": 37,
  "inProgress": 5,
  "upcomingToday": 12,
  "revenueToday": 18450.5,
  "energyTodayKwh": 1020.3,
  "stationsLive": [
    {
      "stationId": 1,
      "name": "VoltGrid BKC Hub – G Block",
      "totalPoints": 6,
      "activePoints": 6,
      "busyNow": 2,
      "crowdingIndexNow": 38.0,
      "crowdingLevelNow": "MEDIUM"
    }
  ]
}
```

### GET /api/operator/stations

Auth: **OPERATOR, ADMIN** | Success: **200**

ADMIN sees all stations.

Response 200:

```json
[
  {
    "id": 3,
    "name": "AmpereHub Thane West Hub – Ghodbunder Rd",
    "address": "Ghodbunder Rd, Thane West",
    "zone": "Thane West",
    "city": "Thane",
    "latitude": 19.2183,
    "longitude": 72.9781,
    "tier": "HUB",
    "operatorId": 3,
    "operatorName": "AmpereHub",
    "distanceKm": 1.4,
    "connectors": [
      {
        "code": "CCS2",
        "count": 3,
        "maxKw": 120.0
      },
      {
        "code": "TYPE2",
        "count": 1,
        "maxKw": 7.4
      }
    ],
    "totalPoints": 6,
    "activePoints": 6,
    "minTariff": 9.0,
    "avgRating": 4.3,
    "reviewCount": 88,
    "reliabilityScore": 84.2,
    "sentimentLabel": "POSITIVE",
    "openNow": true,
    "openHour": 0,
    "closeHour": 24,
    "freeNowPoints": 4,
    "crowdingIndexNow": 42.5,
    "crowdingLevelNow": "MEDIUM"
  }
]
```

### POST /api/operator/stations

Auth: **OPERATOR, ADMIN** | Success: **201**

`operatorId` only used by ADMIN.

Request body:

```json
{
  "name": "VoltGrid Andheri Plaza",
  "address": "Link Road, Andheri West",
  "zone": "Andheri East",
  "city": "Mumbai",
  "latitude": 19.1197,
  "longitude": 72.8468,
  "tier": "STANDARD",
  "openHour": 6,
  "closeHour": 23,
  "status": "ACTIVE",
  "amenityIds": [
    1,
    2
  ],
  "operatorId": null
}
```

Response 201:

```json
{
  "summary": {
    "id": 33,
    "name": "VoltGrid Andheri Plaza",
    "address": "Ghodbunder Rd, Thane West",
    "zone": "Thane West",
    "city": "Thane",
    "latitude": 19.2183,
    "longitude": 72.9781,
    "tier": "HUB",
    "operatorId": 3,
    "operatorName": "AmpereHub",
    "distanceKm": 1.4,
    "connectors": [
      {
        "code": "CCS2",
        "count": 3,
        "maxKw": 120.0
      },
      {
        "code": "TYPE2",
        "count": 1,
        "maxKw": 7.4
      }
    ],
    "totalPoints": 6,
    "activePoints": 6,
    "minTariff": 9.0,
    "avgRating": 4.3,
    "reviewCount": 88,
    "reliabilityScore": 84.2,
    "sentimentLabel": "POSITIVE",
    "openNow": true,
    "openHour": 0,
    "closeHour": 24,
    "freeNowPoints": 4,
    "crowdingIndexNow": 42.5,
    "crowdingLevelNow": "MEDIUM"
  },
  "amenities": [],
  "points": [],
  "ratingBreakdown": {},
  "sentiment": {
    "positivePct": 0,
    "neutralPct": 0,
    "negativePct": 0
  },
  "uptimePct": 97.0
}
```

### PUT /api/operator/stations/{id}

Auth: **OPERATOR, ADMIN** | Success: **200**

Own stations only (403 otherwise).

Request body:

```json
{
  "name": "VoltGrid Andheri Plaza",
  "address": "Link Road, Andheri West",
  "zone": "Andheri East",
  "city": "Mumbai",
  "latitude": 19.1197,
  "longitude": 72.8468,
  "tier": "STANDARD",
  "openHour": 6,
  "closeHour": 24,
  "status": "ACTIVE",
  "amenityIds": [
    1,
    2
  ],
  "operatorId": null
}
```

Response 200:

```json
{
  "summary": {
    "id": 33,
    "name": "AmpereHub Thane West Hub – Ghodbunder Rd",
    "address": "Ghodbunder Rd, Thane West",
    "zone": "Thane West",
    "city": "Thane",
    "latitude": 19.2183,
    "longitude": 72.9781,
    "tier": "HUB",
    "operatorId": 3,
    "operatorName": "AmpereHub",
    "distanceKm": 1.4,
    "connectors": [
      {
        "code": "CCS2",
        "count": 3,
        "maxKw": 120.0
      },
      {
        "code": "TYPE2",
        "count": 1,
        "maxKw": 7.4
      }
    ],
    "totalPoints": 6,
    "activePoints": 6,
    "minTariff": 9.0,
    "avgRating": 4.3,
    "reviewCount": 88,
    "reliabilityScore": 84.2,
    "sentimentLabel": "POSITIVE",
    "openNow": true,
    "openHour": 0,
    "closeHour": 24,
    "freeNowPoints": 4,
    "crowdingIndexNow": 42.5,
    "crowdingLevelNow": "MEDIUM"
  },
  "amenities": [],
  "points": [],
  "ratingBreakdown": {},
  "sentiment": {
    "positivePct": 0,
    "neutralPct": 0,
    "negativePct": 0
  },
  "uptimePct": 97.0
}
```

### DELETE /api/operator/stations/{id}

Auth: **OPERATOR, ADMIN** | Success: **204**

Soft delete (INACTIVE); 409 while future bookings exist.

Response: empty body.

### POST /api/operator/stations/{id}/points

Auth: **OPERATOR, ADMIN** | Success: **201**

Request body:

```json
{
  "label": "DC-7",
  "connectorTypeId": 1,
  "powerKw": 60,
  "tariffPerKwh": 18.5,
  "status": "ACTIVE"
}
```

Response 201:

```json
{
  "id": 104,
  "label": "DC-7",
  "connectorCode": "CCS2",
  "connectorName": "CCS Combo 2",
  "currentType": "DC",
  "powerKw": 60.0,
  "tariffPerKwh": 18.5,
  "status": "ACTIVE"
}
```

### PUT /api/operator/points/{id}

Auth: **OPERATOR, ADMIN** | Success: **200**

Request body:

```json
{
  "label": "DC-7",
  "connectorTypeId": 1,
  "powerKw": 60,
  "tariffPerKwh": 19.0,
  "status": "ACTIVE"
}
```

Response 200:

```json
{
  "id": 104,
  "label": "DC-1",
  "connectorCode": "CCS2",
  "connectorName": "CCS Combo 2",
  "currentType": "DC",
  "powerKw": 120.0,
  "tariffPerKwh": 19.0,
  "status": "ACTIVE"
}
```

### DELETE /api/operator/points/{id}

Auth: **OPERATOR, ADMIN** | Success: **204**

409 when the point has bookings.

Response: empty body.

### PUT /api/operator/points/{id}/status

Auth: **OPERATOR, ADMIN** | Success: **200**

ACTIVE, MAINTENANCE, OFFLINE.

Request body:

```json
{
  "status": "MAINTENANCE"
}
```

Response 200:

```json
{
  "id": 13,
  "label": "DC-1",
  "connectorCode": "CCS2",
  "connectorName": "CCS Combo 2",
  "currentType": "DC",
  "powerKw": 120.0,
  "tariffPerKwh": 23.0,
  "status": "MAINTENANCE"
}
```

### GET /api/operator/stations/{id}/schedule

Auth: **OPERATOR, ADMIN** | Success: **200**

Example URL: `/api/operator/stations/{id}/schedule?date=2026-10-03`

Response 200:

```json
{
  "stationId": 1,
  "stationName": "VoltGrid BKC Hub – G Block",
  "date": "2026-10-03",
  "points": [
    {
      "pointId": 1,
      "label": "DC-1",
      "connectorCode": "CCS2",
      "powerKw": 120.0,
      "status": "ACTIVE",
      "bookings": [
        {
          "bookingId": 9500,
          "bookingCode": "VSL-A1B2C3",
          "status": "CONFIRMED",
          "start": "2026-10-03T10:00:00",
          "end": "2026-10-03T10:30:00",
          "vehicle": "Tata Nexon EV",
          "userName": "Aarav Mehta",
          "source": "WEB"
        }
      ]
    }
  ]
}
```

### POST /api/operator/walk-ins

Auth: **OPERATOR, ADMIN** | Success: **201**

Creates a COMPLETED booking with session and payment.

Request body:

```json
{
  "chargingPointId": 1,
  "vehicleRegNumber": "MH04 AZ 7733",
  "startTime": "2026-10-03T09:00:00",
  "durationMinutes": 60,
  "energyKwh": 30.0
}
```

Response 201:

```json
{
  "id": 9543,
  "bookingCode": "VSL-7K2M9X",
  "status": "COMPLETED",
  "source": "WALK_IN",
  "startTime": "2026-10-04T10:00:00",
  "endTime": "2026-10-04T10:30:00",
  "slots": 1,
  "station": {
    "id": 3,
    "name": "AmpereHub Thane West Hub – Ghodbunder Rd",
    "zone": "Thane West",
    "address": "Ghodbunder Rd, Thane West",
    "latitude": 19.2183,
    "longitude": 72.9781
  },
  "point": {
    "id": 13,
    "label": "DC-1",
    "connectorCode": "CCS2",
    "powerKw": 120.0,
    "tariffPerKwh": 23.0
  },
  "vehicle": {
    "id": 1,
    "nickname": "Nexon",
    "regNumber": "MH04 AZ 7733",
    "make": "Tata",
    "model": "Nexon EV"
  },
  "socStart": 20,
  "socTarget": 80,
  "estEnergyKwh": 26.41,
  "estCost": 607.5,
  "holdExpiresAt": "2026-10-03T09:35:00",
  "checkedInAt": null,
  "cancelledAt": null,
  "cancelReason": null,
  "createdAt": "2026-10-03T09:30:00",
  "payment": {
    "amount": 607.5,
    "method": "UPI",
    "status": "PAID",
    "invoiceNo": "INV-2026-009201",
    "refundedAmount": 0.0
  },
  "session": {
    "startedAt": "2026-10-04T10:00:00",
    "endedAt": "2026-10-04T10:32:00",
    "energyKwh": 26.41,
    "socEnd": 80,
    "amount": 607.5,
    "co2AvoidedKg": 22.2
  },
  "canCancel": true,
  "canCheckIn": false,
  "refundIfCancelled": 0.0,
  "qrPayload": "VSL-7K2M9X"
}
```

## 4.16 Admin

### GET /api/admin/users

Auth: **ADMIN** | Success: **200**

Example URL: `/api/admin/users?q=aarav&role=USER&status=ACTIVE&page=0&size=20`

Response 200:

```json
{
  "content": [
    {
      "id": 9,
      "fullName": "Sample User",
      "email": "user9@example.com",
      "role": "USER",
      "status": "ACTIVE",
      "city": "Thane",
      "operatorId": null,
      "operatorName": null,
      "noShowCount": 0,
      "createdAt": "2025-11-02T10:00:00",
      "lastLoginAt": "2026-10-02T18:20:00"
    }
  ],
  "page": 0,
  "size": 10,
  "totalElements": 1,
  "totalPages": 1
}
```

### PUT /api/admin/users/{id}/role

Auth: **ADMIN** | Success: **200**

OPERATOR needs `operatorId`, FLEET_MANAGER needs `fleetId`.

Request body:

```json
{
  "role": "OPERATOR",
  "operatorId": 1,
  "fleetId": null
}
```

Response 200:

```json
{
  "id": 9,
  "fullName": "Sample User",
  "email": "user9@example.com",
  "role": "OPERATOR",
  "status": "ACTIVE",
  "city": "Thane",
  "operatorId": 1,
  "operatorName": "VoltGrid",
  "noShowCount": 0,
  "createdAt": "2025-11-02T10:00:00",
  "lastLoginAt": "2026-10-02T18:20:00"
}
```

### PUT /api/admin/users/{id}/status

Auth: **ADMIN** | Success: **200**

ACTIVE or BLOCKED.

Request body:

```json
{
  "status": "BLOCKED"
}
```

Response 200:

```json
{
  "id": 9,
  "fullName": "Sample User",
  "email": "user9@example.com",
  "role": "USER",
  "status": "BLOCKED",
  "city": "Thane",
  "operatorId": null,
  "operatorName": null,
  "noShowCount": 0,
  "createdAt": "2025-11-02T10:00:00",
  "lastLoginAt": "2026-10-02T18:20:00"
}
```

### GET /api/admin/stats

Auth: **ADMIN** | Success: **200**

Response 200:

```json
{
  "counts": {
    "users": 656,
    "operators": 8,
    "fleets": 6,
    "stations": 32,
    "chargingPoints": 103,
    "vehicles": 701,
    "bookings": 9542,
    "sessions": 7789,
    "reviews": 1718
  },
  "bookingsToday": 41,
  "bookingsLive": 9,
  "now": "2026-10-03T09:30:00",
  "clockMode": "FIXED"
}
```

### POST /api/admin/warehouse/refresh

Auth: **ADMIN** | Success: **200**

Runs `CALL sp_refresh_warehouse()`.

Response 200:

```json
{
  "rows": {
    "dw_dim_date": 457,
    "dw_fact_session": 7789,
    "dw_fact_booking": 9542
  },
  "millis": 850
}
```

### GET /api/admin/clock

Auth: **ADMIN** | Success: **200**

Response 200:

```json
{
  "now": "2026-10-03T09:30:00",
  "mode": "FIXED",
  "anchor": "2026-10-03T09:30:00",
  "offsetSeconds": 0
}
```

### POST /api/admin/clock/advance

Auth: **ADMIN** | Success: **200**

Body optional but needs a positive total (max days is limited). Runs every background job once: holds expire, no-shows, reminders.

Request body:

```json
{
  "days": 0,
  "hours": 1,
  "minutes": 30
}
```

Response 200:

```json
{
  "now": "2026-10-03T11:00:00",
  "mode": "FIXED",
  "anchor": "2026-10-03T09:30:00",
  "offsetSeconds": 5400
}
```

### POST /api/admin/clock/reset

Auth: **ADMIN** | Success: **200**

Response 200:

```json
{
  "now": "2026-10-03T09:30:00",
  "mode": "FIXED",
  "anchor": "2026-10-03T09:30:00",
  "offsetSeconds": 0
}
```

### POST /api/admin/reminders/run-now

Auth: **ADMIN** | Success: **200**

Response 200:

```json
{
  "created": 2
}
```

## 4.17 Analytics

### GET /api/analytics/overview

Auth: **OPERATOR, ADMIN** | Success: **200**

KPI cards with previous-period comparison. Query (all optional): `from`, `to` (yyyy-MM-dd; default last 90 days ending today), `zone`, `connector`, `tier` (HUB/STANDARD), `operatorId` (ignored for OPERATOR: restricted to own operator).

Response 200:

```json
{
  "from": "2026-07-06",
  "to": "2026-10-03",
  "kpis": {
    "sessions": 7789,
    "energyKwh": 182340.5,
    "revenue": 2830000.0,
    "avgSessionKwh": 23.4,
    "avgDurationMin": 41.2,
    "utilizationPct": 11.8,
    "uniqueUsers": 512,
    "bookings": 9542,
    "cancellationRatePct": 7.6,
    "noShowRatePct": 4.8,
    "co2AvoidedKg": 150200.0,
    "avgLeadHours": 18.4,
    "peakHour": 19
  },
  "previous": {
    "sessions": 7789,
    "energyKwh": 182340.5,
    "revenue": 2830000.0,
    "avgSessionKwh": 23.4,
    "avgDurationMin": 41.2,
    "utilizationPct": 11.8,
    "uniqueUsers": 512,
    "bookings": 9542,
    "cancellationRatePct": 7.6,
    "noShowRatePct": 4.8,
    "co2AvoidedKg": 150200.0,
    "avgLeadHours": 18.4,
    "peakHour": 19
  },
  "deltaPct": {
    "sessions": 4.2,
    "revenue": 6.1
  },
  "sparkline": [
    {
      "date": "2026-10-02",
      "sessions": 24,
      "revenue": 9200.0,
      "energyKwh": 560.2
    }
  ]
}
```

### GET /api/analytics/trend

Auth: **OPERATOR, ADMIN** | Success: **200**

Example URL: `/api/analytics/trend?granularity=DAY`

Sessions/energy/revenue series, 14-day Holt-Winters forecast and anomalies. `granularity`: DAY, WEEK, MONTH. Query (all optional): `from`, `to` (yyyy-MM-dd; default last 90 days ending today), `zone`, `connector`, `tier` (HUB/STANDARD), `operatorId` (ignored for OPERATOR: restricted to own operator).

Response 200:

```json
{
  "granularity": "DAY",
  "forecastMethod": "Holt-Winters",
  "series": [
    {
      "period": "2026-10-02",
      "sessions": 24,
      "energyKwh": 560.2,
      "revenue": 9200.0,
      "avgTariff": 16.4
    }
  ],
  "forecast": [
    {
      "date": "2026-10-04",
      "predicted": 27.1,
      "lower": 18.0,
      "upper": 36.2
    }
  ],
  "anomalies": [
    {
      "date": "2026-08-15",
      "value": 48,
      "expected": 26.0,
      "zScore": 3.1,
      "reason": "Public holiday"
    }
  ]
}
```

### GET /api/analytics/heatmap

Auth: **OPERATOR, ADMIN** | Success: **200**

Example URL: `/api/analytics/heatmap?metric=sessions&stationId=3`

Weekday x hour heat-map, always 168 cells. `metric`: sessions or revenue; optional `stationId`. Query (all optional): `from`, `to` (yyyy-MM-dd; default last 90 days ending today), `zone`, `connector`, `tier` (HUB/STANDARD), `operatorId` (ignored for OPERATOR: restricted to own operator).

Response 200:

```json
[
  {
    "dayOfWeek": 1,
    "hour": 18,
    "value": 112.0
  }
]
```

### GET /api/analytics/zones

Auth: **OPERATOR, ADMIN** | Success: **200**

Per-zone performance. Query (all optional): `from`, `to` (yyyy-MM-dd; default last 90 days ending today), `zone`, `connector`, `tier` (HUB/STANDARD), `operatorId` (ignored for OPERATOR: restricted to own operator).

Response 200:

```json
[
  {
    "zone": "BKC",
    "stations": 1,
    "points": 6,
    "latitude": 19.07,
    "longitude": 72.87,
    "sessions": 900,
    "energyKwh": 21000.0,
    "revenue": 340000.0,
    "avgRevenuePerSession": 377.8,
    "sharePct": 11.5,
    "utilizationPct": 18.2,
    "growthPct": 6.4
  }
]
```

### GET /api/analytics/mix

Auth: **OPERATOR, ADMIN** | Success: **200**

Example URL: `/api/analytics/mix?by=connector`

Share of sessions. `by`: connector, vehicleCategory, payment, source, tier, dayPart. Query (all optional): `from`, `to` (yyyy-MM-dd; default last 90 days ending today), `zone`, `connector`, `tier` (HUB/STANDARD), `operatorId` (ignored for OPERATOR: restricted to own operator).

Response 200:

```json
[
  {
    "label": "CCS2",
    "sessions": 5200,
    "sharePct": 66.8,
    "energyKwh": 140000.0,
    "revenue": 2100000.0
  }
]
```

### GET /api/analytics/funnel

Auth: **OPERATOR, ADMIN** | Success: **200**

Funnel SEARCH, VIEW_STATION, SELECT_SLOT, BOOK, CHECK_IN, COMPLETE. Query (all optional): `from`, `to` (yyyy-MM-dd; default last 90 days ending today), `zone`, `connector`, `tier` (HUB/STANDARD), `operatorId` (ignored for OPERATOR: restricted to own operator).

Response 200:

```json
[
  {
    "stageNo": 1,
    "stage": "SEARCH",
    "sessions": 15000,
    "pctOfFirst": 100.0,
    "stepConversionPct": null,
    "dropOffPct": 0.0
  },
  {
    "stageNo": 2,
    "stage": "VIEW_STATION",
    "sessions": 9800,
    "pctOfFirst": 65.3,
    "stepConversionPct": 65.3,
    "dropOffPct": 34.7
  }
]
```

### GET /api/analytics/segments

Auth: **OPERATOR, ADMIN** | Success: **200**

K-Means customer segments. Query (all optional): `from`, `to` (yyyy-MM-dd; default last 90 days ending today), `zone`, `connector`, `tier` (HUB/STANDARD), `operatorId` (ignored for OPERATOR: restricted to own operator).

Response 200:

```json
[
  {
    "segment": "Daily Commuters",
    "users": 80,
    "sessions": 2100,
    "energyKwh": 52000.0,
    "revenue": 926000.0,
    "revenuePerUser": 11587.6,
    "sharePct": 24.0,
    "avgSessionsPerUser": 26.5,
    "nightSharePct": 1.0,
    "weekendSharePct": 10.0
  }
]
```

### GET /api/analytics/stations

Auth: **OPERATOR, ADMIN** | Success: **200**

Example URL: `/api/analytics/stations?sort=revenue&order=desc&limit=10`

Station leaderboard. `sort`: sessions, revenue, energy, utilization, sessionsPerPoint, rating, reliability. Query (all optional): `from`, `to` (yyyy-MM-dd; default last 90 days ending today), `zone`, `connector`, `tier` (HUB/STANDARD), `operatorId` (ignored for OPERATOR: restricted to own operator).

Response 200:

```json
[
  {
    "stationId": 1,
    "name": "VoltGrid BKC Hub – G Block",
    "zone": "BKC",
    "operatorName": "VoltGrid",
    "tier": "HUB",
    "points": 6,
    "sessions": 900,
    "energyKwh": 21000.0,
    "revenue": 340000.0,
    "avgDurationMin": 40.1,
    "utilizationPct": 18.2,
    "sessionsPerPoint": 150.0,
    "avgRating": 4.3,
    "reliabilityScore": 84.2,
    "uptimePct": 97.2,
    "clusterLabel": "High-demand hub",
    "recommendation": "Add capacity or shift demand to off-peak."
  }
]
```

### GET /api/analytics/sentiment

Auth: **OPERATOR, ADMIN** | Success: **200**

Review sentiment overview. Query (all optional): `from`, `to` (yyyy-MM-dd; default last 90 days ending today), `zone`, `connector`, `tier` (HUB/STANDARD), `operatorId` (ignored for OPERATOR: restricted to own operator).

Response 200:

```json
{
  "reviews": 1718,
  "avgRating": 4.1,
  "avgSentiment": 0.21,
  "labels": [
    {
      "label": "POSITIVE",
      "count": 1179,
      "pct": 68.6
    }
  ],
  "positiveKeywords": [
    {
      "word": "fast",
      "freq": 310
    }
  ],
  "negativeKeywords": [
    {
      "word": "queue",
      "freq": 92
    }
  ],
  "worstStations": [
    {
      "stationId": 9,
      "name": "...",
      "zone": "Worli",
      "reviews": 40,
      "avgRating": 3.1,
      "avgSentiment": -0.05,
      "negativePct": 32.0
    }
  ],
  "bestStations": [],
  "monthly": [
    {
      "month": "2026-09",
      "reviews": 150,
      "avgRating": 4.2,
      "avgSentiment": 0.24
    }
  ]
}
```

### GET /api/analytics/weather-impact

Auth: **OPERATOR, ADMIN** | Success: **200**

Effect of rain, holidays and weekends on daily sessions. Query (all optional): `from`, `to` (yyyy-MM-dd; default last 90 days ending today), `zone`, `connector`, `tier` (HUB/STANDARD), `operatorId` (ignored for OPERATOR: restricted to own operator).

Response 200:

```json
{
  "byCondition": [
    {
      "condition": "HEAVY_RAIN",
      "days": 18,
      "avgSessionsPerDay": 17.5,
      "avgRevenuePerDay": 6400.0,
      "adjustedImpactPct": -22.0
    }
  ],
  "byDayType": [],
  "rainImpactPct": -9.0,
  "heavyRainImpactPct": -22.0,
  "holidayImpactPct": -14.0,
  "weekendImpactPct": 8.0,
  "method": "Ratio to local baseline"
}
```

### GET /api/analytics/cohorts

Auth: **OPERATOR, ADMIN** | Success: **200**

Retention cohorts by month of first session (flat heat-map cells). Query (all optional): `from`, `to` (yyyy-MM-dd; default last 90 days ending today), `zone`, `connector`, `tier` (HUB/STANDARD), `operatorId` (ignored for OPERATOR: restricted to own operator).

Response 200:

```json
[
  {
    "cohort": "2025-11",
    "cohortSize": 60,
    "monthOffset": 1,
    "activeUsers": 41,
    "retentionPct": 68.3
  }
]
```

### GET /api/analytics/lead-time

Auth: **OPERATOR, ADMIN** | Success: **200**

Booking lead-time buckets with cancellation and no-show rates. Query (all optional): `from`, `to` (yyyy-MM-dd; default last 90 days ending today), `zone`, `connector`, `tier` (HUB/STANDARD), `operatorId` (ignored for OPERATOR: restricted to own operator).

Response 200:

```json
[
  {
    "order": 1,
    "bucket": "< 1 h",
    "bookings": 1200,
    "sharePct": 12.6,
    "avgRevenue": 310.0,
    "cancellationRatePct": 3.0,
    "noShowRatePct": 2.5
  }
]
```

### GET /api/analytics/insights

Auth: **OPERATOR, ADMIN** | Success: **200**

Rule-based plain-English insights. Query (all optional): `from`, `to` (yyyy-MM-dd; default last 90 days ending today), `zone`, `connector`, `tier` (HUB/STANDARD), `operatorId` (ignored for OPERATOR: restricted to own operator).

Response 200:

```json
[
  {
    "category": "DEMAND",
    "text": "Evening peak (18:00-21:00) holds 34% of sessions."
  }
]
```

### GET /api/analytics/export/sessions.csv

Auth: **OPERATOR, ADMIN** | Success: **200**

Same optional filters as above. Header row then one row per charging session.

Response: CSV (text/csv, attachment `chargeiq-sessions.csv`)
