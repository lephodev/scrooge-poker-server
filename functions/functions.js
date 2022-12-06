//imports
import { userJwtKey, adminJwtKey } from '../config/keys';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import pathDirectory from 'path';
import transactionModel from '../models/transaction';
import roomModel from '../models/room';
import tournamentConfModel from '../models/tournamentConfig';
import mongoose from 'mongoose';
import tournamentModel from '../models/tournament';
import roomHistoryModel from '../models/roomHistory';
import userModel from '../landing-server/models/user.model';
import each from 'sync-each';
import moment from 'moment';
import axios from 'axios';
import {
  addWatcher,
  deductAmount,
  finishedGame,
  finishHandUpdate,
  updateGamebyTableId,
  getDoc,
  removeInvToPlayers,
  returnWatcherBetAmount,
  changeAdmin,
  getPurchasedItem,
  updateInGameStatus,
} from '../firestore/dbFetch';
import BetModal from '../models/betModal';
import gameService from '../service/game.service';
import userService from '../service/user.service';
import rankModel from '../models/rankModel';
var Hand = require('pokersolver').Hand;
const admin = require('firebase-admin');

const convertMongoId = (id) => mongoose.Types.ObjectId(id);

//checking if request body is valid
export const checkIfEmpty = (requestBody) => {
  const values = Object.values(requestBody);
  let isEmpty = values.filter((el) => !el);
  return {
    isValid: isEmpty.length > 0 ? false : true,
  };
};

//signing jwt token
export const signJwt = (userid) => {
  let token;
  try {
    const tokenData = {
      userid,
    };
    token = jwt.sign(tokenData, userJwtKey, {
      expiresIn: '100h',
    });
  } catch (e) {
    token = null;
  }
  return token;
};

//verify password hash
export const verifyHash = (password, passwordHash) => {
  return new Promise(async (resolve, reject) => {
    try {
      const isPasswordValid = await bcrypt.compare(password, passwordHash);
      resolve(isPasswordValid);
    } catch (e) {
      reject(false);
    }
  });
};

//verify jwt token
export const verifyJwt = (token) => {
  return new Promise(async (resolve, reject) => {
    try {
      const isTokenValid = await jwt.verify(token, userJwtKey);
      if (isTokenValid) {
        resolve(isTokenValid);
      }
    } catch (e) {
      reject(false);
    }
  });
};

//signing jwt token for admin
export const signJwtAdmin = (adminId) => {
  let token;
  try {
    const tokenData = {
      adminId,
    };
    token = jwt.sign(tokenData, adminJwtKey, {
      expiresIn: '100h',
    });
  } catch (e) {
    token = null;
  }
  return token;
};

export const verifyJwtAdmin = (token) => {
  return new Promise(async (resolve, reject) => {
    try {
      const isTokenValid = await jwt.verify(token, adminJwtKey);
      if (isTokenValid) {
        resolve(isTokenValid);
      }
    } catch (e) {
      reject(false);
    }
  });
};

export const checkFileType = (file, cb) => {
  // Allowed ext
  const filetypes = /jpeg|jpg|png/;
  // Check ext
  const extname = filetypes.test(
    pathDirectory.extname(file.originalname).toLowerCase()
  );
  // Check mime
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb('Error: Images Only!');
  }
};

export const verifycards = (distributedCards, noOfCards) => {
  let cards = [];
  const suits = ['h', 's', 'c', 'd'];
  const values = ['A', 2, 3, 4, 5, 6, 7, 8, 9, 'T', 'J', 'Q', 'K'];
  for (let suit in suits) {
    for (let value in values) {
      if (!distributedCards.includes(`${values[value]}${suits[suit]}`)) {
        cards.push(`${values[value]}${suits[suit]}`);
      }
    }
  }
  let result = [];
  let i = 0;
  while (i <= noOfCards - 1) {
    let c = cards[Math.floor(Math.random() * cards.length)];
    if (!result.includes(c)) {
      result.push(c);
      i++;
    }
  }
  return result;
};

export const preflopPlayerPush = async (players, roomid) => {
  console.log('Inside preflopPlayerPush');
  return new Promise((resolve, reject) => {
    let distributedCards = [];

    each(
      players,
      async function (elem, next) {
        console.log({ elem });
        //perform async operation with item
        // let game= req.body._id;
        let checkcards = [];
        const roomData = await roomModel
          .findById(roomid)
          .sort({ _id: -1 })
          .lean();
        if (!roomData.preflopround.find((ele) => ele.id === elem.userid)) {
          let playing;
          if (typeof elem.playing !== 'undefined' && elem.playing !== null) {
            playing = elem.playing;
          } else {
            playing = true;
          }

          if (elem.wallet <= 0) {
            playing = false;
          }

          if (playing) {
            checkcards = verifycards(distributedCards, 2);
            checkcards.map((e) => distributedCards.push(e));
          }

          const a = await roomModel.updateOne(
            {
              _id: roomid,
            },
            {
              $push: {
                preflopround: {
                  cards: checkcards,
                  id: elem.userid,
                  name: elem.name,
                  photoURI: elem.photoURI,
                  wallet: elem.wallet,
                  timebank: elem.timebank,
                  playing: true,
                  fold: false,
                  playerchance: roomData.timer,
                  action: null,
                  actionType: null,
                  prevPot: 0,
                  pot: 0,
                  position: elem.position,
                  playing: playing,
                  missedSmallBlind: elem.missedSmallBlind,
                  missedBigBlind: elem.missedBigBlind,
                  missedBilndAmt: 0,
                  forceBigBlind: elem.forceBigBlind,
                  stats: elem.stats,
                  initialCoinBeforeStart: elem.initialCoinBeforeStart,
                  gameJoinedAt: elem.gameJoinedAt,
                  hands: elem.hands,
                  meetingToken: elem.meetingToken,
                  items: elem.items,
                },
              },
            },
            {
              //   upsert: true,
              // new:true
            }
          );
        }
        next();
      },
      function (err, transformedItems) {
        //Success callback
        resolve();
      }
    );
  });
};

export const preflopround = async (room, io) => {
  console.log('IN preflopround');
  await updateRoomForNewHand(room._id, io);
  room = await roomModel.findOne(room._id).lean();
  let playingPlayer = room.players.filter((el) => el.playing && el.wallet > 0);
  console.log({ playingPlayer });
  let positions = room.players.map((pos) => pos.position);
  let isNewLeave = false;
  let i = 0;
  for (let el of positions) {
    if (el !== i) {
      isNewLeave = true;
      break;
    } else {
      i++;
    }
  }
  if (isNewLeave) {
    let newPos = [];
    i = 0;
    for (let ele of playingPlayer) {
      newPos.push({
        ...ele,
        position: i,
      });
      i++;
    }
    playingPlayer = [...newPos];
    room = await roomModel.findOneAndUpdate(
      { _id: room._id },
      {
        bigBlindPosition: null,
        smallBlindPosition: null,
        dealerPosition: null,
        players: playingPlayer,
      },
      { new: true }
    );
  }
  if (!room.finish && !room.gamestart) {
    if (room.runninground === 0 && !room.pause) {
      let created_on = new Date(room.createdAt);
      let valid_till = moment(created_on).add(24, 'h').toDate();
      const curr_datetime = new Date();
      if (
        playingPlayer.length > 1 &&
        valid_till.getTime() > curr_datetime.getTime()
      ) {
        await roomModel.updateOne(
          {
            _id: room._id,
          },
          {
            runninground: 1,
            gamestart: true,
            isGameRunning: true,
          }
        );
        await preflopPlayerPush(room.players, room._id);
        const room1111 = await roomModel.findOne(
          { _id: room._id },
          { _id: 1, preflopround: 1, smallBlind: 1, bigBlind: 1 }
        );

        const smallBlindAmt = room1111.smallBlind;
        const bigBlindAmt = room1111.bigBlind;
        let smallBlindDeducted = 0;
        let smallBlindPosition = null;
        let bigBlindPosition = null;
        let dealerPosition = null;
        let totalplayer = room.players.length + room.eleminated.length;
        let smallLoopTime = 0;
        if (room.smallBlindPosition === null) {
          smallBlindPosition = 0;
        } else if (room.smallBlindPosition < totalplayer - 1) {
          smallBlindPosition = room.smallBlindPosition + 1;
        } else if (room.smallBlindPosition === totalplayer - 1) {
          smallBlindPosition = 0;
        }

        if (room.bigBlindPosition === null) {
          bigBlindPosition = 1;
        } else if (room.bigBlindPosition < totalplayer - 1) {
          bigBlindPosition = room.bigBlindPosition + 1;
        } else if (room.bigBlindPosition === totalplayer - 1) {
          bigBlindPosition = 0;
        }

        if (totalplayer - 1 > 2 && bigBlindPosition + 1 < totalplayer - 1) {
          dealerPosition = bigBlindPosition + 1;
        } else if (
          totalplayer - 1 > 2 &&
          bigBlindPosition + 1 === totalplayer - 1
        ) {
          dealerPosition = 0;
        }
        const deductMissedBlind = async () => {
          return new Promise((resolve, reject) => {
            each(
              room.players,
              async function (player, next) {
                let deductMissedAmt = 0;
                let walletAmt = player.wallet;
                let forceBigBlindAmt = 0;
                if (
                  player.position !== smallBlindPosition &&
                  player.position !== bigBlindPosition &&
                  player.playing &&
                  player.wallet
                ) {
                  if (player.missedSmallBlind) {
                    deductMissedAmt += smallBlindAmt;
                  }
                  if (player.missedBigBlind) {
                    deductMissedAmt += bigBlindAmt;
                  }
                  walletAmt = walletAmt - deductMissedAmt;
                  if (player.forceBigBlind && walletAmt > bigBlindAmt) {
                    forceBigBlindAmt = bigBlindAmt;
                  } else if (player.forceBigBlind && walletAmt > 0) {
                    forceBigBlindAmt = walletAmt;
                  }
                  if (deductMissedAmt && player.wallet > deductMissedAmt) {
                    await roomModel.updateOne(
                      {
                        _id: room._id,
                        'preflopround.position': player.position,
                      },
                      {
                        $inc: {
                          'preflopround.$.wallet': -deductMissedAmt,
                        },
                        'preflopround.$.missedBilndAmt': deductMissedAmt,
                        'preflopround.$.missedSmallBlind': false,
                        'preflopround.$.missedBigBlind': false,
                        'preflopround.$.forceBigBlind': false,
                      }
                    );
                  } else if (
                    deductMissedAmt &&
                    player.wallet < deductMissedAmt
                  ) {
                    await roomModel.updateOne(
                      {
                        _id: room._id,
                        'preflopround.position': player.position,
                      },
                      {
                        $inc: {
                          'preflopround.$.wallet': 0,
                        },
                        'preflopround.$.missedBilndAmt': player.wallet,
                        'preflopround.$.missedSmallBlind': false,
                        'preflopround.$.missedBigBlind': false,
                        'preflopround.$.forceBigBlind': false,
                      }
                    );
                  }

                  if (forceBigBlindAmt) {
                    await roomModel.updateOne(
                      {
                        _id: room._id,
                        'preflopround.position': player.position,
                      },
                      {
                        $inc: {
                          'preflopround.$.wallet': -forceBigBlindAmt,
                          'preflopround.$.pot': +forceBigBlindAmt,
                        },
                        'preflopround.$.missedSmallBlind': false,
                        'preflopround.$.missedBigBlind': false,
                        'preflopround.$.forceBigBlind': false,
                      }
                    );
                  }
                }
                next();
              },
              async function (err, transformedItems) {
                //Success callback
                let updatedData = await roomModel
                  .findOne({ _id: room._id }, { players: 1 })
                  .lean();
                resolve(updatedData.players);
              }
            );
          });
        };

        let allinPlayer = room.allinPlayers;
        while (smallBlindDeducted < 1) {
          let playerAvilable = room.players.filter(
            (el) =>
              el.position === smallBlindPosition && el.playing && el.wallet > 0
          );
          if (playerAvilable.length) {
            const room11 = await roomModel.findOne(
              { _id: room._id },
              { _id: 1, preflopround: 1 }
            );
            let sb_deduct;
            if (playerAvilable[0].wallet > smallBlindAmt) {
              sb_deduct = await roomModel.updateOne(
                {
                  _id: room._id,
                  'preflopround.position': smallBlindPosition,
                },
                {
                  $inc: {
                    'preflopround.$.wallet': -smallBlindAmt,
                    'preflopround.$.pot': +smallBlindAmt,
                  },

                  smallBlind: smallBlindAmt,
                  smallBlindPosition,
                  dealerPosition,
                  'preflopround.$.missedSmallBlind': false,
                  'preflopround.$.missedBigBlind': false,
                  'preflopround.$.forceBigBlind': false,
                }
              );
            } else {
              allinPlayer.push({
                id: playerAvilable[0].userid,
                amt: playerAvilable[0].wallet,
                wallet: playerAvilable[0].wallet,
                round: 1,
              });
              sb_deduct = await roomModel.findOneAndUpdate(
                {
                  _id: room._id,
                  'preflopround.id': playerAvilable[0].userid,
                },
                {
                  $inc: {
                    'preflopround.$.wallet': -playerAvilable[0].wallet,
                    'preflopround.$.pot': +playerAvilable[0].wallet,
                  },
                  'preflopround.$.action': true,
                  'preflopround.$.actionType': 'all-in',
                  smallBlind: smallBlindAmt,
                  lastAction: 'all-in',
                  allinPlayers: allinPlayer,
                  smallBlindPosition,
                  dealerPosition,
                  'preflopround.$.missedSmallBlind': false,
                  'preflopround.$.missedBigBlind': false,
                  'preflopround.$.forceBigBlind': false,
                },
                {
                  new: true,
                }
              );
            }

            smallBlindDeducted = 1;
          } else {
            let isPlayerSitOut = room.players.filter(
              (el) => el.position === smallBlindPosition && !el.playing
            );
            if (isPlayerSitOut.length) {
              await roomModel.updateOne(
                {
                  _id: room._id,
                  'preflopround.position': smallBlindPosition,
                },
                {
                  'preflopround.$.missedSmallBlind': true,
                }
              );
            }
            if (smallLoopTime < totalplayer) {
              if (smallBlindPosition < totalplayer - 1) {
                smallBlindPosition++;
              } else if (smallBlindPosition === totalplayer - 1) {
                smallBlindPosition = 0;
              }
              if (
                bigBlindPosition < totalplayer - 1 &&
                smallBlindPosition === bigBlindPosition
              ) {
                bigBlindPosition++;
              } else if (
                bigBlindPosition === totalplayer - 1 &&
                smallBlindPosition === bigBlindPosition
              ) {
                bigBlindPosition = 0;
              }
              if (
                totalplayer - 1 > 2 &&
                bigBlindPosition + 1 < totalplayer - 1
              ) {
                dealerPosition = bigBlindPosition + 1;
              } else if (
                totalplayer - 1 > 2 &&
                bigBlindPosition + 1 === totalplayer - 1
              ) {
                dealerPosition = 0;
              }
              smallLoopTime++;
            } else {
              io.in(room._id.toString()).emit('notification', {
                msg: "Player don't have enough chips for start another game",
              });
            }
          }
        }

        let bigBlindDeducted = 0;
        let bigLoopTime = 0;
        while (bigBlindDeducted < 1) {
          let playerAvilable = room.players.filter(
            (el) =>
              el.position === bigBlindPosition && el.playing && el.wallet > 0
          );
          if (playerAvilable.length) {
            let Bb_deduct;
            if (playerAvilable[0].wallet > bigBlindAmt) {
              Bb_deduct = await roomModel.findOneAndUpdate(
                {
                  _id: room._id,
                  'preflopround.position': bigBlindPosition,
                },
                {
                  $inc: {
                    'preflopround.$.wallet': -bigBlindAmt,
                    'preflopround.$.pot': +bigBlindAmt,
                  },

                  bigBlind: bigBlindAmt,
                  bigBlindPosition,
                  dealerPosition,
                  raiseAmount: bigBlindAmt,
                  'preflopround.$.missedSmallBlind': false,
                  'preflopround.$.missedBigBlind': false,
                  'preflopround.$.forceBigBlind': false,
                }
              );
            } else {
              allinPlayer.push({
                id: playerAvilable[0].userid,
                amt: playerAvilable[0].wallet,
                wallet: playerAvilable[0].wallet,
                round: 1,
              });
              Bb_deduct = await roomModel.findOneAndUpdate(
                {
                  _id: room._id,
                  'preflopround.id': playerAvilable[0].userid,
                },
                {
                  $inc: {
                    'preflopround.$.wallet': -playerAvilable[0].wallet,
                    'preflopround.$.pot': +playerAvilable[0].wallet,
                  },
                  'preflopround.$.action': true,
                  'preflopround.$.actionType': 'all-in',
                  bigBlind: bigBlindAmt,
                  lastAction: 'all-in',
                  allinPlayers: allinPlayer,
                  bigBlindPosition,
                  dealerPosition,
                  raiseAmount: bigBlindAmt,
                  'preflopround.$.missedSmallBlind': false,
                  'preflopround.$.missedBigBlind': false,
                  'preflopround.$.forceBigBlind': false,
                },
                {
                  new: true,
                }
              );
            }
            bigBlindDeducted = 1;
          } else {
            let isPlayerSitOut = room.players.filter(
              (el) => el.position === bigBlindPosition && !el.playing
            );
            if (isPlayerSitOut.length) {
              await roomModel.updateOne(
                {
                  _id: room._id,
                  'preflopround.position': bigBlindPosition,
                },
                {
                  'preflopround.$.missedBigBlind': true,
                }
              );
            }
            if (bigLoopTime < totalplayer - 1) {
              if (bigBlindPosition < totalplayer - 1) {
                bigBlindPosition++;
              } else if (bigBlindPosition === totalplayer - 1) {
                bigBlindPosition = 0;
              }
              if (
                totalplayer - 1 > 2 &&
                bigBlindPosition + 1 < totalplayer - 1
              ) {
                dealerPosition = bigBlindPosition + 1;
              } else if (
                totalplayer - 1 > 2 &&
                bigBlindPosition + 1 === totalplayer - 1
              ) {
                dealerPosition = 0;
              }
              bigLoopTime++;
            } else {
              await roomModel.findOneAndUpdate(
                {
                  _id: room._id,
                  'preflopround.position': smallBlindPosition,
                },
                {
                  $inc: {
                    'preflopround.$.wallet': +smallBlindAmt,
                  },
                }
              );
              io.in(room._id.toString()).emit('notification', {
                msg: "Player don't have enough chips for start another game",
              });
              res.send({
                code: 400,
                msg: "Player don't have enough chips for start another round",
              });
            }
          }
        }
        // if (bigBlindDeducted || smallBlindDeducted) {
        //   await roomModel.updateOne({ _id: room._id }, {bigBlindPosition,smallBlindPosition,pot:+bigBlindAmt+smallBlindAmt});
        // }

        prefloptimer(room._id, io);
        let updatedRoom = await roomModel.findOne({
          _id: room._id,
        });
        io.in(room._id.toString()).emit('preflopround', updatedRoom);
      } else {
        io.in(room._id.toString()).emit('onlyOnePlayingPlayer', {
          msg: 'Game finished, Only one player left',
          roomdata: room,
        });
        if (room.gameType === 'pokerTournament_Tables') {
          await finishedTableGame(room);
          io.in(room._id.toString()).emit('roomFinished', {
            msg: 'Game finished',
            finish: room.finish,
            roomdata: room,
          });
        }
      }
    } else {
      io.in(room._id.toString()).emit('tablestopped', {
        msg: 'Game paused by host',
      });
    }
  } else {
    io.in(room._id.toString()).emit('tablestopped', {
      msg: 'Table game has been finished',
    });
  }
};

export const prefloptimer = async (roomid, io) => {
  const roomData = await roomModel.findOne({ _id: roomid });
  let totalPlayer = roomData.preflopround.length + roomData.eleminated.length;
  const timer = async (i, maxPosition) => {
    let j = roomData.timer;
    let t = 'timer';
    let tx = roomData.timer;
    const udata = await roomModel.findOne({ _id: roomid });
    if (i < maxPosition) {
      let cPlayer = udata.players.filter((el) => el.position === i);

      let cp = null;
      if (cPlayer.length) {
        cp = cPlayer[0].userid;
      }
      // let playerinterval = udata.players[i].userid;
      const tempRoomData = await roomModel.findOneAndUpdate(
        { _id: roomid },
        { $set: { timerPlayer: cp } },
        { new: true }
      );
      if (cPlayer.length) {
        if (tempRoomData.runninground === 1) {
          await roomModel.findOneAndUpdate(
            {
              _id: roomid,
              'preflopround.position': i,
            },
            {
              'preflopround.$.action': false,
            }
          );
          let playerinterval = setInterval(async () => {
            const data = await roomModel.findOne({ _id: roomid });
            let preflopData = data.preflopround;

            let filteredData = preflopData.filter((e) => e.position === i);
            let intervalPlayer = filteredData;
            if (j <= 0) {
              if (intervalPlayer[0].timebank > 1) {
                j = intervalPlayer[0].timebank;
                t = 'time_bank';
                tx = intervalPlayer[0].timebank;
                io.in(data._id.toString()).emit('timer', {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 1,
                  maxtimer: tx,
                });
                // timer(i,maxPosition,intervalPlayer[0].timebank);
              } else {
                clearInterval(playerinterval);
                if (
                  (data.raiseAmount === intervalPlayer[0].pot ||
                    data.lastAction === 'check') &&
                  data.players.length !== 1
                ) {
                  await doCheck(roomid, intervalPlayer[0].id, io);
                  timer(++i, maxPosition);
                } else {
                  const isContinue = await doFold(
                    roomid,
                    intervalPlayer[0].id,
                    io
                  );
                  io.in(data._id.toString()).emit('automaticFold', {
                    msg: `${intervalPlayer[0].name} has automatically folded`,
                  });
                  await doSitOut(data, io);
                  if (isContinue) {
                    timer(++i, maxPosition);
                  }
                }
              }
            } else if (
              filteredData[0].fold ||
              filteredData[0].action ||
              filteredData[0].wallet === 0 ||
              !filteredData[0].playing
            ) {
              clearInterval(playerinterval);
              timer(++i, maxPosition);
            } else {
              // filteredData[0].playerchance = j;
              j--;
              if (j === 120 && !data.displayTimer) {
                io.in(data._id.toString()).emit('beingtimeout', {
                  msg: `${intervalPlayer[0].name}, what do you want to do?`,
                });
              } else if (j === 60 && !data.displayTimer) {
                let tablemsg = '';
                if (
                  data.raiseAmount === intervalPlayer[0].pot ||
                  data.lastAction === 'check'
                ) {
                  tablemsg = `${intervalPlayer[0].name}, please make your action, else you will automatically check in 1 minute.`;
                } else {
                  tablemsg = `${intervalPlayer[0].name}, please make your action, else you will automatically fold in 1 minute.`;
                }
                io.in(data._id.toString()).emit('beingtimeout', {
                  msg: tablemsg,
                });
              }

              if (t === 'timer') {
                const updatedRoom = await roomModel.findOneAndUpdate(
                  {
                    _id: roomid,
                    'preflopround.id': intervalPlayer[0].id,
                  },
                  {
                    'preflopround.$.playerchance': j,
                  },
                  {
                    new: true,
                  }
                );
                io.in(updatedRoom._id.toString()).emit('timer', {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 1,
                  maxtimer: tx,
                });
              } else {
                const updatedRoom = await roomModel.findOneAndUpdate(
                  {
                    _id: roomid,
                    'preflopround.id': intervalPlayer[0].id,
                  },
                  {
                    'preflopround.$.timebank': j,
                  },
                  {
                    new: true,
                  }
                );
                io.in(updatedRoom._id.toString()).emit('timer', {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 1,
                  maxtimer: tx,
                });
              }
            }
          }, 1000);
        }
      } else {
        timer(++i, maxPosition);
      }
    } else if (i === totalPlayer) {
      let newPosition = 0;

      if (
        udata.bigBlindPosition === totalPlayer - 1 &&
        udata.isCircleCompleted === false
      ) {
        newPosition = 0;
        const x = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
          },
          {
            isCircleCompleted: true,
          },
          {
            new: true,
          }
        );
      } else {
        if (
          udata.raisePlayerPosition !== null &&
          udata.isCircleCompleted === true
        ) {
          newPosition = udata.raisePlayerPosition;
        } else {
          newPosition = udata.bigBlindPosition + 1;
          await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              isCircleCompleted: true,
            }
          );
        }
      }
      timer(0, newPosition);
    } else {
      if (
        udata.raisePlayerPosition === null ||
        i === udata.raisePlayerPosition
      ) {
        setTimeout(() => {
          flopround(roomid, io);
        }, 1000);
      } else {
        if (udata.isCircleCompleted) {
          // if (udata.raisePlayerPosition === totalPlayer-1) {
          //     timer(i,udata.raisePlayerPosition);
          // } else {
          //     timer(i,totalPlayer);
          // }
          if (udata.raisePlayerPosition < i) {
            timer(i, totalPlayer);
          } else {
            timer(i, udata.raisePlayerPosition);
          }
        } else {
          timer(i, totalPlayer);
        }
      }
    }
  };
  let i = 0;
  if (roomData.bigBlindPosition === totalPlayer - 1) {
    i = 0;
  } else {
    i = roomData.bigBlindPosition + 1;
  }

  timer(i, totalPlayer);
};

