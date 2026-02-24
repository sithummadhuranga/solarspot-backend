
export type RoleName = 'guest' | 'user' | 'moderator' | 'admin';

export const PERMISSIONS: Record<string, RoleName[]> = {
  'stations:read':        ['guest', 'user', 'moderator', 'admin'],
  'stations:create':      ['user', 'moderator', 'admin'],
  'stations:update:own':  ['user', 'moderator', 'admin'],
  'stations:update:any':  ['admin'],
  'stations:delete':      ['admin'],
  'stations:approve':     ['moderator', 'admin'],
  'stations:feature':     ['admin'],
  'stations:pending':     ['moderator', 'admin'],

  'reviews:read':         ['guest', 'user', 'moderator', 'admin'],
  'reviews:create':       ['user', 'moderator', 'admin'],
  'reviews:update:own':   ['user', 'moderator', 'admin'],
  'reviews:delete:own':   ['user', 'moderator', 'admin'],
  'reviews:delete:any':   ['moderator', 'admin'],
  'reviews:moderate':     ['moderator', 'admin'],
  'reviews:flagged':      ['moderator', 'admin'],

  'users:read:own':       ['user', 'moderator', 'admin'],
  'users:update:own':     ['user', 'moderator', 'admin'],
  'users.manage':         ['admin'],

  'weather:cache:stats':  ['admin'],
};
