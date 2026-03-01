const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { getDb } = require('../db/database');
const { auth, requirePermission } = require('../middleware/auth');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toFront = (a) => ({
  id: a.id, employeeId: a.employee_id, employeeName: a.employee_name,
  department: a.department, date: a.date, checkIn: a.check_in,
  checkOut: a.check_out, status: a.status,
  checkInMethod: a.check_in_method || 'manual',
  lat: a.lat, lng: a.lng,
});

/** Haversine distance in metres */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/** Get current settings (always returns a row) */
function getSettings(db) {
  return db.prepare('SELECT * FROM attendance_settings WHERE id=1').get()
    || { check_in_open: '07:00', late_after: '08:15', check_out_time: '16:00' };
}

/** "HH:MM" → total minutes */
function toMinutes(hhmm) {
  const [h, m] = (hhmm || '08:15').split(':').map(Number);
  return h * 60 + m;
}

/** Is the current time past the late threshold? */
function isLateNow(settings) {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins > toMinutes(settings.late_after);
}

// ─── Settings CRUD ────────────────────────────────────────────────────────────

/** GET /attendance/settings */
router.get('/settings', auth, requirePermission('attendance'), (req, res) => {
  const db = getDb();
  res.json(getSettings(db));
});

/** PUT /attendance/settings  (Admin only) */
router.put('/settings', auth, (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'HR')
    return res.status(403).json({ message: 'Admin or HR only.' });
  const db = getDb();
  const { check_in_open, late_after, check_out_time } = req.body;
  db.prepare(`
    UPDATE attendance_settings
    SET check_in_open=COALESCE(?,check_in_open),
        late_after=COALESCE(?,late_after),
        check_out_time=COALESCE(?,check_out_time),
        updated_by=?, updated_at=datetime('now')
    WHERE id=1
  `).run(check_in_open||null, late_after||null, check_out_time||null, req.user.name);
  res.json(getSettings(db));
});

// ─── Weekly Schedule CRUD ─────────────────────────────────────────────────────

function getWeeklySchedule(db) {
  return db.prepare('SELECT * FROM weekly_schedule WHERE id=1').get()
    || { sunday:0, monday:1, tuesday:1, wednesday:1, thursday:1, friday:0, saturday:0 };
}

function getPublicHolidays(db, from, to) {
  if (from && to) {
    return db.prepare('SELECT * FROM public_holidays WHERE date BETWEEN ? AND ? ORDER BY date').all(from, to);
  }
  return db.prepare('SELECT * FROM public_holidays ORDER BY date').all();
}

function isWorkingDay(db, dateStr) {
  // Check public holiday
  const holiday = db.prepare('SELECT * FROM public_holidays WHERE date=?').get(dateStr);
  if (holiday) return { working: false, reason: 'holiday', holidayName: holiday.name };

  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  const sched = getWeeklySchedule(db);
  if (!sched[dayNames[dow]]) return { working: false, reason: 'weekend' };
  return { working: true };
}

/** GET /attendance/schedule */
router.get('/schedule', auth, requirePermission('attendance'), (req, res) => {
  const db = getDb();
  res.json(getWeeklySchedule(db));
});

/** PUT /attendance/schedule (Admin/HR) */
router.put('/schedule', auth, (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'HR')
    return res.status(403).json({ message: 'Admin or HR only.' });
  const db = getDb();
  const { sunday=0, monday=1, tuesday=1, wednesday=1, thursday=1, friday=0, saturday=0 } = req.body;
  db.prepare(`
    UPDATE weekly_schedule SET sunday=?,monday=?,tuesday=?,wednesday=?,thursday=?,friday=?,saturday=?,
    updated_by=?,updated_at=datetime('now') WHERE id=1
  `).run(sunday?1:0, monday?1:0, tuesday?1:0, wednesday?1:0, thursday?1:0, friday?1:0, saturday?1:0, req.user.name);
  res.json(getWeeklySchedule(db));
});

/** GET /attendance/holidays?from=YYYY-MM-DD&to=YYYY-MM-DD */
router.get('/holidays', auth, requirePermission('attendance'), (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  res.json(getPublicHolidays(db, from, to));
});

