// Картинка одного варианта ответа в редакторе вопроса (ADR-0035) — кнопка
// «Добавить картинку»/сама картинка с «Убрать картинку», загрузка идёт через
// useExamImageUpload. Свой файл, не инлайн в ExamItemOptionsField.tsx: у
// файловой загрузки своя логика (pending, ошибка, сброс input) и свой набор
// тестов, отдельных от списка вариантов (CLAUDE.md «Файлы»/файл-храповик).
import type { ChangeEvent, CSSProperties } from 'react';
import { EXAM_IMAGE_CONTENT_TYPES } from '@xuanxue/shared';
import { OptionImage } from '../components/OptionImage';
import { TextLinkButton } from '../components/TextLinkButton';
import {
  dangerNoteStyle,
  noteStyle,
  textLinkButtonStyle,
} from '../components/screenLayout';
import { useExamImageUpload } from './useExamImageUpload';

const ACCEPT = EXAM_IMAGE_CONTENT_TYPES.join(',');

// Визуально скрыт, но доступен с клавиатуры и скринридером — не
// `display: none`, он убрал бы элемент из таб-порядка (CLAUDE.md
// «Доступность»); видимая кнопка — сам `<label>`.
const hiddenInputStyle: CSSProperties = {
  position: 'absolute',
  opacity: 0,
  width: 1,
  height: 1,
  overflow: 'hidden',
};
// <label> — строчный элемент, minHeight 44 из textLinkButtonStyle на нём не
// работает; inline-flex делает цель нажатия честными 44 px (CLAUDE.md
// «Доступность»). position: relative — скрытый input позиционируется
// относительно самой кнопки, а не ближайшего предка с position, иначе фокус
// на нём мог бы прокрутить страницу к чужому месту. Рамка фокуса — класс
// .xuanxue-file-label в index.css (:focus-within — инлайн-стиль так не умеет).
const fileLabelStyle: CSSProperties = {
  ...textLinkButtonStyle,
  display: 'inline-flex',
  alignItems: 'center',
  position: 'relative',
};
const withImageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  alignItems: 'flex-start',
};
// Замена кнопки на время загрузки — не сама кнопка с pending (CLAUDE.md
// «Загрузка»: спиннер только на кнопке действия, а здесь на секунду нет и
// кнопки, и спиннера, только текст со статусом).
const pendingStyle: CSSProperties = {
  ...noteStyle,
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
};

interface ExamItemOptionImageProps {
  index: number;
  imageId?: string;
  onChange: (imageId: string | undefined) => void;
}

export function ExamItemOptionImage({
  index,
  imageId,
  onChange,
}: ExamItemOptionImageProps) {
  const { upload, pending, error } = useExamImageUpload();
  const label = `Картинка варианта ${index + 1}`;

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Сброс сразу, не только на успех: тот же файл можно выбрать повторно
    // после сбоя загрузки — браузер не шлёт change на повторный выбор того
    // же значения, если input его не забыл.
    event.target.value = '';
    if (!file) return;
    const uploadedId = await upload(file);
    if (uploadedId) onChange(uploadedId);
  }

  if (imageId) {
    return (
      <div style={withImageStyle}>
        <OptionImage imageId={imageId} size="thumb" alt={label} />
        <TextLinkButton onClick={() => onChange(undefined)}>
          Убрать картинку
        </TextLinkButton>
      </div>
    );
  }

  return (
    <div>
      {pending ? (
        <span aria-busy="true" style={pendingStyle}>
          Загружаем…
        </span>
      ) : (
        <label className="xuanxue-file-label" style={fileLabelStyle}>
          Добавить картинку
          <input
            type="file"
            accept={ACCEPT}
            aria-label={label}
            style={hiddenInputStyle}
            onChange={(e) => void handleFile(e)}
          />
        </label>
      )}
      {error && <p style={dangerNoteStyle}>{error}</p>}
    </div>
  );
}
