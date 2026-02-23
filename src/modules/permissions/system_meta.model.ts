/**
 * SystemMeta model — singleton document storing system-wide metadata.
 *
 * TODO: Member 4 — implement fields. Only ONE document should exist (use upsert pattern).
 *
 * Ref: PROJECT_OVERVIEW.md → Data Models → SystemMeta
 *      src/seed/00_system_meta.ts — seeded on first run
 */

import { Schema, model, Document } from 'mongoose';

export interface ISystemMeta extends Document {
  schemaVersion:  string;   // e.g. '1.0.0'
  seededAt?:      Date;
  lastMigration?: string;
  featureFlags?:  Record<string, boolean>;
}

const systemMetaSchema = new Schema<ISystemMeta>(
  {
    // schemaVersion:  { type: String, required: true },
    // seededAt:       { type: Date },
    // lastMigration:  { type: String },
    // featureFlags:   { type: Map, of: Boolean, default: {} },
  },
  { timestamps: true },
);

export const SystemMeta = model<ISystemMeta>('SystemMeta', systemMetaSchema);
