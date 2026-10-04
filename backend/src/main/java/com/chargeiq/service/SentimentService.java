package com.chargeiq.service;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chargeiq.entity.enums.SentimentLabel;

/**
 * Tiny rule-based sentiment analyser for station reviews (lexicon + negation + intensifiers).
 * <p>
 * Why not a trained model: it must run offline on a student laptop, be deterministic and explainable in a viva.
 * Algorithm:
 * <ol>
 *   <li>Lower-case the text and split it into clauses (at . , ! ? ; and the words "but"/"however").</li>
 *   <li>Every word found in the lexicon has a weight (+ good for EV charging, - bad), e.g. fast +1, broken -1.5.</li>
 *   <li>Look at the 3 words before it: a negator (not, never, no, ...n't) flips the sign (x -0.75), an
 *       intensifier (very, extremely) multiplies by &gt;1 and a diminisher (slightly) by &lt;1.</li>
 *   <li>Sum all word scores and squash into [-1, 1] with {@code sum / sqrt(sum^2 + 4)} (monotone, smooth, never exceeds 1).</li>
 *   <li>Label: POSITIVE when score &gt;= 0.15, NEGATIVE when score &lt;= -0.05, else NEUTRAL (negative reviews are
 *       flagged earlier on purpose - operators should see complaints quickly).</li>
 * </ol>
 */
@Service
@Transactional
public class SentimentService {
    public static final double POSITIVE_THRESHOLD = 0.15;
    public static final double NEGATIVE_THRESHOLD = -0.05;

    public record SentimentResult(double score, SentimentLabel label) { }

    private static final Map<String, Double> LEXICON = new HashMap<>();
    private static final Map<String, Double> INTENSIFIERS = new HashMap<>();
    private static final Set<String> NEGATORS = Set.of("not", "no", "never", "cannot", "hardly", "barely",
            "without", "neither", "nor", "nothing", "none");
    private static final Set<String> CLAUSE_BREAKERS = Set.of("but", "however", "although", "though", "yet");

    private static void add(double weight, String... words) {
        for (String w : words) {
            LEXICON.put(w, weight);
        }
    }

    static {
        // ---- strongly positive (+1.5) ----
        add(1.5, "excellent", "amazing", "awesome", "fantastic", "superb", "perfect", "best", "flawless", "brilliant",
                "outstanding", "wonderful");
        // ---- positive (+1.0) ----
        add(1.0, "good", "great", "love", "loved", "fast", "faster", "quick", "quickly", "rapid", "smooth", "smoothly",
                "seamless", "clean", "tidy", "spotless", "friendly", "helpful", "polite", "courteous", "supportive",
                "reliable", "dependable", "stable", "spacious", "convenient", "easy", "easily", "simple", "safe",
                "secure", "affordable", "reasonable", "worthwhile", "quiet", "peaceful", "calm", "accurate",
                "responsive", "efficient", "impressive", "pleasant", "comfortable", "nice", "happy", "satisfied",
                "satisfying", "recommend", "recommended", "intuitive", "worth");
        // ---- mildly positive (+0.5) ----
        add(0.5, "ok", "okay", "decent", "fine", "working", "available", "free", "empty", "bright", "lit", "maintained",
                "shaded", "covered", "cheap", "cheaper", "value", "liked", "adequate");
        // ---- strongly negative (-1.5) ----
        add(-1.5, "terrible", "awful", "horrible", "worst", "pathetic", "useless", "broken", "offline", "scam", "fraud",
                "unusable", "disgusting");
        // ---- negative (-1.0) ----
        add(-1.0, "bad", "poor", "disappointing", "disappointed", "disappointment", "slow", "slower", "sluggish", "delay",
                "delayed", "delays", "faulty", "defective", "malfunction", "malfunctioning", "damaged", "dead", "outage",
                "unavailable", "unreliable", "unstable", "glitch", "glitchy", "buggy", "error", "errors", "failed",
                "failure", "fails", "failing", "crash", "crashed", "stuck", "dirty", "filthy", "messy", "smelly",
                "unsafe", "crowded", "overcrowded", "congested", "jammed", "packed", "expensive", "costly", "overpriced",
                "pricey", "overcharged", "overcharging", "rude", "unfriendly", "unhelpful", "arrogant", "impolite",
                "noisy", "cramped", "inconvenient", "difficult", "confusing", "complicated", "problem", "problems",
                "issue", "issues", "trouble", "complaint", "hate", "hated", "annoying", "frustrating", "frustrated",
                "irritating", "waste", "wasted", "avoid", "regret", "worse", "disconnected", "disconnecting", "interrupted",
                "interruption", "unresponsive", "laggy", "refused", "leaking");
        // ---- mildly negative (-0.5 .. -0.8) ----
        add(-0.8, "queue", "queues", "queuing", "blocked");
        add(-0.7, "busy", "waiting", "occupied");
        add(-0.5, "wait", "waited", "crowd", "steep", "dark", "hard", "hang", "hung", "stopped", "down", "lag");

        INTENSIFIERS.put("very", 1.5);
        INTENSIFIERS.put("extremely", 1.8);
        INTENSIFIERS.put("really", 1.4);
        INTENSIFIERS.put("super", 1.5);
        INTENSIFIERS.put("so", 1.3);
        INTENSIFIERS.put("too", 1.3);
        INTENSIFIERS.put("highly", 1.4);
        INTENSIFIERS.put("incredibly", 1.6);
        INTENSIFIERS.put("absolutely", 1.6);
        INTENSIFIERS.put("totally", 1.4);
        INTENSIFIERS.put("utterly", 1.6);
        INTENSIFIERS.put("quite", 1.2);
        INTENSIFIERS.put("slightly", 0.6);
        INTENSIFIERS.put("somewhat", 0.7);
        INTENSIFIERS.put("bit", 0.7);
        INTENSIFIERS.put("little", 0.7);
        INTENSIFIERS.put("fairly", 0.8);
        INTENSIFIERS.put("kinda", 0.7);
    }

