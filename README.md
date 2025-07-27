# drone-backend

## Phase 0 — Backend Scaffold

### Prerequisites

- Docker & Docker Compose

### Getting Started

1. Copy `.env.example` → `.env`
2. `docker-compose up --build`

- Backend will be available at http://localhost:4000  
- Health check: http://localhost:4000/health  
- POST /missions stub → enqueues a BullMQ job  

## Next Steps

- Add PostgreSQL migrations & ORM  
- Flesh out API and OpenAPI docs  
- Wire up real mission simulation
