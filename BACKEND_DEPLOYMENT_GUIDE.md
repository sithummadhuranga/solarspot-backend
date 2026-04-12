# Backend Deployment Guide

This guide is for deploying SolarSpot Backend for assignment submission and production-like validation.

## 1. Deployment Targets

- Local Docker deployment (for demos and marking)
- Render deployment using `render.yaml`

## 2. Pre-Deployment Checklist

Run these commands from project root:

```bash
npm ci
npm run lint
npm run build
npm test
```

If Docker is used locally:

```bash
docker-compose up -d --build
curl http://localhost:5000/api/health
```


## 3. Required Environment Variables

Set these at minimum in your deployment environment:

- `NODE_ENV=production`
- `PORT=5000`
- `MONGODB_URI`
- `JWT_SECRET`
- `COOKIE_SECRET`
- `FRONTEND_URL`
- `APP_URL`

Feature-specific values:

- `OPENWEATHER_API_KEY` (or `OPENWEATHERMAP_API_KEY`)
- `PERSPECTIVE_API_KEY`
- `BREVO_API_KEY` when `EMAIL_TRANSPORT=brevo-api`

Optional bootstrap on first deploy:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

## 4. Render Deployment (Recommended for Submission)

The repository includes `render.yaml` for blueprint deployment.

1. Push latest code to `main`.
2. In Render Dashboard: New -> Blueprint.
3. Connect repo and select this project.
4. Render creates the `solarspot-api` service.
5. Add all `sync: false` environment variables from `render.yaml`.
6. Trigger deploy.
7. Verify health endpoint: `/api/health`.

Important:

- Current `render.yaml` uses `autoDeploy: false`.
- Deploys must be triggered manually or from CI.

## 5. Local Docker Deployment (Submission Demo)

1. Create environment file:

```bash
cp .env.example .env
```

2. Start services:

```bash
docker-compose up -d --build
```

3. Verify services:

- API: `http://localhost:5000/api/health`
- Mongo Express: `http://localhost:8081`

4. Seed demo data (optional for demo):

```bash
docker exec -it solarspot_backend npm run seed
```

## 6. Smoke Test After Deployment

Run basic checks after each deployment:

```bash
curl -i https://<your-host>/api/health
curl -i https://<your-host>/api/stations
```

Authenticated check:

- Login via `/api/auth/login`
- Call `/api/users/me` with returned bearer token

## 7. Common Deployment Issues

- Build fails on Render:
  - Confirm Node version is compatible (`20.x` in `package.json`).
  - Confirm all required env vars are set.
- Health check fails:
  - Verify `PORT` and service binding.
  - Check logs for DB connection or JWT config errors.
- Email not sent on free Render:
  - Use `EMAIL_TRANSPORT=brevo-api` with `BREVO_API_KEY`.

## 8. Submission Evidence Checklist

- Public backend URL
- `/api/health` success screenshot
- Render environment variables configured
- Lint, build, and test commands passed
- Sample API call success (Postman/curl)
