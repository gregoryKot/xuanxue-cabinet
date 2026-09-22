// Заготовки частых комментариев при проверке (слой 4.6, PLAN §11,
// ADR-0041) — список кнопок над полем комментария (GradingForm.tsx):
// нажатие дописывает текст заготовки в конец комментария, не затирая
// написанное (appendPresetText, gradingFormInput.ts). «Сохранить как
// заготовку» берёт текущий текст поля — кнопка выключена, пока оно пустое.
// Удаление — общий ConfirmDialog, без ухода со страницы (образец —
// people/PersonRow.tsx: локальный pending/error, а не useConfirmedRemove —
// тот уходит со страницы после удаления, здесь список остаётся на месте).
import { useState, type CSSProperties } from 'react';
import { ApiError } from '../api/http';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonList } from '../components/Skeleton';
import { previewPresetText } from './gradingCommentPresetPreview';
import { useGradingPresets } from './useGradingPresets';

const HEADING = 'Заготовки комментариев';
const EMPTY_MESSAGE =
  'Заготовок пока нет. Наберите комментарий и нажмите «Сохранить как заготовку».';
const LOAD_ERROR_MESSAGE = 'Не удалось загрузить заготовки.';
const SAVE_LABEL = 'Сохранить как заготовку';
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить заготовку. Попробуйте ещё раз.';
const REMOVE_ERROR_MESSAGE = 'Не удалось удалить заготовку. Попробуйте ещё раз.';
const REMOVE_CONFIRM_TITLE = 'Удалить заготовку?';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const labelStyle: CSSProperties = { fontSize: 14, fontWeight: 600 };
const listStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  margin: 0,
  padding: 0,
  listStyle: 'none',
};
const chipStyle: CSSProperties = { display: 'flex', gap: 4 };
const hintStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };
const errorStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--danger)' };

interface GradingCommentPresetsProps {
  /** Текущий текст поля «Комментарий» — включает кнопку сохранения. */
  comment: string;
  /** Заготовку выбрали — GradingForm сам дописывает её в поле
   * (appendPresetText), сюда идёт только исходный текст. */
  onInsert: (text: string) => void;
}

export function GradingCommentPresets({ comment, onInsert }: GradingCommentPresetsProps) {
  const { presets, loading, error, create, remove } = useGradingPresets();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function run(action: () => Promise<void>, fallback: string) {
    setPending(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setPending(false);
    }
  }

  const removingPreset = presets?.find((preset) => preset.id === removingId);

  return (
    <div style={sectionStyle}>
      <span style={labelStyle}>{HEADING}</span>

      {loading && <SkeletonList rows={1} h={40} gap={8} />}

      {!loading && error && <p style={errorStyle}>{LOAD_ERROR_MESSAGE}</p>}

      {!loading && !error && presets?.length === 0 && (
        <p style={hintStyle}>{EMPTY_MESSAGE}</p>
      )}

      {!loading && !error && presets && presets.length > 0 && (
        <ul style={listStyle}>
          {presets.map((preset) => (
            <li key={preset.id} style={chipStyle}>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => onInsert(preset.text)}
              >
                {previewPresetText(preset.text)}
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                aria-label={`Удалить заготовку «${previewPresetText(preset.text)}»`}
                onClick={() => setRemovingId(preset.id)}
              >
                Удалить
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="secondary"
        disabled={pending || comment.trim() === ''}
        pending={pending}
        onClick={() => void run(() => create(comment.trim()), SAVE_ERROR_MESSAGE)}
      >
        {SAVE_LABEL}
      </Button>

      {actionError && (
        <p role="alert" style={errorStyle}>
          {actionError}
        </p>
      )}

      {removingPreset && (
        <ConfirmDialog
          title={REMOVE_CONFIRM_TITLE}
          message={`«${previewPresetText(removingPreset.text)}» пропадёт из списка.`}
          confirmLabel="Удалить"
          pending={pending}
          onConfirm={() => run(() => remove(removingPreset.id), REMOVE_ERROR_MESSAGE)}
          onCancel={() => setRemovingId(null)}
        />
      )}
    </div>
  );
}
