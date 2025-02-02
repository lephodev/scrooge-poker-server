//imports
import express from "express";
import http from "http";
import { PORT } from "./config/keys";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { mongoConnect } from "./config/mongo";
import cors from "cors";
import passport, { authenticate } from "passport";
import socket from "socket.io";
import roomModel from "./models/room";
import { doLeaveTable, doLeaveWatcher } from "./functions/functions";
import jwtStrategy from "./landing-server/config/jwtstragety";
import {
  successHandler,
  errorHandler as morganErrorHandler,
} from "./landing-server/config/morgan.js";
import pokerRoute from "./routes/pokerRoutes.js";
import tournamentRoute from "./routes/tournamentRoutes.js";
import dotenv from "dotenv";
import auth from "./landing-server/middlewares/auth.js";
import mongoose from "mongoose";
import User from "./landing-server/models/user.model";
import returnCron from "./cron/cron";
import { createClient } from "redis";
import tournamentModel from "./models/tournament";
import logger from "./landing-server/config/logger";
import { getAllKeysAndValues, getCachedGame } from "./redis-cache";
import socketsAuthentication from "./landing-server/middlewares/socketsMiddleware.js";

let app = express();
dotenv.config();
const server = http.createServer(app);
// set security HTTP headers
// app.use(helmet.hsts({
//   maxAge: 31536000,     // HSTS directive ka max-age (1 year)
//   includeSubDomains: true,
//   preload: true
// }));
app.use(cookieParser());

app.use(
  helmet({
    strictTransportSecurity: {
      maxAge: 31536000, // HSTS directive ka max-age (1 year)
      includeSubDomains: true,
      preload: true,
    },
  })
);
const io = socket(server, {
  pingInterval: 10000,
  pingTimeout: 5000,
});

io.use((socket, next) => {
  // Middleware logic here
  // You can access socket.request and socket.handshake to inspect the request and handshake data.
  socketsAuthentication(socket.handshake).then(resp=>{
    socket.user = {
      userId: resp.userId, 
    }
    return next();
  }).catch(err=>{
    next(new Error('Authentication failed'));
    return;
  });
});

app.use((req, _, next) => {
  logger.info(`HEADERS ${req.headers} `);
  next();
});
returnCron(io);

const whitelist = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://poker.scrooge.casino",
  "https://devpoker.scrooge.casino",
  "https://betapoker.scrooge.casino",
];
const corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback("Not allowed by CORS");
    }
  },
};
app.use(express.json());
app.use(
  express.urlencoded({
    extended: false,
  })
);
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3004",
      "https://scrooge.casino",
      "https://poker.scrooge.casino",
      "https://blackjack.scrooge.casino",
      "https://slot.scrooge.casino",
      "https://admin.scrooge.casino",
      "https://market.scrooge.casino",
      "https://roulette.scrooge.casino",
      "https://dev.scrooge.casino",
      "https://devpoker.scrooge.casino",
      "https://devslot.scrooge.casino",
      "https://devblackjack.scrooge.casino",
      "https://devadmin.scrooge.casino",
      "https://devmarket.scrooge.casino",
      "https://devroulette.scrooge.casino",

      "https://beta.scrooge.casino",
      "https://betapoker.scrooge.casino",
      "https://betaslot.scrooge.casino",
      "https://betablackjack.scrooge.casino",
      "https://betaadmin.scrooge.casino",
      "https://betamarket.scrooge.casino",
      "https://betaroulette.scrooge.casino",
    ],
    credentials: true,
  })
);
// '52.14.190.186' ||
mongoConnect();
export const redisClient = createClient(
  process.env.REDIS_PORT || 6379,
  process.env.REDIS_HOST || "127.0.0.1"
);
(async () => {
  redisClient
    .on("error", (error) => console.error(`Error in redis connect: ${error}`))
    .on("connect", async () => {
      console.info("redis server connected");
    });
  await redisClient.connect();
})();

// Auth functions
// jwt authentication
app.use(passport.initialize());
passport.use("jwt", jwtStrategy);

if (process.env.ENVIROMENT !== "test") {
  app.use(successHandler);
  app.use(morganErrorHandler);
}

require("./socketconnection/socketconnection")(io);

const fun = async ()=>{
  try {
    await User.updateMany({ dailySpinBonus: { $exists: false } }, {
      $set: {
        nonWithdrawableAmt: 0,
        dailySpinBonus: 0,
        monthlyClaimBonus: 0,
        redeemableAmount: 0,
        lastBetFrom: {}
      }
    });
    console.log("executed successfuly");
  } catch (error) {
    console.log("error in fun", error);
  }
}

// fun();

// app.use("/api/user", tournamentRoute(socket));
app.get("/checkTableExist/:tableId", async (req, res) => {
  try {
    const { tableId } = req.params;
    const room = await getCachedGame(tableId);
    if (room) {
      res.status(200).send({
        success: true,
        error: "no-error",
      });
    } else {
      res.status(404).send({
        success: false,
        error: "Table not found",
      });
    }
  } catch (error) {
    console.log("Error in Poker game server =>", error);
  }
});

