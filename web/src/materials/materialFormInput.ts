// Чистая логика страницы материала — состояние, валидация, сборка тела
// запроса (CLAUDE.md «Тесты»), по образцу channels/channelFormInput.ts.
// `paid` — булев переключатель формы, `access` собирается из него только при
// отправке: `MaterialAccess` — контракт сервера, форме удобнее галочка
// (ADR-0048, MaterialFormFields.tsx).
import {
  MATERIAL_KINDS,
  MATERIAL_LIMITS,
  type CreateMaterialInput,
  type MaterialDto,
  type MaterialKind,
  type UpdateMaterialInput,
} from '@xuanxue/shared';

const URL_RE = /^https?:\/\//i;

export interface MaterialFormState {
  title: string;
  url: string;
  kind: MaterialKind;
  classIds: string[];
  /** `access === 'paid'` — форме удобнее галочка, чем строковый союз. */
  paid: boolean;
}

/** `null` — форма валидна; иначе поле с ошибкой (MaterialFormFields рисует
 * её под этим полем, тот же приём, что у ChannelFormFields) и текст. */
export interface MaterialFormError {
  field: 'title' | 'url';
  message: string;
}

export function initialMaterialFormState(
  materialDto: MaterialDto | null,
): MaterialFormState {
  return {
    title: materialDto?.title ?? '',
    url: materialDto?.url ?? '',
    kind: materialDto?.kind ?? MATERIAL_KINDS[0],
    classIds: materialDto?.classIds ?? [],
    paid: materialDto?.access === 'paid',
  };
}

export function validateMaterialForm(state: MaterialFormState): MaterialFormError | null {
  const title = state.title.trim();
  if (!title) return { field: 'title', message: 'Впишите название материала.' };
  if (title.length > MATERIAL_LIMITS.title) {
    return {
      field: 'title',
      message: `Название длиннее ${MATERIAL_LIMITS.title} символов.`,
    };
  }

  const url = state.url.trim();
  if (!url) return { field: 'url', message: 'Вставьте ссылку на материал.' };
  if (!URL_RE.test(url)) {
    return { field: 'url', message: 'Ссылка должна начинаться с http:// или https://.' };
  }
  if (url.length > MATERIAL_LIMITS.url) {
    return { field: 'url', message: `Ссылка длиннее ${MATERIAL_LIMITS.url} символов.` };
  }
  return null;
}

/** `classIds` — всегда массив, даже пустой (не `undefined`): пустой список
 * значит «материал всей школы» (ADR-0047), а не «поле не заполнено», и
 * сервер должен получить это явно. */
export function toCreateInput(state: MaterialFormState): CreateMaterialInput {
  return {
    title: state.title.trim(),
    url: state.url.trim(),
    kind: state.kind,
    classIds: [...state.classIds],
    access: state.paid ? 'paid' : 'all',
  };
}

/** Тело PATCH — те же поля, что у создания: материал не проходит статусы
 * (не draft/published/archived, как экзамен), менять можно что угодно сразу.
 * Переиспользуем сборку, а не повторяем её (CLAUDE.md «Одна механика — один
 * компонент», jscpd). */
export function toUpdateInput(state: MaterialFormState): UpdateMaterialInput {
  return toCreateInput(state);
}
