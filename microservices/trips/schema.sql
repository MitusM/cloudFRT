-- ============================================================================
-- schema.sql — схема OrientDB для микросервиса trips (cloudFRT)
--
-- Ядро trips: 3 вершины (Trip, Place, GeoObject) + 3 ребра
--             (TripMember, TripPlace, hasObject).
--
-- ВАЖНО:
--  1. Код trips НЕ создаёт схему автоматически (только DML — CREATE
--     VERTEX/EDGE). Классы/свойства/индексы заводятся этим скриптом ВРУЧНУЮ.
--  2. Выполнять ОДИН РАЗ на чистой БД (или на пустой схеме trips).
--  3. OrientDB 3.2.55 напрямую НЕ поддерживает:
--     - IF NOT EXISTS для CREATE CLASS/PROPERTY -> "Error parsing query"
--     - DEFAULT внутри CREATE PROPERTY -> "Error parsing query"
--     Поэтому DEFAULT задаётся отдельной командой ALTER PROPERTY, а повторный
--     прогон даёт "already exists" — это норма, console продолжает.
--
-- Выполнить через OrientDB console:
--   cd /media/04E0AC01E0ABF6D8/orientdb-community-3.2.55
--   ./bin/console.sh
--   connect remote:127.0.0.1/cloudFRT misha <PASSWORD>
--   (вставить содержимое schema.sql)
--
-- Источник/актуализация: work/trek-cloudfrt-схема-orientdb-trips.md (агент Тима)
-- ============================================================================

/* ---------- ВЕРШИНА Trip: поездка ---------- */
CREATE CLASS Trip EXTENDS V;
CREATE PROPERTY Trip.title STRING;
CREATE PROPERTY Trip.description STRING;
CREATE PROPERTY Trip.start_date STRING;          -- ISO yyyy-mm-dd (как TREK)
CREATE PROPERTY Trip.end_date STRING;
CREATE PROPERTY Trip.currency STRING;
CREATE PROPERTY Trip.cover_image STRING;
CREATE PROPERTY Trip.is_archived BOOLEAN;
CREATE PROPERTY Trip.reminder_days INTEGER;
CREATE PROPERTY Trip.is_private BOOLEAN;      -- true=частная (видит только владелец+участники), false=публичная
CREATE PROPERTY Trip.status STRING;           -- open|closed (open — идёт формирование, можно добавлять места)
ALTER PROPERTY Trip.currency DEFAULT "EUR";
ALTER PROPERTY Trip.is_archived DEFAULT false;
ALTER PROPERTY Trip.reminder_days DEFAULT 3;
ALTER PROPERTY Trip.is_private DEFAULT true;
ALTER PROPERTY Trip.status DEFAULT "open";
CREATE PROPERTY Trip.owner STRING;               -- стабильный _id владельца
CREATE PROPERTY Trip.ownerRid STRING;            -- RID владельца, напр. '#22:0'
CREATE PROPERTY Trip.created_at DATETIME;
CREATE PROPERTY Trip.updated_at DATETIME;
CREATE INDEX Trip.ownerRid ON Trip (ownerRid) NOTUNIQUE;

/* ---------- ВЕРШИНА Place: снапшот места ---------- */
CREATE CLASS Place EXTENDS V;
CREATE PROPERTY Place.name STRING;
CREATE PROPERTY Place.description STRING;
CREATE PROPERTY Place.address STRING;
CREATE PROPERTY Place.lat DOUBLE;
CREATE PROPERTY Place.lng DOUBLE;
CREATE PROPERTY Place.osm_id STRING;
CREATE PROPERTY Place.google_place_id STRING;
CREATE PROPERTY Place.google_ftid STRING;
CREATE PROPERTY Place.source STRING;             -- osm | google
CREATE PROPERTY Place.url STRING;
CREATE PROPERTY Place._id STRING;                -- стабильный nanoid(21), пишет код
CREATE PROPERTY Place.created_at DATETIME;

/* ---------- ВЕРШИНА GeoObject: канонический эталон места ---------- */
CREATE CLASS GeoObject EXTENDS V;
CREATE PROPERTY GeoObject.name STRING;
CREATE PROPERTY GeoObject.lat DOUBLE;
CREATE PROPERTY GeoObject.lng DOUBLE;
CREATE PROPERTY GeoObject.osm_id STRING;
CREATE PROPERTY GeoObject.google_place_id STRING;
CREATE PROPERTY GeoObject.google_ftid STRING;
CREATE PROPERTY GeoObject.source STRING;
CREATE PROPERTY GeoObject.created_at DATETIME;   -- ТОЛЬКО toOrientDate(), не ISO
CREATE INDEX GeoObject.osm_id ON GeoObject (osm_id) NOTUNIQUE;
CREATE INDEX GeoObject.name_lat_lng ON GeoObject (name, lat, lng) NOTUNIQUE;

/* ---------- РЕБРО TripMember: Trip -[участвует]-> User ---------- */
CREATE CLASS TripMember EXTENDS E;
CREATE PROPERTY TripMember.is_guest BOOLEAN;
ALTER PROPERTY TripMember.is_guest DEFAULT false;
CREATE PROPERTY TripMember.role STRING;          -- owner/member/guest
CREATE PROPERTY TripMember.invited_by STRING;    -- _id пригласившего
CREATE PROPERTY TripMember.added_at DATETIME;

/* ---------- РЕБРО TripPlace: Trip -[место]-> Place ---------- */
CREATE CLASS TripPlace EXTENDS E;
CREATE PROPERTY TripPlace.added_at DATETIME;
CREATE PROPERTY TripPlace.added_by STRING;       -- _id добавившего
CREATE PROPERTY TripPlace.day STRING;            -- день поездки
CREATE PROPERTY TripPlace.note STRING;           -- заметка пользователя
CREATE PROPERTY TripPlace.article_id INTEGER;    -- стабильный Article.id (B+C)
CREATE PROPERTY TripPlace.article_rid STRING;    -- RID статьи '#X:Y' (B+C)
CREATE INDEX TripPlace.article_rid ON TripPlace (article_rid) NOTUNIQUE;

/* ---------- РЕБРО hasObject: Place -[связан]-> GeoObject ---------- */
CREATE CLASS hasObject EXTENDS E;
