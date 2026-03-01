const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const { auth, requirePermission } = require('../middleware/auth');
const { sendEmail, credentialEmailHtml, leaveStatusEmailHtml } = require('../utils/emailService');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789@#!';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── Leaves (HR/Admin view) ───────────────────────────────────────────────────

router.get('/leaves', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM leaves ORDER BY id DESC').all());
});

router.post('/leaves', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const { employee, employee_id, type, from_date, to_date, days } = req.body;
  if (!employee || !type || !from_date || !to_date)
    return res.status(400).json({ message: 'All fields required.' });
  const info = db.prepare(
    "INSERT INTO leaves (employee,employee_id,type,from_date,to_date,days,status,note,hr_note,source) VALUES (?,?,?,?,?,?,'Pending','','','hr')"
  ).run(employee, employee_id || null, type, from_date, to_date, days || 1);
  res.status(201).json(db.prepare('SELECT * FROM leaves WHERE id=?').get(info.lastInsertRowid));
});

// Update leave status + hr_note + send email to employee
async function updateLeaveStatus(req, res) {
  const db = getDb();
  const { status, hr_note } = req.body;
  if (!['Approved', 'Rejected', 'Pending'].includes(status))
    return res.status(400).json({ message: 'Invalid status.' });

  const id = parseInt(req.params.id);
  const leave = db.prepare('SELECT * FROM leaves WHERE id=?').get(id);
  if (!leave) return res.status(404).json({ message: 'Leave not found.' });

  // Update DB
  db.prepare('UPDATE leaves SET status=?, hr_note=? WHERE id=?')
    .run(status, hr_note !== undefined ? (hr_note || '') : (leave.hr_note || ''), id);

  const updated = db.prepare('SELECT * FROM leaves WHERE id=?').get(id);

  // Respond immediately — don't wait for email
  res.json(updated);

  // Send email in background (non-blocking)
  setImmediate(async () => {
    try {
      const emp = db.prepare('SELECT email, name FROM employees WHERE name=? OR employee_id=?')
        .get(leave.employee, leave.employee_id || '');
      const empEmail = emp?.email;
      if (!empEmail) {
        console.log(`[Email] No email found for employee: ${leave.employee}`);
        return;
      }
      console.log(`[Email] Sending leave status email to ${empEmail}...`);
      await sendEmail({
        to: empEmail,
        subject: `SIOMS — Leave Request ${status}`,
        html: leaveStatusEmailHtml({
          name: leave.employee,
          type: leave.type,
          from_date: leave.from_date,
          to_date: leave.to_date,
          days: leave.days,
          status,
          hr_note: hr_note || '',
          loginUrl: FRONTEND_URL,
        }),
      });
      console.log(`[Email] ✅ Sent to ${empEmail}`);
    } catch (e) {
      console.error(`[Email] ❌ Failed:`, e.message);
    }
  });
}

router.patch('/leaves/:id/status', auth, requirePermission('hr'), updateLeaveStatus);
router.post('/leaves/:id/status', auth, requirePermission('hr'), updateLeaveStatus);

// ─── Employee self-service leaves ────────────────────────────────────────────

router.post('/my-leaves', auth, (req, res) => {
  const db = getDb();
  const { type, from_date, to_date, reason } = req.body;
  if (!type || !from_date || !to_date)
    return res.status(400).json({ message: 'type, from_date, to_date are required.' });
  if (new Date(from_date) > new Date(to_date))
    return res.status(400).json({ message: 'from_date cannot be after to_date.' });

  const days = Math.ceil((new Date(to_date) - new Date(from_date)) / (1000 * 60 * 60 * 24)) + 1;
  const emp = db.prepare('SELECT * FROM employees WHERE email=?').get(req.user.email);
  const employeeName = emp ? emp.name : req.user.name;
  const employeeId = emp ? emp.employee_id : null;

  const info = db.prepare(
    "INSERT INTO leaves (employee,employee_id,type,from_date,to_date,days,status,note,hr_note,source) VALUES (?,?,?,?,?,?,'Pending',?,'','employee')"
  ).run(employeeName, employeeId, type, from_date, to_date, days, reason || '');

  res.status(201).json(db.prepare('SELECT * FROM leaves WHERE id=?').get(info.lastInsertRowid));
});

router.get('/my-leaves', auth, (req, res) => {
  const db = getDb();
  const emp = db.prepare('SELECT * FROM employees WHERE email=?').get(req.user.email);
  if (!emp)
    return res.json(db.prepare("SELECT * FROM leaves WHERE employee=? ORDER BY id DESC").all(req.user.name));
  res.json(db.prepare("SELECT * FROM leaves WHERE employee_id=? OR employee=? ORDER BY id DESC").all(emp.employee_id, emp.name));
});

