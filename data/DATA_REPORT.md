# VoltSlot - Synthetic Data Report

Generated 03-Oct-2026 18:42 | seed 42 | reference 'now' = 03-Oct-2026 09:30 IST | all data is synthetic.

Tables: bold centred headers, **Sr No** first, numbers right-aligned, rupee values in Indian grouping (₹12,34,567).

## 1. Verification summary

**83 of 83 checks passed** (`python analytics/verify_data.py`).

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Check</b></th><th style="text-align:center"><b>Result</b></th><th style="text-align:center"><b>Detail</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left">every schema table populated (30 tables)</td><td style="text-align:left">PASS</td><td style="text-align:left">min rows 5</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left">total bookings in 9,300-9,900</td><td style="text-align:left">PASS</td><td style="text-align:left">total=9542 history=9283 upcoming=259</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left">history bookings ~9,200-9,500</td><td style="text-align:left">PASS</td><td style="text-align:left">9283</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left">upcoming bookings ~250</td><td style="text-align:left">PASS</td><td style="text-align:left">259</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left">sessions 7,300-7,900</td><td style="text-align:left">PASS</td><td style="text-align:left">7789</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left">reviews 1,700-1,900</td><td style="text-align:left">PASS</td><td style="text-align:left">1718</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left">funnel events 50k-70k</td><td style="text-align:left">PASS</td><td style="text-align:left">54422</td></tr>
<tr><td style="text-align:right">8</td><td style="text-align:left">demand_forecast = 32x7x24</td><td style="text-align:left">PASS</td><td style="text-align:left">5376</td></tr>
<tr><td style="text-align:right">9</td><td style="text-align:left">network_forecast = 6 zones x 42 days</td><td style="text-align:left">PASS</td><td style="text-align:left">252</td></tr>
<tr><td style="text-align:right">10</td><td style="text-align:left">users 656 / vehicles ~700</td><td style="text-align:left">PASS</td><td style="text-align:left">656 / 701</td></tr>
<tr><td style="text-align:right">11</td><td style="text-align:left">booking start_time on 30-min grid</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">12</td><td style="text-align:left">end_time = start_time + slots*30 min</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">13</td><td style="text-align:left">slots &gt;= 1</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">14</td><td style="text-align:left">booking_slots filled exactly for every non-CANCELLED/EXPIRED booking</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">15</td><td style="text-align:left">booking_slots consistent with booking (point, window, grid)</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">16</td><td style="text-align:left">no overlapping active bookings on the same charging point</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">17</td><td style="text-align:left">no overlapping active bookings for the same vehicle</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">18</td><td style="text-align:left">session inside booking window</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">19</td><td style="text-align:left">sessions exist only for COMPLETED bookings</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">20</td><td style="text-align:left">every COMPLETED booking has a session</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">21</td><td style="text-align:left">no negative/zero energy, amount, kW; SoC sane</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">22</td><td style="text-align:left">amount = energy x effective tariff</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">23</td><td style="text-align:left">avg_kw never exceeds the point&#x27;s power</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">24</td><td style="text-align:left">energy per session &lt;= battery capacity / 0.92</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">25</td><td style="text-align:left">revenue per kWh realistic (Rs 12-24)</td><td style="text-align:left">PASS</td><td style="text-align:left">15.52</td></tr>
<tr><td style="text-align:right">26</td><td style="text-align:left">no booking created before user signup</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">27</td><td style="text-align:left">no booking created before vehicle registration</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">28</td><td style="text-align:left">booking created_at &lt;= start_time</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">29</td><td style="text-align:left">booking.station_id matches charging point&#x27;s station</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">30</td><td style="text-align:left">vehicle compatible with booked point&#x27;s connector</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">31</td><td style="text-align:left">booking.user_id owns the vehicle</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">32</td><td style="text-align:left">no bookings on non-ACTIVE points in the last days / upcoming</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">33</td><td style="text-align:left">bookings respect station opening hours</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">34</td><td style="text-align:left">recharge_predictions.vehicle_id resolves</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">35</td><td style="text-align:left">waitlist_entries.promoted_booking_id resolves</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">36</td><td style="text-align:left">every vehicle model has &gt;=1 connector</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">37</td><td style="text-align:left">unique booking codes / invoice numbers</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">38</td><td style="text-align:left">wallet balances &gt;= 0</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">39</td><td style="text-align:left">wallet.balance equals last ledger balance_after</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">40</td><td style="text-align:left">ledger sums to wallet balance</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">41</td><td style="text-align:left">every user has a wallet</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">42</td><td style="text-align:left">payments amounts sane</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">43</td><td style="text-align:left">no payment for EXPIRED holds</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">44</td><td style="text-align:left">NO_SHOW keeps 25% of est_cost (status PAID)</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">45</td><td style="text-align:left">payment paid_at &gt;= booking created_at</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">46</td><td style="text-align:left">history outcome mix ~83/8/5/4</td><td style="text-align:left">PASS</td><td style="text-align:left">{&#x27;CANCELLED&#x27;: 7.6, &#x27;CHECKED_IN&#x27;: 0.0, &#x27;COMPLETED&#x27;: 83.9, &#x27;EXPIRED&#x27;: 3.7, &#x27;NO_SHOW&#x27;: 4.8}</td></tr>
<tr><td style="text-align:right">47</td><td style="text-align:left">review mean rating ~4.1</td><td style="text-align:left">PASS</td><td style="text-align:left">4.1</td></tr>
<tr><td style="text-align:right">48</td><td style="text-align:left">review text 8-30 words, rating 1-5</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">49</td><td style="text-align:left">sentiment split ~70/15/15 (+-8 pts)</td><td style="text-align:left">PASS</td><td style="text-align:left">{&#x27;NEUTRAL&#x27;: 17.1, &#x27;POSITIVE&#x27;: 68.6, &#x27;NEGATIVE&#x27;: 14.3}</td></tr>
<tr><td style="text-align:right">50</td><td style="text-align:left">reliability = 0.5*rating + 0.3*sentiment + 0.2*uptime</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">51</td><td style="text-align:left">stations 32 (8 HUB + 24 STANDARD), points ~100</td><td style="text-align:left">PASS</td><td style="text-align:left">103</td></tr>
<tr><td style="text-align:right">52</td><td style="text-align:left">every station has a TYPE2 or CCS2 point</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">53</td><td style="text-align:left">hubs have &gt;=1 CCS2 &gt;=60 kW and &gt;=1 LECCS</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
<tr><td style="text-align:right">54</td><td style="text-align:left">&gt;=6 standard stations with LECCS</td><td style="text-align:left">PASS</td><td style="text-align:left">9</td></tr>
<tr><td style="text-align:right">55</td><td style="text-align:left">BHARAT_DC points exist (&gt;=3)</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">56</td><td style="text-align:left">3-4 points MAINTENANCE/OFFLINE</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">57</td><td style="text-align:left">stations have 2-6 amenities</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">58</td><td style="text-align:left">passwords are BCrypt hashes</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">59</td><td style="text-align:left">7 demo accounts with exact roles</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">60</td><td style="text-align:left">demo user names</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">61</td><td style="text-align:left">demo@ city is Thane</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">62</td><td style="text-align:left">operator@ linked to VoltGrid</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">63</td><td style="text-align:left">fleet@ linked to SwiftLogix Deliveries with 12 vehicles</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">64</td><td style="text-align:left">demo Nexon next_due on 2026-10-03 19:xx, cadence ~6 d, &gt;=30 sessions</td><td style="text-align:left">PASS</td><td style="text-align:left">2026-10-03 19:38:45 median=6.019 n=45</td></tr>
<tr><td style="text-align:right">65</td><td style="text-align:left">priya next_due ~2026-10-05 14:00</td><td style="text-align:left">PASS</td><td style="text-align:left">2026-10-05 14:18:13</td></tr>
<tr><td style="text-align:right">66</td><td style="text-align:left">rahul next_due ~2026-10-02 22:00 (overdue)</td><td style="text-align:left">PASS</td><td style="text-align:left">2026-10-02 22:24:54</td></tr>
<tr><td style="text-align:right">67</td><td style="text-align:left">demo Nexon has no HOLD/CONFIRMED/CHECKED_IN future booking (reminder active)</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">68</td><td style="text-align:left">demo has exactly 1 upcoming booking: Ather on 2026-10-05</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">69</td><td style="text-align:left">demo wallet = Rs 1,250.00</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">70</td><td style="text-align:left">demo has &gt;=3 reviews and 1 cancelled booking</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">71</td><td style="text-align:left">2 CHECKED_IN bookings at NOW</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">72</td><td style="text-align:left">sneha rides an Ola S1 Pro (LECCS)</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">73</td><td style="text-align:left">no RECHARGE_REMINDER notifications seeded</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">74</td><td style="text-align:left">waitlist: ~25 rows incl &gt;=3 WAITING</td><td style="text-align:left">PASS</td><td style="text-align:left">25</td></tr>
<tr><td style="text-align:right">75</td><td style="text-align:left">a few fully booked hub slots exist in the upcoming week</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">76</td><td style="text-align:left">BKC evening peak crowding &gt;= 65 (HIGH)</td><td style="text-align:left">PASS</td><td style="text-align:left">100.0</td></tr>
<tr><td style="text-align:right">77</td><td style="text-align:left">&gt;=6 of 8 hubs reach HIGH crowding in the evening</td><td style="text-align:left">PASS</td><td style="text-align:left">8</td></tr>
<tr><td style="text-align:right">78</td><td style="text-align:left">typical off-peak crowding &lt; 35</td><td style="text-align:left">PASS</td><td style="text-align:left">10.9</td></tr>
<tr><td style="text-align:right">79</td><td style="text-align:left">network_forecast bounds ordered</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">80</td><td style="text-align:left">dw_fact_booking = bookings</td><td style="text-align:left">PASS</td><td style="text-align:left">9542</td></tr>
<tr><td style="text-align:right">81</td><td style="text-align:left">dw_fact_session = charging_sessions</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">82</td><td style="text-align:left">dw dims populated</td><td style="text-align:left">PASS</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">83</td><td style="text-align:left">clean CSVs have no duplicate rows</td><td style="text-align:left">PASS</td><td style="text-align:left">0</td></tr>
</tbody></table>