export const flopround = async (roomid, io) => {
  const roomData = await roomModel.findOne({ _id: roomid });
  // const tournamentConfig = await tournamentConfModel.findOne().sort({'_id': -1});

  if (roomData.runninground === 1) {
    let distributedCards = [];
    let floproundPlayersData = [];
    let totalPot = roomData.pot;
    let playingPlayer = 0;

    const fetchDistributedCards = () => {
      roomData.preflopround.forEach((e) => {
        let playerchance = roomData.timer;
        let actionType = null;
        if (e.fold === true) {
          playerchance = 0;
          actionType = 'fold';
        }
        if (e.actionType === 'all-in') {
          actionType = 'all-in';
        }
        let p = {
          cards: e.cards,
          id: e.id,
          name: e.name,
          wallet: e.wallet,
          photoURI: e.photoURI,
          fold: e.fold,
          timebank: e.timebank,
          playerchance: playerchance,
          playing: e.playing,
          action: null,
          actionType: actionType,
          prevPot: e.prevPot + e.pot,
          pot: 0,
          position: e.position,
          missedSmallBlind: e.missedSmallBlind,
          missedBigBlind: e.missedBigBlind,
          forceBigBlind: e.forceBigBlind,
          missedBilndAmt: 0,
          stats: e.stats,
          initialCoinBeforeStart: e.initialCoinBeforeStart,
          gameJoinedAt: e.gameJoinedAt,
          hands: e.hands,
          meetingToken: e.meetingToken,
          items: e.items,
        };
        totalPot += e.pot;
        totalPot += e.missedBilndAmt;
        floproundPlayersData.push(p);

        e.cards.forEach((el) => {
          distributedCards.push(el);
        });
        if (actionType === null && e.playing) {
          playingPlayer++;
        }
      });
    };
    await fetchDistributedCards();
    let communityCards = await verifycards(distributedCards, 3);

    const updatedRoom = await roomModel.findOneAndUpdate(
      {
        _id: roomid,
      },
      {
        flopround: floproundPlayersData,
        communityCard: communityCards,
        runninground: 2,
        timerPlayer: null,
        pot: totalPot,
        raisePlayerPosition: roomData.smallBlindPosition,
        raiseAmount: roomData.bigBlind,
        lastAction: 'check',
        isCircleCompleted: false,
      },

      {
        new: true,
      }
    );

    io.in(updatedRoom._id.toString()).emit('flopround', updatedRoom);
    if (playingPlayer > 1) {
      setTimeout(() => {
        flopTimer(roomid, io);
      }, 1000);
    } else {
      setTimeout(() => {
        turnround(roomid, io);
      }, 1000);
    }
  }
};

export const flopTimer = async (roomid, io) => {
  const roomData = await roomModel.findOne({ _id: roomid });

  let totalPlayer = roomData.flopround.length + roomData.eleminated.length;

  const timer = async (i, maxPosition) => {
    let j = roomData.timer;
    let t = 'timer';
    let tx = roomData.timer;
    const udata = await roomModel.findOne({ _id: roomid });

    if (i < maxPosition) {
      // let playerinterval = roomData.players[i].userid;

      let cPlayer = roomData.players.filter((el) => el.position === i);
      let cp = null;
      if (cPlayer.length) {
        cp = cPlayer[0].userid;
      }

      const tempRoomData = await roomModel.findOneAndUpdate(
        { _id: roomid },
        { timerPlayer: cp },
        {
          new: true,
        }
      );

      if (cPlayer.length) {
        if (tempRoomData.runninground === 2) {
          await roomModel.findOneAndUpdate(
            {
              _id: roomid,
              'flopround.position': i,
            },
            {
              'flopround.$.action': false,
            }
          );
          let playerinterval = setInterval(async () => {
            const data = await roomModel.findOne({ _id: roomid });
            let flopData = data.flopround;

            let filteredData = flopData.filter((e) => e.position === i);

            let intervalPlayer = filteredData;
            if (j <= 0) {
              if (intervalPlayer[0].timebank > 1) {
                j = intervalPlayer[0].timebank;
                t = 'time_bank';
                tx = intervalPlayer[0].timebank;
                io.in(data._id.toString()).emit('timer', {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 4,
                  maxtimer: tx,
                });
              } else {
                clearInterval(playerinterval);
                if (
                  (data.raiseAmount === intervalPlayer[0].pot ||
                    data.lastAction === 'check') &&
                  data.players.length !== 1
                ) {
                  await doCheck(roomid, intervalPlayer[0].id, io);
                  timer(++i, maxPosition);
                } else {
                  const isContinue = await doFold(
                    roomid,
                    intervalPlayer[0].id,
                    io
                  );
                  io.in(data._id.toString()).emit('automaticFold', {
                    msg: `${intervalPlayer[0].name} has automatically folded`,
                  });
                  await doSitOut(data, io);
                  if (isContinue) {
                    timer(++i, maxPosition);
                  }
                }
              }
              // timer(++i,maxPosition);
            } else if (
              filteredData[0].fold ||
              filteredData[0].action ||
              filteredData[0].wallet === 0 ||
              !filteredData[0].playing
            ) {
              clearInterval(playerinterval);
              timer(++i, maxPosition);
            } else {
              j--;

              if (j === 120 && !data.displayTimer) {
                io.in(data._id.toString()).emit('beingtimeout', {
                  msg: `${intervalPlayer[0].name}, what do you want to do?`,
                });
              } else if (j === 60 && !data.displayTimer) {
                let tablemsg = '';
                if (
                  data.raiseAmount === intervalPlayer[0].pot ||
                  data.lastAction === 'check'
                ) {
                  tablemsg = `${intervalPlayer[0].name}, please make your action, else you will automatically check in 1 minute.`;
                } else {
                  tablemsg = `${intervalPlayer[0].name}, please make your action, else you will automatically fold in 1 minute.`;
                }
                io.in(data._id.toString()).emit('beingtimeout', {
                  msg: tablemsg,
                });
              }
              if (t === 'timer') {
                const updatedRoom = await roomModel.findOneAndUpdate(
                  {
                    _id: roomid,
                    'flopround.id': intervalPlayer[0].id,
                  },
                  {
                    'flopround.$.playerchance': j,
                  },
                  {
                    new: true,
                  }
                );
                io.in(data._id.toString()).emit('timer', {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 2,
                  maxtimer: tx,
                });
              } else {
                const updatedRoom = await roomModel.findOneAndUpdate(
                  {
                    _id: roomid,
                    'flopround.id': intervalPlayer[0].id,
                  },
                  {
                    'flopround.$.timebank': j,
                  },
                  {
                    new: true,
                  }
                );
                io.in(data._id.toString()).emit('timer', {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 2,
                  maxtimer: tx,
                });
              }
            }
          }, 1000);
        }
      } else {
        timer(++i, maxPosition);
      }
    } else if (i === totalPlayer) {
      let newPosition = 0;

      if (
        udata.smallBlindPosition === totalPlayer - 1 &&
        udata.isCircleCompleted === false
      ) {
        newPosition = 0;
        const x = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
          },
          {
            isCircleCompleted: true,
          },
          {
            new: true,
          }
        );
      } else {
        if (
          udata.raisePlayerPosition !== null &&
          udata.isCircleCompleted === true
        ) {
          newPosition = udata.raisePlayerPosition;
        } else {
          newPosition = udata.smallBlindPosition;
          await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              isCircleCompleted: true,
            }
          );
        }
      }

      timer(0, newPosition);
    } else {
      if (
        udata.raisePlayerPosition === null ||
        i === udata.raisePlayerPosition
      ) {
        setTimeout(() => {
          turnround(roomid, io);
        }, 1000);
      } else {
        if (udata.isCircleCompleted) {
          // timer(i,udata.raisePlayerPosition);
          // if (udata.raisePlayerPosition === totalPlayer-1) {
          //     timer(i,udata.raisePlayerPosition);
          // } else {
          //     timer(i,totalPlayer);
          // }
          if (udata.raisePlayerPosition < i) {
            timer(i, totalPlayer);
          } else {
            timer(i, udata.raisePlayerPosition);
          }
        } else {
          timer(i, totalPlayer);
        }
      }
    }
  };
  let i = roomData.smallBlindPosition;

  timer(i, totalPlayer);
};

export const turnround = async (roomid, io) => {
  const roomData = await roomModel.findOne({ _id: roomid });
  // const tournamentConfig = await tournamentConfModel.findOne().sort({'_id': -1});
  let playingPlayer = 0;

  if (roomData.runninground === 2) {
    let distributedCards = [];
    let turnroundPlayersData = [];
    let totalPot = roomData.pot;
    const fetchDistributedCards = () => {
      roomData.flopround.forEach((e) => {
        let playerchance = roomData.timer;
        let actionType = null;
        if (e.fold === true) {
          playerchance = 0;
          actionType = 'fold';
        }
        if (e.actionType === 'all-in') {
          actionType = 'all-in';
        }
        let p = {
          cards: e.cards,
          id: e.id,
          name: e.name,
          photoURI: e.photoURI,
          wallet: e.wallet,
          fold: e.fold,
          timebank: e.timebank,
          playerchance: playerchance,
          playing: e.playing,
          action: null,
          actionType: actionType,
          prevPot: e.prevPot + e.pot,
          pot: 0,
          position: e.position,
          missedSmallBlind: e.missedSmallBlind,
          missedBigBlind: e.missedBigBlind,
          forceBigBlind: e.forceBigBlind,
          missedBilndAmt: 0,
          stats: e.stats,
          initialCoinBeforeStart: e.initialCoinBeforeStart,
          gameJoinedAt: e.gameJoinedAt,
          hands: e.hands,
          meetingToken: e.meetingToken,
          items: e.items,
        };
        totalPot += e.pot;

        turnroundPlayersData.push(p);

        e.cards.forEach((el) => {
          distributedCards.push(el);
        });

        if (actionType === null && e.playing) {
          playingPlayer++;
        }
      });

      roomData.communityCard.forEach((el) => {
        distributedCards.push(el);
      });
    };

    await fetchDistributedCards();

    let newCard = await verifycards(distributedCards, 1);
    let communityCards = roomData.communityCard;
    communityCards.push(newCard[0]);

    const updatedRoom = await roomModel.findOneAndUpdate(
      {
        _id: roomid,
      },
      {
        turnround: turnroundPlayersData,
        communityCard: communityCards,
        runninground: 3,
        timerPlayer: null,
        pot: totalPot,
        raisePlayerPosition: roomData.smallBlindPosition,
        raiseAmount: roomData.bigBlind,
        lastAction: 'check',
        isCircleCompleted: false,
      },

      {
        new: true,
      }
    );

    io.in(updatedRoom._id.toString()).emit('turnround', updatedRoom);
    if (playingPlayer > 1) {
      setTimeout(() => {
        turnTimer(roomid, io);
      }, 1000);
    } else {
      setTimeout(() => {
        riverround(roomid, io);
      }, 1000);
    }
  }
};

export const turnTimer = async (roomid, io) => {
  const roomData = await roomModel.findOne({ _id: roomid });
  let totalPlayer = roomData.turnround.length + roomData.eleminated.length;

  const timer = async (i, maxPosition) => {
    let j = roomData.timer;
    let t = 'timer';
    let tx = roomData.timer;
    const udata = await roomModel.findOne({ _id: roomid });

    if (i < maxPosition) {
      let cPlayer = roomData.players.filter((el) => el.position === i);
      let cp = null;
      if (cPlayer.length) {
        cp = cPlayer[0].userid;
      }
      const tempRoomData = await roomModel.findOneAndUpdate(
        { _id: roomid },
        { timerPlayer: cp },
        {
          new: true,
        }
      );
      if (cPlayer.length) {
        if (tempRoomData.runninground === 3) {
          await roomModel.findOneAndUpdate(
            {
              _id: roomid,
              'turnround.position': i,
            },
            {
              'turnround.$.action': false,
            }
          );
          let playerinterval = setInterval(async () => {
            const data = await roomModel.findOne({ _id: roomid });
            let turnData = data.turnround;

            let filteredData = turnData.filter((e) => e.position === i);

            let intervalPlayer = filteredData;
            if (j <= 0) {
              if (intervalPlayer[0].timebank > 1) {
                j = intervalPlayer[0].timebank;
                t = 'time_bank';
                tx = intervalPlayer[0].timebank;
                io.in(data._id.toString()).emit('timer', {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 4,
                  maxtimer: tx,
                });
              } else {
                clearInterval(playerinterval);
                if (
                  (data.raiseAmount === intervalPlayer[0].pot ||
                    data.lastAction === 'check') &&
                  data.players.length !== 1
                ) {
                  await doCheck(roomid, intervalPlayer[0].id, io);
                  timer(++i, maxPosition);
                } else {
                  const isContinue = await doFold(
                    roomid,
                    intervalPlayer[0].id,
                    io
                  );
                  io.in(data._id.toString()).emit('automaticFold', {
                    msg: `${intervalPlayer[0].name} has automatically folded`,
                  });
                  await doSitOut(data, io);
                  if (isContinue) {
                    timer(++i, maxPosition);
                  }
                }
              }
              // timer(++i,maxPosition);
            } else if (
              filteredData[0].fold ||
              filteredData[0].action ||
              filteredData[0].wallet === 0 ||
              !filteredData[0].playing
            ) {
              clearInterval(playerinterval);
              timer(++i, maxPosition);
            } else {
              j--;

              if (j === 120 && !data.displayTimer) {
                io.in(data._id.toString()).emit('beingtimeout', {
                  msg: `${intervalPlayer[0].name}, what do you want to do?`,
                });
              } else if (j === 60 && !data.displayTimer) {
                let tablemsg = '';
                if (
                  data.raiseAmount === intervalPlayer[0].pot ||
                  data.lastAction === 'check'
                ) {
                  tablemsg = `${intervalPlayer[0].name}, please make your action, else you will automatically check in 1 minute.`;
                } else {
                  tablemsg = `${intervalPlayer[0].name}, please make your action, else you will automatically fold in 1 minute.`;
                }
                io.in(data._id.toString()).emit('beingtimeout', {
                  msg: tablemsg,
                });
              }
              if (t === 'timer') {
                const updatedRoom = await roomModel.findOneAndUpdate(
                  {
                    _id: roomid,
                    'turnround.id': intervalPlayer[0].id,
                  },
                  {
                    'turnround.$.playerchance': j,
                  },
                  {
                    new: true,
                  }
                );
                io.in(data._id.toString()).emit('timer', {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 3,
                  maxtimer: tx,
                });
              } else {
                const updatedRoom = await roomModel.findOneAndUpdate(
                  {
                    _id: roomid,
                    'turnround.id': intervalPlayer[0].id,
                  },
                  {
                    'turnround.$.timebank': j,
                  },
                  {
                    new: true,
                  }
                );
                io.in(data._id.toString()).emit('timer', {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 3,
                  maxtimer: tx,
                });
              }
            }
          }, 1000);
        }
      } else {
        timer(++i, maxPosition);
      }
    } else if (i === totalPlayer) {
      let newPosition = 0;
      if (
        udata.smallBlindPosition === totalPlayer - 1 &&
        udata.isCircleCompleted === false
      ) {
        newPosition = 0;
        const x = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
          },
          {
            isCircleCompleted: true,
          },
          {
            new: true,
          }
        );
      } else {
        if (
          udata.raisePlayerPosition !== null &&
          udata.isCircleCompleted === true
        ) {
          newPosition = udata.raisePlayerPosition;
        } else {
          newPosition = udata.smallBlindPosition;
          await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              isCircleCompleted: true,
            }
          );
        }
      }

      timer(0, newPosition);
    } else {
      if (
        udata.raisePlayerPosition === null ||
        i === udata.raisePlayerPosition
      ) {
        setTimeout(() => {
          riverround(roomid, io);
        }, 1000);
      } else {
        if (udata.isCircleCompleted) {
          // timer(i,udata.raisePlayerPosition);
          // if (udata.raisePlayerPosition === totalPlayer-1) {
          //     timer(i,udata.raisePlayerPosition);
          // } else {
          //     timer(i,totalPlayer);
          // }
          if (udata.raisePlayerPosition < i) {
            timer(i, totalPlayer);
          } else {
            timer(i, udata.raisePlayerPosition);
          }
        } else {
          timer(i, totalPlayer);
        }
      }
    }
  };
  let i = roomData.smallBlindPosition;

  timer(i, totalPlayer);
};

export const riverround = async (roomid, io) => {
  const roomData = await roomModel.findOne({ _id: roomid });
  let playingPlayer = 0;

  if (roomData.runninground === 3) {
    let distributedCards = [];
    let riverroundPlayersData = [];
    let totalPot = roomData.pot;
    const fetchDistributedCards = () => {
      roomData.turnround.forEach((e) => {
        let playerchance = roomData.timer;
        let actionType = null;
        if (e.fold === true) {
          playerchance = 0;
          actionType = 'fold';
        }
        if (e.actionType === 'all-in') {
          actionType = 'all-in';
        }
        let p = {
          cards: e.cards,
          id: e.id,
          name: e.name,
          photoURI: e.photoURI,
          wallet: e.wallet,
          fold: e.fold,
          timebank: e.timebank,
          playerchance: playerchance,
          playing: e.playing,
          action: null,
          actionType: actionType,
          prevPot: e.prevPot + e.pot,
          pot: 0,
          position: e.position,
          missedSmallBlind: e.missedSmallBlind,
          missedBigBlind: e.missedBigBlind,
          forceBigBlind: e.forceBigBlind,
          missedBilndAmt: 0,
          stats: e.stats,
          initialCoinBeforeStart: e.initialCoinBeforeStart,
          gameJoinedAt: e.gameJoinedAt,
          hands: e.hands,
          meetingToken: e.meetingToken,
          items: e.items,
        };
        totalPot += e.pot;

        riverroundPlayersData.push(p);

        e.cards.forEach((el) => {
          distributedCards.push(el);
        });
        if (actionType === null && e.playing) {
          playingPlayer++;
        }
      });

      roomData.communityCard.forEach((el) => {
        distributedCards.push(el);
      });
    };

    await fetchDistributedCards();

    let newCard = await verifycards(distributedCards, 1);
    let communityCards = roomData.communityCard;
    communityCards.push(newCard[0]);

    const updatedRoom = await roomModel.findOneAndUpdate(
      {
        _id: roomid,
      },
      {
        riverround: riverroundPlayersData,
        communityCard: communityCards,
        runninground: 4,
        timerPlayer: null,
        pot: totalPot,
        raisePlayerPosition: roomData.smallBlindPosition,
        raiseAmount: roomData.bigBlind,
        lastAction: 'check',
        isCircleCompleted: false,
      },

      {
        new: true,
      }
    );

    io.in(updatedRoom._id.toString()).emit('riverround', updatedRoom);
    if (playingPlayer > 1) {
      setTimeout(() => {
        riverTimer(roomid, io);
      }, 1000);
    } else {
      setTimeout(() => {
        showdown(roomid, io);
      }, 1000);
    }
  }
};

