// Секция «Запись» на странице занятия — список записей и форма добавления
// (docs/PLAN.md §6 п.3): добавили ссылку — рассылка записи уходит сама, объяснение
// стоит прямо над формой (CLAUDE.md «Каждая фича объясняет откуда это и зачем»).
import type { CSSProperties } from 'react';
import type { AddRecordingInput, RecordingDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { useRecordingForm } from './useRecordingForm';

const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const rowStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };

function recordingLabel(recording: RecordingDto): string {
  return recording.title || 'Запись';
}

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

      {recordings.length > 0 && (
        <ul style={{ ...listStyle, margin: 0, paddingLeft: 18 }}>
          {recordings.map((recording) => (
            <li key={recording.id}>
              {recording.url ? (
                <a href={recording.url} target="_blank" rel="noreferrer">
                  {recordingLabel(recording)}
                </a>
              ) : (
                recordingLabel(recording)
              )}
            </li>
          ))}
        </ul>
      )}

      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
        Добавите ссылку — рассылка записи уйдёт сама.
      </p>

      <Field label="Название записи" hint="Необязательно">
        <input
          style={inputStyle}
          value={form.title}
          onChange={(e) => form.setTitle(e.target.value)}
        />
      </Field>
      <Field label="Ссылка на запись" error={form.error ?? undefined}>
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
        onClick={() => void form.submit()}
      >
        Добавить запись
      </Button>
    </section>
  );
}
