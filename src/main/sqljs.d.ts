/**
 * Tipos mínimos para `sql.js` (el paquete no publica definiciones `.d.ts`).
 * Solo se declara la superficie que consume `src/main/database.ts`, que es el
 * único módulo que habla con el motor SQLite.
 */
declare module 'sql.js' {
  export type SqlValue = number | string | Uint8Array | null
  export type ParamsObject = Record<string, SqlValue>

  export interface QueryExecResult {
    columns: string[]
    values: SqlValue[][]
  }

  export interface Statement {
    bind(params?: SqlValue[] | ParamsObject): boolean
    step(): boolean
    get(): SqlValue[]
    getAsObject(): ParamsObject
    getColumnNames(): string[]
    run(params?: SqlValue[] | ParamsObject): void
    reset(): void
    free(): boolean
  }

  export interface Database {
    run(sql: string, params?: SqlValue[] | ParamsObject): Database
    exec(sql: string, params?: SqlValue[] | ParamsObject): QueryExecResult[]
    prepare(sql: string, params?: SqlValue[] | ParamsObject): Statement
    export(): Uint8Array
    close(): void
    getRowsModified(): number
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | null) => Database
  }

  export interface InitSqlJsConfig {
    wasmBinary?: ArrayLike<number> | ArrayBuffer
    locateFile?: (file: string) => string
  }

  export default function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsStatic>
}