## 2. Row counts per table

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Table</b></th><th style="text-align:center"><b>Rows</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left">operators</td><td style="text-align:right">8</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left">fleets</td><td style="text-align:right">6</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left">users</td><td style="text-align:right">656</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left">wallets</td><td style="text-align:right">656</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left">wallet_transactions</td><td style="text-align:right">8,926</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left">connector_types</td><td style="text-align:right">5</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left">vehicle_models</td><td style="text-align:right">13</td></tr>
<tr><td style="text-align:right">8</td><td style="text-align:left">vehicle_model_connectors</td><td style="text-align:right">24</td></tr>
<tr><td style="text-align:right">9</td><td style="text-align:left">vehicles</td><td style="text-align:right">701</td></tr>
<tr><td style="text-align:right">10</td><td style="text-align:left">stations</td><td style="text-align:right">32</td></tr>
<tr><td style="text-align:right">11</td><td style="text-align:left">amenities</td><td style="text-align:right">9</td></tr>
<tr><td style="text-align:right">12</td><td style="text-align:left">station_amenities</td><td style="text-align:right">126</td></tr>
<tr><td style="text-align:right">13</td><td style="text-align:left">charging_points</td><td style="text-align:right">103</td></tr>
<tr><td style="text-align:right">14</td><td style="text-align:left">pricing_bands</td><td style="text-align:right">24</td></tr>
<tr><td style="text-align:right">15</td><td style="text-align:left">bookings</td><td style="text-align:right">9,542</td></tr>
<tr><td style="text-align:right">16</td><td style="text-align:left">booking_slots</td><td style="text-align:right">46,772</td></tr>
<tr><td style="text-align:right">17</td><td style="text-align:left">charging_sessions</td><td style="text-align:right">7,789</td></tr>
<tr><td style="text-align:right">18</td><td style="text-align:left">payments</td><td style="text-align:right">9,200</td></tr>
<tr><td style="text-align:right">19</td><td style="text-align:left">reviews</td><td style="text-align:right">1,718</td></tr>
<tr><td style="text-align:right">20</td><td style="text-align:left">waitlist_entries</td><td style="text-align:right">25</td></tr>
<tr><td style="text-align:right">21</td><td style="text-align:left">recharge_predictions</td><td style="text-align:right">526</td></tr>
<tr><td style="text-align:right">22</td><td style="text-align:left">notifications</td><td style="text-align:right">156</td></tr>
<tr><td style="text-align:right">23</td><td style="text-align:left">demand_forecast</td><td style="text-align:right">5,376</td></tr>
<tr><td style="text-align:right">24</td><td style="text-align:left">network_forecast</td><td style="text-align:right">252</td></tr>
<tr><td style="text-align:right">25</td><td style="text-align:left">user_segments</td><td style="text-align:right">646</td></tr>
<tr><td style="text-align:right">26</td><td style="text-align:left">station_clusters</td><td style="text-align:right">32</td></tr>
<tr><td style="text-align:right">27</td><td style="text-align:left">funnel_events</td><td style="text-align:right">54,422</td></tr>
<tr><td style="text-align:right">28</td><td style="text-align:left">weather_daily</td><td style="text-align:right">375</td></tr>
<tr><td style="text-align:right">29</td><td style="text-align:left">holidays</td><td style="text-align:right">18</td></tr>
<tr><td style="text-align:right">30</td><td style="text-align:left">sentiment_keywords</td><td style="text-align:right">50</td></tr>
</tbody></table>