// ─── Penalties ────────────────────────────────────────────────────────────────

router.get('/penalties', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const { month } = req.query;
  if (month) {
    res.json(db.prepare("SELECT * FROM penalties WHERE strftime('%Y-%m',date)=? ORDER BY date DESC").all(month));
  } else {
    res.json(db.prepare('SELECT * FROM penalties ORDER BY date DESC').all());
  }
});

router.post('/penalties', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const { employee, employee_id, reason, amount, date } = req.body;
  if (!employee || !reason || !amount)
    return res.status(400).json({ message: 'employee, reason, amount required.' });
  const info = db.prepare("INSERT INTO penalties (employee,reason,amount,date,status) VALUES (?,?,?,?,'Pending')")
    .run(employee, reason, amount, date || new Date().toISOString().split('T')[0]);
  res.status(201).json(db.prepare('SELECT * FROM penalties WHERE id=?').get(info.lastInsertRowid));
});

router.patch('/penalties/:id/status', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const { status } = req.body;
  db.prepare('UPDATE penalties SET status=? WHERE id=?').run(status, parseInt(req.params.id));
  res.json(db.prepare('SELECT * FROM penalties WHERE id=?').get(parseInt(req.params.id)));
});

// ─── Overtime Entries ─────────────────────────────────────────────────────────

router.get('/overtime', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const { month } = req.query;
  if (month) {
    res.json(db.prepare("SELECT * FROM overtime_entries WHERE month=? ORDER BY id DESC").all(month));
  } else {
    res.json(db.prepare("SELECT * FROM overtime_entries ORDER BY id DESC").all());
  }
});

router.post('/overtime', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const { employee_id, employee, department, month, hours, rate_per_hour, note } = req.body;
  if (!employee_id || !employee || !month || !hours)
    return res.status(400).json({ message: 'employee_id, employee, month, hours required.' });

  // Get overtime rate from settings if not provided
  const settings = db.prepare('SELECT overtime_rate FROM attendance_settings WHERE id=1').get();
  const rate = parseFloat(rate_per_hour) || settings?.overtime_rate || 50;
  const total = parseFloat(hours) * rate;

  // Check if entry exists for same employee+month, update it
  const existing = db.prepare('SELECT id FROM overtime_entries WHERE employee_id=? AND month=?').get(employee_id, month);
  if (existing) {
    db.prepare('UPDATE overtime_entries SET hours=?,rate_per_hour=?,total=?,note=? WHERE id=?')
      .run(parseFloat(hours), rate, total, note || '', existing.id);
    return res.json(db.prepare('SELECT * FROM overtime_entries WHERE id=?').get(existing.id));
  }

  const info = db.prepare(
    'INSERT INTO overtime_entries (employee_id,employee,department,month,hours,rate_per_hour,total,note) VALUES (?,?,?,?,?,?,?,?)'
  ).run(employee_id, employee, department || '', month, parseFloat(hours), rate, total, note || '');
  res.status(201).json(db.prepare('SELECT * FROM overtime_entries WHERE id=?').get(info.lastInsertRowid));
});

router.delete('/overtime/:id', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM overtime_entries WHERE id=?').run(parseInt(req.params.id));
  res.json({ message: 'Deleted.' });
});

// ─── Bonus Entries ────────────────────────────────────────────────────────────

router.get('/bonuses', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const { month } = req.query;
  if (month) {
    res.json(db.prepare("SELECT * FROM bonus_entries WHERE month=? ORDER BY id DESC").all(month));
  } else {
    res.json(db.prepare("SELECT * FROM bonus_entries ORDER BY id DESC").all());
  }
});

router.post('/bonuses', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const { employee_id, employee, department, month, amount, reason } = req.body;
  if (!employee_id || !employee || !month || !amount)
    return res.status(400).json({ message: 'employee_id, employee, month, amount required.' });

  const info = db.prepare(
    'INSERT INTO bonus_entries (employee_id,employee,department,month,amount,reason) VALUES (?,?,?,?,?,?)'
  ).run(employee_id, employee, department || '', month, parseFloat(amount), reason || '');
  res.status(201).json(db.prepare('SELECT * FROM bonus_entries WHERE id=?').get(info.lastInsertRowid));
});

router.delete('/bonuses/:id', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM bonus_entries WHERE id=?').run(parseInt(req.params.id));
  res.json({ message: 'Deleted.' });
});

// ─── Overtime Rate Setting ────────────────────────────────────────────────────

