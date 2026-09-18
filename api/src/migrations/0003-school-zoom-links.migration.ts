// Ссылки Zoom школы — в занятия, созданные миграцией 0001.
//
// Ссылки лежат в `api/seed/zoom-links.local.json` — файл не в репозитории
// (`.gitignore`, как `classes.local.json`). До 2026-09-12 они были записаны
// прямо здесь: школа публикует их в своём канале каждую неделю вместе с
// паролем, и владелец счёл их не секретом (ADR-0019, второе дополнение).
// Решение отменено, когда репозиторий решили сделать публичным: ссылка,
// которую школа рассылает своим, и ссылка, которую видит любой прохожий из
// поисковика, — разные вещи. Правило SECURITY.md «настоящих ссылок в
// репозитории нет» снова действует без исключений.
//
// Файла нет — миграция ничего не делает. На проде она уже применилась, и
// повторно не запускается (реестр `migrations`); новой установке ссылки
// впишут в кабинете, и это видно по метке «без ссылки» в расписании.
//
// В базе ссылка лежит зашифрованной (политика полей класса, `enc`).
// Уже вписанную ссылку миграция не трогает: сделанное учителем в кабинете
// важнее того, что записано в файле.
import { readFileSync } from 'fs';
import { join } from 'path';
import type { mongo } from 'mongoose';
import { encrypt } from '../utils/encryption';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')), поэтому тип `Db` совпадает
// с тем, что отдаёт `connection.db` — без второй копии пакета `mongodb`
// в дереве зависимостей.
type Db = mongo.Db;

const COLLECTION = 'classes';
export const SEED_PATH = join(__dirname, '..', '..', 'seed', 'zoom-links.local.json');

interface ClassZoomLink {
  title: string;
  groupLabel: string;
  zoomLink: string;
  zoomPassword: string;
}

/** Ссылка принадлежит слоту, а не дню: у «Утреннего занятия» она одна на три
 * дня недели. Пары (title, groupLabel) — те же, что создаёт 0001. Файла нет
 * или он битый — пустой список: миграция не имеет права уронить старт
 * приложения из-за отсутствующего локального файла. */
function readSeed(): ClassZoomLink[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
    return Array.isArray(parsed) ? (parsed as ClassZoomLink[]) : [];
  } catch {
    return [];
  }
}

export const fillSchoolZoomLinks = {
  id: '0003-school-zoom-links',
  async up(db: Db): Promise<void> {
    const collection = db.collection(COLLECTION);

    for (const { title, groupLabel, zoomLink, zoomPassword } of readSeed()) {
      // Занятия может и не быть — например, учитель завёл своё с другим
      // названием. Это не ошибка: updateOne просто ничего не найдёт, ссылку
      // впишут в карточке.
      await collection.updateOne(
        { title, groupLabel, $or: [{ zoomLink: { $exists: false } }, { zoomLink: '' }] },
        {
          $set: {
            zoomLink: encrypt(zoomLink),
            zoomPassword: encrypt(zoomPassword),
            updatedAt: new Date(),
          },
        },
      );
    }
  },
};
