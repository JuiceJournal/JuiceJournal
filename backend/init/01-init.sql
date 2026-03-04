-- PoE Farm Tracker - Initial Database Setup
-- Bu dosya PostgreSQL container ilk calistiginda otomatik calisir

-- Extensions ekle
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Veritabani saglik kontrolu icin
SELECT 'PoE Farm Tracker database is ready!' as status;
