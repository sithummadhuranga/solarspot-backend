import mongoose, { Document, Schema } from 'mongoose';

export interface IPermission extends Document {
  _id: mongoose.Types.ObjectId;
  action: string; // 'stations.create', 'reviews.moderate', etc.
  resource: string; // 'Station', 'Review', 'User', etc.
  component: string; // 'stations', 'reviews', 'weather', 'users', 'permissions', 'system'
  description: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const permissionSchema = new Schema<IPermission>(
  {
    action: {
      type: String,
      required: [true, 'Action is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Action must be at least 3 characters'],
      maxlength: [100, 'Action must be at most 100 characters'],
      index: true,
      validate: {
        validator: (v: string) => /^[a-z]+\.[a-z-]+$/.test(v),
        message: 'Action must follow format: resource.action (e.g., stations.create)',
      },
    },

    resource: {
      type: String,
      required: [true, 'Resource is required'],
      trim: true,
      maxlength: [50, 'Resource must be at most 50 characters'],
      index: true,
    },

    component: {
      type: String,
      required: [true, 'Component is required'],
      enum: {
        values: ['stations', 'reviews', 'weather', 'users', 'permissions', 'system'],
        message: '{VALUE} is not a valid component',
      },
      index: true,
    },

    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [500, 'Description must be at most 500 characters'],
    },

    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound indexes for permission lookups
permissionSchema.index({ component: 1, isActive: 1 });
permissionSchema.index({ resource: 1, isActive: 1 });

const Permission = mongoose.model<IPermission>('Permission', permissionSchema);
export default Permission;
