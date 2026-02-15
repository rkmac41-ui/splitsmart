const Joi = require('joi');

const createGroupSchema = Joi.object({
  name: Joi.string().min(1).max(100).required().trim(),
});

const updateGroupSchema = Joi.object({
  name: Joi.string().min(1).max(100).trim(),
  simplify_debts: Joi.boolean(),
}).min(1);

module.exports = { createGroupSchema, updateGroupSchema };
