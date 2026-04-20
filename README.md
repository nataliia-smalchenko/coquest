# CoQuest

**CoQuest** is a web platform for teachers to create interactive map-based quests for classroom learning. Students explore a virtual map, answer questions, read materials, and collaborate in teams — all in real time.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?style=flat-square&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## Demo

[![CoQuest Demo](https://img.youtube.com/vi/E8pBL27hCpI/maxresdefault.jpg)](https://youtu.be/E8pBL27hCpI)

---

## Features

**For teachers**
- Build a resource library: rich text materials, single/multiple choice and open-ended questions with image support
- Compose quests by placing resources on an interactive classroom map
- Configure sessions: team size, answer feedback, score visibility, time limits, scheduling
- Monitor student progress live during the game
- Review and score open-ended answers in real time

**For students**
- Join a session with a 6-character code — no account required
- Navigate an interactive map and complete assigned tasks
- Collaborate in teams with a shared hint system and in-game chat
- View results immediately after the session ends

**Platform**
- Bilingual UI: Ukrainian (default) and English
- Google OAuth alongside email/password registration
- Image uploads via Cloudinary (direct browser-to-cloud)
- Real-time communication via WebSocket for both players and teachers

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, Zustand |
| Rich text | Tiptap with syntax highlighting (lowlight) |
| Backend | Python 3.11, FastAPI, SQLAlchemy (async), Alembic |
| Database | PostgreSQL (asyncpg driver) |
| Cache / pub-sub | Redis |
| Auth | JWT (HS256) + Google OAuth via Authlib |
| Email | Resend API with Jinja2 HTML templates |
| Media | Cloudinary (signed upload flow) |
| Infrastructure | Docker Compose |

---

## Architecture Overview

```
Browser
  ├── HTTPS  →  Next.js (port 3000)
  │                └── REST + WebSocket  →  FastAPI (port 8000)
  │                                            ├── PostgreSQL
  │                                            └── Redis
  └── Direct upload  →  Cloudinary
```

**Backend layer structure:** Routes → Services → Models (SQLAlchemy ORM)

WebSocket connections are maintained per player within a session. Database sessions are opened on demand per operation — not held open for the duration of the game — to prevent connection exhaustion during long gameplay sessions (30–40 min).

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker & Docker Compose

### 1. Infrastructure

```bash
docker-compose up -d
```

Starts PostgreSQL and Redis.

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # fill in the values (see Environment Variables below)
alembic upgrade head
uvicorn app.main:app --reload
```

API runs on `http://localhost:8000`  
Swagger docs: `http://localhost:8000/api/docs`

### 3. Frontend

```bash
cd frontend
npm install
# create frontend/.env.local (see Environment Variables below)
npm run dev
```

App runs on `http://localhost:3000`

---

## Environment Variables

### `backend/.env`

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL async URL (`postgresql+asyncpg://...`) |
| `REDIS_URL` | Redis connection URL |
| `SECRET_KEY` | JWT signing secret |
| `RESEND_API_KEY` | Resend API key for transactional email |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |

### `frontend/.env.local`

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend base URL (e.g. `http://localhost:8000`) |
| `NEXT_PUBLIC_WS_URL` | WebSocket base URL (e.g. `ws://localhost:8000`) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client ID |

---

## Project Structure

```
coquest/
├── backend/
│   ├── app/
│   │   ├── models/        # SQLAlchemy ORM models
│   │   ├── routes/        # FastAPI routers (thin handlers)
│   │   ├── schemas/       # Pydantic request/response models
│   │   ├── services/      # Business logic
│   │   └── utils/         # Dependencies, security helpers
│   └── alembic/           # Database migrations
├── frontend/
│   ├── app/[locale]/      # Next.js App Router pages
│   ├── components/        # React components
│   ├── hooks/             # Zustand stores, WebSocket hooks
│   ├── lib/               # API clients, sanitization, auth
│   └── public/maps/       # SVG map assets
└── docker-compose.yml
```

---

## WebSocket Events

### Player channel (`/api/ws/session/{id}/player`)

| Event | Direction | Description |
|---|---|---|
| `connected` | server → player | Initial state: session data, player list |
| `session_started` | server → player | Game started, initial progress assigned |
| `team_started` | server → player | Team's gameplay begins |
| `answer_result` | server → player | Score and correctness after answer submission |
| `team_step_advanced` | server → player | Team progressed to next map object |
| `object_updated` | server → player | New resource assigned to a map object |
| `text_viewed` | server → player | Text resource marked as viewed |
| `player_finished` | server → all | A player completed all their tasks |
| `session_completed` | server → all | All players finished |
| `chat_message` | both | In-game team chat |
| `submit_answer` | player → server | Submit answer to a question |
| `mark_viewed` | player → server | Mark a text resource as read |

### Teacher channel (`/api/ws/session/{id}/teacher`)

| Event | Direction | Description |
|---|---|---|
| `connected` | server → teacher | Initial session state |
| `player_joined` | server → teacher | New player connected |
| `player_answered` | server → teacher | Player submitted an answer |
| `player_viewed_text` | server → teacher | Player read a text resource |
| `player_finished` | server → teacher | Player completed all tasks |
| `session_completed` | server → teacher | Session finished |
| `start_session` | teacher → server | Start the session |
| `stop_session` | teacher → server | Stop the session early |
| `review_answer` | teacher → server | Score an open-ended answer |

---

## Database Migrations

```bash
# Apply all migrations
alembic upgrade head

# Generate a new migration after model changes
alembic revision --autogenerate -m "description"
```

---

## Contributing

1. Fork the repository and create a branch from `develop`
2. Before opening a PR, run linting and formatting:

```bash
# Frontend
cd frontend
npm run lint
npm run format

# Backend
cd backend
ruff check .
```

3. Open a pull request against `develop`

---

## License

[MIT](LICENSE)
