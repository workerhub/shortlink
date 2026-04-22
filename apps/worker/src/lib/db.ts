// Database table name helper — applies TABLE_PREFIX from env.
// The prefix is sanitized (alphanumeric + underscore only) to prevent SQL issues.
// TABLE_PREFIX is read-only at deploy time; changing it after initial setup requires
// migrating data to the new table names.

export function tbl(env: { TABLE_PREFIX?: string }, name: string): string {
  const prefix = (env.TABLE_PREFIX ?? '').replace(/[^a-zA-Z0-9_]/g, '')
  return prefix ? `${prefix}_${name}` : name
}
