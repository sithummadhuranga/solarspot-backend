

import { Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import ApiResponse  from '@utils/ApiResponse';
import AuthService  from './auth.service';
import { AuthRequest } from '@/types';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};


export const register = asyncHandler(async (req, res: Response) => {
  const result = await AuthService.register(req.body);
  return ApiResponse.created(res, result, result.message);
});


export const login = asyncHandler(async (req, res: Response) => {
  const { accessToken, refreshToken, user } = await AuthService.login(req.body);
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  return ApiResponse.success(res, { accessToken, user }, 'Login successful');
});


export const logout = asyncHandler(async (req: AuthRequest, res: Response) => {
  await AuthService.logout(req.user!._id);
  res.clearCookie('refreshToken');
  return ApiResponse.noContent(res);
});


export const refresh = asyncHandler(async (req, res: Response) => {
  const oldRefreshToken: string = req.cookies?.refreshToken;
  if (!oldRefreshToken) {
    return res.status(401).json(ApiResponse.error('UNAUTHORIZED', 'Refresh token missing'));
  }
  const { accessToken, refreshToken, user } = await AuthService.refresh(oldRefreshToken);
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  return ApiResponse.success(res, { accessToken, user }, 'Token refreshed');
});


export const verifyEmail = asyncHandler(async (req, res: Response) => {
  await AuthService.verifyEmail(String(req.params.token));
  return ApiResponse.success(res, null, 'Email verified successfully. Welcome to SolarSpot!');
});


export const forgotPassword = asyncHandler(async (req, res: Response) => {
  await AuthService.forgotPassword(req.body.email);
  return ApiResponse.success(res, null, 'If that email is registered, a reset link has been sent.');
});


export const resetPassword = asyncHandler(async (req, res: Response) => {
  await AuthService.resetPassword(String(req.params.token), req.body.password);
  return ApiResponse.success(res, null, 'Password reset successful. Please log in.');
});