## 3. Bookings by status

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Status</b></th><th style="text-align:center"><b>Bookings</b></th><th style="text-align:center"><b>Share (%)</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left">COMPLETED</td><td style="text-align:right">7,789</td><td style="text-align:right">81.63</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left">CANCELLED</td><td style="text-align:right">704</td><td style="text-align:right">7.38</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left">NO_SHOW</td><td style="text-align:right">446</td><td style="text-align:right">4.67</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left">EXPIRED</td><td style="text-align:right">342</td><td style="text-align:right">3.58</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left">CONFIRMED</td><td style="text-align:right">259</td><td style="text-align:right">2.71</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left">CHECKED_IN</td><td style="text-align:right">2</td><td style="text-align:right">0.02</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left">TOTAL</td><td style="text-align:right">9,542</td><td style="text-align:right">100.00</td></tr>
</tbody></table>

History (start <= now): **9,283**; upcoming: **259**; total **9,542** (target 9,300-9,900).

## 4. Monthly sessions, energy and revenue

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Month</b></th><th style="text-align:center"><b>Sessions</b></th><th style="text-align:center"><b>Energy (kWh)</b></th><th style="text-align:center"><b>Revenue</b></th><th style="text-align:center"><b>Revenue / session</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left">2025-10</td><td style="text-align:right">628</td><td style="text-align:right">11,546.10</td><td style="text-align:right">₹1,83,571.47</td><td style="text-align:right">₹292.31</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left">2025-11</td><td style="text-align:right">493</td><td style="text-align:right">8,890.30</td><td style="text-align:right">₹1,34,560.94</td><td style="text-align:right">₹272.94</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left">2025-12</td><td style="text-align:right">573</td><td style="text-align:right">10,066.00</td><td style="text-align:right">₹1,50,340.22</td><td style="text-align:right">₹262.37</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left">2026-01</td><td style="text-align:right">580</td><td style="text-align:right">10,817.80</td><td style="text-align:right">₹1,69,655.90</td><td style="text-align:right">₹292.51</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left">2026-02</td><td style="text-align:right">510</td><td style="text-align:right">9,232.20</td><td style="text-align:right">₹1,43,646.15</td><td style="text-align:right">₹281.66</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left">2026-03</td><td style="text-align:right">624</td><td style="text-align:right">11,673.50</td><td style="text-align:right">₹1,83,516.03</td><td style="text-align:right">₹294.10</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left">2026-04</td><td style="text-align:right">698</td><td style="text-align:right">13,069.20</td><td style="text-align:right">₹2,03,116.33</td><td style="text-align:right">₹291.00</td></tr>
<tr><td style="text-align:right">8</td><td style="text-align:left">2026-05</td><td style="text-align:right">665</td><td style="text-align:right">12,081.20</td><td style="text-align:right">₹1,89,501.48</td><td style="text-align:right">₹284.96</td></tr>
<tr><td style="text-align:right">9</td><td style="text-align:left">2026-06</td><td style="text-align:right">686</td><td style="text-align:right">13,083.90</td><td style="text-align:right">₹1,97,837.48</td><td style="text-align:right">₹288.39</td></tr>
<tr><td style="text-align:right">10</td><td style="text-align:left">2026-07</td><td style="text-align:right">700</td><td style="text-align:right">13,143.90</td><td style="text-align:right">₹2,05,586.78</td><td style="text-align:right">₹293.70</td></tr>
<tr><td style="text-align:right">11</td><td style="text-align:left">2026-08</td><td style="text-align:right">760</td><td style="text-align:right">14,302.30</td><td style="text-align:right">₹2,20,890.85</td><td style="text-align:right">₹290.65</td></tr>
<tr><td style="text-align:right">12</td><td style="text-align:left">2026-09</td><td style="text-align:right">794</td><td style="text-align:right">14,753.70</td><td style="text-align:right">₹2,31,117.45</td><td style="text-align:right">₹291.08</td></tr>
<tr><td style="text-align:right">13</td><td style="text-align:left">2026-10</td><td style="text-align:right">78</td><td style="text-align:right">1,358.10</td><td style="text-align:right">₹21,488.26</td><td style="text-align:right">₹275.49</td></tr>
<tr><td style="text-align:right">14</td><td style="text-align:left">TOTAL</td><td style="text-align:right">7,789</td><td style="text-align:right">144,018.20</td><td style="text-align:right">₹22,34,829.34</td><td style="text-align:right">₹286.92</td></tr>
</tbody></table>

