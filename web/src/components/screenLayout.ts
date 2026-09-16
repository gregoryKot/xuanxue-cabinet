// Общие стили экрана-раздела (отступ, объясняющий абзац сверху) — CLAUDE.md
// «Каждая фича объясняет откуда это и зачем»: раньше повторялись литералом в
// каждом экране (ScheduleScreen.tsx, PlanningScreen.tsx, BroadcastsScreen.tsx),
// jscpd поймал дубль.
import type { CSSProperties } from 'react';

// Колонка ограниченной ширины: на телефоне `maxWidth` не мешает (экран уже),
// на мониторе не даёт карточке с одной строкой растянуться на всю ширину
// (отзыв владельца 2026-09-09). Значение — около 70 знаков строкой текста,
// дальше читать неудобно.
const CONTENT_MAX_WIDTH_PX = 880;

export const screenSectionStyle: CSSProperties = {
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  maxWidth: CONTENT_MAX_WIDTH_PX,
  // `100%` рядом с maxWidth: колонка занимает доступное место на телефоне и
  // упирается в предел на мониторе.
  width: '100%',
};

/** Экран, которому нужна вся ширина (недельная сетка расписания): те же
 * отступы и ритм, но без предела по ширине. */
export const wideScreenSectionStyle: CSSProperties = {
  ...screenSectionStyle,
  maxWidth: 'none',
};

/** Кнопка по содержимому, а не во всю колонку — на мониторе «Добавить
 * занятие» иначе растягивается на 1200 пикселей. На телефоне колонка и так
 * узкая, разницы не видно. Нужен и главному действию экрана, и любой кнопке
 * внутри колонки-формы: `flex-direction: column` тянет детей по ширине, и
 * «Сохранить адрес» на «Шаблонах» разъезжался на все 680 px (отзыв
 * владельца 2026-09-16). */
export const primaryActionStyle: CSSProperties = { alignSelf: 'flex-start' };

export const screenExplanationStyle: CSSProperties = {
  margin: 0,
  color: 'var(--ink-soft)',
};

/** Заголовок раздела антиквой (направление «тихо и благородно», docs/adr/
 * 0031) — первый экран, который его заводит («Экзамены»); следующие экраны
 * серии берут готовый стиль, а не повторяют числа. */
export const screenTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontWeight: 300,
  fontSize: 34,
  lineHeight: 1,
  color: 'var(--ink)',
};

/** Заголовок колонки в двухколоночном экране (grading/AttemptReviewScreen.tsx:
 * «Ответы» и «Рубрика») — легче `screenTitleStyle`: тот зарезервирован под h1
 * самого экрана, а колонки-сёстры должны читаться равным весом, ни одна не
 * выглядит вторым главным заголовком страницы. */
export const screenColumnTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontWeight: 300,
  fontSize: 28,
};

/** Приписка рядом с полем, разделом или строкой списка: что значит статус,
 * почему кнопка недоступна, что показал предпросмотр. Тише основного текста.
 * Одна на весь кабинет — те же три свойства объявлялись в каждом втором
 * компоненте, и оттенок «тусклого» расходился (CLAUDE.md «Без магических
 * чисел», jscpd). */
export const noteStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

/** Та же приписка, но про сбой: не удалось отправить, канал не отвечает. */
export const dangerNoteStyle: CSSProperties = { ...noteStyle, color: 'var(--danger)' };

/** Мелкая приписка под объяснением: часовой пояс, что значит кнопка. Тише
 * объяснения — читают её один раз и больше к ней не возвращаются. */
export const screenHintStyle: CSSProperties = {
  margin: '-10px 0 0',
  fontSize: 13,
  color: 'var(--ink-soft)',
};

// Колонка страницы-редактора уже, чем у экрана-списка: строка поля во всю
// ширину монитора нечитаема, и владелец на это указал прямо (отзыв
// 2026-09-15). Общая для редактора экзамена и редактора вопроса — числа
// живут в одном месте (CLAUDE.md «Без магических чисел»).
const EDITOR_COLUMN_MAX_WIDTH_PX = 680;

export const editorPageStyle: CSSProperties = {
  ...screenSectionStyle,
  maxWidth: EDITOR_COLUMN_MAX_WIDTH_PX,
  gap: 24,
};

/** Раздел страницы-редактора: волосяная линия сверху вместо рамки-карточки. */
export const editorSectionStyle: CSSProperties = {
  paddingTop: 24,
  borderTop: '1px solid var(--line)',
};

/** Рубрика и заголовок страницы-редактора одной колонкой. */
export const editorHeadingStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

/** Текстовая ссылка-переход внутри экрана («Открыть очередь», «Открыть
 * банк»). Заводится здесь, а не рядом с первым использованием: у `<a>` нет
 * своей строки в index.css, поэтому без явного цвета браузер красит ссылку
 * системным синим с подчёркиванием — мимо палитры (docs/adr/0031). Линия
 * снизу вместо подчёркивания: подчёркивание вплотную режет выносные элементы
 * кириллицы (у, р, ц), а отступ до линии их пропускает. */
export const textLinkStyle: CSSProperties = {
  color: 'var(--ink)',
  textDecoration: 'none',
  borderBottom: '1px solid var(--control-border)',
  paddingBottom: 2,
};

/** Действие, которое выглядит текстовой ссылкой, но никуда не ведёт:
 * «Добавить» вопрос в экзамен, «Посмотреть глазами ученика». Остаётся
 * `<button>` — по ссылке без адреса не переходят ни клавиатура, ни
 * скринридер (CLAUDE.md «Доступность»), а весом на экране такое действие
 * равно ссылке, не кнопке. Цель нажатия — 44 по высоте, как у Button. */
export const textLinkButtonStyle: CSSProperties = {
  ...textLinkStyle,
  background: 'none',
  border: 0,
  borderBottom: '1px solid var(--control-border)',
  padding: 0,
  paddingBottom: 2,
  font: 'inherit',
  cursor: 'pointer',
  minHeight: 44,
  whiteSpace: 'nowrap',
};

/** Ряд действий в подвале страницы-редактора: «Сохранить» первой, рядом —
 * второе действие (components/EditorFooter.tsx, страницы занятия и занятия
 * расписания). */
export const editorActionsRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 24,
  flexWrap: 'wrap',
};

/** Опасное действие подвала («Отменить занятие», «Удалить из расписания») —
 * под волосяной линией, поодаль от «Сохранить»: на телефоне соседние кнопки
 * ловят промах пальца (аудит 2026-09-15, важно №2). */
export const editorDangerRowStyle: CSSProperties = {
  marginTop: 22,
  paddingTop: 16,
  borderTop: '1px solid var(--line)',
};

/** Кнопка внутри такого ряда — текстом, без отступов: силуэт `danger` и так
 * без заливки и контура (components/Button.tsx). */
export const editorDangerButtonStyle: CSSProperties = { padding: 0 };
