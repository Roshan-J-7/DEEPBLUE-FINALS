-- ============================================================
-- PUBLISHER SETUP (run on YOUR PostgreSQL / DeepBlue database)
-- ============================================================
-- This creates a replication user and a publication for the
-- 4 shared tables: users, user_medical_data, user_profiles, reports.
-- ============================================================

-- 1. Create a dedicated replication user (safer than sharing your main creds)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'repl_user') THEN
        CREATE ROLE repl_user WITH LOGIN PASSWORD 'DeepBlue_repl_2026!' REPLICATION;
    END IF;
END
$$;

-- 2. Grant read access on the 4 tables to the replication user
GRANT CONNECT ON DATABASE "DeepBlue" TO repl_user;
GRANT USAGE ON SCHEMA public TO repl_user;
GRANT SELECT ON users, user_medical_data, user_profiles, reports TO repl_user;

-- 3. Create a PUBLICATION for the 4 tables
--    This tells PostgreSQL to stream changes for these tables only.
CREATE PUBLICATION deepblue_shared_tables
    FOR TABLE users, user_medical_data, user_profiles, reports;

-- Verify:
SELECT * FROM pg_publication;
SELECT * FROM pg_publication_tables WHERE = 'deepblue_shared_tables';
pubname 