-- Migration 003: realtime device stream support
-- 1) Source column on DeviceAttendanceLogs (provenance of each punch).
-- 2) Drop the FK from DeviceAttendanceLogs.AttendanceRecordId to AttendanceRecords
--    so that deleting a device (which cascades its raw logs) never blocks on, or
--    cascades into, the shared attendance records. The link is kept as a plain
--    INT column for reporting/joins only.
-- Safe to run repeatedly (IF guards).

IF COL_LENGTH('attendance.DeviceAttendanceLogs', 'Source') IS NULL
    ALTER TABLE [attendance].[DeviceAttendanceLogs] ADD [Source] NVARCHAR(20) NULL;
GO

UPDATE [attendance].[DeviceAttendanceLogs]
SET [Source] = 'device'
WHERE [Source] IS NULL;
GO

DECLARE @conName NVARCHAR(200);
SELECT @conName = dc.name
FROM sys.foreign_key_constraints dc
JOIN sys.foreign_key_columns fc ON fc.constraint_object_id = dc.object_id
WHERE dc.parent_object_id = OBJECT_ID('attendance.DeviceAttendanceLogs')
  AND fc.parent_column_id = COLUMNPROPERTY(dc.parent_object_id, 'AttendanceRecordId', 'ColumnId');

IF @conName IS NOT NULL
    EXEC('ALTER TABLE [attendance].[DeviceAttendanceLogs] DROP CONSTRAINT [' + @conName + ']');
GO