/** POST /attendance/holidays (Admin/HR) */
router.post('/holidays', auth, (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'HR')
    return res.status(403).json({ message: 'Admin or HR only.' });
  const db = getDb();
  const { date, name } = req.body;
  if (!date || !name) return res.status(400).json({ message: 'date and name required.' });
  try {
    db.prepare('INSERT INTO public_holidays (date,name,created_by) VALUES (?,?,?)')
      .run(date, name, req.user.name);
    res.status(201).json({ id: db.prepare('SELECT last_insert_rowid() as id').get().id, date, name });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ message: 'Holiday already exists for that date.' });
    throw e;
  }
});

/** DELETE /attendance/holidays/:id (Admin/HR) */
router.delete('/holidays/:id', auth, (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'HR')
    return res.status(403).json({ message: 'Admin or HR only.' });
  const db = getDb();
  db.prepare('DELETE FROM public_holidays WHERE id=?').run(parseInt(req.params.id));
  res.json({ message: 'Deleted.' });
});

/**
 * GET /attendance/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns a calendar view of the week/range with working-day info
 */
router.get('/calendar', auth, requirePermission('attendance'), (req, res) => {
  const db = getDb();
  const from = req.query.from || new Date().toISOString().split('T')[0];
  const to   = req.query.to   || from;
  const settings = getSettings(db);
  const schedule = getWeeklySchedule(db);
  const holidays = getPublicHolidays(db, from, to);

  const result = [];
  const cur = new Date(from + 'T12:00:00');
  const end = new Date(to   + 'T12:00:00');
  while (cur <= end) {
    const dateStr = cur.toISOString().split('T')[0];
    const check = isWorkingDay(db, dateStr);
    const holiday = holidays.find(h => h.date === dateStr);
    // Get attendance stats for that day
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status='Late' THEN 1 ELSE 0 END) as late,
        SUM(CASE WHEN status='Absent' THEN 1 ELSE 0 END) as absent
      FROM attendance WHERE date=?
    `).get(dateStr);

    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    result.push({
      date: dateStr,
      dayName: dayNames[cur.getDay()],
      isWorking: check.working,
      reason: check.reason || null,
      holidayName: holiday?.name || null,
      stats: check.working ? stats : null,
      settings: { check_in_open: settings.check_in_open, late_after: settings.late_after, check_out_time: settings.check_out_time },
    });
    cur.setDate(cur.getDate() + 1);
  }
  res.json(result);
});

// ─── Mark All Late (Admin / HR button) ───────────────────────────────────────

/**
 * POST /attendance/mark-late-now
 * Marks everyone who has checked in AFTER the late threshold as "Late",
 * and anyone who hasn't checked in at all as "Absent".
 * Called by Admin clicking "Lock Check-In & Mark Late".
 */
router.post('/mark-late-now', auth, (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'HR')
    return res.status(403).json({ message: 'Admin or HR only.' });

  const db = getDb();
  const settings = getSettings(db);
  const today    = new Date().toISOString().split('T')[0];

  // Update already-checked-in employees whose check_in is after late_after
  const updatedLate = db.prepare(`
    UPDATE attendance
    SET status='Late'
    WHERE date=? AND check_in IS NOT NULL AND status='Present'
      AND check_in > ?
  `).run(today, settings.late_after);

  res.json({
    message: `Done. Marked late based on threshold ${settings.late_after}.`,
    markedLate: updatedLate.changes,
  });
});

// ─── List / Summary / Chart ──────────────────────────────────────────────────

router.get('/', auth, requirePermission('attendance'), (req, res) => {
  const db = getDb();
  const { date, employeeId, department, status, page=1, limit=50 } = req.query;
  let where = 'WHERE 1=1'; const params = [];
  if (date)       { where += ' AND date=?';        params.push(date); }
  if (employeeId) { where += ' AND employee_id=?'; params.push(employeeId); }
  if (department) { where += ' AND department=?';  params.push(department); }
  if (status)     { where += ' AND status=?';      params.push(status); }

  const total  = db.prepare(`SELECT COUNT(*) as cnt FROM attendance ${where}`).get(...params).cnt;
  const offset = (parseInt(page)-1)*parseInt(limit);
  const data   = db.prepare(`SELECT * FROM attendance ${where} ORDER BY date DESC, employee_name LIMIT ? OFFSET ?`)
    .all(...params, parseInt(limit), offset);
  res.json({ data: data.map(toFront), total, page: parseInt(page), limit: parseInt(limit) });
});

router.get('/summary', auth, requirePermission('attendance'), (req, res) => {
  const db   = getDb();
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const rows = db.prepare('SELECT status, COUNT(*) as cnt FROM attendance WHERE date=? GROUP BY status').all(date);
  const result = { present:0, absent:0, late:0, weekend:0, total:0 };
  rows.forEach(r => { result[r.status.toLowerCase()] = r.cnt; result.total += r.cnt; });
  res.json(result);
});

router.get('/chart', auth, requirePermission('attendance'), (req, res) => {
  res.json([
    { day:'Mon', present:182, absent:12, late:8 },
    { day:'Tue', present:188, absent:8,  late:6 },
    { day:'Wed', present:175, absent:15, late:12 },
    { day:'Thu', present:191, absent:5,  late:6 },
    { day:'Fri', present:165, absent:20, late:17 },
  ]);
});

// ─── Employee: Get My Record for Today ───────────────────────────────────────

/**
 * GET /attendance/my-today
 * Employee hits this to see their own today's record (if any).
 * Uses the logged-in user's employeeId from JWT.
 */
router.get('/my-today', auth, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  // Try multiple ways to find the employee:
  // 1. By employeeId stored in JWT (set at login time)
  // 2. By email from JWT
  let emp = null;
  if (req.user.employeeId) {
    emp = db.prepare('SELECT * FROM employees WHERE employee_id=?').get(req.user.employeeId);
  }
  if (!emp && req.user.email) {
    emp = db.prepare('SELECT * FROM employees WHERE email=?').get(req.user.email);
  }
  if (!emp) {
    return res.status(404).json({
      message: 'Employee profile not linked to your account. Ask Admin to set up your login via HR → Employee → Set Login.',
    });
  }

  const record   = db.prepare('SELECT * FROM attendance WHERE employee_id=? AND date=?').get(emp.employee_id, today);
  const settings = getSettings(db);

  res.json({ settings, today, record: record ? toFront(record) : null,
    employeeId: emp.employee_id, name: emp.name, department: emp.department });
});

// ─── Manual Check-In ─────────────────────────────────────────────────────────

router.post('/check-in', auth, requirePermission('attendance'), (req, res) => {
  const db = getDb();
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ message: 'employeeId required.' });

  const emp = db.prepare('SELECT * FROM employees WHERE employee_id=? OR CAST(id AS TEXT)=?')
    .get(employeeId, employeeId);
  if (!emp) return res.status(404).json({ message: 'Employee not found.' });

  const today    = new Date().toISOString().split('T')[0];

  // Check if today is a working day
  const dayCheck = isWorkingDay(db, today);
  if (!dayCheck.working) {
    const reason = dayCheck.reason === 'holiday'
      ? `Today is a public holiday (${dayCheck.holidayName}). No check-in allowed.`
      : 'Today is a day off (weekend). No check-in allowed.';
    return res.status(400).json({ message: reason });
  }

  const existing = db.prepare('SELECT * FROM attendance WHERE employee_id=? AND date=?')
    .get(emp.employee_id, today);
  if (existing) return res.status(409).json({ message: 'Already checked in today.', record: toFront(existing) });

  const now      = new Date();
  const nowMins  = now.getHours() * 60 + now.getMinutes();
  const settings = getSettings(db);
  const openMins = toMinutes(settings.check_in_open);

  if (nowMins < openMins) {
    return res.status(400).json({
      message: `Check-in not open yet. Opens at ${settings.check_in_open}.`,
      opensAt: settings.check_in_open,
    });
  }

  // Close check-in after checkout time (end of working day)
  const checkoutMins = toMinutes(settings.check_out_time);
  if (nowMins >= checkoutMins) {
    return res.status(400).json({
      message: `Today's attendance is closed. Checkout time (${settings.check_out_time}) has passed. See you tomorrow!`,
      closedAt: settings.check_out_time,
    });
  }

  const checkIn  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const status   = isLateNow(settings) ? 'Late' : 'Present';

  const info = db.prepare(
    'INSERT INTO attendance (employee_id,employee_name,department,date,check_in,status,check_in_method) VALUES (?,?,?,?,?,?,?)'
  ).run(emp.employee_id, emp.name, emp.department, today, checkIn, status, 'manual');
  res.status(201).json(toFront(db.prepare('SELECT * FROM attendance WHERE id=?').get(info.lastInsertRowid)));
});

