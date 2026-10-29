import { getRepository } from '@server/datasource';
import { Session } from '@server/entity/Session';
import type { UserSession } from '@server/interfaces/api/userSettingsInterfaces';
import crypto from 'crypto';
import type { Request } from 'express';
import { MoreThan } from 'typeorm';

// Only refresh the "last active" date of a session every 5 minutes,
// to avoid writing the session to the database on every request
const LAST_ACTIVE_REFRESH = 1000 * 60 * 5;

// Never expose raw session IDs: they are what the session cookie carries
const getPublicSessionId = (sessionId: string): string =>
  crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 32);

export const startUserSession = (req: Request, userId: number): void => {
  if (!req.session) {
    return;
  }

  const now = Date.now();

  req.session.userId = userId;
  req.session.ip = req.ip;
  req.session.userAgent = req.header('User-Agent');
  req.session.createdAt = now;
  req.session.lastActiveAt = now;
};

export const touchUserSession = (req: Request): void => {
  if (!req.session?.userId) {
    return;
  }

  const now = Date.now();

  if (
    !req.session.lastActiveAt ||
    now - req.session.lastActiveAt > LAST_ACTIVE_REFRESH
  ) {
    req.session.lastActiveAt = now;
    req.session.ip = req.ip;
  }
};

const getUserSessionRows = async (
  userId: number
): Promise<{ session: Session; data: Record<string, unknown> }[]> => {
  const sessions = await getRepository(Session).find({
    where: { expiredAt: MoreThan(Date.now()) },
  });

  return sessions
    .map((session) => {
      try {
        return { session, data: JSON.parse(session.json) };
      } catch {
        return { session, data: {} };
      }
    })
    .filter(({ data }) => data.userId === userId);
};

export const getUserSessions = async (
  userId: number,
  currentSessionId?: string
): Promise<UserSession[]> => {
  const rows = await getUserSessionRows(userId);

  return rows
    .map(({ session, data }) => ({
      id: getPublicSessionId(session.id),
      ip: typeof data.ip === 'string' ? data.ip : undefined,
      userAgent:
        typeof data.userAgent === 'string' ? data.userAgent : undefined,
      createdAt:
        typeof data.createdAt === 'number'
          ? new Date(data.createdAt)
          : undefined,
      lastActiveAt:
        typeof data.lastActiveAt === 'number'
          ? new Date(data.lastActiveAt)
          : undefined,
      expiresAt: new Date(Number(session.expiredAt)),
      current: session.id === currentSessionId,
    }))
    .sort(
      (a, b) =>
        (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0)
    );
};

// Deletes one session (by its public ID) or every session of the user.
// Returns the number of deleted sessions.
export const deleteUserSessions = async (
  userId: number,
  publicSessionId?: string
): Promise<number> => {
  const rows = (await getUserSessionRows(userId)).filter(
    ({ session }) =>
      !publicSessionId || getPublicSessionId(session.id) === publicSessionId
  );

  if (rows.length) {
    await getRepository(Session).remove(rows.map(({ session }) => session));
  }

  return rows.length;
};
