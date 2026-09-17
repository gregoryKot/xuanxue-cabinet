// /вопрос (ТЗ 4б.3) — фейковый PersonalChats, без Mongo (тем же приёмом, что
// exam-command.handler.spec.ts): личный чат штата видит screen 1, чужой чат
// и сбой резолва — бот молчит, апдейт не падает.
import { DateTime } from 'luxon';
import { fakeFlowCtx } from './exam-attempt-flow.test-support';
import { NewExamItemCommandHandler } from './new-exam-item-command.handler';
import type { PersonalChats } from '../personal-chats';

const NOW = DateTime.utc(2026, 9, 17, 10, 0, 0);
const CHAT_ID = 111;

function fakePersonalChats(list: PersonalChats['list']): PersonalChats {
  return { list } as unknown as PersonalChats;
}

describe('NewExamItemCommandHandler', () => {
  it('штат — screen 1 с четырьмя типами и «Отмена»', async () => {
    const handler = new NewExamItemCommandHandler(
      fakePersonalChats(
        jest
          .fn()
          .mockResolvedValue([{ chatId: String(CHAT_ID), userId: 'u1', name: 'x' }]),
      ),
    );
    const { ctx, replies } = fakeFlowCtx();

    await handler.handle(ctx, NOW);

    expect(replies[0]).toContain('Выберите тип ответа');
  });

  it('не штат — бот молчит', async () => {
    const handler = new NewExamItemCommandHandler(
      fakePersonalChats(jest.fn().mockResolvedValue([])),
    );
    const { ctx, replies } = fakeFlowCtx();

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([]);
  });

  it('сбой резолва доступа — бот молчит, апдейт не падает', async () => {
    const handler = new NewExamItemCommandHandler(
      fakePersonalChats(jest.fn().mockRejectedValue(new Error('Mongo недоступна'))),
    );
    const { ctx, replies } = fakeFlowCtx();

    await expect(handler.handle(ctx, NOW)).resolves.toBeUndefined();
    expect(replies).toEqual([]);
  });
});