// ─── Check-Out ────────────────────────────────────────────────────────────────

router.post('/check-out/:recordId', auth, requirePermission('attendance'), (req, res) => {
  const db     = getDb();
  const record = db.prepare('SELECT * FROM attendance WHERE id=?').get(parseInt(req.params.recordId));
  if (!record)           return res.status(404).json({ message: 'Record not found.' });
  if (record.check_out)  return res.status(409).json({ message: 'Already checked out.', record: toFront(record) });
  const now      = new Date();
  const checkOut = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  db.prepare('UPDATE attendance SET check_out=? WHERE id=?').run(checkOut, record.id);
  res.json(toFront(db.prepare('SELECT * FROM attendance WHERE id=?').get(record.id)));
});

/**
 * POST /attendance/my-checkout
 * Employee checks themselves out using their own JWT (no need to know recordId).
 */
router.post('/my-checkout', auth, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  let emp = null;
  if (req.user.employeeId) {
    emp = db.prepare('SELECT * FROM employees WHERE employee_id=?').get(req.user.employeeId);
  }
  if (!emp && req.user.email) {
    emp = db.prepare('SELECT * FROM employees WHERE email=?').get(req.user.email);
  }
  if (!emp) return res.status(404).json({ message: 'Employee profile not linked.' });

  const record = db.prepare('SELECT * FROM attendance WHERE employee_id=? AND date=?').get(emp.employee_id, today);
  if (!record)          return res.status(404).json({ message: 'No check-in found for today.' });
  if (record.check_out) return res.status(409).json({ message: 'Already checked out.', record: toFront(record) });

  const now      = new Date();
  const checkOut = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  db.prepare('UPDATE attendance SET check_out=? WHERE id=?').run(checkOut, record.id);
  res.json({ message: 'Checked out successfully!', record: toFront(db.prepare('SELECT * FROM attendance WHERE id=?').get(record.id)) });
});

