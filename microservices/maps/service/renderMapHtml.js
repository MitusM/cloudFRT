// === === === === === === === === === === === ===
// renderMapHtml — генерация HTML «голой» карты (MapLibre GL + OpenFreeMap
// Liberty) + JS-функции window.MapsRender.* (рендер, точки, fit).
//
// ЕДИНАЯ точка генерации рендера карты: используется и в RPC maps:map
// (сервис-2-сервис, напр. trips), и локально в контроллере maps (GET /maps/map)
// без self-RPC через шину — это снимает дедлок запроса maps→maps.
//
// Принцип: карта общая, данные разные. maps не знает о данных вызывающего —
// тот подставляет свои точки через MapsRender.renderMap/setPoints.
//
// Язык подписей: собственная функция локализации (не внешний плагин).
// Каждый symbol-слой получает text-field на ОДНОМ заданном языке: name:ru / name:en / …
// (никаких пар «latin + nonlatin» → «EN+RU»). По умолчанию язык — 'ru' (работаем
// с Россией). Можно изменить: opts.language = 'auto' (язык браузера) | 'en'|'de'|'fr'|….
//
// Контракт window.MapsRender (определяется в возвращаемом HTML):
//   createMap(container, opts?)           — создать карту (или вернуть существующую)
//   renderMap(container, points, opts?)   — создать + залить точки + fitBounds (старый контракт)
//   setPoints(map, points, opts?)         — сбросить старые маркеры + добавить новые + fitBounds
//   addPoints(map, points, opts?)         — долить точки без сброса
//   clearPoints(map)                      — убрать все маркеры
//   fitToPoints(map, points, opts?)       — масштабировать под точки без перерисовки
//   points:  [{ name?, address?, note?, day?, lat, lng }]  (lat/lng обязательны)
//   opts:    { markerColor?='#e11d48', center?=[37.62,55.75], zoom?=5,
//              heightPx?=480, styleUrl?=<Liberty>, containerId?=<auto>,
//              language?='auto' (язык подписей карты),
//              fitBoundsPadding?=48, fitBoundsMaxZoom?=14,
//              controlsPosition?='top-right', hideControls?=false,
//              styles?=true (переключатель Стандартная/Спутниковая в тулбаре) }
//
// Тулбар-контролы (addControl): 🧭 компас (bearing→0), 📏 линейка (клики →
// ломаная с подписями расстояний), 🏷 тултип при наведении на маркер (имя места).
// Self-contained (по мотивам @mapbox-controls/*, совместимы с MapLibre GL),
// без внешних npm-зависимостей.
// === === === === === === === === === === === ===

