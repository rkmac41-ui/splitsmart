/**
 * Express middleware factory for Joi schema validation.
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} property - Request property to validate ('body', 'params', 'query')
 */
function validate(schema, property = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: error.details.map(d => d.message).join(', '),
      });
    }

    req[property] = value;
    next();
  };
}

module.exports = validate;