router.put('/:id', auth, requirePermission('attendance'), (req, res) => {
  const db     = getDb();
  const record = db.prepare('SELECT * FROM attendance WHERE id=?').get(parseInt(req.params.id));
  if (!record) return res.status(404).json({ message: 'Record not found.' });
  const { check_in=record.check_in, check_out=record.check_out, status=record.status } = req.body;
  db.prepare('UPDATE attendance SET check_in=?,check_out=?,status=? WHERE id=?')
    .run(check_in, check_out, status, record.id);
  res.json(toFront(db.prepare('SELECT * FROM attendance WHERE id=?').get(record.id)));
});

// ─── QR Code System ──────────────────────────────────────────────────────────

router.get('/qr/:employeeId', auth, requirePermission('attendance'), (req, res) => {
  const db  = getDb();
  const emp = db.prepare('SELECT * FROM employees WHERE employee_id=? OR CAST(id AS TEXT)=?')
    .get(req.params.employeeId, req.params.employeeId);
  if (!emp) return res.status(404).json({ message: 'Employee not found.' });

  const today   = new Date().toISOString().split('T')[0];
  const secret  = process.env.QR_SECRET || 'sioms-qr-secret-key';
  const token   = crypto.createHmac('sha256', secret)
    .update(`${emp.employee_id}:${today}`).digest('hex').slice(0, 32);

  const payload = { type:'sioms-attendance', employeeId:emp.employee_id, name:emp.name, department:emp.department, date:today, token };
  res.json({ employeeId:emp.employee_id, name:emp.name, department:emp.department,
    qrData: JSON.stringify(payload), dailyToken: token, validUntil:`${today}T23:59:59` });
});

/**
 * POST /attendance/qr-checkin
 * Can be called by the employee themselves (self check-in via Employee Dashboard)
 * or by Admin/HR (scanner at the door).
 * Body: { qrData, lat?, lng? }
 */
