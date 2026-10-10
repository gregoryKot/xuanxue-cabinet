// Список записей занятия на странице занятия. Запись может нести файл из
// кабинета (`videoId`, ADR-0180) и ссылку вместе — одна запись. Файл играет
// первым, нативным плеером с починкой обрыва (components/VideoFilePlayer.tsx,
// тот же, что у видео вопроса); ссылка остаётся ссылкой с фасадом VideoEmbed
// (ADR-0100). Комментарий про плеер рядом со ссылкой — в student/ArchivedLessonCard.tsx.
import type { CSSProperties } from 'react';
import type { RecordingDto } from '@xuanxue/shared';
import { lessonVideoSrc } from '../api/examVideoPaths';
import { textLinkStyle } from '../components/screenLayout';
import { VideoEmbed } from '../components/VideoEmbed';
import { VideoFilePlayer } from '../components/VideoFilePlayer';

const DEFAULT_LABEL = 'Запись';
const LINK_LABEL = 'Открыть по ссылке';

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  margin: 0,
  paddingLeft: 18,
};
const itemStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
// Во всю ширину колонки видео на широком экране стало бы больше самой формы.
const playerWrapStyle: CSSProperties = { maxWidth: 480 };

function recordingLabel(recording: RecordingDto): string {
  return recording.title || DEFAULT_LABEL;
}

function RecordingItem({ recording }: { recording: RecordingDto }) {
  const label = recordingLabel(recording);
  const { url, videoId } = recording;

  return (
    <li style={itemStyle}>
      {videoId ? (
        <>
          <span>{label}</span>
          <div style={playerWrapStyle}>
            <VideoFilePlayer src={lessonVideoSrc(videoId)} title={label} size="full" />
          </div>
        </>
      ) : null}
      {url ? (
        <>
          <a href={url} target="_blank" rel="noreferrer" style={textLinkStyle}>
            {videoId ? LINK_LABEL : label}
          </a>
          <VideoEmbed url={url} title={label} />
        </>
      ) : (
        !videoId && <span>{label}</span>
      )}
    </li>
  );
}

export function RecordingList({ recordings }: { recordings: RecordingDto[] }) {
  if (recordings.length === 0) return null;
  return (
    <ul style={listStyle}>
      {recordings.map((recording) => (
        <RecordingItem key={recording.id} recording={recording} />
      ))}
    </ul>
  );
}
