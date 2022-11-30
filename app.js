//imports
import express from 'express';
import http from 'http';
import { PORT } from './config/keys';
import { mongoConnect } from './config/mongo';
import cors from 'cors';
import passport, { authenticate } from 'passport';
import socket from 'socket.io';
import roomModel from './models/room';
import { doLeaveTable, doLeaveWatcher } from './functions/functions';
import { updateInGameStatus } from './firestore/dbFetch';
import jwtStrategy from './landing-server/config/jwtstragety';
import {
  successHandler,
  errorHandler as morganErrorHandler,
} from './landing-server/config/morgan.js';
import pokerRoute from './routes/pokerRoutes.js';
import auth from './landing-server/middlewares/auth.js';
import mongoose from 'mongoose';

let app = express();
const server = http.createServer(app);
const io = socket(server, {
  pingInterval: 10000,
  pingTimeout: 5000,
});
const whitelist = ['http://localhost:3000', 'https://poker.scrooge.casino'];
const corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback('Not allowed by CORS');
    }
  },
};

app.use(express.json());
app.use(
  express.urlencoded({
    extended: false,
  })
);
app.use(cors(corsOptions));
mongoConnect();

// Auth functions
// jwt authentication
app.use(passport.initialize());
passport.use('jwt', jwtStrategy);

if (process.env.ENVIROMENT !== 'test') {
  app.use(successHandler);
  app.use(morganErrorHandler);
}

require('./socketconnection/socketconnection')(io);

app.get('/checkTableExist/:tableId', async (req, res) => {
  try {
    const { tableId } = req.params;
    const room = await roomModel.findOne({
      _id: mongoose.Types.ObjectId(tableId),
    });
    if (room) {
      res.status(200).send({
        success: true,
        error: 'no-error',
      });
    } else {
      res.status(404).send({
        success: false,
        error: 'Table not found',
      });
    }
  } catch (error) {
    console.log('Error in Poker game server =>', error);
  }
});

app.get('/rescueTable/:tableId', async (req, res) => {
  try {
    const { tableId } = req.params;
    const room = await roomModel.findOne({
      _id: mongoose.Types.ObjectId(tableId),
    });
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
          buyIn: room.gameType === 'pokerTournament_Tables' ? room.maxchips : 0,
          playerCount: player.length,
          users: users,
          adminUid: room.hostId,
        };
        res.status(200).send({
          stuckTable: payload,
          success: true,
          error: 'no-error',
        });
      } else {
        res.status(404).send({
          success: false,
          error: 'Table exist and its running in game',
        });
      }
    } else {
      res.status(404).send({
        success: false,
        error: 'Table not Found',
      });
    }
  } catch (error) {
    console.log('Error in rescueTable api', error);
    res.status(500).send({
      success: false,
      error: 'Internal server error',
    });
  }
});

app.get('/deleteStuckTable/:tableId', async (req, res) => {
  try {
    const { tableId } = req.params;
    const room = await roomModel.deleteOne({
      _id: mongoose.Types.ObjectId(tableId),
    });
    if (room) {
      res.status(200).send({
        success: true,
        error: 'no-error',
      });
    } else {
      res.status(404).send({
        success: false,
        error: 'Table not found',
      });
    }
  } catch (error) {
    console.log('Error in Poker game delete table api =>', error);
  }
});

app.get('/leaveGame/:tableId/:userId', async (req, res) => {
  try {
    let { tableId, userId } = req.params;
    tableId = mongoose.Types.ObjectId(tableId);
    let roomdata = await roomModel
      .findOne({
        _id: tableId,
      })
      .lean();
    if (
      roomdata &&
      roomdata.players.find((el) => el.userid.toString() === userId?.toString())
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
      let roomdata = await roomModel.findOne({ tableId }).lean();
      if (!roomdata?.players?.find((el) => el.id === userId)) {
        updateInGameStatus(userId);
        return res.send({
          success: true,
        });
      }
    }
  } catch (error) {
    console.log('Error in checkUserInGame api', error);
    res.status(500).send({
      success: false,
      error: 'Internal server error',
    });
  }
});

app.get('/checkUserInGame/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const room = await roomModel.findOne({
      $or: [
        {
          players: { $elemMatch: { userid: mongoose.Types.ObjectId(userId) } },
        },
        {
          watchers: { $elemMatch: { userid: mongoose.Types.ObjectId(userId) } },
        },
      ],
    });
    if (
      room &&
      (room.players.find((el) => el.userid.toString() === userId?.toString()) ||
        room.watchers.find((el) => el.userid.toString() === userId?.toString()))
    ) {
      res.status(200).send({
        success: false,
        gameStatus: 'InGame',
        link: `${req.baseUrl}/poker/index.html?tableid=${room._id}&gameCollection=${room.gameType}#/`,
        leaveTableUrl: `https://poker-server-t3e66zpola-uc.a.run.app/leaveGame/${room._id}/${userId}`,
      });
    } else {
      updateInGameStatus(userId);
      res.status(200).send({
        success: true,
        gameStatus: 'online',
      });
    }
  } catch (error) {
    console.log('Error in checkUserInGame api', error);
    res.status(500).send({
      success: false,
      error: 'Internal server error',
    });
  }
});

app.use('/poker', auth(), pokerRoute);

//server
server.listen(PORT, () => console.log(`server running on port ${PORT}`));
