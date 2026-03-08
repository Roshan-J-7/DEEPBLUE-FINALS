# PostgreSQL Logical Replication — Table Sync Guide

Sync **4 tables** (`users`, `user_medical_data`, `user_profiles`, `reports`) from your
PostgreSQL database to your friend's PostgreSQL database **in real-time**.

Every INSERT / UPDATE / DELETE on your side is automatically streamed to your friend's DB.

## How It Works

```
Your PostgreSQL (Publisher)          Friend's PostgreSQL (Subscriber)
┌──────────────────────┐             ┌──────────────────────┐
│  users               │  ──stream──▶│  users               │
│  user_medical_data   │  ──stream──▶│  user_medical_data   │
│  user_profiles       │  ──stream──▶│  user_profiles       │
│  reports             │  ──stream──▶│  reports             │
└──────────────────────┘             └──────────────────────┘
   FastAPI / psycopg2                   Django / anything
```

No framework changes needed. This is **database-level**, not application-level.

---

## Prerequisites

- PostgreSQL **10+** on both sides (ideally same major version)
- Network connectivity between the two PostgreSQL servers (friend must be able to reach your DB)
- Superuser or replication-role access on both databases

---

## Step-by-Step Setup

### Step 1 — Configure YOUR PostgreSQL (Publisher)

1. **Edit `postgresql.conf`** (usually in your PostgreSQL data directory):

   ```ini
   wal_level = logical          # REQUIRED for logical replication
   max_replication_slots = 4    # at least 1 per subscriber
   max_wal_senders = 4          # at least 1 per subscriber
   ```

2. **Edit `pg_hba.conf`** to allow your friend's IP:

   ```
   # TYPE  DATABASE    USER           ADDRESS              METHOD
   host    DeepBlue    repl_user      <FRIEND_IP>/32       md5
   ```

3. **Restart PostgreSQL** for changes to take effect.

4. **Run the publisher setup script** (see `01_publisher_setup.sql`):
   ```bash
   psql -U postgres -d DeepBlue -f db_replication/01_publisher_setup.sql
   ```

### Step 2 — Configure FRIEND'S PostgreSQL (Subscriber)

1. **Run the subscriber setup script** on your friend's database:
   ```bash
   psql -U postgres -d <friend_db_name> -f db_replication/02_subscriber_setup.sql
   ```

2. **Edit the subscription** connection string in `02_subscriber_setup.sql` before running
   (replace `YOUR_HOST`, `YOUR_PASSWORD`, etc.).

### Step 3 — Verify Replication

```sql
-- On YOUR side (publisher):
SELECT * FROM pg_replication_slots;
SELECT * FROM pg_stat_replication;

-- On FRIEND's side (subscriber):
SELECT * FROM pg_stat_subscription;
SELECT * FROM pg_subscription_rel;
```

---

## Alternative: One-Time Data Export

If your friend only needs a **snapshot** (not real-time sync), use the export endpoint
or `pg_dump`:

```bash
# Dump only the 4 tables
pg_dump -U postgres -d DeepBlue \
  -t users -t user_medical_data -t user_profiles -t reports \
  --no-owner --no-privileges \
  -f shared_tables_dump.sql

# Friend imports:
psql -U postgres -d <friend_db> -f shared_tables_dump.sql
```

Or use the `/admin/export-tables` API endpoint (see code added to the app).

---

## FAQ

**Q: Does my friend need to use FastAPI too?**
A: No. Logical replication is database-to-database. Django, Rails, raw SQL — anything works.

**Q: Will Django migrations conflict?**
A: Your friend should NOT run Django migrations on the replicated tables. Use `managed = False`
in their Django models for these 4 tables. The tables are owned by the publisher.

**Q: What about schema changes?**
A: If you ALTER a table (add/remove columns), you must manually apply the same ALTER on the
subscriber side. Logical replication does NOT replicate DDL (schema changes).

**Q: Network issues?**
A: Replication automatically reconnects and catches up from the WAL. No data loss.

**Q: Can my friend write to the replicated tables?**
A: By default, no — the subscription is read-only. This prevents conflicts.
