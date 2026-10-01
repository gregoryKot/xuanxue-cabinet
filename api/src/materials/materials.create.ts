// Подготовка документа создаваемого материала — чистая логика без базы, юнит-тест
// без Mongo (CLAUDE.md «Тесты», образец — materials.update.ts). Вынесено из
// MaterialsService.create: сервис стоит на потолке размера файла, а решение
// «объявлять ли материал ученикам» (ADR-0162) — отдельное правило со своими
// границами, ему нужен свой тест.
import type { DateTime } from 'luxon';
import { normalizeTags, type CreateMaterialInput } from '@xuanxue/shared';
import { encryptRecord } from '../utils/encryption';
import { MATERIAL_ENCRYPT_SCHEMA } from './material.schema';

/** Объявлять ли новый материал ученикам (ADR-0162): учитель поставил галочку
 * «Сообщить ученикам» и материал открыт ученикам. Служебный (`staff`) ученик не
 * увидит вовсе, а строка ленты о том, чего нет в библиотеке, хуже её отсутствия.
 * Нет поля `notifyStudents` — не объявлять: клиент, который про галочку не знает
 * (открытая со вчера вкладка, короткая форма на странице даты занятия), материал
 * не рассылает. По умолчанию «да» стоит в форме учителя, не здесь: сервер не
 * угадывает намерение за человека, который его не высказывал. */
export function shouldAnnounceMaterial(input: CreateMaterialInput): boolean {
  return input.notifyStudents === true && (input.access ?? 'all') === 'all';
}

/** Документ материала для `model.create`: поля тела, нормализованные теги и
 * зашифрованный текст автора. `announceAt` ставится здесь же, одной записью с
 * материалом, — «создан» и «надо объявить» не расходятся (нет окна между двумя
 * записями, в котором падение потеряло бы объявление). */
export function buildMaterialCreateRecord(
  input: CreateMaterialInput,
  createdBy: string,
  now: DateTime,
): Record<string, unknown> {
  return encryptRecord(
    {
      title: input.title,
      // ADR-0134: ключа `url` в документе нет вовсе, если ссылку не
      // прислали — не пустая строка. У материала может быть только файл.
      ...(input.url !== undefined ? { url: input.url } : {}),
      kind: input.kind,
      classIds: input.classIds ?? [],
      lessonIds: input.lessonIds ?? [],
      access: input.access ?? 'all',
      // Нормализация здесь, не в DTO: список — фильтр (ADR-0058), опечатка
      // и дубль в базе разъехались бы с фильтром `tag` при чтении.
      tags: normalizeTags(input.tags ?? []),
      ...(shouldAnnounceMaterial(input) ? { announceAt: now.toJSDate() } : {}),
      createdBy,
    },
    MATERIAL_ENCRYPT_SCHEMA,
  );
}
