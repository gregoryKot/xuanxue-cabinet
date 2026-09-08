import { constraintText } from './validation-constraint-text';

describe('constraintText', () => {
  // Дефолтные сообщения class-validator (ровно то, что реально приходит из
  // библиотеки для каждого декоратора — см. исследование в PR: cjs/decorator/*)
  // → русский текст по словарю.
  it.each([
    ['isString', 'title must be a string', 'должно быть текстом.'],
    ['isNotEmpty', 'title should not be empty', 'заполните поле.'],
    ['isDefined', 'classId should not be null or undefined', 'обязательное поле.'],
    [
      'maxLength',
      'title must be shorter than or equal to 120 characters',
      'не длиннее 120 символов.',
    ],
    [
      'minLength',
      'title must be longer than or equal to 3 characters',
      'не короче 3 символов.',
    ],
    ['isUrl', 'zoomLink must be a URL address', 'должна начинаться с https://.'],
    ['isInt', 'durationMin must be an integer number', 'должно быть целым числом.'],
    [
      'isNumber',
      'leadMinutes must be a number conforming to the specified constraints',
      'должно быть числом.',
    ],
    ['min', 'leadMinutes must not be less than 0', 'не меньше 0.'],
    ['max', 'leadMinutes must not be greater than 1440', 'не больше 1440.'],
    ['isBoolean', 'active must be a boolean value', 'должно быть да или нет.'],
    [
      'isIn',
      'kind must be one of the following values: lesson_link, recording, manual',
      'допустимые значения: lesson_link, recording, manual.',
    ],
    ['isMongoId', 'classId must be a mongodb id', 'неверный идентификатор.'],
    [
      'isIso8601',
      'startsAt must be a valid ISO 8601 date string',
      'дата и время в формате ISO, например 2026-09-08T19:00:00Z.',
    ],
    [
      'matches',
      'hash must match /^[0-9a-f]{64}$/ regular expression',
      'неверный формат.',
    ],
    ['isArray', 'rules must be an array', 'должно быть списком.'],
    [
      'arrayMaxSize',
      'rules must contain no more than 14 elements',
      'не больше 14 элементов.',
    ],
    [
      'arrayMinSize',
      'channelIds must contain at least 1 elements',
      'не меньше 1 элементов.',
    ],
    ['arrayNotEmpty', 'channelIds should not be empty', 'выберите хотя бы один вариант.'],
    [
      'arrayUnique',
      "All rules's elements must be unique",
      'значения повторяются, уберите дубли.',
    ],
    ['isObject', 'config must be an object', 'неверный формат настроек.'],
    [
      'isTimeZone',
      'tz must be a valid IANA time-zone',
      'укажите часовой пояс IANA, например Asia/Jerusalem.',
    ],
    ['isPositive', 'id must be a positive number', 'должно быть положительным числом.'],
    ['whitelistValidation', 'property extra should not exist', 'поле не поддерживается.'],
    [
      'nestedValidation',
      'nested property rules must be either object or array',
      'неверный формат.',
    ],
  ] as const)('%s (дефолт class-validator) → «%s»', (key, message, expected) => {
    expect(constraintText(key, message)).toBe(expected);
  });

  it('each-префикс массива не мешает распознать дефолт (isMongoId на channelIds)', () => {
    expect(
      constraintText('isMongoId', 'each value in channelIds must be a mongodb id'),
    ).toBe('неверный идентификатор.');
  });

  it('свой message из декоратора DTO (не совпал с дефолтным шаблоном) — оставляем как есть', () => {
    expect(constraintText('matches', 'в формате ЧЧ:ММ, например 19:00.')).toBe(
      'в формате ЧЧ:ММ, например 19:00.',
    );
    expect(constraintText('matches', 'не может быть пустым.')).toBe(
      'не может быть пустым.',
    );
  });

  it('неизвестный тип ограничения без словаря — сообщение не теряется', () => {
    expect(constraintText('customConstraint', 'что-то своё')).toBe('что-то своё');
  });
});
