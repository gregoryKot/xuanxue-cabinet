// Строка прошедшего занятия в архиве ученика (docs/PLAN.md §14 слой 3.3).
// Тот же приём вёрстки, что у StudentLessonCard.tsx: список — одна общая
// карточка (oneCardListStyle, StudentLessonsScreen.tsx), строка несёт только
// паддинг и волосяную линию снизу (проп `isLast`); дата/название/тема и
// пометка отмены — общий LessonSummaryHeader.tsx (CLAUDE.md «Одна механика —
// один компонент», jscpd поймал дубль на первой версии этого файла).
// Записей у занятия может быть несколько (учитель отдал файл и добавил
// ссылку отдельно) — каждая своей строкой (ArchivedRecordingRow.tsx: файл из
// кабинета играет в плеере, ссылка открывается, ADR-0180). Запись со своим `title` (учитель
// назвал её, например, «Занятие целиком») показывает название рядом с
// действием, а не вместо него: кнопка всегда говорит, что будет, если
// нажать («Открыть запись», глагол в начале, docs/VOICE.md), а название —
// это какая именно это запись, если их несколько (решение агента).
// Пустого списка записей у карточки не бывает: решение владельца 2026-09-22
// (ADR-0114, docs/adr/0114-archive-shows-only-lessons-with-a-recording.md) —
// `GET /me/lessons/archive` теперь отдаёт только занятия, у которых есть
// хотя бы одна запись, отбор идёт на сервере. Ветку «Записи нет» убрали
// вместе с ним (CLAUDE.md «Отказались от механики — удаляем с концами»):
// держать в компоненте случай, которого не бывает, — жить с фантомным кодом.
import type { CSSProperties } from 'react';
import type { MyArchivedLessonDto } from '@xuanxue/shared';
import { dividedListStyle } from '../components/listCardStyles';
import { ArchivedRecordingRow } from './ArchivedRecordingRow';
import { LessonSummaryHeader, lessonRowStyle } from './LessonSummaryHeader';
import { StudentMaterialCard } from './StudentMaterialCard';

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
// Форма списка общая (docs/adr/0088), а воздух под заголовком «Материалы» —
// местный: его задаёт карточка занятия, а не форма списка.
const materialsListStyle: CSSProperties = { ...dividedListStyle, marginTop: 4 };
const materialsHeadingStyle: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--ink-soft)',
};
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
        {lesson.recordings.map((recording, index) => (
          // У ArchivedRecordingDto нет своего id (shared/src/my-lessons-
          // archive.ts) — список записей одного занятия статичен на время
          // жизни карточки, индекс как ключ безопасен.
          <ArchivedRecordingRow key={index} recording={recording} />
        ))}
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
