// Одна запись прошедшего занятия в архиве ученика — вынесено из
// ArchivedLessonCard.tsx (файловый храповик, CLAUDE.md «Храповики»), когда
// запись получила файл из кабинета (ADR-0180). Запись может нести файл (`videoId`),
// ссылку или оба: файл играет первым (VideoFilePlayer — нативный `<video>` с
// починкой обрыва), ссылка остаётся ссылкой с плеером-фасадом рядом (ADR-0100).
import type { CSSProperties } from 'react';
import type { ArchivedRecordingDto } from '@xuanxue/shared';
import { lessonVideoSrc } from '../api/examVideoPaths';
import { RichText } from '../components/RichText';
import { VideoEmbed } from '../components/VideoEmbed';
import { VideoFilePlayer } from '../components/VideoFilePlayer';
import { textLinkHitAreaStyle, textLinkLineStyle } from '../components/screenLayout';

const OPEN_RECORDING_TEXT = 'Открыть запись';
const DEFAULT_RECORDING_TITLE = 'Запись занятия';
const TELEGRAM_ONLY_TEXT =
  'Запись ушла **в канал школы** — ищите её там под датой занятия.';

const recordingRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
};
const recordingTitleStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };
// Видео — на своей строке ряда с переносом (flexBasis 100%), но не шире 480:
// на планшете плеер во всю карточку был бы больше самой записи по смыслу.
const playerStyle: CSSProperties = { flexBasis: '100%', maxWidth: 480 };
// Цель нажатия 44 — оболочка textLinkHitAreaStyle, линию под буквами несёт
// внутренний span с textLinkLineStyle (см. JSX ниже): тот же приём, что у
// quietLinkStyle в StudentLessonMeeting.tsx (разбор — в screenLayout.ts).
const recordingLinkStyle: CSSProperties = textLinkHitAreaStyle;
const plainTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

export function ArchivedRecordingRow({ recording }: { recording: ArchivedRecordingDto }) {
  const { url, videoId, title } = recording;
  // Мёртвой кнопки быть не должно (ТЗ §14): запись без ссылки и без файла —
  // файл в Telegram (inTelegramOnly), иначе мапер вообще не отдал бы её сюда
  // (my-archived-lesson.mapper.ts) — третьего случая у DTO не бывает.
  if (!url && !videoId) {
    return (
      <p style={plainTextStyle}>
        <RichText text={TELEGRAM_ONLY_TEXT} />
      </p>
    );
  }
  return (
    <div style={recordingRowStyle}>
      {title && <span style={recordingTitleStyle}>{title}</span>}
      {videoId && (
        <div style={playerStyle}>
          <VideoFilePlayer
            src={lessonVideoSrc(videoId)}
            title={title ?? DEFAULT_RECORDING_TITLE}
            size="full"
          />
        </div>
      )}
      {url && (
        <>
          <a href={url} target="_blank" rel="noreferrer" style={recordingLinkStyle}>
            <span style={textLinkLineStyle}>{OPEN_RECORDING_TEXT}</span>
          </a>
          {/* Плеер рядом со ссылкой, не вместо неё (ADR-0100): встраивание
              может быть выключено автором, у приватной записи фрейм покажет
              отказ. Хостинг не встраивается — компонент не рендерит ничего. */}
          <VideoEmbed url={url} title={title ?? DEFAULT_RECORDING_TITLE} />
        </>
      )}
    </div>
  );
}
