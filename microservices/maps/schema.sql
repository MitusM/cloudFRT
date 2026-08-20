-- ============================================================================
-- schema.sql — схема OrientDB для поиска мест в микросервисе maps (cloudFRT)
--
-- Добавляет локальный поисковый слой мест: класс-вершина SearchPlace —
-- каталог POI, по которому идёт поиск на картах (/maps/geocode).
--
-- ВАЖНО (те же ограничения, что и в trips/schema.sql):
--  1. Код maps НЕ создаёт схему автоматически (только DML: CREATE VERTEX).
--     Класс/свойства/индекс заводятся этим скриптом ВРУЧНУЮ.
--  2. Выполнять ОДИН РАЗ на чистой БД (или на пустой схеме SearchPlace).
--  3. OrientDB 3.2.55 напрямую НЕ поддерживает:
--     - IF NOT EXISTS для CREATE CLASS/PROPERTY  -> "Error parsing query"
--     - DEFAULT внутри CREATE PROPERTY           -> "Error parsing query"
--       (DEFAULT true у searchable падал именно так)
--     Поэтому DEFAULT задаётся отдельной командой ALTER PROPERTY, а повторный
--     прогон даёт "already exists" — это норма, console продолжает.
--
-- НЮАНСЫ РАБОТЫ С ЭТОЙ СХЕМОЙ (учитывать в коде maps):
--  * created_at — тип DATETIME, пишется ТОЛЬКО через helper toOrientDate()
--    (формат 'YYYY-MM-DD HH:mm:ss'); ISO-строки OrientDB не парсит.
--  * Поиск по имени: SELECT ... WHERE searchable = true AND name LIKE :term
--    - имя параметра НЕ ":like" (конфликтует с оператором LIKE) — только :term;
--    - name.toLowerCase() / LCASE(name) в WHERE НЕ парсятся OrientDB;
--    - LIKE регистронезависим для кириллицы (проверено: «арнаул»/«БАРНАУЛ»
--      находят «Барнаул»).
--
-- Выполнить через OrientDB console:
--   cd /media/04E0AC01E0ABF6D8/orientdb-community-3.2.55
--   ./bin/console.sh
--   connect remote:127.0.0.1/cloudFRT misha <PASSWORD>
--   (вставить содержимое schema.sql)
--
-- Источник/актуализация: work/ (агент Тима), страница вики
--   «МС maps — поиск мест (maplibre-gl-geocoder + SearchPlace)»
-- ============================================================================

/* ---------- ВЕРШИНА SearchPlace: поисковый каталог мест ---------- */
CREATE CLASS SearchPlace EXTENDS V;
CREATE PROPERTY SearchPlace.name STRING;             -- название места (по нему LIKE-поиск)
CREATE PROPERTY SearchPlace.lat DOUBLE;              -- широта
CREATE PROPERTY SearchPlace.lng DOUBLE;              -- долгота
CREATE PROPERTY SearchPlace.address STRING;          -- адрес (опционально)
CREATE PROPERTY SearchPlace.osm_id STRING;           -- id в OpenStreetMap, напр. 'way:842791168'
CREATE PROPERTY SearchPlace.google_place_id STRING;  -- id в Google Places (если есть)
CREATE PROPERTY SearchPlace.url STRING;              -- ссылка на место (website)
CREATE PROPERTY SearchPlace.source STRING;           -- происхождение: openstreetmap (фолбэк Nominatim) | local
CREATE PROPERTY SearchPlace.searchable BOOLEAN;      -- участвует ли в поиске (default true)
ALTER PROPERTY SearchPlace.searchable DEFAULT true;
CREATE PROPERTY SearchPlace.created_at DATETIME;     -- ТОЛЬКО toOrientDate(), не ISO
CREATE INDEX SearchPlace.name_idx ON SearchPlace (name) NOTUNIQUE;