function renderMapHtml(opts = {}) {
  const markerColor = opts.markerColor || '#e11d48'
  const center = Array.isArray(opts.center) ? opts.center : [37.62, 55.75]
  const zoom = typeof opts.zoom === 'number' ? opts.zoom : 5
  const heightPx = typeof opts.heightPx === 'number' ? opts.heightPx : 480
  const styleUrl = opts.styleUrl || 'https://tiles.openfreemap.org/styles/liberty'
  // язык подписей карты: default 'ru' (работаем с Россией — один русский, без EN+RU).
  // Можно 'auto' (язык браузера) или явный iso-код: 'en'|'de'|'fr'|….
  const language = opts.language || 'ru'

  // авто-id контейнера: уникален на странице; вызывающий задаёт свой через opts.containerId.
  const containerId =
    opts.containerId && /^[A-Za-z0-9_-]+$/.test(opts.containerId)
      ? opts.containerId
      : 'frt-map-' + Math.random().toString(36).slice(2, 10)

  const html = `
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.4.0/dist/maplibre-gl.css" />
<link rel="stylesheet" href="https://unpkg.com/@maplibre/maplibre-gl-geocoder@1.9.4/dist/maplibre-gl-geocoder.css" />
<link rel="stylesheet" href="https://unpkg.com/@watergis/maplibre-gl-terradraw@1.15.3/dist/maplibre-gl-terradraw.css" />
<style>
  .maplibregl-ctrl-active { background-color: #fbc412 !important; }
  .maplibregl-ctrl-active:hover { background-color: #e5b010 !important; }
</style>
<div id="${containerId}" style="width:100%; height:${heightPx}px; border-radius:8px; overflow:hidden;"></div>
<script src="https://unpkg.com/maplibre-gl@4.4.0/dist/maplibre-gl.js"></script>
<script src="https://unpkg.com/@maplibre/maplibre-gl-geocoder@1.9.4/dist/maplibre-gl-geocoder.js"></script>
<script src="https://unpkg.com/maplibre-gl-map-to-image@1.2.0/dist/maplibre-gl-map-to-image.min.js"></script>
<script src="https://unpkg.com/@watergis/maplibre-gl-terradraw@1.15.3/dist/maplibre-gl-terradraw.umd.js"></script>
<script>
  // ── Общий рендер карты (maps:map) — данные подставляет вызывающий МС ──
  (function () {
    window.MapsRender = window.MapsRender || {};

    // нормализация опций с чувствительными к типам значениями из бэкенда
    const DEFAULTS = {
      center: ${JSON.stringify(center)},
      zoom: ${JSON.stringify(zoom)},
      markerColor: '${markerColor}',
      styleUrl: '${styleUrl}',
      pad: 48,
      maxZoom: 14,
    };

    // собрать опции (числа страхуем от NaN)
    function optsOf(o) {
      o = o || {};
      const opt = Object.assign({}, DEFAULTS, o);
      opt.center = Array.isArray(opt.center) ? opt.center : DEFAULTS.center;
      if (typeof opt.zoom !== 'number' || isNaN(opt.zoom)) opt.zoom = DEFAULTS.zoom;
      if (typeof opt.pad !== 'number' || isNaN(opt.pad)) opt.pad = DEFAULTS.pad;
      if (typeof opt.maxZoom !== 'number' || isNaN(opt.maxZoom)) opt.maxZoom = DEFAULTS.maxZoom;
      return opt;
    }

    // валидные точки (lat/lng обязательны)
    function validPts(points) {
      return (points || []).filter(
        (p) => p && p.lat != null && p.lng != null && !isNaN(+p.lat) && !isNaN(+p.lng)
      );
    }

    // язык подписей: 'auto' → браузер посетителя, иначе iso-код
    const LANGUAGE = ${JSON.stringify(language)};

    // код языка браузера (для режима 'auto')
    function browserLang() {
      const raw = (navigator.language || navigator.userLanguage || 'en') + '';
      return raw.split('-')[0].toLowerCase();
    }

    // поле названия под язык: name:ru / name:en / …
    function langField(lang) { return 'name:' + (lang || 'en'); }

    // собрать text-field для слоя: сохраняем пару latin+nonlatin для нелатинских
    // языков (как в исходном Liberty), иначе — coalesce на языке.
    function buildTextField(lang) {
      // всегда ОДНО название на выбранном языке (name:ru / name:en / …),
      // без пары latin+nonlatin (никаких «EN + RU»). Фолбэк — name.
      return ['coalesce', ['get', langField(lang)], ['get', 'name']];
    }

    // применить язык ко всем symbol-слоям карты (без перезагрузки стиля)
    function applyLanguage(map) {
      try {
        const lang = LANGUAGE === 'auto' ? browserLang() : LANGUAGE;
        const style = map.getStyle && map.getStyle();
        const layers = style && style.layers;
        if (!layers) return;
        let n = 0;
        layers.forEach((l) => {
          // служебные слои (линейка frt-ruler-*, маркеры) не локализуем —
          // у них text-field = ['get','distance'], его нельзя затирать name:ru
          if (l.type !== 'symbol' || !l.layout || !l.layout['text-field']) return;
          if ((l.id || '').indexOf('frt-') === 0) return;
          map.setLayoutProperty(l.id, 'text-field', buildTextField(lang));
          n++;
        });
        if (n > 0) console.log('[maps:map] язык подписей →', lang, '(' + n + ' слоёв)');
      } catch (err) {
        console.error('[maps:map] ошибка применения языка:', err);
      }
    }

    // ── Maplibre-gl-terradraw — рисование + измерения (CDN UMD, watergis) ──
    // Все режимы кроме Valhalla (требует сервер маршрутизации).
    // Опция opts.terradraw=false отключает. Пересоздаётся при style.load.
    function initTerradraw(map, opt) {
      var Mc = window.MaplibreTerradrawControl && window.MaplibreTerradrawControl.MaplibreMeasureControl;
      if (!Mc) {
        console.warn('[maps:map] terradraw not loaded (CDN?)');
        return;
      }
      try {
        var draw = new Mc({
          modes: [
            'point', 'marker', 'linestring', 'polyline',
            'polygon', 'rectangle', 'angled-rectangle', 'circle',
            'freehand', 'freehand-linestring',
            'select', 'delete-selection', 'delete', 'undo', 'redo', 'download'
          ],
          open: true,
          measureUnitType: 'metric',
          distancePrecision: 2,
          areaPrecision: 2,
        });
        map.addControl(draw, 'top-left');
        map._frtTerradraw = draw;
      } catch (err) {
        console.error('[maps:map] terradraw init error:', err);
      }
    }

    // ── Текстовый слой (source 'frt-text-source', symbol 'frt-text-label') ──
    // Общая функция, доступна и из initTerradraw, и из makeTextTool.
    function frtRenderTextLayer(map) {
      try { if (map.getLayer('frt-text-label')) map.removeLayer('frt-text-label'); } catch (e) {}
      try { if (map.getSource('frt-text-source')) map.removeSource('frt-text-source'); } catch (e) {}
      var feats = map._frtTextFeatures || [];
      if (!feats.length) return;
      map.addSource('frt-text-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: feats }
      });
      map.addLayer({
        id: 'frt-text-label',
        type: 'symbol', source: 'frt-text-source',
        layout: {
          'text-field': ['get', 'text'],
          'text-size': ['coalesce', ['get', 'size'], 18],
          'text-font': ['Noto Sans Regular'],
          'text-anchor': 'center',
          'text-allow-overlap': true
        },
        paint: {
          'text-color': '#1a1a1a',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2
        }
      });
    }

    // ── Текст на карту: своя кнопка «T», свой попап-ввод, рендер symbol-слоем ──
    // Не зависит от terra-draw. Форма ввода — красивый popup (не prompt).
    function makeTextTool(map, ctrlPos) {
      if (map._frtTextToolDone) return;
      map._frtTextToolDone = true;
      if (!map._frtTextFeatures) map._frtTextFeatures = [];

      function rebuild() { frtRenderTextLayer(map); }
      map.on('style.load', rebuild);
      if (map.isStyleLoaded && map.isStyleLoaded()) rebuild();

      var active = false;

      function showPopup(lngLat) {
        var container = map.getContainer();
        var pos = map.project([lngLat.lng, lngLat.lat]);
        var popup = document.createElement('div');
        popup.id = 'frt-text-popup';
        popup.style.cssText = 'position:absolute;z-index:999;background:#fff;border-radius:8px;' +
          'box-shadow:0 2px 12px rgba(0,0,0,.25);padding:8px;left:' + pos.x + 'px;top:' + (pos.y - 60) + 'px;';

        var input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Введите текст';
        input.style.cssText = 'border:1px solid #ccc;border-radius:4px;padding:6px 10px;font:14px sans-serif;' +
          'width:180px;outline:none;';

        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;justify-content:flex-end;';

        var okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = 'background:#e11d48;color:#fff;border:none;border-radius:4px;padding:4px 14px;' +
          'font:13px sans-serif;cursor:pointer;';

        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Отмена';
        cancelBtn.style.cssText = 'background:#eee;color:#333;border:none;border-radius:4px;padding:4px 14px;' +
          'font:13px sans-serif;cursor:pointer;';

        function close() { if (popup.parentNode) popup.parentNode.removeChild(popup); }

        okBtn.onclick = function () {
          var t = input.value.trim();
          if (!t) { close(); return; }
          map._frtTextFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lngLat.lng, lngLat.lat] },
            properties: { text: t }
          });
          rebuild();
          close();
        };
        cancelBtn.onclick = close;

        btnRow.appendChild(okBtn);
        btnRow.appendChild(cancelBtn);
        popup.appendChild(input);
        popup.appendChild(btnRow);
        container.appendChild(popup);
        input.focus();
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') okBtn.click();
          if (e.key === 'Escape') close();
        });
      }

      function onClick(e) {
        if (!active) return;
        showPopup(e.lngLat);
      }

      var hintEl = null;
      function activate() {
        if (active) {
          active = false;
          map.getContainer().style.cursor = '';
          if (hintEl) { hintEl.remove(); hintEl = null; }
          map.off('click', onClick);
          return;
        }
        active = true;
        map.getContainer().style.cursor = 'crosshair';
        hintEl = document.createElement('div');
        hintEl.textContent = 'Кликните на карте для ввода текста';
        hintEl.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);' +
          'background:rgba(0,0,0,.7);color:#fff;padding:4px 12px;border-radius:6px;' +
          'font:13px sans-serif;pointer-events:none;z-index:99;';
        map.getContainer().appendChild(hintEl);
        map.on('click', onClick);
      }

      var btnEl = btn('Добавить текст', '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>', function () {
        activate();
        btnEl.classList.toggle('maplibregl-ctrl-active');
      });
      map.addControl({ onAdd: function () { return ctrlGroup([btnEl]); }, onRemove: function () {} }, ctrlPos);
    }

    // ── Вспомогательные контролы (compass/ruler) — self-contained, без внешних ──
    // зависимостей (adhoc по мотивам @mapbox-controls/*, совместимы с MapLibre).
    // Классы формы maplibregl-ctrl-* — под CSS MapLibre.

    // расстояние по сфере (haversine) в км между [lng,lat] точками
    function haversineKm(a, b) {
      const R = 6371;
      const toRad = (d) => (d * Math.PI) / 180;
      const dLat = toRad(b[1] - a[1]);
      const dLng = toRad(b[0] - a[0]);
      const lat1 = toRad(a[1]);
      const lat2 = toRad(b[1]);
      const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    }
    function fmtKm(km) {
      // неразрывный пробел (\u00A0) между числом и единицей — MapLibre иначе
    // схлопывает обычный пробел, и подпись сливается (напр. «митого»)
    return km < 1 ? (km * 1000).toFixed(0) + '\u00A0м' : km.toFixed(2) + '\u00A0км';
    }
    function el(cls) {
      const e = document.createElement('div');
      e.className = cls;
      return e;
    }
    function btn(title, svg, onClick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = title;
      b.innerHTML = svg;
      b.addEventListener('click', onClick);
      return b;
    }
    function ctrlGroup(children) {
      const g = el('maplibregl-ctrl maplibregl-ctrl-group');
      children.forEach((c) => g.appendChild(c));
      return g;
    }

    // 🧭 compass — вернуть на север (bearing/pitch = 0)
    function makeCompass(map, position) {
      const btnEl = btn(
        'Компас',
        '<svg viewBox="0 0 24 24" width="23" height="23" xmlns="http://www.w3.org/2000/svg">' +
          '<path fill="none" d="M0 0h24v24H0z"/><path fill="#e11d48" d="M12 3l4 8H8z"/>' +
          '<path fill="#9E9E9E" d="M12 21l-4-8h8z"/></svg>',
        () => map.easeTo({ bearing: 0, pitch: 0 })
      );
      const update = () => {
        btnEl.style.transform = 'rotate(' + (-map.getBearing()) + 'deg)';
      };
      map.on('rotate', update);
      update();
      map.addControl({ onAdd: () => ctrlGroup([btnEl]), onRemove: () => {} }, position);
    }

    // 📏 ruler — кликами ставит точки; рисует ломаную + подписи расстояний
    // 🛰 выбрать вид карты: Стандартная (OpenFreeMap Liberty) / Спутниковая
    // (Esri World Imagery + подписи поверх). Без внешних API-ключей.
    function makeStyles(map, position, opts) {
      const libUrl = opts.styleUrl || 'https://tiles.openfreemap.org/styles/liberty';
      const satStyle = {
        version: 8,
        name: 'frt-satellite',
        // глифы — те же, что у Liberty (Noto Sans), чтобы symbol-слои
        // (линейка, подписи поверх) могли рисовать текст на спутнике
        glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
        sources: {
          esri: {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution: '© Esri, Maxar, Earthstar Geographics'
          },
          esriLabels: {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            maxzoom: 18,
            attribution: '© Esri'
          },
          // векторные подписи OpenFreeMap поверх спутника — для локализации
          // названий (applyLanguage обрабатывает symbol-слои этого стиля)
          omt: {
            type: 'vector',
            url: 'https://tiles.openfreemap.org/planet'
          }
        },
        layers: [
          { id: 'esri-rs', type: 'raster', source: 'esri' },
          { id: 'esri-rl', type: 'raster', source: 'esriLabels' },
          // локализуемые подписи поверх спутниковых снимков
          { id: 'sat-label_city', type: 'symbol', source: 'omt', 'source-layer': 'place',
            filter: ['all', ['==', ['get', 'class'], 'city'], ['!=', ['get', 'capital'], 2]], minzoom: 3,
            layout: { 'text-anchor': 'bottom',
              'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']],
              'text-font': ['Noto Sans Regular'], 'text-max-width': 8,
              'text-size': ['interpolate', ['exponential', 1.2], ['zoom'], 4, 11, 7, 13, 11, 18] },
            paint: { 'text-color': '#000', 'text-halo-blur': 1, 'text-halo-color': '#fff', 'text-halo-width': 1 } },
          { id: 'sat-label_town', type: 'symbol', source: 'omt', 'source-layer': 'place',
            filter: ['==', ['get', 'class'], 'town'], minzoom: 6,
            layout: { 'text-anchor': 'bottom',
              'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']],
              'text-font': ['Noto Sans Regular'], 'text-max-width': 8,
              'text-size': ['interpolate', ['exponential', 1.2], ['zoom'], 7, 12, 11, 14] },
            paint: { 'text-color': '#000', 'text-halo-blur': 1, 'text-halo-color': '#fff', 'text-halo-width': 1 } },
          { id: 'sat-label_village', type: 'symbol', source: 'omt', 'source-layer': 'place',
            filter: ['==', ['get', 'class'], 'village'], minzoom: 9,
            layout: { 'text-anchor': 'bottom',
              'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']],
              'text-font': ['Noto Sans Regular'], 'text-max-width': 8,
              'text-size': ['interpolate', ['exponential', 1.2], ['zoom'], 7, 10, 11, 12] },
            paint: { 'text-color': '#000', 'text-halo-blur': 1, 'text-halo-color': '#fff', 'text-halo-width': 1 } },
          { id: 'sat-label_state', type: 'symbol', source: 'omt', 'source-layer': 'place',
            filter: ['==', ['get', 'class'], 'state'], minzoom: 5,
            layout: { 'text-transform': 'uppercase',
              'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']],
              'text-font': ['Noto Sans Italic'], 'text-letter-spacing': 0.2, 'text-max-width': 9,
              'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 8, 14] },
            paint: { 'text-color': '#333', 'text-halo-blur': 1, 'text-halo-color': '#fff', 'text-halo-width': 1 } },
          { id: 'sat-water_name_point_label', type: 'symbol', source: 'omt', 'source-layer': 'water_name',
            filter: ['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false],
            layout: { 'symbol-placement': 'point',
              'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']],
              'text-font': ['Noto Sans Italic'], 'text-letter-spacing': 0.2, 'text-max-width': 5,
              'text-size': ['interpolate', ['linear'], ['zoom'], 0, 10, 8, 14] },
            paint: { 'text-color': '#495e91', 'text-halo-color': 'rgba(255,255,255,0.7)', 'text-halo-width': 1.5 } }
        ]
      };
      const stdBtn = btn('Стандартная карта (OpenFreeMap Liberty)',
        '<svg viewBox="0 0 24 24" width="23" height="23" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
        '<path fill="none" d="M0 0h24v24H0z"/><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>',
        () => applyStd());
      const satBtn = btn('Спутниковая карта (Esri World Imagery)',
        '<svg viewBox="0 0 24 24" width="23" height="23" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
        '<path fill="none" d="M0 0h24v24H0z"/><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM5 4.99h3C8 6.65 6.65 8 5 8V4.99zM5 12v-2c2.76 0 5-2.25 5-5.01h2C12 8.86 8.87 12 5 12zm0 6l3.5-4.5 2.5 3.01L14.5 12l4.5 6H5z"/></svg>',
        () => applySat());
      function applyStd() { buttons.forEach((x) => x.btn.classList.remove('-active')); stdBtn.classList.add('-active'); map.setStyle(libUrl); }
      function applySat() { buttons.forEach((x) => x.btn.classList.remove('-active')); satBtn.classList.add('-active'); map.setStyle(satStyle); }
      const buttons = [
        { btn: stdBtn },
        { btn: satBtn }
      ];
      stdBtn.addEventListener('click', applyStd);
      satBtn.addEventListener('click', applySat);
      function syncActive() {
        let n = '';
        try { n = (map.getStyle() && (map.getStyle().name || '')) || ''; } catch (e) {}
        const sat = n === 'frt-satellite';
        stdBtn.classList.toggle('-active', !sat);
        satBtn.classList.toggle('-active', sat);
      }
      map.on('styledata', syncActive);
      map.on('style.load', syncActive);
      syncActive();
      map.addControl({ onAdd: () => ctrlGroup(buttons.map((x) => x.btn)), onRemove: () => {} }, position);
    }

    // 📥 export — скачать текущий вид карты (включая маркеры) как PNG.
    // Клиентский рендер через maplibre-gl-map-to-image (CDN, UMD-глобал
    // window.MapLibreGLMapToImage.toElement). Из кадра убираем все контролы
    // (компас/линейку/виды/геокодер) и попапы — оставляем только маркеры.
    //
    // UX: НЕ качаем сразу после генерации (a.click() в конце асинхронной
    // цепочки теряет user activation → Chrome/Яндекс молча блокирует download,
    // особенно на спутнике, где карта долго не становится idle). Вместо этого
    // показываем модалку с превью PNG и кнопкой «Скачать PNG» — клик по ней
    // свежий жест, скачивание гарантировано.
    function makeExport(map, position, opts) {
      const btnEl = btn(
        'Скачать карту как PNG',
        '<svg viewBox="0 0 24 24" width="23" height="23" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
        '<path fill="none" d="M0 0h24v24H0z"/><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>',
        () => doExport()
      );

      // имя файла: frt-map-ГГГГ-ММ-ДД_ЧЧ-ММ.png
      function stamp() {
        const d = new Date();
        const pad = (n) => (n < 10 ? '0' + n : '' + n);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + pad(d.getHours()) + '-' + pad(d.getMinutes());
      }

      // создать (или вернуть) модалку превью
      function ensureModal() {
        let m = document.getElementById('frt-export-modal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'frt-export-modal';
        m.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;' +
          'background:rgba(0,0,0,.55);font:14px/1.4 system-ui,sans-serif;';
        m.innerHTML =
          '<div style="background:#fff;border-radius:12px;max-width:92vw;max-height:92vh;display:flex;flex-direction:column;' +
          'box-shadow:0 12px 40px rgba(0,0,0,.35);overflow:hidden;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;' +
              'border-bottom:1px solid #e5e7eb;">' +
              '<strong id="frt-export-title">Карта</strong>' +
              '<button id="frt-export-close" type="button" title="Закрыть" style="border:0;background:none;cursor:pointer;' +
                'font-size:22px;line-height:1;color:#6b7280;padding:2px 6px;">×</button>' +
            '</div>' +
            '<div style="flex:1;overflow:auto;background:#f3f4f6;display:flex;align-items:center;justify-content:center;padding:12px;">' +
              '<img id="frt-export-preview" alt="Превью карты" style="max-width:100%;max-height:70vh;border-radius:6px;box-shadow:0 2px 12px rgba(0,0,0,.2);display:block;"/>' +
            '</div>' +
            '<div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #e5e7eb;">' +
              '<button id="frt-export-dl" type="button" style="border:1px solid #d1d5db;background:#fff;color:#111827;' +
                'border-radius:8px;padding:8px 16px;cursor:pointer;font-weight:600;">Скачать PNG</button>' +
            '</div>' +
          '</div>';
        m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
        m.querySelector('#frt-export-close').addEventListener('click', closeModal);
        m.querySelector('#frt-export-dl').addEventListener('click', downloadPng);
        document.body.appendChild(m);
        return m;
      }
      function openModal(src) {
        const m = ensureModal();
        m.querySelector('#frt-export-preview').src = src;
        m.querySelector('#frt-export-title').textContent = 'Карта · PNG ' + (imgDim() ? imgDim() : '');
        m.style.display = 'flex';
      }
      function closeModal() {
        const m = document.getElementById('frt-export-modal');
        if (m) m.style.display = 'none';
      }
      function downloadPng() {
        const img = document.getElementById('frt-map-export-img');
        if (!img || !img.src) return;
        const a = document.createElement('a');
        a.download = 'frt-map-' + stamp() + '.png';
        a.href = img.src;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      function imgDim() {
        const img = document.getElementById('frt-map-export-img');
        if (img && img.naturalWidth) return img.naturalWidth + '×' + img.naturalHeight;
        return '';
      }

      function doExport() {
        const lib = window.MapLibreGLMapToImage;
        if (!lib || !lib.toElement) {
          console.error('[maps:map] maplibre-gl-map-to-image не загружен (CDN?)');
          return;
        }
        // плагин требует ID существующего <img>, куда положит dataUrl;
        // держим скрытый невидимый img, снимаем с него src для превью.
        let img = document.getElementById('frt-map-export-img');
        if (!img) {
          img = document.createElement('img');
          img.id = 'frt-map-export-img';
          img.style.cssText = 'position:absolute;left:-99999px;top:0;width:1px;height:1px;';
          document.body.appendChild(img);
        }
        // индикатор генерации: крутим заголовок кнопки
        btnEl.disabled = true;
        const old = btnEl.innerHTML;
        btnEl.innerHTML = '…';
        // Обход бага плагина v1.2.0: при coverEdits=false объект
        // _canvasContextAttributes не создаётся, но в финальной очистке
        // toElement пишет в него (e._canvasContextAttributes.preserveDrawingBuffer=u)
        // → undefined.preserveDrawingBuffer → TypeError → промис reject →
        // скачивание молча не происходит. Заранее создаём пустой объект.
        if (!map._canvasContextAttributes) map._canvasContextAttributes = {};
        // НЕДЕТЕРМИНИРОВАННОСТЬ: плагин ждёт map.once('idle') внутри toElement.
        // Если карта «спит» (не рендерит, уже в состоянии idle), то следующий
        // idle не эмитится → промис зависит ВЕЧНО (кнопка залипает). На спутнике
        // это проявлялось стабильнее (растровые тайлы). triggerRepaint()
        // гарантирует запланированный рендер, после которого придёт idle.
        map.triggerRepaint();
        // страховочный таймаут: если idle/рендер не пришли за 20с — снимаем
        // блокировку кнопки, чтобы не «залипала» без результата.
        let finished = false;
        const timer = setTimeout(function () {
          if (!finished) {
            console.error('[maps:map] export timeout (map idle не наступил)');
            btnEl.disabled = false;
            btnEl.innerHTML = old;
          }
        }, 20000);
        lib.toElement(map, {
          targetImageId: 'frt-map-export-img',
          format: 'png',
          pixelRatio: 2,
          hideAllControls: true,   // компас/линейка/виды/геокодер — не в кадре
          hidePopups: true,        // попапы открываются по клику — не в кадре
          coverEdits: false,       // ничего не двигаем (bbox не используем) — без фликера
        })
          .then(function () {
            finished = true;
            clearTimeout(timer);
            // генерация готова — показываем превью + кнопку «Скачать PNG»
            // (свежий клик = новый user activation → download не блокируется)
            openModal(img.src);
          })
          .catch(function (err) {
            finished = true;
            clearTimeout(timer);
            console.error('[maps:map] export error:', err);
          })
          .finally(function () {
            btnEl.disabled = false;
            btnEl.innerHTML = old;
          });
        // «будильник» для idle: плагин внутри toElement ждёт map.once('idle').
        // Если карта статична (всё загружено, ничего не рендерится), MapLibre
        // НЕ эмитит idle повторно → промис toElement виснет вечно, кнопка
        // залипает. Это проявляется на спутниковой карте (растры статичны)
        // стабильно, на стандартной — реже. Микро-пинок (jumpTo туда-обратно,
        // визуально незаметен) заставляет карту отрисовать кадр и эмитить idle.
        // Проверено: без него промис виснет, с ним — resolve приходит.
        setTimeout(function () {
          try {
            if (map.isMoving && map.isMoving()) return;
            if ((map.isStyleLoaded && !map.isStyleLoaded()) || (!map.style || !map.style.loaded())) return;
            const c = map.getCenter();
            const d = 1e-4 * Math.max(1, map.getZoom() / 8);
            map.jumpTo({ center: [c.lng + d, c.lat] });
            map.jumpTo({ center: [c.lng, c.lat] });
          } catch (e) { /* не критично */ }
        }, 800);
      }
      map.addControl({ onAdd: () => ctrlGroup([btnEl]), onRemove: () => {} }, position);
    }

    // добавить маркеры (без создания карты) + вернуть bounds

    // 📏 ruler — кликами ставит точки; рисует ломаную + подписи расстояний
    function makeRuler(map, position) {
      const active = { is: false };
      const coords = []; // [[lng,lat], …]
      const L = { line: 'frt-ruler-line', pts: 'frt-ruler-points', labels: 'frt-ruler-labels' };
      const S = { line: 'frt-ruler-line-src', pts: 'frt-ruler-points-src' };
      const btnEl = btn(
        'Линейка',
        '<svg viewBox="0 0 24 24" width="23" height="23" fill="currentColor">' +
          '<rect fill="none" height="24" width="24"/><path d="M20,6H4C2.9,6,2,6.9,2,8v8c0,1.1,0.9,2,2,2h16c1.1,0,2-0.9,2-2V8C22,6.9,21.1,6,20,6z M20,16H4V8h3v3c0,0.55,0.45,1,1,1h0 c0.55,0,1-0.45,1-1V8h2v3c0,0.55,0.45,1,1,1h0c0.55,0,1-0.45,1-1V8h2v3c0,0.55,0.45,1,1,1h0c0.55,0,1-0.45,1-1V8h3V16z"/></svg>',
        () => toggle()
      );
      function lineFC() {
        return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
      }
      function pointsFC() {
        let sum = 0;
        // общая длина ломаной (сумма всех сегментов)
        let total = 0;
        for (let i = 1; i < coords.length; i++) total += haversineKm(coords[i - 1], coords[i]);
        const features = coords.map((c, i) => {
          if (i > 0) sum += haversineKm(coords[i - 1], c);
          return {
            type: 'Feature', id: String(i),
            // промежуточные — накопленное; у последней точки — общая длина всей ломаной
            properties: { distance: i === 0 ? '' : (i === coords.length - 1 ? fmtKm(total) + '\u00A0итого' : fmtKm(sum)) },
            geometry: { type: 'Point', coordinates: c },
          };
        });
        return { type: 'FeatureCollection', features };
      }
      function ensureSources() {
        if (!map.getSource(S.line)) map.addSource(S.line, { type: 'geojson', data: lineFC() });
        if (!map.getSource(S.pts)) map.addSource(S.pts, { type: 'geojson', data: pointsFC() });
      }
      function ensureLayers() {
        ensureSources();
        if (!map.getLayer(L.line)) {
          map.addLayer({ id: L.line, type: 'line', source: S.line,
            paint: { 'line-color': '#263238', 'line-width': 2 } });
        }
        if (!map.getLayer(L.pts) && coords.length) {
          map.addLayer({ id: L.pts, type: 'circle', source: S.pts,
            paint: { 'circle-radius': 5, 'circle-color': '#fff',
              'circle-stroke-width': 2, 'circle-stroke-color': '#000' } });
        }
        if (!map.getLayer(L.labels) && coords.length) {
          map.addLayer({ id: L.labels, type: 'symbol', source: S.pts,
            layout: { 'text-field': ['get', 'distance'], 'text-font': ['Noto Sans Regular'],
              'text-anchor': 'top', 'text-size': 12, 'text-offset': [0, 0.8] },
            paint: { 'text-color': '#1f2937', 'text-halo-color': '#ffffff',
              'text-halo-width': 3, 'text-halo-blur': 0.5 } });
        }
      }
      function update() {
        // стиль ещё не готов — доедаем по style.load (сам запрет на блокировку
        // будущих вызовов: подписываемся один раз, но НЕ блокируем прямые update())
        if (!map.isStyleLoaded()) {
          map.once('style.load', update);
          return;
        }
        ensureLayers();
        const ls = map.getSource(S.line); const ps = map.getSource(S.pts);
        if (ls) ls.setData(lineFC());
        if (ps) ps.setData(pointsFC());
      }
      function mapClick(e) {
        coords.push([e.lngLat.lng, e.lngLat.lat]);
        update();
      }
      function activate() {
        active.is = true;
        map.getCanvas().style.cursor = 'crosshair';
        coords.length = 0;
        map.on('click', mapClick);
        update();
        btnEl.classList.add('maplibregl-ctrl-active');
      }
      function deactivate() {
        active.is = false;
        map.getCanvas().style.cursor = '';
        map.off('click', mapClick);
        ['line', 'pts', 'labels'].forEach((k) => { if (map.getLayer(L[k])) map.removeLayer(L[k]); });
        [S.line, S.pts].forEach((k) => { if (map.getSource(k)) map.removeSource(k); });
        coords.length = 0;
        btnEl.classList.remove('maplibregl-ctrl-active');
      }
      function toggle() { active.is ? deactivate() : activate(); }
      map.on('style.load', () => { if (active.is) update(); });
      map.addControl({ onAdd: () => ctrlGroup([btnEl]), onRemove: () => {} }, position);
      // публичный API (для интеграций/тестов): активировать + добавить точку
      const api = {
        activate: activate,
        deactivate: deactivate,
        toggle: toggle,
        addPoint: function (lnglat) { if (!active.is) activate(); coords.push([lnglat.lng, lnglat.lat]); update(); },
        reset: function () { coords.length = 0; update(); },
      };
      if (!map._frtRuler) map._frtRuler = api;
    }

    // ── Поиск мест (maplibre-gl-geocoder) ──
    // Провайдер бьёт в наш серверный POST /maps/geocode (он уже возвращает
    // GeoJSON FeatureCollection). Сначала ищутся свои SearchPlace в OrientDB,
    // при промахе — фолбэк Nominatim (и результат сохраняется в БД).
    // Контрол добавляется один раз в createMap и работает на обеих стилях
    // (стандарт + спутник), т.к. переключение стиля не пересоздаёт карту.
    function makeGeocoder(map, opts) {
      if (map._frtGeocoder || !window.MaplibreGeocoder) return;
      const position = (opts.geocoderPosition) || 'top-left';
      const zoom = typeof opts.geocoderZoom === 'number' ? opts.geocoderZoom : 14;
      const placeHolder = opts.geocoderPlaceholder || 'Поиск места…';

      const provider = {
        // search text → FeatureCollection (наш серверный эндпоинт)
        forwardGeocode: function (config) {
          const features = [];
          return fetch('/maps/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: config.query,
              lang: window.MapsRender && window.MapsRender.getLang ? window.MapsRender.getLang() : undefined,
            }),
          })
            .then(function (resp) {
              if (!resp.ok) throw new Error('geocode HTTP ' + resp.status);
              return resp.json();
            })
            .then(function (data) {
              const fc = (data && data.features) || [];
              return {
                features: fc.map(function (f) {
                  const p = (f.properties || {});
                  const center = p.center || ((f.geometry && f.geometry.coordinates) || [0, 0]);
                  const place_name = (p.name || '') + (p.address ? ', ' + p.address : '');
                  return {
                    type: 'Feature',
                    geometry: {
                      type: 'Point',
                      coordinates: (f.geometry && f.geometry.coordinates) || [0, 0],
                    },
                    // некоторые поля геокодер читает на верхнем уровне фичи,
                    // а не из properties (дефолтный render делает item.place_name.split)
                    place_name: place_name,
                    text: p.name || '',
                    center: center,
                    properties: {
                      title: p.name || '',
                      description: p.address || '',
                      id: p.osm_id || p.id,
                      center: center,
                      place_name: place_name,
                      text: p.name || '',
                    },
                  };
                }),
              };
            })
            .catch(function (err) {
              console.error('[maps:map] geocoder fetch error:', err);
              return { features: [] };
            });
        },
        // reverse geocoding — не нужен (нет выбранной точки), возвращаем пусто
        reverseGeocode: function () {
          return Promise.resolve({ features: [] });
        },
      };

      try {
        const geocoder = new window.MaplibreGeocoder(provider, {
          maplibregl: window.maplibregl,
          placeholder: placeHolder,
          zoom: zoom,
          collapsed: false,
          showResultsWhileTyping: true,
        });
        map.addControl(geocoder, position);
        map._frtGeocoder = geocoder;
        // при выборе результата — плавный перелёт к месту
        geocoder.on('result', function (e) {
          var c = e && e.result && e.result.center;
          if (c && c.length === 2) {
            map.jumpTo({ center: c, zoom: zoom });
          }
        });
      } catch (err) {
        console.error('[maps:map] geocoder init error:', err);
      }
    }

    // добавить маркеры (без создания карты) + вернуть bounds
    function addMarkers(map, pts, opt) {
      if (!map._frtMarkers) map._frtMarkers = [];
      const bounds = new maplibregl.LngLatBounds();
      for (const p of pts) {
        const lng = +p.lng;
        const lat = +p.lat;
        const pin = document.createElement('div');
        pin.style.background = opt.markerColor;
        pin.style.width = '22px';
        pin.style.height = '22px';
        pin.style.borderRadius = '50% 50% 50% 0';
        pin.style.transform = 'rotate(-45deg)';
        pin.style.border = '2px solid #fff';
        pin.style.boxShadow = '0 2px 6px rgba(0,0,0,.4)';
        const mk = new maplibregl.Marker({ element: pin })
          .setLngLat([lng, lat])
          .setPopup(
            new maplibregl.Popup({ offset: 12 }).setHTML(
              '<strong>' + (p.name || 'Место') + '</strong>' +
              (p.address ? '<br><small>' + p.address + '</small>' : '') +
              (p.note ? '<br><em>' + p.note + '</em>' : '') +
              (p.day ? '<br><small>день ' + p.day + '</small>' : '')
            )
          )
          .addTo(map);
        map._frtMarkers.push(mk);
        // 🏷 тултип при наведении на маркер (имя места) — без конфликта с popup (клик)
        if (!map._frtTip) { map._frtTip = (function () {
          const node = document.createElement('div');
          node.style.cssText = 'position:absolute;pointer-events:none;background:rgba(30,30,30,.92);' +
            'color:#fff;padding:4px 8px;border-radius:6px;font:12px/1.4 sans-serif;white-space:nowrap;' +
            'transform:translate(-50%,-120%);z-index:2;opacity:0;transition:opacity .12s;';
          map.getContainer().appendChild(node);
          return node;
        })(); }
        pin.addEventListener('mouseenter', function () {
          if (!map._frtTip) return;
          map._frtTip.textContent = p.name || 'Место';
          const pos = map.project([lng, lat]);
          map._frtTip.style.left = pos.x + 'px';
          map._frtTip.style.top = pos.y + 'px';
          map._frtTip.style.opacity = '1';
        });
        pin.addEventListener('mouseleave', function () {
          if (map._frtTip) map._frtTip.style.opacity = '0';
        });
        bounds.extend([lng, lat]);
      }
      return bounds;
    }

    // текущий язык карты (для внешних контролов, напр. геокодера)
    window.MapsRender.getLang = function () {
      return LANGUAGE === 'auto' ? browserLang() : LANGUAGE;
    };

    // создать карту в контейнере (если ещё нет) и вернуть её
    window.MapsRender.createMap = function (container, o) {
      const opt = optsOf(o);
      const el = typeof container === 'string' ? document.getElementById(container) : container;
      if (!el) {
        console.error('[maps:map] container not found:', container);
        return null;
      }
      if (el._frtMap) return el._frtMap;
      const map = new maplibregl.Map({
        container: el,
        style: opt.styleUrl,
        center: opt.center,
        zoom: opt.zoom,
      });
      el._frtMap = map;
      // Тулбар-контролы (компас + линейка) — добавляем после инициализации.
      // Позиция настраивается opts.controlsPosition (по умолчанию top-right).
      const ctrlPosition = opt.controlsPosition || 'top-right';
      if (!opt.hideControls) {
        makeCompass(map, ctrlPosition);
        makeRuler(map, ctrlPosition);
        // выбор вида карты — Стандартная/Спутниковая (опция styles, по умолч. вкл.)
        if (opt.styles !== false) makeStyles(map, ctrlPosition, opt);
        // экспорт в PNG — кнопка скачивания (работает на обеих стилях)
        if (opt.export !== false) makeExport(map, ctrlPosition, opt);
      }
      // поиск мест — всегда (в т.ч. при hideControls), работает на обеих стилях
      makeGeocoder(map, opt);
      // текстовые подписи — своя кнопка «Т» в правой панели
      makeTextTool(map, ctrlPosition);
      // terradraw — рисование + измерения. Инициализируем после загрузки стиля.
      // При каждом style.load (переключение Стандартная↔Спутник) TerraDraw
      // теряет source/layer — удаляем старый control и создаём новый.
      // TerraDraw: если стиль уже загружен — стартуем сразу. При смене стиля
      // (Standard↔Satellite) пересоздаём через style.load. Один обработчик.
      if (opt.terradraw !== false) {
        function tdRestart() {
          if (map._frtTerradraw) {
            try { map.removeControl(map._frtTerradraw); } catch (e) {}
            map._frtTerradraw = null;
          }
          initTerradraw(map, opt);
        }
        if (map.isStyleLoaded && map.isStyleLoaded()) tdRestart();
        map.on('style.load', tdRestart);
      }
      // локализация подписей — применяем, когда стиль загружен, и переживаем
      // перезагрузку стиля (style.load / styledata). Без этого getStyle() пуст.
      const applyOnce = () => {
        if (map._frtLangApplied) return;
        map._frtLangApplied = true;
        applyLanguage(map);
      };
      // при ИЗМЕНЕНИИ стиля (setStyle: стандартная→спутник и обратно) сбрасываем
      // флаг, чтобы applyLanguage заново обработала symbol-слои нового стиля.
      const resetLang = () => { map._frtLangApplied = false; };
      if (map.isStyleLoaded && map.isStyleLoaded()) applyOnce();
      map.on('style.load', () => { resetLang(); applyOnce(); });
      map.on('styledata', () => {
        // при перезагрузке стиля (swapStyle) применяем заново, но не спам.
        // styledata срабатывает и когда стиль уже локализован — флаг защищает.
        if (map._frtStyleReloading) return;
        map._frtStyleReloading = true;
        setTimeout(() => {
          map._frtStyleReloading = false;
          resetLang();
          applyOnce();
        }, 100);
      });
      return map;
    };

    // убрать все маркеры с карты
    window.MapsRender.clearPoints = function (map) {
      if (!map || !map._frtMarkers) return;
      map._frtMarkers.forEach((m) => m.remove());
      map._frtMarkers = [];
    };

    // долить точки на существующую карту (без сброса) и вернуть bounds
    window.MapsRender.addPoints = function (map, points, o) {
      const opt = optsOf(o);
      return addMarkers(map, validPts(points), opt);
    };

    // заменить точки: сброс старых маркеров + добавление новых (+fitBounds)
    window.MapsRender.setPoints = function (map, points, o) {
      const opt = optsOf(o);
      window.MapsRender.clearPoints(map);
      const pts = validPts(points);
      const bounds = addMarkers(map, pts, opt);
      if (pts.length > 0 && !bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: opt.pad, maxZoom: opt.maxZoom });
      }
      return pts.length;
    };

    // fit по точкам (без перерисовки маркеров)
    window.MapsRender.fitToPoints = function (map, points, o) {
      const opt = optsOf(o);
      const pts = validPts(points);
      if (!pts.length) return;
      const bounds = new maplibregl.LngLatBounds();
      pts.forEach((p) => bounds.extend([+p.lng, +p.lat]));
      map.fitBounds(bounds, { padding: opt.pad, maxZoom: opt.maxZoom });
    };

    // прежний контракт (карта поездки, статичный набор точек):
    // создать карту (если ещё нет) и залить точки, при необходимости fitBounds
    window.MapsRender.renderMap = function (container, points, opts) {
      const map = window.MapsRender.createMap(container, opts);
      if (!map) return null;
      const opt = optsOf(opts);
      const pts = validPts(points);
      const bounds = addMarkers(map, pts, opt);
      if (pts.length > 0 && !bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: opt.pad, maxZoom: opt.maxZoom });
      }
      return map;
    };

    // ── TerraDraw API (рисование + измерения) ──
    window.MapsRender.getDrawData = function (map) {
      return (map && map._frtTerradraw) ? map._frtTerradraw.getData() : null;
    };
    window.MapsRender.clearDraw = function (map) {
      if (map && map._frtTerradraw) map._frtTerradraw.clear();
    };
    window.MapsRender.setDrawData = function (map, geojson) {
      if (map && map._frtTerradraw) map._frtTerradraw.setData(geojson);
    };
  })();
</script>`.trim()

  return html
}

export { renderMapHtml }
