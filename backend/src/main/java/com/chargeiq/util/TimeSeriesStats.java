package com.chargeiq.util;

/**
 * Small, dependency-free time-series maths used by the analytics module (easy to explain in a viva and unit-testable).
 *
 * <ul>
 *   <li>{@link #holtWinters} - additive Holt-Winters ("triple exponential smoothing") with a weekly season. The three
 *       smoothing constants are chosen by a tiny grid search that minimises the one-step-ahead squared error, which is why
 *       we call it "Holt-Winters-lite". Too little history falls back to a seasonal-naive forecast (same weekday average).</li>
 *   <li>{@link #rollingZScore} - z-score of each point against the mean / standard deviation of the previous N points
 *       (used to flag anomalies, e.g. |z| &gt;= 2.2).</li>
 * </ul>
 */
public final class TimeSeriesStats {
    private TimeSeriesStats() { }

    /** Forecast result: arrays have one entry per future step (step 1 = the day after the last observation). */
    public record Forecast(double[] predicted, double[] lower, double[] upper, String method) { }

    private static final double[] ALPHAS = {0.1, 0.2, 0.3, 0.5};
    private static final double[] BETAS = {0.0, 0.02, 0.05};
    private static final double[] GAMMAS = {0.1, 0.2, 0.4};
    private static final double Z95 = 1.96;

    /**
     * Forecasts {@code horizon} steps ahead of the series {@code y}.
     *
     * @param y       observations in time order (e.g. sessions per day)
     * @param season  season length (7 for daily data with a weekly pattern)
     * @param horizon number of future steps
     */
    public static Forecast holtWinters(double[] y, int season, int horizon) {
        int n = y.length;
        if (n < 2 * season) {
            return seasonalNaive(y, season, horizon);
        }
        double bestSse = Double.MAX_VALUE;
        double[] best = null;
        for (double a : ALPHAS) {
            for (double b : BETAS) {
                for (double g : GAMMAS) {
                    double[] r = run(y, season, a, b, g, horizon);
                    double sse = r[r.length - 1];
                    if (sse < bestSse) {
                        bestSse = sse;
                        best = r;
                    }
                }
            }
        }
        // layout of r: [pred_1..pred_h, sigma, sse]
        double sigma = best[horizon];
        double[] pred = new double[horizon];
        double[] lo = new double[horizon];
        double[] hi = new double[horizon];
        for (int h = 0; h < horizon; h++) {
            pred[h] = Math.max(0, best[h]);
            double band = Z95 * sigma * Math.sqrt(1 + 0.05 * h); // uncertainty grows slowly with the horizon
            lo[h] = Math.max(0, pred[h] - band);
            hi[h] = pred[h] + band;
        }
        return new Forecast(pred, lo, hi, "HOLT_WINTERS_ADDITIVE");
    }

    /** One pass of additive Holt-Winters; returns [forecasts..., sigma of recent residuals, total squared error]. */
    private static double[] run(double[] y, int m, double alpha, double beta, double gamma, int horizon) {
        int n = y.length;
        double mean1 = 0;
        double mean2 = 0;
        for (int i = 0; i < m; i++) {
            mean1 += y[i];
            mean2 += y[m + i];
        }
        mean1 /= m;
        mean2 /= m;
        double b = (mean2 - mean1) / m;
        double l = mean1 + b * (m - 1) / 2.0;                 // level at the end of the first season
        double[] s = new double[m];
        for (int i = 0; i < m; i++) {
            s[i] = y[i] - (mean1 + b * (i - (m - 1) / 2.0));  // detrended first season = initial seasonal indices
        }
        double sse = 0;
        double[] errors = new double[n];
        int nErr = 0;
        for (int t = m; t < n; t++) {
            double yhat = l + b + s[t % m];
            double e = y[t] - yhat;
            sse += e * e;
            errors[nErr++] = e;
            double lNew = alpha * (y[t] - s[t % m]) + (1 - alpha) * (l + b);
            b = beta * (lNew - l) + (1 - beta) * b;
            s[t % m] = gamma * (y[t] - lNew) + (1 - gamma) * s[t % m];
            l = lNew;
        }
        int from = Math.max(0, nErr - 56);                    // sigma from the last 8 weeks of one-step errors
        double sq = 0;
        for (int i = from; i < nErr; i++) {
            sq += errors[i] * errors[i];
        }
        double sigma = nErr - from == 0 ? 0 : Math.sqrt(sq / (nErr - from));
        double[] out = new double[horizon + 2];
        for (int h = 1; h <= horizon; h++) {
            out[h - 1] = l + h * b + s[(n + h - 1) % m];
        }
        out[horizon] = sigma;
        out[horizon + 1] = sse;
        return out;
    }

    /** Fallback: forecast = average of the last (up to 4) observations that fell on the same weekday position. */
    static Forecast seasonalNaive(double[] y, int season, int horizon) {
        int n = y.length;
        double[] pred = new double[horizon];
        double[] lo = new double[horizon];
        double[] hi = new double[horizon];
        double sd = n < 2 ? 0 : std(y, 0, n);
        double overall = n == 0 ? 0 : mean(y, 0, n);
        for (int h = 0; h < horizon; h++) {
            double sum = 0;
            int cnt = 0;
            int idx = n - season + (h % season);
            while (idx >= 0 && cnt < 4) {
                if (idx < n) {
                    sum += y[idx];
                    cnt++;
                }
                idx -= season;
            }
            pred[h] = cnt == 0 ? overall : sum / cnt;
            double band = Z95 * sd;
            lo[h] = Math.max(0, pred[h] - band);
            hi[h] = pred[h] + band;
        }
        return new Forecast(pred, lo, hi, "SEASONAL_NAIVE");
    }

    /**
     * z-score of y[i] versus the previous {@code window} values (needs at least {@code minHistory} of them).
     * Entries without enough history, or with zero variance, are NaN.
     */
    public static double[] rollingZScore(double[] y, int window, int minHistory) {
        double[] z = new double[y.length];
        for (int i = 0; i < y.length; i++) {
            int from = Math.max(0, i - window);
            int cnt = i - from;
            if (cnt < minHistory) {
                z[i] = Double.NaN;
                continue;
            }
            double sd = std(y, from, i);
            z[i] = sd == 0 ? Double.NaN : (y[i] - mean(y, from, i)) / sd;
        }
        return z;
    }

    /** Mean of y[from, to). */
    public static double mean(double[] y, int from, int to) {
        double sum = 0;
        for (int i = from; i < to; i++) {
            sum += y[i];
        }
        return to > from ? sum / (to - from) : 0;
    }

    /** Sample standard deviation (n-1) of y[from, to). */
    public static double std(double[] y, int from, int to) {
        int n = to - from;
        if (n < 2) {
            return 0;
        }
        double m = mean(y, from, to);
        double sq = 0;
        for (int i = from; i < to; i++) {
            sq += (y[i] - m) * (y[i] - m);
        }
        return Math.sqrt(sq / (n - 1));
    }
}
