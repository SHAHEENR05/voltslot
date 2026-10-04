"""Step 4 - sentiment analysis of review comments (TextBlob polarity, no NLTK downloads).

Labels: POSITIVE >= POS_T, NEGATIVE <= NEG_T, else NEUTRAL (thresholds tuned for ~70/15/15 split on this corpus).
Updates reviews, station aggregates (avg_rating, review_count, sentiment_score, reliability_score) and sentiment_keywords.
"""
import re
from collections import Counter
import pandas as pd
from textblob import TextBlob
from common import *

POS_T, NEG_T = 0.14, -0.08
STOP = set("""a about above after again all also am an and any are as at be because been before being below between both but by can could did do does
doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my myself
no nor not of off on once only or other our out over own same she should so some such than that the their them then there these they this those through
to too under until up very was we were what when where which while who whom why will with would you your yours get got went going one two three really
exactly however overall plus honestly instead even still much many without least again ever nothing everything anything someone slot slots""".split())


def polarity(text):
    return TextBlob(text).sentiment.polarity


def label(p, pos_t=POS_T, neg_t=NEG_T):
    return "POSITIVE" if p >= pos_t else ("NEGATIVE" if p <= neg_t else "NEUTRAL")


def main(conn=None, verbose=True):
    own = conn is None
    conn = conn or get_conn()
    rv = query("SELECT id, station_id, rating, comment FROM reviews", conn=conn)
    rv["score"] = rv["comment"].map(polarity).round(4)
    rv["label"] = rv["score"].map(label)
    cur = conn.cursor()
    cur.executemany("UPDATE reviews SET sentiment_score=%s, sentiment_label=%s WHERE id=%s",
                    [(float(s), l, int(i)) for s, l, i in zip(rv.score, rv.label, rv.id)])
    # station aggregates
    agg = rv.groupby("station_id").agg(avg_rating=("rating", "mean"), n=("rating", "size"), sent=("score", "mean"))
    stn = query("SELECT id, uptime_pct FROM stations", conn=conn)
    rows = []
    for r in stn.itertuples():
        if r.id in agg.index:
            a = agg.loc[r.id]
            rel = 0.5 * (a.avg_rating / 5 * 100) + 0.3 * ((a.sent + 1) / 2 * 100) + 0.2 * r.uptime_pct
            rows.append((round(float(a.avg_rating), 2), int(a.n), round(float(a.sent), 3), round(float(rel), 1), int(r.id)))
        else:
            rows.append((0.0, 0, 0.0, round(0.5 * 70 + 0.3 * 50 + 0.2 * float(r.uptime_pct), 1), int(r.id)))
    cur.executemany("UPDATE stations SET avg_rating=%s, review_count=%s, sentiment_score=%s, reliability_score=%s WHERE id=%s", rows)
    # keywords
    cur.execute("DELETE FROM sentiment_keywords")
    kw = []
    for lab in ("POSITIVE", "NEGATIVE"):
        c = Counter()
        for txt in rv.loc[rv.label == lab, "comment"]:
            for w in re.findall(r"[a-z]{3,}", txt.lower()):
                if w not in STOP:
                    c[w] += 1
        kw += [(lab, w, n) for w, n in c.most_common(25)]
    cur.executemany("INSERT INTO sentiment_keywords (label, word, freq) VALUES (%s,%s,%s)", kw)
    conn.commit()
    if verbose:
        print(rv.label.value_counts(normalize=True).round(3).to_dict(), "mean rating", round(rv.rating.mean(), 2))
        print(rv.groupby("rating").score.mean().round(3).to_dict())
    if own:
        conn.close()
    return rv


if __name__ == "__main__":
    main()
