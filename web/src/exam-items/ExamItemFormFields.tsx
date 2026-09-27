// Содержательное поле вопроса — формулировка и видео к ней (ADR-0133). Тип
// ответа стоит выше отдельным блоком переключателей (ExamItemKindField.tsx):
// он выбирается один раз и потом не меняется. Подсказка ученику, критерии
// проверки и теги убраны из вопроса вместе с полями (ADR-0128).
//
// Скрепка видео стоит сбоку от textarea, а не отдельной строкой под ней
// (отзыв владельца 2026-09-27) — вопросу доступно только видео, поэтому
// нажатие на неё сразу запускает выбор файла/поле ссылки, без меню
// (AttachButton — components/AttachButton.tsx).
import type { CSSProperties } from 'react';
import { EXAM_ITEM_LIMITS } from '@xuanxue/shared';
import { AttachButton } from '../components/AttachButton';
import { Field, inputStyle } from '../components/Field';
import { useVideoAttach } from './useVideoAttach';
import type { ExamVideoValue } from './examVideoFormInput';
import type { ExamItemFormState } from './examItemFormInput';

const columnStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 };
// Скрепка — flex-сосед `<Field>`, не его ребёнок: `<label>` внутри Field
// неявно связывает подпись с первым полем внутри себя (HTML «labelable
// element»), и `<button>` скрепки тоже под это подходит — окажись он внутри
// того же `<label>`, getByLabelText('Формулировка') в тестах, как и
// скринридер, не знал бы, какой из двух controls подписан. alignItems:
// flex-end — скрепка держится у нижнего края поля, как кнопка отправки
// рядом с растущим полем ввода в мессенджерах, а не съезжает к подписи
// сверху.
const promptRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  gap: 6,
};
const promptFieldStyle: CSSProperties = { flex: '1 1 200px', minWidth: 0 };
const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 90,
  resize: 'vertical',
};
const VIDEO_LABEL = 'Видео вопроса';

interface ExamItemFormFieldsProps {
  state: ExamItemFormState;
  setField: <K extends keyof ExamItemFormState>(
    key: K,
    value: ExamItemFormState[K],
  ) => void;
  /** Общая ошибка формы — как в ExamAboutFields.tsx, показывается под первым
   * содержательным полем (формулировка), не под каждым отдельно. */
  error: string | null;
  /** Загрузка в R2 подключена — решает, что делает скрепка видео: открывает
   * выбор файла или показывает поле ссылки (ADR-0133, useVideoAttach.tsx). */
  fileStorageEnabled: boolean;
}

export function ExamItemFormFields({
  state,
  setField,
  error,
  fileStorageEnabled,
}: ExamItemFormFieldsProps) {
  function handleVideoChange(next: ExamVideoValue) {
    setField('videoId', next.videoId);
    setField('videoUrl', next.videoUrl);
  }

  const video = useVideoAttach(
    VIDEO_LABEL,
    { videoId: state.videoId, videoUrl: state.videoUrl },
    fileStorageEnabled,
    handleVideoChange,
  );

  return (
    <div style={columnStyle}>
      <div style={promptRowStyle}>
        <div style={promptFieldStyle}>
          <Field label="Формулировка" error={error ?? undefined}>
            <textarea
              style={textareaStyle}
              maxLength={EXAM_ITEM_LIMITS.prompt}
              value={state.prompt}
              onChange={(e) => setField('prompt', e.target.value)}
            />
          </Field>
        </div>
        <AttachButton ariaLabel={VIDEO_LABEL} items={[video.menuItem]} />
      </div>
      {video.hiddenInput}
      {video.preview}
    </div>
  );
}
