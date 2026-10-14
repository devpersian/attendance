-- Migration 014: security audit trail (Phase 1 / P1.6)
-- Append-only record of security-relevant events: login success/failure/lock,
-- logout, password change/reset, user CRUD, role/permission changes, device
-- CRUD + secret rotation. Written by server/services/auditLog.mjs (best-effort:
-- a failed audit write never breaks the request it describes).
-- Read via GET /api/admin/audit-log (users module permission).

IF OBJECT_ID('attendance.AuditLog', 'U') IS NULL
CREATE TABLE [attendance].[AuditLog] (
    [Id]           INT IDENTITY(1,1) PRIMARY KEY,
    [ActorUserId]  INT NULL,                     -- NULL for anonymous (failed logins)
    [Action]       NVARCHAR(80) NOT NULL,        -- e.g. LOGIN_FAILED, USER_DELETED
    [Entity]       NVARCHAR(60) NOT NULL,        -- e.g. user, device, role
    [EntityId]     NVARCHAR(60) NULL,
    [Detail]       NVARCHAR(MAX) NULL,           -- JSON payload
    [IpAddress]    NVARCHAR(60) NULL,
    [CreatedAt]    DATETIME DEFAULT GETDATE()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLog_CreatedAt' AND object_id = OBJECT_ID('attendance.AuditLog'))
    CREATE INDEX [IX_AuditLog_CreatedAt] ON [attendance].[AuditLog] ([CreatedAt] DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLog_Actor' AND object_id = OBJECT_ID('attendance.AuditLog'))
    CREATE INDEX [IX_AuditLog_Actor] ON [attendance].[AuditLog] ([ActorUserId], [CreatedAt] DESC);
GO