Network total: **7,789** sessions, **144,018 kWh**, revenue **₹22,34,829.34**, CO2 avoided **117,135 kg**.

## 5. Revenue and utilisation by tier

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Tier</b></th><th style="text-align:center"><b>Stations</b></th><th style="text-align:center"><b>Active points</b></th><th style="text-align:center"><b>Booked slots</b></th><th style="text-align:center"><b>Available slots</b></th><th style="text-align:center"><b>Utilisation (%)</b></th><th style="text-align:center"><b>Revenue</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left">HUB</td><td style="text-align:right">8</td><td style="text-align:right">42</td><td style="text-align:right">31,532</td><td style="text-align:right">735,840</td><td style="text-align:right">4.29</td><td style="text-align:right">₹17,26,563.24</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left">STANDARD</td><td style="text-align:right">24</td><td style="text-align:right">57</td><td style="text-align:right">14,145</td><td style="text-align:right">906,660</td><td style="text-align:right">1.56</td><td style="text-align:right">₹5,08,266.10</td></tr>
</tbody></table>

Utilisation = booked 30-minute slots in the 365-day history / (active points x operating slots x 365). Booked slots are booking_slots rows (all bookings that are not CANCELLED or EXPIRED).

## 6. Revenue by zone (top 10)

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Zone</b></th><th style="text-align:center"><b>Sessions</b></th><th style="text-align:center"><b>Energy (kWh)</b></th><th style="text-align:center"><b>Revenue</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left">BKC</td><td style="text-align:right">1,083</td><td style="text-align:right">21,428.40</td><td style="text-align:right">₹3,71,605.97</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left">Powai</td><td style="text-align:right">938</td><td style="text-align:right">18,336.90</td><td style="text-align:right">₹3,07,755.63</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left">Andheri East</td><td style="text-align:right">749</td><td style="text-align:right">14,728.80</td><td style="text-align:right">₹2,49,644.37</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left">Thane West</td><td style="text-align:right">1,027</td><td style="text-align:right">14,964.60</td><td style="text-align:right">₹2,34,368.09</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left">Vashi</td><td style="text-align:right">735</td><td style="text-align:right">10,371.60</td><td style="text-align:right">₹1,57,345.37</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left">Airport</td><td style="text-align:right">587</td><td style="text-align:right">9,519.70</td><td style="text-align:right">₹1,50,539.82</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left">Kharghar</td><td style="text-align:right">602</td><td style="text-align:right">8,769.50</td><td style="text-align:right">₹1,34,997.61</td></tr>
<tr><td style="text-align:right">8</td><td style="text-align:left">Lower Parel</td><td style="text-align:right">342</td><td style="text-align:right">7,138.60</td><td style="text-align:right">₹1,20,306.38</td></tr>
<tr><td style="text-align:right">9</td><td style="text-align:left">Goregaon</td><td style="text-align:right">198</td><td style="text-align:right">4,584.90</td><td style="text-align:right">₹58,335.37</td></tr>
<tr><td style="text-align:right">10</td><td style="text-align:left">Malad</td><td style="text-align:right">194</td><td style="text-align:right">4,215.80</td><td style="text-align:right">₹57,990.51</td></tr>
</tbody></table>

