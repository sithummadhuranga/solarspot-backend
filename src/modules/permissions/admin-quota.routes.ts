import { Router } from 'express';
import { Request, Response } from 'express';
import { protect } from '@middleware/auth.middleware';
import { checkPermission } from '@middleware/rbac.middleware';
import QuotaService from '@services/quota.service';
import QuotaUsage from '@modules/permissions/models/quota-usage.model';
import ApiResponse from '@utils/ApiResponse';
import asyncHandler from '@middleware/asyncHandler';

const router = Router();

/**
 * Admin Quota Dashboard Routes
 * 
 * Provides visibility into third-party API usage across:
 * - openweathermap (1000/day)
 * - perspective (1000/day)
 * - brevo (300/day)
 */

/**
 * @swagger
 * /api/admin/quota/dashboard:
 *   get:
 *     summary: Get quota usage dashboard (all services)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.view_quota_dashboard
 *     x-component: permissions
 *     responses:
 *       200:
 *         description: Quota dashboard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     services:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           service:
 *                             type: string
 *                             enum: [openweathermap, perspective, brevo]
 *                           todayCount:
 *                             type: number
 *                           limit:
 *                             type: number
 *                           percentUsed:
 *                             type: number
 *                           remaining:
 *                             type: number
 *                           status:
 *                             type: string
 *                             enum: [healthy, warning, critical, exhausted]
 */
router.get(
  '/dashboard',
  protect,
  checkPermission('system.view_quota_dashboard'),
  asyncHandler(async (_req: Request, res: Response) => {
    const quotaSummary = await QuotaService.getAll();
    ApiResponse.success(res, quotaSummary, 'Quota dashboard retrieved successfully');
  })
);

/**
 * @swagger
 * /api/admin/quota/history:
 *   get:
 *     summary: Get historical quota usage (last 30 days)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.view_quota_dashboard
 *     responses:
 *       200:
 *         description: Quota history retrieved successfully
 */
router.get(
  '/history',
  protect,
  checkPermission('system.view_quota_dashboard'),
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - days);

    const dateStr = thirtyDaysAgo.toISOString().slice(0, 10);

    const history = await QuotaUsage.find({
      date: { $gte: dateStr },
    })
      .sort({ date: -1, service: 1 })
      .lean();

    ApiResponse.success(res, history, 'Quota history retrieved successfully');
  })
);

/**
 * @swagger
 * /api/admin/quota/reset:
 *   post:
 *     summary: Reset quota for a service (testing only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     x-rbac-action: system.reset_quotas
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               service:
 *                 type: string
 *                 enum: [openweathermap, perspective, brevo]
 *     responses:
 *       200:
 *         description: Quota reset successfully
 */
router.post(
  '/reset',
  protect,
  checkPermission('system.reset_quotas'),
  asyncHandler(async (req: Request, res: Response) => {
    const { service } = req.body;

    if (!service || !['openweathermap', 'perspective', 'brevo'].includes(service)) {
      res.status(400).json({
        success: false,
        message: 'Invalid service. Must be: openweathermap, perspective, or brevo',
      });
      return;
    }

    await QuotaService.reset(service);

    ApiResponse.success(
      res,
      { service, resetAt: new Date() },
      'Quota reset successfully (testing only)'
    );
  })
);

export default router;
