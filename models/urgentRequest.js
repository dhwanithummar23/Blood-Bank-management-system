const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const urgentRequestSchema = new Schema(
  {
    hospital: {
      type: Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
    },
    bloodbank: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
    },
    bloodGroup: {
      type: String,
      required: true,
    },
    units: {
      type: Number,
      required: true,
      min: 1,
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Accepted", "Rejected"],
      default: "Pending",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("UrgentRequest", urgentRequestSchema);
