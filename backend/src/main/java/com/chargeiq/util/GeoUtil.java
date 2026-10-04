package com.chargeiq.util;

/** Small geographic helpers (great-circle distance and bounding boxes). */
public final class GeoUtil {
    private static final double EARTH_RADIUS_KM = 6371.0088;

    private GeoUtil() { }

    /** Haversine distance between two WGS-84 points in kilometres. */
    public static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1.0, Math.sqrt(a)));
    }

    /** Latitude span (degrees) that covers {@code km} kilometres. */
    public static double latDegrees(double km) {
        return km / 111.0;
    }

    /** Longitude span (degrees) that covers {@code km} kilometres at the given latitude. */
    public static double lonDegrees(double km, double atLat) {
        double c = Math.max(0.1, Math.cos(Math.toRadians(atLat)));
        return km / (111.32 * c);
    }

    /**
     * Projects point P on the straight line A->B. Returns {alongKm, crossKm}: how far along the line (from A)
     * the projection lies and how far P is away from the line. Uses a local flat-earth approximation which is
     * accurate enough for city/state scale trips.
     */
    public static double[] projectOnLine(double aLat, double aLon, double bLat, double bLon, double pLat, double pLon) {
        double kx = 111.32 * Math.cos(Math.toRadians(aLat));
        double ky = 111.0;
        double bx = (bLon - aLon) * kx, by = (bLat - aLat) * ky;
        double px = (pLon - aLon) * kx, py = (pLat - aLat) * ky;
        double len2 = bx * bx + by * by;
        if (len2 == 0) {
            return new double[]{0, Math.hypot(px, py)};
        }
        double t = (px * bx + py * by) / len2;
        double along = t * Math.sqrt(len2);
        double cross = Math.abs(px * by - py * bx) / Math.sqrt(len2);
        return new double[]{along, cross};
    }
}
