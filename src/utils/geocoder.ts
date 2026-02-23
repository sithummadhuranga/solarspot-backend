import axios from 'axios';

interface GeoResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

export async function forwardGeocode(address: string): Promise<GeoResult | null> {
  void address;
  void axios;
  return null;
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeoResult | null> {
  void lat;
  void lng;
  return null;
}
