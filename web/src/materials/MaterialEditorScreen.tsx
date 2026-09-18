// Маршруты страницы материала — `/materials/new` и `/materials/:materialId`
// (ADR-0033). Занятия расписания нужны форме сразу — привязка галочками
// (MaterialClassesField.tsx) — грузим здесь вместе с самим материалом, а не
// внутри формы: LoadedPage.tsx показывает содержимое только после обоих
// ответов сервера, форма не собирается на пустом списке занятий.
import { useParams } from 'react-router-dom';
import { LoadedPage } from '../components/LoadedPage';
import { useClasses } from '../schedule/useClasses';
import { MaterialEditorForm } from './MaterialEditorForm';
import { useMaterialEditor } from './useMaterialEditor';

export default function MaterialEditorScreen() {
  // Адреса два: у `/materials/new` параметра нет вовсе — это новый материал.
  const { materialId } = useParams<{ materialId: string }>();
  const editor = useMaterialEditor(materialId);
  const classesState = useClasses();

  return (
    <LoadedPage
      loading={editor.loading || classesState.loading}
      error={editor.error ?? classesState.error}
      onRetry={() => {
        void editor.reload();
        void classesState.reload();
      }}
      skeletonWidths={['40%', '90%', '60%', '70%']}
    >
      {() => (
        <MaterialEditorForm
          material={editor.entity}
          classes={classesState.classes ?? []}
          editor={editor}
        />
      )}
    </LoadedPage>
  );
}
