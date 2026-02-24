import mongoose, { Document, Schema } from 'mongoose';

export type PolicyCondition =
  | 'email_verified'
  | 'account_active'
  | 'owner_match'
  | 'unique_review'
  | 'no_self_vote'
  | 'time_window'
  | 'role_minimum'
  | 'field_equals'
  | 'ownership_check';

export type PolicyEffect = 'allow' | 'deny';

export interface IPolicyConfig {
  ownerField?: string; // for owner_match: 'submittedBy', 'author', '_id', etc.
  mustNotMatch?: boolean; // for ownership_check (inverse of owner_match)
  hours?: number; // for time_window
  minLevel?: number; // for role_minimum
  field?: string; // for field_equals
  value?: unknown; // for field_equals
}

export interface IPolicy extends Document {
  _id: mongoose.Types.ObjectId;
  name: string; // slug: 'email_verified_only', 'owner_match_station', etc.
  displayName: string; // human-readable
  description: string;
  condition: PolicyCondition;
  effect: PolicyEffect;
  config: IPolicyConfig;
  isBuiltIn: boolean; // true for the 13 built-in policies
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const policySchema = new Schema<IPolicy>(
  {
    name: {
      type: String,
      required: [true, 'Policy name is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Policy name must be at least 3 characters'],
      maxlength: [100, 'Policy name must be at most 100 characters'],
      index: true,
    },

    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      maxlength: [100, 'Display name must be at most 100 characters'],
    },

    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [500, 'Description must be at most 500 characters'],
    },

    condition: {
      type: String,
      required: [true, 'Condition is required'],
      enum: {
        values: [
          'email_verified',
          'account_active',
          'owner_match',
          'unique_review',
          'no_self_vote',
          'time_window',
          'role_minimum',
          'field_equals',
          'ownership_check',
        ],
        message: '{VALUE} is not a valid policy condition',
      },
      index: true,
    },

    effect: {
      type: String,
      required: [true, 'Effect is required'],
      enum: {
        values: ['allow', 'deny'],
        message: '{VALUE} is not a valid policy effect',
      },
      default: 'allow',
    },

    config: {
      type: Schema.Types.Mixed,
      default: {},
    },

    isBuiltIn: {
      type: Boolean,
      required: true,
      default: false,
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

// Compound index for active built-in policies
policySchema.index({ isBuiltIn: 1, isActive: 1 });
policySchema.index({ condition: 1, isActive: 1 });

// Prevent deletion of built-in policies
policySchema.pre('deleteOne', { document: true, query: false }, function () {
  if (this.isBuiltIn) {
    throw new Error('Cannot delete built-in policy');
  }
});

const Policy = mongoose.model<IPolicy>('Policy', policySchema);
export default Policy;
