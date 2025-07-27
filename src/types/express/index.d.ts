// src/types/express/index.d.ts
import 'express';

declare module 'express' {
  interface Request {
    /** Firebase UID injected by middleware */
    uid?: string;
  }
}