    /** Analyses free text. null / blank text is NEUTRAL with score 0. */
    public SentimentResult analyze(String text) {
        if (text == null || text.isBlank()) {
            return new SentimentResult(0.0, SentimentLabel.NEUTRAL);
        }
        String normalised = text.toLowerCase(Locale.ROOT).replace('’', '\'');
        double sum = 0;
        for (String clause : normalised.split("[.,!?;:\\n\\r()]+")) {
            sum += clauseScore(clause);
        }
        double score = sum / Math.sqrt(sum * sum + 4.0);
        score = Math.round(score * 10000.0) / 10000.0;
        return new SentimentResult(score, label(score));
    }

    /** Maps a score in [-1, 1] to a label using the thresholds of the specification. */
    public static SentimentLabel label(double score) {
        if (score >= POSITIVE_THRESHOLD) {
            return SentimentLabel.POSITIVE;
        }
        if (score <= NEGATIVE_THRESHOLD) {
            return SentimentLabel.NEGATIVE;
        }
        return SentimentLabel.NEUTRAL;
    }

    private static double clauseScore(String clause) {
        String[] tokens = clause.trim().split("[^a-z']+");
        double sum = 0;
        for (int i = 0; i < tokens.length; i++) {
            String word = tokens[i].replace("'", "");
            String raw = tokens[i];
            Double weight = LEXICON.get(raw);
            if (weight == null) {
                weight = LEXICON.get(word);
            }
            if (weight == null) {
                continue;
            }
            double value = weight;
            boolean negated = false;
            // look at up to three words before the sentiment word
            for (int k = 1; k <= 3 && i - k >= 0; k++) {
                String prev = tokens[i - k];
                if (CLAUSE_BREAKERS.contains(prev)) {
                    break;
                }
                if (NEGATORS.contains(prev) || prev.endsWith("n't") || prev.endsWith("nt") && isContraction(prev)) {
                    negated = true;
                } else if (INTENSIFIERS.containsKey(prev)) {
                    value *= INTENSIFIERS.get(prev);
                }
            }
            if (negated) {
                value = -0.75 * value;
            }
            sum += value;
        }
        return sum;
    }

    /** "dont", "doesnt", "isnt" ... written without the apostrophe. */
    private static boolean isContraction(String w) {
        return w.equals("dont") || w.equals("doesnt") || w.equals("didnt") || w.equals("isnt") || w.equals("wasnt")
                || w.equals("arent") || w.equals("wont") || w.equals("cant") || w.equals("couldnt") || w.equals("wouldnt")
                || w.equals("havent") || w.equals("hasnt");
    }
}
