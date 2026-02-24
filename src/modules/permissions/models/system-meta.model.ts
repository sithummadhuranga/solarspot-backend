import mongoose, { Document, Schema } from 'mongoose';

export interface ISystemMeta extends Document {
  _id: mongoose.Types.ObjectId;
  schemaVersion: string; // '1.0.0'
  seedManifestHash: string; // SHA-256 hash of seeded permission actions
  seededAt: Date | null;
  lastMigrationAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const systemMetaSchema = new Schema<ISystemMeta>(
  {
    schemaVersion: {
      type: String,
      required: [true, 'Schema version is required'],
      default: '1.0.0',
    },

    seedManifestHash: {
      type: String,
      default: null,
    },

    seededAt: {
      type: Date,
      default: null,
    },

    lastMigrationAt: {
      type: Date,
      default: null,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Ensure only one document exists
systemMetaSchema.pre('save', async function () {
  const count = await mongoose.model<ISystemMeta>('SystemMeta').countDocuments();
  if (count > 0 && this.isNew) {
    throw new Error('SystemMeta document already exists — only one allowed');
  }
});

const SystemMeta = mongoose.model<ISystemMeta>('SystemMeta', systemMetaSchema);
export default SystemMeta;
