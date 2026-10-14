-- Migration 016: last-pull bookkeeping + offline alert flag (Phase 2 / P2.5, P2.6)
--   attendance.Devices.LastPulledAt — timestamp of the most recent completed
--   poll/backfill pass per device (set by the server-side poller loop).
--   attendance.Devices.OfflineAlerted — dedupe flag so the offline sweeper
--   emits exactly one alert per offline episode (reset when the device returns).
-- Safe to run repeatedly. SQL Server syntax.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[attendance].[Devices]') AND name = 'LastPulledAt')
BEGIN
    ALTER TABLE [attendance].[Devices] ADD [LastPulledAt] DATETIME NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[attendance].[Devices]') AND name = 'OfflineAlerted')
BEGIN
    ALTER TABLE [attendance].[Devices] ADD [OfflineAlerted] BIT NOT NULL DEFAULT 0;
END
GO
