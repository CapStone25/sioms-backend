const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const { getDb } = require('../db/database');
const { auth, ROLE_PERMISSIONS } = require('../middleware/auth');
const { sendEmail, credentialEmailHtml, registerRequestEmailHtml, verifyEmailHtml } = require('../utils/emailService');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── Helper ────────────────────────────────────────────────────────────────
function generateCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789@#!';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
function codeExpiry(minutes = 15) {
  return new Date(Date.now() + minutes * 60000).toISOString();
}

// ─── LOGIN ─────────────────────────────────────────────────────────────────
// No more "login as" selector — role comes from the DB
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user) return res.status(401).json({ message: 'Invalid email or password.' });
  if (!user.is_active) return res.status(403).json({ message: 'Your account has been deactivated. Contact the administrator.' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ message: 'Invalid email or password.' });

  const permissions = ROLE_PERMISSIONS[user.role] || ['dashboard'];
  // Link to employee record if exists (needed for self check-in)
  const empRecord = db.prepare('SELECT employee_id FROM employees WHERE email=?').get(email);
  const employeeId = empRecord?.employee_id || null;
  const userData = { id: user.id, name: user.name, email: user.email, role: user.role, permissions, employeeId };
  const token    = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, employeeId },
    process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  res.json({ user: userData, token });
});

// ─── CURRENT USER ──────────────────────────────────────────────────────────
router.get('/me', auth, (req, res) => {
  const permissions = ROLE_PERMISSIONS[req.user.role] || ['dashboard'];
  res.json({ id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role, permissions });
});

// ─── LOGOUT ────────────────────────────────────────────────────────────────
router.post('/logout', auth, (req, res) => res.json({ message: 'Logged out.' }));

// ─── REGISTER REQUEST (Step 1: Submit request + send verification email) ───
router.post('/register-request', async (req, res) => {
  const { name, email, requestedRole, department, phone, reason } = req.body;
  if (!name || name.trim().length < 2) return res.status(400).json({ message: 'Full name is required (min 2 chars).' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Valid email is required.' });
  if (!requestedRole) return res.status(400).json({ message: 'Requested role is required.' });

  const db = getDb();
  // Check if email is already a user
  const existingUser = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (existingUser) return res.status(409).json({ message: 'This email is already registered as an active user.' });

  // Check if there's already a pending request
  const existingReq = db.prepare("SELECT id,status FROM register_requests WHERE email=?").get(email);
  if (existingReq) {
    if (existingReq.status === 'Pending' || existingReq.status === 'Verified')
      return res.status(409).json({ message: 'A registration request with this email is already pending approval.' });
    if (existingReq.status === 'Approved')
      return res.status(409).json({ message: 'This email has already been approved. Check your inbox for credentials.' });
    // Rejected — allow re-applying, delete old request
    db.prepare('DELETE FROM register_requests WHERE email=?').run(email);
  }

  const verifyCode    = generateCode();
  const verifyExpires = codeExpiry(15);

  const info = db.prepare(`INSERT INTO register_requests (name,email,requested_role,department,phone,reason,verify_code,verify_expires)
    VALUES (?,?,?,?,?,?,?,?)`).run(name.trim(), email.toLowerCase(), requestedRole, department||'', phone||'', reason||'', verifyCode, verifyExpires);

  // Send verification email
  try {
    await sendEmail({
      to: email,
      subject: 'SIOMS — Verify your email address',
      html: verifyEmailHtml({ name: name.trim(), code: verifyCode }),
    });
  } catch (err) {
    console.error('Email send error:', err);
    // Don't fail the request if email fails — dev mode
  }

  res.status(201).json({
    message: 'Registration request submitted. Please check your email for a verification code.',
    requestId: info.lastInsertRowid,
  });
});

// ─── VERIFY EMAIL (Step 2: User enters code) ───────────────────────────────
router.post('/verify-email', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ message: 'Email and code are required.' });

  const db = getDb();
  const reqRow = db.prepare('SELECT * FROM register_requests WHERE email=?').get(email.toLowerCase());
  if (!reqRow) return res.status(404).json({ message: 'No registration request found for this email.' });
  if (reqRow.email_verified) return res.status(400).json({ message: 'Email already verified.' });
  if (reqRow.verify_code !== code) return res.status(400).json({ message: 'Invalid verification code.' });
  if (new Date(reqRow.verify_expires) < new Date()) return res.status(400).json({ message: 'Verification code expired. Please request a new one.' });

  db.prepare("UPDATE register_requests SET email_verified=1,status='Verified' WHERE id=?").run(reqRow.id);

  // Notify user: request is now pending admin
  sendEmail({
    to: email,
    subject: 'SIOMS — Registration Request Pending Approval',
    html: registerRequestEmailHtml({ name: reqRow.name, email, role: reqRow.requested_role, requestId: reqRow.id }),
  }).catch(console.error);

  res.json({ message: 'Email verified successfully. Your request is now pending admin approval.' });
});

