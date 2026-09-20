import type { UserLean } from '../users/users.service';
import { toMeDto } from './user.mapper';

function fullUser(): UserLean {
  return {
    id: 'u1',
    name: 'Мария',
    email: 'maria@example.com',
    telegramId: 12345,
    googleId: 'g-1',
    roles: ['admin'],
    status: 'active',
    lastLoginAt: new Date('2026-09-05T00:00:00Z'),
  };
}

describe('toMeDto', () => {
  it('переносит id, name, roles, status; botChatActive — параметром', () => {
    expect(toMeDto(fullUser(), true)).toEqual({
      id: 'u1',
      name: 'Мария',
      roles: ['admin'],
      status: 'active',
      telegramLinked: true,
      botChatActive: true,
      hasEmail: true,
      pendingEmail: undefined,
      needsProfile: true,
    });
  });

  // ADR-0044: пустой profileNamedAt — человек ещё не прошёл `/welcome`,
  // кабинет обязан спросить имя. Заполненный — больше не спрашивает.
  it('needsProfile: true без profileNamedAt, false — с ним', () => {
    expect(toMeDto(fullUser(), true).needsProfile).toBe(true);

    const named: UserLean = {
      ...fullUser(),
      profileNamedAt: new Date('2026-09-10T00:00:00Z'),
    };
    expect(toMeDto(named, true).needsProfile).toBe(false);
  });

  // Инцидент 2026-09-16 (RUNBOOK §8.17): вошедшего по почте бот не узнаёт, и
  // кабинет обязан это знать — иначе он зовёт его слать видео боту впустую.
  it('без telegramId — telegramLinked: false', () => {
    const emailOnly: UserLean = { ...fullUser(), telegramId: undefined };

    expect(toMeDto(emailOnly, false).telegramLinked).toBe(false);
  });

  // ADR-0042: вход через виджет Telegram ставит telegramId сразу (бот узнаёт
  // человека), а личный чат заводит только нажатое в боте «Запустить» — до
  // этого botChatActive: false, хотя telegramLinked уже true. Подсказка на
  // «Проверке работ», построенная на одном telegramLinked, промолчала бы
  // ровно у этой группы (учителя, вошедшие через Telegram и ни разу не
  // открывшие бота).
  it('telegramLinked: true, botChatActive: false — вошёл через виджет, чат не подключил', () => {
    const dto = toMeDto(fullUser(), false);

    expect(dto.telegramLinked).toBe(true);
    expect(dto.botChatActive).toBe(false);
  });

  // `status` наружу идёт (ADR-0026, ADR-0036: active/blocked, ждать больше
  // нечего); telegramId/googleId по-прежнему закрыты, свой email — только
  // признаком hasEmail (ADR-0059).
  it('email отдаётся только признаком hasEmail — telegramId и googleId не выходят', () => {
    const dto = toMeDto(fullUser(), true) as unknown as Record<string, unknown>;
    expect(dto.email).toBeUndefined();
    expect(dto.telegramId).toBeUndefined();
    expect(dto.googleId).toBeUndefined();
    expect(dto.hasEmail).toBe(true);
    expect(Object.keys(dto).sort()).toEqual([
      'botChatActive',
      'hasEmail',
      'id',
      'name',
      'needsProfile',
      'pendingEmail',
      'roles',
      'status',
      'telegramLinked',
    ]);
  });

  // ADR-0059: свой подтверждённый адрес — единственное исключение из
  // «ключи входа наружу не идут», и то только признаком, не значением.
  it('hasEmail: true при заполненном email, false — без него', () => {
    expect(toMeDto(fullUser(), true).hasEmail).toBe(true);

    const noEmail: UserLean = { ...fullUser(), email: undefined };
    expect(toMeDto(noEmail, true).hasEmail).toBe(false);
  });

  it('pendingEmail переносится как есть — пусто, если адрес не назван или уже подтверждён', () => {
    expect(toMeDto(fullUser(), true).pendingEmail).toBeUndefined();

    const pending: UserLean = { ...fullUser(), pendingEmail: 'ждёт@example.com' };
    expect(toMeDto(pending, true).pendingEmail).toBe('ждёт@example.com');
  });
});
