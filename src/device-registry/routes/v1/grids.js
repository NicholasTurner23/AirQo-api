const express = require("express");
const router = express.Router();
const createGridController = require("@controllers/create-grid");
const { check, oneOf, query, body, param } = require("express-validator");
const constants = require("@config/constants");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;
const log4js = require("log4js");
const logger = log4js.getLogger(`${constants.ENVIRONMENT} -- grids-route-v2`);
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const { getModelByTenant } = require("@config/database");

const NetworkSchema = require("@models/Network");
const AdminLevelSchema = require("@models/AdminLevel");
const { logText, logObject } = require("@utils/log");

const NetworkModel = (tenant) => {
  try {
    const grids = mongoose.model("grids");
    return grids;
  } catch (error) {
    const grids = getModelByTenant(tenant, "grid", NetworkSchema);
    return grids;
  }
};

const AdminLevelModel = (tenant) => {
  try {
    const adminlevels = mongoose.model("adminlevels");
    return adminlevels;
  } catch (error) {
    const adminlevels = getModelByTenant(
      tenant,
      "adminlevel",
      AdminLevelSchema
    );
    return adminlevels;
  }
};

const validAdminLevels = async () => {
  const levels = await AdminLevelModel("airqo").distinct("name");
  return levels.map((level) => level.toLowerCase());
};

const validateAdminLevels = async (value) => {
  const networks = await validAdminLevels();
  if (!networks.includes(value.toLowerCase())) {
    throw new Error("Invalid network");
  }
};

const validNetworks = async () => {
  const networks = await NetworkModel("airqo").distinct("name");
  return networks.map((network) => network.toLowerCase());
};
const validateNetwork = async (value) => {
  const networks = await validNetworks();
  if (!networks.includes(value.toLowerCase())) {
    throw new Error("Invalid network");
  }
};

