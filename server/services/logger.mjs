import { execute, executeInsert } from '../db.mjs';

export class Logger {
  static async log(level, action, entity, entityId, message, metadata = null, userId = null, error = null) {
    try {
      
      // Enhanced metadata with error details
      const enhancedMetadata = {
        ...metadata,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        serverTime: new Date().toISOString(),
      };
      
      // Add error details if present
      if (error) {
        enhancedMetadata.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: error.code,
        };
      }
      
      const logId = await executeInsert(`INSERT INTO attendance.SystemLogs (Level, Action, Entity, EntityId, Message, Metadata, UserId, CreatedAt)
         VALUES (@level, @action, @entity, @entityId, @message, @metadata, @userId, GETDATE())`, { level, action, entity, entityId: entityId || null, message, metadata: JSON.stringify(enhancedMetadata), userId: userId || null });
      
      // Enhanced console logging
      const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${action} ${entity}`;
      const logData = {
        logId,
        level,
        action,
        entity,
        entityId,
        message,
        userId,
        metadata: enhancedMetadata,
      };
      
      if (level === 'error') {
        console.error(prefix, message);
        if (error) {
          console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
          });
        }
        if (metadata) {
          console.error('Metadata:', metadata);
        }
      } else if (level === 'warning') {
        console.warn(prefix, message);
        if (metadata) {
          console.warn('Metadata:', metadata);
        }
      } else {
        console.log(prefix, message);
        if (metadata && Object.keys(metadata).length > 0) {
          console.log('Metadata:', metadata);
        }
      }
      
      return logId;
    } catch (logError) {
      // Never let a failed DB write crash the process — logging must be best-effort.
      console.error('Failed to write log:', logError.message);
      console.error('Original message:', message);
      return null;
    }
  }
  
  // Enhanced error logging with full context
  static async logError(action, entity, entityId, message, error, metadata = null, userId = null) {
    return this.log('error', action, entity, entityId, message, metadata, userId, error);
  }
  
  // Request logging
  static async logRequest(method, url, statusCode, duration, userId = null, metadata = null) {
    return this.log(
      statusCode >= 400 ? 'warning' : 'info',
      'HTTP_REQUEST',
      'api',
      null,
      `${method} ${url} - ${statusCode} (${duration}ms)`,
      { method, url, statusCode, duration, ...metadata },
      userId
    );
  }
  
  // Database operation logging
  static async logDatabase(operation, table, recordId, userId = null, metadata = null) {
    return this.log(
      'info',
      `DB_${operation.toUpperCase()}`,
      table,
      recordId,
      `Database ${operation} on ${table}`,
      metadata,
      userId
    );
  }

  static async info(action, entity, entityId, message, metadata = null, userId = null) {
    return this.log('info', action, entity, entityId, message, metadata, userId);
  }

  static async success(action, entity, entityId, message, metadata = null, userId = null) {
    return this.log('success', action, entity, entityId, message, metadata, userId);
  }

  static async warning(action, entity, entityId, message, metadata = null, userId = null) {
    return this.log('warning', action, entity, entityId, message, metadata, userId);
  }

  static async error(action, entity, entityId, message, metadata = null, userId = null) {
    return this.log('error', action, entity, entityId, message, metadata, userId);
  }

  static async getLogs(filters = {}, limit = 100) {
    try {
      let query = 'SELECT TOP (@limit) * FROM attendance.SystemLogs WHERE 1=1';
      const params = { limit };

      if (filters.level) {
        query += ' AND Level = @level';
        params.level = filters.level;
      }

      if (filters.action) {
        query += ' AND Action = @action';
        params.action = filters.action;
      }

      if (filters.entity) {
        query += ' AND Entity = @entity';
        params.entity = filters.entity;
      }

      if (filters.dateFrom) {
        query += ' AND CreatedAt >= @dateFrom';
        params.dateFrom = filters.dateFrom;
      }

      if (filters.dateTo) {
        query += ' AND CreatedAt <= @dateTo';
        params.dateTo = filters.dateTo;
      }

      query += ' ORDER BY CreatedAt DESC';

      return await execute(query, params);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      throw error;
    }
  }

  static async getStats() {
    try {
      const stats = await execute(`
        SELECT 
          COUNT(*) as TotalLogs,
          COUNT(CASE WHEN Level = 'error' THEN 1 END) as ErrorCount,
          COUNT(CASE WHEN Level = 'warning' THEN 1 END) as WarningCount,
          COUNT(CASE WHEN Level = 'success' THEN 1 END) as SuccessCount,
          COUNT(CASE WHEN Level = 'info' THEN 1 END) as InfoCount
        FROM attendance.SystemLogs
        WHERE CreatedAt >= DATEADD(day, -7, GETDATE())
      `);

      return stats[0];
    } catch (error) {
      console.error('Failed to fetch log stats:', error);
      throw error;
    }
  }
}
