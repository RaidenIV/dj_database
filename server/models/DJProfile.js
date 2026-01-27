const mongoose = require("mongoose");

const DJProfileSchema = new mongoose.Schema(
  {
    stageName: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    phoneNumber: { type: String, trim: true, default: "" },
    experienceLevel: { type: String, trim: true, default: "" },
    age: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    socialMedia: { type: String, trim: true, default: "" },
    heardAbout: { type: String, trim: true, default: "" },

    stageNameLower: { type: String, required: true, index: true },
    emailLower: { type: String, required: true, index: true }
  },
  { timestamps: true }
);

DJProfileSchema.index({ stageNameLower: 1, emailLower: 1 }, { unique: true });

DJProfileSchema.virtual("id").get(function () {
  return this._id.toString();
});

DJProfileSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (_doc, ret) {
    delete ret._id;
    delete ret.stageNameLower;
    delete ret.emailLower;
    return ret;
  }
});

module.exports = mongoose.model("DJProfile", DJProfileSchema);
