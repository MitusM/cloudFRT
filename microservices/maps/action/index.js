// === === === === === === === === === === === ===
// Maps RPC-actions (сервис-2-сервис через шину)
// Реализует общий РЕНДЕР карты: maps отдаёт HTML «голой» карты (MapLibre +
// JS-функция renderMap), а вызывающий МС (напр. trips) подставляет СВОИ данные
// (места поездки). Принцип: карта общая, данные разные.
// === === === === === === === === === === === ===

const action = async (app) => {
  /**
   * maps:map — HTML «голой» карты (MapLibre GL + OpenFreeMap Liberty) с
   * глобальной JS-функцией window.MapsRender.renderMap(container, points, opts).
   *
   * maps НЕ знает о данных вызывающего (приватные места поездки trips и пр.) —
   * он отдаёт только рендер. Вызывающий МС получает HTML и сам вызывает
   * renderMap со своими точками.
   *
   * meta:
   *   {} — достаточно. Доп. опции рендера (передаются в данные для JS):
   *   { center?: [lng, lat], zoom?: number, markerColor?: string,
   *     heightPx?: number, styleUrl?: string, containerId?: string }
   *   (все необязательные — JS имеет разумные дефолты; containerId задаёт id
   *    контейнера, по которому вызывающий обратится в renderMap)
   *
   * Ответ:
   *   res.json({
   *     html: '<link maplibre-css><div id="<auto-id>"></div><script maplibre-js>
   *            <script>window.MapsRender.renderMap(container, points, opts)</script>'
   *   })
   *
   * Контракт renderMap (определяется в этом HTML, доступен после вставки HTML):
   *   window.MapsRender.renderMap(container, points, opts)
   *     container: HTMLElement | string(id) — куда монтировать карту
   *     points:    [{ name?, address?, note?, day?, lat, lng }]  (lat/lng обязательны)
   *     opts:      { markerColor?='#e11d48', fitBoundsPadding?=48, fitBoundsMaxZoom?=14,
   *                  center?=[37.62,55.75], zoom?=5 }
   *   Возвращает: экземпляр maplibregl.Map (или null если карта уже в этом контейнере)
   */
  app.action('maps:map', async (meta, res) => {
    try {
      const opts = meta || {}
      const markerColor = opts.markerColor || '#e11d48'
      const center = Array.isArray(opts.center) ? opts.center : [37.62, 55.75]
      const zoom = typeof opts.zoom === 'number' ? opts.zoom : 5
      const heightPx = typeof opts.heightPx === 'number' ? opts.heightPx : 480
      const styleUrl = opts.styleUrl || 'https://tiles.openfreemap.org/styles/liberty'

      // авто-id контейнера: уникален на странице, чтобы несколько карт не конфликтовали.
      // Вызывающий МС может задать свой id через meta.containerId (напр. 'trip-map')
      // и обратиться к контейнеру по нему в renderMap.
      const containerId = opts.containerId && /^[A-Za-z0-9_-]+$/.test(opts.containerId)
        ? opts.containerId
        : 'frt-map-' + Math.random().toString(36).slice(2, 10)

      const html = `
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.4.0/dist/maplibre-gl.css" />
<div id="${containerId}" style="width:100%; height:${heightPx}px; border-radius:8px; overflow:hidden;"></div>
<script src="https://unpkg.com/maplibre-gl@4.4.0/dist/maplibre-gl.js"></script>
<script>
  // ── Общий рендер карты (maps:map) — данные подставляет вызывающий МС ──
  (function () {
    window.MapsRender = window.MapsRender || {};
    window.MapsRender.renderMap = function (container, points, opts) {
      opts = opts || {};
      const el = typeof container === 'string'
        ? document.getElementById(container)
        : container;
      if (!el) {
        console.error('[maps:map] container not found:', container);
        return null;
      }
      // не создаём вторую карту в том же контейнере
      if (el._frtMap) return el._frtMap;

      const center = Array.isArray(opts.center) ? opts.center : ${JSON.stringify(center)};
      const zoom = typeof opts.zoom === 'number' ? opts.zoom : ${JSON.stringify(zoom)};
      const markerColor = opts.markerColor || '${markerColor}';
      const styleUrl = opts.styleUrl || '${styleUrl}';
      const pad = typeof opts.fitBoundsPadding === 'number' ? opts.fitBoundsPadding : 48;
      const maxZoom = typeof opts.fitBoundsMaxZoom === 'number' ? opts.fitBoundsMaxZoom : 14;

      const map = new maplibregl.Map({
        container: el,
        style: styleUrl,
        center: center,
        zoom: zoom,
      });
      el._frtMap = map;

      // собираем валидные точки (lat/lng обязательны)
      const pts = (points || []).filter(
        (p) => p && p.lat != null && p.lng != null && !isNaN(+p.lat) && !isNaN(+p.lng)
      );

      const bounds = new maplibregl.LngLatBounds();
      for (const p of pts) {
        const lng = +p.lng;
        const lat = +p.lat;

        const pin = document.createElement('div');
        pin.style.background = markerColor;
        pin.style.width = '22px';
        pin.style.height = '22px';
        pin.style.borderRadius = '50% 50% 50% 0';
        pin.style.transform = 'rotate(-45deg)';
        pin.style.border = '2px solid #fff';
        pin.style.boxShadow = '0 2px 6px rgba(0,0,0,.4)';

        new maplibregl.Marker({ element: pin })
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

        bounds.extend([lng, lat]);
      }

      if (pts.length > 0 && !bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: pad, maxZoom: maxZoom });
      }

      return map;
    };
  })();
</script>`.trim()

      res.json({ html })
    } catch (err) {
      console.log('⚡ err::maps:map', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  return app
}

export { action }
