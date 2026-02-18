# SolarSpot Backend

![Node.js](https://img.shields.io/badge/Node.js-20-green) ![Express](https://img.shields.io/badge/Express-5-blue) ![MongoDB](https://img.shields.io/badge/MongoDB-7-darkgreen) ![Docker](https://img.shields.io/badge/Docker-Ready-blue) ![License](https://img.shields.io/badge/License-MIT-yellow)

Solar charging station finder REST API built with Express.js and TypeScript for SE3040 Application Frameworks.

## Prerequisites

- Node.js 20 LTS
- Docker Desktop (recommended)
- MongoDB Compass (optional, for GUI)

## Quick Start — Docker

```bash
git clone <repo-url> && cd solarspot-backend
cp .env.example .env
docker-compose up
```

API runs at `http://localhost:5000`, Mongo Express UI at `http://localhost:8081`.

## Quick Start — Local

```bash
npm install
# fill in .env with your values
npm run dev
```

## Environment Variables

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `PORT` | No | `5000` | Server port |
| `NODE_ENV` | No | `development` | Environment |
| `MONGODB_URI` | Yes | — | MongoDB connection string |
| `JWT_SECRET` | Yes | — | Access token secret (32+ chars) |
| `JWT_REFRESH_SECRET` | Yes | — | Refresh token secret |
| `JWT_ACCESS_EXPIRES` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES` | No | `7d` | Refresh token lifetime |
| `OPENWEATHERMAP_API_KEY` | Yes | — | OpenWeatherMap API key |
| `PERSPECTIVE_API_KEY` | Yes | — | Google Perspective API key |
| `BREVO_SMTP_HOST` | Yes | — | SMTP host |
| `BREVO_SMTP_PORT` | No | `587` | SMTP port |
| `BREVO_SMTP_USER` | Yes | — | SMTP username |
| `BREVO_SMTP_PASS` | Yes | — | SMTP password |
| `EMAIL_FROM` | No | `noreply@solarspot.app` | Sender email |
| `FRONTEND_URL` | Yes | — | Frontend URL for CORS |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with nodemon + ts-node |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm run test:unit` | Run unit tests with coverage |
| `npm run test:integration` | Run integration tests |
| `npm run test:coverage` | Full coverage report |
| `npm run lint` | Lint and auto-fix |
| `npm run format` | Prettier format |

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | — | Register user |
| `GET` | `/api/auth/verify-email/:token` | — | Verify email |
| `POST` | `/api/auth/login` | — | Login |
| `POST` | `/api/auth/logout` | Bearer | Logout |
| `POST` | `/api/auth/refresh` | — | Refresh tokens |
| `POST` | `/api/auth/forgot-password` | — | Request reset |
| `PATCH` | `/api/auth/reset-password/:token` | — | Reset password |
| `GET` | `/api/users/me` | Bearer | Get profile |
| `PUT` | `/api/users/me` | Bearer | Update profile |
| `GET` | `/api/users/:id/public` | — | Public profile |
| `GET` | `/api/users/admin/list` | Admin | List users |
| `PATCH` | `/api/users/admin/:id/role` | Admin | Change role |
| `DELETE` | `/api/users/admin/:id` | Admin | Delete user |
| `GET` | `/api/stations` | — | List stations |
| `GET` | `/api/stations/nearby` | — | Nearby search |
| `GET` | `/api/stations/pending` | Mod+ | Pending stations |
| `GET` | `/api/stations/:id` | — | Station detail |
| `POST` | `/api/stations` | Bearer | Create station |
| `PUT` | `/api/stations/:id` | Bearer | Update station |
| `PATCH` | `/api/stations/:id/approve` | Mod+ | Approve station |
| `PATCH` | `/api/stations/:id/reject` | Mod+ | Reject station |
| `DELETE` | `/api/stations/:id` | Admin | Delete station |
| `GET` | `/api/reviews/station/:stationId` | — | Station reviews |
| `GET` | `/api/reviews/user/:userId` | — | User reviews |
| `GET` | `/api/reviews/flagged` | Mod+ | Flagged reviews |
| `POST` | `/api/reviews/station/:stationId` | Bearer | Create review |
| `PUT` | `/api/reviews/:id` | Bearer | Update review |
| `DELETE` | `/api/reviews/:id` | Bearer | Delete review |
| `POST` | `/api/reviews/:id/helpful` | Bearer | Mark helpful |
| `POST` | `/api/reviews/:id/flag` | Bearer | Flag review |
| `PATCH` | `/api/reviews/:id/moderate` | Mod+ | Moderate review |
| `GET` | `/api/weather/station/:id/current` | — | Current weather |
| `GET` | `/api/weather/station/:id/forecast` | — | Forecast |
| `GET` | `/api/weather/best-time/:id` | — | Best charging time |
| `GET` | `/api/weather/solar-index` | — | Solar index |
| `GET` | `/api/weather/cache/stats` | Admin | Cache stats |

## Docker

```bash
docker-compose up -d              # start all services
docker-compose down               # stop
docker-compose logs -f backend    # tail logs
docker-compose up --build         # rebuild after changes
docker exec -it solarspot_backend sh  # shell into container
```

## Testing

```bash
npm run test:unit                         # unit tests
npm run test:integration                  # integration tests
npm run test:coverage                     # coverage report
npx artillery run src/tests/performance/artillery.yml  # load test
```

## Deployment

1. Push to `main` branch
2. Render auto-deploys via deploy hook
3. MongoDB Atlas M0 free tier for production database

## Team — Module Ownership

| Member | Module | 3rd-Party API |
|--------|--------|---------------|
| Member 1 | Station Management | Nominatim Geocoding |
| Member 2 | Review System | Google Perspective API |
| Member 3 | Weather Intelligence | OpenWeatherMap API |
| Member 4 | Auth & Users | Brevo SMTP |

## Git Workflow

- Branch naming: `feature/<module>-<description>`, `fix/<module>-<description>`
- Commit format: `feat(stations): add nearby search endpoint`
- PRs require at least 1 approval before merge to `develop`
- `main` is protected — merge from `develop` only