## 7. Peak crowding statistics (demand_forecast, 32 stations x 7 days x 24 h)

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Tier</b></th><th style="text-align:center"><b>Cells</b></th><th style="text-align:center"><b>Mean index</b></th><th style="text-align:center"><b>Max index</b></th><th style="text-align:center"><b>HIGH cells (%)</b></th><th style="text-align:center"><b>MEDIUM cells (%)</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left">HUB</td><td style="text-align:right">1,344</td><td style="text-align:right">52.30</td><td style="text-align:right">100.00</td><td style="text-align:right">46.13</td><td style="text-align:right">20.39</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left">STANDARD</td><td style="text-align:right">4,032</td><td style="text-align:right">14.00</td><td style="text-align:right">99.30</td><td style="text-align:right">6.67</td><td style="text-align:right">12.05</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left">ALL</td><td style="text-align:right">5,376</td><td style="text-align:right">23.60</td><td style="text-align:right">100.00</td><td style="text-align:right">16.54</td><td style="text-align:right">14.14</td></tr>
</tbody></table>

HIGH = crowding index >= 65, MEDIUM = 35 to < 65, LOW < 35.

## 8. Distribution sanity

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Metric</b></th><th style="text-align:center"><b>Min</b></th><th style="text-align:center"><b>Mean</b></th><th style="text-align:center"><b>Max</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left">Energy per session (kWh)</td><td style="text-align:right">0.64</td><td style="text-align:right">18.49</td><td style="text-align:right">58.53</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left">Duration (min)</td><td style="text-align:right">7.00</td><td style="text-align:right">145.28</td><td style="text-align:right">674.00</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left">Revenue per session (INR)</td><td style="text-align:right">6.30</td><td style="text-align:right">286.92</td><td style="text-align:right">1,284.62</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left">Effective tariff (INR/kWh)</td><td style="text-align:right">7.65</td><td style="text-align:right">14.61</td><td style="text-align:right">28.80</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left">Lead time (h)</td><td style="text-align:right">0.00</td><td style="text-align:right">21.35</td><td style="text-align:right">167.92</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left">Review rating (1-5)</td><td style="text-align:right">1.00</td><td style="text-align:right">4.10</td><td style="text-align:right">5.00</td></tr>
</tbody></table>

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Sentiment</b></th><th style="text-align:center"><b>Reviews</b></th><th style="text-align:center"><b>Avg rating</b></th><th style="text-align:center"><b>Share (%)</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left">POSITIVE</td><td style="text-align:right">1,179</td><td style="text-align:right">4.43</td><td style="text-align:right">68.60</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left">NEUTRAL</td><td style="text-align:right">293</td><td style="text-align:right">3.70</td><td style="text-align:right">17.10</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left">NEGATIVE</td><td style="text-align:right">246</td><td style="text-align:right">3.03</td><td style="text-align:right">14.30</td></tr>
</tbody></table>

