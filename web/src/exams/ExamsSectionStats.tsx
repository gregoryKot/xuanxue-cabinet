// Рубрика «Ещё в разделе» и карточки-переходы в подэкраны «Экзаменов»
// (components/SectionLink.tsx — тот же компонент стоит на «Занятиях» и
// «Рассылках», CLAUDE.md «Одна механика — один компонент»).
//
// Раньше здесь была ещё и отдельная тёплая плашка `--panel-warm` с числом
// очереди проверки над карточками. Владелец прислал снимок этого экрана с
// телефона и три нарекания: тень карточки списка, заливка плашки и контур
// карточек-переходов подряд читались как мозаика из заплаток; число «работ
// ждут проверки» — самая крупная надпись экрана — никуда не вело по клику,
// хотя карточка «Проверка» сразу под ним вела ровно туда; а после списка
// экзаменов карточки «Вопросы»/«Проверка» без заголовка читались припиской
// неизвестно к чему. Правка: плашка исчезла, её число переехало кликабельной
// крупной строкой внутрь карточки «Проверка» (проп `headline` у SectionLink,
// grading/gradingQueueHint.ts), а блок получил заголовок-рубрику
// `.xuanxue-eyebrow` — тот же приём, что у student/TasksScreen.tsx и
// people/InviteLinkCard.tsx: читателю сказано, что дальше не продолжение
// списка экзаменов, а остальная часть раздела.
//
// Порядок карточек — «Проверка» первой, «Вопросы» второй: в макете первым
// стоял «Вопросы», но там над обеими висела плашка с числом очереди; с её
// исчезновением наверх естественно встаёт карточка с живым числом и делом,
// которое ждёт (решение агента, отклонение от макета).
//
// «Предпросмотр» из макета сюда не попал: у него нет маршрута без
// конкретного экзамена — `/exams/:examId/preview` (app/routeModules.ts)
// всегда открывается по ссылке со страницы самого экзамена. Раздел работает
// со сводкой по всем экзаменам сразу, а выбор «какой из них открыть на
// предпросмотр» — решение уровня логики нового экрана, не вёрстки этого PR
// (решение агента, см. отчёт).
//
// «Вопросы» — без числа вопросов/опубликованных, которое просит макет:
// `/exam-items/stats-summary` отдаёт только `strugglingCount` (сколько
// вопросов путают больше половины ответивших), общего счётчика вопросов нет
// ни в одном уже существующем хуке. Гонять сюда весь список вопросов только
// ради количества — новая нагрузка на экран ради одной цифры, решение
// агента: не выдумывать число, оставить прежний честный текст про путающие
// вопросы (CLAUDE.md «Демо-данные в рантайм-коде не живут»). Картинки
// вариантов ответа (ADR-0035) дописаны в ту же приписку второй фразой —
// то же место на экране, что и раньше, до перестройки макета.
import type { CSSProperties } from 'react';
import { SectionLink } from '../components/SectionLink';
import { formatExamItemsLinkHint } from '../exam-items/examItemsLinkHint';
import { formatGradingQueueHint } from '../grading/gradingQueueHint';
import { formatGradingPresetsHint } from '../grading/gradingPresetsSummaryText';

interface ExamsSectionStatsProps {
  /** `null` — список ещё грузится или сбой загрузки. */
  queueCount: number | null;
  /** `null` — сводка вопросов ещё грузится или сбой загрузки. */
  strugglingCount: number | null;
  /** Готовая строка `formatExamImagesSummary` (ADR-0035) — `null` на чистой
   * базе, во время загрузки и при сбое: приписка тогда просто её не
   * показывает. */
  imagesSummary: string | null;
  /** Число заготовок частых комментариев (ADR-0041) — `null` во время
   * загрузки и при сбое, честное «пока нет» на чистой базе
   * (formatGradingPresetsHint). */
  presetsCount: number | null;
}

const blockStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const headingStyle: CSSProperties = { margin: 0 };

export function ExamsSectionStats({
  queueCount,
  strugglingCount,
  imagesSummary,
  presetsCount,
}: ExamsSectionStatsProps) {
  const questionsHint = imagesSummary
    ? `${formatExamItemsLinkHint(strugglingCount)} ${imagesSummary}`
    : formatExamItemsLinkHint(strugglingCount);

  return (
    <section style={blockStyle}>
      <h2 className="xuanxue-eyebrow" style={headingStyle}>
        Ещё в разделе
      </h2>
      <div className="xuanxue-block-grid">
        <SectionLink
          to="/grading"
          title="Проверка"
          headline={formatGradingQueueHint(queueCount)}
          hint={formatGradingPresetsHint(presetsCount)}
        />
        <SectionLink to="/exam-items" title="Вопросы" hint={questionsHint} />
      </div>
    </section>
  );
}
