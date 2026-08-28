// === === === === === === === === === === === ===
// МС maps — server-side экспорт карты в PNG (OG-превью поездок).
// Вариант B1 (одобрен 21.08.2026): headless Chromium (Playwright) открывает
// HTML-карту от renderMapHtml (та же точка рендера, что и браузер юзера),
// заливает маркеры поездки и делает скриншот контейнера. 1:1 как видит юзер.
//
// Playwright установлен в /media/04E0AC01E0ABF6D8/cloudFRT/node_modules
// (npm install playwright --no-save). Браузер: npx playwright install chromium.
//
// ВАЖНО про `idle`: плагин/карта MapLibre ждут фактического рендера. На
// статичной карте `idle` не эмитится сам по себе (урок из Части A) — поэтому
// здесь не полагаемся на `map.once('idle')`, а ждём своей готовности через
// таймер + проверку isStyleLoaded + фактический nudge (jumpTo туда-обратно),
// как «будильник idle» из клиентского экспорта.
// === === === === === === === === === === === ===
import { renderMapHtml } from './renderMapHtml.js'

let _pw = null
let _launchPromise = null

// ленивый импорт playwright (пакет может отсутствовать в других средах —
// og-экспорт поднимется, только когда реально нужен)
async function pw() {
  if (_pw) return _pw
  if (!_launchPromise) {
    _launchPromise = (async () => {
      const { chromium } = await import('playwright')
      _pw = chromium
      return _pw
    })()
  }
  return _launchPromise
}

/**
 * Рендер карты в PNG через headless Chromium.
 *
 * @param {object} opts
 *   @param {Array<{lat:number,lng:number,name?:string,note?:string}>} opts.markers
 *     Маркеры поездки (те же поля, что принимает MapsRender.setPoints).
 *   @param {[lng,lat]} [opts.center]  — центр карты (MapLibre порядок!).
 *   @param {number} [opts.zoom=12]    — стартовый зум (используется, если нет markers).
 *   @param {number} [opts.width=1200] — ширина картинки (OG-стандарт).
 *   @param {number} [opts.height=630] — высота картинки (OG-стандарт).
 *   @param {string} [opts.language='ru'] — язык подписей карты.
 *   @param {number} [opts.timeoutMs=25000] — таймаут ожидания готовности карты.
 * @returns {Promise<Buffer>} PNG-байты.
 */
