const { logElement, logText, logObject } = require("../utils/log");
const cloudinary = require("cloudinary").v2;
// logElement("cloud name", process.env.CLOUD_NAME);

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;
