const jwt = require('jsonwebtoken');

const ROLE_PERMISSIONS = {
  "Admin":            ["dashboard","attendance","hr","payroll","canteen","inventory","suppliers","workshop","assets","settings"],
  "HR":               ["dashboard","attendance","hr","payroll","assets"],
  "Accountant":       ["dashboard","payroll","canteen","suppliers"],
  "StoreKeeper":      ["dashboard","inventory","suppliers"],
  "WorkshopEngineer": ["dashboard","workshop","assets","inventory"],
  "CanteenManager":   ["dashboard","canteen","inventory"],
  "Employee":         ["dashboard","attendance"],
};

const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ message: 'No token provided.' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

const requirePermission = (pageId) => (req, res, next) => {
  const perms = ROLE_PERMISSIONS[req.user?.role] || [];
  if (req.user?.role === 'Admin' || perms.includes(pageId)) return next();
  res.status(403).json({ message: 'Access denied for role: ' + req.user?.role });
};

module.exports = { auth, requirePermission, ROLE_PERMISSIONS };
