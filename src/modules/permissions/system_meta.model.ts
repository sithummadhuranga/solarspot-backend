/**
 * SystemMeta model — singleton document storing system-wide metadata.
 *
 * Ref: PROJECT_OVERVIEW.md → Data Models → SystemMeta
 *      src/seed/00_system_meta.ts — seeded on first run
 */

import { Schema, model, Document } from 'mongoose';

export interface ISystemMeta extends Document {
  schemaVersion:    string;
  seedManifestHash: string;
  seededAt:         Date;
}

const systemMetaSchema = new Schema<ISystemMeta>(
  {
    schemaVersion: {
      type: String,
      required: true,
      default: '1.0.0',
    },
    seedManifestHash: {
      type: String,
      required: true,
    },
    seededAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

export const SystemMeta = model<ISystemMeta>('SystemMeta', systemMetaSchema);