const validateCoordinate = (coordinate) => {
  const [longitude, latitude] = coordinate;
  if (
    typeof latitude !== "number" ||
    isNaN(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    logText("Invalid latitude coordinate");
    throw new Error("Invalid latitude coordinate");
  }
  if (
    typeof longitude !== "number" ||
    isNaN(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    logText("Invalid longitude coordinate");
    throw new Error("Invalid longitude coordinate");
  }
};

const validatePolygonCoordinates = (value) => {
  if (!Array.isArray(value)) {
    logText("Coordinates must be provided as an array");
    throw new Error("Coordinates must be provided as an array");
  }
  if (value.length === 0) {
    logText("At least one polygon must be provided");
    throw new Error("At least one polygon must be provided");
  }
  for (const polygon of value) {
    if (!Array.isArray(polygon)) {
      logText("Each polygon must be provided as an array of coordinates");
      throw new Error(
        "Each polygon must be provided as an array of coordinates"
      );
    }
    if (polygon.length < 4) {
      logText("Each polygon must have at least four coordinates");
      throw new Error("Each polygon must have at least four coordinates");
    }
    for (const coordinate of polygon) {
      validateCoordinate(coordinate);
    }
  }
  return true;
};

const validateMultiPolygonCoordinates = (value) => {
  if (!Array.isArray(value)) {
    logText("Coordinates must be provided as an array");
    throw new Error("Coordinates must be provided as an array");
  }
  if (value.length === 0) {
    logText("At least one multipolygon must be provided");
    throw new Error("At least one multipolygon must be provided");
  }
  for (const multipolygon of value) {
    validatePolygonCoordinates(multipolygon);
  }
  return true;
};

const validatePagination = (req, res, next) => {
  const limit = parseInt(req.query.limit, 10);
  const skip = parseInt(req.query.skip, 10);
  req.query.limit = isNaN(limit) || limit < 1 ? 1000 : limit;
  req.query.skip = isNaN(skip) || skip < 0 ? 0 : skip;
  next();
};

const headers = (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  next();
};

router.use(headers);
router.use(validatePagination);

/************************ grids ********************************/
router.post(
  "/",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant should not be empty IF provided")
        .bail()
        .trim()
        .toLowerCase()
        .custom(validateNetwork)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      body("name")
        .exists()
        .withMessage("name should be provided")
        .bail()
        .notEmpty()
        .withMessage("The name should not be empty")
        .trim(),
      body("shape")
        .exists()
        .withMessage("shape should be provided")
        .bail()
        .notEmpty()
        .withMessage("shape should not be empty")
        .bail()
        .isObject()
        .withMessage("shape must be an object"),
      body("shape.type")
        .exists()
        .withMessage("shape.type should be provided")
        .bail()
        .trim()
        .notEmpty()
        .withMessage("shape.type should not be empty")
        .bail()
        .isIn(["Polygon", "MultiPolygon"])
        .withMessage("the shape type must either be Polygon or MultiPolygon"),
      body("shape.coordinates")
        .exists()
        .withMessage("shape.coordinates should be provided")
        .bail()
        .custom((value, { req }) => {
          const shapeType = req.body.shape.type;
          if (shapeType === "Polygon") {
            return validatePolygonCoordinates(value);
          } else if (shapeType === "MultiPolygon") {
            return validateMultiPolygonCoordinates(value);
          }
          return true;
        }),
      body("admin_level")
        .exists()
        .withMessage("admin_level should be provided")
        .bail()
        .trim()
        .notEmpty()
        .withMessage("admin_level should not be empty")
        .bail()
        .custom(validateAdminLevels)
        // .isIn([
        //   "village",
        //   "district",
        //   "parish",
        //   "division",
        //   "county",
        //   "subcounty",
        //   "country",
        //   "state",
        //   "province",
        //   "region",
        //   "municipality",
        //   "city",
        //   "town",
        //   "ward",
        //   "neighborhood",
        //   "community",
        //   "census tract",
        //   "block",
        //   "postal code",
        //   "zip code",
        // ])
        .withMessage(
          "admin_level values include but not limited to: province, state, village, county, subcounty, village, parish, country, division and district"
        ),
      body("network_id")
        .trim()
        .exists()
        .withMessage("the network_id must be provided")
        .bail()
        .notEmpty()
        .withMessage("the network_id should not be empty")
        .bail()
        .isMongoId()
        .withMessage("id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),
  createGridController.create
);
router.get(
  "/",
  oneOf([
    query("tenant")
      .optional()
      .notEmpty()
      .withMessage("tenant should not be empty IF provided")
      .bail()
      .trim()
      .toLowerCase()
      .custom(validateNetwork)
      .withMessage("the tenant value is not among the expected ones"),
  ]),
  oneOf([
    [
      query("id")
        .optional()
        .notEmpty()
        .trim()
        .isMongoId()
        .withMessage("id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
      query("name")
        .optional()
        .notEmpty()
        .withMessage("name cannot be empty")
        .trim(),
      query("admin_level")
        .optional()
        .notEmpty()
        .withMessage(
          "admin_level is empty, should not be if provided in request"
        )
        .bail()
        .toLowerCase()
        .custom(validateAdminLevels)
        // .isIn([
        //   "village",
        //   "district",
        //   "parish",
        //   "division",
        //   "county",
        //   "subcounty",
        //   "country",
        //   "state",
        //   "province",
        //   "region",
        //   "municipality",
        //   "city",
        //   "town",
        //   "ward",
        //   "neighborhood",
        //   "community",
        //   "census tract",
        //   "block",
        //   "postal code",
        //   "zip code",
        // ])
        .withMessage(
          "admin_level values include: province, state, village, county, subcounty, village, parish, country, division and district"
        ),
    ],
  ]),
  createGridController.list
);

router.delete(
  "/:grid_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant cannot be empty if provided")
        .bail()
        .trim()
        .toLowerCase()
        .custom(validateNetwork)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    param("grid_id")
      .exists()
      .withMessage(
        "the record's identifier is missing in request, consider using the id"
      )
      .bail()
      .trim()
      .isMongoId()
      .withMessage("grid_id must be an object ID")
      .bail()
      .customSanitizer((value) => {
        return ObjectId(value);
      }),
  ]),

  createGridController.delete
);
router.put(
  "/:grid_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant cannot be empty if provided")
        .bail()
        .trim()
        .toLowerCase()
        .custom(validateNetwork)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    param("grid_id")
      .exists()
      .withMessage("the grid_ids is missing in request")
      .bail()
      .trim()
      .isMongoId()
      .withMessage("grid_id must be an object ID")
      .bail()
      .customSanitizer((value) => {
        return ObjectId(value);
      }),
  ]),
  oneOf([
    [
      body("net_email")
        .optional()
        .notEmpty()
        .withMessage("the email should not be empty if provided")
        .bail()
        .isEmail()
        .withMessage("this is not a valid email address")
        .trim(),
      body("net_website")
        .optional()
        .notEmpty()
        .withMessage("the net_website should not be empty if provided")
        .bail()
        .isURL()
        .withMessage("the net_website is not a valid URL")
        .trim(),
      body("net_status")
        .optional()
        .notEmpty()
        .withMessage("the net_status should not be empty if provided")
        .bail()
        .toLowerCase()
        .isIn(["active", "inactive", "pending"])
        .withMessage(
          "the net_status value is not among the expected ones which include: active, inactive, pending"
        )
        .trim(),
      body("net_phoneNumber")
        .optional()
        .notEmpty()
        .withMessage("the phoneNumber should not be empty if provided")
        .bail()
        .isMobilePhone()
        .withMessage("the phoneNumber is not a valid one")
        .bail()
        .trim(),
      body("net_category")
        .optional()
        .notEmpty()
        .withMessage("the net_category should not be empty if provided")
        .bail()
        .toLowerCase()
        .isIn([
          "business",
          "research",
          "policy",
          "awareness",
          "school",
          "others",
        ])
        .withMessage(
          "the status value is not among the expected ones which include: business, research, policy, awareness, school, others"
        )
        .trim(),
      body("net_name")
        .if(body("net_name").exists())
        .notEmpty()
        .withMessage("the net_name should not be empty")
        .trim(),
      body("net_sites")
        .optional()
        .custom((value) => {
          return Array.isArray(value);
        })
        .withMessage("the net_sites should be an array")
        .bail()
        .notEmpty()
        .withMessage("the net_sites should not be empty"),
      body("net_sites.*")
        .optional()
        .isMongoId()
        .withMessage("each use should be an object ID"),
    ],
  ]),

  createGridController.update
);
router.patch(
  "/:grid_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant cannot be empty if provided")
        .bail()
        .trim()
        .toLowerCase()
        .custom(validateNetwork)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    param("grid_id")
      .exists()
      .withMessage("the grid_id is missing in request")
      .bail()
      .trim()
      .isMongoId()
      .withMessage("grid_id must be an object ID")
      .bail()
      .customSanitizer((value) => {
        return ObjectId(value);
      }),
  ]),
  oneOf([
    [
      body("net_email")
        .optional()
        .notEmpty()
        .withMessage("the email should not be empty if provided")
        .bail()
        .isEmail()
        .withMessage("this is not a valid email address")
        .trim(),
      body("net_website")
        .optional()
        .notEmpty()
        .withMessage("the net_website should not be empty if provided")
        .bail()
        .isURL()
        .withMessage("the net_website is not a valid URL")
        .trim(),
      body("net_status")
        .optional()
        .notEmpty()
        .withMessage("the net_status should not be empty if provided")
        .bail()
        .toLowerCase()
        .isIn(["active", "inactive", "pending"])
        .withMessage(
          "the net_status value is not among the expected ones which include: active, inactive, pending"
        )
        .trim(),
      body("net_phoneNumber")
        .optional()
        .notEmpty()
        .withMessage("the phoneNumber should not be empty if provided")
        .bail()
        .isMobilePhone()
        .withMessage("the phoneNumber is not a valid one")
        .bail()
        .trim(),
      body("net_category")
        .optional()
        .notEmpty()
        .withMessage("the net_category should not be empty if provided")
        .bail()
        .toLowerCase()
        .isIn([
          "business",
          "research",
          "policy",
          "awareness",
          "school",
          "others",
        ])
        .withMessage(
          "the status value is not among the expected ones which include: business, research, policy, awareness, school, others"
        )
        .trim(),
      body("net_name")
        .if(body("net_name").exists())
        .notEmpty()
        .withMessage("the net_name should not be empty")
        .trim(),
      body("net_sites")
        .optional()
        .custom((value) => {
          return Array.isArray(value);
        })
        .withMessage("the net_sites should be an array")
        .bail()
        .notEmpty()
        .withMessage("the net_sites should not be empty"),
      body("net_sites.*")
        .optional()
        .isMongoId()
        .withMessage("each use should be an object ID"),
    ],
  ]),

  createGridController.refresh
);
/************************ managing grids *************************/
router.put(
  "/:grid_id/assign-site/:site_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant cannot be empty if provided")
        .bail()
        .trim()
        .toLowerCase()
        .custom(validateNetwork)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("grid_id")
        .exists()
        .withMessage("the grid ID param is missing in the request")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("the grid ID must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
      param("site_id")
        .exists()
        .withMessage("the site ID param is missing in the request")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("the site ID must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),

  createGridController.assignOneSiteToGrid
);
router.get(
  "/:grid_id/assigned-sites",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant cannot be empty if provided")
        .bail()
        .trim()
        .toLowerCase()
        .custom(validateNetwork)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    param("grid_id")
      .optional()
      .isMongoId()
      .withMessage("grid_id must be an object ID")
      .bail()
      .customSanitizer((value) => {
        return ObjectId(value);
      }),
  ]),
  createGridController.listAssignedSites
);
router.get(
  "/:grid_id/available-sites",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant cannot be empty if provided")
        .bail()
        .trim()
        .toLowerCase()
        .custom(validateNetwork)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    param("grid_id")
      .optional()
      .isMongoId()
      .withMessage("grid_id must be an object ID")
      .bail()
      .customSanitizer((value) => {
        return ObjectId(value);
      }),
  ]),
  createGridController.listAvailableSites
);
router.post(
  "/:grid_id/assign-sites",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant cannot be empty if provided")
        .bail()
        .trim()
        .toLowerCase()
        .custom(validateNetwork)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("grid_id")
        .exists()
        .withMessage("the grid ID param is missing in the request")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("the grid ID must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
      body("site_ids")
        .exists()
        .withMessage("the site_ids should be provided")
        .bail()
        .custom((value) => {
          return Array.isArray(value);
        })
        .withMessage("the site_ids should be an array")
        .bail()
        .notEmpty()
        .withMessage("the site_ids should not be empty"),
      body("site_ids.*")
        .isMongoId()
        .withMessage("site_id provided must be an object ID"),
    ],
  ]),

  createGridController.assignManySitesToGrid
);
router.delete(
  "/:grid_id/unassign-many-sites",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant cannot be empty if provided")
        .bail()
        .trim()
        .toLowerCase()
        .custom(validateNetwork)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("grid_id")
        .exists()
        .withMessage("the grid ID is missing in request")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("the grid ID must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
      body("site_ids")
        .exists()
        .withMessage("the site_ids should be provided")
        .bail()
        .custom((value) => {
          return Array.isArray(value);
        })
        .withMessage("the site_ids should be an array")
        .bail()
        .notEmpty()
        .withMessage("the site_ids should not be empty"),
      body("site_ids.*")
        .isMongoId()
        .withMessage("site_id provided must be an object ID"),
    ],
  ]),

  createGridController.unAssignManySitesFromGrid
);
router.delete(
  "/:grid_id/unassign-site/:site_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant cannot be empty if provided")
        .bail()
        .trim()
        .toLowerCase()
        .custom(validateNetwork)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("grid_id")
        .exists()
        .withMessage("the grid ID is missing in request")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("the grid ID must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
      param("site_id")
        .exists()
        .withMessage("the site ID is missing in request")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("site ID must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),

  createGridController.unAssignOneSiteFromGrid
);
router.post(
  "/upload-shapefile",
  upload.single("shapefile"),
  createGridController.createGridFromShapefile
);
router.post(
  "/nearby",
  oneOf([
    [
      body("latitude")
        .trim()
        .exists()
        .withMessage("the latitude is missing")
        .notEmpty()
        .withMessage("the latitude should not be empty"),
      body("longitude")
        .trim()
        .exists()
        .withMessage("the longitude is missing")
        .notEmpty()
        .withMessage("the longitude should not be empty"),
    ],
  ]),
  createGridController.findGridUsingGPSCoordinates
);

/************************ admin levels ********************/
router.post(
  "/levels",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant should not be empty IF provided")
        .bail()
        .trim()
        .toLowerCase()
        .custom(validateNetwork)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      body("name")
        .exists()
        .withMessage("the name is is missing in your request")
        .bail()
        .notEmpty()
        .withMessage("the name should not be empty")
        .trim(),
      body("description")
        .optional()
        .notEmpty()
        .withMessage("tenant should not be empty IF provided")
        .trim(),
    ],
  ]),
  createGridController.createAdminLevel
);
router.get("/levels", createGridController.listAdminLevels);
router.put("/levels/:level_id", createGridController.updateAdminLevel);
router.delete("/levels/:level_id", createGridController.deleteAdminLevel);
router.get("/levels/:level_id", createGridController.listAdminLevels);

router.get(
  "/:grid_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant cannot be empty if provided")
        .bail()
        .trim()
        .toLowerCase()
        .custom(validateNetwork)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    param("grid_id")
      .optional()
      .isMongoId()
      .withMessage("grid_id must be an object ID")
      .bail()
      .customSanitizer((value) => {
        return ObjectId(value);
      }),
  ]),
  createGridController.list
);
module.exports = router;