router.post('/qr-checkin', auth, requirePermission('attendance'), (req, res) => {
  const db = getDb();
  const { qrData, lat, lng } = req.body;

  let payload;
  try { payload = JSON.parse(qrData); }
  catch { return res.status(400).json({ message: 'Invalid QR data.' }); }

  if (payload.type !== 'sioms-attendance')
    return res.status(400).json({ message: 'Not a SIOMS attendance QR code.' });

  const today = new Date().toISOString().split('T')[0];
  if (payload.date !== today)
    return res.status(400).json({ message: 'QR expired. Use today\'s QR code.' });

  const secret   = process.env.QR_SECRET || 'sioms-qr-secret-key';
  const expected = crypto.createHmac('sha256', secret)
    .update(`${payload.employeeId}:${today}`).digest('hex').slice(0, 32);
  if (payload.token !== expected)
    return res.status(401).json({ message: 'Invalid QR token. Possible tampering.' });

  // GPS check
  const schoolLat    = parseFloat(process.env.SCHOOL_LAT || '0');
  const schoolLng    = parseFloat(process.env.SCHOOL_LNG || '0');
  const schoolRadius = parseFloat(process.env.SCHOOL_RADIUS_M || '0');
  if (schoolLat && schoolLng && schoolRadius && lat != null && lng != null) {
    const dist = haversine(parseFloat(lat), parseFloat(lng), schoolLat, schoolLng);
    if (dist > schoolRadius)
      return res.status(403).json({
        message: `You are ${Math.round(dist)}m from school. Must be within ${schoolRadius}m.`,
        distanceM: Math.round(dist), allowedRadius: schoolRadius,
      });
  }

  const emp = db.prepare('SELECT * FROM employees WHERE employee_id=?').get(payload.employeeId);
  if (!emp) return res.status(404).json({ message: 'Employee not found.' });

  const existing = db.prepare('SELECT * FROM attendance WHERE employee_id=? AND date=?').get(emp.employee_id, today);
  if (existing) return res.status(409).json({ message: 'Already checked in today.', record: toFront(existing) });

  // Check working day
  const dayCheck = isWorkingDay(db, today);
  if (!dayCheck.working) {
    const reason = dayCheck.reason === 'holiday'
      ? `Today is a public holiday (${dayCheck.holidayName}). No check-in allowed.`
      : 'Today is a day off (weekend). No check-in allowed.';
    return res.status(400).json({ message: reason });
  }

  const now      = new Date();
  const nowMins  = now.getHours() * 60 + now.getMinutes();
  const settings = getSettings(db);
  const openMins = toMinutes(settings.check_in_open);
  if (nowMins < openMins) {
    return res.status(400).json({
      message: `Check-in not open yet. Opens at ${settings.check_in_open}.`,
      opensAt: settings.check_in_open,
    });
  }
  // Close check-in after checkout time
  const checkoutMinsQr = toMinutes(settings.check_out_time);
  if (nowMins >= checkoutMinsQr) {
    return res.status(400).json({
      message: `Today's attendance is closed. Checkout time (${settings.check_out_time}) has passed. See you tomorrow!`,
      closedAt: settings.check_out_time,
    });
  }
  const checkIn  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const status   = isLateNow(settings) ? 'Late' : 'Present';

  const info = db.prepare(
    'INSERT INTO attendance (employee_id,employee_name,department,date,check_in,status,check_in_method,lat,lng) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(emp.employee_id, emp.name, emp.department, today, checkIn, status, 'qr', lat||null, lng||null);

  res.status(201).json({
    message: 'Check-in successful! ✅',
    record: toFront(db.prepare('SELECT * FROM attendance WHERE id=?').get(info.lastInsertRowid)),
  });
});

/**
 * GET /attendance/my-qr
 * Employee gets their OWN QR for today (self-service).
 */
router.get('/my-qr', auth, (req, res) => {
  const db  = getDb();
  let emp = null;
  if (req.user.employeeId) {
    emp = db.prepare('SELECT * FROM employees WHERE employee_id=?').get(req.user.employeeId);
  }
  if (!emp && req.user.email) {
    emp = db.prepare('SELECT * FROM employees WHERE email=?').get(req.user.email);
  }
  if (!emp) return res.status(404).json({ message: 'Employee profile not linked. Ask Admin to set up your login.' });

  const today   = new Date().toISOString().split('T')[0];
  const secret  = process.env.QR_SECRET || 'sioms-qr-secret-key';
  const token   = crypto.createHmac('sha256', secret)
    .update(`${emp.employee_id}:${today}`).digest('hex').slice(0, 32);

  const payload = { type:'sioms-attendance', employeeId:emp.employee_id, name:emp.name, department:emp.department, date:today, token };
  res.json({
    employeeId: emp.employee_id, name: emp.name, department: emp.department,
    qrData: JSON.stringify(payload), validUntil: `${today}T23:59:59`,
    settings: getSettings(db),
  });
});

// ─── Auto Checkout (called at checkout time) ─────────────────────────────────

/**
 * POST /attendance/auto-checkout
 * Automatically checks out all employees who checked in but forgot to check out.
 * Sets check_out to the scheduled check_out_time.
 * Should be called when checkout time arrives.
 */
router.post('/auto-checkout', auth, (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'HR')
    return res.status(403).json({ message: 'Admin or HR only.' });

  const db = getDb();
  const settings = getSettings(db);
  const today = new Date().toISOString().split('T')[0];

  // Auto checkout everyone who checked in but has no checkout
  const result = db.prepare(`
    UPDATE attendance
    SET check_out = ?
    WHERE date = ? AND check_in IS NOT NULL AND check_out IS NULL
  `).run(settings.check_out_time, today);

  res.json({
    message: `Auto checkout done. ${result.changes} employee(s) checked out at ${settings.check_out_time}.`,
    autoCheckedOut: result.changes,
    checkOutTime: settings.check_out_time,
  });
});

