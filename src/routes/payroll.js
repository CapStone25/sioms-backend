const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { auth, requirePermission } = require('../middleware/auth');

// ─── Build payroll for a given month (computed on the fly) ────────────────────
// Returns one record per active employee combining:
//   - base_salary from employees table
//   - overtime total from overtime_entries for that month
//   - bonus total from bonus_entries for that month
//   - penalties total from penalties table for that month (Approved ones)
//   - tax & insurance from payroll table if exists, else default rates
// The payroll table is used to store overrides (tax%, insurance%) and paid status.

function TAX_RATE() { return 0.10; }
function INS_RATE() { return 0.11; }

function buildPayrollForMonth(db, month) {
  // Ensure payroll rows exist for all active employees
  const employees = db.prepare("SELECT * FROM employees WHERE status='Active'").all();

  const ensureRow = db.transaction(() => {
    for (const emp of employees) {
      const existing = db.prepare('SELECT id FROM payroll WHERE employee_id=? AND month=?').get(emp.employee_id, month);
      if (!existing) {
        db.prepare(`
          INSERT OR IGNORE INTO payroll
            (employee_id,employee_name,department,base_salary,overtime,bonus,penalties,tax_deduction,insurance_deduction,net_salary,month,status)
          VALUES (?,?,?,?,0,0,0,0,0,?,?,'Pending')
        `).run(emp.employee_id, emp.name, emp.department, emp.salary, emp.salary * (1 - TAX_RATE() - INS_RATE()), month);
      }
    }
  });
  ensureRow();

  // Now fetch with real-time aggregations
  const rows = db.prepare(`
    SELECT
      p.id, p.employee_id, p.employee_name, p.department,
      e.salary as base_salary,
      COALESCE(ov.total_overtime, 0) as overtime,
      COALESCE(bo.total_bonus, 0) as bonus,
      COALESCE(pe.total_penalties, 0) as penalties,
      p.tax_deduction, p.insurance_deduction,
      p.month, p.status,
      p.tax_deduction as stored_tax,
      p.insurance_deduction as stored_ins
    FROM payroll p
    JOIN employees e ON e.employee_id = p.employee_id
    LEFT JOIN (
      SELECT employee_id, SUM(total) as total_overtime FROM overtime_entries WHERE month=? GROUP BY employee_id
    ) ov ON ov.employee_id = p.employee_id
    LEFT JOIN (
      SELECT employee_id, SUM(amount) as total_bonus FROM bonus_entries WHERE month=? GROUP BY employee_id
    ) bo ON bo.employee_id = p.employee_id
    LEFT JOIN (
      SELECT employee, SUM(amount) as total_penalties
      FROM penalties
      WHERE strftime('%Y-%m', date)=? AND status='Approved'
      GROUP BY employee
    ) pe ON pe.employee = p.employee_name
    WHERE p.month=?
    ORDER BY p.employee_name
  `).all(month, month, month, month);

  // Compute net salary and update stored values
  const update = db.prepare(`
    UPDATE payroll SET
      overtime=?, bonus=?, penalties=?,
      tax_deduction=?, insurance_deduction=?, net_salary=?
    WHERE employee_id=? AND month=?
  `);

  const updateAll = db.transaction(() => {
    for (const r of rows) {
      const tax = Math.round(r.base_salary * TAX_RATE());
      const ins = Math.round(r.base_salary * INS_RATE());
      const net = r.base_salary + r.overtime + r.bonus - r.penalties - tax - ins;
      update.run(r.overtime, r.bonus, r.penalties, tax, ins, net, r.employee_id, month);
    }
  });
  updateAll();

  // Re-fetch with updated values
  return db.prepare(`SELECT * FROM payroll WHERE month=? ORDER BY employee_name`).all(month);
}

function toFront(p) {
  return p ? {
    id: p.id,
    employeeId: p.employee_id,
    employeeName: p.employee_name,
    department: p.department,
    baseSalary: p.base_salary,
    overtime: p.overtime,
    bonus: p.bonus,
    penalties: p.penalties,
    taxDeduction: p.tax_deduction,
    insuranceDeduction: p.insurance_deduction,
    netSalary: p.net_salary,
    month: p.month,
    status: p.status,
  } : null;
}

// ─── GET /payroll?month=2025-01 ───────────────────────────────────────────────

