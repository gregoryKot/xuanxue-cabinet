// Ссылки Zoom школы — в занятия, созданные миграцией 0001.
//
// Решение владельца 2026-09-10 (ADR-0019, второе дополнение): эти ссылки не
// секрет — школа публикует их в своём Telegram-канале каждую неделю вместе с
// паролем. Значит им место здесь, рядом с расписанием, и деплой заполняет
// занятия сам: ни переменных окружения, ни ключей от базы ни у кого просить не
// нужно. Правило SECURITY.md «настоящих ссылок в репозитории нет» остаётся для
// всего остального — токенов каналов, ключей, паролей от почты; здесь оно
// снято осознанно и только для этих одиннадцати ссылок.
//
// В базе ссылка всё равно лежит зашифрованной, как и раньше (политика полей
// класса, `enc`): публичность ссылки — не повод менять формат хранения.
//
// Уже вписанную ссылку миграция не трогает: сделанное учителем в кабинете
// важнее того, что записано здесь.
import type { Db } from 'mongodb';
import { encrypt } from '../utils/encryption';

const COLLECTION = 'classes';
// Один на все занятия школы (PLAN.md §9).
const PASSWORD = '11111';

interface ClassZoomLink {
  title: string;
  groupLabel: string;
  zoomLink: string;
}

// Ссылка принадлежит слоту, а не дню: у «Утреннего занятия» она одна на три дня
// недели, у «Цзибеньгуна» — на два. Пары (title, groupLabel) те же, что создаёт
// 0001-school-classes.
const CLASS_ZOOM_LINKS: ClassZoomLink[] = [
  {
    title: 'Медитация чжи-гуань',
    groupLabel: '',
    zoomLink: 'https://us02web.zoom.us/j/88282438752',
  },
  {
    title: 'Медитация чжи-гуань',
    groupLabel: 'четверг',
    zoomLink: 'https://us02web.zoom.us/j/89870137292',
  },
  {
    title: 'Цигун для глаз',
    groupLabel: '',
    zoomLink: 'https://us02web.zoom.us/j/82592094975',
  },
  {
    title: 'Утреннее занятие школы Сюань-Сюэ',
    groupLabel: '',
    zoomLink: 'https://zoom.us/j/602464521',
  },
  {
    title: 'Цзибеньгун',
    groupLabel: 'средняя группа',
    zoomLink:
      'https://us02web.zoom.us/j/86410665272?pwd=bDNqODlLWXdWZUtBVzNub2JBeTNLUT09',
  },
  {
    title: 'Тайцзицюань',
    groupLabel: '',
    zoomLink: 'https://us02web.zoom.us/j/85190691093',
  },
  {
    title: 'Тайцзицюань',
    groupLabel: 'среда',
    zoomLink: 'https://us02web.zoom.us/j/84040366773',
  },
  {
    title: 'Ицзиньцзин и Бадуаньцзинь',
    groupLabel: '',
    zoomLink: 'https://us02web.zoom.us/j/84634026453',
  },
  {
    title: 'Цзибеньгун',
    groupLabel: '',
    zoomLink:
      'https://us02web.zoom.us/j/87584887738?pwd=WEV3WEdTZlk1UnFUZnVzcWNMbUtsQT09',
  },
  {
    title: 'Основы Дхармы',
    groupLabel: '',
    zoomLink: 'https://zoom.us/j/136641835',
  },
  {
    title: 'Медитация для начинающих',
    groupLabel: '',
    zoomLink: 'https://zoom.us/j/728469365',
  },
];

export const fillSchoolZoomLinks = {
  id: '0003-school-zoom-links',
  async up(db: Db): Promise<void> {
    const collection = db.collection(COLLECTION);

    for (const { title, groupLabel, zoomLink } of CLASS_ZOOM_LINKS) {
      // Занятия может и не быть — например, учитель завёл своё с другим
      // названием. Это не ошибка: updateOne просто ничего не найдёт, ссылку
      // впишут в карточке.
      await collection.updateOne(
        { title, groupLabel, $or: [{ zoomLink: { $exists: false } }, { zoomLink: '' }] },
        {
          $set: {
            zoomLink: encrypt(zoomLink),
            zoomPassword: encrypt(PASSWORD),
            updatedAt: new Date(),
          },
        },
      );
    }
  },
};
