import { describe, expect, it } from 'vitest';
import {
  isRecordingAllowed,
  sanitizeEvent,
  sanitizeUrl,
  UNKNOWN_ROUTE_PATH,
} from './analyticsPrivacy';

const ORIGIN = window.location.origin;

describe('sanitizeUrl', () => {
  it('свой origin, известный маршрут — origin + шаблон, без query и hash', () => {
    expect(sanitizeUrl(`${ORIGIN}/exams/abc123?ref=x#top`)).toBe(
      `${ORIGIN}/exams/:examId`,
    );
  });

  it('свой origin, неизвестный путь — origin + константа', () => {
    expect(sanitizeUrl(`${ORIGIN}/что-то-незнакомое`)).toBe(
      `${ORIGIN}${UNKNOWN_ROUTE_PATH}`,
    );
  });

  it('чужой origin — только он, без пути', () => {
    expect(sanitizeUrl('https://t.me/some_channel/42')).toBe('https://t.me');
  });

  it('невалидная строка не падает — константа без origin', () => {
    expect(sanitizeUrl('не url вовсе')).toBe(UNKNOWN_ROUTE_PATH);
  });

  it('путь без сегментов ("/") — известный маршрут-корень', () => {
    expect(sanitizeUrl(`${ORIGIN}/`)).not.toBe(`${ORIGIN}${UNKNOWN_ROUTE_PATH}`);
  });
});

describe('sanitizeEvent (before_send)', () => {
  it('null проходит как есть', () => {
    expect(sanitizeEvent(null)).toBeNull();
  });

  it('URL-свойства верхнего уровня заменяются на origin + шаблон', () => {
    const result = sanitizeEvent({
      uuid: '1',
      event: '$pageview',
      properties: {
        $current_url: `${ORIGIN}/exams/xyz?token=secret`,
        $referrer: 'https://google.com/search?q=x',
        other: 'не трогаем',
      },
    });
    expect(result?.properties.$current_url).toBe(`${ORIGIN}/exams/:examId`);
    expect(result?.properties.$referrer).toBe('https://google.com');
    expect(result?.properties.other).toBe('не трогаем');
  });

  it('*pathname свойства заменяются шаблоном маршрута, не полным URL', () => {
    const result = sanitizeEvent({
      uuid: '1',
      event: '$pageview',
      properties: { $pathname: '/exams/xyz', $initial_pathname: '/join/code1' },
    });
    expect(result?.properties.$pathname).toBe('/exams/:examId');
    expect(result?.properties.$initial_pathname).toBe('/join/:code');
  });

  it('$set/$set_once с $initial_current_url тоже маскируются', () => {
    const result = sanitizeEvent({
      uuid: '1',
      event: '$identify',
      properties: {},
      $set: { $current_url: `${ORIGIN}/exams` },
      $set_once: { $initial_current_url: `${ORIGIN}/exams` },
    });
    // `/exams` — маршрут списка без параметра, шаблон совпадает с самим путём.
    expect(result?.$set?.$current_url).toBe(`${ORIGIN}/exams`);
    expect(result?.$set_once?.$initial_current_url).toBe(`${ORIGIN}/exams`);
  });

  it('событие без URL-свойств (например $snapshot) возвращается как есть', () => {
    const properties = { $snapshot_data: [{ type: 2 }], $session_id: 's1' };
    const result = sanitizeEvent({ uuid: '1', event: '$snapshot', properties });
    expect(result?.properties).toEqual(properties);
  });
});

describe('isRecordingAllowed', () => {
  it('join/emailLogin/emailConfirm — запись запрещена', () => {
    expect(isRecordingAllowed('/join/abc123')).toBe(false);
    expect(isRecordingAllowed('/login/email')).toBe(false);
    expect(isRecordingAllowed('/email/confirm')).toBe(false);
  });

  it('обычный экран кабинета — запись разрешена', () => {
    expect(isRecordingAllowed('/exams')).toBe(true);
    expect(isRecordingAllowed('/schedule')).toBe(true);
  });

  it('неизвестный путь — запись разрешена (секрета в нём быть не может)', () => {
    expect(isRecordingAllowed('/что-то-незнакомое')).toBe(true);
  });
});
