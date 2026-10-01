// Чистая логика страницы материала — состояние, валидация, сборка тела
// запроса (CLAUDE.md «Тесты»), по образцу channels/channelFormInput.ts.
// `access` — контракт сервера как есть, радиогруппой (ADR-0058,
// MaterialAccessField.tsx), не булев флаг: состояние формы совпадает с тем,
// что уходит на сервер. Теги хранятся строкой через запятую (tagsText), не
// массивом: набранная запятая или пробел в конце иначе теряются при разборе
// на каждое нажатие клавиши (как в exam-items/examItemFormInput.ts). Разбор —
// общий `parseTagsText` (ADR-0058).
import {
  MATERIAL_KINDS,
  MATERIAL_LIMITS,
  parseTagsText,
  type CreateMaterialInput,
  type MaterialAccess,
  type MaterialDto,
  type MaterialKind,
  type UpdateMaterialInput,
} from '@xuanxue/shared';
import { longTagError } from '../lib/longTagError';

const URL_RE = /^https?:\/\//i;

export interface MaterialFormState {
  title: string;
  url: string;
  kind: MaterialKind;
  classIds: string[];
  access: MaterialAccess;
  tagsText: string;
  /** «Сообщить ученикам» — только при создании (ADR-0162). */
  notifyStudents: boolean;
}

/** `null` — форма валидна; иначе поле с ошибкой (MaterialFormFields рисует
 * её под этим полем, тот же приём, что у ChannelFormFields) и текст. */
export interface MaterialFormError {
  field: 'title' | 'url' | 'tags';
  message: string;
}

/** Ссылка обязательна, только если у материала нет файла (ADR-0134) — но
 * какой текст показать при пустой ссылке, решает ещё и то, умеет ли сам
 * экран прикладывать файл: у короткой формы «Добавить ссылку» на странице
 * даты занятия (ADR-0056) поля файла нет вовсе, и предлагать его там нельзя. */
export interface MaterialFormFileContext {
  /** Файл у материала есть или выбран в форме — тогда ссылка необязательна. */
  hasFile: boolean;
  /** Экран умеет прикладывать файл (хранилище подключено) — от этого зависит
   * только текст ошибки. */
  fileSupported: boolean;
}

// Экран без поля файла (короткая форма ADR-0056) вызывает validateMaterialForm
// без второго аргумента — ссылка у него была и остаётся обязательной всегда.
const NO_FILE_CONTEXT: MaterialFormFileContext = { hasFile: false, fileSupported: false };

export function initialMaterialFormState(
  materialDto: MaterialDto | null,
): MaterialFormState {
  return {
    title: materialDto?.title ?? '',
    url: materialDto?.url ?? '',
    kind: materialDto?.kind ?? MATERIAL_KINDS[0],
    classIds: materialDto?.classIds ?? [],
    access: materialDto?.access ?? 'all',
    tagsText: materialDto?.tags.join(', ') ?? '',
    notifyStudents: true,
  };
}

export function validateMaterialForm(
  state: MaterialFormState,
  file: MaterialFormFileContext = NO_FILE_CONTEXT,
): MaterialFormError | null {
  const title = state.title.trim();
  if (!title) return { field: 'title', message: 'Впишите название материала.' };
  if (title.length > MATERIAL_LIMITS.title) {
    return {
      field: 'title',
      message: `Название длиннее ${MATERIAL_LIMITS.title} символов.`,
    };
  }

  const url = state.url.trim();
  if (!url && !file.hasFile) {
    return {
      field: 'url',
      // Экран без поля файла (fileSupported: false, ADR-0056) не предлагает
      // прикладывать файл — там его негде выбрать.
      message: file.fileSupported
        ? 'Вставьте ссылку на материал или приложите файл.'
        : 'Вставьте ссылку на материал.',
    };
  }
  // Формат и длина — только когда ссылку вписали: файл делает её
  // необязательной, но не освобождает от этих проверок, если она всё же есть.
  if (url) {
    if (!URL_RE.test(url)) {
      return {
        field: 'url',
        message: 'Ссылка должна начинаться с http:// или https://.',
      };
    }
    if (url.length > MATERIAL_LIMITS.url) {
      return { field: 'url', message: `Ссылка длиннее ${MATERIAL_LIMITS.url} символов.` };
    }
  }

  // Число тегов сверх лимита parseTagsText отбрасывает молча, как и у
  // вопросов экзамена — подсказка под полем называет лимит заранее. Почему
  // длину тега проверяем на клиенте — шапка lib/longTagError.ts.
  const tagError = longTagError(state.tagsText);
  if (tagError) {
    return { field: 'tags', message: tagError };
  }
  return null;
}

/** `classIds` — всегда массив, даже пустой (не `undefined`): пустой список
 * значит «материал всей школы» (ADR-0047), а не «поле не заполнено», и
 * сервер должен получить это явно. Ключа `url` нет вовсе, если поле пустое
 * (ADR-0134) — материал заводят и одним файлом, а «нет ключа» и «пустая
 * строка» для сервера не одно и то же (см. UpdateMaterialInput.url). */
export function toCreateInput(state: MaterialFormState): CreateMaterialInput {
  const url = state.url.trim();
  return {
    title: state.title.trim(),
    ...(url ? { url } : {}),
    kind: state.kind,
    classIds: [...state.classIds],
    access: state.access,
    tags: parseTagsText(state.tagsText),
    // Служебный материал ученик не увидит — сообщать о нём нечего (ADR-0162).
    ...(state.notifyStudents && state.access === 'all' ? { notifyStudents: true } : {}),
  };
}

/** Тело PATCH — те же поля, что у создания: материал не проходит статусы, менять
 * можно что угодно сразу; сборка общая, не вторая копия (jscpd). Исключений два.
 * Ссылка: `toCreateInput` опускает пустое поле, а PATCH пустым полем обязан явно
 * СНЯТЬ ссылку — отсюда `url: null` (NULLABLE_MATERIAL_FIELDS), не пустая строка:
 * та доехала бы до базы значением и в ответе выглядела бы ссылкой, которой нет.
 * Галочка «Сообщить ученикам» (ADR-0162) — только создание: PATCH поля не знает
 * (400), и правка материал не объявляет, поэтому в сборку она идёт снятой. */
export function toUpdateInput(state: MaterialFormState): UpdateMaterialInput {
  const create = toCreateInput({ ...state, notifyStudents: false });
  return { ...create, url: state.url.trim() || null };
}
