import { config } from '../config/env';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'geocoding' });

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress?: string;
  source: 'cache' | 'google' | 'nominatim' | 'centroid' | 'mock';
}

export interface LegDistance {
  distanceMiles: number;
  durationMinutes: number;
}

/**
 * Common US major metro centroids for instant, deterministic offline geocoding
 * when external providers are unconfigured, rate-limited, or in test environments.
 */
const METRO_CENTROIDS: Record<string, Coordinates> = {
  // Texas / DFW Metroplex (default HVAC test fixtures)
  dallas: { lat: 32.7767, lng: -96.7970 },
  addison: { lat: 32.9618, lng: -96.8292 },
  plano: { lat: 33.0198, lng: -96.6989 },
  frisco: { lat: 33.1507, lng: -96.8236 },
  irving: { lat: 32.8140, lng: -96.9489 },
  richardson: { lat: 32.9483, lng: -96.7299 },
  carrollton: { lat: 32.9537, lng: -96.8903 },
  garland: { lat: 32.9126, lng: -96.6389 },
  fort_worth: { lat: 32.7555, lng: -97.3308 },
  arlington: { lat: 32.7357, lng: -97.1081 },
  austin: { lat: 30.2672, lng: -97.7431 },
  houston: { lat: 29.7604, lng: -95.3698 },
  san_antonio: { lat: 29.4241, lng: -98.4936 },

  // Arizona
  phoenix: { lat: 33.4484, lng: -112.0740 },
  scottsdale: { lat: 33.4942, lng: -111.9261 },
  tempe: { lat: 33.4255, lng: -111.9400 },
  mesa: { lat: 33.4152, lng: -111.8315 },

  // California
  los_angeles: { lat: 34.0522, lng: -118.2437 },
  san_diego: { lat: 32.7157, lng: -117.1611 },
  san_jose: { lat: 37.3382, lng: -121.8863 },
  san_francisco: { lat: 37.7749, lng: -122.4194 },

  // Florida
  miami: { lat: 25.7617, lng: -80.1918 },
  orlando: { lat: 28.5383, lng: -81.3792 },
  tampa: { lat: 27.9506, lng: -82.4572 },

  // East Coast & Midwest
  new_york: { lat: 40.7128, lng: -74.0060 },
  chicago: { lat: 41.8781, lng: -87.6298 },
  atlanta: { lat: 33.7490, lng: -84.3880 },
  denver: { lat: 39.7392, lng: -104.9903 },
};

/** Approximate coordinates by 3-digit US ZIP prefix */
const ZIP3_CENTROIDS: Record<string, Coordinates> = {
  '750': { lat: 33.0198, lng: -96.6989 }, // Plano / North Dallas
  '751': { lat: 32.6100, lng: -96.4800 }, // East DFW
  '752': { lat: 32.7767, lng: -96.7970 }, // Dallas proper
  '753': { lat: 32.7800, lng: -96.8000 }, // Dallas
  '760': { lat: 32.7357, lng: -97.1081 }, // Arlington
  '761': { lat: 32.7555, lng: -97.3308 }, // Fort Worth
  '850': { lat: 33.4484, lng: -112.0740 }, // Phoenix
  '852': { lat: 33.4942, lng: -111.9261 }, // Scottsdale
  '900': { lat: 34.0522, lng: -118.2437 }, // Los Angeles
  '941': { lat: 37.7749, lng: -122.4194 }, // San Francisco
  '100': { lat: 40.7128, lng: -74.0060 }, // Manhattan NYC
  '606': { lat: 41.8781, lng: -87.6298 }, // Chicago
  '331': { lat: 25.7617, lng: -80.1918 }, // Miami
  '303': { lat: 33.7490, lng: -84.3880 }, // Atlanta
  '802': { lat: 39.7392, lng: -104.9903 }, // Denver
};

export class GeocodingService {
  private static cache = new Map<string, GeocodeResult>();

