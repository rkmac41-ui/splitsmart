const Joi = require('joi');

const createTripSchema = Joi.object({
  name: Joi.string().min(1).max(100).required().trim(),
  description: Joi.string().max(500).allow('', null).trim(),
});

const updateTripSchema = Joi.object({
  name: Joi.string().min(1).max(100).trim(),
  description: Joi.string().max(500).allow('', null).trim(),
}).min(1);

module.exports = { createTripSchema, updateTripSchema };
