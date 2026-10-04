package com.chargeiq.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.chargeiq.entity.enums.SentimentLabel;

/** Plain unit tests (no Spring context) for the lexicon-based sentiment analyser. */
class SentimentServiceTest {
    private final SentimentService service = new SentimentService();

    @Test
    void blankAndNullAreNeutral() {
        assertEquals(SentimentLabel.NEUTRAL, service.analyze(null).label());
        assertEquals(0.0, service.analyze("   ").score());
    }

    @Test
    void positiveReview() {
        var r = service.analyze("Very fast charging, clean station and friendly staff!");
        assertEquals(SentimentLabel.POSITIVE, r.label());
        assertTrue(r.score() > 0.5 && r.score() <= 1.0);
    }

    @Test
    void negativeReview() {
        var r = service.analyze("Charger was broken and the app is slow. Terrible experience.");
        assertEquals(SentimentLabel.NEGATIVE, r.label());
        assertTrue(r.score() < -0.5 && r.score() >= -1.0);
    }

    @Test
    void negationFlipsPolarity() {
        assertEquals(SentimentLabel.NEGATIVE, service.analyze("not good").label());
        assertEquals(SentimentLabel.POSITIVE, service.analyze("not slow at all").label());
        assertEquals(SentimentLabel.POSITIVE, service.analyze("no queue").label());
        assertEquals(SentimentLabel.NEGATIVE, service.analyze("it doesn't work well, isn't reliable").label());
    }

    @Test
    void intensifierStrengthensScore() {
        double plain = service.analyze("good").score();
        double strong = service.analyze("very good").score();
        assertTrue(strong > plain);
    }

    @Test
    void neutralTextWithoutOpinionWords() {
        var r = service.analyze("I charged my car at 6 pm on Saturday");
        assertEquals(SentimentLabel.NEUTRAL, r.label());
        assertEquals(0.0, r.score());
    }

    @Test
    void clauseBreakerStopsNegation() {
        // "not" must not reach across "but"
        assertEquals(SentimentLabel.POSITIVE, service.analyze("not crowded but fast and clean").label());
    }

    @Test
    void thresholds() {
        assertEquals(SentimentLabel.POSITIVE, SentimentService.label(0.15));
        assertEquals(SentimentLabel.NEUTRAL, SentimentService.label(0.14));
        assertEquals(SentimentLabel.NEUTRAL, SentimentService.label(-0.04));
        assertEquals(SentimentLabel.NEGATIVE, SentimentService.label(-0.05));
    }

    @Test
    void scoreStaysWithinBounds() {
        String many = "excellent amazing awesome fantastic superb perfect best ".repeat(20);
        double s = service.analyze(many).score();
        assertTrue(s <= 1.0 && s > 0.99);
    }
}