router.get('/overtime-rate', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const s = db.prepare('SELECT overtime_rate FROM attendance_settings WHERE id=1').get();
  res.json({ overtime_rate: s?.overtime_rate || 50 });
});

router.post('/overtime-rate', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const { rate } = req.body;
  if (!rate || isNaN(parseFloat(rate)))
    return res.status(400).json({ message: 'rate is required.' });
  db.prepare('UPDATE attendance_settings SET overtime_rate=? WHERE id=1').run(parseFloat(rate));
  res.json({ overtime_rate: parseFloat(rate) });
});

// ─── Bulk Employee Import ─────────────────────────────────────────────────────

router.post('/employees/bulk-import', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const { employees } = req.body;
  if (!Array.isArray(employees) || employees.length === 0)
    return res.status(400).json({ message: 'employees array is required.' });

  const results = { created: 0, skipped: 0, errors: [] };

  const importMany = db.transaction((rows) => {
    for (const row of rows) {
      try {
        const { name, department, position, salary, phone, email, joinDate, status } = row;
        if (!name || !department || !position) {
          results.errors.push(`Missing required fields: ${name || 'unnamed'}`);
          results.skipped++; continue;
        }
        if (email) {
          const existing = db.prepare('SELECT id FROM employees WHERE email=?').get(email);
          if (existing) { results.skipped++; continue; }
        }
        const maxId = db.prepare('SELECT MAX(id) as m FROM employees').get().m || 1000;
        const empId = `EMP-${String(maxId + 1).padStart(4, '0')}`;
        db.prepare(`
          INSERT INTO employees (employee_id,name,department,position,salary,status,join_date,phone,email,attendance,avatar)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          empId, name.trim(), department.trim(), position.trim(),
          parseFloat(salary) || 8000, status || 'Active',
          joinDate || new Date().toISOString().split('T')[0],
          phone || '', email || '', 100,
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${maxId + 1}`
        );
        results.created++;
      } catch (e) {
        results.errors.push(e.message);
        results.skipped++;
      }
    }
  });

  importMany(employees);
  res.json({ message: `Import complete: ${results.created} created, ${results.skipped} skipped.`, ...results });
});

// ─── Bulk Create Accounts ─────────────────────────────────────────────────────

router.post('/employees/bulk-create-accounts', auth, requirePermission('hr'), async (req, res) => {
  const db = getDb();
  const employees = db.prepare(`
    SELECT e.* FROM employees e
    WHERE e.email IS NOT NULL AND e.email != ''
    AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = e.email)
  `).all();

  if (employees.length === 0)
    return res.json({ message: 'All employees with emails already have accounts.', created: 0, failed: 0, details: [] });

  const results = { created: 0, failed: 0, details: [] };

  // ── Step 1: Create all accounts in DB first (fast, synchronous) ──
  const toEmail = []; // collect { emp, plainPass } for bulk email sending

  for (const emp of employees) {
    try {
      const plainPass = generatePassword();
      const hashed = bcrypt.hashSync(plainPass, 10);
      const uid = `EMP-USR-${emp.employee_id}`;

      db.prepare('INSERT OR IGNORE INTO users (id,name,email,password,role,is_active,email_verified) VALUES (?,?,?,?,?,1,1)')
        .run(uid, emp.name, emp.email.toLowerCase().trim(), hashed, 'Employee');

      results.created++;
      results.details.push({ name: emp.name, email: emp.email, status: 'created' });
      toEmail.push({ emp, plainPass });
    } catch (e) {
      results.failed++;
      results.details.push({ name: emp.name, email: emp.email || 'N/A', status: 'failed', error: e.message });
    }
  }

  // ── Step 2: Respond immediately so UI doesn't timeout ──
  res.json({ message: `Bulk accounts done: ${results.created} created, ${results.failed} failed. Sending emails...`, ...results });

  // ── Step 3: Send all emails in parallel (non-blocking, after response) ──
  setImmediate(async () => {
    const emailPromises = toEmail.map(({ emp, plainPass }) =>
      sendEmail({
        to: emp.email,
        subject: 'SIOMS — Your Employee Account Has Been Created',
        html: credentialEmailHtml({ name: emp.name, email: emp.email, password: plainPass, role: 'Employee', loginUrl: FRONTEND_URL }),
      }).then(() => console.log(`[Email] ✅ Sent to ${emp.email}`))
        .catch(err => console.error(`[Email] ❌ Failed for ${emp.email}:`, err.message))
    );
    await Promise.all(emailPromises);
    console.log(`[Email] Bulk email sending complete: ${toEmail.length} emails dispatched.`);
  });
});

module.exports = router;
