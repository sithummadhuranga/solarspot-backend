/**
 * Station discriminators — ChargingStation and SolarPanel subtypes.
 *
 * These extend the base Station model via Mongoose discriminators so all
 * documents share one `stations` collection but carry subtype-specific fields.
 *
 * Discriminator key field: `stationType`  ("charging_station" | "solar_panel")
 *
 * Usage:
 *   import { ChargingStation, SolarPanel } from './station.discriminators';
 *   const cs = await ChargingStation.create({ ...baseFields, chargePointOperator: 'CEB' });
 *   const sp = await SolarPanel.create({ ...baseFields, panelMake: 'SunPower', tiltAngle: 15 });
 */

import { Schema } from 'mongoose';
import { Station } from './station.model';

// ─── ChargingStation discriminator ───────────────────────────────────────────

export interface IChargingStation {
  stationType: 'charging_station';
  /** Name of the charge-point operator, e.g. "CEB", "Lanka Electricity" */
  chargePointOperator?: string;
  /** Network / roaming membership, e.g. "OCPP", "Hubject" */
  networkProvider?: string;
  /** ISO 15118-compatible plug-and-charge support */
  plugAndCharge?: boolean;
  /** Dynamic pricing per kWh in USD */
  pricePerKwh?: number;
}

const chargingStationSchema = new Schema<IChargingStation>({
  chargePointOperator: { type: String, trim: true, maxlength: 100 },
  networkProvider:     { type: String, trim: true, maxlength: 100 },
  plugAndCharge:       { type: Boolean, default: false },
  pricePerKwh:         { type: Number, min: 0, max: 100 },
});

/**
 * ChargingStation — a solar-powered EV charging station with operator details.
 * Extends base Station with charge-point fields.
 */
export const ChargingStation = Station.discriminator<IChargingStation>(
  'charging_station',
  chargingStationSchema,
);

// ─── SolarPanel discriminator ─────────────────────────────────────────────────

export interface ISolarPanel {
  stationType: 'solar_panel';
  /** Panel manufacturer, e.g. "SunPower", "LONGi" */
  panelMake?: string;
  /** Specific panel model, e.g. "Maxeon 3" */
  panelModel?: string;
  /** Tilt angle from horizontal in degrees (0–90) */
  tiltAngle?: number;
  /** Compass orientation: "North", "South", "East", "West", "NE", etc. */
  orientation?: string;
  /** Number of individual panels in the array */
  panelCount?: number;
  /** Year the panels were installed */
  installYear?: number;
}

const solarPanelSchema = new Schema<ISolarPanel>({
  panelMake:   { type: String, trim: true, maxlength: 100 },
  panelModel:  { type: String, trim: true, maxlength: 100 },
  tiltAngle:   { type: Number, min: 0, max: 90 },
  orientation: {
    type: String,
    enum: ['North', 'South', 'East', 'West', 'NE', 'NW', 'SE', 'SW'],
  },
  panelCount:  { type: Number, min: 1 },
  installYear: { type: Number, min: 2000, max: new Date().getFullYear() + 1 },
});

/**
 * SolarPanel — tracks the physical solar array for stations with detailed
 * panel specifications (make, model, tilt, orientation).
 * Extends base Station with panel-specific fields.
 */
export const SolarPanel = Station.discriminator<ISolarPanel>(
  'solar_panel',
  solarPanelSchema,
);
