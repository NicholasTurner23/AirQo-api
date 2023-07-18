const mongoose = require("mongoose").set("debug", true);
const Schema = mongoose.Schema;
const { logObject, logElement, logText } = require("@utils/log");
const ObjectId = mongoose.Schema.Types.ObjectId;
const isEmpty = require("is-empty");
const { getModelByTenant } = require("@config/database");
const constants = require("@config/constants");
const httpStatus = require("http-status");

const HostSchema = new Schema(
  {
    first_name: {
      type: String,
      required: [true, "first_name is required!"],
      trim: true,
    },
    last_name: {
      type: String,
      required: [true, "last_name is required"],
      trim: true,
    },
    phone_number: {
      type: Number,
      required: [true, "phone_number is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "email is required"],
      trim: true,
    },
    site_id: {
      type: ObjectId,
      required: [true, "site_id is required"],
      trim: true,
    },
  },
  { timestamps: true }
);

HostSchema.index(
  {
    email: 1,
    phone_number: 1,
    site_id: 1,
  },
  {
    unique: true,
  }
);

HostSchema.pre("save", function (next) {
  if (this.isModified("password")) {
  }
  return next();
});

HostSchema.pre("findOneAndUpdate", function () {
  let that = this;
  const update = that.getUpdate();
  if (update) {
    if (update.__v != null) {
      delete update.__v;
    }
    const keys = ["$set", "$setOnInsert"];
    for (const key of keys) {
      if (update[key] != null && update[key].__v != null) {
        delete update[key].__v;
        if (Object.keys(update[key]).length === 0) {
          delete update[key];
        }
      }
    }
    update.$inc = update.$inc || {};
    update.$inc.__v = 1;
  }
});

HostSchema.pre("update", function (next) {
  return next();
});

HostSchema.statics = {
  async register(args) {
    try {
      return {
        success: true,
        data: await this.create({
          ...args,
        }),
        message: "host created",
      };
    } catch (err) {
      let response = {};
      message = "validation errors for some of the provided fields";
      let status = httpStatus.CONFLICT;
      if (err.code === 11000) {
        Object.entries(err.keyPattern).forEach(([key, value]) => {
          return (response[key] = "duplicate value");
        });
      }
      if (err.errors) {
        Object.entries(err.errors).forEach(([key, value]) => {
          return (response[value.path] = value.message);
        });
      }

      return {
        errors: response,
        message,
        success: false,
        status,
      };
    }
  },
  async list({ skip = 0, limit = 5, filter = {} } = {}) {
    try {
      let hosts = await this.aggregate()
        .match(filter)
        .addFields({
          createdAt: {
            $dateToString: {
              format: "%Y-%m-%d %H:%M:%S",
              date: "$_id",
            },
          },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();
      let data = hosts;
      if (!isEmpty(data)) {
        return {
          success: true,
          data,
          message: "successfully listed the hosts",
          status: httpStatus.OK,
        };
      }

      if (isEmpty(data)) {
        return {
          success: true,
          message: "no hosts exist for this search",
          data,
          status: httpStatus.OK,
        };
      }
      return {
        success: false,
        message: "unable to retrieve hosts",
        data,
        errors: { message: "unable to retrieve hosts" },
        status: httpStatus.NOT_FOUND,
      };
    } catch (error) {
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },
  async modify({ filter = {}, update = {} } = {}) {
    try {
      let modifiedUpdate = update;
      let projection = { _id: 1 };
      Object.keys(modifiedUpdate).forEach((key) => {
        projection[key] = 1;
      });
      let options = { new: true, projection };
      let updatedHost = await this.findOneAndUpdate(
        filter,
        modifiedUpdate,
        options
      );
      let data = updatedHost;
      if (!isEmpty(updatedHost)) {
        return {
          success: true,
          message: "successfully modified the host",
          data,
          status: httpStatus.OK,
        };
      } else {
        return {
          success: false,
          message: "host does not exist, please crosscheck",
          errors: { message: "host does not exist" },
          status: httpStatus.BAD_REQUEST,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },
  async remove({ filter = {} } = {}) {
    try {
      let projection = { _id: 1, email: 1, first_name: 1, last_name: 1 };
      let options = { projection };
      let removedHost = await this.findOneAndRemove(filter, options);

      logObject("data removed", removedHost);
      if (!isEmpty(removedHost)) {
        let data = removedHost._doc;
        return {
          success: true,
          message: "successfully removed the host",
          data,
          status: httpStatus.OK,
        };
      } else {
        return {
          success: false,
          message: "host does not exist, please crosscheck",
          errors: { message: "host does not exist" },
          status: httpStatus.BAD_REQUEST,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },
};

HostSchema.methods = {
  toJSON() {
    return {
      _id: this._id,
      first_name: this.first_name,
      last_name: this.last_name,
      site_id: this.site_id,
      phone_number: this.phone_number,
    };
  },
};

const HostModel = (tenant) => {
  try {
    const hosts = mongoose.model("hosts");
    return hosts;
  } catch (error) {
    const hosts = getModelByTenant(tenant, "host", HostSchema);
    return hosts;
  }
};

module.exports = HostModel;