export const riverTimer = async (roomid, io) => {
  const roomData = await roomModel.findOne({ _id: roomid });
  let totalPlayer = roomData.riverround.length + roomData.eleminated.length;
  const timer = async (i, maxPosition) => {
    let j = roomData.timer;
    let t = 'timer';
    let tx = roomData.timer;
    const udata = await roomModel.findOne({ _id: roomid });
    if (i < maxPosition) {
      let cPlayer = roomData.players.filter((el) => el.position === i);
      let cp = null;
      if (cPlayer.length) {
        cp = cPlayer[0].userid;
      }
      const tempRoomData = await roomModel.findOneAndUpdate(
        { _id: roomid },
        { timerPlayer: cp },
        {
          new: true,
        }
      );
      if (cPlayer.length) {
        if (tempRoomData.runninground === 4) {
          await roomModel.findOneAndUpdate(
            {
              _id: roomid,
              'riverround.position': i,
            },
            {
              'riverround.$.action': false,
            }
          );
          let playerinterval = setInterval(async () => {
            const data = await roomModel.findOne({ _id: roomid });
            let riverData = data.riverround;

            let filteredData = riverData.filter((e) => e.position === i);

            let intervalPlayer = filteredData;
            if (j <= 0) {
              if (intervalPlayer[0].timebank > 1) {
                j = intervalPlayer[0].timebank;
                t = 'time_bank';
                tx = intervalPlayer[0].timebank;
                io.in(data._id.toString()).emit('timer', {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 4,
                  maxtimer: tx,
                });
              } else {
                clearInterval(playerinterval);
                if (
                  (data.raiseAmount === intervalPlayer[0].pot ||
                    data.lastAction === 'check') &&
                  data.players.length !== 1
                ) {
                  await doCheck(roomid, intervalPlayer[0].id, io);
                  timer(++i, maxPosition);
                } else {
                  const isContinue = await doFold(
                    roomid,
                    intervalPlayer[0].id,
                    io
                  );
                  io.in(data._id.toString()).emit('automaticFold', {
                    msg: `${intervalPlayer[0].name} has automatically folded`,
                  });
                  await doSitOut(data, io);
                  if (isContinue) {
                    timer(++i, maxPosition);
                  }
                }
              }
              // timer(++i,maxPosition);
            } else if (
              filteredData[0].fold ||
              filteredData[0].action ||
              filteredData[0].wallet === 0 ||
              !filteredData[0].playing
            ) {
              clearInterval(playerinterval);
              timer(++i, maxPosition);
            } else {
              j--;

              if (j === 120 && !data.displayTimer) {
                io.in(data._id.toString()).emit('beingtimeout', {
                  msg: `${intervalPlayer[0].name}, what do you want to do?`,
                });
              } else if (j === 60 && !data.displayTimer) {
                let tablemsg = '';
                if (
                  data.raiseAmount === intervalPlayer[0].pot ||
                  data.lastAction === 'check'
                ) {
                  tablemsg = `${intervalPlayer[0].name}, please make your action, else you will automatically check in 1 minute.`;
                } else {
                  tablemsg = `${intervalPlayer[0].name}, please make your action, else you will automatically fold in 1 minute.`;
                }
                io.in(data._id.toString()).emit('beingtimeout', {
                  msg: tablemsg,
                });
              }
              if (t === 'timer') {
                const updatedRoom = await roomModel.findOneAndUpdate(
                  {
                    _id: roomid,
                    'riverround.id': intervalPlayer[0].id,
                  },
                  {
                    'riverround.$.playerchance': j,
                  },
                  {
                    new: true,
                  }
                );
                io.in(data._id.toString()).emit('timer', {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 4,
                  maxtimer: tx,
                });
              } else {
                const updatedRoom = await roomModel.findOneAndUpdate(
                  {
                    _id: roomid,
                    'riverround.id': intervalPlayer[0].id,
                  },
                  {
                    'riverround.$.timebank': j,
                  },
                  {
                    new: true,
                  }
                );
                io.in(data._id.toString()).emit('timer', {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 4,
                  maxtimer: tx,
                });
              }
            }
          }, 1000);
        }
      } else {
        timer(++i, maxPosition);
      }
    } else if (i === totalPlayer) {
      let newPosition = 0;
      if (
        udata.smallBlindPosition === totalPlayer - 1 &&
        udata.isCircleCompleted === false
      ) {
        newPosition = 0;
        const x = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
          },
          {
            isCircleCompleted: true,
          },
          {
            new: true,
          }
        );
      } else {
        if (
          udata.raisePlayerPosition !== null &&
          udata.isCircleCompleted === true
        ) {
          newPosition = udata.raisePlayerPosition;
        } else {
          newPosition = udata.smallBlindPosition;
          await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              isCircleCompleted: true,
            }
          );
        }
      }

      timer(0, newPosition);
    } else {
      if (
        udata.raisePlayerPosition === null ||
        i === udata.raisePlayerPosition
      ) {
        setTimeout(() => {
          showdown(roomid, io);
        }, 1000);
      } else {
        if (udata.isCircleCompleted) {
          if (udata.raisePlayerPosition < i) {
            timer(i, totalPlayer);
          } else {
            timer(i, udata.raisePlayerPosition);
          }
        } else {
          timer(i, totalPlayer);
        }
      }
    }
  };
  let i = roomData.smallBlindPosition;

  timer(i, totalPlayer);
};

export const showdown = async (roomid, io) => {
  console.log('----showdown-----');
  const roomData = await roomModel.findOne({ _id: roomid });
  if (!roomData.isGameRunning) return;
  console.log('AFTER IF SHOWDOWN');
  let playersHand = [];
  let hands = [];
  let showDownPlayers = [];
  let totalPot = roomData.pot;
  let playerData = roomData.riverround;
  playerData.forEach((e) => {
    console.log(e);
    let actionType = null;
    if (e.fold === true) {
      actionType = 'fold';
    }
    if (e.actionType === 'all-in') {
      actionType = 'all-in';
    }
    let p = {
      cards: e.cards,
      id: e.id,
      name: e.name,
      photoURI: e.photoURI,
      wallet: e.wallet,
      fold: e.fold,
      playerchance: 0,
      playing: e.playing,
      timebank: e.timebank,
      action: null,
      actionType: actionType,
      prevPot: e.prevPot + e.pot,
      pot: 0,
      position: e.position,
      missedSmallBlind: e.missedSmallBlind,
      missedBigBlind: e.missedBigBlind,
      forceBigBlind: e.forceBigBlind,
      missedBilndAmt: 0,
      stats: e.stats,
      initialCoinBeforeStart: e.initialCoinBeforeStart,
      gameJoinedAt: e.gameJoinedAt,
      hands: e.hands,
      meetingToken: e.meetingToken,
      items: e.items,
    };
    totalPot += e.pot;
    showDownPlayers.push(p);
  });
  console.log({ playerData });
  const updatedRoom = await roomModel.findOneAndUpdate(
    {
      _id: roomid,
    },
    {
      showdown: showDownPlayers,
      runninground: 5,
      timerPlayer: null,
      pot: totalPot,
    },
    {
      new: true,
    }
  );

  const getSidePOt = async (updatedRoom) => {
    if (updatedRoom.allinPlayers.length) {
      let roundData = updatedRoom.showdown;

      let sidePot = [];
      const z = (roundData) => {
        let otherPlayer = roundData.filter(
          (el) => el.prevPot > 0 && el.fold === false
        );
        let foldPlayer = roundData.filter(
          (el) => el.prevPot > 0 && el.fold === true
        );
        let pots = [];
        otherPlayer.forEach((element) => {
          pots.push(element.prevPot);
        });
        pots.sort(function (a, b) {
          return a - b;
        });
        let side_pot = 0;
        let playersOfPot = [];
        otherPlayer.forEach((el) => {
          if (el.prevPot < pots[0]) {
            side_pot += el.prevPot;
            el.prevPot = 0;
          } else {
            el.prevPot -= pots[0];
            side_pot += pots[0];
          }
          playersOfPot.push(el.position);
        });

        foldPlayer.forEach((el) => {
          if (el.prevPot < pots[0]) {
            side_pot += el.prevPot;
            el.prevPot = 0;
          } else {
            el.prevPot -= pots[0];
            side_pot += pots[0];
          }
        });

        sidePot.push({ pot: side_pot, players: playersOfPot });
        otherPlayer = roundData.filter(
          (el) => el.prevPot > 0 && el.fold === false
        );
        if (otherPlayer.length) {
          z(roundData);
        }
      };
      z(roundData);

      return sidePot;
    } else {
      return [];
    }
  };

  const clcHand = (x) => {
    if (x.length) {
      x.forEach((e) => {
        let h = [];
        let p = [];
        let pot = e.pot;
        updatedRoom.showdown.forEach((el) => {
          if (!el.fold && e.players.indexOf(el.position) != -1) {
            let cards = updatedRoom.communityCard;
            let allCards = cards.concat(el.cards);

            let hand = Hand.solve(allCards);

            p.push({ id: el.id, position: el.position, hand: hand });
            h.push(hand);
          }
        });
        hands.push({ h, p, pot });
      });
    } else {
      let h = [];
      let p = [];
      let pot = updatedRoom.pot;
      updatedRoom.showdown.forEach((el) => {
        if (!el.fold) {
          let cards = updatedRoom.communityCard;
          let allCards = cards.concat(el.cards);

          let hand = Hand.solve(allCards);

          p.push({ id: el.id, position: el.position, hand: hand });
          h.push(hand);
        }
      });
      hands.push({ h, p, pot });
    }
  };

  let x = await getSidePOt(updatedRoom);
  console.log({ x });
  clcHand(x);
  console.log({ hands });
  let showdownData = updatedRoom.showdown;
  let winnerPlayers = [];
  const findWinner = async () => {
    console.log('------FIND WINNER---');
    hands.forEach((e) => {
      let winner = Hand.winners(e.h);
      console.log({ winner });
      e.p.forEach((el) => {
        console.log({ elHand: el.hand });
        if (JSON.stringify(el.hand) == JSON.stringify(winner[0])) {
          console.log('IS WINNER TRUE');
          let winnerData = showdownData.filter(
            (p) => p.position === el.position
          );
          winnerData[0].wallet += e.pot;
          let winnerHand = [];
          winner[0].cards.forEach((c) => {
            winnerHand.push(`${c.value}${c.suit}`);
          });
          const totalPlayerTablePot = winnerData[0].prevPot;
          console.log({ winnerData, totalPlayerTablePot });
          let winningAmount = e.pot - totalPlayerTablePot;
          console.log({ winningAmount, e, winnerPlayers });

          if (winnerPlayers.length) {
            console.log('In Winner player');
            let playerExist = winnerPlayers.filter(
              (wp) => wp.position === el.position
            );
            if (playerExist.length) {
              console.log('In player exists');
              playerExist[0].winningAmount += e.pot;
            } else {
              console.log('NEW Winner player', {
                id: winnerData[0].id,
                name: winnerData[0].name,
                position: winnerData[0].position,
                winningAmount: winningAmount,
                handName: winner[0].name,
                winnerHand: winnerHand,
                winnerCards: winnerData[0].cards,
                communityCards: updatedRoom.communityCard,
              });
              winnerPlayers.push({
                id: winnerData[0].id,
                name: winnerData[0].name,
                position: winnerData[0].position,
                winningAmount: winningAmount,
                handName: winner[0].name,
                winnerHand: winnerHand,
                winnerCards: winnerData[0].cards,
                communityCards: updatedRoom.communityCard,
              });
            }
          } else {
            console.log('ELSE NEW Winner player', {
              id: winnerData[0].id,
              name: winnerData[0].name,
              position: winnerData[0].position,
              winningAmount: winningAmount,
              handName: winner[0].name,
              winnerHand: winnerHand,
              winnerCards: winnerData[0].cards,
              communityCards: updatedRoom.communityCard,
            });
            winnerPlayers.push({
              id: winnerData[0].id,
              name: winnerData[0].name,
              position: winnerData[0].position,
              winningAmount: winningAmount,
              handName: winner[0].name,
              winnerHand: winnerHand,
              winnerCards: winnerData[0].cards,
              communityCards: updatedRoom.communityCard,
            });
          }
        }
      });
    });
  };
  await findWinner();
  const handWinner = updatedRoom.handWinner;
  console.log({ handWinner });
  handWinner.push(winnerPlayers);
  console.log({ handWinner });
  const upRoomData = await roomModel.findOne({ _id: updatedRoom._id });
  upRoomData.showdown.forEach((player, i) => {
    let action, amt;
    if (player.playing) {
      if (
        winnerPlayers.find((ele) => {
          console.log({
            ele: ele.id.toString(),
            playerId: player.id.toString(),
          });
          return ele.id.toString() === player.id.toString();
        })
      ) {
        console.log('---Game Win---');
        action = 'game-win';
        const winnerObj = winnerPlayers.find(
          (ele) => ele.id.toString() === player.id.toString()
        );
        const updateRoomObj = updatedRoom.allinPlayers.find(
          (allin) => allin.id.toString() === player.id.toString()
        );
        if (updateRoomObj && winnerObj) {
          if (winnerObj.winningAmount - updateRoomObj.amt < 0) {
            action = 'game-lose';
            amt = Math.abs(winnerObj.winningAmount - updateRoomObj.amt);
          } else if (winnerObj.winningAmount - updateRoomObj.amt === 0) {
            return;
          } else {
            amt = winnerObj.winningAmount - player.prevPot;
          }
        } else {
          amt = winnerObj.winningAmount;
        }
      } else {
        console.log('---Game Lose---');
        action = 'game-lose';
        amt = player.prevPot;
      }
      player.wallet = showdownData[i].wallet;
      console.log('Player hands', { amt, action, hands: player.hands });
      player.hands.push({
        action,
        amount: amt,
        date: new Date(),
        isWatcher: false,
      });
      console.log('Player hands', { hands: player.hands });
    }
  });
  console.log('showdownplayes', JSON.stringify(upRoomData.showdown));
  const upRoom = await roomModel.findOneAndUpdate(
    {
      _id: roomid,
    },
    {
      showdown: upRoomData.showdown,
      winnerPlayer: winnerPlayers,
      handWinner: handWinner,
      sidePots: x,
      isShowdown: true,
    },
    {
      new: true,
    }
  );

  io.in(upRoom._id.toString()).emit('winner', { updatedRoom: upRoom });
  // await finishHandApiCall(upRoom);
  handleWatcherWinner(upRoom, io);
  // findLoserAndWinner(upRoom);
  setTimeout(async () => {
    //let firstGameTime = new Date(upRoom.firstGameTime);
    //let now = new Date();
    //// for min games
    //if ((now - firstGameTime) / (1000 * 60) > 15) {
    //  const roomUpdate = await roomModel.findOne({ _id: upRoom._id });
    //  io.in(roomUpdate._id.toString()).emit("roomFinished", {
    //    msg: "Game finished",
    //    finish: roomUpdate.finish,
    //    roomdata: roomUpdate,
    //  });
    //  finishedTableGame(roomUpdate);
    //} else {
    await updateRoomForNewHand(roomid, io);
    let updatedRoomPlayers = await roomModel.findOne({
      _id: roomid,
    });
    if (!upRoom.pause) {
      if (upRoom.autoNextHand) {
        preflopround(upRoom, io);
      } else {
        let havemoney = updatedRoomPlayers.players.filter(
          (el) => el.wallet > 0
        );
        if (havemoney.length > 1) {
          io.in(upRoom._id.toString()).emit('tablestopped', {
            msg: 'Waiting to start game',
          });
        } else {
          io.in(upRoom._id.toString()).emit('onlyOnePlayingPlayer', {
            msg: 'Game finished, Only one player left',
            roomdata: updatedRoomPlayers,
          });
          if (updatedRoomPlayers.gameType === 'pokerTournament_Tables') {
            // await finishedTableGame(updatedRoomPlayers);
            io.in(updatedRoomPlayers._id.toString()).emit('roomFinished', {
              msg: 'Game finished',
              finish: updatedRoomPlayers.finish,
              roomdata: updatedRoomPlayers,
            });
          }
        }
      }
    } else {
      io.in(upRoom._id.toString()).emit('tablestopped', {
        msg: 'Table stopped by host',
      });
    }
    const roomUpdate = await roomModel.findOne({ _id: upRoom._id });
    if (roomUpdate.finish) {
      io.in(roomUpdate._id.toString()).emit('roomFinished', {
        msg: 'Game finished',
        finish: roomUpdate.finish,
        roomdata: roomUpdate,
      });
    } else
      io.in(upRoom._id.toString()).emit('newhand', {
        updatedRoom: roomUpdate,
      });
  }, 15000);
};

export const updateRoomForNewHand = async (roomid, io) => {
  return new Promise(async (resolve, reject) => {
    try {
      const roomData = await roomModel
        .findOne({ _id: roomid })
        .populate('tournament');
      let newHandPlayer = [];
      let buyin = roomData.buyin;
      const bigBlindAmt = roomData.bigBlind;
      const smallBlindAmt = roomData.smallBlind;
      let playerData = [];
      switch (roomData.runninground) {
        case 0:
          playerData = roomData.players;
          break;
        case 1:
          playerData = roomData.preflopround;
          break;
        case 2:
          playerData = roomData.flopround;
          break;
        case 3:
          playerData = roomData.turnround;
          break;
        case 4:
          playerData = roomData.riverround;
          break;
        case 5:
          playerData = roomData.showdown;
          break;
      }

      const anyNewPlayer = async (playerData, plrs) => {
        return new Promise((resolve, reject) => {
          let data = playerData;

          each(
            plrs,
            function (x, next) {
              try {
                if (roomData.runninground > 0) {
                  const playerexist = data.find(
                    (el) => el.userid.toString() === x.userid.toString()
                  );
                  if (!playerexist) {
                    data.push(x);
                  }
                }
                next();
              } catch (error) {
                console.log('anyNewPlayer error', error);
                next();
              }
            },
            async function (err, x) {
              resolve(data);
            }
          );
        });
      };

      let sitin = roomData.sitin;
      let leavereq = roomData.leavereq;
      console.log('PLAYER DATA BEFORE ', JSON.stringify(playerData));
      each(
        playerData,
        async function (el, next) {
          try {
            console.log({ PLAYERRESULT: JSON.stringify(el) });
            let uid;
            if (roomData.runninground === 0) {
              uid = el.userid;
            } else {
              uid = el.id;
            }
            // let hands = el.hands.filter(
            //   (hand) =>
            //     hand.action !== 'game-lose' && hand.action !== 'game-win'
            // );
            let buyinchips = 0;
            let stripeBuy = el.hands;
            let haveBuyin = buyin.filter(
              (e) => e.userid.toString() === uid.toString() && !e.redeem
            );
            if (haveBuyin.length) {
              haveBuyin.forEach((x) => {
                buyinchips += parseInt(x.chips);
                x.redeem = 1;

                stripeBuy.push({
                  action: 'buy-coins',
                  amount: x.chips,
                  date: new Date(),
                  isWatcher: false,
                  usd: x.usd,
                  payMethod: x.payMethod,
                  cardNr: x.cardNr,
                });
              });
            }

            if (!el.playing) {
              const havePlayer = sitin.filter(
                (el) => el.toString() === uid.toString()
              );
              if (havePlayer.length) {
                el.playing = true;
                sitin = sitin.filter((el) => el.toString() !== uid.toString());
              }
            }
            const haveleave = leavereq.filter(
              (el) => el.toString() === uid.toString()
            );
            if (haveleave.length) {
              leavereq = leavereq.filter(
                (el) => el.toString() !== uid.toString()
              );
            } else {
              newHandPlayer.push({
                userid: uid,
                name: el.name,
                photoURI: el.photoURI,
                wallet: el.wallet + buyinchips,
                position: el.position,
                timebank: el.timebank,
                playing: el.playing,
                missedSmallBlind: el.missedSmallBlind,
                missedBigBlind: el.missedBigBlind,
                forceBigBlind: el.forceBigBlind,
                initialCoinBeforeStart: el.initialCoinBeforeStart,
                gameJoinedAt: el.gameJoinedAt,
                hands: stripeBuy,
                meetingToken: el.meetingToken,
                items: el.items,
              });
            }
            next();
          } catch (error) {
            console.log('Error in player data', error);
            next();
          }
        },
        async function (err, transformedItems) {
          //Success callback
          try {
            newHandPlayer = await anyNewPlayer(newHandPlayer, roomData.players);
            const upRoom = await roomModel.findOneAndUpdate(
              {
                _id: roomid,
              },
              {
                players: newHandPlayer,
                eleminated: [],
                preflopround: [],
                flopround: [],
                turnround: [],
                riverround: [],
                showdown: [],
                pot: 0,
                communityCard: [],
                runninground: 0,
                gamestart: false,
                isGameRunning: false,
                smallBlind: smallBlindAmt,
                bigBlind: bigBlindAmt,
                smallBlindPosition: roomData.smallBlindPosition,
                bigBlindPosition: roomData.bigBlindPosition,
                dealerPosition: roomData.dealerPosition,
                raisePlayerPosition: null,
                raiseAmount: 0,
                timerPlayer: null,
                lastAction: null,
                winnerPlayer: [],
                sidePots: [],
                isShowdown: false,
                isCircleCompleted: false,
                allinPlayers: [],
                tournament: roomData.tournament,
                buyin: buyin,
                sitin: sitin,
                leavereq: leavereq,
              },
              {
                new: true,
              }
            );
            // io.in(upRoom._id.toString()).emit('newhand', { updatedRoom: upRoom });
            resolve();
          } catch (error) {
            console.log('Error in transformedItems', err);
            resolve();
          }
        }
      );
    } catch (err) {
      console.log('error', err);
      reject();
    }
  });
};

export const elemination = async (roomid, io) => {
  const roomData = await roomModel
    .findOne({ _id: roomid })
    .populate('tournament');
  const roomhistoryData = new roomHistoryModel({
    roomId: roomData._id,
    data: roomData,
  });
  const savedHistory = await roomhistoryData.save();

  let eleminated_players = roomData.eleminated;
  let noOfElemination = 0;
  let newHandPlayer = [];
  let showDown = roomData.showdown;
  const bigBlindAmt = roomData.bigBlind;
  const smallBlindAmt = roomData.smallBlind;
  showDown.forEach((el) => {
    if (el.wallet <= 0) {
      noOfElemination++;
      eleminated_players.push({
        userid: el.id,
        name: el.name,
        photoURI: el.photoURI,
        wallet: el.wallet,
        position: el.position,
        timebank: el.timebank,
        stats: el.stats,
        hands: el.hands,
        meetingToken: el.meetingToken,
      });
    } else {
      newHandPlayer.push({
        userid: el.id,
        name: el.name,
        photoURI: el.photoURI,
        wallet: el.wallet,
        position: el.position,
        timebank: el.timebank,
        stats: el.stats,
        hands: el.hands,
        meetingToken: el.meetingToken,
      });
    }
  });

  if (eleminated_players.length === 0) {
    eleminated_players = roomData.eleminated;
  }

  const upRoom = await roomModel.findOneAndUpdate(
    {
      _id: roomid,
    },
    {
      players: newHandPlayer,
      eleminated: eleminated_players,
      preflopround: [],
      flopround: [],
      turnround: [],
      riverround: [],
      showdown: [],
      pot: 0,
      communityCard: [],
      runninground: 0,
      gamestart: false,
      isGameRunning: false,
      smallBlind: smallBlindAmt,
      bigBlind: bigBlindAmt,
      smallBlindPosition: roomData.smallBlindPosition,
      bigBlindPosition: roomData.bigBlindPosition,
      dealerPosition: roomData.dealerPosition,
      raisePlayerPosition: null,
      raiseAmount: 0,
      timerPlayer: null,
      lastAction: null,
      winnerPlayer: [],
      sidePots: [],
      isShowdown: false,
      isCircleCompleted: false,
      allinPlayers: [],
      tournament: roomData.tournament,
    },
    {
      new: true,
    }
  );

  io.in(upRoom._id.toString()).emit('newhand', { updatedRoom: upRoom });

  setTimeout(() => {
    preflopround(upRoom, io);
  }, 2000);
};

export const doPauseGame = async (data, io, socket) => {
  const userid = data.userid;
  let roomid = data.roomid;
  const { isValid } = checkIfEmpty({ roomid, userid });
  try {
    if (isValid) {
      const updatedData = await roomModel.findOneAndUpdate(
        { _id: roomid, hostId: userid },
        { pause: true },
        { new: true }
      );
      io.in(updatedData._id.toString()).emit('roomPaused', {
        pause: updatedData.pause,
      });
    } else {
      socket.emit('actionError', { code: 400, msg: 'Bad request' });
    }
  } catch (e) {
    console.log('error : ', e);
    socket.emit('actionError', { code: 444, msg: 'Some error has occured.' });
  }
};

export const doFinishGame = async (data, io, socket) => {
  console.log('doFinishGame API called ');
  const userid = convertMongoId(data.userid);
  let roomid = convertMongoId(data.roomid);
  const { isValid } = checkIfEmpty({ roomid });
  try {
    if (isValid) {
      const roomData = await roomModel.findOne({ _id: roomid });
      if (!roomData.finish) {
        const updatedData = await roomModel.findOneAndUpdate(
          { _id: roomid },
          { finish: true },
          { new: true }
        );
        let msg = '';
        if (updatedData.runninground === 0) {
          msg = 'Host initiated to finish this game';
        } else {
          msg =
            'Host initiated to finish this game, So you will see all stats after this hand';
        }

        if (updatedData.runninground === 0) {
          await finishedTableGame(updatedData, userid);
        }
        io.in(updatedData._id.toString()).emit('roomFinished', {
          msg: msg,
          finish: updatedData.finish,
          roomdata: updatedData,
        });
      } else {
        await finishedTableGame(roomData, userid);
        if (socket)
          socket.emit('actionError', { code: 400, msg: 'Bad request' });
      }
    }
  } catch (e) {
    console.log('error : ', e);
    if (socket)
      socket.emit('actionError', { code: 444, msg: 'Some error has occured.' });
  }
};

