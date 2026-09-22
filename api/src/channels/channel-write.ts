// Сборка payload для create()/update() ChannelsService — вынесено, чтобы
// файл сервиса уместился в лимит (CLAUDE.md «Храповики», 150 строк):
// нормализация тегов (ADR-0106) живёт рядом со сборкой остальных полей
// записи, не размазана по двум методам сервиса.
import {
  normalizeTags,
  type CreateChannelInput,
  type UpdateChannelInput,
} from '@xuanxue/shared';

/** Тело POST /channels → документ модели. `Record<string, unknown>` явно:
 * тело уже проверено ValidationPipe (CreateChannelDto implements
 * CreateChannelInput). Теги не прислали — канал получает все рассылки своих
 * занятий (ADR-0106, прежнее поведение); тот же приём нормализации, что у
 * ClassesService.create. */
export function buildChannelCreatePayload(
  input: CreateChannelInput,
  target: string,
): Record<string, unknown> {
  return {
    type: input.type,
    title: input.title,
    config: input.config,
    target,
    active: true,
    tags: normalizeTags(input.tags ?? []),
  };
}

/** `$set` тела PATCH /channels/:id. `tags` нормализуется, только если поле
 * прислали — иначе PATCH без тегов случайно записал бы пустой
 * нормализованный массив вместо «поле не трогать» (тот же приём, что у
 * ClassesService.update). `target` при смене `config` добавляет сам сервис:
 * ему для этого нужен текущий `type` канала из базы (typeOf()). */
export function buildChannelUpdateSet(input: UpdateChannelInput): Record<string, unknown> {
  const $set: Record<string, unknown> = { ...input };
  if (input.tags !== undefined) $set.tags = normalizeTags(input.tags);
  return $set;
}
