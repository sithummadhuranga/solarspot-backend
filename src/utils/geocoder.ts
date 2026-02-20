import axios from 'axios';

interface GeoResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

/**
 * forwardGeocode — converts a human-readable address to coordinates.
 * Uses the free OpenStreetMap Nominatim API (no API key required).
 * TODO: implement full response parsing and error handling
 */
export async function forwardGeocode(address: string): Promise<GeoResult | null> {
  // TODO: call Nominatim API
  // const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  // const { data } = await axios.get(url, { headers: { 'User-Agent': 'SolarSpot/1.0' } });
  // if (!data.length) return null;
  // return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), formattedAddress: data[0].display_name };
  void address;
  void axios;
  return null;
}

/**
 * reverseGeocode — converts coordinates to a human-readable address.
 * TODO: implement using Nominatim reverse endpoint
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeoResult | null> {
  // TODO: call https://nominatim.openstreetmap.org/reverse?lat=..&lon=..&format=json
  void lat;
  void lng;
  return null;
}
