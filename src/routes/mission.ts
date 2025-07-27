// src/routes/mission.ts
import { Router } from 'express';
import { verifyFirebaseToken } from '../middleware/verifyFirebaseToken';
import { prisma } from '../index';
import { MissionDTO, Waypoint as WP } from '../types/dtos';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
const redisConn = new IORedis({
  host: process.env.REDIS_HOST || 'redis',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null
});
const missionQueue = new Queue('missions', { connection: redisConn });

const router = Router();
router.use(verifyFirebaseToken);

// Create
router.post('/', async (req, res) => {
  const uid = (req as any).uid as string;
  const { waypoints, params } = req.body as MissionDTO;
  

  // Create mission and nested waypoints
  const mission = await prisma.mission.create({
    data: {
      uid,
      pattern: params.pattern,
      altitude: params.altitude,
      overlap: params.overlap,
      waypoints: {
        create: waypoints.map((wp: WP, i: number) => ({
          lat: wp.lat,
          lng: wp.lng,
          order: i,
        })),
      },
    },
    include: { waypoints: true },
  });

  res.status(201).json({
    id: mission.id,
    params: { pattern: mission.pattern, altitude: mission.altitude, overlap: mission.overlap },
    waypoints: mission.waypoints.map((w: { lat: number; lng: number }) => ({
      lat: w.lat,
      lng: w.lng
    })),
  });
});

// List
router.get('/', async (_req, res) => {
  const missions = await prisma.mission.findMany({
    select: { id: true, pattern: true, altitude: true, overlap: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(missions);
});

// Detail
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const mission = await prisma.mission.findUnique({
    where: { id },
    include: { waypoints: { orderBy: { order: 'asc' } } },
  });
  if (!mission) return res.status(404).send({ error: 'Not found' });
  res.json({
    id: mission.id,
    params: { pattern: mission.pattern, altitude: mission.altitude, overlap: mission.overlap },
    waypoints: mission.waypoints.map((w: { lat: number; lng: number }) => ({
      lat: w.lat,
      lng: w.lng
    })),
  });
});


// POST /missions/:id/start
router.post('/:id/start', verifyFirebaseToken, async (req, res) => {
  const missionId = req.params.id;
  
  // fetch waypoints from DB
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    include: { waypoints: { orderBy: { order: 'asc' } } }
  });
  if (!mission) return res.status(404).json({ error: 'Not found' });

  // enqueue paused simulation
  await missionQueue.add('start-mission', {
    waypoints: mission.waypoints.map(w => ({ lat: w.lat, lng: w.lng }))
  }, { jobId: missionId });

  // publish initial “in_progress” so status flips
  await redisConn.publish(`control:mission:${missionId}`, 'resume');
  res.json({ status: 'in_progress' });
});


// GET /missions/:id/state
router.get('/:id/state', verifyFirebaseToken, async (req, res) => {
  const key = `state:mission:${req.params.id}`;
  const state = await redisConn.hgetall(key);
  if (!state || !state.status) {
    return res.json({ status: 'pending', progress: 0 });
  }
  res.json({
    status: state.status,
    progress: Number(state.progress),
    position: { lat: Number(state.lat), lng: Number(state.lng) }
  });
});




// CONTROL ENDPOINTS:
const publishControl = async (missionId: string, cmd: 'pause'|'resume'|'abort') => {
  await redisConn.publish(`control:mission:${missionId}`, cmd);
};

router.post('/:id/pause', async (req, res) => {
  await publishControl(req.params.id, 'pause');
  res.send({ status: 'paused' });
});
router.post('/:id/resume', async (req, res) => {
  await publishControl(req.params.id, 'resume');
  res.send({ status: 'in_progress' });
});
router.post('/:id/abort', async (req, res) => {
  await publishControl(req.params.id, 'abort');
  res.send({ status: 'aborted' });
});

export default router;