## 9. Missing values and duplicates (clean tables)

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Table</b></th><th style="text-align:center"><b>Column</b></th><th style="text-align:center"><b>Rows</b></th><th style="text-align:center"><b>Missing</b></th><th style="text-align:center"><b>Duplicates</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left">users</td><td style="text-align:left">email</td><td style="text-align:right">656</td><td style="text-align:right">0</td><td style="text-align:right">0</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left">users</td><td style="text-align:left">phone</td><td style="text-align:right">656</td><td style="text-align:right">0</td><td style="text-align:right">0</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left">bookings</td><td style="text-align:left">booking_code</td><td style="text-align:right">9,542</td><td style="text-align:right">0</td><td style="text-align:right">0</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left">stations</td><td style="text-align:left">name</td><td style="text-align:right">32</td><td style="text-align:right">0</td><td style="text-align:right">0</td></tr>
</tbody></table>

## 10. Cleaning of the raw extracts

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Table</b></th><th style="text-align:center"><b>Issue</b></th><th style="text-align:center"><b>Rows fixed</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left">bookings</td><td style="text-align:left">10x outlier</td><td style="text-align:right">27</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left">bookings</td><td style="text-align:left">duplicate rows</td><td style="text-align:right">139</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left">bookings</td><td style="text-align:left">inconsistent categorical spelling</td><td style="text-align:right">6,153</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left">bookings</td><td style="text-align:left">leading/trailing spaces</td><td style="text-align:right">289</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left">bookings</td><td style="text-align:left">missing value</td><td style="text-align:right">826</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left">bookings</td><td style="text-align:left">missing value (two derivations lost)</td><td style="text-align:right">2</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left">bookings</td><td style="text-align:left">mixed date format</td><td style="text-align:right">4,954</td></tr>
<tr><td style="text-align:right">8</td><td style="text-align:left">bookings</td><td style="text-align:left">negative outlier</td><td style="text-align:right">43</td></tr>
<tr><td style="text-align:right">9</td><td style="text-align:left">bookings</td><td style="text-align:left">placeholder token (N/A, -, blank)</td><td style="text-align:right">276</td></tr>
<tr><td style="text-align:right">10</td><td style="text-align:left">charging_sessions</td><td style="text-align:left">10x outlier</td><td style="text-align:right">38</td></tr>
<tr><td style="text-align:right">11</td><td style="text-align:left">charging_sessions</td><td style="text-align:left">duplicate rows</td><td style="text-align:right">77</td></tr>
<tr><td style="text-align:right">12</td><td style="text-align:left">charging_sessions</td><td style="text-align:left">missing value</td><td style="text-align:right">349</td></tr>
<tr><td style="text-align:right">13</td><td style="text-align:left">charging_sessions</td><td style="text-align:left">mixed date format</td><td style="text-align:right">3,148</td></tr>
<tr><td style="text-align:right">14</td><td style="text-align:left">charging_sessions</td><td style="text-align:left">negative outlier</td><td style="text-align:right">40</td></tr>
<tr><td style="text-align:right">15</td><td style="text-align:left">charging_sessions</td><td style="text-align:left">placeholder token (N/A, -, blank)</td><td style="text-align:right">199</td></tr>
<tr><td style="text-align:right">16</td><td style="text-align:left">reviews</td><td style="text-align:left">duplicate rows</td><td style="text-align:right">34</td></tr>
<tr><td style="text-align:right">17</td><td style="text-align:left">reviews</td><td style="text-align:left">extra spaces</td><td style="text-align:right">227</td></tr>
<tr><td style="text-align:right">18</td><td style="text-align:left">reviews</td><td style="text-align:left">missing value</td><td style="text-align:right">22</td></tr>
<tr><td style="text-align:right">19</td><td style="text-align:left">reviews</td><td style="text-align:left">mixed date format</td><td style="text-align:right">328</td></tr>
<tr><td style="text-align:right">20</td><td style="text-align:left">reviews</td><td style="text-align:left">rating stored as text</td><td style="text-align:right">249</td></tr>
<tr><td style="text-align:right">21</td><td style="text-align:left">stations</td><td style="text-align:left">duplicate rows</td><td style="text-align:right">1</td></tr>
<tr><td style="text-align:right">22</td><td style="text-align:left">stations</td><td style="text-align:left">inconsistent categorical spelling</td><td style="text-align:right">11</td></tr>
<tr><td style="text-align:right">23</td><td style="text-align:left">stations</td><td style="text-align:left">leading/trailing spaces</td><td style="text-align:right">9</td></tr>
<tr><td style="text-align:right">24</td><td style="text-align:left">stations</td><td style="text-align:left">missing value</td><td style="text-align:right">2</td></tr>
<tr><td style="text-align:right">25</td><td style="text-align:left">stations</td><td style="text-align:left">placeholder token (N/A, -, blank)</td><td style="text-align:right">2</td></tr>
<tr><td style="text-align:right">26</td><td style="text-align:left">stations</td><td style="text-align:left">swapped latitude/longitude</td><td style="text-align:right">3</td></tr>
<tr><td style="text-align:right">27</td><td style="text-align:left">stations</td><td style="text-align:left">unit suffix in numeric column</td><td style="text-align:right">4</td></tr>
<tr><td style="text-align:right">28</td><td style="text-align:left">users</td><td style="text-align:left">duplicate rows</td><td style="text-align:right">9</td></tr>
<tr><td style="text-align:right">29</td><td style="text-align:left">users</td><td style="text-align:left">inconsistent case / spaces</td><td style="text-align:right">66</td></tr>
<tr><td style="text-align:right">30</td><td style="text-align:left">users</td><td style="text-align:left">inconsistent categorical spelling</td><td style="text-align:right">72</td></tr>
<tr><td style="text-align:right">31</td><td style="text-align:left">users</td><td style="text-align:left">missing value</td><td style="text-align:right">13</td></tr>
<tr><td style="text-align:right">32</td><td style="text-align:left">users</td><td style="text-align:left">mixed date format</td><td style="text-align:right">140</td></tr>
<tr><td style="text-align:right">33</td><td style="text-align:left">users</td><td style="text-align:left">phone format variants</td><td style="text-align:right">294</td></tr>
<tr><td style="text-align:right">34</td><td style="text-align:left">users</td><td style="text-align:left">placeholder token (N/A, -, blank)</td><td style="text-align:right">25</td></tr>
<tr><td style="text-align:right">35</td><td style="text-align:left">users</td><td style="text-align:left">swapped latitude/longitude</td><td style="text-align:right">4</td></tr>
</tbody></table>

