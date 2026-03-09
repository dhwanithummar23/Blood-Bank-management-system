const Joi = require("joi");

module.exports.listingSchema = Joi.object({
  // Your existing listing validation
  listing: Joi.object({
    name: Joi.string().required(),
    type: Joi.string().required(),
    phone: Joi.string().required(),
    address: Joi.string().required(),
    timing: Joi.string().required(),
    available_blood_stock: Joi.object().required(),
  }).required(),

  // ADD THESE TWO LINES TO ALLOW THE NEW FIELDS
  username: Joi.string().required(),
  password: Joi.string().required(),
});