export const doResumeGame = async (data, io, socket) => {
  console.log('doResumeGame API called ');
  const userid = data.userid;
  let roomid = data.roomid;
  const { isValid } = checkIfEmpty({ roomid, userid });
  try {
    if (isValid) {
      const updatedData = await roomModel.findOneAndUpdate(
        { _id: roomid, hostId: userid },
        { pause: false },
        { new: true }
      );
      io.in(updatedData._id.toString()).emit('roomResume', {
        pause: updatedData.pause,
      });
    } else {
      socket.emit('actionError', { code: 400, msg: 'Bad request' });
    }
  } catch (e) {
    console.log('error : ', e);
    socket.emit('actionError', { code: 444, msg: 'Some error has occured.' });
  }
};

export const doSitOut = async (data, io, socket) => {
  console.log('doSitOut API called ');
  const userid = convertMongoId(data.userId);
  let tableId = convertMongoId(data.tableId);
  let roomid;
  console.log({ tableId, userid });
  const { isValid } = checkIfEmpty({ tableId, userid });
  let playingPlayer = [];
  let res = true;
  try {
    console.log({ isValid });
    if (isValid) {
      const roomData = await roomModel
        .findOne({
          _id: tableId,
          'players.userid': userid,
        })
        .lean();
      if (roomData) {
        console.log('IN FOLD', { userid });
        let lastAction = 'fold';
        if (roomData && roomData.lastAction === 'check') {
          lastAction = 'check';
        }
        let updatedData = roomData;
        roomid = roomData._id;
        const sitin = roomData.sitin.filter(
          (el) => el.toString() !== userid.toString()
        );
        let sitOut = roomData.sitOut;
        switch (roomData.runninground) {
          case 0:
            sitOut.push(
              roomData.players.find(
                (el) => el.userid.toString() === userid.toString()
              )
            );
            updatedData = await roomModel.findOneAndUpdate(
              {
                _id: roomid,
                'players.userid': userid,
              },
              {
                'players.$.playing': false,
                'players.$.forceBigBlind': true,
                sitin: sitin,
              },
              { new: true }
            );

            io.in(updatedData._id.toString()).emit('notification', {
              id: userid,
              action: 'SitOut',
              msg: '',
            });
            if (socket) socket.emit('sitInOut', { updatedRoom: updatedData });
            break;

          case 1:
            sitOut.push(
              roomData.preflopround.find(
                (el) => el.id.toString() === userid.toString()
              )
            );
            updatedData = await roomModel.findOneAndUpdate(
              {
                _id: roomid,
                'preflopround.id': userid,
              },
              {
                'preflopround.$.playing': false,
                'preflopround.$.forceBigBlind': true,
                'preflopround.$.fold': true,
                sitin: sitin,
              },
              { new: true }
            );

            updatedData.preflopround.forEach((el) => {
              if (!el.fold && el.wallet > 0 && el.playing) {
                playingPlayer.push({ id: el.id, position: el.position });
              }
            });
            if (playingPlayer.length === 1) {
              updatedData = await roomModel.findOneAndUpdate(
                {
                  _id: roomid,
                },
                {
                  runninground: 5,
                },
                {
                  new: true,
                }
              );

              await winnerBeforeShowdown(
                roomid,
                playingPlayer[0].id,
                roomData.runninground,
                io
              );
              res = false;
            }
            io.in(updatedData._id.toString()).emit('notification', {
              id: userid,
              action: 'SitOut',
            });
            if (socket) {
              socket.emit('sitInOut', { updatedRoom: updatedData });
            }
            return res;

          case 2:
            sitOut.push(
              roomData.flopround.find(
                (el) => el.id.toString() === userid.toString()
              )
            );
            updatedData = await roomModel.findOneAndUpdate(
              {
                _id: roomid,
                'flopround.id': userid,
              },
              {
                'flopround.$.playing': false,
                'flopround.$.forceBigBlind': true,
                'flopround.$.fold': true,
                sitin: sitin,
              },
              { new: true }
            );

            updatedData.flopround.forEach((el) => {
              if (!el.fold && el.wallet > 0 && el.playing) {
                playingPlayer.push({ id: el.id, position: el.position });
              }
            });
            if (playingPlayer.length === 1) {
              updatedData = await roomModel.findOneAndUpdate(
                {
                  _id: roomid,
                },
                {
                  runninground: 5,
                },
                {
                  new: true,
                }
              );

              await winnerBeforeShowdown(
                roomid,
                playingPlayer[0].id,
                roomData.runninground,
                io
              );
              res = false;
            }
            io.in(updatedData._id.toString()).emit('notification', {
              id: userid,
              action: 'SitOut',
            });
            if (socket) {
              socket.emit('sitInOut', { updatedRoom: updatedData });
            }
            return res;

          case 3:
            sitOut.push(
              roomData.turnround.find(
                (el) => el.id.toString() === userid.toString()
              )
            );
            updatedData = await roomModel.findOneAndUpdate(
              {
                _id: roomid,
                'turnround.id': userid,
              },
              {
                'turnround.$.playing': false,
                'turnround.$.forceBigBlind': true,
                'turnround.$.fold': true,
                sitin: sitin,
              },
              { new: true }
            );

            updatedData.turnround.forEach((el) => {
              if (!el.fold && el.wallet > 0 && el.playing) {
                playingPlayer.push({ id: el.id, position: el.position });
              }
            });
            if (playingPlayer.length === 1) {
              updatedData = await roomModel.findOneAndUpdate(
                {
                  _id: roomid,
                },
                {
                  runninground: 5,
                },
                {
                  new: true,
                }
              );

              await winnerBeforeShowdown(
                roomid,
                playingPlayer[0].id,
                roomData.runninground,
                io
              );
              res = false;
            }
            io.in(updatedData._id.toString()).emit('notification', {
              id: userid,
              action: 'SitOut',
            });
            if (socket) {
              socket.emit('sitInOut', { updatedRoom: updatedData });
            }
            return res;

          case 4:
            sitOut.push(
              roomData.riverround.find(
                (el) => el.id.toString() === userid.toString()
              )
            );
            updatedData = await roomModel.findOneAndUpdate(
              {
                _id: roomid,
                'riverround.id': userid,
              },
              {
                'riverround.$.playing': false,
                'riverround.$.forceBigBlind': true,
                'riverround.$.fold': true,
                sitin: sitin,
              },
              { new: true }
            );

            updatedData.riverround.forEach((el) => {
              if (!el.fold && el.wallet > 0 && el.playing) {
                playingPlayer.push({ id: el.id, position: el.position });
              }
            });
            if (playingPlayer.length === 1) {
              updatedData = await roomModel.findOneAndUpdate(
                {
                  _id: roomid,
                },
                {
                  runninground: 5,
                },
                {
                  new: true,
                }
              );

              await winnerBeforeShowdown(
                roomid,
                playingPlayer[0].id,
                roomData.runninground,
                io
              );
              res = false;
            }
            io.in(updatedData._id.toString()).emit('notification', {
              id: userid,
              action: 'SitOut',
            });
            if (socket) {
              socket.emit('sitInOut', { updatedRoom: updatedData });
            }
            return res;

          case 5:
            sitOut.push(
              roomData.showdown.find(
                (el) => el.id.toString() === userid.toString()
              )
            );
            updatedData = await roomModel.findOneAndUpdate(
              {
                _id: roomid,
                'showdown.id': userid,
              },
              {
                'showdown.$.playing': false,
                'riverround.$.forceBigBlind': true,
                sitin: sitin,
              },
              { new: true }
            );

            io.in(updatedData._id.toString()).emit('notification', {
              id: userid,
              action: 'SitOut',
            });
            if (socket) socket.emit('sitInOut', { updatedRoom: updatedData });
            break;

          default:
            break;
        }
      }
    } else {
      if (socket) socket.emit('actionError', { code: 400, msg: 'Bad request' });
    }
  } catch (e) {
    console.log('error : ', e);
    if (socket)
      socket.emit('actionError', { code: 444, msg: 'Some error has occured.' });
  }
};

export const doSitIn = async (data, io, socket) => {
  console.log('doSitIn API called ');
  const userid = convertMongoId(data.userId);
  let tableId = convertMongoId(data.tableId);
  let roomid;
  const { isValid } = checkIfEmpty({ tableId, userid });
  try {
    if (isValid) {
      const roomdata = await roomModel
        .findOne({
          _id: tableId,
          'players.userid': userid,
        })
        .lean();
      roomid = roomdata._id;
      let sitin = roomdata.sitin;
      sitin.push(userid);
      let sitOut = roomdata.sitOut.filter((el) =>
        el.id ? el.id : el.userid !== userid
      );
      let updatedData;
      if (roomdata.runninground === 0) {
        updatedData = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'players.userid': userid,
          },
          {
            'players.$.playing': true,
            sitin: sitin,
            sitOut,
          },
          { new: true }
        );
      } else {
        updatedData = await roomModel.findOneAndUpdate(
          { _id: roomid },
          { sitin, sitOut },
          { new: true }
        );
      }
      if (socket) socket.emit('sitInOut', { updatedRoom: updatedData });
      io.in(updatedData._id.toString()).emit('notification', {
        id: userid,
        action: 'SitIn',
      });
    } else {
      socket.emit('actionError', { code: 400, msg: 'Bad request' });
    }
  } catch (e) {
    console.log('error : ', e);
    socket.emit('actionError', { code: 444, msg: 'Some error has occured.' });
  }
};

export const doLeaveTable = async (data, io, socket) => {
  console.log('doLeaveTable API called ');
  const userid = convertMongoId(data.userId);
  let tableId = convertMongoId(data.tableId);
  let roomid;

  const { isValid } = checkIfEmpty({ tableId, userid });
  try {
    if (isValid) {
      console.log({ isValid });
      let roomdata = await roomModel
        .findOneAndUpdate(
          {
            _id: tableId,
            'players.userid': userid,
          },
          { 'players.$.playing': false },
          { new: true }
        )
        .lean();
      if (roomdata) {
        console.log('IN ROOM DATA');
        roomid = roomdata._id;
        if (roomdata.hostId.toString() === userid.toString()) {
          console.log({
            hostId: roomdata.hostId.toString(),
            userid: userid.toString(),
          });
          let p = roomdata.players.filter(
            (ele) => ele.userid.toString() !== userid.toString()
          )[0];
          console.log({
            p,
          });
          if (p) {
            console.log('In P');
            roomdata.players
              .filter((ele) => ele.userid.toString() !== userid.toString())
              .forEach((pl) => {
                if (p.wallet < pl.wallet) {
                  p = pl;
                }
              });
            console.log({ p });
            roomdata = await roomModel.findOneAndUpdate(
              { _id: tableId },
              { hostId: p.userid },
              { new: true }
            );
            io.in(roomdata._id.toString()).emit('adminLeave', {
              userId: p.userid,
              name: p.name,
            });
          }
        }
        await doSitOut(data, io, socket);
        if (
          roomdata.players.filter((ele) => ele.playing).length ||
          data.isWatcher
        ) {
          await leaveApiCall(roomdata, userid);
        } else {
          await doFinishGame(
            { roomid: roomdata._id, userid: userid },
            io,
            socket
          );
        }
        let leavereq = roomdata.leavereq;
        leavereq.push(userid);

        const updatedData = await roomModel.findOneAndUpdate(
          { _id: roomid },
          { leavereq },
          { new: true }
        );
        let playerdata = roomdata.players.filter(
          (el) => el.userid.toString() === userid.toString()
        );
        if (updatedData)
          io.in(updatedData._id.toString()).emit('playerleft', {
            msg: `${playerdata[0].name} has left the game`,
          });
      } else {
        console.log('IN THE ELSE BLOCK');
        let roomdata = await roomModel
          .findOne({
            _id: tableId,
          })
          .lean();
        // if (roomdata && !roomdata.players.find((el) => el.userid === userid)) {
        //   updateInGameStatus(userid);
        // }
      }
    } else {
      console.log('BEFORE ERROR ACTION');
      if (socket) socket.emit('actionError', { code: 400, msg: 'Bad request' });
    }
  } catch (e) {
    console.log('error : ', e);
    if (socket)
      socket.emit('actionError', { code: 444, msg: 'Some error has occured.' });
  }
};

export const doFold = async (roomid, playerid, io) => {
  console.log('----doFold-----');
  const roomData = await roomModel.findOne({ _id: roomid });
  let updatedRoom = null;
  let playingPlayer = [];
  let res = true;
  let filterData = null;
  let lastAction = 'fold';
  if (roomData.lastAction === 'check') {
    lastAction = 'check';
  }
  if (
    roomData.timerPlayer &&
    roomData.timerPlayer.toString() === playerid.toString()
  ) {
    switch (roomData.runninground) {
      case 1:
        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'preflopround.id': playerid,
          },
          {
            'preflopround.$.fold': true,
            lastAction: lastAction,
          },
          {
            new: true,
          }
        );
        filterData = updatedRoom.preflopround.filter(
          (el) => el.id.toString() === playerid.toString()
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'fold',
        });
        io.in(updatedRoom._id.toString()).emit('fold', { updatedRoom });

        updatedRoom.preflopround.forEach((el) => {
          if (!el.fold && el.wallet > 0 && el.playing) {
            playingPlayer.push({ id: el.id, position: el.position });
          }
        });
        if (playingPlayer.length === 1) {
          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              runninground: 5,
            },
            {
              new: true,
            }
          );

          await winnerBeforeShowdown(
            roomid,
            playingPlayer[0].id,
            roomData.runninground,
            io
          );
          res = false;
        }
        return res;

      case 2:
        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'flopround.id': playerid,
          },
          {
            'flopround.$.fold': true,
            lastAction: lastAction,
          },
          {
            new: true,
          }
        );

        filterData = updatedRoom.preflopround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        // io.in(roomid).emit('fold',{userid:playerid,position:filterData[0].position})
        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'fold',
        });
        io.in(updatedRoom._id.toString()).emit('fold', { updatedRoom });

        updatedRoom.flopround.forEach((el) => {
          if (!el.fold && el.wallet > 0 && el.playing) {
            playingPlayer.push({ id: el.id, position: el.position });
          }
        });
        if (playingPlayer.length === 1) {
          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              runninground: 5,
            },
            {
              new: true,
            }
          );

          await winnerBeforeShowdown(
            roomid,
            playingPlayer[0].id,
            roomData.runninground,
            io
          );
          res = false;
        }
        return res;

      case 3:
        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'turnround.id': playerid,
          },
          {
            'turnround.$.fold': true,
            lastAction: lastAction,
          },
          {
            new: true,
          }
        );
        filterData = updatedRoom.preflopround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        // io.in(roomid).emit('fold',{userid:playerid,position:filterData[0].position})
        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'fold',
        });
        io.in(updatedRoom._id.toString()).emit('fold', { updatedRoom });

        updatedRoom.turnround.forEach((el) => {
          if (!el.fold && el.wallet > 0 && el.playing) {
            playingPlayer.push({ id: el.id, position: el.position });
          }
        });
        if (playingPlayer.length === 1) {
          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              runninground: 5,
            },
            {
              new: true,
            }
          );

          await winnerBeforeShowdown(
            roomid,
            playingPlayer[0].id,
            roomData.runninground,
            io
          );
          res = false;
        }
        return res;

      case 4:
        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'riverround.id': playerid,
          },
          {
            'riverround.$.fold': true,
            lastAction: lastAction,
          },
          {
            new: true,
          }
        );

        filterData = updatedRoom.preflopround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        // io.in(roomid).emit('fold',{userid:playerid,position:filterData[0].position})
        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'fold',
        });
        io.in(updatedRoom._id.toString()).emit('fold', { updatedRoom });

        updatedRoom.riverround.forEach((el) => {
          if (!el.fold && el.wallet > 0 && el.playing) {
            playingPlayer.push({ id: el.id, position: el.position });
          }
        });
        if (playingPlayer.length === 1) {
          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              runninground: 5,
            },
            {
              new: true,
            }
          );

          await winnerBeforeShowdown(
            roomid,
            playingPlayer[0].id,
            roomData.runninground,
            io
          );
          res = false;
        }
        return res;
    }
  }
};

export const socketDoFold = async (dta, io, socket) => {
  const userid = convertMongoId(dta.userid);
  let roomid = convertMongoId(dta.roomid);

  const { isValid } = checkIfEmpty({ roomid, userid });

  try {
    if (isValid) {
      let playerid = userid;

      const data = await roomModel
        .findOne(
          {
            _id: roomid,
            'players.userid': playerid,
          },
          { _id: 1 }
        )
        .lean();

      if (data !== null) {
        await doFold(roomid, playerid, io);
      } else {
        socket.emit('actionError', { code: 400, msg: 'Data not found' });
      }
    } else {
      socket.emit('actionError', { code: 400, msg: 'Bad request' });
    }
  } catch (e) {
    console.log('error : ', e);
    socket.emit('actionError', { code: 444, msg: 'Some error has occured.' });
  }
};

export const doCall = async (roomid, playerid, io, amt) => {
  const roomData = await roomModel.findOne({ _id: roomid });
  let updatedRoom = null;
  let res = true;
  let filterData = null;
  let roundData = null;

  const filterDta = roomData.players.filter(
    (el) => el.userid.toString() === roomData.timerPlayer.toString()
  );

  if (roomData.timerPlayer.toString() === playerid.toString()) {
    switch (roomData.runninground) {
      case 1:
        roundData = roomData.preflopround.filter(
          (el) => el.id.toString() === playerid.toString()
        );

        amt = amt - roundData[0].pot;

        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'preflopround.id': playerid,
          },
          {
            $inc: {
              'preflopround.$.wallet': -amt,
              'preflopround.$.pot': +amt,
            },
            'preflopround.$.action': true,
            'preflopround.$.actionType': 'call',
            lastAction: 'call',
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'call',
        });
        io.in(updatedRoom._id.toString()).emit('call', { updatedRoom });

        break;

      case 2:
        roundData = roomData.flopround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        amt = amt - roundData[0].pot;

        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'flopround.id': playerid,
          },
          {
            $inc: {
              'flopround.$.wallet': -amt,
              'flopround.$.pot': +amt,
            },
            'flopround.$.action': true,
            'flopround.$.actionType': 'call',
            lastAction: 'call',
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'call',
        });
        io.in(updatedRoom._id.toString()).emit('call', { updatedRoom });

        break;
      case 3:
        roundData = roomData.turnround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        amt = amt - roundData[0].pot;

        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'turnround.id': playerid,
          },
          {
            $inc: {
              'turnround.$.wallet': -amt,
              'turnround.$.pot': +amt,
            },
            'turnround.$.action': true,
            'turnround.$.actionType': 'call',
            lastAction: 'call',
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'call',
        });
        io.in(updatedRoom._id.toString()).emit('call', { updatedRoom });

        return res;

      case 4:
        roundData = roomData.riverround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        amt = amt - roundData[0].pot;

        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'riverround.id': playerid,
          },
          {
            $inc: {
              'riverround.$.wallet': -amt,
              'riverround.$.pot': +amt,
            },
            'riverround.$.action': true,
            'riverround.$.actionType': 'call',
            lastAction: 'call',
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'call',
        });
        io.in(updatedRoom._id.toString()).emit('call', { updatedRoom });

        break;
    }
  }
};

export const socketDoCall = async (dta, io, socket) => {
  let userid = dta.userid;
  let roomid = dta.roomid;

  const { isValid } = checkIfEmpty({ roomid, userid, amt: dta.amount });

  try {
    if (isValid) {
      roomid = mongoose.Types.ObjectId(roomid);
      let playerid = mongoose.Types.ObjectId(userid);
      let amt = dta.amount;
      console.log({ roomid, playerid, amt });
      const data = await roomModel
        .findOne(
          {
            _id: roomid,
            'players.userid': playerid,
          },
          { _id: 1, raiseAmount: 1 }
        )
        .lean();
      console.log({ data });
      if (data !== null) {
        if (data.raiseAmount == amt) {
          const walletAmt = await getPlayerwallet(roomid, playerid);
          console.log({ walletAmt });
          if (walletAmt >= amt) {
            await doCall(roomid, playerid, io, amt);
          } else {
            console.log('actionError 0');
            socket.emit('actionError', {
              code: 400,
              msg: 'Insufficient chips',
            });
          }
        } else {
          console.log('actionError 1');
          socket.emit('actionError', {
            code: 400,
            msg: `Call amount must be ${data.raiseAmount}`,
          });
        }
      } else {
        console.log('actionError 2');
        socket.emit('actionError', { code: 404, msg: 'Data not found' });
      }
    } else {
      console.log('actionError 3');
      socket.emit('actionError', { code: 400, msg: 'Bad request' });
    }
  } catch (e) {
    console.log('actionError 4');
    console.log('error : ', e);
    socket.emit('actionError', { code: 444, msg: 'Some error has occured.' });
  }
};

export const doBet = async (roomid, playerid, io, amt) => {
  const roomData = await roomModel.findOne({ _id: roomid });
  let updatedRoom = null;
  let res = true;
  let filterData = null;
  let roundData = null;

  const filterDta = roomData.players.filter(
    (el) => el.userid.toString() === roomData.timerPlayer.toString()
  );

  if (roomData.timerPlayer.toString() === playerid.toString()) {
    switch (roomData.runninground) {
      case 2:
        roundData = roomData.flopround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        amt = amt - roundData[0].pot;

        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'flopround.id': playerid,
          },
          {
            $inc: {
              'flopround.$.wallet': -amt,
              'flopround.$.pot': +amt,
            },
            'flopround.$.action': true,
            'flopround.$.actionType': 'bet',

            raisePlayerPosition: filterDta[0].position,
            raiseAmount: amt + roundData[0].pot,
            lastAction: 'bet',
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'bet',
        });
        io.in(updatedRoom._id.toString()).emit('bet', { updatedRoom });

        break;
      case 3:
        roundData = roomData.turnround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        amt = amt - roundData[0].pot;

        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'turnround.id': playerid,
          },
          {
            $inc: {
              'turnround.$.wallet': -amt,
              'turnround.$.pot': +amt,
            },
            'turnround.$.action': true,
            'turnround.$.actionType': 'bet',

            raisePlayerPosition: filterDta[0].position,
            raiseAmount: amt + roundData[0].pot,
            lastAction: 'bet',
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'bet',
        });
        io.in(updatedRoom._id.toString()).emit('bet', { updatedRoom });

        return res;

      case 4:
        roundData = roomData.riverround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        amt = amt - roundData[0].pot;

        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'riverround.id': playerid,
          },
          {
            $inc: {
              'riverround.$.wallet': -amt,
              'riverround.$.pot': +amt,
            },
            'riverround.$.action': true,
            'riverround.$.actionType': 'bet',

            raisePlayerPosition: filterDta[0].position,
            raiseAmount: amt + roundData[0].pot,
            lastAction: 'bet',
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'bet',
        });
        io.in(updatedRoom._id.toString()).emit('bet', { updatedRoom });

        break;
    }
  }
};

