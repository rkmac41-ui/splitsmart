const Joi = require('joi');

const signupSchema = Joi.object({
  email: Joi.string().email().required().trim().lowercase(),
  password: Joi.string().min(8).max(128).required(),
  name: Joi.string().min(1).max(100).required().trim(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().trim().lowercase(),
  password: Joi.string().required(),
});

module.exports = { signupSchema, loginSchema };
