# Local Development Guide

## 1. First-Time Setup

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```dotenv
MONGODB_URI=mongodb://mongo:27017/solarspot_dev   # keep as-is for Docker
FRONTEND_URL=http://localhost:3000                 # your frontend dev URL
JWT_SECRET=<any-32-char-string>
JWT_REFRESH_SECRET=<any-different-32-char-string>
```

---

## 2. Start Everything (Backend + Database)

```bash
docker-compose up -d
```

| Service     | URL                            |
|-------------|-------------------------------|
| API         | http://localhost:5001          |
| Mongo UI    | http://localhost:8081          |
| MongoDB     | mongodb://localhost:27017      |

---

## 3. Connect Frontend to the API

In your **frontend** project set the API base URL to:

```
http://localhost:5001/api
```

In **this** `.env`, make sure `FRONTEND_URL` matches your frontend dev server (used for CORS):

```dotenv
FRONTEND_URL=http://localhost:3000
```

After changing `.env`, rebuild:

```bash
docker-compose up -d --build
```

---

## 4. Seed Demo Data

```bash
docker exec -it solarspot_backend npm run seed
```

---

## 5. Common Commands

```bash
# Start services in background
docker-compose up -d

# Stop services
docker-compose down

# Restart after code changes (hot-reload is on, but if needed)
docker-compose restart backend

# Rebuild image (after package.json changes)
docker-compose up -d --build

# View live backend logs
docker-compose logs -f backend

# Open a shell inside the container
docker exec -it solarspot_backend sh

# Connect to MongoDB shell
docker exec -it solarspot_mongo mongosh solarspot_dev
```

---

## 6. MongoDB Compass (GUI)

Connect with this URI:

```
mongodb://localhost:27017
```

Database name: `solarspot_dev`