// ─── RESEND VERIFICATION CODE ───────────────────────────────────────────────
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required.' });
  const db = getDb();
  const reqRow = db.prepare('SELECT * FROM register_requests WHERE email=?').get(email.toLowerCase());
  if (!reqRow) return res.status(404).json({ message: 'No registration request found.' });
  if (reqRow.email_verified) return res.status(400).json({ message: 'Email already verified.' });

  const verifyCode    = generateCode();
  const verifyExpires = codeExpiry(15);
  db.prepare('UPDATE register_requests SET verify_code=?,verify_expires=? WHERE id=?').run(verifyCode, verifyExpires, reqRow.id);

  try {
    await sendEmail({ to: email, subject: 'SIOMS — New Verification Code', html: verifyEmailHtml({ name: reqRow.name, code: verifyCode }) });
  } catch (err) { console.error(err); }

  res.json({ message: 'New verification code sent.' });
});

// ─── ADMIN: GET ALL REGISTER REQUESTS ──────────────────────────────────────
router.get('/register-requests', auth, (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only.' });
  const db = getDb();
  const { status = '' } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (status) { where += ' AND status=?'; params.push(status); }
  const rows = db.prepare(`SELECT * FROM register_requests ${where} ORDER BY id DESC`).all(...params);
  res.json(rows);
});

// ─── ADMIN: APPROVE REQUEST ────────────────────────────────────────────────
router.post('/register-requests/:id/approve', auth, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only.' });
  const db = getDb();
  const reqRow = db.prepare('SELECT * FROM register_requests WHERE id=?').get(parseInt(req.params.id));
  if (!reqRow) return res.status(404).json({ message: 'Request not found.' });
  if (reqRow.status === 'Approved') return res.status(400).json({ message: 'Already approved.' });

  const { role, adminNotes } = req.body;
  const finalRole = role || reqRow.requested_role;

  // Check if user already exists
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(reqRow.email);
  if (existing) {
    db.prepare("UPDATE register_requests SET status='Approved',reviewed_by=?,reviewed_at=datetime('now') WHERE id=?").run(req.user.name, reqRow.id);
    return res.json({ message: 'User already exists. Request marked approved.' });
  }

  // Generate credentials
  const userId   = 'USR-' + Date.now();
  const plainPass = generatePassword();
  const hashed   = bcrypt.hashSync(plainPass, 10);

  // Create user
  db.prepare('INSERT INTO users (id,name,email,password,role,is_active,email_verified) VALUES (?,?,?,?,?,1,1)')
    .run(userId, reqRow.name, reqRow.email, hashed, finalRole);

  // Update request
  db.prepare("UPDATE register_requests SET status='Approved',reviewed_by=?,reviewed_at=datetime('now'),admin_notes=? WHERE id=?")
    .run(req.user.name, adminNotes || '', reqRow.id);

  // Send credentials email
  try {
    await sendEmail({
      to: reqRow.email,
      subject: 'SIOMS — Your Account Has Been Approved',
      html: credentialEmailHtml({ name: reqRow.name, email: reqRow.email, password: plainPass, role: finalRole, loginUrl: FRONTEND_URL }),
    });
  } catch (err) { console.error('Email error:', err); }

  const permissions = ROLE_PERMISSIONS[finalRole] || ['dashboard'];
  res.json({ message: `Account created for ${reqRow.name}. Credentials sent to ${reqRow.email}.`, userId, role: finalRole, permissions });
});

