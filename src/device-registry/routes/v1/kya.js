const express = require("express");
const router = express.Router();
const knowYourAirController = require("@controllers/create-know-your-air");
const { check, oneOf, query, body, param } = require("express-validator");
const constants = require("@config/constants");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;
const { logElement, logText, logObject } = require("@utils/log");
const isEmpty = require("is-empty");
const { getModelByTenant } = require("@config/database");

const NetworkSchema = require("@models/Network");
const NetworkModel = (tenant) => {
  try {
    const networks = mongoose.model("networks");
    return networks;
  } catch (error) {
    const networks = getModelByTenant(tenant, "network", NetworkSchema);
    return networks;
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

logObject("validateNetwork", validateNetwork);

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

/******************* lessons *********************************************/
router.get(
  "/lessons",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      query("id")
        .optional()
        .notEmpty()
        .withMessage("this tip identifier cannot be empty")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),
  knowYourAirController.listLessons
);

router.get(
  "/lessons/users/:user_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),

  oneOf([
    [
      param("user_id")
        .exists()
        .withMessage("the user_id is missing in the request")
        .bail()
        .trim(),
    ],
  ]),

  knowYourAirController.listLessons
);

router.post(
  "/lessons",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      body("completion_message")
        .exists()
        .withMessage("the completion_message is missing in request")
        .bail()
        .notEmpty()
        .withMessage("the completion_message should not be empty")
        .trim(),
      body("title")
        .exists()
        .withMessage("the title is missing in request")
        .bail()
        .notEmpty()
        .withMessage("the title should not be empty")
        .trim(),
      body("image")
        .exists()
        .withMessage("the image is missing in request")
        .bail()
        .isURL()
        .withMessage("the image url is not a valid URL")
        .trim(),
    ],
  ]),
  knowYourAirController.createLesson
);
router.put(
  "/lessons/:lesson_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("lesson_id")
        .exists()
        .withMessage("the lesson_id should exist")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("lesson_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),
  oneOf([
    body()
      .notEmpty()
      .custom((value) => {
        return !isEmpty(value);
      })
      .withMessage("The request body should not be empty."),
  ]),
  oneOf([
    [
      body("title")
        .optional()
        .notEmpty()
        .withMessage("the title is missing in request")
        .bail()
        .trim(),
      body("image")
        .optional()
        .notEmpty()
        .withMessage("the image is missing in request")
        .bail()
        .isURL()
        .withMessage("the image url is not a valid URL")
        .trim(),
      body("completion_message")
        .optional()
        .notEmpty()
        .withMessage("the completion_message is missing in request")
        .bail()
        .trim(),
    ],
  ]),
  knowYourAirController.updateLesson
);
router.delete(
  "/lessons/:lesson_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant should not be empty if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("lesson_id")
        .exists()
        .withMessage("the lesson_id should exist")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("the lesson_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),
  knowYourAirController.deleteLesson
);
router.get(
  "/lessons/:lesson_id/assigned-tasks",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("lesson_id")
        .exists()
        .withMessage("the lesson_id should exist")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("lesson_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),
  knowYourAirController.listAssignedTasks
);
router.get(
  "/lessons/:lesson_id/available-tasks",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      query("id")
        .optional()
        .notEmpty()
        .withMessage("this tip identifier cannot be empty")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),
  knowYourAirController.listAvailableTasks
);
router.get(
  "/lessons/:lesson_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("lesson_id")
        .exists()
        .withMessage("the lesson_id should exist")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("lesson_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),
  knowYourAirController.listLessons
);

/************* tracking user progress ******************************/
router.get(
  "/progress/:user_id?",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  knowYourAirController.listUserLessonProgress
);
router.get(
  "/progress/lessons/:lesson_id/users/:user_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("lesson_id")
        .exists()
        .withMessage("the lesson_id is missing in the request")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("lesson_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
      param("user_id")
        .exists()
        .withMessage("the user_id is missing in the request")
        .bail()
        .trim(),
    ],
  ]),
  knowYourAirController.listUserLessonProgress
);
router.delete(
  "/progress/:progress_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant should not be empty if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("progress_id")
        .exists()
        .withMessage("the progress_id should exist")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("progress_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),
  knowYourAirController.deleteUserLessonProgress
);
router.put(
  "/progress/:progress_id",
  oneOf([
    body()
      .notEmpty()
      .custom((value) => {
        return !isEmpty(value);
      })
      .withMessage("the request body should not be empty"),
  ]),
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("progress_id")
        .exists()
        .withMessage("the progress_id should exist")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("progress_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),
  oneOf([
    [
      body("user_id")
        .optional()
        .notEmpty()
        .withMessage("the user_id should not be empty IF provided")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("user_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
      body("lesson_id")
        .optional()
        .notEmpty()
        .withMessage("the lesson_id should not be empty IF provided")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("lesson_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
      body("completed")
        .optional()
        .notEmpty()
        .withMessage("completed should not be empty IF provided")
        .bail()
        .trim()
        .isBoolean()
        .withMessage("the completed should be boolean"),
      body("active_task")
        .exists()
        .withMessage("the progress is missing in request")
        .bail()
        .trim(),
      body("status")
        .exists()
        .withMessage("the status is missing in request")
        .bail()
        .isIn(["TODO", "IN_PROGRESS", "PENDING_COMPLETION", "COMPLETE"])
        .withMessage(
          "the status must be one of the following: TODO, IN_PROGRESS, PENDING_COMPLETION, COMPLETE"
        )
        .bail()
        .trim(),
      ,
    ],
  ]),
  knowYourAirController.updateUserLessonProgress
);
router.post(
  "/progress",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      body("user_id")
        .exists()
        .withMessage("the user_id is missing in request")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("user_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
      body("lesson_id")
        .exists()
        .withMessage("the lesson_id is missing in request")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("lesson_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
      body("completed")
        .optional()
        .notEmpty()
        .withMessage("the lesson_id should not be empty IF provided")
        .bail()
        .trim()
        .isBoolean()
        .withMessage("the completed should be boolean"),
      body("active_task")
        .exists()
        .withMessage("the progress is missing in request")
        .bail()
        .trim(),
      body("status")
        .exists()
        .withMessage("the status is missing in request")
        .bail()
        .isIn(["TODO", "IN_PROGRESS", "PENDING_COMPLETION", "COMPLETE"])
        .withMessage(
          "the status must be one of the following: TODO, IN_PROGRESS, PENDING_COMPLETION, COMPLETE"
        )
        .bail()
        .trim(),
    ],
  ]),
  knowYourAirController.createUserLessonProgress
);

router.post(
  "/progress/sync/:user_id",
  oneOf([
    body()
      .notEmpty()
      .custom((value) => {
        return !isEmpty(value);
      })
      .withMessage("the request body should not be empty"),
  ]),
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("user_id")
        .exists()
        .withMessage("the user_id should exist")
        .bail()
        .trim(),
    ],
  ]),
  oneOf([
    [
      body("kya_user_progress")
        .exists()
        .withMessage("the kya_user_progress is missing in the request body")
        .bail()
        .custom((value) => {
          return Array.isArray(value);
        })
        .withMessage(
          "Invalid request body format. The kya_user_progress should be an array"
        ),
      body("kya_user_progress.*")
        .optional()
        .isObject()
        .withMessage("Each kya user progress should be an object"),
      body("kya_user_progress.*.active_task")
        .exists()
        .withMessage("active_task is missing in the kya user progress object")
        .bail()
        .notEmpty()
        .withMessage("the active_task must not be empty")
        .bail()
        .trim(),
      body("kya_user_progress.*.status")
        .exists()
        .withMessage("status is missing in the kya user progress object")
        .bail()
        .isIn(["TODO", "IN_PROGRESS", "PENDING_COMPLETION", "COMPLETE"])
        .withMessage(
          "the status must be one of the following: TODO, IN_PROGRESS, PENDING_COMPLETION, COMPLETE"
        )
        .bail()
        .trim(),

      body("kya_user_progress.*._id")
        .exists()
        .withMessage("the lesson_id is missing in request")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("lesson_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),
  knowYourAirController.syncUserLessonProgress
);

/******************* tasks *********************************************/
router.get(
  "/tasks",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      query("id")
        .optional()
        .notEmpty()
        .withMessage("this tip identifier cannot be empty")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),
  knowYourAirController.listTask
);
router.post(
  "/tasks",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      body("content")
        .exists()
        .withMessage("the content is missing in request")
        .bail()
        .notEmpty()
        .withMessage("the content should not be empty")
        .trim(),
      body("title")
        .exists()
        .withMessage("the title is missing in request")
        .bail()
        .notEmpty()
        .withMessage("the title should not be empty")
        .trim(),
      body("image")
        .exists()
        .withMessage("the image is missing in request")
        .bail()
        .isURL()
        .withMessage("the image url is not a valid URL")
        .trim(),
      body("task_position")
        .exists()
        .withMessage("the task_position is missing in request")
        .bail()
        .isNumeric()
        .withMessage("the task_position should be a number")
        .trim(),
    ],
  ]),
  knowYourAirController.createTask
);
router.put(
  "/tasks/:task_id",
  oneOf([
    body()
      .notEmpty()
      .custom((value) => {
        return !isEmpty(value);
      })
      .withMessage("the request body should not be empty"),
  ]),
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("task_id")
        .exists()
        .withMessage("the task_id should exist")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("task_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),

  oneOf([
    [
      body("content")
        .optional()
        .notEmpty()
        .withMessage("the content should not be empty IF provided")
        .bail()
        .trim(),
      body("title")
        .optional()
        .notEmpty()
        .withMessage("the title should not be empty IF provided")
        .bail()
        .trim(),
      body("image")
        .optional()
        .notEmpty()
        .withMessage("the image should not be empty IF provided")
        .bail()
        .isURL()
        .withMessage("the image url is not a valid URL")
        .trim(),
      body("task_position")
        .exists()
        .withMessage("the task_position is missing in request")
        .bail()
        .isNumeric()
        .withMessage("the task_position should be a number")
        .trim(),
    ],
  ]),
  knowYourAirController.updateTask
);
router.delete(
  "/tasks/:task_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant should not be empty if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("task_id")
        .exists()
        .withMessage("the task_id should exist")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("task_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),
  knowYourAirController.deleteTask
);
router.get(
  "/tasks/:task_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("task_id")
        .exists()
        .withMessage("the task_id should exist")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("task_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),
  knowYourAirController.listTask
);

/******************* manage lessons *********************************************/
router.post(
  "/lessons/:lesson_id/assign-tasks",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("lesson_id")
        .exists()
        .withMessage("the lesson_id is missing in the request")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("the lesson_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
      body("task_ids")
        .exists()
        .withMessage("the task_ids should be provided")
        .bail()
        .custom((value) => {
          return Array.isArray(value);
        })
        .withMessage("the task_ids should be an array")
        .bail()
        .notEmpty()
        .withMessage("the task_ids should not be empty"),
      body("task_ids.*")
        .isMongoId()
        .withMessage("task_id provided must be an object ID"),
    ],
  ]),
  knowYourAirController.assignManyTasksToLesson
);
router.put(
  "/lessons/:lesson_id/assign-task/:task_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("the tenant cannot be empty, if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("lesson_id")
        .exists()
        .withMessage("the lesson_id should exist")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("lesson_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
      param("task_id")
        .exists()
        .withMessage("the task_id should exist")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("task_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),
  knowYourAirController.assignTaskToLesson
);
router.delete(
  "/lessons/:lesson_id/unassign-task/:task_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant should not be empty if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("lesson_id")
        .exists()
        .withMessage("the lesson_id should exist")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("lesson_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
      param("task_id")
        .exists()
        .withMessage("the task_id should exist")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("task_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
    ],
  ]),
  knowYourAirController.removeTaskFromLesson
);
router.delete(
  "/lessons/:lesson_id/unassign-many-tasks",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant should not be empty if provided")
        .bail()
        .trim()
        .toLowerCase()
        .isIn(constants.NETWORKS)
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      param("lesson_id")
        .exists()
        .withMessage("the lesson_id should exist")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("lesson_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
      body("task_ids")
        .exists()
        .withMessage("the task_ids should be provided")
        .bail()
        .custom((value) => {
          return Array.isArray(value);
        })
        .withMessage("the task_ids should be an array")
        .bail()
        .notEmpty()
        .withMessage("the task_ids should not be empty"),
      body("task_ids.*")
        .isMongoId()
        .withMessage("task_id provided must be an object ID"),
    ],
  ]),

  knowYourAirController.removeManyTasksFromLesson
);

module.exports = router;
