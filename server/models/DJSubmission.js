const mongoose = require("mongoose");

const DJSubmissionSchema = new mongoose.Schema(
  {
    stageName: { type: String, required: true, trim: true, maxlength: 150 },
    fullName: { type: String, required: true, trim: true, maxlength: 150 },
    genre: { type: String, trim: true, default: "", maxlength: 500 },
    city: { type: String, trim: true, default: "", maxlength: 150 },
    state: { type: String, trim: true, default: "", maxlength: 100 },
    phoneNumber: { type: String, trim: true, default: "", maxlength: 25 },
    experienceLevel: { type: String, trim: true, default: "", maxlength: 100 },
    age: { type: String, required: true, trim: true, maxlength: 50 },
    email: { type: String, required: true, trim: true, maxlength: 254 },
    socialMedia: { type: String, trim: true, default: "", maxlength: 1000 },
    heardAbout: { type: String, trim: true, default: "", maxlength: 150 },

    stageNameLower: { type: String, required: true, index: true, maxlength: 150 },
    emailLower: { type: String, required: true, index: true, maxlength: 254 }
  },
  { timestamps: true }
);

DJSubmissionSchema.index({ stageNameLower: 1, emailLower: 1 }, { unique: true });

DJSubmissionSchema.virtual("id").get(function () {
  return this._id.toString();
});

DJSubmissionSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (_doc, ret) {
    delete ret._id;
    delete ret.stageNameLower;
    delete ret.emailLower;
    return ret;
  }
});

module.exports = mongoose.model("DJSubmission", DJSubmissionSchema);
