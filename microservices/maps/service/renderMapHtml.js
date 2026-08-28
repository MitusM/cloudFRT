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
//              styles?=true (переключатель Стандартная/Спутниковая в тулбаре),
//              editor?=true (панель «Инструменты»: линейка/текст/точка/маркер/
//                            рисование фигур/Select/Delete/Undo/Redo/экспорт GeoJSON;
//                            editor:false — карта «только просмотр» без панели) }
//
// Тулбар-контролы (addControl): 🧭 компас (bearing→0), 🛰 виды (стандарт/спутник),
// 🏷 тултип при наведении на маркер (имя места). Всё это — постоянные контролы;
// линейка + редактор гео-объектов прячутся в раскрывающуюся панель «Инструменты»
// (editor, по умолчанию свёрнута; editor:false — полностью скрыть).
// Self-contained (по мотивам @mapbox-controls/*, совместимы с MapLibre GL),
// без внешних npm-зависимостей.
// === === === === === === === === === === === ===

function renderMapHtml(opts = {}) {
  const markerColor = opts.markerColor || '#e11d48'
  const center = Array.isArray(opts.center) ? opts.center : [37.62, 55.75]
  // Токен для публичных гео-эндпоинтов (geocode/pois). Если передан — вшивается
  // в window._frtMapToken, и клиентский fetch geocode/pois шлёт его в заголовке
  // X-Maps-Token. Пустая строка/undefined = не вшиваем (страница без токена,
  // поиск мест будет отклонён сервером).
  const token = typeof opts.token === 'string' ? opts.token : ''
  const zoom = typeof opts.zoom === 'number' ? opts.zoom : 5
  const heightPx = typeof opts.heightPx === 'number' ? opts.heightPx : 900
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
<style>
  .maplibregl-ctrl-active { background-color: #fbc412 !important; }
  .maplibregl-ctrl-active:hover { background-color: #e5b010 !important; }
</style>
<div id="${containerId}" style="width:100%; height:${heightPx}px; border-radius:8px; overflow:hidden;"></div>
<script src="https://unpkg.com/maplibre-gl@4.4.0/dist/maplibre-gl.js"></script>
<script src="https://unpkg.com/@maplibre/maplibre-gl-geocoder@1.9.4/dist/maplibre-gl-geocoder.js"></script>
<script src="https://unpkg.com/maplibre-gl-map-to-image@1.2.0/dist/maplibre-gl-map-to-image.min.js"></script>
<script>
  // ── Общий рендер карты (maps:map) — данные подставляет вызывающий МС ──
  (function () {
    window.MapsRender = window.MapsRender || {};

    // Токен для публичных гео-эндпоинтов (geocode/pois): клиентские fetch
    // шлют его в заголовке X-Maps-Token. Без токена сервер отклоняет поиск.
    window._frtMapToken = ${token ? JSON.stringify(token) : 'null'};
    // нормализация опций с чувствительными к типам значениями из бэкенда
    const DEFAULTS = {
      center: ${JSON.stringify(center)},
      zoom: ${JSON.stringify(zoom)},
      markerColor: '${markerColor}',
      styleUrl: '${styleUrl}',
      pad: 48,
      maxZoom: 14,
      editor: true,
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

    // ── Текстовый слой (source 'frt-text-source', symbol 'frt-text-label') ──
    // Используется makeTextTool'ом для пересоздания слоя при style.load.
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
    // ── Точка на карту: кнопка → клик → маркер через addMarkers (готовый) ──
    // Заимствует маркер из MapsRender.addPoints/addMarkers (красная капля с
    // белой обводкой + попап + тултип), не изобретает свой пин.
    // Работает на обеих картах (Standard + Satellite), не зависит от terra-draw.
    function makePointTool(map, ctrlPos) {
      if (map._frtPointToolDone) return;
      map._frtPointToolDone = true;

      var active = false;

      function onClick(e) {
        if (!active) return;
        var lng = e.lngLat.lng;
        var lat = e.lngLat.lat;
        // маркер как у terra-draw point — синий кружок #3f97e0, а не красная капля
        var el = document.createElement('div');
        el.style.cssText = 'width:12px;height:12px;border-radius:50%;background:#3f97e0;' +
          'border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.2);cursor:pointer;';
        // точка — id для Select/Delete
        var _id = 'frt-pt-' + map._frtNextId++;
        el.dataset.frtTool = 'point';
        el.dataset.frtId = _id;
        var mk = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .setPopup(new maplibregl.Popup({ offset: 10 }).setHTML('<small>Точка</small>'))
          .addTo(map);
        mk._frtId = _id;
        if (!map._frtPointMarkers) map._frtPointMarkers = [];
        map._frtPointMarkers.push(mk);
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
        hintEl.textContent = 'Кликните на карте, чтобы поставить точку';
        hintEl.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);' +
          'background:rgba(0,0,0,.7);color:#fff;padding:4px 12px;border-radius:6px;' +
          'font:13px sans-serif;pointer-events:none;z-index:99;';
        map.getContainer().appendChild(hintEl);
        map.on('click', onClick);
      }

      // иконка кнопки — заимствована из terra-draw measure-add-point-button (круг-мишень)
      var btnEl = btn('Поставить точку', '<svg viewBox="0 0 100 100" width="20" height="20" fill="#5f6368" style="display:block;margin:2px auto;">' +
        '<path d="M50 37.45c-6.89 0-12.55 5.66-12.55 12.549 0 6.89 5.66 12.55 12.55 12.55 6.655 0 12.112-5.294 12.48-11.862a3.5 3.5 0 0 0 .07-.688 3.5 3.5 0 0 0-.07-.691C62.11 42.74 56.653 37.45 50 37.45m0 7c3.107 0 5.55 2.442 5.55 5.549s-2.443 5.55-5.55 5.55-5.55-2.443-5.55-5.55S46.892 44.45 50 44.45"/></svg>', function () {
        activate();
        btnEl.classList.toggle('maplibregl-ctrl-active');
      });
      // публичный API для управления точками (независимо от addMarkers)
      if (!window.MapsRender.frtGetPoints) {
        window.MapsRender.frtGetPoints = function (map) {
          if (!map || !map._frtPointMarkers) return [];
          return map._frtPointMarkers.map(function (mk) {
            var ll = mk.getLngLat();
            return { lng: ll.lng, lat: ll.lat, _frtId: mk._frtId };
          });
        };
        window.MapsRender.frtClearPoints = function (map) {
          if (!map || !map._frtPointMarkers) return;
          map._frtPointMarkers.forEach(function (m) { m.remove(); });
          map._frtPointMarkers = [];
        };
        window.MapsRender.frtSetPoints = function (map, points) {
          if (!map) return;
          window.MapsRender.frtClearPoints(map);
          (points || []).forEach(function (p) {
            var el = document.createElement('div');
            el.style.cssText = 'width:12px;height:12px;border-radius:50%;background:#3f97e0;' +
              'border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.2);cursor:pointer;';
            var _id = 'frt-pt-' + map._frtNextId++;
            el.dataset.frtTool = 'point';
            el.dataset.frtId = _id;
            var mk = new maplibregl.Marker({ element: el })
              .setLngLat([p.lng, p.lat])
              .addTo(map);
            mk._frtId = _id;
            map._frtPointMarkers.push(mk);
          });
        };
      }
      return btnEl;
    }

    // ── Маркер на карту: кнопка → клик → маркер-пин (как terra-draw marker) ──
    // Заимствует иконку из terra-draw CSS (marker-grey.svg, капля с кольцом) и
    // стиль marker-режима (markerUrl, markerWidth/Height 27×27, anchor bottom).
    // Свой инструмент: работает на обеих картах (Standard + Satellite),
    // не зависит от terra-draw. Клик ставит маркер, повторный клик по кнопке —
    // выход из режима.
    function makeMarkerTool(map, ctrlPos) {
      if (map._frtMarkerToolDone) return;
      map._frtMarkerToolDone = true;

      var active = false;

      // капля-пин из terra-draw marker-grey.svg (fill #5f6368 — серый)
      var PIN = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M 50.001528,3.3861402e-7 C 30.763177,3.3861402e-7 15,15.718144 15,34.901534 c 0,7.432782 2.373565,14.339962 6.391689,20.019029 l 24.338528,42.073163 c 3.40849,4.452814 5.674917,3.607154 8.509014,-0.23458 L 81.083105,51.075788 C 81.625418,50.0948 82.050328,49.050173 82.421327,47.983517 84.078241,43.936622 85.000002,39.521943 85,34.901534 85,15.718144 69.23988,3.3861402e-7 50.001528,3.3861402e-7 Z m 0,16.35400066138598 c 10.359296,0 18.597616,8.21783 18.597618,18.547533 0,10.329703 -8.238322,18.544487 -18.597618,18.544487 -10.359299,0 -18.600672,-8.214784 -18.600672,-18.544487 0,-10.329703 8.241373,-18.547533 18.600672,-18.547533 z" fill="#5f6368"/></svg>';

      function pinEl() {
        var el = document.createElement('div');
        el.innerHTML = PIN;
        var svg = el.firstChild;
        svg.style.cssText = 'width:27px;height:27px;display:block;' +
          'filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));cursor:pointer;';
        return svg;
      }

      function onClick(e) {
        if (!active) return;
        var lng = e.lngLat.lng;
        var lat = e.lngLat.lat;
        // anchor bottom — остриё капли указывает точно на точку
        var el = pinEl();
        var _id = 'frt-mk-' + map._frtNextId++;
        el.dataset.frtTool = 'marker';
        el.dataset.frtId = _id;
        var mk = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([lng, lat])
          .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML('<small>Маркер</small>'))
          .addTo(map);
        mk._frtId = _id;
        if (!map._frtMarkerMarkers) map._frtMarkerMarkers = [];
        map._frtMarkerMarkers.push(mk);
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
        hintEl.textContent = 'Кликните на карте, чтобы поставить маркер';
        hintEl.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);' +
          'background:rgba(0,0,0,.7);color:#fff;padding:4px 12px;border-radius:6px;' +
          'font:13px sans-serif;pointer-events:none;z-index:99;';
        map.getContainer().appendChild(hintEl);
        map.on('click', onClick);
      }

      // иконка кнопки — заимствована из terra-draw add-marker-button (капля-пин)
      var btnEl = btn('Поставить маркер', '<svg viewBox="0 0 100 100" width="20" height="20" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:2px auto;">' +
        '<path d="M 50.001528,3.3861402e-7 C 30.763177,3.3861402e-7 15,15.718144 15,34.901534 c 0,7.432782 2.373565,14.339962 6.391689,20.019029 l 24.338528,42.073163 c 3.40849,4.452814 5.674917,3.607154 8.509014,-0.23458 L 81.083105,51.075788 C 81.625418,50.0948 82.050328,49.050173 82.421327,47.983517 84.078241,43.936622 85.000002,39.521943 85,34.901534 85,15.718144 69.23988,3.3861402e-7 50.001528,3.3861402e-7 Z m 0,16.35400066138598 c 10.359296,0 18.597616,8.21783 18.597618,18.547533 0,10.329703 -8.238322,18.544487 -18.597618,18.544487 -10.359299,0 -18.600672,-8.214784 -18.600672,-18.544487 0,-10.329703 8.241373,-18.547533 18.600672,-18.547533 z" fill="#5f6368"/></svg>', function () {
        activate();
        btnEl.classList.toggle('maplibregl-ctrl-active');
      });

      // публичный API (по аналогии с frtGetPoints)
      if (!window.MapsRender.frtGetMarkers) {
        window.MapsRender.frtGetMarkers = function (map) {
          if (!map || !map._frtMarkerMarkers) return [];
          return map._frtMarkerMarkers.map(function (mk) {
            var ll = mk.getLngLat();
            return { lng: ll.lng, lat: ll.lat, _frtId: mk._frtId };
          });
        };
        window.MapsRender.frtClearMarkers = function (map) {
          if (!map || !map._frtMarkerMarkers) return;
          map._frtMarkerMarkers.forEach(function (m) { m.remove(); });
          map._frtMarkerMarkers = [];
        };
        window.MapsRender.frtSetMarkers = function (map, markers) {
          if (!map) return;
          window.MapsRender.frtClearMarkers(map);
          (markers || []).forEach(function (p) {
            var el = pinEl();
            var _id = 'frt-mk-' + map._frtNextId++;
            el.dataset.frtTool = 'marker';
            el.dataset.frtId = _id;
            var mk = new maplibregl.Marker({ element: el, anchor: 'bottom' })
              .setLngLat([p.lng, p.lat])
              .addTo(map);
            mk._frtId = _id;
            map._frtMarkerMarkers.push(mk);
          });
        };
      }
      return btnEl;
    }

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
            properties: { text: t, _frtId: 'frt-txt-' + map._frtNextId++ }
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
      return btnEl;
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
      // публичный API (для интеграций/тестов): активировать + добавить точку
      const api = {
        activate: activate,
        deactivate: deactivate,
        toggle: toggle,
        addPoint: function (lnglat) { if (!active.is) activate(); coords.push([lnglat.lng, lnglat.lat]); update(); },
        reset: function () { coords.length = 0; update(); },
      };
      if (!map._frtRuler) map._frtRuler = api;
      return btnEl;
    }

    // ── Линия на карту (linestring) — своя, по мотивам terra-draw linestring ──
    // Клики ставят вершины → рисуется ломаная (LineString). Двойной клик или
    // повторный клик по кнопке завершает линию. БЕЗ подписей расстояний
    // (в отличие от Линейки — там измерения). Стили из terra-draw
    // defaultMeasureControlOptions: lineStringColor #666666 width 2,
    // closingPoint белый с серой обводкой #666666.
    function makeLineStringTool(map, ctrlPos) {
      if (map._frtLineStringDone) return;
      map._frtLineStringDone = true;

      var active = { is: false };
      var features = []; // завершённые линии
      var coords = []; // [[lng,lat], …]
      var L = { line: 'frt-linestring-line', pts: 'frt-linestring-points' };
      var S = { line: 'frt-linestring-line-src', pts: 'frt-linestring-points-src' };

      var btnEl = btn('Линия', '<svg viewBox="0 0 100 100" width="23" height="23" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:2px auto;">' +
        '<path d="M 32.550781 11 C 25.66107 11 20 16.66107 20 23.550781 C 20 27.437229 21.802247 30.929893 24.609375 33.238281 L 14.482422 54.166016 C 13.851157 54.066215 13.209283 54 12.550781 54 C 5.66107 54 -2.2838852e-07 59.66107 0 66.550781 C -2.283885e-07 73.440493 5.6610701 79.09961 12.550781 79.099609 C 19.201807 79.099609 24.655831 73.811706 25.029297 67.248047 A 3.5 3.5 0 0 0 25.099609 66.550781 A 3.5 3.5 0 0 0 25.029297 65.853516 C 24.833675 62.412816 23.233085 59.332019 20.804688 57.169922 L 31.048828 36 C 31.542777 36.060026 32.041623 36.099609 32.550781 36.099609 C 37.164226 36.09961 41.197796 33.554133 43.363281 29.804688 L 61.169922 34.511719 C 62.104293 40.357275 67.120053 44.895548 73.171875 45.080078 L 80.177734 66.435547 C 77.052276 68.726678 75 72.41156 75 76.550781 C 75 83.440493 80.66107 89.09961 87.550781 89.099609 C 94.201808 89.09961 99.655828 83.811706 100.0293 77.248047 A 3.5 3.5 0 0 0 100.09961 76.550781 A 3.5 3.5 0 0 0 100.0293 75.853516 C 99.656101 69.289604 94.201991 64 87.550781 64 C 87.283728 64 87.022869 64.02231 86.759766 64.039062 L 79.955078 43.296875 C 83.40598 41.206484 85.787338 37.500471 86.029297 33.248047 A 3.5 3.5 0 0 0 86.099609 32.550781 A 3.5 3.5 0 0 0 86.029297 31.853516 C 85.656104 25.289604 80.201991 20 73.550781 20 C 68.451047 20 64.032035 23.105987 62.076172 27.511719 L 45.056641 23.011719 A 3.5 3.5 0 0 0 45.029297 22.853516 C 44.656104 16.289604 39.201991 11 32.550781 11 z M 32.550781 18 C 35.657412 18 38.099609 20.444151 38.099609 23.550781 C 38.099609 26.657412 35.657412 29.099609 32.550781 29.099609 C 29.444151 29.099609 27 26.657412 27 23.550781 C 27 20.444151 29.444151 18 32.550781 18 z M 73.550781 27 C 76.657412 27 79.099609 29.444151 79.099609 32.550781 C 79.099609 35.657412 76.657412 38.099609 73.550781 38.099609 C 70.444151 38.099609 68 35.657412 68 32.550781 C 68 29.444151 70.444151 27 73.550781 27 z M 12.550781 61 C 15.657411 61 18.099609 63.444151 18.099609 66.550781 C 18.099609 69.657411 15.657411 72.099609 12.550781 72.099609 C 9.444151 72.099609 6.9999999 69.657412 7 66.550781 C 6.9999999 63.444151 9.444151 61 12.550781 61 z M 87.550781 71 C 90.657412 71 93.099609 73.444151 93.099609 76.550781 C 93.099609 79.657412 90.657412 82.099609 87.550781 82.099609 C 84.444151 82.099609 82 79.657412 82 76.550781 C 82 73.444151 84.444151 71 87.550781 71 z" fill="#5f6368"/></svg>',
        function () { toggle(); });

      function lineFC() {
        var all = features.slice();
        if (coords.length > 1) {
          all.push({ type: 'Feature', id: '_current', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
        }
        return { type: 'FeatureCollection', features: all };
      }
      function pointsFC() {
        return {
          type: 'FeatureCollection',
          features: coords.map(function (c, i) {
            return { type: 'Feature', id: '_pts_' + i, properties: {}, geometry: { type: 'Point', coordinates: c } };
          })
        };
      }
      function ensureLayers() {
        if (!map.getSource(S.line)) map.addSource(S.line, { type: 'geojson', data: lineFC() });
        if (!map.getSource(S.pts)) map.addSource(S.pts, { type: 'geojson', data: pointsFC() });
        if (!map.getLayer(L.line)) {
          map.addLayer({ id: L.line, type: 'line', source: S.line,
            paint: { 'line-color': '#666666', 'line-width': 2 } });
        }
        if (!map.getLayer(L.pts)) {
          map.addLayer({ id: L.pts, type: 'circle', source: S.pts,
            paint: { 'circle-radius': 3, 'circle-color': '#FFFFFF',
              'circle-stroke-width': 1, 'circle-stroke-color': '#666666' } });
        }
      }
      function update() {
        if (!map.isStyleLoaded()) { map.once('style.load', update); return; }
        ensureLayers();
        var ls = map.getSource(S.line); if (ls) ls.setData(lineFC());
        var ps = map.getSource(S.pts); if (ps) ps.setData(pointsFC());
      }
      function mapClick(e) {
        if (!active.is) return;
        coords.push([e.lngLat.lng, e.lngLat.lat]);
        update();
      }
      function mapDblClick(e) {
        if (!active.is) return;
        // убираем лишнюю вершину от dblclick-клика
        if (coords.length) coords.pop();
        commit();
        update();
        deactivate();
      }
      function commit() {
        if (coords.length > 1) {
          features.push({ type: 'Feature', properties: { _frtId: 'frt-' + map._frtNextId++ }, geometry: { type: 'LineString', coordinates: coords.slice() } });
        }
        coords.length = 0;
      }
      function activate() {
        active.is = true;
        map.getCanvas().style.cursor = 'crosshair';
        if (map.doubleClickZoom) map.doubleClickZoom.disable();
        map.on('click', mapClick);
        map.on('dblclick', mapDblClick);
        update();
        btnEl.classList.add('maplibregl-ctrl-active');
      }
      function deactivate() {
        active.is = false;
        map.getCanvas().style.cursor = '';
        if (map.doubleClickZoom) map.doubleClickZoom.enable();
        map.off('click', mapClick);
        map.off('dblclick', mapDblClick);
        if (coords.length) { commit(); update(); }
        btnEl.classList.remove('maplibregl-ctrl-active');
      }
      function toggle() { active.is ? deactivate() : activate(); }
      map.on('style.load', function () { if (active.is) update(); });
      var api = {
        activate: activate, deactivate: deactivate, toggle: toggle,
        addPoint: function (lnglat) { if (!active.is) activate(); coords.push([lnglat.lng, lnglat.lat]); update(); },
        reset: function () { features.length = 0; coords.length = 0; update(); },
        getFeatures: function () { return features.slice(); },
        removeById: function (id) {
          for (var i = 0; i < features.length; i++) {
            if (features[i].properties._frtId === id) { features.splice(i, 1); update(); return true; }
          }
          return false;
        },
        getById: function (id) { for (var i = 0; i < features.length; i++) { if (features[i].properties && features[i].properties._frtId === id) return features[i]; } return null; },
        restore: function (obj) { if (obj) { features.push(obj); update(); } }
      };
      if (!map._frtLineString) map._frtLineString = api;
      return btnEl;
    }

    // ── Полигон на карту (polygon) — своя, по мотивам terra-draw polygon ──
    // Клики ставят вершины, двойной клик замыкает полигон.
    // Стили из terra-draw defaultMeasureControlOptions:
    // fillColor #EDEFF0, fillOpacity 0.7, outlineColor #666666 outlineWidth 2,
    // closingPoint #FAFAFA с обводкой #666666.
    function makePolygonTool(map, ctrlPos) {
      if (map._frtPolygonDone) return;
      map._frtPolygonDone = true;

      var active = { is: false };
      var features = []; // завершённые полигоны
      var coords = []; // текущие вершины [[lng,lat], …]
      var L = { fill: 'frt-polygon-fill', outline: 'frt-polygon-outline', pts: 'frt-polygon-points' };
      var S = { fill: 'frt-polygon-fill-src', pts: 'frt-polygon-points-src' };

      // иконка — полигон с вершинами (заимствована из terra-draw polygon.svg)
      var btnEl = btn('Полигон', '<svg viewBox="0 0 100 100" width="23" height="23" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:2px auto;">' +
        '<polygon points="35,70 15,40 35,20 70,20 88,45 75,75" fill="none" stroke="#5f6368" stroke-width="4" stroke-linejoin="round"/>' +
        '<circle cx="35" cy="70" r="5" fill="#5f6368"/>' +
        '<circle cx="15" cy="40" r="5" fill="#5f6368"/>' +
        '<circle cx="35" cy="20" r="5" fill="#5f6368"/>' +
        '<circle cx="70" cy="20" r="5" fill="#5f6368"/>' +
        '<circle cx="88" cy="45" r="5" fill="#5f6368"/>' +
        '<circle cx="75" cy="75" r="5" fill="#5f6368"/></svg>',
        function () { toggle(); });

      function fc() {
        var all = features.slice();
        if (coords.length > 2) {
          var ring = coords.concat([coords[0]]);
          all.push({ type: 'Feature', id: '_current', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } });
        }
        return { type: 'FeatureCollection', features: all };
      }
      function pointsFC() {
        return {
          type: 'FeatureCollection',
          features: coords.map(function (c, i) {
            return { type: 'Feature', id: '_pts_' + i, properties: {}, geometry: { type: 'Point', coordinates: c } };
          })
        };
      }
      function ensureLayers() {
        if (!map.getSource(S.fill)) map.addSource(S.fill, { type: 'geojson', data: fc() });
        if (!map.getSource(S.pts)) map.addSource(S.pts, { type: 'geojson', data: pointsFC() });
        if (!map.getLayer(L.fill)) {
          map.addLayer({ id: L.fill, type: 'fill', source: S.fill,
            paint: { 'fill-color': '#EDEFF0', 'fill-opacity': 0.7 } });
        }
        if (!map.getLayer(L.outline)) {
          map.addLayer({ id: L.outline, type: 'line', source: S.fill,
            paint: { 'line-color': '#666666', 'line-width': 2 } });
        }
        if (!map.getLayer(L.pts)) {
          map.addLayer({ id: L.pts, type: 'circle', source: S.pts,
            paint: { 'circle-radius': 3, 'circle-color': '#FAFAFA',
              'circle-stroke-width': 1, 'circle-stroke-color': '#666666' } });
        }
      }
      function update() {
        if (!map.isStyleLoaded()) { map.once('style.load', update); return; }
        ensureLayers();
        var fs = map.getSource(S.fill); if (fs) fs.setData(fc());
        var ps = map.getSource(S.pts); if (ps) ps.setData(pointsFC());
      }
      function commit() {
        if (coords.length > 2) {
          var ring = coords.slice();
          ring.push(ring[0]);
          features.push({ type: 'Feature', properties: { _frtId: 'frt-' + map._frtNextId++ }, geometry: { type: 'Polygon', coordinates: [ring] } });
        }
        coords.length = 0;
      }
      function mapClick(e) {
        if (!active.is) return;
        coords.push([e.lngLat.lng, e.lngLat.lat]);
        update();
      }
      function mapDblClick(e) {
        if (!active.is) return;
        if (coords.length) coords.pop();
        commit();
        update();
        deactivate();
      }
      function activate() {
        active.is = true;
        map.getCanvas().style.cursor = 'crosshair';
        if (map.doubleClickZoom) map.doubleClickZoom.disable();
        map.on('click', mapClick);
        map.on('dblclick', mapDblClick);
        update();
        btnEl.classList.add('maplibregl-ctrl-active');
      }
      function deactivate() {
        active.is = false;
        map.getCanvas().style.cursor = '';
        if (map.doubleClickZoom) map.doubleClickZoom.enable();
        map.off('click', mapClick);
        map.off('dblclick', mapDblClick);
        if (coords.length) { commit(); update(); }
        btnEl.classList.remove('maplibregl-ctrl-active');
      }
      function toggle() { active.is ? deactivate() : activate(); }
      map.on('style.load', function () { if (active.is) update(); });

      var api = {
        activate: activate, deactivate: deactivate, toggle: toggle,
        addPoint: function (lnglat) { if (!active.is) activate(); coords.push([lnglat.lng, lnglat.lat]); update(); },
        reset: function () { features.length = 0; coords.length = 0; update(); },
        getFeatures: function () { return features.slice(); },
        removeById: function (id) {
          for (var i = 0; i < features.length; i++) {
            if (features[i].properties._frtId === id) { features.splice(i, 1); update(); return true; }
          }
          return false;
        },
        getById: function (id) { for (var i = 0; i < features.length; i++) { if (features[i].properties && features[i].properties._frtId === id) return features[i]; } return null; },
        restore: function (obj) { if (obj) { features.push(obj); update(); } }
      };
      if (!map._frtPolygon) map._frtPolygon = api;
      return btnEl;
    }

    // ── Прямоугольник (rectangle) — pointerdown/pointermove/pointerup ──
    // MapLibre GL использует PointerEvents для dragPan, не MouseEvents.
    // Поэтому mousedown/capture не перехватывает pointerdown MapLibre.
    // Используем pointerdown на canvas (capture) + pointermove/pointerup
    // на document — так перехватываем до MapLibre.
    // Координаты через unproject + getBoundingClientRect.
    // Стили: fill #EDEFF0 / 0.7, outline #666666 / 2.
    function makeRectangleTool(map, ctrlPos) {
      if (map._frtRectDone) return;
      map._frtRectDone = true;

      var active = { is: false };
      var features = [];
      var dragStart = null;
      var dragCurrent = null;

      var L = { fill: 'frt-rect-fill', outline: 'frt-rect-outline' };
      var S = { fill: 'frt-rect-fill-src' };

      var btnEl = btn('Прямоугольник', '<svg viewBox="0 0 100 100" width="23" height="23" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:2px auto;">' +
        '<rect x="15" y="15" width="70" height="70" rx="12" fill="none" stroke="#5f6368" stroke-width="4"/>' +
        '<circle cx="20" cy="20" r="5" fill="#5f6368"/>' +
        '<circle cx="80" cy="80" r="5" fill="#5f6368"/></svg>',
        function () { toggle(); });

      function makeRectFeat(f) {
        if (!f || !f.c || !f.d) return null;
        var minX = Math.min(f.c.lng, f.d.lng), maxX = Math.max(f.c.lng, f.d.lng);
        var minY = Math.min(f.c.lat, f.d.lat), maxY = Math.max(f.c.lat, f.d.lat);
        var feat = {
          type: 'Feature', properties: {},
          geometry: { type: 'Polygon', coordinates: [[
            [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]
          ]]}
        };
        if (f._frtId) feat.properties._frtId = f._frtId;
        return feat;
      }

      function fc() {
        var all = features.map(function(f) { return makeRectFeat(f); }).filter(Boolean);
        if (dragStart && dragCurrent) {
          var cur = makeRectFeat({ c: dragStart, d: dragCurrent });
          if (cur) { cur.id = '_current'; all.push(cur); }
        }
        return { type: 'FeatureCollection', features: all };
      }

      function ensureLayers() {
        if (!map.getSource(S.fill)) map.addSource(S.fill, { type: 'geojson', data: fc() });
        if (!map.getLayer(L.fill)) {
          map.addLayer({ id: L.fill, type: 'fill', source: S.fill,
            paint: { 'fill-color': '#EDEFF0', 'fill-opacity': 0.7 } });
        }
        if (!map.getLayer(L.outline)) {
          map.addLayer({ id: L.outline, type: 'line', source: S.fill,
            paint: { 'line-color': '#666666', 'line-width': 2 } });
        }
      }

      function update() {
        if (!map.isStyleLoaded()) { map.once('style.load', update); return; }
        ensureLayers();
        var s = map.getSource(S.fill);
        if (s) s.setData(fc());
      }

      function rebuild() {
        if (!features.length && !(dragStart && dragCurrent)) return;
        update();
      }
      map.on('style.load', rebuild);
      if (map.isStyleLoaded && map.isStyleLoaded()) rebuild();

      function pointLngLat(e) {
        var r = map.getContainer().getBoundingClientRect();
        return map.unproject([e.clientX - r.left, e.clientY - r.top]);
      }

      var canvas = null;

      function onPointerdown(e) {
        if (!active.is) return;
        if (e.button !== 0) return;
        // preventDefault + capture — единственный способ блокировать
        // pointerdown MapLibre (dragPan.disable не всегда срабатывает)
        e.preventDefault();
        var ll = pointLngLat(e);
        dragStart = { lng: ll.lng, lat: ll.lat };
        dragCurrent = { lng: ll.lng, lat: ll.lat };
        document.addEventListener('pointermove', onPointermove);
        document.addEventListener('pointerup', onPointerup);
        update();
      }

      function onPointermove(e) {
        if (!active.is || !dragStart) return;
        e.preventDefault();
        var ll = pointLngLat(e);
        dragCurrent = { lng: ll.lng, lat: ll.lat };
        update();
      }

      function onPointerup(e) {
        if (!active.is || !dragStart) return;
        document.removeEventListener('pointermove', onPointermove);
        document.removeEventListener('pointerup', onPointerup);
        var ll = pointLngLat(e);
        dragCurrent = { lng: ll.lng, lat: ll.lat };
        // клик без перетаскивания — игнор
        if (dragStart.lng === dragCurrent.lng && dragStart.lat === dragCurrent.lat) {
          dragStart = null; dragCurrent = null;
          update();
          return;
        }
        var _id = 'frt-' + map._frtNextId++;
        features.push({ _frtId: _id, c: dragStart, d: dragCurrent });
        dragStart = null;
        dragCurrent = null;
        update();
      }

      function activate() {
        active.is = true;
        map.getCanvas().style.cursor = 'crosshair';
        if (map.doubleClickZoom) map.doubleClickZoom.disable();
        if (map.dragPan) map.dragPan.disable();
        canvas = map.getCanvas();
        // pointerdown с capture=true перехватывает до MapLibre
        canvas.addEventListener('pointerdown', onPointerdown, true);
        btnEl.classList.add('maplibregl-ctrl-active');
      }

      function deactivate() {
        active.is = false;
        map.getCanvas().style.cursor = '';
        if (map.doubleClickZoom) map.doubleClickZoom.enable();
        if (map.dragPan) map.dragPan.enable();
        document.removeEventListener('pointermove', onPointermove);
        document.removeEventListener('pointerup', onPointerup);
        if (canvas) canvas.removeEventListener('pointerdown', onPointerdown, true);
        btnEl.classList.remove('maplibregl-ctrl-active');
      }

      function toggle() { active.is ? deactivate() : activate(); }

      var api = {
        activate: activate, deactivate: deactivate, toggle: toggle,
        reset: function () { features.length = 0; dragStart = null; dragCurrent = null; update(); },
        getFeatures: function () { return features.slice(); },
        removeById: function (id) {
          for (var i = 0; i < features.length; i++) {
            if (features[i]._frtId === id) { features.splice(i, 1); update(); return true; }
          }
          return false;
        },
        getById: function (id) { for (var i = 0; i < features.length; i++) { if (features[i]._frtId === id) return features[i]; } return null; },
        restore: function (obj) { if (obj) { features.push(obj); update(); } }
      };
      if (!map._frtRectangle) map._frtRectangle = api;
      return btnEl;
    }

    // ── Круг (circle) — pointerdown/pointermove/pointerup ──
    // Drag от центра (pointerdown) до края (pointerup). Аппроксимируется
    // полигоном из 64 сегментов. Как rectangle, но геометрия — круг.
    // Стили: fill #EDEFF0 / 0.7, outline #666666 / 2.
    function makeCircleTool(map, ctrlPos) {
      if (map._frtCircleDone) return;
      map._frtCircleDone = true;

      var active = { is: false };
      var features = [];
      var dragStart = null;
      var dragCurrent = null;

      var L = { fill: 'frt-circle-fill', outline: 'frt-circle-outline' };
      var S = { fill: 'frt-circle-fill-src' };

      var btnEl = btn('Круг', '<svg viewBox="0 0 100 100" width="23" height="23" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:2px auto;">' +
        '<circle cx="50" cy="50" r="38" fill="none" stroke="#5f6368" stroke-width="4"/>' +
        '<line x1="35" y1="50" x2="65" y2="50" stroke="#5f6368" stroke-width="2"/>' +
        '<line x1="50" y1="35" x2="50" y2="65" stroke="#5f6368" stroke-width="2"/></svg>',
        function () { toggle(); });

      function makeCircleFeat(f) {
        if (!f || !f.c || f.r == null) return null;
        var c = f.c, r = f.r;
        var seg = 64;
        var latRad = c.lat * Math.PI / 180;
        var cosLat = Math.cos(latRad);
        var ring = [];
        for (var i = 0; i <= seg; i++) {
          var a = (2 * Math.PI * i) / seg;
          var dx = r * Math.cos(a) / cosLat;
          var dy = r * Math.sin(a);
          ring.push([c.lng + dx, c.lat + dy]);
        }
        var feat = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
        if (f._frtId) feat.properties._frtId = f._frtId;
        return feat;
      }

      function radius() {
        if (!dragStart || !dragCurrent) return null;
        var latRad = (dragStart.lat + dragCurrent.lat) / 2 * Math.PI / 180;
        var cosLat = Math.cos(latRad);
        var dlng = (dragCurrent.lng - dragStart.lng) * cosLat;
        var dlat = dragCurrent.lat - dragStart.lat;
        return Math.sqrt(dlng * dlng + dlat * dlat);
      }

      function fc() {
        var all = features.filter(function(f) { return f.c != null; })
          .map(function(f) { return makeCircleFeat(f); }).filter(Boolean);
        var r = radius();
        if (dragStart && r != null && r > 0) {
          var cur = makeCircleFeat({ c: dragStart, r: r });
          if (cur) { cur.id = '_current'; all.push(cur); }
        }
        return { type: 'FeatureCollection', features: all };
      }

      function ensureLayers() {
        if (!map.getSource(S.fill)) map.addSource(S.fill, { type: 'geojson', data: fc() });
        if (!map.getLayer(L.fill)) {
          map.addLayer({ id: L.fill, type: 'fill', source: S.fill,
            paint: { 'fill-color': '#EDEFF0', 'fill-opacity': 0.7 } });
        }
        if (!map.getLayer(L.outline)) {
          map.addLayer({ id: L.outline, type: 'line', source: S.fill,
            paint: { 'line-color': '#666666', 'line-width': 2 } });
        }
      }

      function update() {
        if (!map.isStyleLoaded()) { map.once('style.load', update); return; }
        ensureLayers();
        var s = map.getSource(S.fill);
        if (s) s.setData(fc());
      }

      function rebuild() {
        if (!features.length && !(dragStart && dragCurrent)) return;
        update();
      }
      map.on('style.load', rebuild);
      if (map.isStyleLoaded && map.isStyleLoaded()) rebuild();

      function pointLngLat(e) {
        var r = map.getContainer().getBoundingClientRect();
        return map.unproject([e.clientX - r.left, e.clientY - r.top]);
      }

      var canvas = null;

      function onPointerdown(e) {
        if (!active.is) return;
        if (e.button !== 0) return;
        e.preventDefault();
        var ll = pointLngLat(e);
        dragStart = { lng: ll.lng, lat: ll.lat };
        dragCurrent = { lng: ll.lng, lat: ll.lat };
        document.addEventListener('pointermove', onPointermove);
        document.addEventListener('pointerup', onPointerup);
        update();
      }

      function onPointermove(e) {
        if (!active.is || !dragStart) return;
        e.preventDefault();
        var ll = pointLngLat(e);
        dragCurrent = { lng: ll.lng, lat: ll.lat };
        update();
      }

      function onPointerup(e) {
        if (!active.is || !dragStart) return;
        document.removeEventListener('pointermove', onPointermove);
        document.removeEventListener('pointerup', onPointerup);
        var ll = pointLngLat(e);
        dragCurrent = { lng: ll.lng, lat: ll.lat };
        var r = radius();
        // клик без перетаскивания — игнор
        if (r == null || r === 0) {
          dragStart = null; dragCurrent = null;
          update();
          return;
        }
        var _id2 = 'frt-' + map._frtNextId++;
        features.push({ _frtId: _id2, c: dragStart, r: r });
        dragStart = null;
        dragCurrent = null;
        update();
      }

      function activate() {
        active.is = true;
        map.getCanvas().style.cursor = 'crosshair';
        if (map.doubleClickZoom) map.doubleClickZoom.disable();
        if (map.dragPan) map.dragPan.disable();
        canvas = map.getCanvas();
        canvas.addEventListener('pointerdown', onPointerdown, true);
        btnEl.classList.add('maplibregl-ctrl-active');
      }

      function deactivate() {
        active.is = false;
        map.getCanvas().style.cursor = '';
        if (map.doubleClickZoom) map.doubleClickZoom.enable();
        if (map.dragPan) map.dragPan.enable();
        document.removeEventListener('pointermove', onPointermove);
        document.removeEventListener('pointerup', onPointerup);
        if (canvas) canvas.removeEventListener('pointerdown', onPointerdown, true);
        btnEl.classList.remove('maplibregl-ctrl-active');
      }

      function toggle() { active.is ? deactivate() : activate(); }

      var api = {
        activate: activate, deactivate: deactivate, toggle: toggle,
        reset: function () { features.length = 0; dragStart = null; dragCurrent = null; update(); },
        getFeatures: function () { return features.slice(); },
        removeById: function (id) {
          for (var i = 0; i < features.length; i++) {
            if (features[i]._frtId === id) { features.splice(i, 1); update(); return true; }
          }
          return false;
        },
        getById: function (id) { for (var i = 0; i < features.length; i++) { if (features[i]._frtId === id) return features[i]; } return null; },
        restore: function (obj) { if (obj) { features.push(obj); update(); } }
      };
      if (!map._frtCircle) map._frtCircle = api;
      return btnEl;
    }

    // ── Freehand (рисование от руки, полигон) ──
    // pointerdown → собираем точки по pointermove → pointerup → фиксируем
    // как полигон. Накопительный, слои не удаляются при deactivate.
    // Стили: fill #EDEFF0 / 0.7, outline #666666 / 2.
    function makeFreehandTool(map, ctrlPos) {
      if (map._frtFreehandDone) return;
      map._frtFreehandDone = true;

      var active = { is: false };
      var features = [];
      var currentPoints = null;

      var L = { fill: 'frt-freehand-fill', outline: 'frt-freehand-outline' };
      var S = { fill: 'frt-freehand-fill-src' };

      var btnEl = btn('От руки', '<svg viewBox="0 -960 960 960" width="23" height="23" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:2px auto;">' +
        '<path d="M160-120v-170l527-526q12-12 27-18t30-6q16 0 30.5 6t25.5 18l56 56q12 11 18 25.5t6 30.5q0 15-6 30t-18 27L330-120H160Zm80-80h56l393-392-28-29-29-28-392 393v56Zm560-503-57-57 57 57Zm-139 82-29-28 57 57-28-29ZM560-120q74 0 137-37t63-103q0-36-19-62t-51-45l-59 59q23 10 36 22t13 26q0 23-36.5 41.5T560-200q-17 0-28.5 11.5T520-160q0 17 11.5 28.5T560-120ZM183-426l60-60q-20-8-31.5-16.5T200-520q0-12 18-24t76-37q88-38 117-69t29-70q0-55-44-87.5T280-840q-45 0-80.5 16T145-785q-11 13-9 29t15 26q13 11 29 9t27-13q14-14 31-20t42-6q41 0 60.5 12t19.5 28q0 14-17.5 25.5T262-654q-80 35-111 63.5T120-520q0 32 17 54.5t46 39.5Z" fill="#5f6368"/></svg>',
        function () { toggle(); });

      function makePolyFeat(f) {
        var pts = f.pts || f;
        if (!pts || pts.length < 3) return null;
        var ring = pts.slice();
        ring.push(ring[0]); // замкнуть
        var feat = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
        if (f._frtId) feat.properties._frtId = f._frtId;
        return feat;
      }

      function fc() {
        var all = features.map(function(f) { return makePolyFeat(f); }).filter(Boolean);
        if (currentPoints && currentPoints.length >= 3) {
          var cur = makePolyFeat(currentPoints);
          if (cur) { cur.id = '_current'; all.push(cur); }
        }
        return { type: 'FeatureCollection', features: all };
      }

      function ensureLayers() {
        if (!map.getSource(S.fill)) map.addSource(S.fill, { type: 'geojson', data: fc() });
        if (!map.getLayer(L.fill)) {
          map.addLayer({ id: L.fill, type: 'fill', source: S.fill,
            paint: { 'fill-color': '#EDEFF0', 'fill-opacity': 0.7 } });
        }
        if (!map.getLayer(L.outline)) {
          map.addLayer({ id: L.outline, type: 'line', source: S.fill,
            paint: { 'line-color': '#666666', 'line-width': 2 } });
        }
      }

      function update() {
        if (!map.isStyleLoaded()) { map.once('style.load', update); return; }
        ensureLayers();
        var s = map.getSource(S.fill);
        if (s) s.setData(fc());
      }

      function rebuild() {
        if (!features.length && !(currentPoints && currentPoints.length >= 3)) return;
        update();
      }
      map.on('style.load', rebuild);
      if (map.isStyleLoaded && map.isStyleLoaded()) rebuild();

      function pointLngLat(e) {
        var r = map.getContainer().getBoundingClientRect();
        return map.unproject([e.clientX - r.left, e.clientY - r.top]);
      }

      var canvas = null;

      function onPointerdown(e) {
        if (!active.is) return;
        if (e.button !== 0) return;
        e.preventDefault();
        var ll = pointLngLat(e);
        currentPoints = [[ll.lng, ll.lat]];
        document.addEventListener('pointermove', onPointermove);
        document.addEventListener('pointerup', onPointerup);
        update();
      }

      function onPointermove(e) {
        if (!active.is || !currentPoints) return;
        e.preventDefault();
        var ll = pointLngLat(e);
        currentPoints.push([ll.lng, ll.lat]);
        update();
      }

      function onPointerup(e) {
        if (!active.is || !currentPoints) return;
        document.removeEventListener('pointermove', onPointermove);
        document.removeEventListener('pointerup', onPointerup);
        var ll = pointLngLat(e);
        currentPoints.push([ll.lng, ll.lat]);
        // слишком мало точек — клик, не фигура
        if (currentPoints.length < 3) {
          currentPoints = null;
          update();
          return;
        }
        var _id3 = 'frt-' + map._frtNextId++;
        features.push({ _frtId: _id3, pts: currentPoints.slice() });
        currentPoints = null;
        update();
      }

      function activate() {
        active.is = true;
        map.getCanvas().style.cursor = 'crosshair';
        if (map.doubleClickZoom) map.doubleClickZoom.disable();
        if (map.dragPan) map.dragPan.disable();
        canvas = map.getCanvas();
        canvas.addEventListener('pointerdown', onPointerdown, true);
        btnEl.classList.add('maplibregl-ctrl-active');
      }

      function deactivate() {
        active.is = false;
        map.getCanvas().style.cursor = '';
        if (map.doubleClickZoom) map.doubleClickZoom.enable();
        if (map.dragPan) map.dragPan.enable();
        document.removeEventListener('pointermove', onPointermove);
        document.removeEventListener('pointerup', onPointerup);
        if (canvas) canvas.removeEventListener('pointerdown', onPointerdown, true);
        btnEl.classList.remove('maplibregl-ctrl-active');
      }

      function toggle() { active.is ? deactivate() : activate(); }

      var api = {
        activate: activate, deactivate: deactivate, toggle: toggle,
        reset: function () { features.length = 0; currentPoints = null; update(); },
        getFeatures: function () { return features.slice(); },
        removeById: function (id) {
          for (var i = 0; i < features.length; i++) {
            if (features[i]._frtId === id) { features.splice(i, 1); update(); return true; }
          }
          return false;
        },
        getById: function (id) { for (var i = 0; i < features.length; i++) { if (features[i]._frtId === id) return features[i]; } return null; },
        restore: function (obj) { if (obj) { features.push(obj); update(); } }
      };
      if (!map._frtFreehand) map._frtFreehand = api;
      return btnEl;
    }

    // ── Angled-Rectangle (повёрнутый прямоугольник, 3 клика) ──
    // Клик 1: угол A. Клик 2: сторона AB (длина+направление).
    // Клик 3: перпендикуляр от C к AB → высота → прямоугольник.
    // Click-based как polygon. Стили: fill #EDEFF0 / 0.7, outline #666666 / 2.
    function makeAngledRectTool(map, ctrlPos) {
      if (map._frtAngledRectDone) return;
      map._frtAngledRectDone = true;

      var active = { is: false };
      var features = [];
      var pts = []; // [lng, lat][]

      var L = { fill: 'frt-angled-fill', outline: 'frt-angled-outline', pts: 'frt-angled-points' };
      var S = { fill: 'frt-angled-fill-src', pts: 'frt-angled-points-src' };

      var btnEl = btn('Повёрнутый', '<svg viewBox="0 0 100 100" width="23" height="23" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:2px auto;">' +
        '<path d="M 12.55 15 C 5.66 15 0 20.66 0 27.55 0 33.57 4.32 38.65 10 39.84 L 10 60.26 C 4.32 61.45 0 66.53 0 72.55 0 79.44 5.66 85.1 12.55 85.1 18.6 85.1 23.64 80.73 24.79 75 L 75.25 75 C 76.4 80.73 81.5 85.1 87.55 85.1 94.2 85.1 99.66 79.81 100.03 73.25 100.07 72.68 100.1 72.09 100.1 71.5 100.1 65.55 95.84 60.43 90 59.52 L 90 39.85 C 95.49 38.74 99.7 33.98 100.03 28.25 100.07 27.68 100.1 27.09 100.1 26.5 100.1 20.29 94.2 15 87.55 15 81.53 15 76.46 19.32 75.26 25 L 24.77 25 C 23.58 19.32 18.56 15 12.55 15 Z" fill="#5f6368" fill-opacity="0.7"/></svg>',
        function () { toggle(); });

      function buildRect() {
        if (pts.length < 3) return null;
        var a = pts[0], b = pts[1], c = pts[2];
        // вектор AB
        var abx = b[0] - a[0], aby = b[1] - a[1];
        // вектор AC
        var acx = c[0] - a[0], acy = c[1] - a[1];
        // проекция AC на AB (нормализованная)
        var abLen2 = abx * abx + aby * aby;
        if (abLen2 === 0) return null;
        var t = (acx * abx + acy * aby) / abLen2;
        // перпендикуляр = AC - проекция
        var px = acx - t * abx;
        var py = acy - t * aby;
        // вершины прямоугольника: a, b, b+perp, a+perp
        var d = [a[0] + abx + px, a[1] + aby + py];
        var ring = [a, b, d, [a[0] + px, a[1] + py], a];
        return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
      }

      function fc() {
        var all = features.slice();
        if (pts.length >= 3) {
          var cur = buildRect();
          if (cur) { cur.id = '_current'; all.push(cur); }
        } else if (pts.length === 2) {
          // показываем линию AB
          all.push({ type: 'Feature', id: '_line', properties: {}, geometry: { type: 'LineString', coordinates: [pts[0], pts[1]] } });
        }
        return { type: 'FeatureCollection', features: all };
      }

      function pointsFC() {
        return { type: 'FeatureCollection', features: pts.map(function (c, i) {
          return { type: 'Feature', id: '_apts_' + i, properties: {}, geometry: { type: 'Point', coordinates: c } };
        })};
      }

      function ensureLayers() {
        if (!map.getSource(S.fill)) map.addSource(S.fill, { type: 'geojson', data: fc() });
        if (!map.getSource(S.pts)) map.addSource(S.pts, { type: 'geojson', data: pointsFC() });
        if (!map.getLayer(L.fill)) {
          map.addLayer({ id: L.fill, type: 'fill', source: S.fill,
            paint: { 'fill-color': '#EDEFF0', 'fill-opacity': 0.7 } });
        }
        if (!map.getLayer(L.outline)) {
          map.addLayer({ id: L.outline, type: 'line', source: S.fill,
            paint: { 'line-color': '#666666', 'line-width': 2 } });
        }
        if (!map.getLayer(L.pts)) {
          map.addLayer({ id: L.pts, type: 'circle', source: S.pts,
            paint: { 'circle-radius': 3, 'circle-color': '#FAFAFA',
              'circle-stroke-width': 1, 'circle-stroke-color': '#666666' } });
        }
      }

      function update() {
        if (!map.isStyleLoaded()) { map.once('style.load', update); return; }
        ensureLayers();
        var fs = map.getSource(S.fill); if (fs) fs.setData(fc());
        var ps = map.getSource(S.pts); if (ps) ps.setData(pointsFC());
      }

      function commit() {
        if (pts.length >= 3) {
          var r = buildRect();
          if (r) { r.properties._frtId = 'frt-' + map._frtNextId++; features.push(r); }
        }
        pts.length = 0;
      }

      function mapClick(e) {
        if (!active.is) return;
        pts.push([e.lngLat.lng, e.lngLat.lat]);
        if (pts.length === 3) {
          commit();
          update();
          deactivate();
          return;
        }
        update();
      }

      function activate() {
        active.is = true;
        map.getCanvas().style.cursor = 'crosshair';
        if (map.doubleClickZoom) map.doubleClickZoom.disable();
        map.on('click', mapClick);
        update();
        btnEl.classList.add('maplibregl-ctrl-active');
      }

      function deactivate() {
        active.is = false;
        map.getCanvas().style.cursor = '';
        if (map.doubleClickZoom) map.doubleClickZoom.enable();
        map.off('click', mapClick);
        if (pts.length) { commit(); update(); }
        btnEl.classList.remove('maplibregl-ctrl-active');
      }

      function toggle() { active.is ? deactivate() : activate(); }
      map.on('style.load', function () { if (active.is) update(); });

      var api = {
        activate: activate, deactivate: deactivate, toggle: toggle,
        reset: function () { features.length = 0; pts.length = 0; update(); },
        getFeatures: function () { return features.slice(); },
        removeById: function (id) {
          for (var i = 0; i < features.length; i++) {
            if (features[i].properties._frtId === id) { features.splice(i, 1); update(); return true; }
          }
          return false;
        },
        getById: function (id) { for (var i = 0; i < features.length; i++) { if (features[i].properties && features[i].properties._frtId === id) return features[i]; } return null; },
        restore: function (obj) { if (obj) { features.push(obj); update(); } }
      };
      if (!map._frtAngledRect) map._frtAngledRect = api;
      return btnEl;
    }

    // ── Freehand-LineString (от руки, открытая линия) ──
    // Как freehand, но фигура — LineString (не замкнутый полигон).
    // pointerdown → собираем точки → pointerup → фиксируем.
    // Стили: line #666666 / 2.
    function makeFreehandLineTool(map, ctrlPos) {
      if (map._frtFreehandLineDone) return;
      map._frtFreehandLineDone = true;

      var active = { is: false };
      var features = [];
      var currentPoints = null;

      var L = { line: 'frt-freehandline', pts: 'frt-freehandline-points' };
      var S = { line: 'frt-freehandline-src', pts: 'frt-freehandline-points-src' };

      var btnEl = btn('Линия от руки', '<svg viewBox="0 -960 960 960" width="23" height="23" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:2px auto;">' +
        '<path d="M554-120q-54 0-91-37t-37-89q0-76 61.5-137.5T641-460q-3-36-18-54.5T582-533q-30 0-65 25t-83 82q-78 93-114.5 121T241-277q-51 0-86-38t-35-92q0-54 23.5-110.5T223-653q19-26 28-44t9-29q0-7-2.5-10.5T250-740q-10 0-25 12.5T190-689l-70-71q32-39 65-59.5t65-20.5q46 0 78 32t32 80q0 29-15 64t-50 84q-38 54-56.5 95T220-413q0 17 5.5 26.5T241-377q10 0 17.5-5.5T286-409q13-14 31-34.5t44-50.5q63-75 114-107t107-32q67 0 110 45t49 123h99v100h-99q-8 112-58.5 178.5T554-120Zm2-100q32 0 54-36.5T640-358q-46 11-80 43.5T526-250q0 14 8 22t22 8Z" fill="#5f6368"/></svg>',
        function () { toggle(); });

      function makeLineFeat(f) {
        var pts = f.pts || f;
        if (!pts || pts.length < 2) return null;
        var feat = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } };
        if (f._frtId) feat.properties._frtId = f._frtId;
        return feat;
      }

      function fc() {
        var all = features.map(function(f) { return makeLineFeat(f); }).filter(Boolean);
        if (currentPoints && currentPoints.length >= 2) {
          var cur = makeLineFeat(currentPoints);
          if (cur) { cur.id = '_current'; all.push(cur); }
        }
        return { type: 'FeatureCollection', features: all };
      }

      function ensureLayers() {
        if (!map.getSource(S.line)) map.addSource(S.line, { type: 'geojson', data: fc() });
        if (!map.getLayer(L.line)) {
          map.addLayer({ id: L.line, type: 'line', source: S.line,
            paint: { 'line-color': '#666666', 'line-width': 2 } });
        }
      }

      function update() {
        if (!map.isStyleLoaded()) { map.once('style.load', update); return; }
        ensureLayers();
        var s = map.getSource(S.line);
        if (s) s.setData(fc());
      }

      function rebuild() {
        if (!features.length && !(currentPoints && currentPoints.length >= 2)) return;
        update();
      }
      map.on('style.load', rebuild);
      if (map.isStyleLoaded && map.isStyleLoaded()) rebuild();

      function pointLngLat(e) {
        var r = map.getContainer().getBoundingClientRect();
        return map.unproject([e.clientX - r.left, e.clientY - r.top]);
      }

      var canvas = null;

      function onPointerdown(e) {
        if (!active.is) return;
        if (e.button !== 0) return;
        e.preventDefault();
        var ll = pointLngLat(e);
        currentPoints = [[ll.lng, ll.lat]];
        document.addEventListener('pointermove', onPointermove);
        document.addEventListener('pointerup', onPointerup);
        update();
      }

      function onPointermove(e) {
        if (!active.is || !currentPoints) return;
        e.preventDefault();
        var ll = pointLngLat(e);
        currentPoints.push([ll.lng, ll.lat]);
        update();
      }

      function onPointerup(e) {
        if (!active.is || !currentPoints) return;
        document.removeEventListener('pointermove', onPointermove);
        document.removeEventListener('pointerup', onPointerup);
        var ll = pointLngLat(e);
        currentPoints.push([ll.lng, ll.lat]);
        if (currentPoints.length < 2) {
          currentPoints = null;
          update();
          return;
        }
        var _id5 = 'frt-' + map._frtNextId++;
        features.push({ _frtId: _id5, pts: currentPoints.slice() });
        currentPoints = null;
        update();
      }

      function activate() {
        active.is = true;
        map.getCanvas().style.cursor = 'crosshair';
        if (map.doubleClickZoom) map.doubleClickZoom.disable();
        if (map.dragPan) map.dragPan.disable();
        canvas = map.getCanvas();
        canvas.addEventListener('pointerdown', onPointerdown, true);
        btnEl.classList.add('maplibregl-ctrl-active');
      }

      function deactivate() {
        active.is = false;
        map.getCanvas().style.cursor = '';
        if (map.doubleClickZoom) map.doubleClickZoom.enable();
        if (map.dragPan) map.dragPan.enable();
        document.removeEventListener('pointermove', onPointermove);
        document.removeEventListener('pointerup', onPointerup);
        if (canvas) canvas.removeEventListener('pointerdown', onPointerdown, true);
        btnEl.classList.remove('maplibregl-ctrl-active');
      }

      function toggle() { active.is ? deactivate() : activate(); }

      var api = {
        activate: activate, deactivate: deactivate, toggle: toggle,
        reset: function () { features.length = 0; currentPoints = null; update(); },
        getFeatures: function () { return features.slice(); },
        removeById: function (id) {
          for (var i = 0; i < features.length; i++) {
            if (features[i]._frtId === id) { features.splice(i, 1); update(); return true; }
          }
          return false;
        },
        getById: function (id) { for (var i = 0; i < features.length; i++) { if (features[i]._frtId === id) return features[i]; } return null; },
        restore: function (obj) { if (obj) { features.push(obj); update(); } }
      };
      if (!map._frtFreehandLine) map._frtFreehandLine = api;
      return btnEl;
    }

    function makeToolsPanel(map, ctrlPos) {
      if (map._frtToolsPanelDone) return;
      map._frtToolsPanelDone = true;

      if (!map._frtNextId) map._frtNextId = 1;

      var rulerBtn = makeRuler(map, ctrlPos);
      var textBtn = makeTextTool(map, ctrlPos);
      var pointBtn = makePointTool(map, ctrlPos);
      var markerBtn = makeMarkerTool(map, ctrlPos);
      var lineBtn = makeLineStringTool(map, ctrlPos);
      var polygonBtn = makePolygonTool(map, ctrlPos);
      var rectBtn = makeRectangleTool(map, ctrlPos);
      var circleBtn = makeCircleTool(map, ctrlPos);
      var freehandBtn = makeFreehandTool(map, ctrlPos);
      var angledRectBtn = makeAngledRectTool(map, ctrlPos);
      var freehandLineBtn = makeFreehandLineTool(map, ctrlPos);

      // ── frtManager — Select / Delete / Undo / Redo ──
      // Надстройка над текущими инструментами, не меняет их внутреннюю
      // структуру. Select = queryRenderedFeatures по frt-слоям;
      // Delete = удаляет из features[] того инструмента, которому
      // принадлежит выбранная фича (по _frtId);
      // Undo/Redo через стек.
      if (!map._frtManager) {
        map._frtManager = {
          selectedId: null,
          undoStack: [],
          redoStack: [],
          // запоминаем удалённые фичи для undo
          // удаление: { tool, id, feature }
          _deleted: [],
          _added: [],
        };
      }
      var mgr = map._frtManager;

      // Select — toggle подсветки по клику на фиче
      var selectBtn = btn('Выбрать', '<svg viewBox="0 -960 960 960" width="23" height="23" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:2px auto;">' +
        '<path d="m320-410 79-110h170L320-716v306ZM551-80 406-392 240-160v-720l560 440H516l144 309-109 51ZM399-520Z" fill="#5f6368"/></svg>', function () {
        selectClick();
        selectBtn.classList.toggle('maplibregl-ctrl-active');
      });

      var deleteBtn = btn('Удалить', '<svg viewBox="0 0 24 24" width="23" height="23" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:2px auto;">' +
        '<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4h-3.5z" fill="#5f6368"/></svg>', function () {
        if (mgr.selectedId) { deleteFeature(mgr.selectedId); mgr.selectedId = null; }
      });

      var undoBtn = btn('Отменить', '<svg viewBox="0 0 24 24" width="23" height="23" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:2px auto;">' +
        '<path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" fill="#5f6368"/></svg>', function () { undo(); });

      var redoBtn = btn('Вернуть', '<svg viewBox="0 0 24 24" width="23" height="23" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:2px auto;">' +
        '<path d="M11.5 8c-4.65 0-8.58 3.03-9.97 7.22l2.37.78C5.95 12.31 8.96 10 12.5 10c1.96 0 3.73.72 5.12 1.88L14 15.5h9v-9l-3.6 3.6C16.55 8.99 14.15 8 11.5 8z" fill="#5f6368"/></svg>', function () { redo(); });

      var dlGeoBtn = btn('Скачать GeoJSON', '<svg viewBox="0 0 24 24" width="23" height="23" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
        '<path fill="none" d="M0 0h24v24H0z"/><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>', function () { exportGeoJSON(); });

      // ── Select: click на карте → queryRenderedFeatures по frt-слоям ──
      function selectClick() {
        mgr.selectedId = null;
        map.getCanvas().style.cursor = 'pointer';
        map.once('click', function (e) {
          map.getCanvas().style.cursor = '';
          var oe = e.originalEvent;

          // 1) DOM-объекты (точка / маркер): клик по их элементу с data-frt-id
          if (oe && oe.clientX !== undefined) {
            var hitEl = document.elementFromPoint(oe.clientX, oe.clientY);
            var fid_ = hitEl && (hitEl.dataset ? (hitEl.dataset.frtId || (hitEl.closest && hitEl.closest('[data-frt-id]') && hitEl.closest('[data-frt-id]').dataset.frtId)) : null);
            if (hitEl && hitEl.dataset && hitEl.dataset.frtId) fid_ = hitEl.dataset.frtId;
            if (fid_) {
              mgr.selectedId = fid_;
              // геометрия = точка в координатах объекта
              var g = null;
              if (hitEl.dataset && hitEl.dataset.frtTool === 'point') {
                // найти в _frtPointMarkers по id
                var pts = map._frtPointMarkers || [];
                for (var pi = 0; pi < pts.length; pi++) {
                  if (pts[pi]._frtId === fid_) { var ll = pts[pi].getLngLat(); g = { type: 'Point', coordinates: [ll.lng, ll.lat] }; break; }
                }
              } else if (hitEl.dataset && hitEl.dataset.frtTool === 'marker') {
                var mks = map._frtMarkerMarkers || [];
                for (var mi = 0; mi < mks.length; mi++) {
                  if (mks[mi]._frtId === fid_) { var ll2 = mks[mi].getLngLat(); g = { type: 'Point', coordinates: [ll2.lng, ll2.lat] }; break; }
                }
              }
              if (g) highlightFeature(fid_, g);
              return;
            }
          }

          var layers = map.getStyle().layers || [];
          var frtLayers = [];
          for (var i = 0; i < layers.length; i++) {
            var l = layers[i];
            if (l.id.indexOf('frt-') === 0 && l.id.indexOf('-select') < 0) frtLayers.push(l.id);
          }
          if (!frtLayers.length) { clearHighlight(); return; }
          var feats = map.queryRenderedFeatures(e.point, { layers: frtLayers });
          if (!feats || !feats.length) { clearHighlight(); return; }
          // берём самую верхнюю фичу на клике
          var top = feats[0];
          var fid = top.properties && top.properties._frtId;
          if (!fid) { clearHighlight(); return; }
          mgr.selectedId = fid;
          highlightFeature(fid, top.geometry);
        });
      }

      // ── Undo/Redo (удаления). Запись в стеке = { undo: fn, redo: fn } ──
      function pushUndo(record) {
        mgr.undoStack.push(record);
        if (mgr.undoStack.length > 100) mgr.undoStack.shift();
        mgr.redoStack = [];
      }

      function undo() {
        var rec = mgr.undoStack.pop();
        if (!rec) return;
        clearHighlight();
        mgr.selectedId = null;
        // выполнить отмену (восстановить объект)
        if (rec.undo) rec.undo();
        // положить запись в redoStack
        mgr.redoStack.push({ undo: rec.redo, redo: rec.undo });
      }

      function redo() {
        var rec = mgr.redoStack.pop();
        if (!rec) return;
        clearHighlight();
        mgr.selectedId = null;
        if (rec.undo) rec.undo();
        mgr.undoStack.push({ undo: rec.redo, redo: rec.undo });
      }

      // ── Delete: найти фичу по id и удалить через removeById ──
      function deleteFeature(id) {
        // 1) DOM-точки (_frtPointMarkers)
        if (map._frtPointMarkers) {
          for (var pp = 0; pp < map._frtPointMarkers.length; pp++) {
            var mp = map._frtPointMarkers[pp];
            if (mp._frtId === id) {
              var elP = mp.getElement ? mp.getElement() : null;
              var llP = mp.getLngLat();
              mp.remove();
              map._frtPointMarkers.splice(pp, 1);
              pushUndo({
                undo: (function (theEl, theId, lng, lat) {
                  return function () {
                    var mk = new maplibregl.Marker({ element: theEl }).setLngLat([lng, lat]).addTo(map);
                    mk._frtId = theId;
                    map._frtPointMarkers.push(mk);
                  };
                })(elP, id, llP.lng, llP.lat),
                redo: (function (theId) {
                  return function () { deleteFeature(theId); };
                })(id)
              });
              clearHighlight();
              mgr.selectedId = null;
              return true;
            }
          }
        }
        // 2) DOM-маркеры (_frtMarkerMarkers)
        if (map._frtMarkerMarkers) {
          for (var mm = 0; mm < map._frtMarkerMarkers.length; mm++) {
            var mkm = map._frtMarkerMarkers[mm];
            if (mkm._frtId === id) {
              var elM = mkm.getElement ? mkm.getElement() : null;
              var llM = mkm.getLngLat();
              mkm.remove();
              map._frtMarkerMarkers.splice(mm, 1);
              pushUndo({
                undo: (function (theEl, theId, lng, lat) {
                  return function () {
                    var mk = new maplibregl.Marker({ element: theEl, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);
                    mk._frtId = theId;
                    map._frtMarkerMarkers.push(mk);
                  };
                })(elM, id, llM.lng, llM.lat),
                redo: (function (theId) {
                  return function () { deleteFeature(theId); };
                })(id)
              });
              clearHighlight();
              mgr.selectedId = null;
              return true;
            }
          }
        }
        // 3) текстовые подписи (_frtTextFeatures)
        if (map._frtTextFeatures) {
          for (var tt = 0; tt < map._frtTextFeatures.length; tt++) {
            var tf = map._frtTextFeatures[tt];
            if (tf.properties && tf.properties._frtId === id) {
              var savedFeat = tf;
              map._frtTextFeatures.splice(tt, 1);
              var rebuildText = function () {
                if (map._frtTextTool && map._frtTextTool.rebuild) map._frtTextTool.rebuild();
                else frtRenderTextLayer(map);
              };
              rebuildText();
              pushUndo({
                undo: (function (feat) {
                  return function () { map._frtTextFeatures.push(feat); rebuildText(); };
                })(savedFeat),
                redo: (function (theId) {
                  return function () { deleteFeature(theId); };
                })(id)
              });
              clearHighlight();
              mgr.selectedId = null;
              return true;
            }
          }
        }
        // 4) геометрические инструменты (removeById)
        var tools = [
          map._frtLineString,
          map._frtPolygon,
          map._frtRectangle,
          map._frtCircle,
          map._frtFreehand,
          map._frtAngledRect,
          map._frtFreehandLine,
        ];
        for (var ti = 0; ti < tools.length; ti++) {
          var t = tools[ti];
          if (!t) continue;
          var featObj = (t.getById && t.getById(id)) || null;
          if (featObj && t.removeById && t.removeById(id)) {
            var theTool = t;
            pushUndo({
              undo: (function (tool, feat) {
                return function () { if (tool.restore) tool.restore(feat); };
              })(theTool, featObj),
              redo: (function (tool, theId) {
                return function () { if (tool.removeById) tool.removeById(theId); };
              })(theTool, id)
            });
            clearHighlight();
            mgr.selectedId = null;
            return true;
          }
        }
        return false;
      }

      function highlightFeature(id, geometry) {
        clearHighlight();
        if (!geometry) return;

        // Формируем координаты для подсветки: line + vertex points
        var lineCoords = null;
        var vertexPts = [];
        if (geometry.type === 'LineString') {
          lineCoords = geometry.coordinates;
          vertexPts = geometry.coordinates;
        } else if (geometry.type === 'Polygon') {
          var ring = geometry.coordinates[0];
          lineCoords = ring;
          vertexPts = ring;
        } else if (geometry.type === 'Point') {
          vertexPts = [geometry.coordinates];
        }
        if (!lineCoords && !vertexPts.length) return;

        var selId = 'frt-select';
        try { if (map.getLayer(selId)) map.removeLayer(selId); } catch (e) {}
        try { if (map.getSource(selId)) map.removeSource(selId); } catch (e) {}

        var lineLayerId = 'frt-select-line';
        var ptsLayerId = 'frt-select-pts';
        try { if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId); } catch (e) {}
        try { if (map.getLayer(ptsLayerId)) map.removeLayer(ptsLayerId); } catch (e) {}
        try { if (map.getSource('frt-select-src')) map.removeSource('frt-select-src'); } catch (e) {}
        try { if (map.getSource('frt-select-pts-src')) map.removeSource('frt-select-pts-src'); } catch (e) {}

        var feats = [];
        if (lineCoords) {
          feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: lineCoords } });
        }

        var fc = { type: 'FeatureCollection', features: feats };
        var ptsFC = { type: 'FeatureCollection', features: vertexPts.map(function (c) {
          return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } };
        }) };

        if (!map.getSource('frt-select-src')) {
          map.addSource('frt-select-src', { type: 'geojson', data: fc });
        } else {
          map.getSource('frt-select-src').setData(fc);
        }
        if (!map.getSource('frt-select-pts-src')) {
          map.addSource('frt-select-pts-src', { type: 'geojson', data: ptsFC });
        } else {
          map.getSource('frt-select-pts-src').setData(ptsFC);
        }

        if (lineCoords && !map.getLayer(lineLayerId)) {
          map.addLayer({ id: lineLayerId, type: 'line', source: 'frt-select-src',
            paint: { 'line-color': '#3f97e0', 'line-width': 2.5 } });
        }
        if (!map.getLayer(ptsLayerId)) {
          map.addLayer({ id: ptsLayerId, type: 'circle', source: 'frt-select-pts-src',
            paint: { 'circle-radius': 4, 'circle-color': '#FFFFFF',
              'circle-stroke-width': 2, 'circle-stroke-color': '#3f97e0' } });
        }
      }

      function clearHighlight() {
        var ids = ['frt-select-line', 'frt-select-pts'];
        for (var i = 0; i < ids.length; i++) {
          try { if (map.getLayer(ids[i])) map.removeLayer(ids[i]); } catch (e) {}
        }
        try { if (map.getSource('frt-select-src')) map.removeSource('frt-select-src'); } catch (e) {}
        try { if (map.getSource('frt-select-pts-src')) map.removeSource('frt-select-pts-src'); } catch (e) {}
      }

      function exportGeoJSON() {
        var tools = [
          { api: map._frtLineString, normalize: function (f) { return f; } },
          { api: map._frtPolygon, normalize: function (f) { return f; } },
          { api: map._frtRectangle, normalize: function (f) {
              if (f._frtId && f.c && f.d) {
                var minLng = Math.min(f.c.lng, f.d.lng), maxLng = Math.max(f.c.lng, f.d.lng);
                var minLat = Math.min(f.c.lat, f.d.lat), maxLat = Math.max(f.c.lat, f.d.lat);
                return { type: 'Feature', properties: { _frtId: f._frtId },
                  geometry: { type: 'Polygon', coordinates: [[
                    [minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]
                  ]] } };
              }
              return null;
            } },
          { api: map._frtCircle, normalize: function (f) {
              if (f._frtId && f.c && f.r) {
                // экспорт круга как аппроксимированный полигон (64 сегмента)
                var segments = 64;
                var coords = [];
                var lat = f.c.lat, lng = f.c.lng;
                var r = f.r;
                for (var a = 0; a < 2 * Math.PI; a += 2 * Math.PI / segments) {
                  var dlng = r * Math.sin(a) / Math.cos(lat * Math.PI / 180);
                  var dlat = r * Math.cos(a);
                  coords.push([lng + dlng, lat + dlat]);
                }
                coords.push(coords[0]);
                return { type: 'Feature', properties: { _frtId: f._frtId },
                  geometry: { type: 'Polygon', coordinates: [coords] } };
              }
              return null;
            } },
          { api: map._frtFreehand, normalize: function (f) {
              if (f._frtId && f.pts) {
                var ring = f.pts.slice(); ring.push(ring[0]);
                return { type: 'Feature', properties: { _frtId: f._frtId },
                  geometry: { type: 'Polygon', coordinates: [ring] } };
              }
              return null;
            } },
          { api: map._frtAngledRect, normalize: function (f) { return f; } },
          { api: map._frtFreehandLine, normalize: function (f) {
              if (f._frtId && f.pts) {
                return { type: 'Feature', properties: { _frtId: f._frtId },
                  geometry: { type: 'LineString', coordinates: f.pts } };
              }
              return null;
            } },
        ];
        var all = [];
        for (var ti = 0; ti < tools.length; ti++) {
          var t = tools[ti];
          if (!t.api) continue;
          var fa = t.api.getFeatures();
          for (var fi = 0; fi < fa.length; fi++) {
            var n = t.normalize(fa[fi]);
            if (n) all.push(n);
          }
        }
        // + DOM-маркеры точки
        if (window.MapsRender && window.MapsRender.frtGetPoints) {
          var pts = window.MapsRender.frtGetPoints(map);
          for (var pi = 0; pi < pts.length; pi++) {
            var pProps = { _tool: 'point' };
            if (pts[pi]._frtId) pProps._frtId = pts[pi]._frtId;
            all.push({ type: 'Feature', properties: pProps,
              geometry: { type: 'Point', coordinates: [pts[pi].lng, pts[pi].lat] } });
          }
        }
        // + DOM-маркеры (пин)
        if (window.MapsRender && window.MapsRender.frtGetMarkers) {
          var mks = window.MapsRender.frtGetMarkers(map);
          for (var mi2 = 0; mi2 < mks.length; mi2++) {
            var mProps = { _tool: 'marker' };
            if (mks[mi2]._frtId) mProps._frtId = mks[mi2]._frtId;
            all.push({ type: 'Feature', properties: mProps,
              geometry: { type: 'Point', coordinates: [mks[mi2].lng, mks[mi2].lat] } });
          }
        }
        // text-инструмент тоже (фичи живут в map._frtTextFeatures)
        var txts = map._frtTextFeatures || [];
        for (var ti2 = 0; ti2 < txts.length; ti2++) all.push(txts[ti2]);
        var blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features: all }, null, 2)], { type: 'application/geo+json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.download = 'map-features.geojson';
        a.href = url;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }

      // Прячем кнопки рисования, оставляем только toggle
      [rulerBtn, textBtn, pointBtn, markerBtn, lineBtn, polygonBtn, rectBtn, circleBtn, freehandBtn, angledRectBtn, freehandLineBtn, selectBtn, deleteBtn, undoBtn, redoBtn, dlGeoBtn].forEach(function (b) {
        b.style.display = 'none';
      });

      var open = false;
      var toggleBtn = btn('Инструменты', '<svg viewBox="0 0 24 24" width="23" height="23" fill="currentColor">' +
        '<path d="M0 0h24v24H0z" fill="none"/><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 4.3 7.2c-1.4 2.5-.9 5.5 1.3 7.6 1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1 1.1-1.2z"/></svg>', function () {
        open = !open;
        toggleBtn.classList.toggle('maplibregl-ctrl-active', open);
        [selectBtn, deleteBtn, undoBtn, redoBtn, rulerBtn, textBtn, pointBtn, markerBtn, lineBtn, polygonBtn, rectBtn, circleBtn, freehandBtn, angledRectBtn, freehandLineBtn, dlGeoBtn].forEach(function (b) { b.style.display = open ? '' : 'none'; });
      });

      map.addControl({ onAdd: function () { return ctrlGroup([toggleBtn, selectBtn, deleteBtn, undoBtn, redoBtn, rulerBtn, textBtn, pointBtn, markerBtn, lineBtn, polygonBtn, rectBtn, circleBtn, freehandBtn, angledRectBtn, freehandLineBtn, dlGeoBtn]); }, onRemove: function () {} }, ctrlPos);
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
            headers: {
              'Content-Type': 'application/json',
              // Токен для публичной гео-защиты (HMAC+TTL), вшит сервером в window
              'X-Maps-Token': window._frtMapToken || '',
            },
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
        // выбор вида карты — Стандартная/Спутниковая (опция styles, по умолч. вкл.)
        if (opt.styles !== false) makeStyles(map, ctrlPosition, opt);
        // экспорт в PNG — кнопка скачивания (работает на обеих стилях)
        if (opt.export !== false) makeExport(map, ctrlPosition, opt);
        // инструменты: Линейка, Текст, Точка, рисование, Select/Delete/Undo/Redo,
        // экспорт GeoJSON — в одной раскрывающейся панели «Инструменты»
        // (опция editor: false — карта «только просмотр», без панели)
        if (opt.editor !== false) makeToolsPanel(map, ctrlPosition);
      }
      // поиск мест — всегда (в т.ч. при hideControls), работает на обеих стилях
      makeGeocoder(map, opt);
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
  })();
</script>`.trim()

  return html
}

export { renderMapHtml }
