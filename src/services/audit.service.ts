import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { AuditLog } from '@modules/permissions/audit_log.model';

interface AuditLogInput {
  actorId: string;
  action: string;
  resource: string;
  resourceId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
}

interface AuditLogOptions {
  session?: ClientSession;
}

class AuditService {
  async log(entry: AuditLogInput, options: AuditLogOptions = {}): Promise<void> {
    const actorObjectId = this.toObjectId(entry.actorId);
    if (!actorObjectId) {
      return;
    }

    const resourceObjectId = this.toObjectId(entry.resourceId);

    await AuditLog.create([
      {
        actor: actorObjectId,
        action: entry.action,
        resource: entry.resource,
        resourceId: resourceObjectId,
        before: entry.before,
        after: entry.after,
        ip: entry.ip,
      },
    ], options.session ? { session: options.session } : undefined);
  }

  private toObjectId(value?: string): Types.ObjectId | undefined {
    if (!value || !Types.ObjectId.isValid(value)) {
      return undefined;
    }

    return new Types.ObjectId(value);
  }
}

export default new AuditService();
