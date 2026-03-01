const nodemailer = require('nodemailer');

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,   // 10 seconds to connect
    greetingTimeout: 10000,     // 10 seconds for greeting
    socketTimeout: 15000,       // 15 seconds for socket
    pool: true,                 // reuse connections (faster for bulk)
    maxConnections: 5,          // up to 5 parallel SMTP connections
    maxMessages: 100,           // messages per connection
  });
}

// Singleton transporter — created once, reused for all emails
let _transporter = null;
function getTransporter() {
  if (!_transporter) _transporter = createTransport();
  return _transporter;
}

const EMAIL_FROM = process.env.EMAIL_FROM || 'SIOMS System <noreply@sioms.school>';

async function sendEmail({ to, subject, html }) {
  if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your-school-email@gmail.com') {
    console.log(`\n📧 [DEV MODE - EMAIL NOT SENT]\nTo: ${to}\nSubject: ${subject}\n---`);
    return { messageId: 'dev-mode' };
  }
  return getTransporter().sendMail({ from: EMAIL_FROM, to, subject, html });
}

function credentialEmailHtml({ name, email, password, role, loginUrl }) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f7fa;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#0055A5,#003d7a);padding:32px;text-align:center">
      <h1 style="color:white;margin:0;font-size:24px">SIOMS</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:13px">School Internal Operations Management System</p>
    </div>
    <div style="padding:32px">
      <h2 style="color:#1a1a2e;margin:0 0 8px">Account Approved ✅</h2>
      <p style="color:#555;margin:0 0 24px">Hello <strong>${name}</strong>, your SIOMS account has been approved.</p>
      <div style="background:#f8faff;border:1px solid #d0e4ff;border-radius:8px;padding:20px;margin-bottom:24px">
        <h3 style="margin:0 0 16px;color:#0055A5;font-size:14px;text-transform:uppercase">Login Credentials</h3>
        <p style="margin:4px 0;font-size:13px"><strong>Email:</strong> ${email}</p>
        <p style="margin:4px 0;font-size:13px"><strong>Password:</strong> <code style="background:#eee;padding:2px 6px;border-radius:4px;font-size:14px">${password}</code></p>
        <p style="margin:4px 0;font-size:13px"><strong>Role:</strong> ${role}</p>
      </div>
      <p style="color:#888;font-size:12px">⚠️ Please change your password after first login via Settings → Security.</p>
      <a href="${loginUrl}" style="display:inline-block;background:#0055A5;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;margin-top:16px">Login to SIOMS →</a>
    </div>
    <div style="background:#f8faff;padding:16px 32px;text-align:center;border-top:1px solid #eee">
      <p style="color:#aaa;font-size:12px;margin:0">Automated message from SIOMS. Do not reply.</p>
    </div>
  </div></body></html>`;
}

function registerRequestEmailHtml({ name, email, role, requestId }) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f7fa;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#0055A5,#003d7a);padding:32px;text-align:center">
      <h1 style="color:white;margin:0;font-size:24px">SIOMS</h1>
    </div>
    <div style="padding:32px">
      <h2 style="color:#1a1a2e;margin:0 0 8px">Registration Request Received ✅</h2>
      <p style="color:#555;margin:0 0 24px">Hello <strong>${name}</strong>, your registration request is pending admin approval.</p>
      <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:16px;margin-bottom:20px">
        <p style="margin:0;color:#856404;font-size:13px">⏳ An administrator will review your request and email you your login credentials once approved.</p>
      </div>
      <p style="font-size:13px;color:#555"><strong>Name:</strong> ${name}<br><strong>Email:</strong> ${email}<br><strong>Requested Role:</strong> ${role}<br><strong>Request ID:</strong> #${requestId}</p>
    </div>
  </div></body></html>`;
}

function verifyEmailHtml({ name, code }) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f7fa;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#0055A5,#003d7a);padding:32px;text-align:center">
      <h1 style="color:white;margin:0;font-size:24px">SIOMS</h1>
    </div>
    <div style="padding:32px;text-align:center">
      <h2 style="color:#1a1a2e;margin:0 0 8px">Verify Your Email</h2>
      <p style="color:#555;margin:0 0 24px">Hello <strong>${name}</strong>, enter this code to verify your email:</p>
      <div style="font-size:40px;font-weight:700;letter-spacing:10px;color:#0055A5;font-family:monospace;background:#f0f5ff;padding:24px;border-radius:8px;display:inline-block">${code}</div>
      <p style="color:#888;font-size:12px;margin:16px 0 0">This code expires in 15 minutes.</p>
    </div>
  </div></body></html>`;
}

function leaveStatusEmailHtml({ name, type, from_date, to_date, days, status, hr_note, loginUrl }) {
  const statusColor = status === 'Approved' ? '#2E7D32' : status === 'Rejected' ? '#C62828' : '#F57C00';
  const statusIcon  = status === 'Approved' ? '✅' : status === 'Rejected' ? '❌' : '⏳';
  const statusBg    = status === 'Approved' ? '#f0fff4' : status === 'Rejected' ? '#fff5f5' : '#fffbf0';
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f7fa;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#0055A5,#003d7a);padding:32px;text-align:center">
      <h1 style="color:white;margin:0;font-size:24px">SIOMS</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:13px">School Internal Operations Management System</p>
    </div>
    <div style="padding:32px">
      <h2 style="color:#1a1a2e;margin:0 0 8px">Leave Request Update</h2>
      <p style="color:#555;margin:0 0 24px">Hello <strong>${name}</strong>, your leave request status has been updated.</p>
      <div style="background:${statusBg};border:2px solid ${statusColor};border-radius:10px;padding:20px;margin-bottom:20px;text-align:center">
        <div style="font-size:36px;margin-bottom:8px">${statusIcon}</div>
        <div style="font-size:22px;font-weight:700;color:${statusColor}">${status}</div>
      </div>
      <div style="background:#f8faff;border:1px solid #d0e4ff;border-radius:8px;padding:20px;margin-bottom:20px">
        <p style="margin:4px 0;font-size:13px"><strong>Leave Type:</strong> ${type}</p>
        <p style="margin:4px 0;font-size:13px"><strong>Period:</strong> ${from_date} → ${to_date}</p>
        <p style="margin:4px 0;font-size:13px"><strong>Duration:</strong> ${days} day${days > 1 ? 's' : ''}</p>
      </div>
      ${hr_note ? `<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:16px;margin-bottom:20px">
        <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#856404;text-transform:uppercase">HR Note:</p>
        <p style="margin:0;color:#333;font-size:14px">${hr_note}</p>
      </div>` : ''}
      <a href="${loginUrl}" style="display:inline-block;background:#0055A5;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">View in SIOMS →</a>
    </div>
    <div style="background:#f8faff;padding:16px 32px;text-align:center;border-top:1px solid #eee">
      <p style="color:#aaa;font-size:12px;margin:0">Automated message from SIOMS. Do not reply.</p>
    </div>
  </div></body></html>`;
}

module.exports = { sendEmail, credentialEmailHtml, registerRequestEmailHtml, verifyEmailHtml, leaveStatusEmailHtml };
