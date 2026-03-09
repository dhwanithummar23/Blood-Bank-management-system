const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
  },
  // Note: passport-local-mongoose defines its own password field,
  // so you usually don't need to define password: String here manually.

  role: {
    type: String,
    enum: ["donor", "donee"],
    default: "donor",
  },

  age: Number,
  bloodGroup: String,
  location: String,
  weight: Number,
  diseases: [String],

  donations: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
    },
  ],
});

// The Fix
userSchema.plugin(passportLocalMongoose.default || passportLocalMongoose);

module.exports = mongoose.model("User", userSchema);
