-- ============================================================================
-- schema.sql — схема OrientDB для МС destinations (cloudFRT)
--
-- Гео-каталог мест с SEO-иерархией в виде ГРАФА.
--
-- Класс-вершина Dest (узел места: страна/регион/место/достопримечательность)
-- и рёбра:
--   Dest -PART_OF-> Dest        иерархия (Телецкое ∈ Горный Алтай ∈ Россия)
--   Dest -HAS_TRIP-> Trip       место → поездки (МС trips)
--   Dest -HAS_ARTICLE-> Article место → статьи /stati/ (МС article)
--   Dest -HAS_MAP-> Map         место → карты (МС maps)
--
-- ВАЖНО (те же ограничения OrientDB 3.2.55, что в maps/schema.sql):
--  1. Код destinations НЕ создаёт схему автоматически (только DML: CREATE VERTEX).
--     Класс/свойства/индексы заводятся этим скриптом ВРУЧНУЮ.
--  2. Выполнять ОДИН РАЗ на чистой БД (или пустой схеме Dest).
--  3. OrientDB 3.2.55 напрямую НЕ поддерживает:
--     - IF NOT EXISTS для CREATE CLASS/PROPERTY -> "Error parsing query"
--     - DEFAULT внутри CREATE PROPERTY
--       Поэтому DEFAULT задаётся отдельной командой ALTER PROPERTY, а повторный
--       прогон даёт "already exists" — это норма, console продолжает.
--
-- НЮАНСЫ РАБОТЫ (учитывать в коде destinations):
--  * created — тип DATETIME, пишется через toOrientDate() helper
--    (формат 'YYYY-MM-DD HH:mm:ss'); ISO-строки OrientDB не парсит.
--  * location — конвертируется ST_GeomFromText('POINT(lng lat)') (как article).
--  * Индексы: slug+уникальность на уровне дерева — через UNIQUE на (slug) здесь,
--    при необходимости уникальности пути (родитель+slug) — пересмотреть на этапе 2.
--
-- Выполнить через OrientDB console:
--   cd /media/04E0AC01E0ABF6D8/orientdb-community-3.2.55
--   ./bin/console.sh
--   connect remote:127.0.0.1/cloudFRT misha <PASSWORD>
--   (вставить содержимое schema.sql)
-- ============================================================================

/* ---------- ВЕРШИНА Dest: узел гео-каталога ---------- */
CREATE CLASS Dest EXTENDS V;
CREATE PROPERTY Dest.slug STRING;              -- сегмент в URL (напр. 'gornyj-altaj')
CREATE PROPERTY Dest.title STRING;             -- название места
CREATE PROPERTY Dest.h1 STRING;                -- H1 (если отличен от title)
CREATE PROPERTY Dest.level STRING;             -- country | region | place | attraction
CREATE PROPERTY Dest.description STRING;       -- SEO description
CREATE PROPERTY Dest.content EMBEDDED;         -- контент хаба (rich)
CREATE PROPERTY Dest.image STRING;             -- URL изображения
CREATE PROPERTY Dest.is_hub BOOLEAN;           -- является ли хабом (default true)
ALTER PROPERTY Dest.is_hub DEFAULT true;
CREATE PROPERTY Dest.priority DOUBLE;          -- приоритет в sitemap (0..1)
CREATE PROPERTY Dest.location EMBEDDED;        -- координаты (ST_GeomFromText POINT)
CREATE PROPERTY Dest.created DATETIME;         -- ТОЛЬКО toOrientDate(), не ISO

/* ---------- ИНДЕКСЫ Dest ---------- */
CREATE INDEX Dest.slug_idx ON Dest (slug) NOTUNIQUE;
CREATE INDEX Dest.level_idx ON Dest (level) NOTUNIQUE;

/* ---------- РЁБРА ---------- */
CREATE CLASS PART_OF EXTENDS E;      -- иерархия мест (child -PART_OF-> parent)
-- (связи с trips/article/maps заводим по мере интеграции этапов 5-6;
--  классы рёбер можно создавать тут заранее:)
CREATE CLASS HAS_TRIP EXTENDS E;     -- место -HAS_TRIP-> Trip
CREATE CLASS HAS_ARTICLE EXTENDS E;  -- место -HAS_ARTICLE-> Article (/stati)
CREATE CLASS HAS_MAP EXTENDS E;      -- место -HAS_MAP-> Map

/* ---------- Settings (необязательно, симметрия с article) ---------- */
-- CREATE VERTEX Settings SET microservice = 'destinations';