// ─── ADMIN: REJECT REQUEST ─────────────────────────────────────────────────
router.post('/register-requests/:id/reject', auth, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only.' });
  const db = getDb();
  const reqRow = db.prepare('SELECT * FROM register_requests WHERE id=?').get(parseInt(req.params.id));
  if (!reqRow) return res.status(404).json({ message: 'Request not found.' });

  const { adminNotes } = req.body;
  db.prepare("UPDATE register_requests SET status='Rejected',reviewed_by=?,reviewed_at=datetime('now'),admin_notes=? WHERE id=?")
    .run(req.user.name, adminNotes || '', reqRow.id);

  res.json({ message: 'Request rejected.' });
});

// ─── ADMIN: GET ALL USERS ─────────────────────────────────────────────────
router.get('/users', auth, (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only.' });
  const db = getDb();
  const rows = db.prepare('SELECT id,name,email,role,is_active,created_at FROM users ORDER BY created_at DESC').all();
  res.json(rows);
});

// ─── ADMIN: UPDATE USER ────────────────────────────────────────────────────
router.put('/users/:id', auth, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only.' });
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });

  const { name, email, role, is_active, resetPassword } = req.body;

  let plainPass = null;
  let hashed = user.password;
  if (resetPassword) {
    plainPass = generatePassword();
    hashed    = bcrypt.hashSync(plainPass, 10);
  }

  db.prepare('UPDATE users SET name=COALESCE(?,name),email=COALESCE(?,email),role=COALESCE(?,role),is_active=COALESCE(?,is_active),password=? WHERE id=?')
    .run(name || null, email || null, role || null, is_active !== undefined ? (is_active ? 1 : 0) : null, hashed, user.id);

  // If password was reset, send new credentials
  if (plainPass) {
    const updated = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
    try {
      await sendEmail({
        to: updated.email,
        subject: 'SIOMS — Your Password Has Been Reset',
        html: credentialEmailHtml({ name: updated.name, email: updated.email, password: plainPass, role: updated.role, loginUrl: FRONTEND_URL }),
      });
    } catch (err) { console.error(err); }
  }

  const updated = db.prepare('SELECT id,name,email,role,is_active,created_at FROM users WHERE id=?').get(user.id);
  res.json({ ...updated, passwordReset: !!plainPass });
});

// ─── UPDATE OWN PROFILE ─────────────────────────────────────────────────────
router.put('/profile', auth, async (req, res) => {
  const { name, email, currentPassword, newPassword } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });

  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ message: 'Current password is required to set a new password.' });
    const valid = bcrypt.compareSync(currentPassword, user.password);
    if (!valid) return res.status(401).json({ message: 'Current password is incorrect.' });
    if (newPassword.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    const hashed = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET name=COALESCE(?,name),email=COALESCE(?,email),password=? WHERE id=?')
      .run(name || null, email || null, hashed, user.id);
  } else {
    db.prepare('UPDATE users SET name=COALESCE(?,name),email=COALESCE(?,email) WHERE id=?')
      .run(name || null, email || null, user.id);
  }

  const updated = db.prepare('SELECT id,name,email,role,is_active FROM users WHERE id=?').get(user.id);
  res.json(updated);
});

// ─── ADMIN: DELETE USER ────────────────────────────────────────────────────
router.delete('/users/:id', auth, (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only.' });
  if (req.params.id === req.user.id) return res.status(400).json({ message: 'Cannot delete your own account.' });
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });
  db.prepare('DELETE FROM users WHERE id=?').run(user.id);
  res.json({ message: `User ${user.name} deleted.` });
});

