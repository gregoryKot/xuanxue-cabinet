// Юнит-тест чистой логики разбора и валидации сида экзамена (без Mongo,
// CLAUDE.md «Тесты»: чистая логика — юнит-тест без Mongo и без DI).
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  EXAM_SEED_EXAMPLE_PATH,
  parseExamSeedFile,
  validateExamSeed,
} from './seed-exam-file';

const SAMPLE_PATH = join(__dirname, '..', '..', 'seed', 'exam-form-1.json');

const VALID_QUESTION = {
  kind: 'single',
  prompt: 'Вопрос один',
  options: [{ text: 'А', correct: true }, { text: 'Б' }],
};

describe('parseExamSeedFile', () => {
  it('пример из api/seed/exam-form-1.json разбирается и валидируется без ошибок', () => {
    const text = readFileSync(SAMPLE_PATH, 'utf8');
    const seed = parseExamSeedFile(text);

    expect(validateExamSeed(seed).errors).toEqual([]);
  });

  it('битый JSON — ошибка с понятным текстом и ссылкой на образец', () => {
    expect(() => parseExamSeedFile('{ не json')).toThrow('не валидный JSON');
    expect(() => parseExamSeedFile('{ не json')).toThrow(EXAM_SEED_EXAMPLE_PATH);
  });

  it('не JSON-объект верхнего уровня (массив) — ошибка', () => {
    expect(() => parseExamSeedFile(JSON.stringify([1, 2, 3]))).toThrow('JSON-объектом');
  });

  it('без поля "exam" — ошибка', () => {
    expect(() => parseExamSeedFile(JSON.stringify({ questions: [] }))).toThrow('"exam"');
  });

  it('"exam" не объект — ошибка', () => {
    expect(() =>
      parseExamSeedFile(JSON.stringify({ exam: 'строка', questions: [] })),
    ).toThrow('"exam"');
  });

  it('без поля "questions" — ошибка', () => {
    expect(() => parseExamSeedFile(JSON.stringify({ exam: { title: 'Т' } }))).toThrow(
      '"questions"',
    );
  });

  it('"questions" не массив — ошибка', () => {
    expect(() =>
      parseExamSeedFile(JSON.stringify({ exam: { title: 'Т' }, questions: {} })),
    ).toThrow('"questions"');
  });

  it('"exam.blocks" в файле — ошибка: состав вопросов собирает импорт', () => {
    expect(() =>
      parseExamSeedFile(
        JSON.stringify({ exam: { title: 'Т', blocks: [] }, questions: [] }),
      ),
    ).toThrow('blocks');
  });
});

