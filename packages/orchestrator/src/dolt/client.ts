import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let pool: mysql.Pool | null = null;

interface DoltConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function loadConfig(): DoltConfig {
  // Try forge.config.json for defaults
  let configDefaults = { host: "localhost", port: 3306, database: "forge" };
  try {
    const configPath = resolve(import.meta.dirname, "../../../../forge.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    if (config.dolt) {
      configDefaults = { ...configDefaults, ...config.dolt };
    }
  } catch {
    // Use hardcoded defaults
  }

  return {
    host: process.env.DOLT_HOST || configDefaults.host,
    port: parseInt(process.env.DOLT_PORT || String(configDefaults.port), 10),
    user: process.env.DOLT_USER || "root",
    password: process.env.DOLT_PASSWORD || "",
    database: process.env.DOLT_DATABASE || configDefaults.database,
  };
}

export function getPool(): mysql.Pool {
  if (!pool) {
    const config = loadConfig();
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function query<T extends mysql.RowDataPacket[]>(
  sql: string,
  params?: unknown[],
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows] = await getPool().execute<T>(sql, params as any);
  return rows;
}

export async function execute(
  sql: string,
  params?: unknown[],
): Promise<mysql.ResultSetHeader> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result] = await getPool().execute<mysql.ResultSetHeader>(sql, params as any);
  return result;
}

export async function transaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
