-- Migration 006: Iranian official-holiday table (تقویم رسمی کشور)
--
-- The code-side service (server/services/holidays.mjs) knows the FIXED holidays
-- (Nowruz, 22 Bahman, ...) plus a built-in list for recent Jalali years. Lunar
-- religious holidays drift ~10-11 days per year, so each year's official list is
-- inserted here as data rows and merged by the service at runtime. This keeps
-- yearly maintenance to "run one INSERT script" instead of a code change.
--
-- Safe to run repeatedly (IF guards).

IF OBJECT_ID('[attendance].[Holidays]', 'U') IS NULL
BEGIN
    CREATE TABLE [attendance].[Holidays] (
        [Id]          INT IDENTITY(1,1) PRIMARY KEY,
        -- Gregorian date of the holiday (the system stores/queries dates in
        -- both worlds; jalali conversion happens in the app layer).
        [HolidayDate] DATE NOT NULL,
        -- Persian display name, e.g. N'عید نوروز'
        [Name]        NVARCHAR(100) NOT NULL,
        -- 'jalali-fixed' | 'gregorian-fixed' | 'lunar' | 'weekly-thursday-extra'
        [Kind]        NVARCHAR(20) NOT NULL DEFAULT 'lunar',
        -- Optional Jalali components for reporting/sorting
        [JalaliYear]  INT NULL,
        [JalaliMonth] INT NULL,
        [JalaliDay]   INT NULL,
        [IsOfficial]  BIT NOT NULL DEFAULT 1,   -- official closure day vs. advisory observance
        [CreatedAt]   DATETIME DEFAULT GETDATE(),
        CONSTRAINT UQ_Holidays_Date UNIQUE ([HolidayDate], [Name])
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Holidays_Date' AND object_id = OBJECT_ID('attendance.Holidays'))
    CREATE INDEX IX_Holidays_Date ON [attendance].[Holidays] ([HolidayDate]);
GO

-- Example seed for the movable religious holidays of 1405 (safe approximate
-- entries; replace with the official calendar announcement when published).
-- Uncomment and adjust after verifying against the official تقویم گسترده:
--
-- INSERT INTO [attendance].[Holidays] ([HolidayDate], [Name], [Kind], [JalaliYear], [JalaliMonth], [JalaliDay])
-- VALUES ('2026-03-21', N'عید نوروز', 'jalali-fixed', 1405, 1, 1);
GO
