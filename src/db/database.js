const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../sioms.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    -- Users
    CREATE TABLE IF NOT EXISTS users (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      email           TEXT UNIQUE NOT NULL,
      password        TEXT NOT NULL,
      role            TEXT NOT NULL DEFAULT 'Employee',
      is_active       INTEGER DEFAULT 1,
      email_verified  INTEGER DEFAULT 0,
      verify_code     TEXT,
      verify_expires  TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    -- Registration Requests (pending admin approval)
    CREATE TABLE IF NOT EXISTS register_requests (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      email           TEXT UNIQUE NOT NULL,
      requested_role  TEXT NOT NULL DEFAULT 'Employee',
      department      TEXT,
      phone           TEXT,
      reason          TEXT,
      status          TEXT DEFAULT 'Pending',
      verify_code     TEXT,
      verify_expires  TEXT,
      email_verified  INTEGER DEFAULT 0,
      admin_notes     TEXT,
      reviewed_by     TEXT,
      reviewed_at     TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    -- Employees
    CREATE TABLE IF NOT EXISTS employees (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      department  TEXT NOT NULL,
      position    TEXT NOT NULL,
      salary      REAL NOT NULL DEFAULT 8000,
      status      TEXT NOT NULL DEFAULT 'Active',
      join_date   TEXT NOT NULL,
      phone       TEXT,
      email       TEXT,
      attendance  INTEGER DEFAULT 100,
      avatar      TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- Attendance
    CREATE TABLE IF NOT EXISTS attendance (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id      TEXT NOT NULL,
      employee_name    TEXT NOT NULL,
      department       TEXT NOT NULL,
      date             TEXT NOT NULL,
      check_in         TEXT,
      check_out        TEXT,
      status           TEXT NOT NULL DEFAULT 'Present',
      check_in_method  TEXT DEFAULT 'manual',   -- 'manual' | 'qr'
      lat              REAL,                     -- GPS latitude at check-in
      lng              REAL,                     -- GPS longitude at check-in
      UNIQUE(employee_id, date)
    );

    -- Payroll
    CREATE TABLE IF NOT EXISTS payroll (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id          TEXT NOT NULL,
      employee_name        TEXT NOT NULL,
      department           TEXT NOT NULL,
      base_salary          REAL NOT NULL,
      overtime             REAL DEFAULT 0,
      bonus                REAL DEFAULT 0,
      penalties            REAL DEFAULT 0,
      tax_deduction        REAL DEFAULT 0,
      insurance_deduction  REAL DEFAULT 0,
      net_salary           REAL NOT NULL,
      month                TEXT NOT NULL,
      status               TEXT DEFAULT 'Pending',
      UNIQUE(employee_id, month)
    );

    -- Inventory
    CREATE TABLE IF NOT EXISTS inventory (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      sku          TEXT UNIQUE NOT NULL,
      name         TEXT NOT NULL,
      category     TEXT NOT NULL,
      quantity     INTEGER DEFAULT 0,
      min_stock    INTEGER DEFAULT 10,
      unit         TEXT DEFAULT 'pcs',
      unit_price   REAL DEFAULT 0,
      supplier     TEXT,
      location     TEXT,
      last_updated TEXT DEFAULT (date('now'))
    );

    -- Suppliers
    CREATE TABLE IF NOT EXISTS suppliers (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      contact       TEXT,
      email         TEXT,
      category      TEXT,
      total_orders  INTEGER DEFAULT 0,
      total_value   REAL DEFAULT 0,
      status        TEXT DEFAULT 'Active',
      rating        REAL DEFAULT 3.0,
      last_order    TEXT
    );

    -- Canteen Products
    CREATE TABLE IF NOT EXISTS canteen_products (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL,
      price    REAL NOT NULL,
      stock    INTEGER DEFAULT 0,
      category TEXT NOT NULL,
      sales    INTEGER DEFAULT 0
    );

    -- Canteen Transactions
    CREATE TABLE IF NOT EXISTS canteen_transactions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      items     TEXT NOT NULL,
      total     REAL NOT NULL,
      date      TEXT DEFAULT (date('now')),
      time      TEXT DEFAULT (time('now')),
      cashier   TEXT
    );

    -- Equipment (Workshop)
    CREATE TABLE IF NOT EXISTS equipment (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT NOT NULL,
      model             TEXT NOT NULL,
      status            TEXT DEFAULT 'Active',
      department        TEXT NOT NULL,
      last_maintenance  TEXT,
      next_maintenance  TEXT,
      condition         TEXT DEFAULT 'Good'
    );

    -- Maintenance Logs
    CREATE TABLE IF NOT EXISTS maintenance_logs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id   INTEGER NOT NULL,
      equipment_name TEXT NOT NULL,
      date           TEXT DEFAULT (date('now')),
      notes          TEXT,
      technician     TEXT,
      FOREIGN KEY(equipment_id) REFERENCES equipment(id)
    );

    -- Assets
    CREATE TABLE IF NOT EXISTS assets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id    TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      assigned_to TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      assign_date TEXT NOT NULL,
      return_date TEXT,
      status      TEXT DEFAULT 'In Use',
      condition   TEXT DEFAULT 'Good'
    );

    -- Leaves
    CREATE TABLE IF NOT EXISTS leaves (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee    TEXT NOT NULL,
      employee_id TEXT,
      type        TEXT NOT NULL,
      from_date   TEXT NOT NULL,
      to_date     TEXT NOT NULL,
      days        INTEGER NOT NULL,
      status      TEXT DEFAULT 'Pending',
      note        TEXT DEFAULT '',
      hr_note     TEXT DEFAULT '',
      source      TEXT DEFAULT 'hr',
      created_at  TEXT DEFAULT (datetime('now'))
    );
    -- Add columns if they don't exist (for existing DBs)

    -- Penalties
    CREATE TABLE IF NOT EXISTS penalties (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee    TEXT NOT NULL,
      reason      TEXT NOT NULL,
      amount      REAL NOT NULL,
      date        TEXT NOT NULL,
      status      TEXT DEFAULT 'Pending'
    );

    -- Purchase Orders
    -- Attendance Settings (configurable by Admin)
    CREATE TABLE IF NOT EXISTS attendance_settings (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      check_in_open   TEXT NOT NULL DEFAULT '07:00',
      late_after      TEXT NOT NULL DEFAULT '08:15',
      check_out_time  TEXT NOT NULL DEFAULT '16:00',
      overtime_rate   REAL NOT NULL DEFAULT 50,
      updated_by      TEXT,
      updated_at      TEXT DEFAULT (datetime('now'))
    );
    -- Seed default row
    INSERT OR IGNORE INTO attendance_settings (id) VALUES (1);

    -- Weekly Schedule (which days are working days)
    CREATE TABLE IF NOT EXISTS weekly_schedule (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      sunday     INTEGER DEFAULT 0,   -- 0=off, 1=working
      monday     INTEGER DEFAULT 1,
      tuesday    INTEGER DEFAULT 1,
      wednesday  INTEGER DEFAULT 1,
      thursday   INTEGER DEFAULT 1,
      friday     INTEGER DEFAULT 0,
      saturday   INTEGER DEFAULT 0,
      updated_by TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO weekly_schedule (id) VALUES (1);

    -- Public Holidays
    CREATE TABLE IF NOT EXISTS public_holidays (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number     TEXT UNIQUE NOT NULL,
      supplier_id   INTEGER NOT NULL,
      supplier      TEXT NOT NULL,
      items         TEXT NOT NULL,
      total         REAL NOT NULL DEFAULT 0,
      status        TEXT DEFAULT 'Pending',
      ordered_date  TEXT DEFAULT (date('now')),
      delivery_date TEXT,
      notes         TEXT,
      created_by    TEXT
    );

    -- Overtime Entries
    CREATE TABLE IF NOT EXISTS overtime_entries (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id  TEXT NOT NULL,
      employee     TEXT NOT NULL,
      department   TEXT NOT NULL,
      month        TEXT NOT NULL,
      hours        REAL NOT NULL DEFAULT 0,
      rate_per_hour REAL NOT NULL DEFAULT 0,
      total        REAL NOT NULL DEFAULT 0,
      note         TEXT DEFAULT '',
      created_at   TEXT DEFAULT (datetime('now'))
    );

    -- Bonus Entries
    CREATE TABLE IF NOT EXISTS bonus_entries (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id  TEXT NOT NULL,
      employee     TEXT NOT NULL,
      department   TEXT NOT NULL,
      month        TEXT NOT NULL,
      amount       REAL NOT NULL DEFAULT 0,
      reason       TEXT DEFAULT '',
      created_at   TEXT DEFAULT (datetime('now'))
    );

    -- Workshop Assignments
    CREATE TABLE IF NOT EXISTS workshop_assignments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id   INTEGER NOT NULL,
      equipment_name TEXT NOT NULL,
      assigned_to    TEXT NOT NULL,
      purpose        TEXT,
      start_date     TEXT NOT NULL,
      end_date       TEXT,
      status         TEXT DEFAULT 'Active'
    );
  `);

  // Add new columns to existing tables (safe migrations)
  const migrations = [
    "ALTER TABLE leaves ADD COLUMN employee_id TEXT",
    "ALTER TABLE leaves ADD COLUMN note TEXT DEFAULT ''",
    "ALTER TABLE leaves ADD COLUMN hr_note TEXT DEFAULT ''",
    "ALTER TABLE leaves ADD COLUMN source TEXT DEFAULT 'hr'",
    "ALTER TABLE attendance_settings ADD COLUMN overtime_rate REAL DEFAULT 50",
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch (_) { /* column already exists */ }
  }
}

module.exports = { getDb };