Verification of cleaned output against the clean source (worst columns = lowest per-column match %):

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Table</b></th><th style="text-align:center"><b>Rows (clean)</b></th><th style="text-align:center"><b>Rows (cleaned)</b></th><th style="text-align:center"><b>Rows matched (%)</b></th><th style="text-align:center"><b>Cells</b></th><th style="text-align:center"><b>Cells matching</b></th><th style="text-align:center"><b>Cell match (%)</b></th><th style="text-align:center"><b>Worst columns</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left">bookings</td><td style="text-align:right">9,283</td><td style="text-align:right">9,283</td><td style="text-align:right">100.00</td><td style="text-align:right">139,245</td><td style="text-align:right">139,186</td><td style="text-align:right">99.96</td><td style="text-align:left">source 99.47%, est_energy_kwh 99.91%, end_time 99.99%</td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left">charging_sessions</td><td style="text-align:right">7,789</td><td style="text-align:right">7,789</td><td style="text-align:right">100.00</td><td style="text-align:right">77,890</td><td style="text-align:right">77,748</td><td style="text-align:right">99.82</td><td style="text-align:left">ended_at 98.25%, amount 99.92%, id 100.00%</td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left">users</td><td style="text-align:right">656</td><td style="text-align:right">656</td><td style="text-align:right">100.00</td><td style="text-align:right">5,904</td><td style="text-align:right">5,891</td><td style="text-align:right">99.78</td><td style="text-align:left">phone 98.17%, full_name 99.85%, email 100.00%</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left">stations</td><td style="text-align:right">32</td><td style="text-align:right">32</td><td style="text-align:right">100.00</td><td style="text-align:right">320</td><td style="text-align:right">320</td><td style="text-align:right">100.00</td><td style="text-align:left">name 100.00%, zone 100.00%, city 100.00%</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left">reviews</td><td style="text-align:right">1,718</td><td style="text-align:right">1,718</td><td style="text-align:right">100.00</td><td style="text-align:right">10,308</td><td style="text-align:right">10,296</td><td style="text-align:right">99.88</td><td style="text-align:left">rating 99.30%, station_id 100.00%, user_id 100.00%</td></tr>
</tbody></table>

