const constants = require("@config/constants");
const NetworkModel = require("@models/Network");
const PermissionModel = require("@models/Permission");
const UserModel = require("@models/User");
const { logElement, logText, logObject } = require("./log");
const generateFilter = require("./generate-filter");
const httpStatus = require("http-status");
const companyEmailValidator = require("company-email-validator");
const isEmpty = require("is-empty");
const mongoose = require("mongoose").set("debug", true);
const ObjectId = mongoose.Types.ObjectId;
const log4js = require("log4js");
const logger = log4js.getLogger(`${constants.ENVIRONMENT} -- network-util`);
const controlAccessUtil = require("@utils/control-access");

const isUserAssignedToNetwork = (user, networkId) => {
  if (user && user.network_roles && user.network_roles.length > 0) {
    return user.network_roles.some((assignment) => {
      return assignment.network.equals(networkId);
    });
  }
  return false;
};

const findNetworkAssignmentIndex = (user, net_id) => {
  if (!user.network_roles || !Array.isArray(user.network_roles)) {
    return -1;
  }

  return user.network_roles.findIndex((assignment) =>
    assignment.network.equals(net_id)
  );
};

const createNetwork = {
  getNetworkFromEmail: async (request) => {
    try {
      const responseFromExtractOneNetwork =
        createNetwork.extractOneAcronym(request);

      logObject("responseFromExtractOneNetwork", responseFromExtractOneNetwork);

      if (responseFromExtractOneNetwork.success === true) {
        const { tenant } = request.query;
        let filter = {};
        const skip = 0;
        const limit = 1;

        let modifiedRequest = Object.assign({}, request);
        modifiedRequest["query"] = {};
        modifiedRequest["query"]["net_acronym"] =
          responseFromExtractOneNetwork.data;

        const responseFromGenerateFilter =
          generateFilter.networks(modifiedRequest);

        logObject("responseFromGenerateFilter", responseFromGenerateFilter);

        if (responseFromGenerateFilter.success === true) {
          filter = responseFromGenerateFilter.data;
          logObject("filter", filter);
        } else if (responseFromGenerateFilter.success === false) {
          return responseFromGenerateFilter;
        }

        const responseFromListNetworks = await NetworkModel(tenant).list({
          filter,
          limit,
          skip,
        });

        if (responseFromListNetworks.success === true) {
          const data = responseFromListNetworks.data;
          const storedNetwork = data[0]
            ? data[0].net_name || data[0].net_acronym
            : "";
          return {
            success: true,
            data: storedNetwork,
            message: data[0]
              ? "successfully retrieved the network"
              : "No network exists for this operation",
            status: httpStatus.OK,
          };
        } else if (responseFromListNetworks.success === false) {
          return responseFromListNetworks;
        }
      } else if (responseFromExtractOneNetwork.success === false) {
        return responseFromExtractOneNetwork;
      }
    } catch (error) {
      logger.error(`Internal Server Error ${error.message}`);
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
      };
    }
  },
  extractOneAcronym: (request) => {
    try {
      const { net_email } = request.body;
      let segments = [];
      let network = "";

      if (net_email) {
        let isCompanyEmail = companyEmailValidator.isCompanyEmail(net_email);

        if (isCompanyEmail) {
          segments = net_email.split("@").filter((segment) => segment);
          network = segments[1].split(".")[0];
        } else if (!isCompanyEmail) {
          return {
            success: false,
            message: "Bad Request Error",
            errors: {
              message: "You need a company email for this operation",
            },
            status: httpStatus.BAD_REQUEST,
          };
        }
      }

      return {
        success: true,
        data: network,
        status: httpStatus.OK,
        message: "successfully removed the file extension",
      };
    } catch (error) {
      logger.error(`Internal Server Error ${error.message}`);
      return {
        success: false,
        message: "Internal Server Error",
        status: httpStatus.INTERNAL_SERVER_ERROR,
        errors: {
          message: error.message,
        },
      };
    }
  },

  sanitizeName: (name) => {
    try {
      let nameWithoutWhiteSpaces = name.replace(/\s/g, "");
      let shortenedName = nameWithoutWhiteSpaces.substring(0, 15);
      let trimmedName = shortenedName.trim();
      return trimmedName.toLowerCase();
    } catch (error) {
      logger.error(`Internal Server Error ${error.message}`);
      logElement("the sanitise name error", error.message);
    }
  },
  create: async (request) => {
    try {
      const { body, query } = request;
      const { tenant } = query;

      let modifiedBody = Object.assign({}, body);

      const responseFromExtractNetworkName =
        createNetwork.extractOneAcronym(request);

      logObject(
        "responseFromExtractNetworkName",
        responseFromExtractNetworkName
      );

      if (responseFromExtractNetworkName.success === true) {
        modifiedBody["net_name"] = responseFromExtractNetworkName.data;
        modifiedBody["net_acronym"] = responseFromExtractNetworkName.data;
      } else if (responseFromExtractNetworkName.success === false) {
        return responseFromExtractNetworkName;
      }

      const networkObject = await NetworkModel(tenant.toLowerCase())
        .findOne({ net_website: modifiedBody.net_website })
        .lean();
      if (!isEmpty(networkObject)) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: {
            message: `Network for ${modifiedBody.net_website} already exists`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      const user = request.user;
      logObject("the user making the request", user);
      if (!isEmpty(user)) {
        modifiedBody.net_manager = ObjectId(user._id);
        modifiedBody.net_manager_username = user.email;
        modifiedBody.net_manager_firstname = user.firstName;
        modifiedBody.net_manager_lastname = user.lastName;
      } else if (isEmpty(user)) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: "creator's details are not provided" },
          status: httpStatus.BAD_REQUEST,
        };
      }

      logObject("modifiedBody", modifiedBody);
      const responseFromRegisterNetwork = await NetworkModel(tenant).register(
        modifiedBody
      );

      logObject("responseFromRegisterNetwork", responseFromRegisterNetwork);

      if (responseFromRegisterNetwork.success === true) {
        logObject("responseFromRegisterNetwork", responseFromRegisterNetwork);
        const net_id = responseFromRegisterNetwork.data._doc._id;
        if (isEmpty(net_id)) {
          return {
            success: false,
            message: "Internal Server Error",
            errors: {
              message: "Unable to retrieve the network Id of created network",
            },
          };
        }

        /**
         ************** STEPS:
         * create the SUPER_ADMIN role for this network
         * create the SUPER_ADMIN  permissions IF they do not yet exist
         * assign the these SUPER_ADMIN permissions to the SUPER_ADMIN role
         * assign the creating User to this new SUPER_ADMIN role of their Network
         */

        let requestForRole = {};
        requestForRole.query = {};
        requestForRole.query.tenant = tenant;
        requestForRole.body = {
          role_code: "SUPER_ADMIN",
          role_name: "SUPER_ADMIN",
          network_id: net_id,
        };

        const responseFromCreateRole = await controlAccessUtil.createRole(
          requestForRole
        );

        if (responseFromCreateRole.success === false) {
          return responseFromCreateRole;
        } else if (responseFromCreateRole.success === true) {
          /**
           *  * assign the main permissions to the role
           */
          logObject("responseFromCreateRole", responseFromCreateRole);
          const role_id = responseFromCreateRole.data._id;
          if (isEmpty(role_id)) {
            return {
              success: false,
              message: "Internal Server Error",
              errors: {
                message:
                  "Unable to retrieve the role id of the newly create super admin of this network",
              },
              status: httpStatus.INTERNAL_SERVER_ERROR,
            };
          }

          logObject(
            "constants.SUPER_ADMIN_PERMISSIONS",
            constants.SUPER_ADMIN_PERMISSIONS
          );

          const superAdminPermissions = constants.SUPER_ADMIN_PERMISSIONS
            ? constants.SUPER_ADMIN_PERMISSIONS
            : [];
          const trimmedPermissions = superAdminPermissions.map((permission) =>
            permission.trim()
          );

          const uniquePermissions = [...new Set(trimmedPermissions)];

          const existingPermissionIds = await PermissionModel(tenant)
            .find({
              permission: { $in: uniquePermissions },
            })
            .distinct("_id");

          const existingPermissionNames = await PermissionModel(tenant)
            .find({
              permission: { $in: uniquePermissions },
            })
            .distinct("permission");

          logObject("existingPermissionIds", existingPermissionIds);

          const newPermissionDocuments = uniquePermissions
            .filter(
              (permission) => !existingPermissionNames.includes(permission)
            )
            .map((permission) => ({
              permission: permission
                .replace(/[^A-Za-z]/g, " ")
                .toUpperCase()
                .replace(/ /g, "_"),
              description: permission
                .replace(/[^A-Za-z]/g, " ")
                .toUpperCase()
                .replace(/ /g, "_"),
            }));

          logObject("newPermissionDocuments", newPermissionDocuments);

          // Step 3: Insert the filtered permissions
          const insertedPermissions = await PermissionModel(tenant).insertMany(
            newPermissionDocuments
          );
          logObject("insertedPermissions", insertedPermissions);
          const allPermissionIds = [
            ...existingPermissionIds,
            ...insertedPermissions.map((permission) => permission._id),
          ];

          logObject("allPermissionIds", allPermissionIds);

          let requestToAssignPermissions = {};
          requestToAssignPermissions.body = {};
          requestToAssignPermissions.query = {};
          requestToAssignPermissions.params = {};
          requestToAssignPermissions.body.permissions = allPermissionIds;
          requestToAssignPermissions.query.tenant = tenant;
          requestToAssignPermissions.params = { role_id };

          const responseFromAssignPermissionsToRole =
            await controlAccessUtil.assignPermissionsToRole(
              requestToAssignPermissions
            );
          if (responseFromAssignPermissionsToRole.success === false) {
            return responseFromAssignPermissionsToRole;
          } else if (responseFromAssignPermissionsToRole.success === true) {
            /**
             * assign this user to this new super ADMIN role and this new network
             */
            const updatedUser = await UserModel(tenant).findByIdAndUpdate(
              user._id,
              {
                $addToSet: {
                  network_roles: {
                    network: net_id,
                    role: role_id,
                    userType: "user",
                  },
                },
              },
              { new: true }
            );

            if (isEmpty(updatedUser)) {
              return {
                success: false,
                message: "Internal Server Error",
                status: httpStatus.INTERNAL_SERVER_ERROR,
                errors: {
                  message: `Unable to assign the network to the User ${user._id}`,
                },
              };
            }

            return responseFromRegisterNetwork;
          }
        }
      } else if (responseFromRegisterNetwork.success === false) {
        return responseFromRegisterNetwork;
      }
    } catch (err) {
      logObject("error here is big", err);
      return {
        success: false,
        message: "network util server errors",
        errors: { message: err.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },
  assignUsersHybrid: async (request) => {
    try {
      const { net_id } = request.params;
      const { user_ids } = request.body;
      const { tenant } = request.query;

      const network = await NetworkModel(tenant).findById(net_id);

      if (!network) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: `Invalid network ID ${net_id}` },
          status: httpStatus.BAD_REQUEST,
        };
      }

      const notAssignedUsers = [];
      let assignedUsers = 0;
      const bulkOperations = [];
      const cleanupOperations = [];

      for (const user_id of user_ids) {
        const user = await UserModel(tenant).findById(ObjectId(user_id)).lean();

        if (!user) {
          notAssignedUsers.push({
            user_id,
            reason: `Invalid User ID ${user_id}, please crosscheck`,
          });
          continue; // Continue to the next user
        }

        const existingAssignment = user.network_roles.find(
          (assignment) => assignment.network.toString() === net_id.toString()
        );

        if (existingAssignment) {
          notAssignedUsers.push({
            user_id,
            reason: `User ${user_id} is already assigned to the Network ${net_id}`,
          });
          continue;
        } else {
          bulkOperations.push({
            updateOne: {
              filter: { _id: user_id },
              update: {
                $addToSet: {
                  network_roles: { network: net_id },
                },
              },
            },
          });

          cleanupOperations.push({
            updateOne: {
              filter: {
                _id: user_id,
                network_roles: {
                  $elemMatch: { network: { $exists: true, $eq: null } },
                },
              },
              update: {
                $pull: {
                  network_roles: { network: { $exists: true, $eq: null } },
                },
              },
            },
          });
        }
      }

      if (bulkOperations.length > 0) {
        const { nModified } = await UserModel(tenant).bulkWrite(bulkOperations);
        assignedUsers = nModified;
      }

      let message;
      if (assignedUsers === 0) {
        message = "No users assigned to the network.";
      } else if (assignedUsers === user_ids.length) {
        message = "All users have been assigned to the network.";
      } else {
        message = `Operation partially successful; ${assignedUsers} of ${user_ids.length} users have been assigned to the network.`;
      }

      if (cleanupOperations.length > 0) {
        await UserModel(tenant).bulkWrite(cleanupOperations);
      }
      if (notAssignedUsers.length > 0) {
        return {
          success: false,
          message,
          status: httpStatus.BAD_REQUEST,
          errors: notAssignedUsers.reduce((errors, user) => {
            errors[user.user_id] = user.reason;
            return errors;
          }, {}),
        };
      }

      return {
        success: true,
        message,
        status: httpStatus.OK,
        data: assignedUsers,
      };
    } catch (error) {
      logger.error(`Internal Server Error -- ${error.message}`);
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },
  assignOneUser: async (request) => {
    try {
      const { net_id, user_id } = request.params;
      const { tenant } = request.query;

      const userExists = await UserModel(tenant).exists({ _id: user_id });
      const networkExists = await NetworkModel(tenant).exists({ _id: net_id });

      if (!userExists || !networkExists) {
        return {
          success: false,
          message: "User or Network not found",
          status: httpStatus.BAD_REQUEST,
          errors: { message: "User or Network not found" },
        };
      }

      const user = await UserModel(tenant).findById(user_id).lean();

      logObject("user", user);

      const isAlreadyAssigned = isUserAssignedToNetwork(user, net_id);

      if (isAlreadyAssigned) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: "Network already assigned to User" },
          status: httpStatus.BAD_REQUEST,
        };
      }
      const updatedUser = await UserModel(tenant).findByIdAndUpdate(
        user_id,
        {
          $addToSet: {
            network_roles: {
              network: net_id,
            },
          },
        },
        { new: true }
      );

      return {
        success: true,
        message: "User assigned to the Network",
        data: updatedUser,
        status: httpStatus.OK,
      };
    } catch (error) {
      logger.error(`Internal Server Error -- ${error.message}`);
      logObject("error", error);
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },

  unAssignUser: async (request) => {
    try {
      const { net_id, user_id } = request.params;
      const { tenant } = request.query;

      // Check if the network exists
      const network = await NetworkModel(tenant).findById(net_id);
      if (!network) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: "Network not found" },
          status: httpStatus.BAD_REQUEST,
        };
      }

      // Check if the user exists
      let user = await UserModel(tenant).findById(user_id);
      if (!user) {
        return {
          success: false,
          status: httpStatus.BAD_REQUEST,
          message: "Bad Request Error",
          errors: { message: "User not found" },
        };
      }

      const networkAssignmentIndex = findNetworkAssignmentIndex(user, net_id);

      if (networkAssignmentIndex === -1) {
        return {
          success: false,
          message: "Bad Request Error",
          status: httpStatus.BAD_REQUEST,
          errors: {
            message: `Network ${net_id.toString()} is not assigned to the user`,
          },
        };
      }

      // Remove the network assignment from the user's network_roles array
      user.network_roles.splice(networkAssignmentIndex, 1);

      // Update the user with the modified network_roles array
      const updatedUser = await UserModel(tenant).findByIdAndUpdate(
        user_id,
        { network_roles: user.network_roles },
        { new: true }
      );

      return {
        success: true,
        message: "Successfully unassigned User from the Network",
        data: updatedUser,
        status: httpStatus.OK,
      };
    } catch (error) {
      logObject("error", error);
      logger.error(`Internal Server Error -- ${error.message}`);
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },
  unAssignManyUsers: async (request) => {
    try {
      const { user_ids } = request.body;
      const { net_id } = request.params;
      const { tenant } = request.query;

      // Check if network exists
      const network = await NetworkModel(tenant).findById(net_id);
      if (!network) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: "Network not found" },
          status: httpStatus.BAD_REQUEST,
        };
      }

      //check of all these provided users actually do exist?
      const existingUsers = await UserModel(tenant).find(
        { _id: { $in: user_ids } },
        "_id"
      );

      if (existingUsers.length !== user_ids.length) {
        const nonExistentUsers = user_ids.filter(
          (user_id) => !existingUsers.find((user) => user._id.equals(user_id))
        );

        return {
          success: false,
          message: `Bad Request Error`,
          errors: {
            message: `The following users do not exist: ${nonExistentUsers}`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      // Check if all the provided user_ids are assigned to the network in network_roles
      const users = await UserModel(tenant).find({
        _id: { $in: user_ids },
        "network_roles.network": net_id,
      });

      if (users.length !== user_ids.length) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: {
            message: `Some of the provided User IDs are not assigned to this network ${net_id}`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      // Remove the network assignment from each user's network_roles array
      try {
        const totalUsers = user_ids.length;
        const { nModified, n } = await UserModel(tenant).updateMany(
          {
            _id: { $in: user_ids },
            network_roles: { $elemMatch: { network: net_id } },
          },
          {
            $pull: {
              network_roles: { network: net_id },
            },
          }
        );

        const notFoundCount = totalUsers - nModified;
        if (nModified === 0) {
          return {
            success: false,
            message: "Bad Request Error",
            errors: { message: "No matching User found in the system" },
            status: httpStatus.BAD_REQUEST,
          };
        }

        if (notFoundCount > 0) {
          return {
            success: true,
            message: `Operation partially successful since ${notFoundCount} of the provided users were not found in the system`,
            status: httpStatus.OK,
          };
        }
      } catch (error) {
        logger.error(`Internal Server Error ${error.message}`);
        return {
          success: false,
          message: "Internal Server Error",
          status: httpStatus.INTERNAL_SERVER_ERROR,
          errors: { message: error.message },
        };
      }

      return {
        success: true,
        message: `Successfully unassigned all the provided users from the network ${net_id}`,
        status: httpStatus.OK,
        data: [],
      };
    } catch (error) {
      logger.error(`Internal Server Error ${error.message}`);
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },
  setManager: async (request) => {
    try {
      const { net_id, user_id } = request.params;
      const { tenant } = request.query;

      const user = await UserModel(tenant).findById(user_id).lean();
      const network = await NetworkModel(tenant).findById(net_id).lean();

      if (isEmpty(user)) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: "User not found" },
          status: httpStatus.BAD_REQUEST,
        };
      }

      if (isEmpty(network)) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: "Network not found" },
          status: httpStatus.BAD_REQUEST,
        };
      }

      if (
        network.net_manager &&
        network.net_manager.toString() === user_id.toString()
      ) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: {
            message: `User ${user_id.toString()} is already the network manager`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      if (
        !user.networks.map((id) => id.toString()).includes(net_id.toString())
      ) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: {
            message: `Network ${net_id.toString()} is not part of User's networks, not authorized to manage this network`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      const updatedNetwork = await NetworkModel(tenant).findByIdAndUpdate(
        net_id,
        { net_manager: user_id },
        { new: true }
      );

      if (!isEmpty(updatedNetwork)) {
        return {
          success: true,
          message: "User assigned to Network successfully",
          status: httpStatus.OK,
          data: updatedNetwork,
        };
      } else {
        return {
          success: false,
          message: "Bad Request",
          errors: { message: "No network record was updated" },
          status: httpStatus.BAD_REQUEST,
        };
      }
    } catch (error) {
      logObject("error", error);
      logger.error(`Internal Server Error -- ${error.message}`);
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },

  update: async (request) => {
    try {
      const { body, query, params } = request;
      const { action } = request;
      const { tenant } = query;
      let update = Object.assign({}, body);
      logElement("action", action);
      update["action"] = action;

      let filter = {};
      const responseFromGeneratefilter = generateFilter.networks(request);

      if (responseFromGeneratefilter.success === true) {
        filter = responseFromGeneratefilter.data;
      } else if (responseFromGeneratefilter.success === false) {
        return responseFromGeneratefilter;
      }

      const responseFromModifyNetwork = await NetworkModel(tenant).modify({
        update,
        filter,
      });
      return responseFromModifyNetwork;
    } catch (error) {
      logObject("error", error);
      logger.error(`Internal Server Error ${JSON.stringify(error)}`);
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },
  delete: async (request) => {
    try {
      return {
        success: false,
        message: "Network deletion temporarily disabled",
        status: httpStatus.NOT_IMPLEMENTED,
        errors: { message: "Network deletion temporarily disabled" },
      };
      logText("the delete operation.....");
      const { query } = request;
      const { tenant } = query;
      let filter = {};

      const responseFromGenerateFilter = generateFilter.networks(request);

      logObject("responseFromGenerateFilter", responseFromGenerateFilter);

      if (responseFromGenerateFilter.success === true) {
        filter = responseFromGenerateFilter.data;
      } else if (responseFromGenerateFilter.success === false) {
        return responseFromGenerateFilter;
      }

      logObject("the filter", filter);

      if (isEmpty(filter._id)) {
        return {
          success: false,
          message: "Bad Request",
          errors: {
            message:
              "the network ID is missing -- required when updating corresponding users",
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      const result = await UserModel(tenant).updateMany(
        { "network_roles.network": filter._id },
        { $pull: { network_roles: { network: filter._id } } }
      );

      if (result.nModified > 0) {
        logger.info(
          `Removed network ${filter._id} from ${result.nModified} users.`
        );
      }

      if (result.n === 0) {
        logger.info(
          `Network ${filter._id} was not found in any users' network_roles.`
        );
      }
      const responseFromRemoveNetwork = await NetworkModel(tenant).remove({
        filter,
      });
      logObject("responseFromRemoveNetwork", responseFromRemoveNetwork);
      return responseFromRemoveNetwork;
    } catch (error) {
      logger.error(`Internal Server Error ${JSON.stringify(error)}`);
      return {
        message: "Internal Server Error",
        status: httpStatus.INTERNAL_SERVER_ERROR,
        errors: { message: error.message },
        success: false,
      };
    }
  },
  list: async (request) => {
    try {
      let { skip, limit, tenant } = request.query;
      let filter = {};

      const responseFromGenerateFilter = generateFilter.networks(request);

      if (responseFromGenerateFilter.success === true) {
        filter = responseFromGenerateFilter.data;
        logObject("filter", filter);
      } else if (responseFromGenerateFilter.success === false) {
        return responseFromGenerateFilter;
      }

      const responseFromListNetworks = await NetworkModel(tenant).list({
        filter,
        limit,
        skip,
      });

      if (responseFromListNetworks.success === true) {
        return responseFromListNetworks;
      } else if (responseFromListNetworks.success === false) {
        return responseFromListNetworks;
      }
    } catch (error) {
      logElement("internal server error", error.message);
      logObject("error here again", error);
      logger.error(`Internal Server Error ${error.message}`);
      return {
        success: false,
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: "Internal Server Error",
        errors: { message: error.message },
      };
    }
  },

  refresh: async (request) => {
    try {
      const { tenant } = request.query;
      const { net_id } = request.params;

      /**
       * does this network ID even exist?
       */
      const network = await NetworkModel(tenant).findById(net_id);

      if (!network) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: {
            message: `Invalid network ID ${net_id}, please crosscheck`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      /**
       ** Find all Users which have this networkID
       * a.k.a list assigned users...
       */

      const responseFromListAssignedUsers = await UserModel(tenant)
        .find({ networks: { $in: [net_id] } })
        .lean();

      // logObject("responseFromListAssignedUsers", responseFromListAssignedUsers);

      // return {
      //   success: true,
      //   status: httpStatus.OK,
      //   message: "success",
      // };

      const net_users = responseFromListAssignedUsers.map((element) => {
        return element._id;
      });

      /**
       * Do a mass update of the network's net_users using the net_users obtained from the list.
       *  ---- while doing this mass update, ensure that we do not introduce any duplicates
       */

      const updatedNetwork = await NetworkModel(tenant).findByIdAndUpdate(
        net_id,
        { $addToSet: { net_users } },
        { new: true }
      );

      if (isEmpty(updatedNetwork)) {
        return {
          success: false,
          message: "Bad Request Error",
          status: httpStatus.BAD_REQUEST,
          errors: { message: "Network not found" },
        };
      }

      return {
        success: true,
        message: `Successfully refreshed the network ${net_id.toString()} users' details`,
        status: httpStatus.OK,
        data: updatedNetwork,
      };
    } catch (error) {
      logger.error(`Internal Server Error ${error.message}`);
      return {
        success: false,
        message: "Bad Request Errors",
        errors: { message: error.message },
      };
    }
  },

  listAvailableUsers: async (request) => {
    try {
      const { tenant } = request.query;
      const { net_id } = request.params;

      const network = await NetworkModel(tenant).findById(net_id);

      if (!network) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: {
            message: `Invalid network ID ${net_id}, please crosscheck`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      const filter = {
        "network_roles.network": { $ne: net_id },
        category: "networks",
      };

      let responseFromListAvailableUsers = await UserModel(tenant).list({
        filter,
      });

      logObject(
        "responseFromListAvailableUsers.data",
        responseFromListAvailableUsers.data
      );

      if (responseFromListAvailableUsers.success === true) {
        responseFromListAvailableUsers.message = `retrieved all available users for network ${net_id}`;
      }
      return responseFromListAvailableUsers;
    } catch (error) {
      logElement("internal server error", error.message);
      logger.error(`Internal Server Error ${error.message}`);
      return {
        success: false,
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: "Internal Server Error",
        errors: { message: error.message },
      };
    }
  },

  listAssignedUsers: async (request) => {
    try {
      const { tenant } = request.query;
      const { net_id } = request.params;

      const network = await NetworkModel(tenant).findById(net_id);

      if (!network) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: {
            message: `Invalid network ID ${net_id}, please crosscheck`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      const filter = {
        "network_roles.network": net_id,
        category: "networks",
      };

      let responseFromListAssignedUsers = await UserModel(tenant).list({
        filter,
      });

      logObject("responseFromListAssignedUsers", responseFromListAssignedUsers);

      if (responseFromListAssignedUsers.success === true) {
        responseFromListAssignedUsers.message = `Retrieved all assigned users for network ${net_id}`;
      }
      return responseFromListAssignedUsers;
    } catch (error) {
      logElement("internal server error", error.message);
      logger.error(`Internal Server Error ${error.message}`);
      return {
        success: false,
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: "Internal Server Error",
        errors: { message: error.message },
      };
    }
  },
};

module.exports = createNetwork;
