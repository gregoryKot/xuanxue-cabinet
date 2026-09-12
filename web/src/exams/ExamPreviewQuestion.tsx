// Один вопрос в предпросмотре «глазами ученика» (ТЗ 4.3): варианты — неактивные
// radio/checkbox, у видео-задания — объяснение, что сюда придёт видео. Ничего
// не отправляется — inputs всегда disabled, formы нет вовсе.
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';

const VIDEO_NOTE =
  'Сюда придёт видео с ответом — при сдаче здесь появится запись с камеры или загруженный файл.';
const MISSING_NOTE = 'Вопрос недоступен — его удалили или ещё не опубликовали.';

const questionStyle: CSSProperties = { marginBottom: 14 };
const promptStyle: CSSProperties = { margin: '0 0 4px', fontWeight: 600 };
const hintStyle: CSSProperties = {
  margin: '0 0 6px',
  fontSize: 13,
  color: 'var(--ink-soft)',
};
const optionRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };

interface ExamPreviewQuestionProps {
  index: number;
  item?: ExamItemDto;
}

export function ExamPreviewQuestion({ index, item }: ExamPreviewQuestionProps) {
  if (!item) {
    return (
      <p style={promptStyle}>
        {index + 1}. {MISSING_NOTE}
      </p>
    );
  }

  return (
    <div style={questionStyle}>
      <p style={promptStyle}>
        {index + 1}. {item.prompt}
      </p>
      {item.hint && <p style={hintStyle}>{item.hint}</p>}
      {item.kind === 'video' && <p style={hintStyle}>{VIDEO_NOTE}</p>}
      {item.kind === 'text' && (
        <textarea
          disabled
          aria-label="Ответ ученика"
          style={{ width: '100%', minHeight: 60 }}
        />
      )}
      {(item.kind === 'single' || item.kind === 'multiple') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {item.options.map((option) => (
            <label key={option.id} style={optionRowStyle}>
              <input
                type={item.kind === 'single' ? 'radio' : 'checkbox'}
                disabled
                name={`preview-${item.id}`}
              />
              <span>{option.text}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
