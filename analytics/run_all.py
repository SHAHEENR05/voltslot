"""One-command pipeline:  python analytics/run_all.py [--skip-dump] [--skip-notebook] [--skip-excel]

generate_data -> clean_data -> load_to_mysql -> sentiment -> forecast -> segmentation -> recharge_predictions
-> CALL sp_refresh_warehouse() -> export_clean -> verify_data -> visual_report -> notebook -> excel -> DATA_REPORT.md -> mysqldump
Seed 42 everywhere. Only the `chargeiq` database is touched.
"""
import argparse
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def run(script, *args):
    t = time.time()
    print(f"\n=== {script} {' '.join(args)}", flush=True)
    r = subprocess.run([sys.executable, str(HERE / script), *args], cwd=str(ROOT))
    if r.returncode != 0:
        sys.exit(f"FAILED: {script} (exit {r.returncode})")
    print(f"--- {script} done in {time.time() - t:.0f}s", flush=True)


def refresh_warehouse():
    sys.path.insert(0, str(HERE))
    from common import get_conn
    print("\n=== CALL sp_refresh_warehouse()", flush=True)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("CALL sp_refresh_warehouse()")
    while cur.nextset():
        pass
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM dw_fact_session")
    print("dw_fact_session rows:", cur.fetchone()[0])
    conn.close()


def dump():
    import os
    out = ROOT / "db" / "chargeiq_full.sql"
    print("\n=== mysqldump ->", out, flush=True)
    cmd = ["mysqldump", "-h127.0.0.1", "-uroot", "-proot", "--routines", "--databases", "chargeiq", "--no-tablespaces",
           "--set-gtid-purged=OFF", "--skip-lock-tables"]
    with open(out, "w") as f:
        r = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, text=True)
    if r.returncode != 0:
        sys.exit("mysqldump failed: " + r.stderr)
    print(f"{out.stat().st_size / 1e6:.1f} MB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-dump", action="store_true")
    ap.add_argument("--skip-notebook", action="store_true")
    ap.add_argument("--skip-excel", action="store_true")
    a = ap.parse_args()
    t0 = time.time()
    run("generate_data.py")
    run("clean_data.py")
    run("load_to_mysql.py")
    run("sentiment.py")
    run("forecast.py")
    run("segmentation.py")
    run("recharge_predictions.py")
    refresh_warehouse()
    run("export_clean.py")
    run("verify_data.py")
    run("visual_report.py")
    if not a.skip_notebook:
        run("make_notebook.py")
    if not a.skip_excel:
        run("make_excel.py")
    run("make_report.py")
    if not a.skip_dump:
        dump()
    print(f"\nAll done in {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
