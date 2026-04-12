

export type SolarIndex = 'excellent' | 'good' | 'moderate' | 'poor' | 'unavailable';

export interface WeatherData {
  stationId: string;
  fetchedAt: Date;
  temperature: number;       // Celsius
  humidity: number;          // 0–100 %
  cloudCover: number;        // 0–100 %
  uvIndex: number;
  solarIrradiance?: number;  // W/m² estimated from cloud cover + UV
  solarIndex: SolarIndex;
  description: string;       // e.g. "clear sky"
  icon: string;              // OpenWeatherMap icon code
  windSpeed: number;         // m/s
  _raw?: Record<string, unknown>;
}

export interface ForecastSlot {
  timestamp: Date;
  temperature: number;
  cloudCover: number;
  uvIndex: number;
  solarIndex: SolarIndex;
  precipitation: number;    // mm
}

export interface BestTimeSlot {
  date: string;             // ISO date string
  startHour: number;        // e.g. 10 (10:00)
  endHour: number;          // e.g. 14 (14:00)
  solarIndex: SolarIndex;
  reason: string;           // human-readable explanation
}

export interface HeatmapPoint {
  stationId: string;
  lat: number;
  lng: number;
  solarIndex: SolarIndex;
  uvIndex: number;
  cloudCover: number;
}

export interface BulkRefreshInput {
  stationIds?: string[];  // if omitted, refreshes all approved stations
  force?: boolean;         // bypass cache TTL
}

export interface WeatherExportQuery {
  stationId?: string;
  from?: string;  // ISO date
  to?: string;    // ISO date
  format?: 'json' | 'csv';
}