  /**
   * Geocodes a text address to latitude and longitude.
   *
   * Tries in order:
   * 1. In-memory cache
   * 2. Google Geocoding API (if key is set)
   * 3. OpenStreetMap Nominatim (if enabled and key absent)
   * 4. Metro / ZIP centroid lookup (fallback guaranteeing deterministic coordinates)
   */
  public static async geocode(address: string | undefined | null): Promise<GeocodeResult | null> {
    if (!address || typeof address !== 'string' || address.trim().length === 0) {
      return null;
    }

    const cleanAddress = address.trim();
    const cacheKey = cleanAddress.toLowerCase();

    if (this.cache.has(cacheKey)) {
      return { ...this.cache.get(cacheKey)!, source: 'cache' };
    }

    // 1. Google Maps Geocoding API if key configured
    const googleApiKey = (config as any).geocoding?.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY || process.env.MAPS_API_KEY;
    if (googleApiKey) {
      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cleanAddress)}&key=${googleApiKey}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const data: any = await res.json();
          if (data.status === 'OK' && data.results && data.results.length > 0) {
            const loc = data.results[0].geometry.location;
            const result: GeocodeResult = {
              lat: Number(loc.lat),
              lng: Number(loc.lng),
              formattedAddress: data.results[0].formatted_address,
              source: 'google',
            };
            this.cache.set(cacheKey, result);
            return result;
          }
        }
      } catch (err: any) {
        log.warn('Google Geocoding request failed; falling back', { err: err.message, address: cleanAddress });
      }
    }

    // 2. OpenStreetMap Nominatim (non-commercial, dev & live fallback)
    const provider = ((config as any).geocoding?.provider || 'nominatim').toLowerCase();
    if (provider === 'nominatim' && !googleApiKey) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(cleanAddress)}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'USMarketHVACDispatch/1.0 (dispatch-geocoding)' },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data: any = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const result: GeocodeResult = {
              lat: parseFloat(data[0].lat),
              lng: parseFloat(data[0].lon),
              formattedAddress: data[0].display_name,
              source: 'nominatim',
            };
            this.cache.set(cacheKey, result);
            return result;
          }
        }
      } catch (err: any) {
        log.debug('Nominatim request skipped/failed; using centroid', { err: err.message, address: cleanAddress });
      }
    }

    // 3. Fallback: Metro / ZIP centroid lookup
    const centroid = this.resolveCentroid(cleanAddress);
    if (centroid) {
      const result: GeocodeResult = {
        lat: centroid.lat,
        lng: centroid.lng,
        formattedAddress: cleanAddress,
        source: 'centroid',
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    // Default DFW centroid if nothing matched
    const defaultDfw: GeocodeResult = {
      lat: 32.7767,
      lng: -96.7970,
      formattedAddress: cleanAddress,
      source: 'mock',
    };
    this.cache.set(cacheKey, defaultDfw);
    return defaultDfw;
  }

  /**
   * Deterministically resolves coordinates based on zip codes or recognized cities in the string.
   */
  private static resolveCentroid(address: string): Coordinates | null {
    const lower = address.toLowerCase();

    // Check 5-digit ZIP code match
    const zipMatch = lower.match(/\b(\d{5})\b/);
    if (zipMatch) {
      const zip3 = zipMatch[1].substring(0, 3);
      if (ZIP3_CENTROIDS[zip3]) {
        // Add tiny pseudo-random deterministic jitter based on last 2 digits so pins don't stack exactly on 1 pixel
        const jitter = (parseInt(zipMatch[1].substring(3), 10) || 0) * 0.001;
        return {
          lat: ZIP3_CENTROIDS[zip3].lat + jitter,
          lng: ZIP3_CENTROIDS[zip3].lng - jitter,
        };
      }
    }

    // Check city name match
    for (const [city, coords] of Object.entries(METRO_CENTROIDS)) {
      const cityName = city.replace('_', ' ');
      if (lower.includes(cityName)) {
        return coords;
      }
    }

    return null;
  }

  /**
   * Calculates driving distance in miles and estimated travel duration in minutes
   * between two coordinates using the Haversine formula + empirical road winding factor.
   */
  public static calculateDistance(from: Coordinates, to: Coordinates): LegDistance {
    const R = 3958.8; // Radius of the Earth in miles
    const dLat = this.toRadians(to.lat - from.lat);
    const dLng = this.toRadians(to.lng - from.lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(from.lat)) *
        Math.cos(this.toRadians(to.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightLineMiles = R * c;

    // Road network tortuosity factor (US suburban/urban average is ~1.32x straight line)
    const roadWindingFactor = 1.32;
    const distanceMiles = Math.round(straightLineMiles * roadWindingFactor * 10) / 10;

    // Average suburban dispatch speed: ~32 mph (including turns and traffic signals)
    const averageMph = 32;
    const rawMinutes = (distanceMiles / averageMph) * 60;
    // Cap at minimum 2 minutes for any separate stop
    const durationMinutes = Math.max(distanceMiles > 0 ? 2 : 0, Math.round(rawMinutes));

    return {
      distanceMiles,
      durationMinutes,
    };
  }

  /**
   * Orders a list of scheduled stops starting from technician's home base / depot.
   *
   * Honors appointment scheduled times when set (`startAt`), and computes
   * honest cumulative distance and travel times between consecutive stops.
   */
  public static computeRouteItinerary(
    homeBase: { address: string; coordinates?: Coordinates },
    stops: Array<{
      id: string;
      title: string;
      customerName: string;
      address: string;
      coordinates?: Coordinates;
      startAt: Date | string;
      endAt?: Date | string;
      status: string;
    }>
  ): {
    orderedStops: Array<{
      id: string;
      stopNumber: number;
      title: string;
      customerName: string;
      address: string;
      coordinates?: Coordinates;
      startAt: string;
      endAt?: string;
      status: string;
      legFromPrevious: LegDistance;
    }>;
    totalDistanceMiles: number;
    totalDriveTimeMinutes: number;
    homeBase: { address: string; coordinates: Coordinates };
  } {
    const baseCoords: Coordinates = homeBase.coordinates || { lat: 32.7767, lng: -96.7970 };

    // Sort chronologically by start time
    const sorted = [...stops].sort((a, b) => {
      const tA = new Date(a.startAt).getTime();
      const tB = new Date(b.startAt).getTime();
      return tA - tB;
    });

    let currentPos = baseCoords;
    let totalMiles = 0;
    let totalMinutes = 0;

    const orderedStops = sorted.map((stop, index) => {
      const stopCoords = stop.coordinates || baseCoords;
      const leg = this.calculateDistance(currentPos, stopCoords);

      totalMiles += leg.distanceMiles;
      totalMinutes += leg.durationMinutes;
      currentPos = stopCoords;

      return {
        id: stop.id,
        stopNumber: index + 1,
        title: stop.title,
        customerName: stop.customerName,
        address: stop.address,
        coordinates: stop.coordinates,
        startAt: new Date(stop.startAt).toISOString(),
        endAt: stop.endAt ? new Date(stop.endAt).toISOString() : undefined,
        status: stop.status,
        legFromPrevious: leg,
      };
    });

    // Return to base at end of day
    if (orderedStops.length > 0) {
      const returnLeg = this.calculateDistance(currentPos, baseCoords);
      totalMiles += returnLeg.distanceMiles;
      totalMinutes += returnLeg.durationMinutes;
    }

    return {
      orderedStops,
      totalDistanceMiles: Math.round(totalMiles * 10) / 10,
      totalDriveTimeMinutes: totalMinutes,
      homeBase: {
        address: homeBase.address || 'Operations Base',
        coordinates: baseCoords,
      },
    };
  }

  private static toRadians(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
