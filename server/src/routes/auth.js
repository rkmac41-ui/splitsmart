const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const authMiddleware = require('../middleware/auth');
const validate = require('../middleware/validate');
const { signupSchema, loginSchema } = require('../validators/authValidator');

router.post('/signup', validate(signupSchema), (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    const result = authService.signup(email, password, name);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', validate(loginSchema), (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = authService.login(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, (req, res, next) => {
  try {
    const user = authService.getUserById(req.user.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
