// Секция «Запись» на странице занятия — список записей и форма добавления
// (docs/PLAN.md §6 п.3, §18): учитель выбирает файл записи и/или вставляет ссылку,
// выходит одна запись. Объяснение «что будет дальше» стоит прямо над формой
// (CLAUDE.md «Каждая фича объясняет откуда это и зачем»).
import type { CSSProperties } from 'react';
import {
  LESSON_VIDEO_LIMITS,
  type AddRecordingInput,
  type RecordingDto,
} from '@xuanxue/shared';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { RichText } from '../components/RichText';
import { RecordingFileField } from './RecordingFileField';
import { RecordingList } from './RecordingList';
import { useRecordingForm } from './useRecordingForm';

const BYTES_IN_MB = 1024 * 1024;
const MAX_MB = LESSON_VIDEO_LIMITS.maxBytes / BYTES_IN_MB;

// Рассылка в каналы пока идёт только по ссылке: публикаций по файлу ещё нет
// (PLAN §18, слой 2), поэтому текст не обещает больше, чем есть.
const FILE_HINT =
  'Файла достаточно: запись **заиграет в кабинете**, ученики найдут её в «Записях ' +
  `занятий». До **${MAX_MB} МБ**, без сжатия.`;
const CHANNELS_HINT =
  'В каналы запись уходит по ссылке: добавьте её рядом с файлом, и **рассылка ' +
  'уйдёт сама**. Без ссылки запись пока остаётся только в кабинете.';

const rowStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const hintStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };

interface RecordingSectionProps {
  lessonId: string;
  recordings: RecordingDto[];
  onAdd: (lessonId: string, input: AddRecordingInput) => Promise<void>;
}

export function RecordingSection({ lessonId, recordings, onAdd }: RecordingSectionProps) {
  const form = useRecordingForm(lessonId, onAdd);

  return (
    <section style={rowStyle}>
      <h3 style={{ margin: 0, fontSize: 15 }}>Запись</h3>

      <RecordingList recordings={recordings} />

      <p style={hintStyle}>
        <RichText text={FILE_HINT} />
      </p>
      <p style={hintStyle}>
        <RichText text={CHANNELS_HINT} />
      </p>

      <Field label="Название записи" hint="Необязательно">
        <input
          style={inputStyle}
          value={form.title}
          onChange={(e) => form.setTitle(e.target.value)}
        />
      </Field>
      <RecordingFileField form={form} />
      <Field
        label="Ссылка на запись"
        hint="Необязательно, если выбран файл"
        error={form.error ?? undefined}
      >
        <input
          style={inputStyle}
          value={form.url}
          onChange={(e) => form.setUrl(e.target.value)}
          placeholder="https://…"
        />
      </Field>
      <Button
        type="button"
        variant="secondary"
        pending={form.pending}
        disabled={form.isUploading}
        onClick={() => void form.submit()}
      >
        Добавить запись
      </Button>
    </section>
  );
}
