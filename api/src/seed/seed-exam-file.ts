// Чистая логика разбора и валидации файла сида экзамена (api/seed/*.json) —
// без Nest и без Mongo, юнит-тест без обвязки (CLAUDE.md «Тесты»). Устройство
// повторяет seed-file.ts (сид занятий): parse кидает Error на кривой форме
// файла, validate возвращает список ошибок + провалидированные DTO.
import { isAbsolute, normalize } from 'path';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { InvalidInputError } from '../common/errors';
import { CreateExamItemDto } from '../exams/dto/create-exam-item.dto';
import { CreateExamDto } from '../exams/dto/create-exam.dto';
import { assertOptionsForKind } from '../exams/exam-item-options';
import { flatten, type SeedValidationError } from './seed-file';

/** Путь до образца формата — в каждом тексте ошибки сида: одна константа, не
 * переписанная строка в нескольких местах (CLAUDE.md «Без магических строк»).
 * У экзамена нет отдельного .example.json — сам образец лежит в реальном
 * файле сида (docs его не трогают, картинки настоящие). */
export const EXAM_SEED_EXAMPLE_PATH = 'api/seed/exam-form-1.json';

// Валидный по форме, но заведомо не существующий ObjectId — только чтобы
// options[].imageId прошёл @IsMongoId() у CreateExamItemDto: сам путь к
// картинке (`image`) в контракт DTO не входит, реальный imageId появится
// после загрузки байтов в SeedExamService (ADR-0035).
const PLACEHOLDER_IMAGE_ID = '0'.repeat(24);

export interface ExamSeedFile {
  exam: Record<string, unknown>;
  questions: unknown[];
}

/** Один вопрос файла после валидации: `item` — готовый DTO (с плейсхолдером
 * вместо imageId), `optionImagePaths[i]` — путь к картинке варианта `i`
 * (относительно каталога файла сида), если она была указана. `rawItem` —
 * исходный объект вопроса ДО валидации (и до `whitelist: true`, который
 * молча срезает с `item` поля вне контракта DTO): нужен только исторической
 * миграции 0013-exam-form-1 — она заводит вопросы прежней формы, где ещё
 * были hint/criteria/tags (ADR-0128, до этой правки), и должна писать в базу
 * ровно то же самое, что уже написала в проде при первом заезде, а не то,
 * что теперь умеет CreateExamItemDto. Новый импорт (SeedExamService) эти
 * поля больше не видит — читает только `item`, как и раньше. */
export interface ExamSeedQuestion {
  item: CreateExamItemDto;
  rawItem: Record<string, unknown>;
  optionImagePaths: (string | undefined)[];
}

export interface ExamSeedValidationResult {
  errors: SeedValidationError[];
  exam: CreateExamDto;
  questions: ExamSeedQuestion[];
}

/**
 * Разбирает текст файла сида: JSON с полями `exam` (поля формы — title,
 * description…) и `questions` (вопросы банка). `exam.blocks` в файле
 * запрещён — состав блока собирает сам импорт при сопоставлении с уже
 * существующими вопросами (SeedExamService), в файле его взять неоткуда.
 */
export function parseExamSeedFile(text: string): ExamSeedFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(
      `Файл сида экзамена — не валидный JSON. Проверьте синтаксис (лишняя запятая, ` +
        `незакрытая скобка) и сверьтесь с ${EXAM_SEED_EXAMPLE_PATH}.`,
    );
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(
      `Файл сида экзамена должен быть JSON-объектом с полями "exam" и "questions" ` +
        `— как в ${EXAM_SEED_EXAMPLE_PATH}.`,
    );
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.exam !== 'object' || obj.exam === null || Array.isArray(obj.exam)) {
    throw new Error(
      `Поле "exam" в файле сида обязательно и должно быть объектом с полями формы ` +
        `(title, description…) — см. ${EXAM_SEED_EXAMPLE_PATH}.`,
    );
  }
  if (!Array.isArray(obj.questions)) {
    throw new Error(
      `Поле "questions" в файле сида должно быть массивом вопросов — см. ${EXAM_SEED_EXAMPLE_PATH}.`,
    );
  }
  const exam = obj.exam as Record<string, unknown>;
  if (exam.blocks !== undefined) {
    throw new Error(
      `Поле "exam.blocks" в файле сида задавать нельзя — состав вопросов формы ` +
        `собирает сам импорт при сопоставлении с уже существующими вопросами ` +
        `(см. ${EXAM_SEED_EXAMPLE_PATH}).`,
    );
  }
  return { exam, questions: obj.questions };
}

/** `image` варианта — путь строго внутри каталога файла сида: абсолютный
 * путь или выход наружу через ".." читал бы файл не из семян этого же
 * импорта, а откуда угодно на диске сервера (SECURITY.md). */
function isPathEscaping(imagePath: string): boolean {
  return isAbsolute(imagePath) || normalize(imagePath).startsWith('..');
}

