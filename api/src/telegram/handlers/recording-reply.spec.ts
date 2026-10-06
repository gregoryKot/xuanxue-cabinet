// Чистая функция без Telegram и Mongo: занятие берётся из кнопки
// «Записи не будет» сообщения, на которое ответил учитель (ADR-0172).
import { Types } from 'mongoose';
import type { Message } from 'telegraf/types';
import { lessonIdFromRepliedPrompt } from './recording-reply';

function replyTo(keyboard: unknown): Message {
  return {
    message_id: 2,
    reply_to_message: { message_id: 1, reply_markup: keyboard },
  } as unknown as Message;
}

function keyboardOf(...callbackData: string[]) {
  return {
    inline_keyboard: [
      callbackData.map((data) => ({ text: 'кнопка', callback_data: data })),
    ],
  };
}

describe('lessonIdFromRepliedPrompt', () => {
  it('ответ на вопрос с norec:<id> — возвращает id занятия', () => {
    const id = new Types.ObjectId().toString();

    expect(lessonIdFromRepliedPrompt(replyTo(keyboardOf(`norec:${id}`)))).toBe(id);
  });

  it('norec среди других кнопок — всё равно находит', () => {
    const id = new Types.ObjectId().toString();
    const other = new Types.ObjectId().toString();

    const result = lessonIdFromRepliedPrompt(
      replyTo(keyboardOf(`topic:${other}`, `norec:${id}`)),
    );

    expect(result).toBe(id);
  });

  it('не ответ (нет reply_to_message) — null', () => {
    const message = { message_id: 2 } as unknown as Message;

    expect(lessonIdFromRepliedPrompt(message)).toBeNull();
  });

  it('сообщения нет вовсе — null', () => {
    expect(lessonIdFromRepliedPrompt(undefined)).toBeNull();
  });

  it('у сообщения, на которое ответили, нет клавиатуры — null', () => {
    const message = {
      message_id: 2,
      reply_to_message: { message_id: 1 },
    } as unknown as Message;

    expect(lessonIdFromRepliedPrompt(message)).toBeNull();
  });

  it('в клавиатуре только другие действия — null', () => {
    const id = new Types.ObjectId().toString();

    expect(lessonIdFromRepliedPrompt(replyTo(keyboardOf(`topic:${id}`)))).toBeNull();
  });

  it('norec с негодным id — null', () => {
    expect(lessonIdFromRepliedPrompt(replyTo(keyboardOf('norec:not-an-id')))).toBeNull();
  });
});
