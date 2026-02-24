import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  actor: mongoose.Types.ObjectId; // ref: User (who performed the action)
  action: string; // 'stations.approve', 'permissions.assign', etc.
  resource: string; // 'Station', 'Review', 'User', 'Permission', etc.
  resourceId: mongoose.Types.ObjectId | null; // ID of the affected document
  before: Record<string, unknown> | null; // state before change
  after: Record<string, unknown> | null; // state after change
  metadata: Record<string, unknown>; // additional context (IP, user agent, etc.)
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Actor is required'],
      index: true,
    },

    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
      maxlength: [100, 'Action must be at most 100 characters'],
      index: true,
    },

    resource: {
      type: String,
      required: [true, 'Resource is required'],
      trim: true,
      maxlength: [50, 'Resource must be at most 50 characters'],
      index: true,
    },

    resourceId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    before: {
      type: Schema.Types.Mixed,
      default: null,
    },

    after: {
      type: Schema.Types.Mixed,
      default: null,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // append-only, no updates
    versionKey: false,
  }
);

// Compound indexes for audit log queries
auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

// TTL index: delete logs after 90 days
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

// Prevent updates (append-only)
auditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('Audit logs are immutable — updates not allowed');
});

auditLogSchema.pre('updateOne', function () {
  throw new Error('Audit logs are immutable — updates not allowed');
});

const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
export default AuditLog;
