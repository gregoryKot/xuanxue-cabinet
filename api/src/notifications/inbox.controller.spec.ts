// Test.createTestingModule с фейком сервиса — образец notification-prefs.controller.spec.ts:
// без HTTP, без Mongo. Владение проверяет e2e (inbox-ownership.e2e-spec.ts)
// на настоящем гварде — здесь только «контроллер зовёт сервис с userId из
// сессии и отдаёт ответ». markRead()/markAllRead() отдают InboxPageDto
// целиком, не NotificationDto/204 — ADR-0087.
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import type { InboxPageDto, NotificationDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { ListInboxDto } from './dto/list-inbox.dto';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
};

const PAGE_DTO: InboxPageDto = { items: [], unreadCount: 0 };
const NOTIFICATION_DTO: NotificationDto = {
  id: 'n1',
  kind: 'exam_result',
  text: 'Работу проверили — Форма 24',
  attemptId: 'a1',
  outcome: 'passed',
  createdAt: '2026-09-17T09:00:00.000Z',
};

async function buildController(
  service: Partial<InboxService> = {},
): Promise<InboxController> {
  const module = await Test.createTestingModule({
    controllers: [InboxController],
    providers: [{ provide: InboxService, useValue: service }],
  }).compile();
  return module.get(InboxController);
}

describe('InboxController', () => {
  it('list() передаёт userId из сессии и query, отдаёт ответ сервиса', async () => {
    const list = jest.fn().mockResolvedValue(PAGE_DTO);
    const controller = await buildController({ list });
    const query: ListInboxDto = { limit: 10 };

    await expect(controller.list(query, USER)).resolves.toEqual(PAGE_DTO);
    expect(list).toHaveBeenCalledWith(USER.id, query);
  });

  it('markRead() отмечает строку, затем отдаёт ленту целиком (страница по умолчанию, не 204)', async () => {
    const markRead = jest.fn().mockResolvedValue(NOTIFICATION_DTO);
    const list = jest.fn().mockResolvedValue(PAGE_DTO);
    const controller = await buildController({ markRead, list });

    await expect(controller.markRead('n1', USER)).resolves.toEqual(PAGE_DTO);

    expect(markRead).toHaveBeenCalledWith(USER.id, 'n1', expect.any(DateTime));
    expect(list).toHaveBeenCalledWith(USER.id, {});
  });

  it('markAllRead() гасит ленту, затем отдаёт её целиком (страница по умолчанию, не 204)', async () => {
    const markAllRead = jest.fn().mockResolvedValue(undefined);
    const list = jest.fn().mockResolvedValue(PAGE_DTO);
    const controller = await buildController({ markAllRead, list });

    await expect(controller.markAllRead(USER)).resolves.toEqual(PAGE_DTO);

    expect(markAllRead).toHaveBeenCalledWith(USER.id, expect.any(DateTime));
    expect(list).toHaveBeenCalledWith(USER.id, {});
  });
});
