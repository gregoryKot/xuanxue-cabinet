// Скрепка и медиа одного варианта ответа — картинка или видео,
// взаимоисключающе (ADR-0035/ADR-0133): выбор одного снимает другой
// (ExamItemOptionsField.updateImage/updateVideo). Сама механика загрузки —
// в useImageAttach/useVideoAttach, здесь только их сборка в одну скрепку с
// меню из двух пунктов (components/AttachButton.tsx, отзыв владельца
// 2026-09-27 — «добавить картинку или видео одной кнопкой сбоку от поля»).
import { AttachButton } from '../components/AttachButton';
import type { ExamVideoValue } from './examVideoFormInput';
import { useImageAttach } from './useImageAttach';
import { useVideoAttach } from './useVideoAttach';

interface ExamItemOptionMediaProps {
  index: number;
  imageId?: string;
  videoId?: string;
  videoUrl?: string;
  fileStorageEnabled: boolean;
  onImageChange: (imageId: string | undefined) => void;
  onVideoChange: (video: ExamVideoValue) => void;
}

export function ExamItemOptionMedia({
  index,
  imageId,
  videoId,
  videoUrl,
  fileStorageEnabled,
  onImageChange,
  onVideoChange,
}: ExamItemOptionMediaProps) {
  const image = useImageAttach(index, imageId, onImageChange);
  const video = useVideoAttach(
    `Видео варианта ${index + 1}`,
    { videoId, videoUrl },
    fileStorageEnabled,
    onVideoChange,
  );

  return (
    <>
      <AttachButton
        ariaLabel={`Картинка или видео к варианту ${index + 1}`}
        items={[image.menuItem, video.menuItem]}
      />
      {image.hiddenInput}
      {video.hiddenInput}
      {/* Картинка и видео взаимоисключающи в данных
       * (ADR-0035/ADR-0133) — превью показывает то, что сейчас стоит у
       * варианта; своё превью картинки — и на время её загрузки, пока
       * `imageId` ещё не пришёл. */}
      {image.preview ?? video.preview}
    </>
  );
}
