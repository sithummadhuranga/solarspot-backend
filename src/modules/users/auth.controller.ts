import { Request, Response } from 'express';
import asyncHandler from '@middleware/asyncHandler';
import * as authService from '@modules/users/auth.service';
import ApiResponse from '@utils/ApiResponse';


const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, displayName } = req.body;
  const user = await authService.register(email, password, displayName);
  ApiResponse.created(res, user, 'Registration successful. Please verify your email.');
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const token = req.params.token as string;
  const { accessToken, refreshToken, user } = await authService.verifyEmail(token);
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  ApiResponse.success(res, { accessToken, user }, 'Email verified successfully');
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const { accessToken, refreshToken, user } = await authService.login(email, password);
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  ApiResponse.success(res, { accessToken, user }, 'Login successful');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout((req.user as { _id: string })._id.toString());
  res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict' });
  ApiResponse.noContent(res);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const incomingRefreshToken: string | undefined = req.cookies?.refreshToken;
  if (!incomingRefreshToken) {
    res.status(401).json({ success: false, message: 'No refresh token provided' });
    return;
  }
  const { accessToken, refreshToken } = await authService.refreshAccessToken(incomingRefreshToken);
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  ApiResponse.success(res, { accessToken }, 'Token refreshed');
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  const result = await authService.forgotPassword(email);
  ApiResponse.success(res, null, result.message);
});


export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const token = req.params.token as string;
  const { password } = req.body;
  await authService.resetPassword(token, password);
  res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict' });
  ApiResponse.success(res, null, 'Password has been reset. Please log in again.');
});