export const socketDoBet = async (dta, io, socket) => {
  let userid = convertMongoId(dta.userid);
  let roomid = convertMongoId(dta.roomid);

  const { isValid } = checkIfEmpty({ roomid, userid, amt: dta.amount });

  try {
    if (isValid) {
      let playerid = userid;
      let amt = dta.amount;
      const data = await roomModel
        .findOne(
          {
            _id: roomid,
            'players.userid': playerid,
          },
          { _id: 1, raiseAmount: 1, bigBlind: 1 }
        )
        .lean();

      if (data !== null) {
        if (data.bigBlind <= amt) {
          const walletAmt = await getPlayerwallet(roomid, playerid);
          if (walletAmt >= amt) {
            await doBet(roomid, playerid, io, amt);
          } else {
            socket.emit('actionError', {
              code: 400,
              msg: 'Insufficient chips',
            });
          }
        } else {
          socket.emit('actionError', {
            code: 400,
            msg: `bet amount must be equal or more than bigblind amount`,
          });
        }
      } else {
        socket.emit('actionError', { code: 404, msg: 'Data not found' });
      }
    } else {
      socket.emit('actionError', { code: 400, msg: 'Bad request' });
    }
  } catch (e) {
    console.log('error : ', e);
    socket.emit('actionError', { code: 444, msg: 'Some error has occured.' });
  }
};

export const doRaise = async (roomid, playerid, io, amt) => {
  const roomData = await roomModel.findOne({ _id: roomid });
  let updatedRoom = null;
  let res = true;
  let filterData = null;
  let newRaiseAmt = null;
  let roundData = null;

  const filterDta = roomData.players.filter(
    (el) => el.userid.toString() === roomData.timerPlayer.toString()
  );

  if (roomData.timerPlayer.toString() === playerid.toString()) {
    switch (roomData.runninground) {
      case 1:
        roundData = roomData.preflopround.filter(
          (el) => el.id.toString() === playerid.toString()
        );

        amt = amt - roundData[0].pot;

        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'preflopround.id': playerid,
          },
          {
            $inc: {
              'preflopround.$.wallet': -amt,
              'preflopround.$.pot': +amt,
            },
            'preflopround.$.action': true,
            'preflopround.$.actionType': 'raise',

            raisePlayerPosition: roundData[0].position,
            raiseAmount: amt + roundData[0].pot,
            lastAction: 'raise',
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'raise',
        });
        io.in(updatedRoom._id.toString()).emit('raise', { updatedRoom });

        break;

      case 2:
        roundData = roomData.flopround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        amt = amt - roundData[0].pot;

        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'flopround.id': playerid,
          },
          {
            $inc: {
              'flopround.$.wallet': -amt,
              'flopround.$.pot': +amt,
            },
            'flopround.$.action': true,
            'flopround.$.actionType': 'raise',

            raisePlayerPosition: roundData[0].position,
            raiseAmount: amt + roundData[0].pot,
            lastAction: 'raise',
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'raise',
        });
        io.in(updatedRoom._id.toString()).emit('raise', { updatedRoom });

        break;
      case 3:
        roundData = roomData.turnround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        amt = amt - roundData[0].pot;

        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'turnround.id': playerid,
          },
          {
            $inc: {
              'turnround.$.wallet': -amt,
              'turnround.$.pot': +amt,
            },
            'turnround.$.action': true,
            'turnround.$.actionType': 'raise',

            raisePlayerPosition: roundData[0].position,
            raiseAmount: amt + roundData[0].pot,
            lastAction: 'raise',
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'raise',
        });
        io.in(updatedRoom._id.toString()).emit('raise', { updatedRoom });

        return res;

      case 4:
        roundData = roomData.riverround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        amt = amt - roundData[0].pot;

        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'riverround.id': playerid,
          },
          {
            $inc: {
              'riverround.$.wallet': -amt,
              'riverround.$.pot': +amt,
            },
            'riverround.$.action': true,
            'riverround.$.actionType': 'raise',

            raisePlayerPosition: roundData[0].position,
            raiseAmount: amt + roundData[0].pot,
            lastAction: 'raise',
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'raise',
        });
        io.in(updatedRoom._id.toString()).emit('raise', { updatedRoom });

        break;
    }
  }
};

export const socketDoRaise = async (dta, io, socket) => {
  let userid = convertMongoId(dta.userid);
  let roomid = convertMongoId(dta.roomid);

  const { isValid } = checkIfEmpty({ roomid, userid, amt: dta.amount });

  try {
    if (isValid) {
      roomid = mongoose.Types.ObjectId(roomid);
      let playerid = userid;
      let amt = dta.amount;

      console.log({ playerid, amt, roomid });

      const data = await roomModel
        .findOne(
          {
            _id: roomid,
            'players.userid': playerid,
          },
          { _id: 1, raiseAmount: 1 }
        )
        .lean();

      console.log({ data });

      if (data !== null) {
        if (data.raiseAmount * 2 <= amt) {
          const walletAmt = await getPlayerwallet(roomid, playerid);
          if (walletAmt >= amt) {
            await doRaise(roomid, playerid, io, amt);
          } else {
            socket.emit('actionError', {
              code: 400,
              msg: 'Insufficient chips',
            });
          }
        } else {
          socket.emit('actionError', {
            code: 400,
            msg: `Raise amount must be minimum ${data.raiseAmount * 2}`,
          });
        }
      } else {
        socket.emit('actionError', { code: 404, msg: 'Data not found' });
      }
    } else {
      socket.emit('actionError', { code: 400, msg: 'Bad request' });
    }
  } catch (e) {
    console.log('error : ', e);
    socket.emit('actionError', { code: 444, msg: 'Some error has occured.' });
  }
};

export const doCheck = async (roomid, playerid, io) => {
  const roomData = await roomModel.findOne({ _id: roomid });
  let updatedRoom = null;
  let res = true;
  let filterData = null;

  console.log('TIMER -------- ', roomData.timerPlayer);

  const filterDta = roomData.players.filter(
    (el) => el.userid.toString() === roomData.timerPlayer.toString()
  );

  if (roomData.timerPlayer.toString() === playerid.toString()) {
    switch (roomData.runninground) {
      case 1:
        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'preflopround.id': convertMongoId(playerid),
          },
          {
            'preflopround.$.action': true,
            'preflopround.$.actionType': 'check',
            lastAction: 'check',
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'check',
        });
        io.in(updatedRoom._id.toString()).emit('check', { updatedRoom });

        break;

      case 2:
        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'flopround.id': convertMongoId(playerid),
          },
          {
            'flopround.$.action': true,
            'flopround.$.actionType': 'check',
            lastAction: 'check',
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'Check',
        });
        io.in(updatedRoom._id.toString()).emit('check', { updatedRoom });

        break;
      case 3:
        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'turnround.id': convertMongoId(playerid),
          },
          {
            'turnround.$.action': true,
            'turnround.$.actionType': 'check',
            lastAction: 'check',
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'check',
        });
        io.in(updatedRoom._id.toString()).emit('check', { updatedRoom });

        return res;

      case 4:
        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'riverround.id': convertMongoId(playerid),
          },
          {
            'riverround.$.action': true,
            'riverround.$.actionType': 'check',
            lastAction: 'check',
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'check',
        });
        io.in(updatedRoom._id.toString()).emit('check', { updatedRoom });

        break;
    }
  }
};

export const socketDoCheck = async (dta, io, socket) => {
  let userid = dta.userid;
  let roomid = convertMongoId(dta.roomid);

  const { isValid } = checkIfEmpty({ roomid, userid });

  try {
    if (isValid) {
      roomid = roomid;
      let playerid = userid;
      const data = await roomModel
        .findOne(
          {
            _id: roomid,
            'players.userid': convertMongoId(playerid),
          },
          { _id: 1, raiseAmount: 1, lastAction: 1 }
        )
        .lean();
      console.log({ data });
      if (data !== null) {
        await doCheck(roomid, playerid, io);
      } else {
        console.log('DATA IS NULL IN ELSE BLOCK');
        socket.emit('actionError', { code: 404, msg: 'Data not found' });
      }
    } else {
      console.log('DATA IS NULL IN BAD REQUEST');
      socket.emit('actionError', { code: 400, msg: 'Bad request' });
    }
  } catch (e) {
    console.log('error : ', e);
    socket.emit('actionError', { code: 444, msg: 'Some error has occured.' });
  }
};

export const doAllin = async (roomid, playerid, io) => {
  const roomData = await roomModel.findOne({ _id: roomid });
  let updatedRoom = null;
  let res = true;
  let roundData = null;
  let raiseAmount = roomData.raiseAmount;
  let raisePlayerPosition = roomData.raisePlayerPosition;
  let allinPlayer = roomData.allinPlayers;

  const filterDta = roomData.players.filter(
    (el) => el.userid.toString() === roomData.timerPlayer.toString()
  );
  if (roomData.timerPlayer.toString() === playerid.toString()) {
    switch (roomData.runninground) {
      case 1:
        roundData = roomData.preflopround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        // amt = amt-roundData[0].pot
        if (roundData[0].wallet + roundData[0].pot > roomData.raiseAmount) {
          raiseAmount = roundData[0].wallet + roundData[0].pot;
          raisePlayerPosition = roundData[0].position;
        }
        allinPlayer.push({
          id: playerid,
          amt: roundData[0].wallet + roundData[0].pot,
          wallet: roundData[0].wallet,
          round: roomData.runninground,
        });

        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'preflopround.id': playerid,
          },
          {
            $inc: {
              'preflopround.$.wallet': -roundData[0].wallet,
              'preflopround.$.pot': +roundData[0].wallet,
            },
            'preflopround.$.action': true,
            'preflopround.$.actionType': 'all-in',

            raisePlayerPosition: raisePlayerPosition,
            raiseAmount: raiseAmount,
            lastAction: 'all-in',
            allinPlayers: allinPlayer,
          },
          {
            new: true,
          }
        );
        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'all-in',
        });
        io.in(updatedRoom._id.toString()).emit('allin', { updatedRoom });

        break;

      case 2:
        roundData = roomData.flopround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        if (roundData[0].wallet + roundData[0].pot > roomData.raiseAmount) {
          raiseAmount = roundData[0].wallet + roundData[0].pot;
          raisePlayerPosition = roundData[0].position;
        }
        allinPlayer.push({
          id: playerid,
          amt: roundData[0].wallet + roundData[0].pot,
          round: roomData.runninground,
          wallet: roundData[0].wallet,
        });
        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'flopround.id': playerid,
          },
          {
            $inc: {
              'flopround.$.wallet': -roundData[0].wallet,
              'flopround.$.pot': +roundData[0].wallet,
            },
            'flopround.$.action': true,
            'flopround.$.actionType': 'all-in',

            raisePlayerPosition: raisePlayerPosition,
            raiseAmount: raiseAmount,
            lastAction: 'all-in',
            allinPlayers: allinPlayer,
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'all-in',
        });
        io.in(updatedRoom._id.toString()).emit('allin', { updatedRoom });

        break;
      case 3:
        roundData = roomData.turnround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        if (roundData[0].wallet + roundData[0].pot > roomData.raiseAmount) {
          raiseAmount = roundData[0].wallet + roundData[0].pot;
          raisePlayerPosition = roundData[0].position;
        }
        allinPlayer.push({
          id: playerid,
          amt: roundData[0].wallet + roundData[0].pot,
          round: roomData.runninground,
          wallet: roundData[0].wallet,
        });
        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'turnround.id': playerid,
          },
          {
            $inc: {
              'turnround.$.wallet': -roundData[0].wallet,
              'turnround.$.pot': +roundData[0].wallet,
            },
            'turnround.$.action': true,
            'turnround.$.actionType': 'all-in',

            raisePlayerPosition: raisePlayerPosition,
            raiseAmount: raiseAmount,
            lastAction: 'all-in',
            allinPlayers: allinPlayer,
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'all-in',
        });
        io.in(updatedRoom._id.toString()).emit('allin', { updatedRoom });

        break;
      case 4:
        roundData = roomData.riverround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        if (roundData[0].wallet + roundData[0].pot > roomData.raiseAmount) {
          raiseAmount = roundData[0].wallet + roundData[0].pot;
          raisePlayerPosition = roundData[0].position;
        }
        allinPlayer.push({
          id: playerid,
          amt: roundData[0].wallet + roundData[0].pot,
          round: roomData.runninground,
          wallet: roundData[0].wallet,
        });
        updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: roomid,
            'riverround.id': playerid,
          },
          {
            $inc: {
              'riverround.$.wallet': -roundData[0].wallet,
              'riverround.$.pot': +roundData[0].wallet,
            },
            'riverround.$.action': true,
            'riverround.$.actionType': 'all-in',

            raisePlayerPosition: raisePlayerPosition,
            raiseAmount: raiseAmount,
            lastAction: 'all-in',
            allinPlayers: allinPlayer,
          },
          {
            new: true,
          }
        );

        io.in(updatedRoom._id.toString()).emit('actionperformed', {
          id: playerid,
          action: 'all-in',
        });
        io.in(updatedRoom._id.toString()).emit('allin', { updatedRoom });

        break;
    }
  }
};

export const socketDoAllin = async (dta, io, socket) => {
  let userid = dta.userid;
  let roomid = dta.roomid;

  const { isValid } = checkIfEmpty({ roomid, userid });

  try {
    if (isValid) {
      roomid = mongoose.Types.ObjectId(roomid);
      let playerid = userid;
      // let amt  = body.amount;
      const data = await roomModel
        .findOne(
          {
            _id: roomid,
            'players.userid': playerid,
          },
          { _id: 1, raiseAmount: 1 }
        )
        .lean();

      if (data !== null) {
        await doAllin(roomid, playerid, io);
      } else {
        socket.emit('actionError', { code: 404, msg: 'Data not found' });
      }
    } else {
      socket.emit('actionError', { code: 400, msg: 'Bad request' });
    }
  } catch (e) {
    console.log('error : ', e);
    socket.emit('actionError', { code: 444, msg: 'Some error has occured.' });
  }
};

const winnerBeforeShowdown = async (roomid, playerid, runninground, io) => {
  const roomData = await roomModel.findOne({ _id: roomid });
  console.log('ROOM DATA PLAYERS ', roomData.players);
  let winnerAmount = 0;
  let showDownPlayers = [];
  let playerData = null;
  let totalPot = roomData.pot;
  switch (runninground) {
    case 1:
      playerData = roomData.preflopround;
      playerData.forEach((e) => {
        winnerAmount += e.pot;
        let p = {
          cards: e.cards,
          id: e.id,
          name: e.name,
          photoURI: e.photoURI,
          wallet: e.wallet,
          fold: e.fold,
          playerchance: 0,
          timebank: e.timebank,
          playing: e.playing,
          action: null,
          actionType: null,
          prevPot: e.prevPot + e.pot,
          pot: 0,
          position: e.position,
          missedBigBlind: e.missedBigBlind,
          missedSmallBlind: e.missedSmallBlind,
          forceBigBlind: e.forceBigBlind,
          missedBilndAmt: 0,
          stats: e.stats,
          hands: e.hands,
          initialCoinBeforeStart: e.initialCoinBeforeStart,
          gameJoinedAt: e.gameJoinedAt,
          meetingToken: e.meetingToken,
          items: e.items,
        };
        showDownPlayers.push(p);
      });
      break;
    case 2:
      playerData = roomData.flopround;
      playerData.forEach((e) => {
        winnerAmount += e.pot;
        let p = {
          cards: e.cards,
          id: e.id,
          name: e.name,
          photoURI: e.photoURI,
          wallet: e.wallet,
          fold: e.fold,
          playerchance: 0,
          timebank: e.timebank,
          playing: e.playing,
          action: null,
          actionType: null,
          prevPot: e.prevPot + e.pot,
          pot: 0,
          position: e.position,
          missedBigBlind: e.missedBigBlind,
          missedSmallBlind: e.missedSmallBlind,
          forceBigBlind: e.forceBigBlind,
          missedBilndAmt: 0,
          stats: e.stats,
          hands: e.hands,
          initialCoinBeforeStart: e.initialCoinBeforeStart,
          gameJoinedAt: e.gameJoinedAt,
          meetingToken: e.meetingToken,
          items: e.items,
        };
        showDownPlayers.push(p);
      });
      break;
    case 3:
      playerData = roomData.turnround;
      playerData.forEach((e) => {
        winnerAmount += e.pot;
        let p = {
          cards: e.cards,
          id: e.id,
          name: e.name,
          photoURI: e.photoURI,
          wallet: e.wallet,
          fold: e.fold,
          playerchance: 0,
          playing: e.playing,
          timebank: e.timebank,
          action: null,
          actionType: null,
          prevPot: e.prevPot + e.pot,
          pot: 0,
          position: e.position,
          missedBigBlind: e.missedBigBlind,
          missedSmallBlind: e.missedSmallBlind,
          forceBigBlind: e.forceBigBlind,
          missedBilndAmt: 0,
          stats: e.stats,
          hands: e.hands,
          initialCoinBeforeStart: e.initialCoinBeforeStart,
          gameJoinedAt: e.gameJoinedAt,
          meetingToken: e.meetingToken,
          items: e.items,
        };
        showDownPlayers.push(p);
      });
      break;
    case 4:
      playerData = roomData.riverround;
      playerData.forEach((e) => {
        winnerAmount += e.pot;
        let p = {
          cards: e.cards,
          id: e.id,
          name: e.name,
          wallet: e.wallet,
          photoURI: e.photoURI,
          fold: e.fold,
          playerchance: 0,
          playing: e.playing,
          timebank: e.timebank,
          action: null,
          actionType: null,
          prevPot: e.prevPot + e.pot,
          pot: 0,
          position: e.position,
          missedBigBlind: e.missedBigBlind,
          missedSmallBlind: e.missedSmallBlind,
          forceBigBlind: e.forceBigBlind,
          missedBilndAmt: 0,
          stats: e.stats,
          hands: e.hands,
          initialCoinBeforeStart: e.initialCoinBeforeStart,
          gameJoinedAt: e.gameJoinedAt,
          meetingToken: e.meetingToken,
          items: e.items,
        };
        showDownPlayers.push(p);
      });
      break;

    default:
      break;
  }

  winnerAmount += roomData.pot;

  let winnerPlayerData = showDownPlayers.filter(
    (el) => el.id.toString() === playerid.toString()
  );

  winnerPlayerData[0].wallet += winnerAmount;
  let totalPlayerTablePot = winnerPlayerData[0].prevPot;

  const winningAmount = winnerAmount - totalPlayerTablePot;
  const winnerPlayer = [
    {
      id: winnerPlayerData[0].id,
      name: winnerPlayerData[0].name,
      position: winnerPlayerData[0].position,
      winningAmount: winningAmount,
      winnerCards: winnerPlayerData[0].cards,
      communityCards: roomData.communityCard,
    },
  ];
  const handWinner = roomData.handWinner;
  console.log({ handWinner });
  handWinner.push(winnerPlayer);
  console.log({ handWinner });
  console.log('PLAYER JSON BEFORE', JSON.stringify(showDownPlayers));
  showDownPlayers.forEach((player, i) => {
    let action, amt;
    if (player.playing) {
      if (winnerPlayer.find((ele) => ele.id === player.id)) {
        action = 'game-win';
        amt = winnerPlayer.find((ele) => ele.id === player.id).winningAmount;
      } else {
        action = 'game-lose';
        amt = player.prevPot;
      }

      player.hands.push({
        action,
        amount: amt,
        date: new Date(),
        isWatcher: false,
      });
    }
  });
  console.log('--------------------------------------------------------');
  console.log('PLAYER JSON ', JSON.stringify(showDownPlayers));
  console.log('--------------------------------------------------------');
  console.log('showDwon =>', JSON.stringify(showDownPlayers));
  const updatedRoom = await roomModel.findOneAndUpdate(
    {
      _id: roomid,
    },
    {
      isGameRunning: false,
      showdown: showDownPlayers,
      pot: 0,
      winnerPlayer: winnerPlayer,
      handWinner: handWinner,
    },
    {
      new: true,
    }
  );

  io.in(updatedRoom._id.toString()).emit('winner', { updatedRoom });
  // await finishHandApiCall(updatedRoom);
  handleWatcherWinner(updatedRoom, io);
  // findLoserAndWinner(updatedRoom);
  setTimeout(async () => {
    let firstGameTime = new Date(updatedRoom.firstGameTime);
    let now = new Date();
    //// for min games
    //if ((now - firstGameTime) / (1000 * 60) > 15) {
    //  const roomUpdate = await roomModel.findOne({ _id: updatedRoom._id });
    //  io.in(roomUpdate._id.toString()).emit("roomFinished", {
    //    msg: "Game finished",
    //    finish: roomUpdate.finish,
    //    roomdata: roomUpdate,
    //  });
    //  finishedTableGame(roomUpdate);
    //} else {

    await updateRoomForNewHand(roomid, io);
    let updatedRoomPlayers = await roomModel.findOne({
      _id: roomid,
    });
    if (!updatedRoom.pause) {
      if (updatedRoom.autoNextHand) {
        preflopround(updatedRoom, io);
      } else {
        let havemoney = updatedRoomPlayers.players.filter(
          (el) => el.wallet > 0
        );
        if (havemoney.length > 1) {
          io.in(updatedRoom._id.toString()).emit('tablestopped', {
            msg: 'Waiting to start game',
          });
        } else {
          io.in(updatedRoom._id.toString()).emit('onlyOnePlayingPlayer', {
            msg: 'Game finished, Only one player left',
            roomdata: updatedRoomPlayers,
          });
          if (updatedRoomPlayers.gameType === 'pokerTournament_Tables') {
            await finishedTableGame(updatedRoomPlayers, playerid);
            io.in(updatedRoomPlayers._id.toString()).emit('roomFinished', {
              msg: 'Game finished',
              finish: updatedRoomPlayers.finish,
              roomdata: updatedRoomPlayers,
            });
          }
        }
      }
    } else {
      io.in(updatedRoom._id.toString()).emit('tablestopped', {
        msg: 'Table stopped by host',
      });
    }
    const roomUpdate = await roomModel.findOne({ _id: updatedRoom._id });
    if (roomUpdate.finish) {
      await finishedTableGame(roomUpdate, playerid);
      io.in(roomUpdate._id.toString()).emit('roomFinished', {
        msg: 'Room Finished',
        finish: roomUpdate.finish,
        roomdata: roomUpdate,
      });
    } else
      io.in(updatedRoom._id.toString()).emit('newhand', {
        updatedRoom: roomUpdate,
      });
  }, 15000);
};

export const getPlayerwallet = async (roomid, playerid) => {
  const roomData = await roomModel.findOne({ _id: roomid });
  let res = null;
  let filterData = null;

  switch (roomData.runninground) {
    case 1:
      filterData = roomData.preflopround.filter(
        (el) => el.id.toString() === playerid.toString()
      );
      res = filterData[0].wallet;
      return res;

    case 2:
      filterData = roomData.flopround.filter(
        (el) => el.id.toString() === playerid.toString()
      );
      res = filterData[0].wallet;
      return res;
    case 3:
      filterData = roomData.turnround.filter(
        (el) => el.id.toString() === playerid.toString()
      );
      res = filterData[0].wallet;
      return res;
    case 4:
      filterData = roomData.riverround.filter(
        (el) => el.id.toString() === playerid.toString()
      );
      res = filterData[0].wallet;
      return res;
  }
};

export const startLevelInterval = (_id) => {
  let interval = setInterval(async () => {
    try {
      const tournamentData = await tournamentModel.findById(_id).lean();
      if (tournamentData) {
        const level = tournamentData.levels.level;

        if (level > 47) {
          clearInterval(interval);
        } else {
          const { smallBlind, bigBlind } = await calculateLevel(level);
          await tournamentModel.updateOne(
            { _id },
            {
              $inc: { 'levels.level': 1 },
              'levels.bigBlind.amount': bigBlind,
              'levels.smallBlind.amount': smallBlind,
            }
          );
        }
      }
    } catch (e) {
      console.log(e);
    }
  }, 900000);
};

