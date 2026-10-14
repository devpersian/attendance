import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_DATABASE || 'AttendanceDB',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'YourPassword123!',
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

export async function getPool() {
  if (!pool) {
    try {
      pool = await sql.connect(config);
      console.log('✅ Connected to SQL Server');
    } catch (err) {
      console.error('❌ Database connection failed:', err.message);
      throw err;
    }
  }
  return pool;
}

export async function query(text, params = []) {
  const poolInstance = await getPool();
  const request = poolInstance.request();
  
  params.forEach((param, index) => {
    request.input(`param${index}`, param);
  });
  
  const result = await request.query(text);
  return result.recordset;
}

// Coerce values for *Id parameters to integers (all PK/FK columns are now INT IDENTITY).
// Non-numeric strings and null/undefined are passed through unchanged so callers
// can still validate inputs and produce friendly errors.
function coerceIdParams(params) {
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (/Id$/i.test(key) && typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      out[key] = parseInt(value, 10);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function execute(text, params = {}) {
  const poolInstance = await getPool();
  const request = poolInstance.request();

  const coerced = coerceIdParams(params);
  Object.keys(coerced).forEach(key => {
    // UnitId is nullable (NULL = global role assignment): empty string -> NULL
    const value = key === 'UnitId' && (coerced[key] === '' || coerced[key] === undefined) ? null : coerced[key];
    request.input(key, value);
  });

  const result = await request.query(text);
  return result.recordset;
}

// Convenience helper for INSERTs into tables with INT IDENTITY(1,1) primary keys.
// Returns the newly generated Id (SCOPE_IDENTITY()).
export async function executeInsert(sqlText, params = {}) {
  const poolInstance = await getPool();
  const request = poolInstance.request();

  const coerced = coerceIdParams(params);
  Object.keys(coerced).forEach(key => {
    // UnitId is nullable (NULL = global role assignment): empty string -> NULL
    const value = key === 'UnitId' && (coerced[key] === '' || coerced[key] === undefined) ? null : coerced[key];
    request.input(key, value);
  });

  const result = await request.query(sqlText + '\nSELECT CAST(SCOPE_IDENTITY() AS INT) AS Id;');
  const recordsets = result.recordsets || [];
  const last = recordsets[recordsets.length - 1];
  const row = Array.isArray(last) ? last[0] : undefined;
  return row ? row.Id : null;
}

export { sql, config };
