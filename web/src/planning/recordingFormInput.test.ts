import { describe, expect, it } from 'vitest';
import { LESSON_LIMITS } from '@xuanxue/shared';
import { toAddRecordingInput, validateRecordingForm } from './recordingFormInput';

describe('validateRecordingForm', () => {
  it('пустая ссылка — ошибка', () => {
    expect(validateRecordingForm('  ')).toMatch(/Укажите ссылку/);
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
});
