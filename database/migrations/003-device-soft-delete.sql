-- Migration 003: soft-delete columns on attendance.Devices
-- Deleting a device only marks it (IsDeleted = 1); its DeviceAttendanceLogs
-- and DeviceLogs rows are kept forever for audit/history.

IF COL_LENGTH('attendance.Devices', 'isDeleted') IS NULL
    ALTER TABLE attendance.Devices ADD [isDeleted] BIT NOT NULL DEFAULT 0;
GO

IF COL_LENGTH('attendance.Devices', 'DeletedAt') IS NULL
    ALTER TABLE attendance.Devices ADD [DeletedAt] DATETIME NULL;
GO

-- Speed up the "exclude deleted" filter used by every device query.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Devices_isDeleted' AND object_id = OBJECT_ID('attendance.Devices'))
    CREATE INDEX IX_Devices_isDeleted ON attendance.Devices ([isDeleted]);
GO

PRINT 'Migration 003 (device soft delete) applied.';
GO