router.get('/', auth, requirePermission('payroll'), (req, res) => {
  const db = getDb();
  const { search = '', department = '', status = '', month, page = 1, limit = 50 } = req.query;

  // Default to current month
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const targetMonth = month || currentMonth;

  // Build/sync payroll for target month
  buildPayrollForMonth(db, targetMonth);

  let where = 'WHERE month=?';
  const params = [targetMonth];
  if (search)     { where += ' AND (employee_name LIKE ? OR employee_id LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (department) { where += ' AND department=?'; params.push(department); }
  if (status)     { where += ' AND status=?'; params.push(status); }

  const total  = db.prepare(`SELECT COUNT(*) as cnt FROM payroll ${where}`).get(...params).cnt;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const data   = db.prepare(`SELECT * FROM payroll ${where} LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);

  res.json({ data: data.map(toFront), total, page: parseInt(page), limit: parseInt(limit), month: targetMonth });
});

// ─── GET /payroll/summary?month=2025-01 ──────────────────────────────────────

router.get('/summary', auth, requirePermission('payroll'), (req, res) => {
  const db = getDb();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = req.query.month || currentMonth;

  buildPayrollForMonth(db, month);

  const { totalPayroll, avgSalary } = db.prepare(
    'SELECT SUM(net_salary) as totalPayroll, AVG(net_salary) as avgSalary FROM payroll WHERE month=?'
  ).get(month);
  const paid    = db.prepare("SELECT COUNT(*) as cnt FROM payroll WHERE month=? AND status='Paid'").get(month).cnt;
  const pending = db.prepare("SELECT COUNT(*) as cnt FROM payroll WHERE month=? AND status='Pending'").get(month).cnt;
  const total   = db.prepare('SELECT COUNT(*) as cnt FROM payroll WHERE month=?').get(month).cnt;

  res.json({ totalPayroll: Math.round(totalPayroll || 0), paid, pending, avgSalary: Math.round(avgSalary || 0), totalEmployees: total, month });
});

// ─── GET available months ─────────────────────────────────────────────────────

router.get('/months', auth, requirePermission('payroll'), (req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT DISTINCT month FROM payroll ORDER BY month DESC").all();
  // Always include current month
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const months = [...new Set([currentMonth, ...rows.map(r => r.month)])].sort().reverse();
  res.json(months);
});

// ─── Employee self-service: view own payroll ──────────────────────────────────
router.get('/my-payroll', auth, (req, res) => {
  const db = getDb();
  // Find employee record linked to this user
  const emp = db.prepare('SELECT * FROM employees WHERE email=?').get(req.user.email);
  if (!emp) return res.status(404).json({ message: 'No employee record linked to your account.' });

// ─── GET /payroll/:employeeId?month=2025-01 ───────────────────────────────────

router.get('/:employeeId', auth, requirePermission('payroll'), (req, res) => {
  const db = getDb();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = req.query.month || currentMonth;

  buildPayrollForMonth(db, month);
  const p = db.prepare('SELECT * FROM payroll WHERE employee_id=? AND month=?').get(req.params.employeeId, month);
  if (!p) return res.status(404).json({ message: 'Payroll record not found.' });
  res.json(toFront(p));
});

// ─── PUT /payroll/:employeeId — manual override (tax/insurance rates) ─────────

router.put('/:employeeId', auth, requirePermission('payroll'), (req, res) => {
  const db = getDb();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = req.query.month || req.body.month || currentMonth;

  const p = db.prepare('SELECT * FROM payroll WHERE employee_id=? AND month=?').get(req.params.employeeId, month);
  if (!p) return res.status(404).json({ message: 'Payroll record not found.' });

  const { status } = req.body;
  if (status) db.prepare('UPDATE payroll SET status=? WHERE employee_id=? AND month=?').run(status, req.params.employeeId, month);

  // Rebuild to return fresh data
  buildPayrollForMonth(db, month);
  res.json(toFront(db.prepare('SELECT * FROM payroll WHERE employee_id=? AND month=?').get(req.params.employeeId, month)));
});

// ─── Mark as paid ─────────────────────────────────────────────────────────────

router.post('/:employeeId/pay', auth, requirePermission('payroll'), (req, res) => {
  const db = getDb();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = req.query.month || req.body.month || currentMonth;

  db.prepare("UPDATE payroll SET status='Paid' WHERE employee_id=? AND month=?").run(req.params.employeeId, month);
  res.json({ message: 'Marked as paid.', record: toFront(db.prepare('SELECT * FROM payroll WHERE employee_id=? AND month=?').get(req.params.employeeId, month)) });
});

// ─── Bulk pay all for a month ─────────────────────────────────────────────────

router.post('/bulk/pay-all', auth, requirePermission('payroll'), (req, res) => {
  const db = getDb();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = req.body.month || currentMonth;

  buildPayrollForMonth(db, month);
  const info = db.prepare("UPDATE payroll SET status='Paid' WHERE status='Pending' AND month=?").run(month);
  res.json({ message: `${info.changes} records marked as paid for ${month}.` });
});



  // Get all months this employee has payroll data
  const rows = db.prepare(
    'SELECT * FROM payroll WHERE employee_id=? ORDER BY month DESC'
  ).all(emp.employee_id);

  // For each month, enrich with overtime and bonus
  const enriched = rows.map(p => {
    const ot = db.prepare('SELECT COALESCE(SUM(total),0) as t FROM overtime_entries WHERE employee_id=? AND month=?')
      .get(emp.employee_id, p.month);
    const bo = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM bonus_entries WHERE employee_id=? AND month=?')
      .get(emp.employee_id, p.month);
    const pe = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM penalties WHERE employee=? AND strftime('%Y-%m',date)=? AND status='Approved'")
      .get(emp.name, p.month);
    const overtime = ot.t || 0;
    const bonus    = bo.t || 0;
    const penalties = pe.t || 0;
    const tax = Math.round(p.base_salary * 0.10);
    const ins = Math.round(p.base_salary * 0.11);
    const net = p.base_salary + overtime + bonus - penalties - tax - ins;
    return {
      id: p.id,
      employeeId: p.employee_id,
      employeeName: p.employee_name,
      department: p.department,
      baseSalary: p.base_salary,
      overtime,
      bonus,
      penalties,
      taxDeduction: tax,
      insuranceDeduction: ins,
      netSalary: net,
      month: p.month,
      status: p.status,
    };
  });

  res.json({ employee: { name: emp.name, employeeId: emp.employee_id, department: emp.department, position: emp.position }, payroll: enriched });
});

module.exports = router;
