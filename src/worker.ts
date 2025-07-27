// src/worker.ts
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Telemetry, Waypoint } from './types/dtos';
import { prisma } from './index';

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'redis',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null
});

// Persist last-known state in Redis + create a FlightLog entry
async function persistState(missionId: string, payload: Telemetry) {
  // 1) Redis hash for quick state lookups
  await connection.hset(`state:mission:${missionId}`, {
    status: payload.status,
    progress: payload.progress.toString(),
    lat: payload.position.lat.toString(),
    lng: payload.position.lng.toString(),
  });

  // 2) Persist flight log in Postgres
  await prisma.flightLog.create({
    data: {
      missionId,
      timestamp: new Date(),
      lat: payload.position.lat,
      lng: payload.position.lng,
      progress: payload.progress,
      status: payload.status,
    }
  });
}

// Channel publisher for telemetry
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

    // Subscribe to control:mission:<id>
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
        // final aborted tick
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
        // wait briefly while paused
        await new Promise(res => setTimeout(res, 500));
        continue;
      }

      // normal tick
      const position = waypoints[i];
      const progress = Math.round(((i + 1) / waypoints.length) * 100);
      const status = i + 1 === waypoints.length ? 'completed' : 'in_progress';

      const payload: Telemetry = { missionId, position, progress, status };
      console.log('🔄 Sim tick:', payload);

      // publish & persist
      await telemetryPub.publish(
        `telemetry:mission:${missionId}`,
        JSON.stringify(payload)
      );
      await persistState(missionId, payload);

      // If this was the final tick, generate report
      if (status === 'completed') {
        console.log(`🏁 Mission ${missionId} completed—generating report`);
        // Fetch all logs for this mission
        const logs = await prisma.flightLog.findMany({
          where: { missionId },
          orderBy: { timestamp: 'asc' },
          select: { timestamp: true }
        });
        if (logs.length > 0) {
          const startTime = logs[0].timestamp;
          const endTime = logs[logs.length - 1].timestamp;
          const durationSec = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

          // Create MissionReport
          await prisma.missionReport.create({
            data: {
              missionId,
              totalLogs: logs.length,
              startTime,
              endTime,
              durationSec
            }
          });
          console.log(`📊 Report created for mission ${missionId}: ${logs.length} logs, ${durationSec}s`);
        }
      }

      i++;
      if (i < waypoints.length) {
        await new Promise(res => setTimeout(res, 2000));
      }
    }

    // Clean up control subscriber
    await controlSub.unsubscribe(`control:mission:${missionId}`);
    controlSub.disconnect();
  },
  { connection }
);

// Worker lifecycle logging
missionWorker.on('active', job => {
  console.log(`🔥 Job ${job.id} is now active`);
});
missionWorker.on('completed', job => {
  console.log(`✅ Mission simulation completed: ${job.id}`);
});
missionWorker.on('failed', (job, err) => {
  console.error(`❌ Mission simulation failed (${job?.id}):`, err);
});
