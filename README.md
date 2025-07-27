# 🛰️ Drone Survey Management System – Backend

This is the backend service for a **Drone Survey Management System** that manages the life cycle of drone survey missions across different geographical locations in real time. It enables mission creation, live tracking, telemetry logging, report generation, and robust mission control (pause, resume, abort).

---

## 🧠 Description

This backend powers the core logic behind planning and monitoring drone missions, including:

* 🗺️ Waypoint-based mission creation
* 📡 Real-time mission tracking with telemetry updates
* 🔁 Mission control: pause/resume/abort
* 📈 Mission reports with analytics (duration, altitude, logs)
* ✅ Firebase-authenticated access control
* 📈 Detailed Anlaytics dashboard,present comprehensive survey summaries


---

## 🏗️ Architecture

```txt
Client (Next.js with Firebase Auth)
          │
          ▼
  ┌────────────────────┐
  │ Node.js Backend     │
  │  - REST APIs        │◄── Auth (Firebase ID tokens)
  │  - Mission Logic    │
  └────────┬────────────┘
           │
           ▼
  ┌────────────────────┐
  │ PostgreSQL          │
  │  - Mission Data     │
  └────────────────────┘
           │
           ▼
  ┌────────────────────┐
  │ Redis + BullMQ      │
  │  - Background Jobs  │
  │  - Telemetry Queue  │
  └────────────────────┘
```

-----

## 📦 Tech Stack

  * **Backend Framework**: Node.js (Typescirpt)
  * **Authentication**: Firebase Authentication
  * **Database**: PostgreSQL with Prisma ORM
  * **Task Queue**: BullMQ with Redis
  * **Containerization**: Docker
  * **Real-time Updates**: Socket.IO
  * **Charts & Reports**: Chart.js (Frontend)

-----


## 🚀 Scalability Strategy

The system is designed to effectively handle concurrent missions across various geographical locations through the following strategies:

  * **Isolated Mission IDs**: Each mission is tracked independently using a **unique ID** and Firebase `uid`.
  * **Redis Pub/Sub Channels**: Each mission publishes telemetry to a separate Redis channel (`mission:{id}`), allowing **real-time updates** via Socket.IO per mission.
  * **BullMQ Workers**: Background jobs are distributed using Redis-backed BullMQ, enabling **parallel processing** of logs and long-running tasks like report generation.
  * **Stateless API Design**: Node.js is stateless and designed for **horizontal scalability**. More containers can be added under load using orchestration tools like Docker Compose or Kubernetes.
  * **Analytics Report**: Created Analytics dashboard providing detailed analysis and summary of all missions.


-----

## 🧠 Approach & Strategy

### 🔍 Problem-Solving Approach

  * We started with **core mission lifecycle features**: creation, tracking, and report generation.
  * **Redis-backed background processing and WebSockets** were utilized to decouple frontend refresh logic from critical operations, so that multiple missions can be executed concurrently.

### ⚖️ Trade-offs Considered

| Choice                  | Pros                                                | Cons                                           |
| :---------------------- | :-------------------------------------------------- | :--------------------------------------------- |
| Prisma + PostgreSQL     | Easy schema modeling, great query performance       | Slight learning curve for Prisma               |
| Redis Pub/Sub + BullMQ  | Fast, decoupled, scalable                           | Requires Redis management                      |
| Firebase Auth           | Quick integration, highly scalable auth solution    | Vendor lock-in                                 |

### 🛡️ Safety & Adaptability

  * Mission operations like pause/resume/abort are **idempotent**, preventing double execution.
  * Real-time updates are **event-driven**, minimizing API polling and race conditions.
  * All mission-related data is linked to the user's Firebase UID, ensuring **strict authorization**.
  * Redis queues allow **retries and delayed execution**, making the system robust to transient failures.

-----

## 🧪 Running Locally

To get the Drone Survey Management System backend running on your local machine, follow these steps:

```bash
# 1. Clone and start Docker containers
docker-compose up --build

# 2. Apply Prisma schema
npx prisma migrate dev

# 3. Access the FastAPI server
http://localhost:4000/docs
```

Make sure your `.env` file contains the following environment variables:

```env
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
REDIS_HOST
REDIS_PORT
GOOGLE_APPLICATION_CREDENTIALS
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public"
```

-----