describe('validateExamSeed', () => {
  it('валидные exam и вопрос — пустой список ошибок', () => {
    const seed = parseExamSeedFile(
      JSON.stringify({ exam: { title: 'Экзамен' }, questions: [VALID_QUESTION] }),
    );

    expect(validateExamSeed(seed).errors).toEqual([]);
  });

  it('без обязательного exam.title — ошибка с путём exam.title', () => {
    const seed = parseExamSeedFile(JSON.stringify({ exam: {}, questions: [] }));

    const { errors } = validateExamSeed(seed);

    expect(errors.some((e) => e.path === 'exam.title')).toBe(true);
  });

  it('без обязательного questions[0].prompt — ошибка с путём questions[0].prompt', () => {
    const seed = parseExamSeedFile(
      JSON.stringify({
        exam: { title: 'Экзамен' },
        questions: [{ kind: 'single', options: VALID_QUESTION.options }],
      }),
    );

    const { errors } = validateExamSeed(seed);

    expect(errors.some((e) => e.path === 'questions[0].prompt')).toBe(true);
  });

  it('single с двумя отмеченными верными — ошибка с путём questions[0].options', () => {
    const seed = parseExamSeedFile(
      JSON.stringify({
        exam: { title: 'Экзамен' },
        questions: [
          {
            kind: 'single',
            prompt: 'Вопрос',
            options: [
              { text: 'А', correct: true },
              { text: 'Б', correct: true },
            ],
          },
        ],
      }),
    );

    const { errors } = validateExamSeed(seed);

    expect(errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].options' }),
    );
  });

  it('image — абсолютный путь — ошибка с путём questions[0].options[0].image', () => {
    const seed = parseExamSeedFile(
      JSON.stringify({
        exam: { title: 'Экзамен' },
        questions: [
          {
            kind: 'single',
            prompt: 'Вопрос',
            options: [{ text: 'А', image: '/etc/passwd', correct: true }, { text: 'Б' }],
          },
        ],
      }),
    );

    const { errors } = validateExamSeed(seed);

    expect(errors.some((e) => e.path === 'questions[0].options[0].image')).toBe(true);
  });

  it('image — выход наружу через ".." — ошибка с путём questions[0].options[0].image', () => {
    const seed = parseExamSeedFile(
      JSON.stringify({
        exam: { title: 'Экзамен' },
        questions: [
          {
            kind: 'single',
            prompt: 'Вопрос',
            options: [
              { text: 'А', image: '../secret.jpg', correct: true },
              { text: 'Б' },
            ],
          },
        ],
      }),
    );

    const { errors } = validateExamSeed(seed);

    expect(errors.some((e) => e.path === 'questions[0].options[0].image')).toBe(true);
  });

  it('два вопроса с одинаковым prompt — ошибка на второй записи', () => {
    const seed = parseExamSeedFile(
      JSON.stringify({
        exam: { title: 'Экзамен' },
        questions: [VALID_QUESTION, VALID_QUESTION],
      }),
    );

    const { errors } = validateExamSeed(seed);

    expect(errors).toContainEqual(
      expect.objectContaining({ path: 'questions[1].prompt' }),
    );
  });

  it('questions[N] не объект (null) — понятная ошибка, не TypeError', () => {
    const seed = parseExamSeedFile(
      JSON.stringify({ exam: { title: 'Экзамен' }, questions: [null] }),
    );

    expect(() => validateExamSeed(seed)).not.toThrow();
    const { errors } = validateExamSeed(seed);
    const error = errors.find((e) => e.path === 'questions[0]');
    expect(error?.message).toContain('объект');
  });

  it('вариант ответа не объект (строка вместо { text, … }) — ошибка валидации, не TypeError', () => {
    const seed = parseExamSeedFile(
      JSON.stringify({
        exam: { title: 'Экзамен' },
        questions: [
          { kind: 'single', prompt: 'Вопрос', options: ['строка', { text: 'Б' }] },
        ],
      }),
    );

    expect(() => validateExamSeed(seed)).not.toThrow();
    const { errors } = validateExamSeed(seed);
    expect(errors.some((e) => e.path.startsWith('questions[0].options'))).toBe(true);
  });

  it('image — число, не строка — ошибка с путём questions[0].options[0].image', () => {
    const seed = parseExamSeedFile(
      JSON.stringify({
        exam: { title: 'Экзамен' },
        questions: [
          {
            kind: 'single',
            prompt: 'Вопрос',
            options: [{ text: 'А', image: 42, correct: true }, { text: 'Б' }],
          },
        ],
      }),
    );

    const { errors } = validateExamSeed(seed);

    expect(errors.some((e) => e.path === 'questions[0].options[0].image')).toBe(true);
  });

  it('image — пустая строка или только пробелы — ошибка с путём questions[0].options[0].image', () => {
    const seed = parseExamSeedFile(
      JSON.stringify({
        exam: { title: 'Экзамен' },
        questions: [
          {
            kind: 'single',
            prompt: 'Вопрос',
            options: [{ text: 'А', image: '   ', correct: true }, { text: 'Б' }],
          },
        ],
      }),
    );

    const { errors } = validateExamSeed(seed);

    expect(errors.some((e) => e.path === 'questions[0].options[0].image')).toBe(true);
  });
});
