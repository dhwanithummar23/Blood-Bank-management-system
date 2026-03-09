const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const listingSchema = new mongoose.Schema({
  name: String,
  type: String,
  location: String,
  address: String,
  phone: String,
  timing: String,
  contact: String,
  bloodTypesAvailable: [String],
  available_blood_stock: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  distance_km: Number,

  username: { type: String, unique: true },
  password: String,

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  geometry: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: [Number], // [lng, lat]
  },
});

listingSchema.pre("save", async function () {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }
});

listingSchema.methods.validatePassword = function (password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("Listing", listingSchema);
