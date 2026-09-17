// Образец для ownership/role-тестов (README.md рядом): создаёт пользователя
// напрямую в БД (без полного флоу входа — виджет Telegram ещё не подключён)
// и подписывает cookie тем же signSession, что и настоящий гвард — с
// JWT_SECRET из process.env, который setTestEnv() в create-app.ts кладёт
// туда до старта AppModule.
import { getModelToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { UserRole, UserStatus } from '@xuanxue/shared';
import { SESSION_COOKIE } from '../../src/auth/session-cookie';
import { signSession } from '../../src/auth/session-token';
import { USER_MODEL_NAME } from '../../src/users/user-data.registry';
import type { UserRecord } from '../../src/users/user.schema';

export interface UserWithSession {
  userId: string;
  cookie: string;
}

/** `issuedAt` — для кейсов «протухший токен» (давнее issuedAt) и «rolling
 * после 7 дней» (issuedAt чуть больше SESSION_RENEW_AFTER_DAYS назад).
 * `telegramId` — для сценариев botChatActive/telegramLinked (ADR-0042,
 * auth-bot-chat-active.e2e-spec.ts): вход через виджет ставит telegramId
 * сразу, а личный чат — отдельным каналом поверх, см. тот спек. */
export async function createUserWithSession(
  app: NestExpressApplication,
  options: {
    name: string;
    roles: UserRole[];
    status?: UserStatus;
    issuedAt?: DateTime;
    telegramId?: number;
  },
): Promise<UserWithSession> {
  const model = app.get<Model<UserRecord>>(getModelToken(USER_MODEL_NAME), {
    strict: false,
  });
  const created = await model.create({
    name: options.name,
    roles: options.roles,
    status: options.status ?? 'active',
    telegramId: options.telegramId,
  });
  const userId = created._id.toString();

  const issuedAt = options.issuedAt ?? DateTime.utc();
  const token = signSession({ userId, issuedAt }, jwtSecret());
  const cookie = `${SESSION_COOKIE}=${token}`;

  return { userId, cookie };
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret)
    throw new Error('JWT_SECRET не задан — createTestApp() должен его выставить');
  return secret;
}
