/**
 * User / Auth Mongoose model.
 *
 * TODO: Member 4 — implement full schema.
 *
 * Requirements from PROJECT_OVERVIEW.md:
 *   - Indexes: email (unique), role, isActive
 *              emailVerifyToken (sparse), passwordResetToken (sparse), refreshToken (sparse)
 *   - Fields:  password, tokens → select: false
 *   - Hook:    bcrypt pre-save (rounds: 12)
 *   - Method:  toJSON() removes password, tokens, __v
 *   - Soft-delete: isActive + deletedAt + deletedBy
 *
 * ACID notes:
 *   - refreshToken rotation: findOneAndUpdate matching on OLD token value (Isolation rule)
 *   - Write concern: default majority (never override)
 */

import { Schema, model } from 'mongoose';
// TODO: Member 4 — add Document, Types back when defining schema fields (Mongoose requires Document for typed models)
import { IUser } from '@/types';

// TODO: Member 4 — expand this schema with all fields from IUser
const userSchema = new Schema<IUser>(
  {
    // TODO: Member 4
    // displayName:        { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    // email:              { type: String, required: true, unique: true, lowercase: true, trim: true },
    // password:           { type: String, required: true, select: false },
    // role:               { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    // isActive:           { type: Boolean, default: true },
    // isEmailVerified:    { type: Boolean, default: false },
    // isBanned:           { type: Boolean, default: false },
    // emailVerifyToken:   { type: String, select: false },
    // passwordResetToken: { type: String, select: false },
    // refreshToken:       { type: String, select: false },
  },
  { timestamps: true },
);

// TODO: Member 4 — add indexes
// userSchema.index({ email: 1 }, { unique: true });
// userSchema.index({ role: 1 });
// userSchema.index({ isActive: 1 });
// userSchema.index({ emailVerifyToken: 1 }, { sparse: true });
// userSchema.index({ passwordResetToken: 1 }, { sparse: true });
// userSchema.index({ refreshToken: 1 }, { sparse: true });

// TODO: Member 4 — add bcrypt pre-save hook (rounds: 12)

// TODO: Member 4 — add toJSON() to strip sensitive fields

export const User = model<IUser>('User', userSchema);
