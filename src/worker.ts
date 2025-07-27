// src/worker.ts
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Telemetry, Waypoint } from './types/dtos';

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'redis',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null
});

// Helper to persist last‑known state
async function persistState(missionId: string, payload: Telemetry) {
  await connection.hset(`state:mission:${missionId}`, {
    status: payload.status,
    progress: payload.progress.toString(),
    lat: payload.position.lat.toString(),
    lng: payload.position.lng.toString(),
  });
}

// Publisher for telemetry
const telemetryPub = connection.duplicate({ maxRetriesPerRequest: null });

console.log('👷 Mission Worker starting up...');

const missionWorker = new Worker(
  'missions',
  async job => {
    console.log(`▶️  Processing job ${job.id}`);
    const missionId = job.id!;
    const { waypoints } = job.data as { waypoints: Waypoint[] };

    // --- CONTROL SUBSCRIBER ---
    const controlSub = new IORedis({
      host: process.env.REDIS_HOST || 'redis',
      port: Number(process.env.REDIS_PORT) || 6379,
      maxRetriesPerRequest: null
    });

    let paused = false;
    let aborted = false;

    // subscribe to controls for this mission
    await controlSub.subscribe(`control:mission:${missionId}`);
    controlSub.on('message', (_channel, message) => {
      console.log(`🛑 Control message for ${missionId}:`, message);
      if (message === 'pause') paused = true;
      if (message === 'resume') paused = false;
      if (message === 'abort') aborted = true;
    });

    // --- SIMULATION LOOP ---
    let i = 0;
    while (i < waypoints.length) {
      if (aborted) {
        // send one final “aborted” telemetry
        const payload: Telemetry = {
          missionId,
          position: waypoints[i],
          progress: Math.round((i / waypoints.length) * 100),
          status: 'aborted'
        };
        console.log(`⚠️  Mission ${missionId} aborted at waypoint ${i}`);
        await telemetryPub.publish(
          `telemetry:mission:${missionId}`,
          JSON.stringify(payload)
        );
        await persistState(missionId, payload);
        break;
      }

      if (paused) {
        // throttle loop while paused
        await new Promise(res => setTimeout(res, 500));
        continue;
      }

      // normal tick
      const position = waypoints[i];
      const progress = Math.round(((i + 1) / waypoints.length) * 100);
      const status = i + 1 === waypoints.length ? 'completed' : 'in_progress';

      const payload: Telemetry = { missionId, position, progress, status };
      console.log('🔄 Sim tick:', payload);

      await telemetryPub.publish(
        `telemetry:mission:${missionId}`,
        JSON.stringify(payload)
      );
      await persistState(missionId, payload);

      i++;
      // wait for next tick if not done
      if (i < waypoints.length) {
        await new Promise(res => setTimeout(res, 2000));
      }
    }

    // clean up subscription
    await controlSub.unsubscribe(`control:mission:${missionId}`);
    controlSub.disconnect();
  },
  { connection }
);

// logging
missionWorker.on('active', job => {
  console.log(`🔥 Job ${job.id} is now active`);
});
missionWorker.on('completed', job => {
  console.log(`✅ Mission simulation completed: ${job.id}`);
});
missionWorker.on('failed', (job, err) => {
  console.error(`❌ Mission simulation failed (${job?.id}):`, err);
});
