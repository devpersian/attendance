-- Migration 010: login lockout columns (Phase 1 / P1.1)
-- Adds brute-force protection state to attendance.Users:
--   FailedLoginAttempts — consecutive failed logins since last success
--   LockedUntil         — UTC-ish server time; logins rejected while > GETDATE()
-- Configurable via env on the app side: MAX_FAILED_LOGINS (default 5),
-- LOCKOUT_MINUTES (default 15). Safe to run repeatedly (IF guards).

IF COL_LENGTH('attendance.Users', 'FailedLoginAttempts') IS NULL
    ALTER TABLE [attendance].[Users] ADD [FailedLoginAttempts] INT NOT NULL DEFAULT 0;
GO

IF COL_LENGTH('attendance.Users', 'LockedUntil') IS NULL
    ALTER TABLE [attendance].[Users] ADD [LockedUntil] DATETIME NULL;
GO
