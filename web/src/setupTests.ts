import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// test.globals выключен, поэтому testing-library не регистрирует cleanup сама —
// без него разметка копится между `it` в одном файле и `getByRole` находит
// несколько элементов вместо одного. Одно место для всех тестов web.
afterEach(() => {
  cleanup();
});
