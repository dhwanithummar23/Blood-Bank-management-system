const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const donationSchema = new Schema(
  {
    donor: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    hospital: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
    },
    bloodGroup: String,
    requestType: {
      type: String,
      enum: ["Donation", "BloodRequest"],
      default: "Donation",
    },
    status: {
      type: String,
      enum: ["Pending", "Accepted", "Rejected"],
      default: "Pending",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Donation", donationSchema);
