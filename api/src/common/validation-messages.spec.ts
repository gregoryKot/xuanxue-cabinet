import type { ValidationError } from 'class-validator';
import { formatValidationErrors } from './validation-messages';

// ValidationError-объекты собраны вручную (не через настоящий class-validator)
// по образцу domain-exception.filter.spec.ts — так тест не зависит от того,
// какие именно декораторы стоят у конкретного DTO сегодня, а проверяет сам
// маппер: подпись поля + перевод ограничения, путь для вложенных ошибок.
function leaf(property: string, constraints: Record<string, string>): ValidationError {
  return { property, constraints, children: [] };
}

describe('formatValidationErrors', () => {
  it('простое поле верхнего уровня — «Подпись: текст»', () => {
    const errors = [leaf('title', { isNotEmpty: 'title should not be empty' })];

    expect(formatValidationErrors(errors)).toEqual(['Название: заполните поле.']);
  });

  it('несколько ограничений на одном поле — по строке на каждое', () => {
    const errors = [
      leaf('zoomLink', {
        isUrl: 'zoomLink must be a URL address',
        maxLength: 'zoomLink must be shorter than or equal to 500 characters',
      }),
    ];

    expect(formatValidationErrors(errors)).toEqual([
      'Ссылка Zoom: должна начинаться с https://.',
      'Ссылка Zoom: не длиннее 500 символов.',
    ]);
  });

  it('поле без подписи в FIELD_LABELS_RU — само имя поля (не должно случиться при живых DTO, но не теряет текст)', () => {
    const errors = [
      leaf('nonexistentField', { isString: 'nonexistentField must be a string' }),
    ];

    expect(formatValidationErrors(errors)).toEqual([
      'nonexistentField: должно быть текстом.',
    ]);
  });

  it('несколько полей в одном запросе — по независимой строке на каждое', () => {
    const errors = [
      leaf('title', { isNotEmpty: 'title should not be empty' }),
      leaf('durationMin', { isInt: 'durationMin must be an integer number' }),
    ];

    expect(formatValidationErrors(errors)).toEqual([
      'Название: заполните поле.',
      'Длительность: должно быть целым числом.',
    ]);
  });

  it('вложенный объект (UpdateSettingsDto.templates → UpdateTemplatesDto) — подпись листа, без родителя', () => {
    const errors = [
      {
        property: 'templates',
        children: [leaf('lesson_link', { matches: 'не может быть пустым.' })],
      } as ValidationError,
    ];

    expect(formatValidationErrors(errors)).toEqual([
      'Шаблон «Ссылка на занятие»: не может быть пустым.',
    ]);
  });

  it('вложенный массив объектов (ClassFieldsDto.rules → ScheduleRuleDto) — «Правило N, поле»', () => {
    const errors = [
      {
        property: 'rules',
        children: [
          {
            property: '1',
            children: [leaf('time', { matches: 'в формате ЧЧ:ММ, например 19:00.' })],
          },
        ],
      } as ValidationError,
    ];

    expect(formatValidationErrors(errors)).toEqual([
      'Правило 2, Время: в формате ЧЧ:ММ, например 19:00.',
    ]);
  });

  it('неизвестное поле (forbidNonWhitelisted) — «поле не поддерживается»', () => {
    const errors = [
      leaf('surname', { whitelistValidation: 'property surname should not exist' }),
    ];

    expect(formatValidationErrors(errors)).toEqual(['surname: поле не поддерживается.']);
  });

  it('один запрос: обычная ошибка + вложенное правило + неизвестное поле — все строки разом', () => {
    const errors = [
      leaf('title', { isNotEmpty: 'title should not be empty' }),
      {
        property: 'rules',
        children: [
          {
            property: '0',
            children: [leaf('time', { matches: 'в формате ЧЧ:ММ, например 19:00.' })],
          },
        ],
      } as ValidationError,
      leaf('surname', { whitelistValidation: 'property surname should not exist' }),
    ];

    expect(formatValidationErrors(errors)).toEqual([
      'Название: заполните поле.',
      'Правило 1, Время: в формате ЧЧ:ММ, например 19:00.',
      'surname: поле не поддерживается.',
    ]);
  });

  it('пустой список ошибок — пустой список сообщений', () => {
    expect(formatValidationErrors([])).toEqual([]);
  });

  it('ValidationError без children (поле опционально в типе class-validator) — не падает, работает как с пустым массивом', () => {
    const errors = [
      { property: 'title', constraints: { isNotEmpty: 'title should not be empty' } },
    ] as ValidationError[];

    expect(formatValidationErrors(errors)).toEqual(['Название: заполните поле.']);
  });

  it('второй массив вложенных объектов (не «rules» из ARRAY_ITEM_LABEL_RU) — номер элемента подставляется к подписи поля', () => {
    const errors = [
      {
        property: 'channelIds',
        children: [
          {
            property: '0',
            children: [leaf('type', { isString: 'type must be a string' })],
          },
        ],
      } as ValidationError,
    ];

    expect(formatValidationErrors(errors)).toEqual([
      'Каналы 1, Тип канала: должно быть текстом.',
    ]);
  });

  it('индекс массива — самый первый сегмент пути (перед ним нет поля) — подпись элемента пустая, но номер и вложенное поле на месте', () => {
    // Гипотетический случай (сегодня ни один DTO не валидирует тело как
    // голый массив — root всегда объект), но path строится через spread без
    // проверки границ (noUncheckedIndexedAccess) — labelForPath защищается
    // от path[indexAt - 1] на несуществующем индексе.
    const errors = [
      {
        property: '0',
        children: [leaf('time', { matches: 'в формате ЧЧ:ММ, например 19:00.' })],
      } as ValidationError,
    ];

    expect(formatValidationErrors(errors)).toEqual([
      ' 1, Время: в формате ЧЧ:ММ, например 19:00.',
    ]);
  });
});
