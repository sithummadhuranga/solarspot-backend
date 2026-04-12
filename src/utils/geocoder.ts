import axios from 'axios';

export interface GeoResult {
  lat: number;
  lng: number;
  formattedAddress: string;
  street: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  postalCode: string | null;
}


export interface IGeocoder {
  forward(address: string): Promise<GeoResult | null>;
  reverse(lat: number, lng: number): Promise<GeoResult | null>;
}


export class NominatimGeocoder implements IGeocoder {
  async forward(address: string): Promise<GeoResult | null> {
    return forwardGeocode(address);
  }

  async reverse(lat: number, lng: number): Promise<GeoResult | null> {
    return reverseGeocode(lat, lng);
  }
}

const HEADERS = { 'User-Agent': 'SolarSpot/1.0 (contact@solarspot.app)', 'Accept-Language': 'en' };

function parseAddress(addr: Record<string, string>): Pick<GeoResult, 'street' | 'city' | 'district' | 'country' | 'postalCode'> {
  return {
    street:     addr.road ?? addr.pedestrian ?? addr.footway ?? null,
    city:       addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? null,
    district:   addr.state_district ?? addr.county ?? addr.suburb ?? null,
    country:    addr.country ?? null,
    postalCode: addr.postcode ?? null,
  };
}


export async function forwardGeocode(address: string): Promise<GeoResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=1`;
    const { data } = await axios.get<Array<{
      lat: string; lon: string; display_name: string;
      address: Record<string, string>;
    }>>(url, { headers: HEADERS, timeout: 8000 });

    if (!data.length) return null;
    const item = data[0];
    return {
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      formattedAddress: item.display_name,
      ...parseAddress(item.address),
    };
  } catch {
    return null;
  }
}


export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const { data } = await axios.get<{
      display_name: string;
      address: Record<string, string>;
    }>(url, { headers: HEADERS, timeout: 8000 });

    return {
      lat, lng,
      formattedAddress: data.display_name,
      ...parseAddress(data.address),
    };
  } catch {
    return null;
  }
}
