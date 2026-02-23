/**
 * AuthController — thin HTTP layer. One service call per handler. No business logic.
 *
 * TODO: Member 4 — implement all handlers.
 *
 * Ref: MASTER_PROMPT.md → Architecture Patterns → Controller → Service → Model
 *      "Controllers must: receive HTTP input → call ONE service method → return ApiResponse"
 */

import { Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse  from '@utils/ApiResponse';
import AuthService from './auth.service';
import { AuthRequest } from '@/types';

/** POST /api/auth/register */
export const register = asyncHandler(async (req, res: Response) => {
  // TODO: Member 4
  // const result = await AuthService.register(req.body);
  // res.status(201).json(ApiResponse.success(result, 'Registration successful. Please verify your email.'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'register: not yet implemented'));
});

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res: Response) => {
  // TODO: Member 4
  // const { accessToken, user } = await AuthService.login(req.body);
  // res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'strict' });
  // res.json(ApiResponse.success({ accessToken, user }, 'Login successful'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'login: not yet implemented'));
});

/** POST /api/auth/logout */
export const logout = asyncHandler(async (req: AuthRequest, res: Response) => {
  // TODO: Member 4
  // await AuthService.logout(req.user!._id.toString());
  // res.clearCookie('refreshToken');
  // res.status(204).end();
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'logout: not yet implemented'));
});

/** POST /api/auth/refresh */
export const refresh = asyncHandler(async (req, res: Response) => {
  // TODO: Member 4
  // const { accessToken } = await AuthService.refresh(req.cookies.refreshToken);
  // res.json(ApiResponse.success({ accessToken }, 'Token refreshed'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'refresh: not yet implemented'));
});

/** GET /api/auth/verify-email/:token */
export const verifyEmail = asyncHandler(async (req, res: Response) => {
  // TODO: Member 4
  // await AuthService.verifyEmail(req.params.token);
  // res.json(ApiResponse.success(null, 'Email verified successfully'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'verifyEmail: not yet implemented'));
});

/** POST /api/auth/forgot-password */
export const forgotPassword = asyncHandler(async (req, res: Response) => {
  // TODO: Member 4
  // await AuthService.forgotPassword(req.body.email);
  // res.json(ApiResponse.success(null, 'Password reset email sent'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'forgotPassword: not yet implemented'));
});

/** PATCH /api/auth/reset-password/:token */
export const resetPassword = asyncHandler(async (req, res: Response) => {
  // TODO: Member 4
  // await AuthService.resetPassword(req.params.token, req.body.password);
  // res.json(ApiResponse.success(null, 'Password reset successful'));
  res.status(501).json(ApiResponse.error('NOT_IMPLEMENTED', 'resetPassword: not yet implemented'));
});
