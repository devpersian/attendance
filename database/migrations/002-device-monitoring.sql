-- Migration 002: device monitoring columns on attendance.Devices
-- Adds health-check / reachability fields used by the "پایش دستگاه‌ها" section.
-- Safe to run repeatedly (IF NOT EXISTS guards).

IF COL_LENGTH('attendance.Devices', 'LastSeen') IS NULL
    ALTER TABLE [attendance].[Devices] ADD [LastSeen] DATETIME NULL;
GO

IF COL_LENGTH('attendance.Devices', 'LastError') IS NULL
    ALTER TABLE [attendance].[Devices] ADD [LastError] NVARCHAR(500) NULL;
GO

IF COL_LENGTH('attendance.Devices', 'LastErrorCode') IS NULL
    ALTER TABLE [attendance].[Devices] ADD [LastErrorCode] NVARCHAR(50) NULL;
GO

IF COL_LENGTH('attendance.Devices', 'ConsecutiveFailures') IS NULL
    ALTER TABLE [attendance].[Devices] ADD [ConsecutiveFailures] INT NOT NULL DEFAULT 0;
GO

IF COL_LENGTH('attendance.Devices', 'TotalRecordsReceived') IS NULL
    ALTER TABLE [attendance].[Devices] ADD [TotalRecordsReceived] INT NOT NULL DEFAULT 0;
GO