async function renderMapPng(opts = {}) {
  const markers = Array.isArray(opts.markers) ? opts.markers : []
  const width = Number(opts.width) || 1200
  const height = Number(opts.height) || 630
  const center = Array.isArray(opts.center) && opts.center.length === 2 ? opts.center : null
  const zoom = Number.isFinite(+opts.zoom) ? +opts.zoom : 12
  const language = opts.language || 'ru'
  const timeoutMs = Number(opts.timeoutMs) || 25000

  // чистая карта без тулбара/окон родной страницы
  const html = renderMapHtml({
    containerId: 'og-map',
    heightPx: height,
    markerColor: '#e11d48',
    center: center || [85.9789, 51.9299], // Горно-Алтайск дефолт
    zoom: center ? zoom : 12,
    language: language,
    hideControls: true,
    styles: false,
    export: false,
  })

  // инжект данных поездки + автозапуск + сигнал готовности `window.__frtOG`
  const bootScript = `
    <script>
    (function () {
      var MARKERS = ${JSON.stringify(markers)};
      var READY = false;
      function signal(state, extra) {
        window.__frtOG = Object.assign({ ready: state }, extra || {});
      }
      function nudge(map) {
        // «будильник»: любой фактический рендер порождает событие render/idle,
        // которое нужно html-рендеру (см. renderMapHtml -> makeExport, Часть A).
        try {
          if (!map || !map.getCenter || map.isMoving && map.isMoving()) return;
          var c = map.getCenter();
          var d = 1e-4 * Math.max(1, (map.getZoom ? map.getZoom() : 10) / 8);
          map.jumpTo({ center: [c.lng + d, c.lat] });
          map.jumpTo({ center: [c.lng, c.lat] });
        } catch (e) { /* ignore */ }
      }
      function boot() {
        var el = document.getElementById('og-map');
        if (!el) { signal(false, { error: 'no-container' }); return; }
        // ждём, пока CDN-скрипт maplibre-gl.js реально выполнится (он грузится
        // асинхронно). Без него window.maplibregl undefined -> карта не создастся.
        var waitLib = 0;
        var libIv = setInterval(function () {
          waitLib++;
          if (window.maplibregl && window.MapsRender && window.MapsRender.createMap) {
            clearInterval(libIv);
            createIt(el);
          } else if (waitLib > 80) { // 20s
            clearInterval(libIv);
            signal(false, { error: 'maplibregl-not-loaded', waitLib: waitLib });
          }
        }, 250);
      }
      function createIt(el) {
        var map = window.MapsRender.createMap(el, {
          styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
          center: ${JSON.stringify(center || [85.9789, 51.9299])},
          zoom: ${JSON.stringify(zoom)},
          // OG-рендер — статичная PNG для шаринга в соцсетях: панель
          // «Инструменты» (редактор) не нужна, отключаем editor.
          editor: false,
        });
        if (!map) { signal(false, { error: 'no-map' }); return; }
        if (MARKERS.length) {
          window.MapsRender.setPoints(map, MARKERS, { pad: 48, maxZoom: 15 });
        }
        // ждём, пока стиль реально загружен, затем «будильник» и сигнал
        var tries = 0;
        var iv = setInterval(function () {
          tries++;
          try {
            var styleOk = !!(map.isStyleLoaded && map.isStyleLoaded());
            var tilesOk = map.areTilesLoaded ? map.areTilesLoaded() : true;
            var markersOk = !map._frtMarkers || map._frtMarkers.length > 0 || MARKERS.length === 0;
            if (styleOk && tilesOk && markersOk && tries > 2) {
              clearInterval(iv);
              nudge(map);
              setTimeout(function () {
                nudge(map);
                signal(true, { markers: MARKERS.length, tries: tries });
              }, 900);
            } else if (tries > 80) { // 20s
              clearInterval(iv);
              signal(false, { error: 'style-timeout', styleOk: styleOk, tilesOk: tilesOk, tries: tries });
            }
          } catch (e) {
            clearInterval(iv);
            signal(false, { error: 'boot-ex', msg: String(e && e.message || e) });
          }
        }, 250);
      }
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(boot, 50);
      } else {
        window.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 50); });
      }
    })();
    </script>
  `

  const fullHtml = html + bootScript

  const browser = await (await pw()).launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
      '--force-color-profile=srgb',
      // WebGL для MapLibre в headless-без-GPU: Software-рендерер SwiftShader.
      // Без этих флагов maplibregl.Map падает (нет WebGL) — экран пустой.
      '--use-gl=swiftshader',
      '--use-angle=swiftshader-webgl',
      '--enable-unsafe-swiftshader',
    ],
  })
  try {
    const page = await browser.newPage({
      viewport: { width: width, height: height },
      deviceScaleFactor: 1,
    })
    // дождаться того, что не блокирует (CDN-скрипты могут фейлиться в airgap —
    // это не критично, но пусть будут таймауты, а не вечный клик)
    page.setDefaultTimeout(timeoutMs)
    await page.goto('about:blank')
    await page.setContent(fullHtml, { waitUntil: 'domcontentloaded' })
    // разрешить сетевую загрузку тайлов/скриптов от CDN
    await page.waitForFunction(
      () => (window.__frtOG && window.__frtOG.ready) || (window.__frtOG && window.__frtOG.error),
      { timeout: timeoutMs },
    ).catch(() => { /* собственная диагностика ниже */ })

    // если не дождались готовности — проверить ошибку
    const state = await page.evaluate(() => window.__frtOG || {})
    if (!state.ready) {
      // даём карте шанс доперерисоваться, затем скриншотим как есть
      console.log('[maps:og] карта не досигналила ready:', JSON.stringify(state))
    }

    // финальный «будильник», чтобы тайлы точно легли на кадр
    await page.evaluate(() => {
      const map = document.getElementById('og-map');
      const m = map && map._frtMap;
      if (m && m.jumpTo) {
        const c = m.getCenter();
        m.jumpTo({ center: [c.lng + 1e-4, c.lat] });
        m.jumpTo({ center: [c.lng, c.lat] });
      }
    }).catch(() => {})
    await page.waitForTimeout(1200)

    const buf = await page.screenshot({ clip: { x: 0, y: 0, width: width, height: height } })
    return buf
  } finally {
    await browser.close()
  }
}

export { renderMapPng }
