import 'express-session';

// Declaration merging to apply our own types to SessionData
// See: (https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/express-session/index.d.ts#L23)
declare module 'express-session' {
  interface SessionData {
    userId: number;
    // Shown to admins in the user's "Sessions" settings
    ip?: string;
    userAgent?: string;
    createdAt?: number;
    lastActiveAt?: number;
  }
}
