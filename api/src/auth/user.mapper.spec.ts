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
    studentMode: false,
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
      email: 'maria@example.com',
      hasEmail: true,
      googleLinked: true,
      pendingEmail: undefined,
      noTelegram: false,
      needsProfile: true,
      studentMode: false,
      canUseStudentMode: true,
      homeHiddenTiles: [],
    });
  });

  // ADR-0163: `roles` в ответе — действующие, и по ним «режим доступен» не
  // вывести — canUseStudentMode приходит отдельным полем, считается по
  // настоящим ролям.
  describe('режим ученика', () => {
    it('штат без режима: роли целые, режим доступен, но не включён', () => {
      const dto = toMeDto(fullUser(), true);

      expect(dto).toMatchObject({
        roles: ['admin'],
        studentMode: false,
        canUseStudentMode: true,
      });
    });

    it('штат в режиме: роли пустые, режим включён и доступен (чтобы выключить)', () => {
      const dto = toMeDto({ ...fullUser(), studentMode: true }, true);

      expect(dto).toMatchObject({
        roles: [],
        studentMode: true,
        canUseStudentMode: true,
      });
    });

    it('замаскированный AuthGuard человек и человек из БД дают один ответ', () => {
      const real: UserLean = { ...fullUser(), studentMode: true };

      expect(toMeDto({ ...real, roles: [] }, true)).toEqual(toMeDto(real, true));
    });

    it('ученик без ролей: режима нет и взять его неоткуда', () => {
      expect(toMeDto({ ...fullUser(), roles: [] }, true)).toMatchObject({
        roles: [],
        studentMode: false,
        canUseStudentMode: false,
        homeHiddenTiles: [],
      });
    });

    it('бухгалтер — не штат: режим ему не доступен', () => {
      expect(toMeDto({ ...fullUser(), roles: ['accountant'] }, true)).toMatchObject({
        roles: ['accountant'],
        studentMode: false,
        canUseStudentMode: false,
        homeHiddenTiles: [],
      });
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

  // ADR-0067: отметка «не предлагать связку», а не «не слать» — доставку
  // решает отдельно наличие личного чата с ботом (PersonalChats.chatFor()),
  // а не это поле; та же пара «дата → булево», что у needsProfile выше.
  it('noTelegram: false без noTelegramAt, true — с ним', () => {
    expect(toMeDto(fullUser(), true).noTelegram).toBe(false);

    const saidNoTelegram: UserLean = {
      ...fullUser(),
      noTelegramAt: new Date('2026-09-19T00:00:00Z'),
    };
    expect(toMeDto(saidNoTelegram, true).noTelegram).toBe(true);
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
  // нечего); telegramId/googleId по-прежнему закрыты, свой email выходит
  // значением (ADR-0059, баг владельца 2026-09-29).
  it('свой email выходит значением — telegramId и googleId не выходят', () => {
    const dto = toMeDto(fullUser(), true) as unknown as Record<string, unknown>;
    expect(dto.email).toBe('maria@example.com');
    expect(dto.telegramId).toBeUndefined();
    expect(dto.googleId).toBeUndefined();
    expect(dto.hasEmail).toBe(true);
    expect(Object.keys(dto).sort()).toEqual([
      'botChatActive',
      'canUseStudentMode',
      'email',
      'googleLinked',
      'hasEmail',
      'homeHiddenTiles',
      'id',
      'name',
      'needsProfile',
      'noTelegram',
      'pendingEmail',
      'roles',
      'status',
      'studentMode',
      'telegramLinked',
    ]);
  });

  // ADR-0145: та же пара, что telegramLinked — сам googleId наружу не идёт
  // (проверено строкой выше), только факт «есть ли».
  it('googleLinked: true при заполненном googleId, false — без него', () => {
    expect(toMeDto(fullUser(), true).googleLinked).toBe(true);

    const noGoogle: UserLean = { ...fullUser(), googleId: undefined };
    expect(toMeDto(noGoogle, true).googleLinked).toBe(false);
  });

  // Баг владельца 2026-09-29: «Профиль» не называл привязанный адрес, потому
  // что в MeDto был только признак. Три состояния почты и согласованность
  // hasEmail с email — оба поля идут из одного users.email.
  describe('почта в MeDto', () => {
    it('адрес есть — email отдаётся, hasEmail true, pendingEmail пуст', () => {
      const dto = toMeDto(fullUser(), true);

      expect(dto.email).toBe('maria@example.com');
      expect(dto.hasEmail).toBe(true);
      expect(dto.pendingEmail).toBeUndefined();
      expect(dto.hasEmail).toBe(dto.email !== undefined);
    });

    it('адреса нет — email пуст, hasEmail false', () => {
      const dto = toMeDto({ ...fullUser(), email: undefined }, true);

      expect(dto.email).toBeUndefined();
      expect(dto.hasEmail).toBe(false);
      expect(dto.hasEmail).toBe(dto.email !== undefined);
    });

    it('только pendingEmail — email пуст, hasEmail false, ждущий адрес отдан как есть', () => {
      const dto = toMeDto(
        { ...fullUser(), email: undefined, pendingEmail: 'ждёт@example.com' },
        true,
      );

      expect(dto.email).toBeUndefined();
      expect(dto.hasEmail).toBe(false);
      expect(dto.pendingEmail).toBe('ждёт@example.com');
      expect(dto.hasEmail).toBe(dto.email !== undefined);
    });
  });
});

// ADR-0179: личная настройка плиток «Главной» едет в MeDto как есть, а старое
// в базе (нет поля, неизвестный ключ) не роняет экран.
describe('toMeDto: homeHiddenTiles', () => {
  it('нет поля у человека — пустой список, а не undefined', () => {
    expect(toMeDto(fullUser(), false).homeHiddenTiles).toEqual([]);
  });

  it('скрытое отдаётся в каноническом порядке без повторов', () => {
    const dto = toMeDto(
      { ...fullUser(), homeHiddenTiles: ['events', 'payment', 'events'] },
      false,
    );

    expect(dto.homeHiddenTiles).toEqual(['payment', 'events']);
  });

  it('ключ, которого уже нет среди плиток, отсеивается', () => {
    const stale = { ...fullUser(), homeHiddenTiles: ['payment', 'gone'] };

    // Приведение: в базе бывает то, чего нет в типе (след прежней версии).
    expect(toMeDto(stale as unknown as UserLean, false).homeHiddenTiles).toEqual([
      'payment',
    ]);
  });
});
