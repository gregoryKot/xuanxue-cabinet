// Разовый импорт ссылок Zoom в уже созданные занятия (миграция 0001 привозит
// расписание без них — ADR-0019: настоящие ссылки в репозиторий не кладутся).
//
// Владелец не должен ни вписывать одиннадцать ссылок руками, ни присылать
// разработчику ключ шифрования базы: ротация ENCRYPTION_KEY стоит
// перешифровки всего, что уже лежит (RUNBOOK §6), а ссылка с паролем — такой
// же секрет, как токен канала, и его место — переменная окружения.
// CLASS_ZOOM_LINKS ставится в Railway один раз, применяется при ближайшем
// старте и после этого удаляется (RUNBOOK §2.2). Настройкой она не
// становится: дальше учитель меняет ссылки на экране «Занятия», как и раньше.
//
// Уже заполненную ссылку миграция не трогает — вписанное руками важнее
// содержимого переменной.
import type { ConfigService } from '@nestjs/config';
import type { Db } from 'mongodb';
import { encrypt } from '../utils/encryption';

const COLLECTION = 'classes';
const ENV_KEY = 'CLASS_ZOOM_LINKS';

interface ZoomLinkEntry {
  title: string;
  groupLabel: string;
  zoomLink: string;
  zoomPassword?: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** Разбор и проверка формы — с внятной ошибкой: миграция падает, приложение
 * не стартует, Railway оставляет трафик на прежнем инстансе (RUNBOOK §8.3).
 * Молча пропустить кривой JSON нельзя: занятия остались бы без ссылок, а
 * рассылка ушла бы в канал без главного. */
function parseEntries(raw: string): ZoomLinkEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${ENV_KEY}: не разбирается как JSON — проверьте кавычки и запятые`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${ENV_KEY}: ожидается массив занятий, пришло ${typeof parsed}`);
  }

  return parsed.map((item, index) => {
    const entry = item as Partial<ZoomLinkEntry>;
    if (!isNonEmptyString(entry.title) || !isNonEmptyString(entry.zoomLink)) {
      throw new Error(
        `${ENV_KEY}: запись №${index + 1} без title или zoomLink — заполните оба поля`,
      );
    }
    return {
      title: entry.title,
      groupLabel: typeof entry.groupLabel === 'string' ? entry.groupLabel : '',
      zoomLink: entry.zoomLink,
      ...(isNonEmptyString(entry.zoomPassword)
        ? { zoomPassword: entry.zoomPassword }
        : {}),
    };
  });
}

export const fillClassZoomLinks = {
  id: '0002-class-zoom-links',
  async up(db: Db, config: ConfigService): Promise<void> {
    const raw = config.get<string>(ENV_KEY)?.trim();
    if (!raw) return; // переменную не ставили — импортировать нечего

    const entries = parseEntries(raw);
    const collection = db.collection(COLLECTION);

    for (const entry of entries) {
      const key = { title: entry.title, groupLabel: entry.groupLabel };
      const target = await collection.findOne(key, { projection: { zoomLink: 1 } });
      if (!target) {
        // Опечатка в названии осталась бы занятием без ссылки — а это
        // рассылка без главного. Лучше не подняться и показать, что не сошлось.
        throw new Error(
          `${ENV_KEY}: занятия «${entry.title}» с подписью «${entry.groupLabel}» ` +
            'нет в базе — сверьте название с экраном «Расписание»',
        );
      }
      if (isNonEmptyString(target.zoomLink)) continue; // вписано руками — не трогаем

      await collection.updateOne(key, {
        $set: {
          zoomLink: encrypt(entry.zoomLink),
          ...(entry.zoomPassword ? { zoomPassword: encrypt(entry.zoomPassword) } : {}),
          updatedAt: new Date(),
        },
      });
    }
  },
};
