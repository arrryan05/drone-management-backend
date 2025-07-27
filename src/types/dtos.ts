// src/types/dtos.ts
export interface Waypoint {
  lat: number;
  lng: number;
}

export interface MissionDTO {
  waypoints: Waypoint[];
  params: {
    altitude: number;
    overlap: number;
    pattern: 'grid' | 'crosshatch' | 'perimeter';
  };
}

export interface Telemetry {
  missionId: string;
  position: Waypoint;
  progress: number;    // 0–100
  status: 'in_progress' | 'completed' | 'paused' | 'aborted';
}

export interface DroneDTO {
  id: string;
  name: string;
  model: string;
  status: string;
  batteryPct: number;
}