import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, CredentialProvider } from '../services/CredentialProvider';

export type WeatherUnits = 'metric' | 'imperial';

export interface WeatherOptions {
  location: string;
  units?: WeatherUnits;
  forecastDays?: number;
}

export interface CurrentWeather {
  location: string;
  latitude: number;
  longitude: number;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  windSpeed: number;
  condition: string;
  isDay: boolean;
  observedAt: string;
  units: WeatherUnits;
}

export interface WeatherResult {
  success: boolean;
  weather?: CurrentWeather;
  error?: string;
}

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const REQUEST_TIMEOUT_MS = 10000;

/** Error carrying the underlying failure as a `cause` (the ES2022 lib is not enabled here). */
class WeatherError extends Error {
  public cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'WeatherError';
    this.cause = cause;
  }
}

/**
 * WMO 4677 weather interpretation codes as published by Open-Meteo.
 */
const WMO_CONDITIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

function describeWeatherCode(code: number): string {
  const exact = WMO_CONDITIONS[code];
  if (exact) return exact;
  return code >= 95 ? 'Thunderstorm' : `Unknown weather condition (WMO code ${code})`;
}

interface GeocodeResponse {
  results?: Array<{
    name?: string;
    latitude?: number;
    longitude?: number;
    country?: string;
    admin1?: string;
    timezone?: string;
  }>;
}

interface ForecastResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    is_day?: number | boolean;
  };
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new WeatherError(`${label} request failed: ${reason}`, err);
  }

  if (!response.ok) {
    let snippet: string;
    try {
      snippet = (await response.text()).slice(0, 200);
    } catch (err) {
      throw new WeatherError(`${label} returned HTTP ${response.status} (response body unreadable)`, err);
    }
    throw new Error(`${label} returned HTTP ${response.status}${snippet ? `: ${snippet}` : ''}`);
  }

  try {
    return (await response.json()) as T;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new WeatherError(`${label} returned a malformed JSON response: ${reason}`, err);
  }
}

export class WeatherExecutor {
  private credentialProvider = CredentialProvider;

  async execute(options: WeatherOptions, _credentials: ToolCredentials): Promise<WeatherResult> {
    const location = typeof options.location === 'string' ? options.location.trim() : '';
    const units: WeatherUnits = options.units === 'imperial' ? 'imperial' : 'metric';

    if (!location) {
      logger.warn({ units }, 'Weather lookup rejected: blank location');
      return { success: false, error: 'Weather location is required' };
    }

    const forecastDays = options.forecastDays;
    if (forecastDays !== undefined && (!Number.isInteger(forecastDays) || forecastDays < 1 || forecastDays > 7)) {
      return { success: false, error: 'forecastDays must be an integer between 1 and 7' };
    }

    logger.info({ location, units, forecastDays }, 'Weather lookup started');

    try {
      const geoParams = new URLSearchParams({
        name: location,
        count: '1',
        language: 'en',
        format: 'json',
      });
      const geocode = await fetchJson<GeocodeResponse>(`${GEOCODE_URL}?${geoParams.toString()}`, 'Geocoding');
      const place = geocode.results && geocode.results[0];

      if (!place || typeof place.latitude !== 'number' || typeof place.longitude !== 'number') {
        logger.warn({ location }, 'Geocoding returned no results');
        return { success: false, error: `No location found for '${location}'` };
      }

      const forecastParams = new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        current: [
          'temperature_2m',
          'relative_humidity_2m',
          'apparent_temperature',
          'precipitation',
          'weather_code',
          'wind_speed_10m',
          'is_day',
        ].join(','),
        timezone: 'UTC',
      });
      if (forecastDays !== undefined) {
        forecastParams.set('forecast_days', String(forecastDays));
      }
      if (units === 'imperial') {
        forecastParams.set('temperature_unit', 'fahrenheit');
        forecastParams.set('wind_speed_unit', 'mph');
      }

      const forecast = await fetchJson<ForecastResponse>(`${FORECAST_URL}?${forecastParams.toString()}`, 'Forecast');
      const current = forecast.current;
      if (!current) {
        throw new Error('Forecast response did not include a current-conditions block');
      }

      const placeName = [place.name, place.admin1, place.country].filter(Boolean).join(', ') || location;
      const weatherCode = typeof current.weather_code === 'number' ? current.weather_code : -1;
      const isDay = current.is_day === 1 || current.is_day === true;

      const weather: CurrentWeather = {
        location: placeName,
        latitude: place.latitude,
        longitude: place.longitude,
        temperature: current.temperature_2m ?? 0,
        apparentTemperature: current.apparent_temperature ?? 0,
        humidity: current.relative_humidity_2m ?? 0,
        precipitation: current.precipitation ?? 0,
        windSpeed: current.wind_speed_10m ?? 0,
        condition: describeWeatherCode(weatherCode),
        isDay,
        observedAt: current.time ?? new Date().toISOString(),
        units,
      };

      logger.info({ location: placeName, condition: weather.condition, units }, 'Weather lookup completed');
      return { success: true, weather };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ location, error }, 'Weather lookup failed');
      return { success: false, error };
    }
  }
}
