-- Script to update all table references from dbo to attendance schema
-- Run this in SQL Server Management Studio

USE AttendanceDB;
GO

-- This script assumes all tables are already in the attendance schema
-- If you need to move tables from dbo to attendance, use:
-- ALTER SCHEMA attendance TRANSFER dbo.TableName;

-- Verify all tables are in attendance schema
SELECT 
    s.name AS SchemaName,
    t.name AS TableName
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = 'attendance'
ORDER BY t.name;
GO

PRINT 'All tables verified in attendance schema';
GO
