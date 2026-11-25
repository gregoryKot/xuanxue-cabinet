// Собирает четыре ролика «как поставить кабинет значком на экран телефона»:
// Playwright снимает guide.html покадрово, music.py пишет мелодию под длину
// ролика, ffmpeg склеивает. Запуск: `node scripts/install-video/render.mjs`
// (все четыре), `… ios-safari` (один), `… all stills` (только контрольные
// кадры перед каждым касанием — в scripts/install-video/out, в git не идут).
// Готовые ролики ложатся в web/src/install/videos: оттуда их берёт экран
// «Приложение на телефоне» (web/src/install/installVideos.ts). Нужны playwright с chromium, python3 с numpy
// и ffmpeg — в зависимости проекта они не входят: ролики собираются руками,
// когда меняется значок или интерфейс браузера, а не в CI.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Playwright стоит глобально (NODE_PATH), а ESM-`import` глобальные каталоги
// не смотрит — поэтому через require.
const { chromium } = createRequire(import.meta.url)('playwright');

const DIR = import.meta.dirname;
const VIDEOS = join(DIR, '../../web/src/install/videos');
const OUT = `${DIR}/out`;
const FPS = 30;
const BROWSERS = ['ios-safari', 'ios-chrome', 'android-chrome', 'android-yandex'];
const [only, mode] = process.argv.slice(2);
const stillsOnly = mode === 'stills';

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const b of BROWSERS) {
  if (only && only !== 'all' && only !== b) continue;
  const page = await browser.newPage({
    viewport: { width: 720, height: 1280 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (e) => console.log('ERR', b, e.message));
  await page.goto(`file://${DIR}/guide.html?rec=1&b=${b}`);
  await page.waitForFunction('window.ready', null, { timeout: 10000 });
  const times = await page.evaluate('TIMES');
  if (stillsOnly) {
    const moments = [...times.taps.map((t) => t - 300), times.done + 1500];
    for (const [k, t] of moments.entries()) {
      await page.evaluate((ms) => globalThis.seek(ms), t);
      await page.screenshot({ path: `${OUT}/still-${b}-${k}.png` });
    }
    await page.close();
    continue;
  }
  const frames = `${OUT}/f-${b}`;
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames);
  const count = Math.round((times.total / 1000) * FPS);
  for (let i = 0; i < count; i++) {
    await page.evaluate((ms) => globalThis.seek(ms), (i * 1000) / FPS);
    await page.screenshot({ path: `${frames}/${String(i).padStart(4, '0')}.png` });
  }
  await page.close();
  execFileSync(
    'python3',
    [`${DIR}/music.py`, `${frames}/m.wav`, times.total, times.done, ...times.taps].map(
      String,
    ),
  );
  // prettier-ignore
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}/%04d.png`,
    '-i', `${frames}/m.wav`, '-c:a', 'aac', '-b:a', '96k', '-shortest',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'slow',
    '-movflags', '+faststart', `${VIDEOS}/install-${b}.mp4`,
  ]);
  rmSync(frames, { recursive: true, force: true });
  console.log('ok', b);
}
await browser.close();
