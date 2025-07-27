import { Router } from 'express';
import { verifyFirebaseToken } from '../middleware/verifyFirebaseToken';
import { prisma } from '../index';

const router = Router();
router.use(verifyFirebaseToken);

router.get('/summary', async (_req, res) => {
  const missions = await prisma.mission.findMany({
    include: { report: true }
  });

  const totalMissions = missions.length;
  const completed = missions.filter(m => m.report).length;
  const aborted = totalMissions - completed;
  const durations = missions
    .filter(m => m.report)
    .map(m => m.report!.durationSec);
  const altitudes = missions.map(m => m.altitude);
  const timestamps = missions
    .filter(m => m.report)
    .map(m => ({
      createdAt: m.createdAt,
      durationSec: m.report!.durationSec,
    }));

  const avgDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  const avgAltitude = altitudes.length
    ? Math.round(altitudes.reduce((a, b) => a + b, 0) / altitudes.length)
    : 0;

  res.json({
    totalMissions,
    completed,
    aborted,
    averageDurationSec: avgDuration,
    averageAltitude: avgAltitude,
    durations,
    altitudes,
    durationsOverTime: timestamps
  });
});



// GET /reports/mission/:id
router.get('/mission/:id', async (req, res) => {
  const { id } = req.params;
  const report = await prisma.missionReport.findUnique({
    where: { missionId: id }
  });
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const logs = await prisma.flightLog.findMany({
    where: { missionId: id },
    select: { timestamp: true, lat: true, lng: true, progress: true, status: true },
    orderBy: { timestamp: 'asc' }
  });

  res.json({ report, logs });
});

export default router;
