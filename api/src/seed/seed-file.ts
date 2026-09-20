// Чистая логика разбора и валидации файла сида занятий (api/seed/*.json) —
// без Nest и без Mongo, юнит-тест без обвязки (CLAUDE.md «Тесты»).
import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import { CreateClassDto } from '../classes/dto/create-class.dto';

/** Путь до образца формата — в каждом тексте ошибки сида: одна константа,
 * не переписанная строка в четырёх местах (CLAUDE.md «Без магических строк»). */
export const SEED_EXAMPLE_PATH = 'api/seed/classes.example.json';

export interface SeedFile {
  tz: string;
  // Элементы ещё не проверены — из JSON может прийти что угодно (null,
  // число, массив вместо объекта). validateSeedClasses разбирается, не
  // роняя TypeError на кривой записи (PLAN.md §9, ревью PR H).
  classes: unknown[];
}

export interface SeedValidationError {
  path: string;
  message: string;
}

export interface SeedValidationResult {
  errors: SeedValidationError[];
  // Провалидированные И обрезанные экземпляры DTO (whitelist в validateSync
  // мутирует их на месте, вычищая поля вроде "_id" из файла) — именно их, а
  // не сырые записи из JSON, пишет SeedService: та же копия, что проверена.
  classes: CreateClassDto[];
}

/**
 * Разбирает текст файла сида: JSON с полями `tz` (пояс школы по умолчанию,
 * PLAN.md §9) и `classes` (занятия в форме тела POST /classes). `tz`
 * подставляется в каждый класс, у которого нет своего — одно поле на весь
 * список, а не на каждый слот.
 */
export function parseSeedFile(text: string): SeedFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(
      `Файл сида — не валидный JSON. Проверьте синтаксис (лишняя запятая, ` +
        `незакрытая скобка) и сверьтесь с ${SEED_EXAMPLE_PATH}.`,
    );
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(
      `Файл сида должен быть JSON-объектом с полями "tz" и "classes" — как в ${SEED_EXAMPLE_PATH}.`,
    );
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.tz !== 'string' || obj.tz.trim() === '') {
    throw new Error(
      `Поле "tz" в файле сида обязательно и должно быть непустой строкой ` +
        `(часовой пояс IANA, например Asia/Jerusalem) — см. ${SEED_EXAMPLE_PATH}.`,
    );
  }
  if (!Array.isArray(obj.classes)) {
    throw new Error(
      `Поле "classes" в файле сида должно быть массивом занятий — см. ${SEED_EXAMPLE_PATH}.`,
    );
  }

  const tz = obj.tz;
  // Array.isArray сужает obj.classes до any[] (сигнатура TS-либы), не
  // unknown[] — явный каст обрывает эту утечку any до .map().
  const rawClasses = obj.classes as unknown[];
  const classes = rawClasses.map((cls) => {
    // Не объект (null, число, массив, строка) — оставляем как есть,
    // validateSeedClasses превратит это в понятную ошибку, а не TypeError
    // на попытке прочитать cls.tz ниже.
    if (typeof cls !== 'object' || cls === null || Array.isArray(cls)) return cls;
    const record = cls as Record<string, unknown>;
    return {
      ...record,
      tz: typeof record.tz === 'string' && record.tz.trim() !== '' ? record.tz : tz,
    };
  });
  return { tz, classes };
}

/**
 * Валидирует каждый класс тем же DTO, что и POST /classes (CLAUDE.md «Одна
 * механика — один компонент»): расхождение формата сида с публичным API
 * ловится тем же гейтом, что и ручной ввод учителя. Заодно ловит дубли
 * (title, groupLabel) внутри самого файла — иначе они дублировались бы и в
 * базе, если различаются, например, только регистром правил.
 */
export function validateSeedClasses(seed: SeedFile): SeedValidationResult {
  const errors: SeedValidationError[] = [];
  const classes: CreateClassDto[] = [];
  const seenPairs = new Map<string, number>();

  seed.classes.forEach((raw, index) => {
    const path = `classes[${index}]`;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push({
        path,
        message: `Ожидается объект занятия (title, format, rules…) — см. ${SEED_EXAMPLE_PATH}.`,
      });
      return;
    }

    const instance = plainToInstance(CreateClassDto, raw);
    // whitelist: true мутирует instance — стирает поля без декораторов
    // (например, случайный "_id", скопированный из экспорта коллекции).
    const classErrors = validateSync(instance, { whitelist: true });
    errors.push(...flatten(classErrors, path));

    if (typeof instance.title === 'string' && instance.title.length > 0) {
      const pairKey = `${instance.title}|${instance.groupLabel ?? ''}`;
      const firstIndex = seenPairs.get(pairKey);
      if (firstIndex === undefined) {
        seenPairs.set(pairKey, index);
      } else {
        errors.push({
          path: `${path}.title`,
          message:
            'Занятие с таким названием и группой уже есть выше в файле ' +
            `(classes[${firstIndex}]). Объедините правила в одну запись.`,
        });
      }
    }

    classes.push(instance);
  });

  return { errors, classes };
}

// class-validator вкладывает ошибки по субдокументам (rules[i].time) —
// разворачиваем в плоский путь вида "classes[0].rules[0].time" для отчёта
// CLI (seed-classes.ts печатает его пользователю при exit-коде 1). Тексты
// самого class-validator — по-английски, оставлены как есть: перевод
// сообщений валидации решается отдельной задачей, не в этом PR.
// export: тем же разбором путей пользуется seed-exam-file.ts (свои префиксы
// "exam"/"questions[i]") — не копия (CLAUDE.md «одна механика», jscpd).
export function flatten(errors: ValidationError[], prefix: string): SeedValidationError[] {
  const result: SeedValidationError[] = [];
  for (const error of errors) {
    const isIndex = /^\d+$/.test(error.property);
    const path = isIndex ? `${prefix}[${error.property}]` : `${prefix}.${error.property}`;
    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        result.push({ path, message });
      }
    }
    if (error.children && error.children.length > 0) {
      result.push(...flatten(error.children, path));
    }
  }
  return result;
}