const calculateLevel = async (level) => {
  let smallBlind, bigBlind;
  switch (level) {
    case 1:
      smallBlind = 100;
      bigBlind = 200;
      break;
    case 2:
      smallBlind = 200;
      bigBlind = 300;
      break;
    case 3:
      smallBlind = 200;
      bigBlind = 400;
      break;
    case 4:
      smallBlind = 300;
      bigBlind = 500;
      break;
    case 5:
      smallBlind = 300;
      bigBlind = 600;
      break;
    case 6:
      smallBlind = 400;
      bigBlind = 800;
      break;
    case 7:
      smallBlind = 500;
      bigBlind = 1000;
      break;
    case 8:
      smallBlind = 600;
      bigBlind = 1200;
      break;
    case 9:
      smallBlind = 800;
      bigBlind = 1600;
      break;
    case 10:
      smallBlind = 1000;
      bigBlind = 2000;
      break;
    case 11:
      smallBlind = 1200;
      bigBlind = 2400;
      break;
    case 12:
      smallBlind = 1500;
      bigBlind = 3000;
      break;
    case 13:
      smallBlind = 2000;
      bigBlind = 4000;
      break;
    case 14:
      smallBlind = 2500;
      bigBlind = 5000;
      break;
    case 15:
      smallBlind = 3000;
      bigBlind = 6000;
      break;
    case 16:
      smallBlind = 4000;
      bigBlind = 8000;
      break;
    case 17:
      smallBlind = 5000;
      bigBlind = 10000;
      break;
    case 18:
      smallBlind = 6000;
      bigBlind = 12000;
      break;
    case 19:
      smallBlind = 8000;
      bigBlind = 16000;
      break;
    case 20:
      smallBlind = 10000;
      bigBlind = 20000;
      break;
    case 21:
      smallBlind = 12000;
      bigBlind = 24000;
      break;
    case 22:
      smallBlind = 15000;
      bigBlind = 30000;
      break;
    case 23:
      smallBlind = 20000;
      bigBlind = 40000;
      break;
    case 24:
      smallBlind = 25000;
      bigBlind = 50000;
      break;
    case 25:
      smallBlind = 30000;
      bigBlind = 60000;
      break;
    case 26:
      smallBlind = 40000;
      bigBlind = 80000;
      break;
    case 27:
      smallBlind = 50000;
      bigBlind = 100000;
      break;
    case 28:
      smallBlind = 60000;
      bigBlind = 120000;
      break;
    case 29:
      smallBlind = 80000;
      bigBlind = 160000;
      break;
    case 30:
      smallBlind = 100000;
      bigBlind = 200000;
      break;
    case 31:
      smallBlind = 125000;
      bigBlind = 250000;
      break;
    case 32:
      smallBlind = 150000;
      bigBlind = 300000;
      break;
    case 33:
      smallBlind = 200000;
      bigBlind = 400000;
      break;
    case 34:
      smallBlind = 250000;
      bigBlind = 500000;
      break;
    case 35:
      smallBlind = 300000;
      bigBlind = 600000;
      break;
    case 36:
      smallBlind = 400000;
      bigBlind = 800000;
      break;
    case 37:
      smallBlind = 500000;
      bigBlind = 1000000;
      break;
    case 38:
      smallBlind = 600000;
      bigBlind = 1200000;
      break;
    case 39:
      smallBlind = 800000;
      bigBlind = 1600000;
      break;
    case 40:
      smallBlind = 1000000;
      bigBlind = 2000000;
      break;
    case 41:
      smallBlind = 1250000;
      bigBlind = 2500000;
      break;
    case 42:
      smallBlind = 1500000;
      bigBlind = 3000000;
      break;
    case 43:
      smallBlind = 2000000;
      bigBlind = 4000000;
      break;
    case 44:
      smallBlind = 2500000;
      bigBlind = 5000000;
      break;
    case 45:
      smallBlind = 3000000;
      bigBlind = 6000000;
      break;
    case 46:
      smallBlind = 4000000;
      bigBlind = 8000000;
      break;
    case 47:
      smallBlind = 5000000;
      bigBlind = 10000000;
      break;
    default:
      break;
  }
  return { smallBlind, bigBlind };
};

export const nextWeekdayDate = (date, day_in_week) => {
  var ret = new Date(date || new Date());
  ret.setDate(ret.getDate() + ((day_in_week - 1 - ret.getDay() + 7) % 7) + 1);
  return ret;
};

export const reArrangeTables = async (tournamentId, io) => {
  try {
    const tournamentData = await tournamentModel
      .findById(tournamentId, {
        rooms: 1,
        destroyedRooms: 1,
        havePlayers: 1,
        levels: 1,
      })
      .populate('rooms', null, { gamestart: false })
      .lean();
    const tData = await tournamentModel
      .findById(tournamentId, { rooms: 1, destroyedRooms: 1, havePlayers: 1 })
      .lean();
    // console.log('tournamentData => ',tournamentData);
    const rearrange = async (tournamentData) => {
      if (tournamentData) {
        // let allAvilableRoom = tournamentData.rooms;
        const updatedDestroyed = await tournamentModel
          .findById(tournamentData._id, { destroyedRooms: 1 })
          .lean();
        const notDestroyedYet = tournamentData.rooms.filter((el) => {
          let r = true;
          const have = updatedDestroyed.destroyedRooms.filter(
            (e) => e.toString() === el._id.toString()
          );
          if (have.length) {
            r = false;
          }
          return r;
        });
        // console.log('++++++ notDestroyedYet ++++++ ==>', notDestroyedYet);
        let allAvilableRoom = await getRoomsUpdatedData(notDestroyedYet);
        // console.log("updated Rooms Data ==> ", allAvilableRoom);
        let fullRooms = [];
        let haveBlankSpots = [];
        let blankSpots = [];
        let extraBlankfordestroy = [];

        let canPlayMinimum = 9;
        if (tData.rooms.length - updatedDestroyed.destroyedRooms.length >= 9) {
          canPlayMinimum = 9;
          console.log('canPlayMinimum==>', canPlayMinimum);
        } else if (
          tData.rooms.length - updatedDestroyed.destroyedRooms.length <= 8 &&
          tData.rooms.length - updatedDestroyed.destroyedRooms.length >= 5
        ) {
          canPlayMinimum = 8;
          console.log('canPlayMinimum==>', canPlayMinimum);
        } else if (
          tData.rooms.length - updatedDestroyed.destroyedRooms.length <= 4 &&
          tData.rooms.length - updatedDestroyed.destroyedRooms.length >= 3
        ) {
          canPlayMinimum = 7;
          console.log('canPlayMinimum==>', canPlayMinimum);
        } else if (
          tData.rooms.length - updatedDestroyed.destroyedRooms.length ===
          2
        ) {
          canPlayMinimum = 5;
          console.log('canPlayMinimum==>', canPlayMinimum);
        } else if (
          tData.rooms.length - updatedDestroyed.destroyedRooms.length ===
          1
        ) {
          canPlayMinimum = 2;
          console.log('canPlayMinimum==>', canPlayMinimum);
        }

        fullRooms = allAvilableRoom.filter(
          (el) =>
            el.players.length <= 10 && el.players.length >= canPlayMinimum + 1
        );

        fullRooms.sort(function (a, b) {
          // ASC  -> a.length - b.length
          // DESC -> b.length - a.length
          return b.players.length - a.players.length;
        });

        // if (fullRooms.length===0) {
        //     fullRooms = allAvilableRoom.filter(el=>el.players.length === (canPlayMinimum+1));
        // }
        haveBlankSpots = allAvilableRoom.filter(
          (el) => el.players.length < 10 && el.players.length > 0
        );
        // console.log('fullRooms =>',fullRooms);
        // console.log('haveBlankSpots =>',haveBlankSpots);
        let mostBlnkRoom = { roomid: null, totalSpots: 0 };
        let totalEliminated = 0;
        haveBlankSpots.forEach((el) => {
          if (el.eleminated.length) {
            let position = [];
            el.eleminated.forEach((e) => {
              position.push(e.position);
            });
            if (mostBlnkRoom.totalSpots < position.length) {
              mostBlnkRoom = { roomid: el._id, totalSpots: position.length };
            }
            totalEliminated += position.length;
            blankSpots.push({ roomid: el._id, spots: position });
          }
        });
        let haveOnespot = blankSpots.filter((el) => el.spots.length === 1);
        let haveMoreThnOne = blankSpots.filter((el) => {
          console.log(
            '-----el.spots.length---',
            el.spots.length,
            '---(10-canPlayMinimum+1)---',
            10 - (canPlayMinimum + 1)
          );
          return el.spots.length > 10 - canPlayMinimum;
        });
        console.log('blankSpots => ', blankSpots);
        console.log('mostBlnkRoom => ', mostBlnkRoom);
        console.log('haveOnespot=> ', haveOnespot);
        console.log('haveMoreThnOne => ', haveMoreThnOne);
        console.log('totalEliminated => ', totalEliminated);
        fullRooms.forEach((el) => {
          console.log(
            'full rooms id ==> ',
            el._id,
            ' players.length => ',
            el.players.length
          );
        });
        console.log('total full rooms ==> ', fullRooms.length);
        console.log('total not full rooms ==> ', haveBlankSpots.length);

        // let mxLength = 10
        // if (fullRooms.length === 0 ) {
        //     mxLength = canPlayMinimum+1;
        // }
        console.log(
          '------totalEliminated-mostBlnkRoom.totalSpots-------',
          totalEliminated - mostBlnkRoom.totalSpots
        );
        console.log(
          '------10-mostBlnkRoom.totalSpots-------',
          10 - mostBlnkRoom.totalSpots
        );
        if (
          totalEliminated - mostBlnkRoom.totalSpots >=
          10 - mostBlnkRoom.totalSpots
        ) {
          console.log('this table must be destroyed ==> ', mostBlnkRoom);
          let leftBlankTables1 = haveMoreThnOne.filter(
            (el) => el.roomid !== mostBlnkRoom.roomid
          );
          let leftBlankTables2 = haveOnespot.filter(
            (el) => el.roomid !== mostBlnkRoom.roomid
          );
          let leftBlankTables3 = blankSpots.filter(
            (el) => el.spots.length === 10 - canPlayMinimum
          );
          let leftBlankTables4 = leftBlankTables1.concat(leftBlankTables2);
          let leftBlankTables = leftBlankTables4.concat(leftBlankTables3);
          // console.log("leftBlankTables ==> ", leftBlankTables);
          await destroyTable(mostBlnkRoom, leftBlankTables, io);
          // console.log(
          //   "+++++++++++++++++ Calling Rearrange Again ++++++++++++++++++"
          // );
          await rearrange(tournamentData);
        } else if (haveMoreThnOne.length && fullRooms.length) {
          each(
            haveMoreThnOne,
            async function (room, next) {
              let have = fullRooms.filter((el) => el._id === room.roomid);
              if (!have.length) {
                // console.log(
                //   "+++++++++++++++++ Calling fillSpot ++++++++++++++++++"
                // );
                fullRooms = await fillSpot(room, fullRooms, canPlayMinimum, io);
              }
              next();
            },
            async function (err, transformedItems) {
              //Success callback
              // console.log(
              //   "+++++++++++++++++ Calling Rearrange Again ++++++++++++++++++"
              // );
              await rearrange(tournamentData);
            }
          );
        } else {
          // console.log(
          //   "************ These tables can start new hand ************"
          // );
          // console.log("avilablePlayer=>", tournamentData.havePlayers);
          // console.log(
          //   "running tables=>",
          //   tournamentData.rooms.length - updatedDestroyed.destroyedRooms.length
          // );

          let canStartHand = allAvilableRoom.filter(
            (el) => el.players.length >= canPlayMinimum
          );

          each(
            canStartHand,
            async function (el, next) {
              const rdata = await roomModel.findOne({ _id: el._id }).lean();
              // await preflopround(rdata,tournamentData,io);
              next();
            },
            function (err, transformedItems) {
              //Success callback
            }
          );
        }
      }
    };

    await rearrange(tournamentData);
  } catch (e) {
    console.log('error : ', e);
  }
};

export const fillSpot = async (room, fullRooms, canPlayMinimum, io) => {
  return new Promise(async (resolve, reject) => {
    const roomData = await roomModel.findById(room.roomid).lean();
    let roomPlayers = roomData.players;
    let eleminated = roomData.eleminated;

    let i = 0;
    each(
      fullRooms,
      async function (froom, next) {
        if (
          room.spots.length > 10 - canPlayMinimum &&
          i < room.spots.length - 1
        ) {
          let froomPlayers = froom.players;
          let feleminated = froom.eleminated;
          let avilablePlayer = froomPlayers.filter((el) =>
            room.spots.includes(el.position)
          );

          if (avilablePlayer.length) {
            roomPlayers.push(avilablePlayer[0]);

            let lefteleminated = eleminated.filter(
              (el) => el.position !== avilablePlayer[0].position
            );
            const rUpdatedData = await roomModel.findOneAndUpdate(
              {
                _id: roomData._id,
              },
              {
                players: roomPlayers,
                eleminated: lefteleminated,
              },
              {
                new: true,
              }
            );
            io.in(roomData._id.toString()).emit('roomData', rUpdatedData);

            let oldPlayer = eleminated.filter(
              (el) => el.position === avilablePlayer[0].position
            );
            eleminated = lefteleminated;
            feleminated.push(oldPlayer[0]);
            let fleftPlayers = froomPlayers.filter(
              (el) => el.position !== avilablePlayer[0].position
            );

            io.in(roomData._id.toString()).emit('roomchanged', {
              userid: avilablePlayer[0].userid,
              newRoomId: roomData._id,
            });
            const userData = await userModel.findOneAndUpdate(
              {
                _id: avilablePlayer[0].userid,
                'tournaments.tournamentId': roomData.tournament,
              },
              {
                'tournaments.$.roomId': roomData._id,
              },
              { new: true }
            );

            const fUpdatedData = await roomModel.findOneAndUpdate(
              {
                _id: froom._id,
              },
              {
                players: fleftPlayers,
                eleminated: feleminated,
              },
              {
                new: true,
              }
            );
            fullRooms = fullRooms.filter((el) => {
              el._id !== froom._id;
            });
            io.in(fUpdatedData._id.toString()).emit('roomData', fUpdatedData);
            let avilableSpot = room.spots.filter(
              (el) => el !== avilablePlayer[0].position
            );
            room.spots = avilableSpot;
            // console.log("avilableSpot=>", room.spots);
          }
        } else {
          i++;
        }

        next();
      },
      function (err, transformedItems) {
        //Success callback
        resolve(fullRooms);
      }
    );
  });
};

export const destroyTable = async (mostBlnkRoom, leftBlankTables, io) => {
  return new Promise(async (resolve, reject) => {
    const dRoomData = await roomModel.findById(mostBlnkRoom.roomid).lean();
    let dPlayers = dRoomData.players;
    let dhaveEleminated = dRoomData.eleminated;

    each(
      dPlayers,
      async function (player, next) {
        if (dPlayers.length) {
          let havePosition = leftBlankTables.filter((el) =>
            el.spots.includes(player.position)
          );
          if (havePosition.length) {
            const roomData = await roomModel
              .findById(havePosition[0].roomid)
              .lean();
            let players = roomData.players;

            players.push(player);

            let moveEleminated = roomData.eleminated.filter(
              (el) => el.position === player.position
            );
            let lefteleminated = roomData.eleminated.filter(
              (el) => el.position !== player.position
            );
            const rUpdatedData = await roomModel.findOneAndUpdate(
              {
                _id: roomData._id,
              },
              {
                players: players,
                eleminated: lefteleminated,
              },
              {
                new: true,
              }
            );

            io.in(roomData._id.toString()).emit('roomData', rUpdatedData);
            io.in(dRoomData._id.toString()).emit('roomchanged', {
              userid: player.userid,
              newRoomId: roomData._id,
            });
            const userData = await userModel.findOneAndUpdate(
              {
                _id: player.userid,
                'tournaments.tournamentId': roomData.tournament,
              },
              {
                'tournaments.$.roomId': roomData._id,
              },
              { new: true }
            );
            // console.log(
            //   "############### Updated Player RoomID in UserData ##################",
            //   userData._id
            // );

            let leftplayer = dPlayers.filter(
              (el) => el.position !== player.position
            );
            dPlayers = leftplayer;
            dhaveEleminated.push(moveEleminated[0]);
            const dUpdatedData = await roomModel.findOneAndUpdate(
              {
                _id: dRoomData._id,
              },
              {
                players: dPlayers,
              },
              {
                new: true,
              }
            );
            io.in(dRoomData._id.toString()).emit('roomData', dUpdatedData);

            let index = havePosition[0].spots.indexOf(player.position);
            if (index > -1) {
              havePosition[0].spots.splice(index, 1);
            }
            let otherleftTable = leftBlankTables.filter(
              (el) => !el.spots.includes(player.position)
            );
          }
        }
        next();
      },
      function (err, transformedItems) {
        //Success callback
        // console.log(
        //   "after check all playerin avilable spot",
        //   "dPlayers",
        //   dPlayers,
        //   "leftBlankTables",
        //   leftBlankTables
        // );
        each(
          dPlayers,
          async function (player, next) {
            if (dPlayers.length) {
              const sit = async (player, i) => {
                // console.log("find position => ", i);
                // console.log(
                //   "leftBlankTables inside sit fun ==>",
                //   leftBlankTables
                // );
                let havePosition = leftBlankTables.filter((el) =>
                  el.spots.includes(i)
                );
                if (havePosition.length) {
                  const roomData = await roomModel
                    .findById(havePosition[0].roomid)
                    .lean();
                  let players = roomData.players;
                  player.position = i;
                  // console.log('before pushing player ==> ', players);
                  players.push(player);
                  // console.log("After pushing player ==> ", players);
                  let moveEleminated = roomData.eleminated.filter(
                    (el) => el.position === player.position
                  );
                  let lefteleminated = roomData.eleminated.filter(
                    (el) => el.position !== player.position
                  );
                  const rUpdatedData = await roomModel.findOneAndUpdate(
                    {
                      _id: roomData._id,
                    },
                    {
                      players: players,
                      eleminated: lefteleminated,
                    },
                    {
                      new: true,
                    }
                  );
                  io.in(rUpdatedData._id.toString()).emit(
                    'roomData',
                    rUpdatedData
                  );
                  io.in(dRoomData._id.toString()).emit('roomchanged', {
                    userid: player.userid,
                    newRoomId: roomData._id,
                  });
                  const userData = await userModel.findOneAndUpdate(
                    {
                      _id: player.userid,
                      'tournaments.tournamentId': roomData.tournament,
                    },
                    {
                      'tournaments.$.roomId': roomData._id,
                    },
                    { new: true }
                  );

                  let leftplayer = dPlayers.filter((el) => el.position !== i);
                  dPlayers = leftplayer;
                  dhaveEleminated.push(moveEleminated[0]);
                  const dUpdatedData = await roomModel.findOneAndUpdate(
                    {
                      _id: dRoomData._id,
                    },
                    {
                      players: dPlayers,
                    },
                    {
                      new: true,
                    }
                  );
                  io.in(dRoomData._id.toString()).emit(
                    'roomData',
                    dUpdatedData
                  );

                  let index = havePosition[0].spots.indexOf(player.position);
                  if (index > -1) {
                    havePosition[0].spots.splice(index, 1);
                  }
                  let otherleftTable = leftBlankTables.filter(
                    (el) => !el.spots.includes(player.position)
                  );
                  // console.log(
                  //   "player sit done on position ==>",
                  //   player.position
                  // );
                  // console.log('find position => ', player.position+i)
                  // console.log('otherleftTable=>', otherleftTable);
                  // console.log("left players ==> ", dPlayers);
                  // console.log('havePosition=>', havePosition);
                  // console.log('leftBlankTables==>', leftBlankTables)
                } else {
                  if (i < 9) {
                    await sit(player, ++i);
                  } else {
                    await sit(player, 0);
                  }
                }
              };
              await sit(player, player.position);
            }

            next();
          },
          async function (err, transformedItems) {
            //Success callback
            const dUpdatedData = await roomModel.findOneAndUpdate(
              {
                _id: dRoomData._id,
              },
              {
                eleminated: dhaveEleminated,
              },
              {
                new: true,
              }
            );
            await tournamentModel.findOneAndUpdate(
              { _id: dRoomData.tournament },
              { $push: { destroyedRooms: dRoomData._id } }
            );
            // console.log("after eleminated pushed ===> ", dUpdatedData);
            resolve();
          }
        );
      }
    );
  });
};

export const getRoomsUpdatedData = async (rooms) => {
  return new Promise((resolve, reject) => {
    let updatedRooms = [];
    each(
      rooms,
      async function (room, next) {
        let roomData = await roomModel.findById(room._id).lean();
        updatedRooms.push(roomData);
        next();
      },
      function (err, transformedItems) {
        //Success callback
        resolve(updatedRooms);
      }
    );
  });
};

export const findAvailablePosition = async (playerList) => {
  return new Promise((resolve, reject) => {
    try {
      let i = 0;
      let isFound = false;
      while (i < 10 && !isFound) {
        let have = playerList.filter((el) => el.position === i);
        if (!have.length) {
          isFound = true;
          resolve(i);
        }
        i++;
      }
    } catch (error) {
      console.log('error', error);
    }
  });
};

export const joinRequest = async (data, socket, io) => {
  try {
    const roomData = await getDoc(data.gameType, data._id);
    if (!roomData) {
      return socket.emit('noTable', 'No such table exists');
    }
    const userData = await getDoc('users', data.userId);
    if (userData) {
      userData.userid = data.userId;
      let room = await roomModel.findOne({
        _id: data._id,
      });
      if (room != null) {
        const isExist = room.players.filter(
          (el) => el.userid.toString() === userData.userid.toString()
        );
        if (isExist.length) {
          socket.emit('alreadyJoin', '');
        } else {
          if (room.players.length < 10) {
            let ischecked = false;
            let amt;
            if (
              data.gameType === 'pokerTournament_Tables' &&
              room.maxchips <= userData.stats.total.coins
            ) {
              ischecked = true;
              amt = room.maxchips;
            } else if (data.gameType !== 'pokerTournament_Tables') {
              ischecked = true;
              amt = userData.stats.total.coins;
            }

            if (ischecked && amt) {
              let joinRequests = room.joinRequests;
              const player = {
                userid: userData.userid,
                name: userData.nickname,
                photoURI: userData.photoURI,
                wallet: amt,
                playing: true,
              };
              joinRequests.push(player);
              const savedroom = await roomModel.findByIdAndUpdate(room._id, {
                joinRequests: joinRequests,
              });
              let roomId = room._id;
              io.in(data._id.toString()).emit('joinrequest', {
                player,
                hostid: room.hostId,
                _id: data._id,
                gameType: data.gameType,
              });
              socket.emit('hostApproval', 'Waithing for host approval');
            } else {
              io.in(data._id.toString()).emit('lowBalance', {
                userid: userData.userid,
              });
            }
          } else {
            socket.emit('roomFull', 'Room is Already Full');
          }
        }
      } else {
        socket.emit('notFound', 'Room not Found');
      }
    } else {
      socket.emit('actionError', 'Some Error Occured');
    }
  } catch (e) {
    console.log('error : ', e);
    socket.emit('actionError', 'Some Error Occured');
  }
};

