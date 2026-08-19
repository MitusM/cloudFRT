// === === === === === === === === === === === ===
// Maps RPC-actions (сервис-2-сервис через шину)
// Реализует общий РЕНДЕР карты: maps:map отдаёт HTML «голой» карты
// (MapLibre + window.MapsRender.*), а вызывающий МС (напр. trips) подставляет
// СВОИ данные (места поездки). Принцип: карта общая, данные разные.
// Генерация HTML — в service/renderMapHtml.js (общая с контроллером).
// === === === === === === === === === === === ===
import { renderMapHtml } from '../service/renderMapHtml.js'

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
   *     language?: 'auto'|'ru'|'en'|'de'|'fr'|… (подписи карты, по умолч. 'auto' = язык браузера) }
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

  return app
}

export { action }
