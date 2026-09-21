// === === === === === === === === === === === ===
// Maps RPC-actions (сервис-2-сервис через шину)
// Реализует общий РЕНДЕР карты: maps:map отдаёт HTML «голой» карты
// (MapLibre + window.MapsRender.*), а вызывающий МС (напр. trips) подставляет
// СВОИ данные (места поездки). Принцип: карта общая, данные разные.
// Генерация HTML — в service/renderMapHtml.js (общая с контроллером).
// === === === === === === === === === === === ===
import { renderMapHtml } from '../service/renderMapHtml.js'
import { renderMapPng } from '../service/ogExport.js'

const action = async (app) => {
  /**
   * maps:map — HTML «голой» карты (MapLibre GL + OpenFreeMap Liberty) с
   * глобальными JS-функциями window.MapsRender.*.
   *
   * maps НЕ знает о данных вызывающего (приватные места поездки trips и пр.) —
   * он отдаёт только рендер. Вызывающий МС получает HTML и сам вызывает
   * MapsRender со своими точками.
   *
   * meta (все необязательные):
   *   { center?: [lng, lat], zoom?: number, markerColor?: string,
   *     heightPx?: number, styleUrl?: string, containerId?: string,
   *     language?: 'ru'(дефолт)|'auto'|'en'|'de'|'fr'|… (подписи карты) }
   *
   * Ответ: res.json({ html }) — см. renderMapHtml.js за контрактом MapsRender.
   */
  app.action('maps:map', async (meta, res) => {
    try {
      const html = renderMapHtml(meta || {})
      res.json({ html })
    } catch (err) {
      console.log('⚡ err::maps:map', err)
      res.status(500).json({ error: 'internal' })
    }
  })

  /**
   * maps:mapPoints — HTML карты с предзалитыми точками (MapLibre + Маркеры + Легенда).
   *
   * Отличается от maps:map тем, что точки передаются в meta и сразу рендерятся
   * через MapsRender.renderMap (createMap + addMarkers + fitBounds в один вызов).
   * Поддерживает types[] для легенды карты.
   *
   * meta (все необязательные, кроме points):
   *   { points[], types?, center?: [lng, lat], zoom?: number, heightPx?: number,
   *     markerColor?: string, containerId?: string, language?: string }
   *   points: [{ name, lat, lng, address?, note?, typeIcon?, typeName?, level? }]
   *
   * Ответ: res.json({ html })
   */
  app.action('maps:mapPoints', async (meta, res) => {
    try {
      const { points, center, zoom } = meta || {}
      const pts = Array.isArray(points) ? points : []

      const containerId = (meta.containerId && /^[A-Za-z0-9_-]+$/.test(meta.containerId))
        ? meta.containerId
        : 'dest-map'

      const mapOpts = {
        containerId,
        heightPx: meta.heightPx || 520,
        language: meta.language || 'ru',
        markerColor: meta.markerColor || '#e11d48',
        center: center || [37.62, 55.75],
        zoom: typeof zoom === 'number' ? zoom : 7,
        editor: false,
      }

      const rawHtml = renderMapHtml(mapOpts)

      // inline points как JSON
      const ptsJson = JSON.stringify(pts.map(p => ({
        name: p.name || '',
        lat: Number(p.lat),
        lng: Number(p.lng),
        address: p.address || '',
        note: p.note || '',
        typeIcon: p.typeIcon || null,
        typeName: p.typeName || null,
        level: p.level || null,
      })))

      const injectScript = `<script>
(function(){
  var pts = ${ptsJson};
  var container = document.getElementById('${containerId}');
  if (!container || !pts.length) return;
  var wait = setInterval(function(){
    if (!window.MapsRender) return;
    clearInterval(wait);
    window.MapsRender.renderMap(container, pts, ${JSON.stringify(mapOpts)});
  }, 100);
  setTimeout(function(){ clearInterval(wait); }, 8000);
})();
<\/script>`

      res.json({ html: rawHtml + injectScript })
    } catch (err) {
      console.log('⚡ err::maps:mapPoints', err)
      res.status(500).json({ error: err.message || 'mapPoints failed' })
    }
  })

  app.action('maps:og', async (meta, res) => {
    try {
      const png = await renderMapPng(meta || {})
      // RPC-шина сериализует через JSON; бинарное тело передаём как base64,
      // Gateway декодирует по ключу __frtBase64 и пишет настоящие байты клиенту.
      res.json({ __frtBase64: png.toString('base64'), contentType: 'image/png' })
    } catch (err) {
      console.log('⚡ err::maps:og', err)
      res.status(500).json({ error: err.message || 'internal' })
    }
  })

  return app
}

export { action }