export const checkRoomForConnectedUser = async (data, socket, io) => {
  try {
    const { room, user, gameType } = data;
    if (!room.roomid) return;
    let hand = [];
    let amount = 0;
    let items = await getPurchasedItem(user.userid, user.stats.Level);
    if (room.table.media !== 'no-media') {
      amount = room.table.media === 'video' ? 400 : 100;
      hand.push({
        amount,
        action: `${room.table.media}-game`,
        date: new Date(),
        isWatcher: false,
      });
    }
    let isRoomExist = await roomModel.findOne({ _id: room.roomid });
    if (isRoomExist) {
      if (
        room.table.isGameFinished ||
        isRoomExist.finish ||
        room.table.status === 'empty'
      ) {
        return socket.emit('gameFinished', 'Game Already Finished.');
      }
      if (isRoomExist.watchers.find((ele) => ele.userid === user.userid)) {
        const bet = await BetModal.findOne({ _id: room.roomid });
        socket.join(room.roomid.toString() + 'watchers');
        io.in(room.roomid.toString() + 'watchers').emit('newWatcherJoin', {
          watcherId: user.userid,
          roomData: isRoomExist,
        });
        if (bet)
          io.in(room.roomid.toString() + 'watchers').emit('newBetPlaced', bet);
        return;
      } else if (
        isRoomExist.players.find((ele) => ele.userid === user.userid)
      ) {
        return io
          .in(room.roomid.toString())
          .emit('updatePlayerList', isRoomExist);
      }
      const position = await findAvailablePosition(isRoomExist.players);
      if (
        (isRoomExist.gameType === 'poker1vs1_Tables' &&
          isRoomExist.players.length === 2) ||
        isRoomExist.players.length >= 10
      ) {
        if (isRoomExist.allowWatcher) {
          return socket.emit('newWatcher', {
            _id: room.roomid,
            userId: user.userid,
            allowWatcher: room.table.alloWatchers,
          });
        } else {
          return socket.emit('roomFull', 'Room is full');
        }
      }
      if (isRoomExist.gamestart) {
        if (room.table.public) {
          if (
            isRoomExist.gameType !== 'poker1vs1_Tables' &&
            isRoomExist.players.length < 10 &&
            !isRoomExist.players.find((ele) => ele.userid === user.userid)
          ) {
            user.isAdmin = false;
            const deduct = await deductAmount(
              isRoomExist.maxchips,
              user.userid,
              gameType,
              isRoomExist.minBet,
              isRoomExist.media
            );
            if (deduct) {
              let buyin = isRoomExist.buyin;
              let leavereq = isRoomExist.leavereq.filter(
                (el) => el !== user.userid
              );
              buyin.push({
                userid: user.userid,
                name: user.nickname,
                chips: deduct - amount,
                redeem: 1,
              });
              const API_KEY = process.env.VIDEOSDK_API_KEY;
              const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY;

              const options = { expiresIn: '10d', algorithm: 'HS256' };

              const payload = {
                apikey: API_KEY,
                permissions: ['ask_join'], // also accepts "ask_join"
              };

              const token = jwt.sign(payload, SECRET_KEY, options);
              const updateRoom = await roomModel.findOneAndUpdate(
                { _id: isRoomExist._id },
                {
                  $push: {
                    players: {
                      name: user.nickname,
                      userid: user.userid,
                      photoURI: user.photoURI,
                      wallet: deduct - amount,
                      position: position,
                      missedSmallBlind: false,
                      missedBigBlind: false,
                      forceBigBlind: false,
                      playing: true,
                      stats: user.stats,
                      initialCoinBeforeStart: user.stats.total.coins,
                      gameJoinedAt: new Date(),
                      hands: hand,
                      meetingToken: token,
                      items,
                    },
                  },
                  buyin: buyin,
                  leavereq,
                },
                { new: true }
              );
              io.in(room.roomid.toString()).emit('joinInRunningGame', {
                updatedRoom: updateRoom,
                playerId: user.userid,
              });
              await removeInvToPlayers(room.roomid, user.userid, gameType);
            } else {
              io.in(room.roomid.toString()).emit('lowBalance', {
                userid: user.userid,
              });
            }
          } else if (
            !room.invPlayers.find((ele) => ele === user.userid) &&
            isRoomExist.gameType !== 'poker1vs1_Tables' &&
            isRoomExist.players.length < 10
          ) {
            socket.emit('newUser', {
              _id: room.roomid,
              userId: user.userid,
              allowWatcher: room.table.alloWatchers,
            });
          } else if (
            isRoomExist.gameType !== 'poker1vs1_Tables' &&
            isRoomExist.players.length >= 10
          ) {
            socket.emit('roomFull', 'Room is full');
          }
        } else {
          if (
            room.invPlayers.find((ele) => ele === user.userid) &&
            !room.players.find((ele) => ele === user.userid)
          ) {
            user.isAdmin = false;
            const deduct = await deductAmount(
              isRoomExist.maxchips,
              user.userid,
              gameType,
              isRoomExist.minBet,
              isRoomExist.media
            );
            if (deduct) {
              let buyin = isRoomExist.buyin;
              let leavereq = isRoomExist.leavereq.filter(
                (el) => el !== user.userid
              );
              buyin.push({
                userid: user.userid,
                name: user.nickname,
                chips: deduct - amount,
                redeem: 1,
              });
              const API_KEY = process.env.VIDEOSDK_API_KEY;
              const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY;

              const options = { expiresIn: '10d', algorithm: 'HS256' };

              const payload = {
                apikey: API_KEY,
                permissions: ['ask_join'], // also accepts "ask_join"
              };

              const token = jwt.sign(payload, SECRET_KEY, options);
              const updateRoom = await roomModel.findOneAndUpdate(
                { _id: isRoomExist._id },
                {
                  $push: {
                    players: {
                      name: user.nickname,
                      userid: user.userid,
                      photoURI: user.photoURI,
                      wallet: deduct - amount,
                      position: position,
                      missedSmallBlind: false,
                      missedBigBlind: false,
                      forceBigBlind: false,
                      playing: true,
                      stats: user.stats,
                      initialCoinBeforeStart: user.stats.total.coins,
                      gameJoinedAt: new Date(),
                      hands: hand,
                      meetingToken: token,
                      items,
                    },
                  },
                  buyin: buyin,
                  leavereq,
                },
                { new: true }
              );
              io.in(room.roomid.toString()).emit(
                'updatePlayerList',
                updateRoom
              );
              await removeInvToPlayers(room.roomid, user.userid, gameType);
            } else {
              io.in(room.roomid.toString()).emit('lowBalance', {
                userid: user.userid,
              });
            }
          } else if (room.players.find((ele) => ele === user.userid)) {
            if (isRoomExist.hostId === user.userid) {
              socket.emit('tableOwner', isRoomExist);
            }
            if (
              !isRoomExist.players.find((ele) => ele.userid === user.userid)
            ) {
              let buyin = isRoomExist.buyin;
              let leavereq = isRoomExist.leavereq.filter(
                (el) => el !== user.userid
              );
              buyin.push({
                userid: user.userid,
                name: user.nickname,
                chips: isRoomExist.maxchips,
                redeem: 1,
              });
              const API_KEY = process.env.VIDEOSDK_API_KEY;
              const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY;

              const options = { expiresIn: '10d', algorithm: 'HS256' };

              const payload = {
                apikey: API_KEY,
                permissions: ['ask_join'], // also accepts "ask_join"
              };

              const token = jwt.sign(payload, SECRET_KEY, options);
              const updateRoom = await roomModel.findOneAndUpdate(
                { _id: isRoomExist._id },
                {
                  $push: {
                    players: {
                      name: user.nickname,
                      userid: user.userid,
                      photoURI: user.photoURI,
                      wallet: isRoomExist.maxchips,
                      position: position,
                      missedSmallBlind: false,
                      missedBigBlind: false,
                      forceBigBlind: false,
                      playing: true,
                      stats: user.stats,
                      initialCoinBeforeStart: user.stats.total.coins,
                      gameJoinedAt: new Date(),
                      hands: hand,
                      meetingToken: token,
                      items,
                    },
                  },
                  buyin: buyin,
                  leavereq,
                },
                { new: true }
              );
              isRoomExist = updateRoom;
            }
            io.in(room.roomid.toString()).emit('updatePlayerList', isRoomExist);
          } else {
            socket.emit(
              'privateTable',
              'This is private table and you are not invited.'
            );
          }
        }
      } else {
        if (room.table.public) {
          if (
            isRoomExist.gameType !== 'poker1vs1_Tables' &&
            isRoomExist.players.length < 10 &&
            !room.players.find((ele) => ele === user.userid)
          ) {
            user.isAdmin = false;
            const deduct = await deductAmount(
              isRoomExist.maxchips,
              user.userid,
              gameType,
              isRoomExist.minBet,
              isRoomExist.media
            );
            if (deduct) {
              let buyin = isRoomExist.buyin;
              let leavereq = isRoomExist.leavereq.filter(
                (el) => el !== user.userid
              );
              buyin.push({
                userid: user.userid,
                name: user.nickname,
                chips: deduct - amount,
                redeem: 1,
              });
              const API_KEY = process.env.VIDEOSDK_API_KEY;
              const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY;

              const options = { expiresIn: '10d', algorithm: 'HS256' };

              const payload = {
                apikey: API_KEY,
                permissions: ['ask_join'], // also accepts "ask_join"
              };

              const token = jwt.sign(payload, SECRET_KEY, options);
              const updateRoom = await roomModel.findOneAndUpdate(
                { _id: isRoomExist._id },
                {
                  $push: {
                    players: {
                      name: user.nickname,
                      userid: user.userid,
                      photoURI: user.photoURI,
                      wallet: deduct - amount,
                      position: position,
                      missedSmallBlind: false,
                      missedBigBlind: false,
                      forceBigBlind: false,
                      playing: true,
                      stats: user.stats,
                      initialCoinBeforeStart: user.stats.total.coins,
                      gameJoinedAt: new Date(),
                      hands: hand,
                      meetingToken: token,
                      items,
                    },
                  },
                  buyin: buyin,
                  leavereq,
                },
                { new: true }
              );
              io.in(room.roomid.toString()).emit(
                'updatePlayerList',
                updateRoom
              );
              await removeInvToPlayers(room.roomid, user.userid, gameType);
            } else {
              io.in(room.roomid.toString()).emit('lowBalance', {
                userid: user.userid,
              });
            }
          } else if (room.players.find((ele) => ele === user.userid)) {
            if (isRoomExist.hostId === user.userid) {
              socket.emit('tableOwner', isRoomExist);
            }
            if (
              !isRoomExist.players.find((ele) => ele.userid === user.userid)
            ) {
              let buyin = isRoomExist.buyin;
              let leavereq = isRoomExist.leavereq.filter(
                (el) => el !== user.userid
              );
              buyin.push({
                userid: user.userid,
                name: user.nickname,
                chips: isRoomExist.maxchips,
                redeem: 1,
              });
              const API_KEY = process.env.VIDEOSDK_API_KEY;
              const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY;

              const options = { expiresIn: '10d', algorithm: 'HS256' };

              const payload = {
                apikey: API_KEY,
                permissions: ['ask_join'], // also accepts "ask_join"
              };

              const token = jwt.sign(payload, SECRET_KEY, options);
              const updateRoom = await roomModel.findOneAndUpdate(
                { _id: isRoomExist._id },
                {
                  $push: {
                    players: {
                      name: user.nickname,
                      userid: user.userid,
                      photoURI: user.photoURI,
                      wallet: isRoomExist.maxchips,
                      position: position,
                      missedSmallBlind: false,
                      missedBigBlind: false,
                      forceBigBlind: false,
                      playing: true,
                      stats: user.stats,
                      initialCoinBeforeStart: user.stats.total.coins,
                      gameJoinedAt: new Date(),
                      hands: hand,
                      meetingToken: token,
                      items,
                    },
                  },
                  buyin: buyin,
                  leavereq,
                },
                { new: true }
              );
              isRoomExist = updateRoom;
            }
            io.in(room.roomid.toString()).emit('updatePlayerList', isRoomExist);
          } else {
            socket.emit('newUser', {
              _id: room.roomid,
              userId: user.userid,
              allowWatcher: room.table.alloWatchers,
            });
          }
        } else {
          if (
            room.invPlayers.find((ele) => ele === user.userid) &&
            !room.players.find((ele) => ele === user.userid)
          ) {
            user.isAdmin = false;
            const deduct = await deductAmount(
              isRoomExist.maxchips,
              user.userid,
              gameType,
              isRoomExist.minBet,
              isRoomExist.media
            );
            if (deduct) {
              let buyin = isRoomExist.buyin;
              let leavereq = isRoomExist.leavereq.filter(
                (el) => el !== user.userid
              );
              buyin.push({
                userid: user.userid,
                name: user.nickname,
                chips: deduct - amount,
                redeem: 1,
              });
              const API_KEY = process.env.VIDEOSDK_API_KEY;
              const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY;

              const options = { expiresIn: '10d', algorithm: 'HS256' };

              const payload = {
                apikey: API_KEY,
                permissions: ['ask_join'], // also accepts "ask_join"
              };

              const token = jwt.sign(payload, SECRET_KEY, options);
              const updateRoom = await roomModel.findOneAndUpdate(
                { _id: isRoomExist._id },
                {
                  $push: {
                    players: {
                      name: user.nickname,
                      userid: user.userid,
                      photoURI: user.photoURI,
                      wallet: deduct - amount,
                      position: position,
                      missedSmallBlind: false,
                      missedBigBlind: false,
                      forceBigBlind: false,
                      playing: true,
                      stats: user.stats,
                      initialCoinBeforeStart: user.stats.total.coins,
                      gameJoinedAt: new Date(),
                      hands: hand,
                      meetingToken: token,
                      items,
                    },
                  },
                  buyin: buyin,
                  leavereq,
                },
                { new: true }
              );
              io.in(room.roomid.toString()).emit(
                'updatePlayerList',
                updateRoom
              );
              await removeInvToPlayers(room.roomid, user.userid, gameType);
            } else {
              io.in(room.roomid.toString()).emit('lowBalance', {
                userid: user.userid,
              });
            }
          } else if (room.players.find((ele) => ele === user.userid)) {
            if (isRoomExist.hostId === user.userid) {
              socket.emit('tableOwner', isRoomExist);
            }
            if (
              !isRoomExist.players.find((ele) => ele.userid === user.userid)
            ) {
              let buyin = isRoomExist.buyin;
              let leavereq = isRoomExist.leavereq.filter(
                (el) => el !== user.userid
              );
              buyin.push({
                userid: user.userid,
                name: user.nickname,
                chips: isRoomExist.maxchips,
                redeem: 1,
              });
              const API_KEY = process.env.VIDEOSDK_API_KEY;
              const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY;

              const options = { expiresIn: '10d', algorithm: 'HS256' };

              const payload = {
                apikey: API_KEY,
                permissions: ['ask_join'], // also accepts "ask_join"
              };

              const token = jwt.sign(payload, SECRET_KEY, options);
              const updateRoom = await roomModel.findOneAndUpdate(
                { _id: isRoomExist._id },
                {
                  $push: {
                    players: {
                      name: user.nickname,
                      userid: user.userid,
                      photoURI: user.photoURI,
                      wallet: isRoomExist.maxchips,
                      position: position,
                      missedSmallBlind: false,
                      missedBigBlind: false,
                      forceBigBlind: false,
                      playing: true,
                      stats: user.stats,
                      initialCoinBeforeStart: user.stats.total.coins,
                      gameJoinedAt: new Date(),
                      hands: hand,
                      meetingToken: token,
                      items,
                    },
                  },
                  buyin: buyin,
                  leavereq,
                },
                { new: true }
              );
              isRoomExist = updateRoom;
            }
            io.in(room.roomid.toString()).emit('updatePlayerList', isRoomExist);
          } else {
            socket.emit(
              'privateTable',
              'This is private table and you are not invited.'
            );
          }
        }
      }
    } else {
      if (room.table.isGameFinished || room.table.status === 'empty') {
        await updateInGameStatus(user.userid);
        return socket.emit('gameFinished', 'Game Already Finished.');
      }
      if (
        room.table.admin === user.userid ||
        room.table.status === 'scheduled'
      ) {
        user.isAdmin = room.table.admin === user.userid;
        const deduct = await deductAmount(
          room.table.buyIn,
          user.userid,
          gameType,
          room.table.minBet,
          room.table.media
        );

        if (deduct) {
          const API_KEY = process.env.VIDEOSDK_API_KEY;
          const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY;

          const options = { expiresIn: '10d', algorithm: 'HS256' };

          const payload = {
            apikey: API_KEY,
            permissions: ['allow_join', 'allow_mod'], // also accepts "ask_join"
          };

          const token = jwt.sign(payload, SECRET_KEY, options);
          const url = `${process.env.VIDEOSDK_API_ENDPOINT}/api/meetings`;

          const option = {
            method: 'POST',
            headers: { Authorization: token },
          };

          const result = await axios(url, option);
          let meetingId = result.data.meetingId;
          const createRoom = await roomModel.create({
            players: [
              {
                name: user.nickname,
                userid: user.userid,
                photoURI: user.photoURI,
                isAdmin: user.isAdmin,
                wallet: deduct - amount,
                position: 0,
                missedSmallBlind: false,
                missedBigBlind: false,
                forceBigBlind: false,
                playing: true,
                stats: user.stats,
                initialCoinBeforeStart: user.stats.total.coins,
                gameJoinedAt: new Date(),
                hands: hand,
                meetingToken: token,
                items,
              },
            ],
            invPlayers: room.invPlayers,
            gameName: room.table.name,
            gamestart: room.table.isGameStarted,
            isGameRunning: room.table.isGameStarted,
            smallBlind: room.table.minBet,
            bigBlind: room.table.minBet,
            timer: room.table.rTimeout,
            minchips: room.table.minBet,
            maxchips: deduct,
            hostId: room.table.admin,
            autoNextHand: room.table.adminStart,
            public: room.table.public,
            allowWatcher: room.table.alloWatchers,
            _id: room.roomid,
            gameType,
            media: room.table.media,
            buyin: [
              {
                userid: user.userid,
                name: user.nickname,
                chips: deduct - amount,
                redeem: 1,
              },
            ],
            created_on: new Date(),
            meetingId,
            meetingToken: token,
          });
          await removeInvToPlayers(room.roomid, user.userid, gameType);
          io.in(room.roomid.toString()).emit('updatePlayerList', createRoom);
          setTimeout(() => {
            socket.emit('tableOwner', createRoom);
          }, 1000);
        } else {
          io.in(room.roomid.toString()).emit('lowBalance', {
            userid: user.userid,
          });
        }
      } else {
        socket.emit('noAdmin', 'Table admin is not available yet');
      }
    }
  } catch (err) {
    console.log('Error in checkRoomForConnectedUser =>', err);
  }
};

export const approveJoinRequest = async (data, socket, io) => {
  try {
    const roomData = await getDoc(data.gameType, data._id);
    if (!roomData) {
      return socket.emit('noTable', 'No such table exists');
    }
    const userData = await getDoc('users', data.player.userid);
    if (userData) {
      userData.userid = data.player.userid;
      let items = await getPurchasedItem(
        data.player.userid,
        userData.stats.Level
      );
      let room = await roomModel.findOne({
        _id: data.tableId,
      });

      if (room != null) {
        let hand = [];
        let amount = 0;
        if (room.media !== 'no-media') {
          amount = room.media === 'video' ? 400 : 100;
          hand.push({
            amount,
            action: `${room.media}-game`,
            date: new Date(),
            isWatcher: false,
          });
        }
        if (room.players.length < 10) {
          let joinPlayer = room.joinRequests.filter(
            (e) => e.userid.toString() === data.player.userid.toString()
          );
          let leftrequest = room.joinRequests.filter(
            (e) => e.userid.toString() !== data.player.userid.toString()
          );

          const position = await findAvailablePosition(room.players);

          let roomId = room._id;
          const API_KEY = process.env.VIDEOSDK_API_KEY;
          const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY;

          const options = { expiresIn: '10d', algorithm: 'HS256' };

          const payload = {
            apikey: API_KEY,
            permissions: ['ask_join'], // also accepts "ask_join"
          };

          const token = jwt.sign(payload, SECRET_KEY, options);
          if (joinPlayer.length) {
            joinPlayer = {
              ...joinPlayer[0],
              position: position,
              missedSmallBlind: false,
              missedBigBlind: false,
              forceBigBlind: false,
              stats: userData.stats,
              initialCoinBeforeStart: userData.stats.total.coins,
              gameJoinedAt: new Date(),
              hands: hand,
              meetingToken: token,
              items,
            };
            const deduct = await deductAmount(
              room.maxchips,
              userData.userid,
              room.gameType,
              room.minBet,
              room.media
            );

            if (deduct) {
              let buyin = room.buyin;
              let leaveReq = room.leavereq.filter(
                (el) => el !== userData.userid
              );
              buyin.push({
                userid: data.player.userid,
                name: joinPlayer.name,
                chips: deduct - amount,
                redeem: 1,
              });
              let players = room.players;
              players.push(joinPlayer);
              const savedroom = await roomModel.findByIdAndUpdate(roomId, {
                players: players,
                joinRequests: leftrequest,
                buyin: buyin,
                leavereq: leaveReq,
              });
              roomId = room._id;

              const updatedRoom = await roomModel.findById(roomId);

              if (updatedRoom.gamestart) {
                io.in(data._id.toString()).emit('joinInRunningGame', {
                  updatedRoom,
                  playerId: data.player.userid,
                });
              } else
                io.in(data._id.toString()).emit(
                  'updatePlayerList',
                  updatedRoom
                );
              io.in(data._id.toString()).emit('approved', {
                playerid: userData.userid,
                name: data.player.name,
              });
              await removeInvToPlayers(
                data._id,
                userData.userid,
                data.gameType
              );
            } else {
              io.in(data._id.toString()).emit('lowBalance', {
                userid: userData.userid,
              });
            }
          }
        } else {
          socket.emit('roomFull', 'Room is Already Full');
        }
      } else {
        socket.emit('notFound', 'Room not Found');
      }
    } else {
      socket.emit('actionError', 'Action Error');
    }
  } catch (e) {
    console.log('error : ', e);
    socket.emit('actionError', 'Action Error');
  }
};

export const rejectJoinRequest = async (data, socket, io) => {
  try {
    const roomData = await getDoc(data.gameType, data._id);
    if (!roomData) {
      return socket.emit('noTable', 'No such table exists');
    }
    const userData = await getDoc('users', data.player.userid);
    if (userData) {
      userData.userid = data.player.userid;
      let room = await roomModel.findOne({
        _id: data.tableId,
      });

      if (room != null) {
        let leftrequest = room.joinRequests.filter(
          (e) => e.userid.toString() !== data.player.userid.toString()
        );

        let roomId = room._id;

        const savedroom = await roomModel.findByIdAndUpdate(room._id, {
          joinRequests: leftrequest,
        });
        const updatedRoom = await roomModel.findById(roomId);

        io.in(data._id.toString()).emit('updatePlayerList', updatedRoom);
        io.in(data._id.toString()).emit('rejected', {
          playerid: data.player.userid,
        });
      } else {
        socket.emit('notFound', 'Room not Found');
      }
    } else {
      socket.emit('actionError', 'Action Error');
    }
  } catch (e) {
    console.log('error : ', e);
    scoket.emit('actionError', 'Action Error');
  }
};