/**
 * POST /attendance/process-day
 * Full end-of-day processing for Admin:
 * 1. Auto checkout everyone who checked in but didn't check out
 * 2. Mark as Absent all active employees with no attendance record today
 * 3. Returns summary data for export
 */
router.post('/process-day', auth, (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'HR')
    return res.status(403).json({ message: 'Admin or HR only.' });

  const db = getDb();
  const settings = getSettings(db);
  const today = new Date().toISOString().split('T')[0];

  // Step 1: Auto checkout employees who have check_in but no check_out
  const autoCheckout = db.prepare(`
    UPDATE attendance
    SET check_out = ?
    WHERE date = ? AND check_in IS NOT NULL AND check_out IS NULL
  `).run(settings.check_out_time, today);

  // Step 2: Get all active employees
  const allEmployees = db.prepare("SELECT * FROM employees WHERE status='Active'").all();

  // Step 3: Find employees with no attendance record today → mark Absent
  const existingIds = db.prepare('SELECT employee_id FROM attendance WHERE date=?')
    .all(today).map(r => r.employee_id);

  const absent = allEmployees.filter(e => !existingIds.includes(e.employee_id));
  let markedAbsent = 0;
  for (const emp of absent) {
    db.prepare(`
      INSERT INTO attendance (employee_id, employee_name, department, date, status, check_in_method)
      VALUES (?, ?, ?, ?, 'Absent', 'auto')
    `).run(emp.employee_id, emp.name, emp.department, today);
    markedAbsent++;
  }

  // Step 4: Return all today's records for export
  const allRecords = db.prepare('SELECT * FROM attendance WHERE date=? ORDER BY employee_name').all(today);

  res.json({
    message: `Day processed successfully.`,
    autoCheckedOut: autoCheckout.changes,
    markedAbsent,
    checkOutTime: settings.check_out_time,
    records: allRecords.map(toFront),
    summary: {
      total: allRecords.length,
      present: allRecords.filter(r => r.status === 'Present').length,
      late: allRecords.filter(r => r.status === 'Late').length,
      absent: allRecords.filter(r => r.status === 'Absent').length,
    }
  });
});

/** GET /attendance/qr-bulk */
router.get('/qr-bulk', auth, requirePermission('attendance'), (req, res) => {
  const db        = getDb();
  const employees = db.prepare("SELECT * FROM employees WHERE status='Active'").all();
  const today     = new Date().toISOString().split('T')[0];
  const secret    = process.env.QR_SECRET || 'sioms-qr-secret-key';
  const result    = employees.map(emp => {
    const token = crypto.createHmac('sha256', secret)
      .update(`${emp.employee_id}:${today}`).digest('hex').slice(0, 32);
    return {
      employeeId: emp.employee_id, name: emp.name, department: emp.department,
      qrData: JSON.stringify({ type:'sioms-attendance', employeeId:emp.employee_id,
        name:emp.name, department:emp.department, date:today, token }),
    };
  });
  res.json({ date:today, count:result.length, employees:result });
});

module.exports = router;
