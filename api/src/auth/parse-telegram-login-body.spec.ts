// Юнит-тест самой функции (не через HTTP): parseTelegramLoginBody — обычная
// async-функция без DI, доступна напрямую. e2e на /auth/telegram уже есть
// (auth-telegram.e2e-spec.ts — успешный вход, validation-messages.e2e-spec.ts —
// лишнее поле виджета не 400) — здесь только то, что не покрыто оттуда: сам
// маппинг «class-validator упал» → BadRequestException с русским текстом
// (см. комментарий у функции про forbidNonWhitelisted).
import { BadRequestException } from '@nestjs/common';
import { parseTelegramLoginBody } from './parse-telegram-login-body';

// BadRequestException.getResponse() типизирован как `object` — достаём
// message[] явным приведением, а не через `.rejects.toMatchObject` с
// вложенным expect.arrayContaining (тот на unknown-типе rejects даёт
// unsafe-assignment, eslint no-unsafe-assignment).
async function messagesFrom(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    const response = error.getResponse() as { message: string[] };
    return response.message;
  }
  throw new Error('ожидалась BadRequestException');
}

const VALID_RAW: Record<string, unknown> = {
  id: 42,
  first_name: 'Мария',
  auth_date: 1_700_000_000,
  hash: 'a'.repeat(64),
};

describe('parseTelegramLoginBody', () => {
  it('валидное тело виджета — собирает TelegramLoginDto', async () => {
    const dto = await parseTelegramLoginBody(VALID_RAW);
    expect(dto).toMatchObject(VALID_RAW);
  });

  it('лишнее поле виджета отбрасывается молча (whitelist без forbidNonWhitelisted)', async () => {
    const dto = await parseTelegramLoginBody({
      ...VALID_RAW,
      chat_instance: 'поле, которого нет в TelegramLoginDto',
    });
    expect(dto).not.toHaveProperty('chat_instance');
  });

  it('невалидное тело — BadRequestException с русским текстом в details', async () => {
    const messages = await messagesFrom(
      parseTelegramLoginBody({ ...VALID_RAW, hash: 'не hex и не 64 символа' }),
    );

    expect(messages).toEqual(['Подпись входа: должна быть строкой из 64 hex-символов.']);
  });

  it('несколько проблем разом — details по строке на каждую, не только первая', async () => {
    const messages = await messagesFrom(
      parseTelegramLoginBody({ first_name: 123, auth_date: 'вчера' }),
    );

    expect(messages).toEqual(
      expect.arrayContaining([
        'Идентификатор: должно быть положительным числом.',
        'Имя: не длиннее 64 символов.',
        'Время входа: должно быть целым числом.',
      ]),
    );
  });
});