interface ExtractedOptions {
  // unknown, не ExamItemOptionInput[] — на входе сырой JSON, ещё не
  // провалидированный; ровно то, что дальше уйдёт в plainToInstance.
  sanitizedOptions: unknown;
  optionImagePaths: (string | undefined)[];
  pathErrors: SeedValidationError[];
}

/** `image` — не поле DTO (см. шапку файла): убирает его из варианта и
 * подставляет вместо него плейсхолдер `imageId`, а сам путь возвращает
 * отдельным параллельным массивом по индексу варианта. Не массив на входе —
 * не трогает вовсе, DTO-валидация (`@IsArray()`) сама даст понятную ошибку. */
function extractOptionImages(
  rawOptions: unknown,
  questionPath: string,
): ExtractedOptions {
  if (!Array.isArray(rawOptions)) {
    return { sanitizedOptions: rawOptions, optionImagePaths: [], pathErrors: [] };
  }
  // Array.isArray сужает rawOptions до any[] (сигнатура TS-либы), не
  // unknown[] — явный каст обрывает эту утечку any до .map() (тот же приём,
  // что parseSeedFile, seed-file.ts).
  const options = rawOptions as unknown[];

  const pathErrors: SeedValidationError[] = [];
  const optionImagePaths: (string | undefined)[] = [];
  const sanitizedOptions = options.map((rawOption, optionIndex) => {
    if (typeof rawOption !== 'object' || rawOption === null || Array.isArray(rawOption)) {
      optionImagePaths.push(undefined);
      return rawOption;
    }
    const { image, ...rest } = rawOption as Record<string, unknown>;
    const optionPath = `${questionPath}.options[${optionIndex}].image`;
    if (image === undefined) {
      optionImagePaths.push(undefined);
      return rest;
    }
    if (typeof image !== 'string' || image.trim() === '') {
      pathErrors.push({
        path: optionPath,
        message: 'Путь к картинке должен быть непустой строкой.',
      });
      optionImagePaths.push(undefined);
      return rest;
    }
    if (isPathEscaping(image)) {
      pathErrors.push({
        path: optionPath,
        message:
          'Путь к картинке должен быть внутри каталога файла сида — без абсолютного ' +
          'пути и без выхода наружу через "..".',
      });
      optionImagePaths.push(undefined);
      return rest;
    }
    optionImagePaths.push(image);
    return { ...rest, imageId: PLACEHOLDER_IMAGE_ID };
  });
  return { sanitizedOptions, optionImagePaths, pathErrors };
}

/**
 * Валидирует поля формы тем же DTO, что и POST /exams, и каждый вопрос тем
 * же DTO, что и POST /exam-items (CLAUDE.md «Одна механика — один
 * компонент»): расхождение формата сида с публичным API ловит tsc/e2e того
 * эндпоинта, а не свой параллельный набор правил. Сочетание «тип вопроса ↔
 * варианты» проверяет существующая `assertOptionsForKind`, не копия правила.
 * Дубли по `prompt` внутри файла — ошибка, как дубль (title, groupLabel) у
 * занятий: одна и та же формулировка не должна завести два вопроса банка.
 */
export function validateExamSeed(seed: ExamSeedFile): ExamSeedValidationResult {
  const errors: SeedValidationError[] = [];

  const examInstance = plainToInstance(CreateExamDto, seed.exam);
  errors.push(...flatten(validateSync(examInstance, { whitelist: true }), 'exam'));

  const questions: ExamSeedQuestion[] = [];
  const seenPrompts = new Map<string, number>();

  seed.questions.forEach((raw, index) => {
    const path = `questions[${index}]`;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push({
        path,
        message: `Ожидается объект вопроса (kind, prompt, options…) — см. ${EXAM_SEED_EXAMPLE_PATH}.`,
      });
      return;
    }
    const record = raw as Record<string, unknown>;

    const { sanitizedOptions, optionImagePaths, pathErrors } = extractOptionImages(
      record.options,
      path,
    );
    errors.push(...pathErrors);

    const instance = plainToInstance(CreateExamItemDto, {
      ...record,
      options: sanitizedOptions,
    });
    errors.push(...flatten(validateSync(instance, { whitelist: true }), path));

    try {
      assertOptionsForKind(instance.kind, instance.options);
    } catch (err) {
      if (!(err instanceof InvalidInputError)) throw err;
      errors.push({ path: `${path}.options`, message: err.message });
    }

    if (typeof instance.prompt === 'string' && instance.prompt.length > 0) {
      const firstIndex = seenPrompts.get(instance.prompt);
      if (firstIndex === undefined) {
        seenPrompts.set(instance.prompt, index);
      } else {
        errors.push({
          path: `${path}.prompt`,
          message:
            'Вопрос с такой формулировкой уже есть выше в файле ' +
            `(questions[${firstIndex}]). Объедините или уберите повтор.`,
        });
      }
    }

    questions.push({ item: instance, rawItem: record, optionImagePaths });
  });

  return { errors, exam: examInstance, questions };
}
