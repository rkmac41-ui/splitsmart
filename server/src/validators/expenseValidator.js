const Joi = require('joi');

const CATEGORIES = [
  'food_drink', 'transport', 'entertainment', 'shopping',
  'groceries', 'rent', 'utilities', 'other'
];

const SPLIT_TYPES = ['equal', 'exact', 'percentage', 'shares'];

const createExpenseSchema = Joi.object({
  description: Joi.string().min(1).max(200).required().trim(),
  amount: Joi.number().integer().positive().required(),
  category: Joi.string().valid(...CATEGORIES).default('other'),
  split_type: Joi.string().valid(...SPLIT_TYPES).required(),
  date: Joi.string().isoDate().default(() => new Date().toISOString().split('T')[0]),
  trip_id: Joi.number().integer().positive().allow(null).default(null),
  payers: Joi.array().items(
    Joi.object({
      user_id: Joi.number().integer().not(0).required(), // negative = placeholder member
      amount: Joi.number().integer().positive().required(),
    })
  ).min(1).required(),
  splits: Joi.array().items(
    Joi.object({
      user_id: Joi.number().integer().not(0).required(), // negative = placeholder member
      share_value: Joi.number().allow(null),
    })
  ).min(1).required(),
});

const updateExpenseSchema = createExpenseSchema;

module.exports = { createExpenseSchema, updateExpenseSchema, CATEGORIES, SPLIT_TYPES };