app.get("/rescueTable/:tableId", async (req, res) => {
  try {
    const { tableId } = req.params;
    const room = await getCachedGame(tableId);
    if (room) {
      let firstGameTime = new Date(room.firstGameTime);
      let now = new Date();
      if ((now - firstGameTime) / (1000 * 60) > 15) {
        let player;
        if (room.runninground === 0) {
          player = room.players;
        } else if (room.runninground === 1) {
          player = room.preflopround;
        } else if (room.runninground === 2) {
          player = room.flopround;
        } else if (room.runninground === 3) {
          player = room.turnround;
        } else if (room.runninground === 4) {
          player = room.riverround;
        } else if (room.runninground === 5) {
          player = room.showdown;
        }
        let allUsers = player.concat(room.watchers);
        let users = [];
        allUsers.forEach((item) => {
          let uid = item.id ? item.id : item.userid;
          users.push({
            uid,
            hands: item.hands,
            coinsBeforeJoin: item.initialCoinBeforeStart,
            gameLeaveAt: new Date(),
            gameJoinedAt: item.gameJoinedAt,
            isWatcher: room.watchers.find((ele) => ele.userid === uid)
              ? true
              : false,
          });
        });
        let payload = {
          gameColl: room.gameType,
          tableId: room.tableId,
          buyIn: room.gameType === "pokerTournament_Tables" ? room.maxchips : 0,
          playerCount: player.length,
          users: users,
          adminUid: room.hostId,
        };
        res.status(200).send({
          stuckTable: payload,
          success: true,
          error: "no-error",
        });
      } else {
        res.status(404).send({
          success: false,
          error: "Table exist and its running in game",
        });
      }
    } else {
      res.status(404).send({
        success: false,
        error: "Table not Found",
      });
    }
  } catch (error) {
    console.log("Error in rescueTable api", error);
    res.status(500).send({
      success: false,
      error: "Internal server error",
    });
  }
});

app.get("/deleteStuckTable/:tableId", async (req, res) => {
  try {
    const { tableId } = req.params;
    const room = await getCachedGame(tableId);
    if (room) {
      res.status(200).send({
        success: true,
        error: "no-error",
      });
    } else {
      res.status(404).send({
        success: false,
        error: "Table not found",
      });
    }
  } catch (error) {
    console.log("Error in Poker game delete table api =>", error);
  }
});

app.get("/leaveGame/:tableId/:userId", async (req, res) => {
  try {
    let { tableId, userId } = req.params;

    let roomdata = await getCachedGame(tableId);
    if (
      roomdata &&
      roomdata.players.find((el) => el.id.toString() === userId?.toString())
    ) {
      const ress = await doLeaveTable({ tableId, userId }, io);
      return res.send({
        success: true,
      });
    } else if (
      roomdata &&
      roomdata.watchers.find((el) => el.userid === userId)
    ) {
      await doLeaveWatcher({ tableId, userId }, io);
      return res.send({
        success: true,
      });
    } else {
      let roomdata = await getCachedGame(tableId);
      if (!roomdata?.players?.find((el) => el.id === userId)) {
        return res.send({
          success: true,
        });
      }
    }
  } catch (error) {
    console.log("Error in checkUserInGame api", error);
    res.status(500).send({
      success: false,
      error: "Internal server error",
    });
  }
});

app.get("/checkUserInGame/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const games = getAllKeysAndValues();
    const room = games.find(
      (el) =>
        el.players.find((pl) => pl.id === userId) ||
        el.watchers.find((wt) => wt.userid === userId)
    );
    if (
      room &&
      (room.players.find((el) => el.userid.toString() === userId?.toString()) ||
        room.watchers.find((el) => el.userid.toString() === userId?.toString()))
    ) {
      res.status(200).send({
        success: false,
        gameStatus: "InGame",
        link: `${req.baseUrl}/poker/index.html?tableid=${room._id}&gameCollection=${room.gameType}#/`,
        leaveTableUrl: `https://poker-server-t3e66zpola-uc.a.run.app/leaveGame/${room._id}/${userId}`,
      });
    } else {
      res.status(200).send({
        success: true,
        gameStatus: "online",
      });
    }
  } catch (error) {
    console.log("Error in checkUserInGame api", error);
    res.status(500).send({
      success: false,
      error: "Internal server error",
    });
  }
});

app.get("/getUserForInvite/:tableId", async (req, res) => {
  try {
    if (!req.params.tableId) {
      return res.status(400).send({ msg: "Table id not found." });
    }
    const roomData = await getCachedGame(req.params.tableId);
    if (!roomData) {
      return res.status(403).send({ msg: "Table not found." });
    }

    const { leavereq, invPlayers, players } = roomData;
    const allId = [...leavereq, ...invPlayers, ...players.map((el) => el.id)];

    const allUsers = await User.find({
      _id: { $nin: allId },
      isRegistrationComplete: true,
    }).select({ id: 1, username: 1 });

    return res.status(200).send({ data: allUsers });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ msg: "Internal server error" });
  }
});

app.use("/poker", auth(), pokerRoute(io));
app.use("/tournament", auth(), tournamentRoute);

app.use("*", (req, res) => res.status(404).send({ message: "Api not found" }));

//server
server.listen(PORT, () => console.log(`server running on port ${PORT}`));
