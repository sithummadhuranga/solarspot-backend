import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { config } from '@config/env';
import { swaggerSpec } from '@config/swagger';
import { errorHandler } from '@middleware/error.middleware';
import logger from '@utils/logger';

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: config.NODE_ENV === 'production' ? undefined : false,
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (config.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin)) {
        return callback(null, true);
      }
      if (origin === config.FRONTEND_URL) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(
  morgan('combined', {
    stream: { write: (message) => logger.http(message.trim()) },
    skip: () => config.NODE_ENV === 'test',
  })
);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());


function sanitizeMongo(obj: unknown): void {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete (obj as Record<string, unknown>)[key];
    } else {
      sanitizeMongo((obj as Record<string, unknown>)[key]);
    }
  }
}
app.use((req: Request, _res: Response, next: NextFunction) => {
  sanitizeMongo(req.body);    // writable
  sanitizeMongo(req.params);  // writable
  sanitizeMongo(req.query);   // mutate contents — never reassign (read-only in Express 5)
  next();
});

app.use((req: Request, _res: Response, next: NextFunction) => {
  const q = req.query as Record<string, unknown>;
  for (const key of Object.keys(q)) {
    if (Array.isArray(q[key])) {
      const arr = q[key] as string[];
      q[key] = arr[arr.length - 1]; // keep last, discard duplicates
    }
  }
  next();
});

// ─── Response compression ─────────────────────────────────────────────────────
app.use(compression());

// ─── Global rate limiter ───────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
  skip: () => config.NODE_ENV === 'test',
});
app.use('/api', globalLimiter);

// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── Swagger API docs ──────────────────────────────────────────────────────────
if (config.NODE_ENV !== 'production') {
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'SolarSpot API Docs',
      swaggerOptions: { persistAuthorization: true },
    })
  );
  logger.info(`API docs available at /api/docs`);
}

// ─── Module routes ─────────────────────────────────────────────────────────────
import authRouter        from '@modules/auth/auth.routes';
import usersRouter       from '@modules/users/user.routes';
import permissionsRouter from '@modules/permissions/permission.routes';
import stationsRouter    from '@modules/stations/station.routes';
import reviewsRouter     from '@modules/reviews/review.routes';
import weatherRouter     from '@modules/weather/weather.routes';
import solarRouter       from '@modules/solar/solar.routes';

app.use('/api/auth',        authRouter);
app.use('/api/users',       usersRouter);
app.use('/api/stations',    stationsRouter);
app.use('/api/reviews',     reviewsRouter);
app.use('/api/weather',     weatherRouter);
app.use('/api/solar',       solarRouter);
app.use('/api/permissions', permissionsRouter);

// ─── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    statusCode: 404,
  });
});

// ─── Global error handler (must be last) ───────────────────────────────────────
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  errorHandler(err, req, res, next);
});

export default app;
