# drone-backend/Dockerfile
FROM node:18-alpine

WORKDIR /usr/src/app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy Prisma schema & migrations, generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy Firebase service account & source
COPY firebase-service-account.json ./
COPY tsconfig.json ./
COPY src ./src

EXPOSE 4000

# On container start: apply migrations, then launch the app
CMD sh -c "npx prisma migrate deploy && npx ts-node-dev --respawn --transpile-only src/index.ts"
