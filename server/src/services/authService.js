const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');
const { UnauthorizedError, ConflictError, NotFoundError } = require('../utils/errors');

const SALT_ROUNDS = 12;

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function signup(email, password, name) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);

  const result = db
    .prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
    .run(email, passwordHash, name);

  const user = { id: result.lastInsertRowid, email, name };
  const token = generateToken(user);

  return { token, user };
}

function login(email, password) {
  const user = db
    .prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?')
    .get(email);

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const token = generateToken(user);
  return {
    token,
    user: { id: user.id, email: user.email, name: user.name },
  };
}

function getUserById(id) {
  const user = db
    .prepare('SELECT id, email, name, created_at FROM users WHERE id = ?')
    .get(id);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return user;
}

module.exports = { signup, login, getUserById };
