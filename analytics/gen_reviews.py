"""Template-based review text generator (SYNTHETIC). Mixes clauses across topics; rating and sentiment correlated but noisy."""
import numpy as np

T = {
    "speed": {
        "pos": ["The charger was really fast and I got a great top-up in no time.", "Charging speed was excellent, reached 80% much quicker than expected.",
                "Super fast charging, the DC charger worked perfectly.", "Charging was quick and smooth from start to finish."],
        "neg": ["The charging speed was terribly slow today.", "Charger delivered much lower power than advertised, really slow and disappointing.",
                "It was so slow that the session took twice as long as estimated.", "Charging kept dropping in speed, a bad experience."],
        "neu": ["Charging speed was as expected for this charger.", "Speed was okay, about what the app estimated."]},
    "clean": {
        "pos": ["The station is clean and well maintained.", "Very clean bay and a nice neat cable setup.", "Great, tidy and well lit charging area."],
        "neg": ["The area was dirty and badly maintained.", "Cables were dirty and the bay was filthy, poor upkeep.", "Bad lighting and a dirty parking bay."],
        "neu": ["The station looked average.", "Bay was fine, nothing special."]},
    "wait": {
        "pos": ["No waiting at all, my booked slot was ready on time.", "Zero wait, the slot was free exactly as booked.", "Got my slot instantly, very convenient."],
        "neg": ["I had to wait a long time because the previous car overstayed.", "Long wait even with a booking, really frustrating.",
                "The queue was terrible, waited far too long for my slot."],
        "neu": ["Had a short wait of a few minutes.", "Waited briefly before plugging in."]},
    "app": {
        "pos": ["Booking through the app was easy and the reminder was helpful.", "The app made slot booking simple and smooth.",
                "Loved the recharge reminder, really handy and accurate.", "Easy booking and clear estimate in the app."],
        "neg": ["The app was confusing and the booking screen kept freezing.", "Booking flow was annoying and the slot disappeared.",
                "App notifications were late and unhelpful."],
        "neu": ["Booking through the app was fine.", "The app worked okay."]},
    "price": {
        "pos": ["Pricing is fair and the off-peak discount is great.", "Good value, the tariff is reasonable.", "Cheaper than other chargers nearby, nice."],
        "neg": ["Pricing is too high during peak hours, overpriced.", "Felt expensive for the energy I got.", "The peak tariff is a bad deal."],
        "neu": ["Price was in line with other stations.", "Tariff was standard."]},
    "parking": {
        "pos": ["Parking was easy and covered, very convenient.", "Plenty of parking space and a safe location.", "Good parking right next to the charger."],
        "neg": ["Parking was tight and an ICE car was blocking the bay.", "Hard to find parking, really annoying.", "Bay was blocked by a petrol car, frustrating."],
        "neu": ["Parking was average.", "Found parking without trouble."]},
    "staff": {
        "pos": ["The staff were friendly and helpful.", "Operator on site was polite and quick to help.", "Great support from the attendant."],
        "neg": ["Staff were rude and unhelpful.", "Nobody at the station to help, poor support.", "The attendant was rude and ignored my problem."],
        "neu": ["Staff were around if needed.", "Did not need any help from staff."]},
    "fault": {
        "pos": ["Connector latched properly and worked without any issue.", "No connector problems at all, everything worked well.",
                "Plug fit perfectly and the session started instantly."],
        "neg": ["The connector was broken and would not latch.", "Charger kept showing an error, the cable is damaged and unreliable.",
                "Connector fault again, the charger was dead and I had to switch bays.", "Broken connector and a faulty screen, terrible."],
        "neu": ["Connector took a couple of tries to latch."]},
    "payment": {
        "pos": ["Payment through UPI was instant and the invoice was clear.", "Wallet payment worked smoothly with a clear invoice.",
                "Easy payment and a quick refund for the cancellation."],
        "neg": ["Payment failed twice and the refund was delayed, bad experience.", "UPI payment kept failing, really annoying.",
                "Charged twice and the refund took ages, terrible."],
        "neu": ["Payment went through.", "Invoice arrived by email."]},
}
TOPICS = list(T)
LINK = ["", "", "Also, ", "Overall, ", "However, ", "Plus, ", "Honestly, "]
FILL = ["Will use again.", "Good to know it is near my office.", "Used it on my way back home.", "Visited on a weekend.", "Charged my EV here."]
POOR_NEG_TOPICS = ["fault", "wait", "speed", "clean"]


def _words(s):
    return len(s.split())


def make_review(rng, rating, poor):
    """Return a comment (8-30 words) whose clause polarity follows the rating (noisily)."""
    k = int(rng.choice([2, 3], p=[.6, .4]))
    # polarity mix by rating
    if rating == 5:
        pols = ["pos"] * k
        if rng.random() < .10:
            pols[-1] = "neu"
    elif rating == 4:
        pols = ["pos"] * (k - 1) + [("neg" if rng.random() < .22 else "neu")]
    elif rating == 3:
        pols = ["pos", "neg"] + (["neu"] if k == 3 else [])
        if rng.random() < .3:
            pols = ["neu", "neg"] + (["neu"] if k == 3 else [])
    elif rating == 2:
        pols = ["neg", "neg"] + (["neu"] if k == 3 else [])
        if rng.random() < .25:
            pols = ["neg", "pos"] + (["neg"] if k == 3 else [])
    else:
        pols = ["neg"] * k
    if rng.random() < .06:  # sarcasm / noise: flip one clause
        i = int(rng.integers(0, k))
        pols[i] = "neg" if pols[i] == "pos" else "pos"
    rng.shuffle(pols)
    topics = []
    for pol in pols:
        if poor and pol == "neg" and rng.random() < .7:
            cands = [t for t in POOR_NEG_TOPICS if t not in topics]
        else:
            cands = [t for t in TOPICS if t not in topics]
        topics.append(str(rng.choice(cands)))
    parts = []
    for i, (t, pol) in enumerate(zip(topics, pols)):
        bank = T[t].get(pol) or T[t]["neu"]
        s = str(rng.choice(bank))
        if i > 0:
            link = str(rng.choice(LINK))
            if link and (pol == "neg") != (pols[i - 1] == "neg"):
                link = "However, "
            s = link + (s[0].lower() + s[1:] if link else s)
        parts.append(s)
    txt = " ".join(parts)
    while _words(txt) > 30 and len(parts) > 1:
        parts.pop()
        txt = " ".join(parts)
    if _words(txt) < 8:
        txt += " " + str(rng.choice(FILL))
    return txt
