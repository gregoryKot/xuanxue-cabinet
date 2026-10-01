// Плеер видео вопроса/варианта (ADR-0133) — одна механика на весь кабинет
// (CLAUDE.md «Одна механика — один компонент»): редактор вопроса, экран
// сдачи, предпросмотр и карточка проверки показывают одно и то же видео по
// его источнику, не пишут `<video>`/embed каждый сам.
//
// `videoId` — файл в R2, отдаётся через `/api/exam-videos/:id` (302 на
// подписанную ссылку, ADR-0133): нативный `<video controls>` перематывает и
// переспрашивает адрес на каждый seek сам, отдельного плеера не нужно. Сам
// элемент и плашка «Загрузить снова» — в VideoFilePlayer.tsx.
// `videoUrl` — ссылка (YouTube и т.п.), плеер — общий VideoEmbed.tsx (фасад,
// ADR-0100): свой встроенный плеер сюда не пишем, чтобы не завести вторую
// реализацию одного и того же.
//
// Оборванную загрузку файла (слабая связь, телефон ушёл в фон) плеер чинит
// сам — useVideoRecovery.ts зовёт `video.load()` на том же стабильном
// `/api/...`, а не на запомненной подписанной ссылке: она живёт час, и после
// сворачивания приложения на ночь это был бы уже протухший адрес. Ответ 302
// без кеша — сервер подпишет свежую ссылку при каждой перезагрузке.
import { answerVideoSrc, examVideoSrc } from '../api/examVideoPaths';
import { VideoEmbed } from './VideoEmbed';
import { VideoFilePlayer, type VideoFileSize } from './VideoFilePlayer';

interface ExamVideoPlayerProps {
  videoId?: string;
  /** Видео-ответ ученика, файл в R2 (ADR-0137) — та же вёрстка `<video>`,
   * что у `videoId`, только адрес и подпись другие: две записи не бывают
   * заданы разом (kind у ExamMediaDto один), но проверка ниже на всякий
   * случай отдаёт приоритет видео вопроса. */
  answerVideoId?: string;
  videoUrl?: string;
  /** Доступное имя видео — формулировка вопроса или подпись варианта. */
  title?: string;
  /** Размеры — в VideoFilePlayer.tsx; у ссылки (VideoEmbed) размера нет. */
  size?: VideoFileSize;
}

export function ExamVideoPlayer({
  videoId,
  answerVideoId,
  videoUrl,
  title,
  size = 'full',
}: ExamVideoPlayerProps) {
  const src = videoId
    ? examVideoSrc(videoId)
    : answerVideoId
      ? answerVideoSrc(answerVideoId)
      : null;
  if (src) {
    return <VideoFilePlayer src={src} title={title} size={size} />;
  }
  if (videoUrl) {
    return <VideoEmbed url={videoUrl} title={title} />;
  }
  return null;
}
