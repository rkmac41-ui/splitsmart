const Joi = require('joi');

const createPaymentSchema = Joi.object({
  // Negative IDs are placeholder members
  payer_id: Joi.number().integer().not(0),
  payee_id: Joi.number().integer().not(0).required(),
  amount: Joi.number().integer().positive().required(),
  note: Joi.string().max(200).allow('', null).trim(),
});

module.exports = { createPaymentSchema };
