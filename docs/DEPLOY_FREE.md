# Deploy VoltSlot for free (Render + Aiven MySQL) – about 25 minutes

You need: a GitHub account, a Render account, an Aiven account (all free, no card). Do the steps in this order.

## A. Put the code on GitHub (5 min)
1. Create a new empty repository on github.com (e.g. `voltslot`), Public or Private.
2. In VS Code open the folder `chargeiq`, open the terminal and run:
   ```
   git init
   git add .
   git commit -m "VoltSlot"
   git branch -M main
   git remote add origin https://github.com/<your-username>/voltslot.git
   git push -u origin main
   ```
   (`.gitignore` already skips node_modules and build junk.)

## B. Create the free MySQL on Aiven (5 min)
1. Sign up at https://aiven.io, create a project, click **Create service → MySQL → Free plan** (1 GB). Pick the region nearest India.
2. Wait until it says **Running**. Open the service and copy: **Host, Port, User (avnadmin), Password**, and download the **CA certificate** (ca.pem).
3. **Import the data immediately** (Aiven can switch off a free service that is not used in its first hours).
   In MySQL Workbench: new connection → Hostname = Aiven host, Port = Aiven port, Username = avnadmin, Password = store in vault,
   **SSL tab → Use SSL: Require**, (CA file = ca.pem if it asks). Test connection, open it.
   Then **File → Open SQL Script → `db/voltslot_hosted.sql`**, first line of the editor add `USE defaultdb;`, run with the lightning bolt (2–4 min).
   Check: `SELECT COUNT(*) FROM defaultdb.stations;` → 32.

## C. Deploy the app on Render (10 min)
1. https://render.com → **New + → Blueprint** (or **Web Service**) → connect your GitHub repo.
   - Blueprint: Render reads `render.yaml`. Web Service manual settings: Runtime **Docker**, Dockerfile path `./backend/Dockerfile`, Docker context `./backend`, Instance type **Free**, Health check path `/api/clock`.
2. Environment variables (Render dashboard → Environment):

| Sr No | Key | Value |
|:---:|:---|:---|
| 1 | DB_URL | `jdbc:mysql://<AIVEN_HOST>:<AIVEN_PORT>/defaultdb?sslMode=REQUIRED&serverTimezone=Asia/Kolkata&characterEncoding=UTF-8` |
| 2 | DB_USER | `avnadmin` |
| 3 | DB_PASSWORD | the Aiven password |
| 4 | JWT_SECRET | any long random text (Blueprint generates one) |

3. Click **Deploy**. The first build takes 6–10 minutes (it compiles the Java project). Watch the log until you see `Started ChargeIqApplication`.
4. Open the URL Render gives you (`https://voltslot-xxxx.onrender.com`). Log in with the demo chips.

## D. Make it demo-ready
* **Cold start:** the free instance sleeps after 15 minutes without visitors and needs ~1 minute to wake up. Open the site 2 minutes before your demo, or create a free monitor at https://uptimerobot.com that pings `https://<your-app>/api/clock` every 5 minutes (keeps it awake; 750 free hours/month is enough for one service).
* **Swagger:** `https://<your-app>/swagger-ui.html`.
* **Time machine:** Admin console → Reset before every demo.
* **Map tiles** use OpenStreetMap, no key needed.

## Troubleshooting
| Sr No | Symptom | Fix |
|:---:|:---|:---|
| 1 | Build fails: "out of memory" | Render dashboard → Manual Deploy → Clear build cache & deploy |
| 2 | App crashes "Communications link failure" | Aiven service is off: power it on in the Aiven console; check host/port in DB_URL |
| 3 | "Access denied" | Wrong DB_USER/DB_PASSWORD |
| 4 | "SSL" error | Make sure DB_URL has `sslMode=REQUIRED` |
| 5 | Insights page empty | The import skipped the `dw_*` tables – re-run `db/voltslot_hosted.sql`, then Admin → Refresh warehouse |
| 6 | Render restarts repeatedly | Memory: add env var `JAVA_OPTS` = `-Xmx256m -XX:+UseSerialGC` |