## 11. Demo accounts

<table>
<thead><tr><th style="text-align:center"><b>Sr No</b></th><th style="text-align:center"><b>Email</b></th><th style="text-align:center"><b>Role</b></th><th style="text-align:center"><b>Wallet balance</b></th><th style="text-align:center"><b>Bookings</b></th><th style="text-align:center"><b>Next recharge due</b></th></tr></thead>
<tbody>
<tr><td style="text-align:right">1</td><td style="text-align:left">admin@voltslot.in</td><td style="text-align:left">ADMIN</td><td style="text-align:right">₹0.00</td><td style="text-align:right">0</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">2</td><td style="text-align:left">operator@voltslot.in</td><td style="text-align:left">OPERATOR</td><td style="text-align:right">₹0.00</td><td style="text-align:right">0</td><td style="text-align:left"></td></tr>
<tr><td style="text-align:right">3</td><td style="text-align:left">fleet@voltslot.in</td><td style="text-align:left">FLEET_MANAGER</td><td style="text-align:right">₹19.03</td><td style="text-align:right">426</td><td style="text-align:left">2026-09-20 23:21:22</td></tr>
<tr><td style="text-align:right">4</td><td style="text-align:left">demo@voltslot.in</td><td style="text-align:left">USER</td><td style="text-align:right">₹1,250.00</td><td style="text-align:right">80</td><td style="text-align:left">2026-10-03 19:38:45</td></tr>
<tr><td style="text-align:right">5</td><td style="text-align:left">priya@voltslot.in</td><td style="text-align:left">USER</td><td style="text-align:right">₹271.05</td><td style="text-align:right">18</td><td style="text-align:left">2026-10-05 14:18:13</td></tr>
<tr><td style="text-align:right">6</td><td style="text-align:left">rahul@voltslot.in</td><td style="text-align:left">USER</td><td style="text-align:right">₹72.68</td><td style="text-align:right">29</td><td style="text-align:left">2026-10-02 22:24:54</td></tr>
<tr><td style="text-align:right">7</td><td style="text-align:left">sneha@voltslot.in</td><td style="text-align:left">USER</td><td style="text-align:right">₹109.28</td><td style="text-align:right">59</td><td style="text-align:left">2026-10-03 23:31:58</td></tr>
</tbody></table>

## 12. Charts

Twenty dark-theme charts are in `analytics/reports/` (01-20 PNG plus `segmentation_silhouette.png`).
