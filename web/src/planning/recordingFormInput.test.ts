import { describe, expect, it } from 'vitest';
import { LESSON_LIMITS } from '@xuanxue/shared';
import { toAddRecordingInput, validateRecordingForm } from './recordingFormInput';

describe('validateRecordingForm', () => {
  it('ни файла, ни ссылки — ошибка', () => {
    expect(validateRecordingForm('  ')).toMatch(/файл записи или укажите ссылку/);
  });

  it('файл загружен, ссылки нет — форма валидна', () => {
    expect(validateRecordingForm('  ', true)).toBeNull();
  });

  it('файл загружен, но вписанная ссылка кривая — ошибка ссылки', () => {
    expect(validateRecordingForm('http://youtu.be/x', true)).toMatch(/https:\/\//);
  });

  it('не https — ошибка', () => {
    expect(validateRecordingForm('http://youtu.be/x')).toMatch(/https:\/\//);
  });

  it('слишком длинная ссылка — ошибка с лимитом', () => {
    const url = 'https://' + 'a'.repeat(LESSON_LIMITS.url);
    expect(validateRecordingForm(url)).toMatch(String(LESSON_LIMITS.url));
  });

  it('валидная https-ссылка — null', () => {
    expect(validateRecordingForm('https://youtu.be/x')).toBeNull();
  });
});

describe('toAddRecordingInput', () => {
  it('обрезает пробелы, пустой заголовок не отправляется', () => {
    expect(toAddRecordingInput('  ', '  https://youtu.be/x  ')).toEqual({
      title: undefined,
      url: 'https://youtu.be/x',
    });
  });

  it('заголовок передаётся, если задан', () => {
    expect(toAddRecordingInput('Запись занятия', 'https://youtu.be/x')).toEqual({
      title: 'Запись занятия',
      url: 'https://youtu.be/x',
    });
  });

  it('только файл: ссылки в теле нет, videoId на месте', () => {
    expect(toAddRecordingInput('', '  ', 'v1')).toEqual({
      title: undefined,
      url: undefined,
      videoId: 'v1',
    });
  });

  it('файл и ссылка вместе — одна запись с обоими', () => {
    expect(toAddRecordingInput('Часть 1', 'https://youtu.be/x', 'v1')).toEqual({
      title: 'Часть 1',
      url: 'https://youtu.be/x',
      videoId: 'v1',
    });
  });
});