export const startPreflopRound = async (data, socket, io) => {
  try {
    console.log('INSIDE PREFOLP ROUND', data);
    let room = await gameService.getGameById(data.tableId);
    console.log({ room });
    if (room && room.players.length === 1) {
      return socket.emit('OnlyOne', room);
    }
    if (room && !room.gamestart) {
      await roomModel.findOneAndUpdate(
        { _id: convertMongoId(data._id) },
        {
          pause: false,
        },
        { new: true }
      );
      console.log('Before preflopround function');
      await preflopround(room, io);
    }
  } catch (e) {
    console.log('error : ', e);
    socket.emit('actionError', 'Action Error');
  }
};

export const joinWatcherRequest = async (data, socket, io) => {
  try {
    const roomData = await getDoc(data.gameType, data._id);
    if (!roomData) {
      return socket.emit('noTable', 'No such table exists');
    }
    const userData = await getDoc('users', data.userId);
    if (userData) {
      userData.userid = data.userId;
      if (roomData.table.alloWatchers) {
        const room = await roomModel.findOne({ _id: data.tableId });
        let player = room.players;

        if (
          player.find(
            (ele) => (ele.id ? ele.id : ele.userid) === data.userId
          ) ||
          room.watchers.find(
            (ele) => (ele.id ? ele.id : ele.userid) === data.userId
          )
        ) {
          return socket.emit('alreadyJoin', '');
        }
        await addWatcher(data.userId, data._id, data.gameType);
        const deduct = await deductAmount(
          userData.stats.total.coins,
          data.userId,
          'wacher',
          100,
          'no-media'
        );
        const updateRoom = await roomModel.findOneAndUpdate(
          { _id: data.tableId },
          {
            $push: {
              watchers: {
                userid: userData.userid,
                name: userData.nickname,
                photoURI: userData.photoURI,
                hands: [],
                wallet: deduct,
                initialCoinBeforeStart: userData.stats.total.coins,
                gameJoinedAt: new Date(),
              },
            },
          },
          {
            new: true,
          }
        );

        socket.join(data._id.toString() + 'watchers');
        io.in(data._id.toString() + 'watchers').emit('newWatcherJoin', {
          watcherId: userData.userid,
          roomData: updateRoom,
        });
      }
    } else {
      return socket.emit('noUser', 'No such User exists');
    }
  } catch (err) {
    console.log('Error in JoinWatcher request  =>', err.message);
  }
};

export const handleNewBet = async (data, socket, io) => {
  try {
    const { user, tableId, amount, betType, player } = data;

    let update;
    const room = await roomModel.findOneAndUpdate(
      {
        $and: [
          { tableId },
          {
            watchers: {
              $elemMatch: { userid: user.userid, wallet: { $gte: amount } },
            },
          },
        ],
      },
      {
        $inc: {
          'watchers.$.wallet': -amount,
        },
      }
    );

    if (room) {
      const prebet = await BetModal.findOne({ tableId });
      if (prebet) {
        const sameBet = prebet.bet.find(
          (ele) =>
            ele.selectedBetPlayer.id === player.id &&
            ele.betAmount === amount &&
            betType !== ele.betType &&
            ele.betBy.userid !== user.userid
        );

        if (sameBet) {
          update = await BetModal.findOneAndUpdate(
            { bet: { $elemMatch: { _id: sameBet._id } } },
            {
              'bet.$.betAcceptBy': user,
              'bet.$.isAccepted': true,
            },
            { new: true }
          );
          if (update) socket.emit('betMatched');
        } else {
          update = await BetModal.findOneAndUpdate(
            { tableId },
            {
              $push: {
                bet: {
                  betBy: user,
                  selectedBetPlayer: player,
                  betType,
                  betAmount: amount,
                },
              },
            },
            { new: true }
          );
        }
        if (update) {
          socket.emit('betCreated');
          io.in(_id.toString() + 'watchers').emit('newBetPlaced', update);
          io.in(_id.toString()).emit('watcherbet', data);
        }
      } else {
        const newbet = await BetModal.create({
          tableId,
          bet: [
            {
              betBy: user,
              selectedBetPlayer: player,
              betType,
              betAmount: amount,
            },
          ],
        });
        socket.emit('betCreated');
        io.in(_id.toString() + 'watchers').emit('newBetPlaced', newbet);
        io.in(_id.toString()).emit('watcherbet', data);
      }
    } else {
      socket.emit('lowBalanceBet', {
        userid: user.userid,
      });
    }
  } catch (err) {
    console.log('Error in handleNewBet =>', err.message);
  }
};

export const acceptBet = async (data, socket, io) => {
  try {
    const { betAcceptBy, betId, tableId } = data;
    const bet = await BetModal.findOne({ bet: { $elemMatch: { _id: betId } } });

    const betmatch = bet.bet.find((ele) => ele._id.toString() === betId);
    if (betAcceptBy.userid === betmatch.betBy.userid) {
      return socket.emit('yourBetCard', 'You cant bet on your bet card');
    }

    const room = await roomModel.findOneAndUpdate(
      {
        $and: [
          { tableId },
          {
            watchers: {
              $elemMatch: {
                userid: betAcceptBy.userid,
                wallet: { $gte: betmatch.betAmount },
              },
            },
          },
        ],
      },
      {
        $inc: {
          'watchers.$.wallet': -betmatch.betAmount,
        },
      }
    );
    if (room) {
      const update = await BetModal.findOneAndUpdate(
        { bet: { $elemMatch: { _id: betId } } },
        {
          'bet.$.betAcceptBy': betAcceptBy,
          'bet.$.isAccepted': true,
        },
        { new: true }
      );
      if (update) {
        io.in(update._id.toString() + 'watchers').emit('newBetPlaced', update);
      }
    } else {
      socket.emit('lowBalanceBet', {
        userid: betAcceptBy.userid,
      });
    }
  } catch (err) {
    console.log('Error in Accept Bet', err.message);
  }
};

export const handleWatcherWinner = async (room, io) => {
  try {
    let watcherWinners = [];
    let notBet = [];
    let playerWinner = room.winnerPlayer;
    let bets = await BetModal.findOne({ tableId: room._id });
    let roomWatcher = await roomModel.findOne({ _id: room._id });
    let watchers = roomWatcher?.watchers;
    if (bets) {
      bets.bet.forEach(async (item, i) => {
        if (item.isAccepted) {
          let isWinner = playerWinner.find(
            (ele) => ele.id === item.selectedBetPlayer.id
          );
          let watcherbetByIndex = watchers.findIndex(
            (ele) => ele.userid === item.betBy.userid
          );
          let watcherBetAccetByIndex = watchers.findIndex(
            (ele) => ele.userid === item.betAcceptBy.userid
          );
          if (isWinner) {
            if (item.betType) {
              watcherWinners.push({
                userid: item.betBy.userid,
                amount: item.betAmount * 2,
                betId: item._id,
              });

              watchers[watcherbetByIndex].hands.push({
                action: 'win-as-watcher',
                amount: item.betAmount,
                date: new Date(),
                isWatcher: true,
              });
              watchers[watcherBetAccetByIndex].hands.push({
                action: 'lose-as-watcher',
                amount: item.betAmount,
                date: new Date(),
                isWatcher: true,
              });
            } else {
              watcherWinners.push({
                userid: item.betAcceptBy.userid,
                amount: item.betAmount * 2,
                betId: item._id,
              });

              watchers[watcherbetByIndex].hands.push({
                action: 'lose-as-watcher',
                amount: item.betAmount,
                date: new Date(),
                isWatcher: true,
              });
              watchers[watcherBetAccetByIndex].hands.push({
                action: 'win-as-watcher',
                amount: item.betAmount,
                date: new Date(),
                isWatcher: true,
              });
            }
          } else {
            if (!item.betType) {
              watcherWinners.push({
                userid: item.betBy.userid,
                amount: item.betAmount * 2,
                betId: item._id,
              });

              watchers[watcherbetByIndex].hands.push({
                action: 'win-as-watcher',
                amount: item.betAmount,
                date: new Date(),
                isWatcher: true,
              });
              watchers[watcherBetAccetByIndex].hands.push({
                action: 'lose-as-watcher',
                amount: item.betAmount,
                date: new Date(),
                isWatcher: true,
              });
            } else {
              watcherWinners.push({
                userid: item.betAcceptBy.userid,
                amount: item.betAmount * 2,
                betId: item._id,
              });

              watchers[watcherbetByIndex].hands.push({
                action: 'lose-as-watcher',
                amount: item.betAmount,
                date: new Date(),
                isWatcher: true,
              });
              watchers[watcherBetAccetByIndex].hands.push({
                action: 'win-as-watcher',
                amount: item.betAmount,
                date: new Date(),
                isWatcher: true,
              });
            }
          }
        } else {
          notBet.push({ userid: item.betBy.userid, amount: item.betAmount });
        }
      });
      io.in(room._id.toString() + 'watchers').emit('watcherWinners', {
        winner: watcherWinners,
      });
      watcherWinners.forEach(async (item, i) => {
        let index = watchers.findIndex((ele) => ele.userid === item.userid);
        if (index !== -1) {
          watchers[index].wallet += item.amount;
        }
      });
      notBet.forEach(async (item) => {
        let index = watchers.findIndex((ele) => ele.userid === item.userid);
        if (index !== -1) {
          watchers[index].wallet += item.amount;
        }
      });
      await BetModal.deleteOne({ _id: room._id });
      await roomModel.updateOne(
        { _id: room._id },
        {
          watchers,
        }
      );
    }
  } catch (err) {
    console.log('Error in watcher winner Bet', err.message);
  }
};

export const findLoserAndWinner = async (room) => {
  let player;
  let winner = room.winnerPlayer;
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
  let looser = [];
  let winners = [];
  player.forEach((item, i) => {
    let data = winner.find((ele) => item.id === ele.id);
    if (data) {
      winners.push(item);
    } else {
      looser.push(item);
    }
  });
  await finishHandUpdate(winners, looser, room._id, room.gameType);
};

export const finishedTableGame = async (room) => {
  try {
    const dd = await leaveApiCall(room);
    if (dd || room.finish) await roomModel.deleteOne({ _id: room._id });
  } catch (err) {
    console.log('Error in finished game function =>', err.message);
  }
};

export const addBuyIn = async (
  amt,
  userId,
  usd,
  payMethod,
  cardNr,
  tableId,
  io,
  socket
) => {
  try {
    const room = await roomModel.findOne({ tableId });

    if (room && room.watchers.find((ele) => ele.userid === userId)) {
      let hand = room.watchers.find((ele) => ele.userid === userId).hands;
      hand.push({
        action: 'buy-coins',
        amount: amt,
        date: new Date(),
        isWatcher: true,
        usd: usd / 100,
        payMethod: payMethod,
        cardNr: cardNr,
      });
      let wallet = room.watchers.find((ele) => ele.userid === userId).wallet;
      wallet = wallet === false ? amt : wallet + amt;

      const updateRoom = await roomModel.findOneAndUpdate(
        { tableId, 'watchers.userid': userId },
        {
          'watchers.$.wallet': wallet,
          'watchers.$.hands': hand,
        },
        {
          new: true,
        }
      );

      if (updateRoom) {
        io.in(_id.toString()).emit('CoinsAdded', {
          userId,
          name: updateRoom.watchers.find((ele) => ele.userid === userId).name,
          amt,
        });
      } else {
        socket.emit('addFail');
      }
    } else {
      const updateRoom = await roomModel.findOneAndUpdate(
        { tableId },
        {
          $push: {
            buyin: {
              userid: userId,
              chips: amt,
              redeem: 0,
              usd: usd / 100,
              payMethod,
              cardNr,
            },
          },
        },
        {
          new: true,
        }
      );
      if (updateRoom) {
        io.in(_id.toString()).emit('CoinsAdded', {
          userId,
          name: updateRoom.players.find((ele) => ele.userid === userId).name,
          amt,
        });
      } else {
        socket.emit('addFail');
      }
    }
  } catch (err) {
    console.log('Error in addBuyIn =>', err.message);
    return true;
  }
};

export const leaveAndJoinWatcher = async (data, io, socket) => {
  try {
    await doLeaveTable(data, io, socket);
    await joinWatcherRequest(data, socket, io);
    socket.emit('joinAndLeave', {
      msg: 'Success',
    });
  } catch (err) {
    console.log('Error in leaveJoinWatcher =>', err.message);
  }
};

export const InvitePlayers = async (data, socket, io) => {
  try {
    let invPlayers = [];
    let newInvPlayers = [];
    const room = await roomModel.findOne({ _id: data.tableId });
    if (room) {
      invPlayers = room.invPlayers;
      data.invPlayers.forEach((ele) => {
        invPlayers.push(ele.value);
        newInvPlayers.push(ele.value);
      });
    }
    const updateRoom = await roomModel.findOneAndUpdate(
      { _id: data.tableId },
      {
        invPlayers: invPlayers,
      },
      { new: true }
    );
    if (updateRoom) {
      const res = await axios.get(
        'https://invite2-lobby-t3e66zpola-ue.a.run.app/',
        {
          params: {
            usid: data.userId,
            game: data.gameType,
            tabId: data._id,
            toInvite: newInvPlayers.join(','),
          },
          headers: {
            'Content-Type': 'application/json',
            origin: socket.handshake.headers.origin,
          },
        }
      );
      if (res.data.error === 'no error') {
        socket.emit('invitationSend');
      } else {
        socket.emit('noInvitationSend');
      }
    }
  } catch (err) {
    console.log('Error in InvitePlayer Function =>', err.message);
  }
};

export const doLeaveWatcher = async (data, io, socket) => {
  try {
    const { tableId, userId, gameType } = data;
    const room = await roomModel.findOne({ tableId });
    const isCalled = await leaveApiCall(room, userId);
    if (isCalled) {
      const updatedRoom = await roomModel.findOneAndUpdate(
        { tableId, 'watchers.userid': userId },
        {
          $pull: {
            watchers: { userid: userId },
          },
        },
        {
          new: true,
        }
      );
      if (updatedRoom) {
        io.in(_id.toString()).emit('updatePlayerList', updatedRoom);
        setTimeout(() => {
          socket.emit('reload');
        }, 30000);
      }
    }
  } catch (err) {
    console.log('Error in doLeaveWatcher =>', err.message);
  }
};

const createTransactionFromUsersArray = (roomId, users = []) => {
  let transactionObjectsArray = [];
  const rankModelUpdate = [];

  users.forEach((el, i) => {
    let updatedAmount = el.coinsBeforeJoin;
    const userId = el.uid;

    let totalWinAmount = 0;
    let totalLossAmount = 0;
    let totalWin = 0;
    let totalLose = 0;

    const handsTransaction = el.hands.map((elem) => {
      console.log({ elem });
      if (elem.action === 'game-lose') {
        console.log('GAME LOSE');
        totalLossAmount += elem.amount;
        totalLose++;
      } else {
        console.log('GAME WIN');
        totalWinAmount += elem.amount;
        totalWin++;
      }

      const gameWinOrLoseamount =
        elem.action === 'game-lose' ? -elem.amount : elem.amount;
      const lastAmount = updatedAmount;
      updatedAmount = updatedAmount + gameWinOrLoseamount;
      return {
        userId,
        roomId,
        amount: gameWinOrLoseamount,
        transactionDetails: {},
        prevWallet: lastAmount,
        updatedWallet: updatedAmount,
        transactionType: 'poker',
      };
    });

    console.log({ totalWin, totalLose, totalWinAmount, totalLossAmount });

    if (totalWin || totalLose || totalWinAmount || totalLossAmount) {
      rankModelUpdate.push(
        rankModel.updateOne(
          {
            userId: convertMongoId(userId),
            gameName: 'poker',
          },
          {
            $inc: {
              win: totalWin,
              loss: totalLose,
              totalWinAmount: totalWinAmount,
              totalLossAmount: totalLossAmount,
            },
          },
          { upsert: true }
        )
      );
    }

    transactionObjectsArray = [...transactionObjectsArray, ...handsTransaction];
    users[i].newBalance = updatedAmount;
  });

  return [transactionObjectsArray, rankModelUpdate];
};

export const leaveApiCall = async (room, userId) => {
  try {
    let player;
    console.log('leave api call', room.players.length);
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
    if (
      !userId ||
      (!player.find((el) =>
        el.id
          ? el.id.toString() === userId?.toString()
          : el.userid.toString() === userId?.toString()
      ) &&
        room.players.find((el) => el.userid.toString() === userId?.toString()))
    ) {
      player = room.players;
    }
    let url = '';
    if (!userId && room.handWinner.length === 0 && room.runninground === 0) {
      url = 'https://leave-table-t3e66zpola-uc.a.run.app/all'; // for all user leave before any hands
    } else if (
      userId &&
      room.handWinner.length === 0 &&
      room.runninground === 0
    ) {
      url = 'https://leave-table-t3e66zpola-uc.a.run.app/single'; // for one user leave before any hands
    } else if (userId && (room.runninground === 0 || room.runninground === 5)) {
      url = 'https://leave-tab-v2-posthand-one-t3e66zpola-uc.a.run.app/'; // for one user leave after/before hand
    } else if (userId && room.runninground !== 0 && room.runninground !== 5) {
      url = 'https://leave-tab-v2-inhand-one-t3e66zpola-uc.a.run.app/'; // for one user leave during hand
    } else {
      url = 'https://leave-tab-v2-posthand-all-t3e66zpola-uc.a.run.app/'; // for all user leave after playing any hand
    }

    let allUsers = player.concat(room.watchers).concat(room.sitOut);

    console.log({
      allUsers: JSON.stringify(allUsers),
      userId,
      runningRound: room.runninground,
    });

    if (userId) {
      allUsers = allUsers.filter(
        (ele) =>
          (ele.id ? ele.id.toString() : ele.userid.toString()) ===
          userId.toString()
      );
    }

    let users = [];
    console.log({ users });
    allUsers.forEach((item) => {
      console.log({ item });
      let hands = item.hands ? [...item.hands] : [];
      let uid = item.id ? item.id : item.userid;
      console.log({ uid });
      console.log({ hands });
      if (room.runninground !== 0 && room.runninground !== 5) {
        hands.push({
          action: 'game-lose',
          amount: item.pot + item.prevPot || 0,
          date: new Date(),
          isWatcher: room.watchers.find(
            (ele) => ele.userid.toString() === uid.toString()
          )
            ? true
            : false,
        });
      }

      users.push({
        uid,
        hands:
          url === 'https://leave-tab-v2-posthand-all-t3e66zpola-uc.a.run.app/'
            ? []
            : hands,
        coinsBeforeJoin: item.initialCoinBeforeStart,
        gameLeaveAt: new Date(),
        gameJoinedAt: item.gameJoinedAt,
        isWatcher: room.watchers.find((ele) => ele.userid === uid)
          ? true
          : false,
      });
    });

    let payload = {
      mode:
        room.runninground === 0 || room.runninground === 5
          ? 'afterHand'
          : 'duringHand',
      gameColl: room.gameType,
      _id: room._id,
      buyIn: room.gameType === 'pokerTournament_Tables' ? room.maxchips : 0,
      playerCount: player.length,
      users: users,
      adminUid: room.hostId,
    };

    const [transactions, rankModelUpdate] = createTransactionFromUsersArray(
      room._id,
      users
    );
    const userBalancePromise = users.map((el) => {
      return userModel.updateOne(
        {
          _id: convertMongoId(el.uid),
        },
        { wallet: el.newBalance }
      );
    });

    if (userId) {
      const response = await Promise.allSettled([
        // Remove user from the room
        roomModel.updateOne(
          { _id: room._id, 'players.userid': userId },
          {
            $pull: {
              players: { userid: userId },
            },
          }
        ),
        // Create transaction
        transactionModel.insertMany(transactions),
        // Update user wallet
        ...userBalancePromise,
        ...rankModelUpdate,
      ]);
      console.log(response);
    } else {
      const response = await Promise.allSettled([
        // Create transaction
        transactionModel.insertMany(transactions),
        // Update user wallet
        ...userBalancePromise,
        ...rankModelUpdate,
      ]);
    }
    return true;
  } catch (err) {
    console.log('Error in Leave APi call =>', err.message);
    return false;
  }
};

export const finishHandApiCall = async (room, userId) => {
  try {
    console.log('finish hand api call');
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
    let allUsers = player.concat(room.watchers).concat(room.sitOut);
    if (userId)
      allUsers = allUsers.filter(
        (ele) => (ele.id ? ele.id : ele.userid) === userId
      );
    let users = [];
    allUsers.forEach((item) => {
      if (!item.playing) return;
      console.log('playing user hands ==>', item.hands);
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
      _id: room._id,
      buyIn: room.gameType === 'pokerTournament_Tables' ? room.maxchips : 0,
      playerCount: player.length,
      users: users,
      adminUid: room.hostId,
    };
    console.log('payload =>', payload);

    let newPlayers = [];
    for await (let item of room.players) {
      newPlayers.push({
        ...item,
        hands: [],
        userid: item.id ? item.id : item.userid,
      });
    }
    await roomModel.updateOne(
      { _id: room._id },
      {
        players: newPlayers,
      }
    );
    console.log('Players =>', newPlayers);
    return true;
  } catch (err) {
    console.log('Error in finishHand APi call =>', err.message);
    return false;
  }
};

// NEW functions
export const checkForGameTable = async (data, socket, io) => {
  try {
    const { gameId, userId } = data;
    const game = await gameService.getGameById(gameId);
    console.log({ userId, game });
    if (!game || game.finish) {
      console.log('HERE');
      return socket.emit('notFound', {
        message: 'Game not found. Either game is finished or not exist',
      });
    }
    let lastSocketData = io.room || [];
    lastSocketData.push({ gameId, pretimer: false, room: gameId.toString() });
    io.room = [...new Set(lastSocketData.map((ele) => ele.room))].map((el) => ({
      room: el,
      pretimer: false,
    }));
    socket.customRoom = gameId;

    const user = await userService.getUserById(userId);

    if (!user) {
      return socket.emit('notAuthorized', {
        message: 'You are not authorized',
      });
    }

    const ifUserInGame = game.players.find((el) => {
      return el.userid?.toString() === userId.toString();
    });

    // check user
    if (game.smallBlind > user.wallet && !ifUserInGame) {
      return socket.emit('notEnoughBalance', {
        message: "You don't have enough balance to sit on the table.",
      });
    }

    lastSocketData = io.users;
    lastSocketData.push(userId.toString());
    io.users = [...new Set(lastSocketData)];
    socket.customId = userId;

    // if user is already in the room
    if (ifUserInGame) {
      socket.join(gameId);
      io.in(gameId).emit('updateGame', { game });
      return;
    }

    const checkIfInOtherGame = await gameService.checkIfUserInGame(userId);
    if (checkIfInOtherGame) {
      return socket.emit('inOtherGame', {
        message: 'You are also on other tabe.',
      });
    }

    // If user is not in the room
    const updatedRoom = await gameService.joinRoomByUserId(game, userId);
    console.log({ updatedRoom });
    if (updatedRoom) {
      socket.join(gameId);
      io.in(gameId).emit('updateGame', { game: updatedRoom });
      return;
    }
    console.log({ updatedRoom, game });
    socket.emit('notInvited', { message: 'Your are not invited.' });
  } catch (error) {
    console.log('Error in check for table =>', error);
    socket.emit('socketError', error.message);
  }
};
