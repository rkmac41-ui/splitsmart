const Joi = require('joi');

const createPaymentSchema = Joi.object({
  payee_id: Joi.number().integer().positive().required(),
  amount: Joi.number().integer().positive().required(),
  note: Joi.string().max(200).allow('', null).trim(),
});

module.exports = { createPaymentSchema };
