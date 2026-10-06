-- Existing early v0.1 databases only; fresh schema already uses BIGINT.
ALTER TABLE computer_sessions ALTER COLUMN epoch TYPE BIGINT;
