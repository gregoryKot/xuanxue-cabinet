// Разбор #tgAuthResult= (мобильный вход, баг с прода 2026-09-08, см.
// telegramAuthResult.ts). Фрагмент для «мусорных» случаев строим на лету
// через btoa от JSON, как это делает сам telegram-widget.js (JSON → base64 →
// base64url: без паддинга, '+'→'-', '/'→'_').
import { describe, expect, it } from 'vitest';
import type { TelegramLoginInput } from '@xuanxue/shared';
import { readTelegramAuthResult } from './telegramAuthResult';

function toBase64Url(json: unknown): string {
  return btoa(JSON.stringify(json))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** base64url от произвольной (уже ASCII) строки — для случая, когда JSON
 * собран вручную (например, с `\uXXXX`-экранированием кириллицы). */
function stringToBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url от JSON в сырых UTF-8-байтах — так, как это делает сервер
 * Telegram (в отличие от `toBase64Url` выше, который через `btoa`
 * ограничен ASCII). */
function toBase64UrlUtf8(json: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  const binaryString = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return stringToBase64Url(binaryString);
}

describe('readTelegramAuthResult', () => {
  it('валидный фрагмент с "-"/"_" в base64url — возвращает payload', () => {
    // Подобранный `hash` даёт в base64 и '+', и '/' — оба должны замениться
    // на '-' и '_' виджетом (и наоборот раскодироваться у нас); без такого
    // случая замена символов в decodeBase64UrlJson не проверена.
    const user: TelegramLoginInput = {
      id: 123_456_789,
      first_name: 'Test User',
      auth_date: 1_757_000_000,
      hash: ';e~;)Vo>&JY3QEz*j0UlLV-UH16Jod@|qSmH5B*6NgXuP=&!n#?@C)BgBD|;^kJ:',
    };
    const encoded =
      'eyJpZCI6MTIzNDU2Nzg5LCJmaXJzdF9uYW1lIjoiVGVzdCBVc2VyIiwiYXV0aF9kYXRlIjoxNzU3MDAwMDAwLCJoYXNoIjoiO2V-OylWbz4mSlkzUUV6KmowVWxMVi1VSDE2Sm9kQHxxU21INUIqNk5nWHVQPSYhbiM_QEMpQmdCRHw7XmtKOiJ9';
    expect(encoded).toMatch(/-/);
    expect(encoded).toMatch(/_/);

    expect(readTelegramAuthResult(`#tgAuthResult=${encoded}`)).toEqual(user);
  });

  it('фрагмент с мусором — null', () => {
    expect(readTelegramAuthResult('#foo=bar&baz=1')).toBeNull();
  });

  it('невалидный base64 внутри валидных символов regex — null, без исключения', () => {
    expect(readTelegramAuthResult('#tgAuthResult=A')).toBeNull();
  });

  it('JSON не той формы (нет обязательных полей) — null', () => {
    const encoded = toBase64Url({ foo: 'bar' });
    expect(readTelegramAuthResult(`#tgAuthResult=${encoded}`)).toBeNull();
  });

  it('пустая строка — null', () => {
    expect(readTelegramAuthResult('')).toBeNull();
  });

  it('tgAuthResult не в конце строки — null', () => {
    const encoded = toBase64Url({
      id: 1,
      first_name: 'X',
      auth_date: 1,
      hash: 'a'.repeat(64),
    });
    expect(readTelegramAuthResult(`#tgAuthResult=${encoded}&other=1`)).toBeNull();
  });

  it('строка без tgAuthResult= вовсе — null', () => {
    expect(readTelegramAuthResult('#/schedule')).toBeNull();
  });

  it('кириллическое имя в сырых UTF-8-байтах — не мохибейк (ревью по этому багу)', () => {
    // Голый atob() отдаёт байт-в-символ и портит first_name — сервер считает
    // HMAC по значениям полей, испорченное имя не совпадёт с hash, и вход
    // для кириллических имён снова сломан. decodeBase64UrlJson декодирует
    // байты как UTF-8 через TextDecoder — этот тест ловит регресс назад к
    // голому atob().
    const user: TelegramLoginInput = {
      id: 1,
      first_name: 'Гриша',
      auth_date: 1_700_000_000,
      hash: 'a'.repeat(64),
    };
    const encoded = toBase64UrlUtf8(user);

    expect(readTelegramAuthResult(`#tgAuthResult=${encoded}`)).toEqual(user);
  });

  it('кириллическое имя в JSON с \\uXXXX-экранированием — тоже не искажается', () => {
    // "Гриша" через \u-экранирование — весь текст JSON здесь ASCII, поэтому
    // даже голый btoa/atob (без TextDecoder) декодировал бы его правильно;
    // случай нужен, чтобы убедиться, что переход на TextDecoder не сломал
    // этот, ранее рабочий, путь.
    const escapedJson =
      '{"id":1,"first_name":"\\u0413\\u0440\\u0438\\u0448\\u0430","auth_date":1700000000,"hash":"' +
      'a'.repeat(64) +
      '"}';
    const encoded = stringToBase64Url(escapedJson);

    expect(readTelegramAuthResult(`#tgAuthResult=${encoded}`)).toEqual({
      id: 1,
      first_name: 'Гриша',
      auth_date: 1_700_000_000,
      hash: 'a'.repeat(64),
    });
  });
});
