

import { Router, Request, Response, NextFunction } from 'express';
import { Document }            from 'mongoose';
import { protect, optionalAuth } from '@middleware/auth.middleware';
import { checkPermission }     from '@middleware/rbac.middleware';
import { validate }            from '@middleware/validate.middleware';
import * as UserController     from './user.controller';
import * as V                  from './user.validation';

const router = Router();


const attachSelf = (
  req: Request & { resource?: Document },
  _res: Response,
  next: NextFunction,
): void => {
  if (req.user) {
    req.resource = { _id: req.user._id } as unknown as Document;
  }
  next();
};

router.get('/me',    protect, attachSelf, checkPermission('users.read-own'),  UserController.getMe);
router.put('/me',    protect, attachSelf, checkPermission('users.edit-own'),  validate(V.updateMeSchema), UserController.updateMe);
router.delete('/me', protect, attachSelf, checkPermission('users.edit-own'),  UserController.deleteMe);

router.get('/',     protect, checkPermission('users.read-list'),  UserController.listUsers);
router.get('/:id',  optionalAuth, UserController.getUserById);
router.put('/:id',  protect, checkPermission('users.manage'),     validate(V.adminUpdateUserSchema), UserController.adminUpdateUser);

export default router;
