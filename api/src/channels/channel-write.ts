// Сборка payload для create()/update() ChannelsService — вынесено, чтобы
// файл сервиса уместился в лимит (CLAUDE.md «Храповики», 150 строк).
import type { CreateChannelInput, UpdateChannelInput } from '@xuanxue/shared';

/** Тело POST /channels → документ модели. `Record<string, unknown>` явно:
 * тело уже проверено ValidationPipe (CreateChannelDto implements
 * CreateChannelInput). */
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
  };
}

/** `$set` тела PATCH /channels/:id. `target` при смене `config` добавляет сам
 * сервис: ему для этого нужен текущий `type` канала из базы (typeOf()). */
export function buildChannelUpdateSet(
  input: UpdateChannelInput,
): Record<string, unknown> {
  return { ...input };
}
