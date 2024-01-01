const http = require("http");
const express = require("express");
const constants = require("@config/constants");
const path = require("path");
const cookieParser = require("cookie-parser");
const app = express();
const bodyParser = require("body-parser");
const session = require("express-session");
const connectToMongoDB = require("@config/database");
connectToMongoDB();
const mongoose = require("mongoose");
// const MongoStore = require("connect-mongo")(session);
const morgan = require("morgan");
const compression = require("compression");
const helmet = require("helmet");
const { HttpError } = require("@utils/errors");
const isDev = process.env.NODE_ENV === "development";
const isProd = process.env.NODE_ENV === "production";
const log4js = require("log4js");
const debug = require("debug")("auth-service:server");
const isEmpty = require("is-empty");
// const responseTime = require("response-time");
const logger = log4js.getLogger(
  `${constants.ENVIRONMENT} -- server start script`
);
const { logText, logObject } = require("@utils/log");

// const options = { mongooseConnection: mongoose.connection };

if (isEmpty(constants.SESSION_SECRET)) {
  throw new Error("SESSION_SECRET environment variable not set");
}

app.use(bodyParser.json({ limit: "50mb" }));
if (isProd) {
  app.use(compression());
  app.use(helmet());
}

if (isDev) {
  app.use(morgan("dev"));
}

app.use(cookieParser());
app.use(log4js.connectLogger(log4js.getLogger("http"), { level: "auto" }));
app.use(express.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: "50mb",
    parameterLimit: 50000,
  })
);

// Static file serving
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/v1/proxy", require("@routes/v1"));
app.use("/api/v2/proxy", require("@routes/v2"));

// app.use(responseTime);

// default error handling
app.use((req, res, next) => {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

app.use(function (err, req, res, next) {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
    });
  } else if (err.status === 404) {
    res.status(err.status).json({
      success: false,
      message: "This endpoint does not exist",
      errors: { message: err.message },
    });
  } else if (err.status === 400) {
    logger.error(`Bad request error --- ${JSON.stringify(err)}`);
    res.status(err.status).json({
      success: false,
      message: "Bad request error",
      errors: { message: err.message },
    });
  } else if (err.status === 401) {
    logger.error(`Unauthorized --- ${JSON.stringify(err)}`);
    res.status(err.status).json({
      success: false,
      message: "Unauthorized",
      errors: { message: err.message },
    });
  } else if (err.status === 403) {
    logger.error(`Forbidden --- ${JSON.stringify(err)}`);
    res.status(err.status).json({
      success: false,
      message: "Forbidden",
      errors: { message: err.message },
    });
  } else if (err.status === 500) {
    // logger.error(`Internal Server Error --- ${JSON.stringify(err)}`);
    // logger.error(`Stack Trace: ${err.stack}`);
    logObject("the error", err);
    res.status(err.status).json({
      success: false,
      message: "Internal Server Error",
      errors: { message: err.message },
    });
  } else if (err.status === 502 || err.status === 503 || err.status === 504) {
    logger.error(`${err.message} --- ${JSON.stringify(err)}`);
    res.status(err.status).json({
      success: false,
      message: err.message,
      errors: { message: err.message },
    });
  } else {
    logger.error(`Internal Server Error --- ${JSON.stringify(err)}`);
    logObject("Internal Server Error", err);
    logger.error(`Stack Trace: ${err.stack}`);
    res.status(err.status || 500).json({
      success: false,
      message: "Internal Server Error - app entry",
      errors: { message: err.message },
    });
  }
});

const normalizePort = (val) => {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
};

const createServer = () => {
  const port = normalizePort(process.env.PORT || "3000");
  app.set("port", port);

  const server = http.createServer(app);
  server.listen(port);

  server.on("error", (error) => {
    if (error.syscall !== "listen") {
      throw error;
    }

    var bind = typeof port === "string" ? "Pipe " + port : "Port " + port;

    // handle specific listen errors with friendly messages
    switch (error.code) {
      case "EACCES":
        console.error(bind + " requires elevated privileges");
        process.exit(1);
        break;
      case "EADDRINUSE":
        console.error(bind + " is already in use");
        process.exit(1);
        break;
      default:
        throw error;
    }
  });

  let ENV = "";
  if (isEmpty(process.env.NODE_ENV)) {
    ENV = "production";
  } else {
    ENV = process.env.NODE_ENV;
  }

  server.on("listening", () => {
    logText(`server is running on port: ${constants.PORT}`);
    console.log(
      `The current value for process.env.NODE_ENV is ${process.env.NODE_ENV}`
    );
    console.log(`The server is running on the ${ENV} environment`);
    var addr = server.address();
    var bind = typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
    debug("Listening on " + bind);
  });
};

module.exports = createServer;
