// Строка прошедшего занятия в архиве ученика (docs/PLAN.md §14 слой 3.3).
// Тот же приём вёрстки, что у StudentLessonCard.tsx: список — одна общая
// карточка (oneCardListStyle, StudentLessonsScreen.tsx), строка несёт только
// паддинг и волосяную линию снизу (проп `isLast`); дата/название/тема и
// пометка отмены — общий LessonSummaryHeader.tsx (CLAUDE.md «Одна механика —
// один компонент», jscpd поймал дубль на первой версии этого файла).
//
// Записей у занятия может быть несколько (учитель отдал файл и добавил
// ссылку отдельно) — каждая своей строкой. Запись со своим `title` (учитель
// назвал её, например, «Занятие целиком») показывает название рядом с
// действием, а не вместо него: кнопка всегда говорит, что будет, если
// нажать («Открыть запись», глагол в начале, docs/VOICE.md), а название —
// это какая именно это запись, если их несколько (решение агента).
import type { CSSProperties } from 'react';
import type { ArchivedRecordingDto, MyArchivedLessonDto } from '@xuanxue/shared';
import { dividedListStyle } from '../components/listCardStyles';
import { textLinkHitAreaStyle, textLinkLineStyle } from '../components/screenLayout';
import { LessonSummaryHeader, lessonRowStyle } from './LessonSummaryHeader';
import { StudentMaterialCard } from './StudentMaterialCard';

const NO_RECORDING_TEXT = 'Записи нет';
const OPEN_RECORDING_TEXT = 'Открыть запись';
const TELEGRAM_ONLY_TEXT = 'Запись ушла в канал школы — ищите её там под датой занятия.';
// ADR-0056 «Ученик видит привязку там, где ищет»: материалы, привязанные к
// дате занятия, — рубрикой под записями, тем же StudentMaterialCard, что и в
// библиотеке (CLAUDE.md «Одна механика — один компонент»). Пустой список —
// рубрики нет вовсе, не пустой заголовок.
const MATERIALS_HEADING = 'Материалы';

const recordingsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginTop: 8,
};
const recordingRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
};
const recordingTitleStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };
// Цель нажатия 44 — оболочка textLinkHitAreaStyle, линию под буквами несёт
// внутренний span с textLinkLineStyle (см. JSX ниже): тот же приём, что у
// quietLinkStyle в StudentLessonMeeting.tsx (разбор — в screenLayout.ts).
const recordingLinkStyle: CSSProperties = textLinkHitAreaStyle;
const plainTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};
// Форма списка общая (docs/adr/0088), а воздух под заголовком «Материалы» —
// местный: его задаёт карточка занятия, а не форма списка.
const materialsListStyle: CSSProperties = { ...dividedListStyle, marginTop: 4 };
const materialsHeadingStyle: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--ink-soft)',
};
function ArchivedRecordingRow({ recording }: { recording: ArchivedRecordingDto }) {
  if (recording.url) {
    return (
      <p style={recordingRowStyle}>
        {recording.title && <span style={recordingTitleStyle}>{recording.title}</span>}
        <a
          href={recording.url}
          target="_blank"
          rel="noreferrer"
          style={recordingLinkStyle}
        >
          <span style={textLinkLineStyle}>{OPEN_RECORDING_TEXT}</span>
        </a>
      </p>
    );
  }
  // Мёртвой кнопки быть не должно (ТЗ §14): запись без ссылки — либо файл в
  // Telegram (inTelegramOnly), либо мапер вообще не отдал бы её сюда
  // (my-archived-lesson.mapper.ts отбрасывает записи без url и без
  // telegramFileId) — третьего случая у DTO не бывает.
  return <p style={plainTextStyle}>{TELEGRAM_ONLY_TEXT}</p>;
}

interface ArchivedLessonCardProps {
  lesson: MyArchivedLessonDto;
  /** Пояс для форматирования времени — только тестам нужен фиксированный
   * (CI гоняет vitest ещё и под TZ=Australia/Sydney), экрану — браузерный по
   * умолчанию (lib/formatDate.ts). */
  timeZone?: string;
  /** Последняя строка общей карточки списка — без нижней волосяной линии. */
  isLast?: boolean;
}

export function ArchivedLessonCard({
  lesson,
  timeZone,
  isLast = false,
}: ArchivedLessonCardProps) {
  return (
    <li
      style={{
        ...lessonRowStyle,
        borderBottom: isLast ? 'none' : '1px solid var(--panel)',
      }}
    >
      <LessonSummaryHeader
        startsAt={lesson.startsAt}
        classTitle={lesson.classTitle}
        groupLabel={lesson.groupLabel}
        topic={lesson.topic}
        cancelled={lesson.status === 'cancelled'}
        timeZone={timeZone}
      />
      <div style={recordingsStyle}>
        {lesson.recordings.length === 0 ? (
          <p style={plainTextStyle}>{NO_RECORDING_TEXT}</p>
        ) : (
          lesson.recordings.map((recording, index) => (
            // У ArchivedRecordingDto нет своего id (shared/src/my-lessons-
            // archive.ts) — список записей одного занятия статичен на время
            // жизни карточки, индекс как ключ безопасен.
            <ArchivedRecordingRow key={index} recording={recording} />
          ))
        )}
      </div>
      {lesson.materials.length > 0 && (
        <>
          <p style={materialsHeadingStyle}>{MATERIALS_HEADING}</p>
          <ul style={materialsListStyle} aria-label={MATERIALS_HEADING}>
            {lesson.materials.map((material, index) => (
              <StudentMaterialCard
                key={material.id}
                material={material}
                compact
                isLast={index === lesson.materials.length - 1}
              />
            ))}
          </ul>
        </>
      )}
    </li>
  );
}
