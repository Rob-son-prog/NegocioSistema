// server/auth.js
const jwt = require('jsonwebtoken');             // << aqui estava escrito errado
const SECRET = process.env.JWT_SECRET || 'dev-secret';

// middleware: valida Bearer <token>
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const [, token] = h.split(' ');
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

// exige papel admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

module.exports = { auth, requireAdmin, SECRET }; // << garanta "exports"
