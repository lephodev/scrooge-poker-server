//imports
import express from "express";
import http from "http";
import { PORT } from "./config/keys";
import { mongoConnect } from "./config/mongo";
import cors from "cors";
import socket from "socket.io";
import roomModel from "./models/room";
import { doLeaveTable, doLeaveWatcher } from "./functions/functions";
import { updateInGameStatus } from "./firestore/dbFetch";

let app = express();
const server = http.createServer(app);
const io = socket(server, {
  pingInterval: 10000,
  pingTimeout: 5000,
});
const whitelist = [
  "https://beta.las-vegas.com",
  "https://las-vegas.com",
  "http://localhost:3000",
  "http://localhost:3001",
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
app.use(cors());
mongoConnect();
require("./socketconnection/socketconnection")(io);

app.get("/checkTableExist/:tableId", async (req, res) => {
  try {
    const { tableId } = req.params;
    const room = await roomModel.findOne({ tableId });
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
    const room = await roomModel.findOne({ tableId });
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
    const room = await roomModel.deleteOne({ tableId });
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
    const { tableId, userId } = req.params;
    let roomdata = await roomModel
      .findOne({
        tableId,
      })
      .lean();
    if (roomdata && roomdata.players.find((el) => el.userid === userId)) {
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
      let roomdata = await roomModel.findOne({ tableId }).lean();
      if (!roomdata?.players?.find((el) => el.id === userId)) {
        updateInGameStatus(userId);
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
    const room = await roomModel.findOne({
      $or: [
        {
          players: { $elemMatch: { userid: userId } },
        },
        { watchers: { $elemMatch: { userid: userId } } },
      ],
    });
    if (
      room &&
      (room.players.find((el) => el.userid === userId) ||
        room.watchers.find((el) => el.userid === userId))
    ) {
      res.status(200).send({
        success: false,
        gameStatus: "InGame",
        link: `${req.baseUrl}/poker/index.html?tableid=${room.tableId}&gameCollection=${room.gameType}#/`,
        leaveTableUrl: `https://poker-server-t3e66zpola-uc.a.run.app/leaveGame/${room.tableId}/${userId}`,
      });
    } else {
      updateInGameStatus(userId);
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
//server
server.listen(PORT, () => console.log(`server running on port ${PORT}`));
