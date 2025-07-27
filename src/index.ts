// src/index.ts
import express from 'express';
import http from 'http';
import cors from 'cors';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import missionRouter from './routes/mission';
import reportRouter from './routes/report';
import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import IORedis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import './worker';

initializeApp({ credential: applicationDefault() });
export const prisma = new PrismaClient();


const app = express();
app.use(cors());
app.use(express.json());
app.use('/missions', missionRouter);
app.use('/reports', reportRouter);
app.get('/health', (_req, res) => res.send({ status: 'ok' }));

// Create HTTP & Socket.IO servers
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Redis clients for adapter and pub/sub
const pubClient = new IORedis({
  host: process.env.REDIS_HOST || 'redis',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null
});
const subClient = pubClient.duplicate({ maxRetriesPerRequest: null });

io.adapter(createAdapter(pubClient, subClient));

// Let clients join mission rooms
io.on('connection', (socket) => {
  console.log(`⚡ Socket connected: ${socket.id}`);
  socket.on('join', (missionId: string) => {
    console.log(`– Client ${socket.id} joining mission room: mission-${missionId}`);
    socket.join(`mission-${missionId}`);
  });
});

// Custom Pub/Sub to relay telemetry into Socket.IO rooms
const telemetrySub = new IORedis({
  host: process.env.REDIS_HOST || 'redis',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null
});
telemetrySub.psubscribe('telemetry:mission:*', (err, count) => {
  if (err) console.error('Telemetry Psubscribe error:', err);
});
telemetrySub.on('pmessage', (_pattern, channel, message) => {
  console.log('📡 Redis pub/sub:', channel, message);
  const [, , missionId] = channel.split(':'); // 'telemetry:mission:<id>'
  const payload = JSON.parse(message);
  io.to(`mission-${missionId}`).emit('telemetry', payload);
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Backend + Socket.IO listening on http://localhost:${PORT}`);
});