// ─── ADMIN: CREATE / RESET EMPLOYEE LOGIN ACCOUNT ─────────────────────────
/**
 * POST /auth/employee-account
 * Body: { employeeId, username (email), password }
 * Creates a user account linked to an employee, or resets password if account exists.
 * Admin only.
 */
router.post('/employee-account', auth, async (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'HR')
    return res.status(403).json({ message: 'Admin or HR only.' });

  const db = getDb();
  const { employeeId, username, password } = req.body;
  if (!employeeId || !username || !password)
    return res.status(400).json({ message: 'employeeId, username (email), and password are required.' });
  if (password.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });

  // Find employee
  const emp = db.prepare('SELECT * FROM employees WHERE employee_id=? OR CAST(id AS TEXT)=?')
    .get(employeeId, employeeId);
  if (!emp) return res.status(404).json({ message: 'Employee not found.' });

  const hashed  = bcrypt.hashSync(password, 10);
  const emailLC = username.toLowerCase().trim();

  // Check if user with this email already exists
  const existingByEmail = db.prepare('SELECT * FROM users WHERE email=?').get(emailLC);

  if (existingByEmail) {
    // Reset password + update name
    db.prepare('UPDATE users SET password=?,name=?,role=\'Employee\',is_active=1 WHERE id=?')
      .run(hashed, emp.name, existingByEmail.id);
    // Also update employee email to match
    db.prepare('UPDATE employees SET email=? WHERE employee_id=?').run(emailLC, emp.employee_id);

    // Respond immediately, then send email in background
    res.json({ message: `Account updated for ${emp.name}. Password reset. Credentials sent to ${emailLC}.`, employeeId: emp.employee_id });
    setImmediate(async () => {
      try {
        await sendEmail({
          to: emailLC,
          subject: 'SIOMS — Your Account Password Has Been Reset',
          html: credentialEmailHtml({ name: emp.name, email: emailLC, password, role: 'Employee', loginUrl: FRONTEND_URL }),
        });
        console.log(`[Email] ✅ Password reset email sent to ${emailLC}`);
      } catch (e) { console.error(`[Email] ❌ Failed for ${emailLC}:`, e.message); }
    });
    return;
  }

  // Create new user account
  const uid = `EMP-USR-${emp.employee_id}`;
  db.prepare('INSERT OR REPLACE INTO users (id,name,email,password,role,is_active,email_verified) VALUES (?,?,?,?,?,1,1)')
    .run(uid, emp.name, emailLC, hashed, 'Employee');

  // Link employee email
  db.prepare('UPDATE employees SET email=? WHERE employee_id=?').run(emailLC, emp.employee_id);

  // Respond immediately, then send email in background
  res.status(201).json({
    message: `Account created for ${emp.name}. Credentials sent to ${emailLC}.`,
    employeeId: emp.employee_id,
    username: emailLC,
  });
  setImmediate(async () => {
    try {
      await sendEmail({
        to: emailLC,
        subject: 'SIOMS — Your Employee Account Has Been Created',
        html: credentialEmailHtml({ name: emp.name, email: emailLC, password, role: 'Employee', loginUrl: FRONTEND_URL }),
      });
      console.log(`[Email] ✅ Account creation email sent to ${emailLC}`);
    } catch (e) { console.error(`[Email] ❌ Failed for ${emailLC}:`, e.message); }
  });
});

/**
 * GET /auth/employee-account/:employeeId
 * Check if an employee already has a linked user account.
 */
router.get('/employee-account/:employeeId', auth, (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'HR')
    return res.status(403).json({ message: 'Admin or HR only.' });
  const db = getDb();
  const emp = db.prepare('SELECT * FROM employees WHERE employee_id=?').get(req.params.employeeId);
  if (!emp) return res.status(404).json({ message: 'Employee not found.' });
  const userAcc = db.prepare('SELECT id,name,email,role,is_active FROM users WHERE email=?').get(emp.email);
  res.json({ employee: { id: emp.employee_id, name: emp.name, email: emp.email }, account: userAcc || null });
});

module.exports = router;
