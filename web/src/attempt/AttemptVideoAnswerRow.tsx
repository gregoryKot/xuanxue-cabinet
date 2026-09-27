// Что именно прикреплено к видео-вопросу — блок ответа ученика (ADR-0086).
// Раньше здесь стояла одна строка «Видео получено 21 сентября, 19:46»: факт
// без содержания. Ученик не мог проверить, ТУ ли ссылку прислал, а на фоне
// открытой формы с терракотовой кнопкой строка читалась как «ещё ничего не
// сделано» (снимок владельца 2026-09-21).
//
// Поэтому: сначала сам ответ (ссылка — кликабельной строкой, её и проверяют
// глазами), потом тихой подписью — когда пришло. Своя поверхность у строки,
// потому что «ответ уже есть» — состояние, а не ещё одна фраза в колонке
// текста; цветом не метим: у карточки проверки тот же случай назван
// нейтрально («Есть ответ», grading/attemptReviewQuestionStatus.ts), а нефрит
// в кабинете значит «сдал/верно» (CLAUDE.md «Правило акцента») — видео ещё
// не смотрели.
import type { CSSProperties } from 'react';
import {
  ANSWER_VIDEO_RETENTION,
  type ExamMediaDto,
  type ExamMediaKind,
} from '@xuanxue/shared';
import { ExamVideoPlayer } from '../components/ExamVideoPlayer';
import { VideoEmbed } from '../components/VideoEmbed';
import { formatExamMediaWhen } from '../lib/examMedia';
import { formatFileSize } from '../lib/formatFileSize';

// Что пришло — по способу привязки (ADR-0023). Тексты ученику, не учителю:
// у карточки проверки свои («Видео смотрите там же» — grading/
// examMediaSourceText.ts), там про чужой ответ и другое действие.
const ANSWER_LABELS: Record<ExamMediaKind, string> = {
  link: 'Вы прислали ссылку',
  telegram: 'Вы прислали видео боту в Telegram',
  manual: 'Учитель отметил, что видео принято',
  file: 'Вы загрузили видео в кабинет',
};

// Уборщик снял файл — по сроку хранения или после проверки (ADR-0137): факт
// получения остаётся в попытке, честно называем, куда делся сам файл, не
// молчим и не показываем сломанный плеер.
const EXPIRED_FILE_TEXT = `Видео удалено: мы храним его ${ANSWER_VIDEO_RETENTION.afterGradedDays} дней после проверки.`;

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '12px 14px',
  background: 'var(--panel)',
  borderRadius: 'var(--radius-control)',
};
const labelStyle: CSSProperties = { fontSize: 15 };
const metaStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };
// Ссылка ученика — по ней он и узнаёт свою запись, поэтому не обрезается в
// «vk.com/…»: адрес целиком, с переносом по любому символу, иначе длинный
// путь распирает карточку на телефоне в 360 px (CLAUDE.md «Мобильный экран»).
const linkStyle: CSSProperties = {
  fontSize: 15,
  color: 'var(--ink)',
  overflowWrap: 'anywhere',
};

export function AttemptVideoAnswerRow({ media }: { media: ExamMediaDto }) {
  return (
    <li style={rowStyle}>
      <span style={labelStyle}>{ANSWER_LABELS[media.kind]}</span>
      {media.url && (
        <a href={media.url} target="_blank" rel="noopener noreferrer" style={linkStyle}>
          {media.url}
        </a>
      )}
      {/* Плеер под ссылкой, а не вместо неё (ADR-0100): встраивание может
          быть выключено автором, а у приватной записи фрейм покажет отказ —
          ссылка остаётся путём открыть видео снаружи. Хостинг не
          встраивается — компонент не рендерит ничего. */}
      {media.url && <VideoEmbed url={media.url} title="Ваша запись" />}
      {media.kind === 'file' && media.answerVideoId && (
        <ExamVideoPlayer answerVideoId={media.answerVideoId} title="Ваша запись" />
      )}
      {media.kind === 'file' && !media.answerVideoId && (
        <span style={metaStyle}>{EXPIRED_FILE_TEXT}</span>
      )}
      {media.note && <span style={metaStyle}>{media.note}</span>}
      <span style={metaStyle}>
        Получено {formatExamMediaWhen(media)}
        {media.kind === 'file' && media.sizeBytes !== undefined
          ? `, ${formatFileSize(media.sizeBytes)}`
          : ''}
      </span>
    </li>
  );
}
