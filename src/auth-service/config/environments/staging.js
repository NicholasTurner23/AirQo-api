const mongoose = require("mongoose");
const stageConfig = {
  DEFAULT_AIRQLOUD: process.env.STAGE_DEFAULT_AIRQLOUD,
  DEFAULT_GRID: process.env.STAGE_DEFAULT_GRID,
  DEFAULT_GROUP: process.env.STAGE_DEFAULT_GROUP,
  DEFAULT_GROUP_ROLE: process.env.STAGE_DEFAULT_GROUP_ROLE,
  DEFAULT_NETWORK: process.env.STAGE_DEFAULT_NETWORK,
  DEFAULT_NETWORK_ROLE: process.env.STAGE_DEFAULT_NETWORK_ROLE,
  MONGO_URI: process.env.MONGO_STAGE_URI,
  DB_NAME: process.env.MONGO_STAGE,
  PWD_RESET: `${process.env.PLATFORM_STAGING_BASE_URL}/reset`,
  LOGIN_PAGE: `${process.env.PLATFORM_STAGING_BASE_URL}/login`,
  FORGOT_PAGE: `${process.env.PLATFORM_STAGING_BASE_URL}/forgot`,
  PLATFORM_BASE_URL: process.env.PLATFORM_STAGING_BASE_URL,
  ANALYTICS_BASE_URL: "https://staging-analytics.airqo.net",
  ENVIRONMENT: "STAGING ENVIRONMENT",
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS_STAGE
    ? process.env.KAFKA_BOOTSTRAP_SERVERS_STAGE.split(",").filter(
        (value) => value.trim() !== ""
      )
    : [],
  KAFKA_TOPICS: process.env.KAFKA_TOPICS_STAGE,
  SCHEMA_REGISTRY: process.env.SCHEMA_REGISTRY_STAGE,
  KAFKA_RAW_MEASUREMENTS_TOPICS:
    process.env.KAFKA_RAW_MEASUREMENTS_TOPICS_STAGE,
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID_STAGE,
  KAFKA_CLIENT_GROUP: process.env.KAFKA_CLIENT_GROUP_STAGE,
  REDIS_SERVER: process.env.STAGE_REDIS_SERVER,
  REDIS_PORT: process.env.STAGE_REDIS_PORT,
  SELECTED_SITES: process.env.SELECTED_SITES_STAGING
    ? process.env.SELECTED_SITES_STAGING.split(",").filter(
        (value) => value.trim() !== ""
      )
    : [],
};

module.exports = stageConfig;
