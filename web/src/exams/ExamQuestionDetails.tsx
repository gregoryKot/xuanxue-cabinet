// Содержимое вопроса под раскрытой строкой — общий узел для списка выбранных
// вопросов (ExamQuestionRow.tsx) и поиска по вопросам (ExamQuestionSearch.tsx):
// отзыв владельца 2026-09-27 — «нельзя даже посмотреть, какие там варианты»,
// причём именно до выбора вопроса, не только после. Один компонент на оба
// места (CLAUDE.md «Одна механика — один компонент») — чтобы вид варианта не
// разошёлся, если его поправят в одном месте и забудут в другом.
import type { CSSProperties } from 'react';
import type { ExamItemDto, ExamItemOptionDto } from '@xuanxue/shared';
import { cardListStyle } from '../components/listCardStyles';
import { hasOptions } from '../exam-items/examItemFormInput';
import { EXAM_ITEM_KIND_LABELS_RU } from '../exam-items/examItemLabels';

const CORRECT_MARK = '✓';
const IMAGE_LABEL = 'картинка';
const VIDEO_LABEL = 'видео';
const QUESTION_VIDEO_TEXT = 'У вопроса есть видео.';
const EMPTY_OPTION_TEXT = '—';

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 14,
};
const noteStyle: CSSProperties = { margin: 0, color: 'var(--ink-soft)' };
// Колонка со `gap` — общая форма списка (CLAUDE.md «Промежуток между строками
// списка задаёт контейнер»), зазор плотнее: это строки внутри одной строки.
const optionListStyle: CSSProperties = { ...cardListStyle, gap: 4 };
const optionRowStyle: CSSProperties = { display: 'flex', gap: 8 };
// Ширина под сам символ ✓ — у неверных вариантов место остаётся пустым, но
// текст не съезжает влево, колонка отметок держит ровный край.
const markStyle: CSSProperties = {
  width: 16,
  flexShrink: 0,
  color: 'var(--terracotta-text)',
};
const mediaLabelStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };

/** Картинка или видео у варианта — одно из двух (ADR-0133), поэтому первое
 * совпадение и есть ответ. */
function optionMediaLabel(option: ExamItemOptionDto): string | null {
  if (option.imageId) return IMAGE_LABEL;
  if (option.videoId || option.videoUrl) return VIDEO_LABEL;
  return null;
}

interface ExamQuestionDetailsProps {
  item: ExamItemDto;
}

export function ExamQuestionDetails({ item }: ExamQuestionDetailsProps) {
  const hasQuestionVideo = Boolean(item.videoId || item.videoUrl);

  return (
    <div style={wrapStyle}>
      {hasQuestionVideo && <p style={noteStyle}>{QUESTION_VIDEO_TEXT}</p>}
      {hasOptions(item.kind) ? (
        <ul style={optionListStyle}>
          {item.options.map((option) => {
            const mediaLabel = optionMediaLabel(option);
            return (
              <li key={option.id} style={optionRowStyle}>
                <span style={markStyle}>{option.correct ? CORRECT_MARK : ''}</span>
                <span>
                  {option.text.trim() || EMPTY_OPTION_TEXT}
                  {mediaLabel && <span style={mediaLabelStyle}> · {mediaLabel}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        // text/video — вариантов нет, единственное, что можно показать в
        // содержимом, — сам тип ответа (владелец жаловался, что раскрытая
        // строка не показывает вообще ничего).
        <p style={noteStyle}>{EXAM_ITEM_KIND_LABELS_RU[item.kind]}</p>
      )}
    </div>
  );
}
