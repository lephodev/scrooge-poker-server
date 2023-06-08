import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import pathDirectory from "path";
import transactionModel from "../models/transaction";
import { userJwtKey, adminJwtKey } from "../config/keys";
import roomModel from "../models/room";
import mongoose from "mongoose";
import tournamentModel from "../models/tournament";
import userModel from "../landing-server/models/user.model";
import each from "sync-each";
import BetModal from "../models/betModal";
import gameService from "../service/game.service";
import userService from "../service/user.service";
import rankModel from "../models/rankModel";
var Hand = require("pokersolver").Hand;
import MessageModal from "../models/messageModal";
import Notification from "../models/notificationModal";
import User from "../landing-server/models/user.model";
import { decryptCard, EncryptCard } from "../validation/poker.validation";
import payouts from "../config/payout.json";

let gameRestartSeconds = 3000;
const playerLimit = 9;
const convertMongoId = (id) => mongoose.Types.ObjectId(id);
const img =
  "https://i.pinimg.com/736x/06/d0/00/06d00052a36c6788ba5f9eeacb2c37c3.jpg";

const addUserInSocket = (io, socket, gameId, userId) => {
  try {
    let lastSocketData = io.room || [];
    // Add room
    lastSocketData.push({ gameId, pretimer: false, room: gameId.toString() });
    io.room = [
      ...new Set(lastSocketData.map((ele) => ele.room.toString())),
    ].map((el) => ({
      room: el,
      pretimer: false,
    }));
    // console.log("Socket room After ", io.room);
    // Add users
    lastSocketData = io.users;
    // console.log("Socket Users BEFORE ", io.users);
    lastSocketData.push(userId.toString());
    io.users = [...new Set(lastSocketData)];
    // console.log("Socket Users After ", io.users);
    // Add user id and room id in socket
    socket.customId = userId.toString();
    socket.customRoom = gameId.toString();
    //console.log({ customId: socket.customId, customRoom: socket.customRoom });
    // JOIN USER IN GAME ROOM
    socket.join(gameId);
    console.log("io users", io.users);
  } catch (error) {
    console.log("Error in add user in socket", error);
  }
};

//checking if request body is valid
export const checkIfEmpty = (requestBody) => {
  try {
    const values = Object.values(requestBody);
    let isEmpty = values.filter((el) => !el);
    return {
      isValid: isEmpty.length > 0 ? false : true,
    };
  } catch (error) {
    console.log("checkIfEmpty", error);
  }
};

//signing jwt token
export const signJwt = (userid) => {
  let token;
  try {
    const tokenData = {
      userid,
    };
    token = jwt.sign(tokenData, userJwtKey, {
      expiresIn: "100h",
    });
  } catch (e) {
    console.log("eeee", e);
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
      console.log("hashhh", e);
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
      console.log("ererer", e);
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
      expiresIn: "100h",
    });
  } catch (e) {
    console.log("eeee", e);
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
      console.log("yuyu", e);
      reject(false);
    }
  });
};

export const checkFileType = (file, cb) => {
  try {
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
      cb("Error: Images Only!");
    }
  } catch (error) {
    console.log("file Type", error);
  }
};

export const verifycards = (distributedCards, noOfCards) => {
  try {
    let cards = [];
    const suits = ["h", "s", "c", "d"];
    const values = ["A", 2, 3, 4, 5, 6, 7, 8, 9, "T", "J", "Q", "K"];
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
  } catch (error) {
    console.log("carrsssdss", error);
  }
};

export const getSidePOt = async (roomId) => {
  const updatedRoomData = await roomModel.findOne({ _id: roomId });
  let sidePot = updatedRoomData.sidePots;
  let playerData = [];
  switch (updatedRoomData.runninground) {
    case 0:
      playerData = updatedRoomData.players;
      break;
    case 1:
      playerData = updatedRoomData.preflopround;
      break;
    case 2:
      playerData = updatedRoomData.flopround;
      break;
    case 3:
      playerData = updatedRoomData.turnround;
      break;
    case 4:
      playerData = updatedRoomData.riverround;
      break;
    case 5:
      playerData = updatedRoomData.showdown;
      break;
    default:
      playerData = updatedRoomData.players;
  }
  if (
    updatedRoomData.allinPlayers.length &&
    updatedRoomData.allinPlayers.length + 1 > sidePot.length
  ) {
    const roundData = playerData;
    const z = (roundData1) => {
      let otherPlayer = roundData1.filter(
        (el) => el.prevPot > 0 && el.fold === false
      );
      const foldPlayer = roundData1.filter(
        (el) => el.prevPot > 0 && el.fold === true
      );
      const pots = [];
      otherPlayer.forEach((element) => {
        pots.push(element.prevPot);
      });
      pots.sort(function (a, b) {
        return a - b;
      });
      let sidePotValue = 0;
      const playersOfPot = [];
      otherPlayer.forEach((el) => {
        if (el.prevPot < pots[0]) {
          sidePotValue += el.prevPot;
          el.prevPot = 0;
        } else {
          el.prevPot -= pots[0];
          sidePotValue += pots[0];
        }
        playersOfPot.push(el.position);
      });
      foldPlayer.forEach((el) => {
        if (el.prevPot < pots[0]) {
          sidePotValue += el.prevPot;
          el.prevPot = 0;
        } else {
          el.prevPot -= pots[0];
          sidePotValue += pots[0];
        }
      });
      if (playersOfPot.length === 1) {
        playerData[playersOfPot[0]].wallet += sidePotValue;
      } else {
        sidePot.push({ pot: sidePotValue, players: playersOfPot });
      }

      otherPlayer = roundData1.filter(
        (el) => el.prevPot > 0 && el.fold === false
      );
      if (otherPlayer.length) {
        z(otherPlayer);
      }
    };
    z(roundData);
    sidePot = sidePot.filter((el) => el.pot > 0 && el.players.length > 0);
    if (sidePot.length > 2) {
      const pots = [];
      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < sidePot.length; i++) {
        const p = { pot: sidePot[i].pot, players: sidePot[i].players };
        // eslint-disable-next-line no-plusplus
        for (let j = i + 1; j < sidePot.length; j++) {
          // eslint-disable-next-line no-loop-func
          if (
            p.players.every((val, index) => val === sidePot[j].players[index])
          ) {
            p.pot += sidePot[j].pot;
          }
        }
        pots.push(p);
      }
      const filterPot = pots.filter(
        (value, index, self) =>
          index ===
          self.findIndex(
            (t) => t.players.toString() === value.players.toString()
          )
      );
      sidePot = filterPot;
    }
    switch (updatedRoomData.runninground) {
      case 0:
        await roomModel.updateOne(
          { _id: updatedRoomData._id },
          { sidePots: sidePot, players: playerData, pot: 0 }
        );
        break;
      case 1:
        await roomModel.updateOne(
          { _id: updatedRoomData._id },
          { sidePots: sidePot, preflopround: playerData, pot: 0 }
        );
        break;
      case 2:
        await roomModel.updateOne(
          { _id: updatedRoomData._id },
          { sidePots: sidePot, flopround: playerData, pot: 0 }
        );
        break;
      case 3:
        await roomModel.updateOne(
          { _id: updatedRoomData._id },
          { sidePots: sidePot, turnround: playerData, pot: 0 }
        );
        break;
      case 4:
        await roomModel.updateOne(
          { _id: updatedRoomData._id },
          { sidePots: sidePot, riverround: playerData, pot: 0 }
        );
        break;
      case 5:
        await roomModel.updateOne(
          { _id: updatedRoomData._id },
          { sidePots: sidePot, showdown: playerData, pot: 0 }
        );
        break;
      default:
        await roomModel.updateOne(
          { _id: updatedRoomData._id },
          { sidePots: sidePot, players: playerData, pot: 0 }
        );
    }
  } else if (updatedRoomData.allinPlayers.length && sidePot.length) {
    playerData.forEach((el) => {
      sidePot[sidePot.length - 1].pot += el.prevPot;
      el.prevPot = 0;
    });
    // sidePot[sidePot.length - 1].pot += updatedRoomData.pot;
    switch (updatedRoomData.runninground) {
      case 0:
        await roomModel.updateOne(
          { _id: updatedRoomData._id },
          { sidePots: sidePot, players: playerData, pot: 0 }
        );
        break;
      case 1:
        await roomModel.updateOne(
          { _id: updatedRoomData._id },
          { sidePots: sidePot, preflopround: playerData, pot: 0 }
        );
        break;
      case 2:
        await roomModel.updateOne(
          { _id: updatedRoomData._id },
          { sidePots: sidePot, flopround: playerData, pot: 0 }
        );
        break;
      case 3:
        await roomModel.updateOne(
          { _id: updatedRoomData._id },
          { sidePots: sidePot, turnround: playerData, pot: 0 }
        );
        break;
      case 4:
        await roomModel.updateOne(
          { _id: updatedRoomData._id },
          { sidePots: sidePot, riverround: playerData, pot: 0 }
        );
        break;
      case 5:
        await roomModel.updateOne(
          { _id: updatedRoomData._id },
          { sidePots: sidePot, showdown: playerData, pot: 0 }
        );
        break;
      default:
        await roomModel.updateOne(
          { _id: updatedRoomData._id },
          { sidePots: sidePot, players: playerData, pot: 0 }
        );
    }
  }
};

export const preflopPlayerPush = async (players, roomid) => {
  try {
    const roomData = await roomModel
      .findOne({ _id: convertMongoId(roomid) })
      .lean();
    let distributedCards = [];
    let newP = [];
    players.forEach((player) => {
      if (!newP.find((p) => p.id === player.id || p.id === player.userid)) {
        let playing;
        let checkcards = [];
        if (typeof player.playing !== "undefined" && player.playing !== null) {
          playing = player.playing;
        } else {
          playing = true;
        }

        if (player.wallet <= 0) {
          playing = false;
        }

        if (playing) {
          checkcards = verifycards(distributedCards, 2);
          checkcards = checkcards.map((e) => {
            distributedCards.push(e);
            return EncryptCard(e);
          });
        }

        newP.push({
          cards: checkcards,
          id: player.userid || player.id,
          name: player.name,
          photoURI: player.photoURI,
          wallet: player.wallet,
          timebank: player.timebank,
          playing,
          fold: false,
          playerchance: roomData.timer,
          action: null,
          actionType: null,
          prevPot: 0,
          pot: 0,
          position: player.position,
          playing: playing,
          missedSmallBlind: player.missedSmallBlind,
          missedBigBlind: player.missedBigBlind,
          missedBilndAmt: 0,
          forceBigBlind: player.forceBigBlind,
          stats: player.stats,
          initialCoinBeforeStart: player.initialCoinBeforeStart,
          gameJoinedAt: player.gameJoinedAt,
          hands: player.hands,
          meetingToken: player.meetingToken,
          items: player.items,
          chipsBeforeHandStart: player.chipsBeforeHandStart,
        });
      }
    });

    await roomModel.updateOne(
      {
        _id: convertMongoId(roomid),
      },
      {
        preflopround: newP,
      }
    );
  } catch (error) {
    console.log("error in preflopplayer push function =>", error);
  }
};

export const preflopround = async (room, io) => {
  try {
    console.log("preflop round executed");
    // console.log("io", io);
    await updateRoomForNewHand(room._id, io);

    // console.log("io", io);
    room = await roomModel.findOne(room._id).lean();
    console.log("room players ==>", room);
    if (!room) {
      return;
    }

    let playingPlayer = room?.players?.filter(
      (el) => el.playing && el.wallet > 0
    );
    console.log("Playing playerssss ==>", playingPlayer);
    let positions = room?.players?.map((pos) => pos.position);
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
      console.log("playingPlayer =====>", playingPlayer);
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
    console.log("playingPlayer =====> 2", playingPlayer);
    if (!room.finish) {
      if (room.runninground === 0) {
        if (playingPlayer.length > 1) {
          await roomModel.updateOne(
            {
              _id: room._id,
            },
            {
              runninground: 1,
              gamestart: true,
              isGameRunning: true,
              pause: false,
            }
          );

          await preflopPlayerPush(room.players, room._id);
          const room1111 = await roomModel
            .findOne({ _id: room._id })
            .populate("tournament");

          const bigBlindAmt = room1111.tournament
            ? room1111.tournament.levels.bigBlind.amount
            : room1111.bigBlind;
          const smallBlindAmt = room1111.tournament
            ? room1111.tournament.levels.smallBlind.amount
            : room1111.smallBlind;
          let smallBlindDeducted = 0;
          let smallBlindPosition = null;
          let bigBlindPosition = null;
          let dealerPosition = null;
          let totalplayer =
            room1111.preflopround.length + room1111.eleminated.length;

          const checkIsPlaying = (d, type) => {
            if (typeof type === "number") {
              if (
                room1111.preflopround.find(
                  (e) => e.position === d && e.playing && e.position !== type
                )
              ) {
                return d;
              }
            } else if (
              room1111.preflopround.find((e) => e.position === d && e.playing)
            ) {
              return d;
            }

            if (d < totalplayer - 1) {
              d += 1;
            } else {
              d = 0;
            }
            return checkIsPlaying(d, type);
          };

          if (
            room1111.dealerPosition === null ||
            room1111.dealerPosition === totalplayer - 1
          ) {
            dealerPosition = 0;
          } else if (room1111.dealerPosition < totalplayer - 1) {
            dealerPosition = room1111.dealerPosition + 1;
          }

          dealerPosition = checkIsPlaying(dealerPosition);

          if (dealerPosition === totalplayer - 1) {
            smallBlindPosition = 0;
          } else {
            smallBlindPosition = dealerPosition + 1;
          }
          smallBlindPosition = checkIsPlaying(smallBlindPosition);

          if (smallBlindPosition === totalplayer - 1) {
            bigBlindPosition = 0;
          } else {
            bigBlindPosition = smallBlindPosition + 1;
          }
          bigBlindPosition = checkIsPlaying(
            bigBlindPosition,
            smallBlindPosition
          );

          let smallLoopTime = 0;
          const allinPlayer = room1111.allinPlayers;

          const deductSmallBlind = async () => {
            const playerAvilable = room1111.players.filter(
              (el) =>
                el.position === smallBlindPosition &&
                el.playing &&
                el.wallet > 0
            );
            if (playerAvilable.length) {
              if (playerAvilable[0].wallet > smallBlindAmt) {
                await roomModel.updateOne(
                  {
                    _id: room._id,
                    "preflopround.position": smallBlindPosition,
                  },
                  {
                    $inc: {
                      "preflopround.$.wallet": -smallBlindAmt,
                      "preflopround.$.pot": +smallBlindAmt,
                    },

                    smallBlind: smallBlindAmt,
                    smallBlindPosition,
                    dealerPosition,
                    "preflopround.$.missedSmallBlind": false,
                    "preflopround.$.missedBigBlind": false,
                    "preflopround.$.forceBigBlind": false,
                  }
                );
              } else {
                allinPlayer.push({
                  id: playerAvilable[0].id,
                  amt: playerAvilable[0].wallet,
                  wallet: playerAvilable[0].wallet,
                  round: 1,
                });
                await roomModel.updateOne(
                  {
                    _id: room._id,
                    "preflopround.id": playerAvilable[0].id,
                  },
                  {
                    $inc: {
                      "preflopround.$.wallet": -playerAvilable[0].wallet,
                      "preflopround.$.pot": +playerAvilable[0].wallet,
                    },
                    "preflopround.$.action": true,
                    "preflopround.$.actionType": "all-in",
                    smallBlind: smallBlindAmt,
                    lastAction: "all-in",
                    allinPlayers: allinPlayer,
                    smallBlindPosition,
                    dealerPosition,
                    "preflopround.$.missedSmallBlind": false,
                    "preflopround.$.missedBigBlind": false,
                    "preflopround.$.forceBigBlind": false,
                  }
                );
              }

              smallBlindDeducted = 1;
            } else {
              const isPlayerSitOut = room.preflopround.filter(
                (el) => el.position === smallBlindPosition && !el.playing
              );
              if (isPlayerSitOut.length) {
                await roomModel.updateOne(
                  {
                    _id: room._id,
                    "preflopround.position": smallBlindPosition,
                  },
                  {
                    "preflopround.$.missedSmallBlind": true,
                  }
                );
              }
              if (smallLoopTime < totalplayer) {
                if (smallBlindPosition < totalplayer - 1) {
                  smallBlindPosition += 1;
                } else if (smallBlindPosition === totalplayer - 1) {
                  smallBlindPosition = 0;
                }
                if (
                  bigBlindPosition < totalplayer - 1 &&
                  smallBlindPosition === bigBlindPosition
                ) {
                  bigBlindPosition += 1;
                } else if (
                  bigBlindPosition === totalplayer - 1 &&
                  smallBlindPosition === bigBlindPosition
                ) {
                  bigBlindPosition = 0;
                }

                if (smallBlindPosition === 0) {
                  dealerPosition = totalplayer - 1;
                } else {
                  dealerPosition = smallBlindPosition - 1;
                }

                smallLoopTime += 1;
              } else {
                io.in(room._id.toString()).emit("notification", {
                  msg: "Player don't have enough chips for start another game",
                });
              }
            }
            if (smallBlindDeducted < 1) {
              await deductSmallBlind();
            }
          };
          await deductSmallBlind();

          let bigBlindDeducted = 0;
          let bigLoopTime = 0;

          const deductBigBlind = async () => {
            const playerAvilable = room1111.players.filter(
              (el) =>
                el.position === bigBlindPosition && el.playing && el.wallet > 0
            );
            if (playerAvilable.length) {
              if (playerAvilable[0].wallet > bigBlindAmt) {
                await roomModel.updateOne(
                  {
                    _id: room._id,
                    "preflopround.position": bigBlindPosition,
                  },
                  {
                    $inc: {
                      "preflopround.$.wallet": -bigBlindAmt,
                      "preflopround.$.pot": +bigBlindAmt,
                    },

                    bigBlind: bigBlindAmt,
                    bigBlindPosition,
                    raiseAmount: bigBlindAmt,
                    "preflopround.$.missedSmallBlind": false,
                    "preflopround.$.missedBigBlind": false,
                    "preflopround.$.forceBigBlind": false,
                  }
                );
              } else {
                allinPlayer.push({
                  id: playerAvilable[0].id,
                  amt: playerAvilable[0].wallet,
                  wallet: playerAvilable[0].wallet,
                  round: 1,
                });
                await roomModel.updateOne(
                  {
                    _id: room._id,
                    "preflopround.id": playerAvilable[0].id,
                  },
                  {
                    $inc: {
                      "preflopround.$.wallet": -playerAvilable[0].wallet,
                      "preflopround.$.pot": +playerAvilable[0].wallet,
                    },
                    "preflopround.$.action": true,
                    "preflopround.$.actionType": "all-in",
                    bigBlind: bigBlindAmt,
                    lastAction: "all-in",
                    allinPlayers: allinPlayer,
                    bigBlindPosition,
                    raiseAmount: bigBlindAmt,
                    "preflopround.$.missedSmallBlind": false,
                    "preflopround.$.missedBigBlind": false,
                    "preflopround.$.forceBigBlind": false,
                  }
                );
              }
              bigBlindDeducted = 1;
            } else {
              const isPlayerSitOut = room1111.preflopround.filter(
                (el) => el.position === bigBlindPosition && !el.playing
              );
              if (isPlayerSitOut.length) {
                await roomModel.updateOne(
                  {
                    _id: room._id,
                    "preflopround.position": bigBlindPosition,
                  },
                  {
                    "preflopround.$.missedBigBlind": true,
                  }
                );
              }
              if (bigLoopTime < totalplayer - 1) {
                if (bigBlindPosition < totalplayer - 1) {
                  bigBlindPosition += 1;
                } else if (bigBlindPosition === totalplayer - 1) {
                  bigBlindPosition = 0;
                }
                bigLoopTime += 1;
              } else {
                await roomModel.updateOne(
                  {
                    _id: room._id,
                    "preflopround.position": smallBlindPosition,
                  },
                  {
                    $inc: {
                      "preflopround.$.wallet": +smallBlindAmt,
                    },
                  }
                );
                io.in(room._id.toString()).emit("notification", {
                  msg: "Player don't have enough chips for start another game",
                });
              }
            }
            if (bigBlindDeducted < 1) {
              await deductBigBlind();
            }
          };
          await deductBigBlind();

          prefloptimer(room._id, io);
          let updatedRoom = await roomModel.findOne({
            _id: room._id,
          });

          io.in(room._id.toString()).emit("preflopround", updatedRoom);
        } else {
          io.in(room._id.toString()).emit("onlyOnePlayingPlayer", {
            msg: "Game finished, Only one player left",
            roomdata: room,
          });
        }
      } else {
        io.in(room._id.toString()).emit("tablestopped", {
          msg: "Game paused by host",
        });
      }
    } else {
      io.in(room._id.toString()).emit("tablestopped", {
        msg: "Table game has been finished",
      });
    }
  } catch (error) {
    console.log("Error in preflop round", error);
  }
};

export const prefloptimer = async (roomid, io) => {
  try {
    console.log("prefloptimer Id------->", roomid);
    const roomData = await roomModel.findOne({ _id: roomid });
    let totalPlayer = roomData.preflopround.length + roomData.eleminated.length;
    const timer = async (i, maxPosition) => {
      let j = roomData.timer;
      let t = "timer";
      let tx = roomData.timer;
      const udata = await roomModel.findOne({ _id: roomid });
      if (udata.runninground === 5) {
        return;
      }
      if (i < maxPosition) {
        const cPlayer = udata.preflopround.filter((el) => el.position === i);
        let cp = null;
        if (cPlayer.length) {
          if (
            cPlayer[0].wallet <= 0 ||
            cPlayer[0].fold ||
            !cPlayer[0].playing ||
            (cPlayer[0].pot >= udata.raiseAmount && cPlayer[0].action)
          ) {
            i += 1;
            return timer(i, maxPosition);
          }
          cp = cPlayer[0].userid || cPlayer[0].id;
        } else {
          i += 1;
          return timer(i, maxPosition);
        }
        console.log("timerplayer preflop =>", cp);
        // let playerinterval = udata.players[i].userid;

        if (cPlayer.length) {
          if (udata?.runninground === 1) {
            await roomModel.updateOne(
              {
                _id: roomid,
                "preflopround.position": i,
              },
              {
                timerPlayer: cp,
                "preflopround.$.action": false,
              }
            );
            let playerinterval = setInterval(async () => {
              const data = await roomModel.findOne({ _id: roomid });
              let preflopData = data?.preflopround;
              let intervalPlayer = preflopData?.filter((e) => e.position === i);
              if (j <= 0) {
                clearInterval(playerinterval);
                if (
                  (data.raiseAmount === intervalPlayer[0].pot ||
                    data.lastAction === "check") &&
                  data.players.length !== 1
                ) {
                  await doCheck(roomid, intervalPlayer[0].id, io);
                  timer(++i, maxPosition);
                } else {
                  const isContinue = await doFold(
                    data,
                    intervalPlayer[0].id,
                    io
                  );
                  io.in(data?._id?.toString()).emit("automaticFold", {
                    msg: `${intervalPlayer[0].name} has automatically folded`,
                  });
                  console.log("do sit out executed 1");
                  await doSitOut(data, io);
                  console.log("do sit out executed 2", isContinue);
                  if (isContinue) {
                    timer(++i, maxPosition);
                  }
                }
              } else if (
                intervalPlayer &&
                (intervalPlayer[0]?.fold ||
                  intervalPlayer[0]?.action ||
                  intervalPlayer[0]?.wallet === 0 ||
                  !intervalPlayer[0]?.playing)
              ) {
                clearInterval(playerinterval);
                if (data.runninground === 5) {
                  return;
                }
                timer(++i, maxPosition);
              } else {
                j--;
                io.in(udata?._id?.toString()).emit("timer", {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 1,
                  maxtimer: tx,
                });
              }
            }, 1000);
          }
        } else {
          timer(++i, maxPosition);
        }
      } else if (i === totalPlayer) {
        let newPosition = 0;

        if (
          udata?.bigBlindPosition === totalPlayer - 1 &&
          udata?.isCircleCompleted === false
        ) {
          newPosition = 0;
          await roomModel.updateOne(
            {
              _id: roomid,
            },
            {
              isCircleCompleted: true,
            }
          );
        } else {
          if (
            udata?.raisePlayerPosition !== null &&
            udata?.isCircleCompleted === true
          ) {
            newPosition = udata?.raisePlayerPosition;
          } else {
            newPosition = udata?.bigBlindPosition + 1;
            await roomModel.updateOne(
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
          udata?.raisePlayerPosition === null ||
          i === udata?.raisePlayerPosition
        ) {
          setTimeout(() => {
            flopround(roomid, io);
          }, 50);
        } else {
          if (udata?.isCircleCompleted) {
            if (udata?.raisePlayerPosition < i) {
              timer(i, totalPlayer);
            } else {
              timer(i, udata?.raisePlayerPosition);
            }
          } else {
            timer(i, totalPlayer);
          }
        }
      }
    };
    let i = 0;
    if (roomData?.bigBlindPosition === totalPlayer - 1) {
      i = 0;
    } else {
      i = roomData?.bigBlindPosition + 1;
    }

    timer(i, totalPlayer);
  } catch (error) {
    console.log("Error in prefloptimer =>", error);
  }
};

export const flopround = async (roomid, io) => {
  try {
    const roomData = await roomModel.findOne({ _id: roomid });
    // const tournamentConfig = await tournamentConfModel.findOne().sort({'_id': -1});
    // console.log("flop round executed ====>", roomData?.runninground);
    if (roomData?.runninground === 1) {
      let distributedCards = [];
      let floproundPlayersData = [];
      let totalPot = roomData.pot;
      let playingPlayer = 0;

      const fetchDistributedCards = () => {
        // console.log("fetching distributed cards executed");
        // console.log(
        //   "preflop round data lenght ",
        //   roomData?.preflopround.length
        // );
        roomData?.preflopround.forEach((e) => {
          let playerchance = roomData?.timer;
          let actionType = null;
          if (e.fold === true) {
            playerchance = 0;
            actionType = "fold";
          }
          if (e.actionType === "all-in") {
            actionType = "all-in";
          }
          // console.log("Prev pots ======>", e.prevPot, e.pot);
          let p = {
            cards: e.cards,
            id: e.id,
            name: e.name,
            wallet: e.wallet,
            chipsBeforeHandStart: e.chipsBeforeHandStart,
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
            distributedCards.push(decryptCard(el));
          });
          if (actionType === null && e.playing) {
            playingPlayer++;
          }
        });
      };
      fetchDistributedCards();
      // console.log("floproundPlayersData ===>", floproundPlayersData);
      let communityCards = verifycards(distributedCards, 3);
      communityCards = communityCards.map((card) => EncryptCard(card));
      await roomModel.updateOne(
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
          raiseAmount: roomData.smallBlind,
          lastAction: "check",
          isCircleCompleted: false,
        }
      );
      await getSidePOt(roomid);
      const updatedRoom = await roomModel.findOne({ _id: roomid });
      // console.log("flopround data ===>", { flopRound: updatedRoom.flopround });
      io.in(updatedRoom?._id?.toString()).emit("flopround", updatedRoom);
      if (playingPlayer > 1) {
        setTimeout(() => {
          console.log("flop-timer called for room =>", roomid);
          flopTimer(roomid, io);
        }, 50);
      } else {
        setTimeout(() => {
          console.log("turn-round called for room =>", roomid);
          turnround(roomid, io);
        }, 100);
      }
    }
  } catch (error) {
    console.log("error in flop function", error);
  }
};

export const flopTimer = async (roomid, io) => {
  try {
    const roomData = await roomModel.findOne({ _id: roomid });

    let totalPlayer =
      roomData?.flopround?.length + roomData?.eleminated?.length;

    const timer = async (i, maxPosition) => {
      let j = roomData?.timer;
      let t = "timer";
      let tx = roomData?.timer;
      const udata = await roomModel.findOne({ _id: roomid });
      if (udata.runninground === 5) {
        return;
      }
      if (i < maxPosition) {
        const cPlayer = udata.flopround.filter((el) => el.position === i);
        let cp = null;

        if (cPlayer.length) {
          if (
            cPlayer[0].wallet <= 0 ||
            cPlayer[0].fold ||
            !cPlayer[0].playing ||
            (cPlayer[0].pot >= udata.raiseAmount && cPlayer[0].action)
          ) {
            i += 1;
            return timer(i, maxPosition);
          }
          cp = cPlayer[0].id || cPlayer[0].userid;
        } else {
          i += 1;
          return timer(i, maxPosition);
        }

        console.log("timerplayer flop =>", cp);

        if (cPlayer?.length) {
          if (udata?.runninground === 2) {
            await roomModel.updateOne(
              {
                _id: roomid,
                "flopround.position": i,
              },
              {
                "flopround.$.action": false,
                timerPlayer: cp,
              }
            );
            let playerinterval = setInterval(async () => {
              const data = await roomModel.findOne({ _id: roomid });
              let flopData = data?.flopround;

              let intervalPlayer = flopData?.filter((e) => e.position === i);
              if (j <= 0) {
                clearInterval(playerinterval);
                if (
                  (data?.raiseAmount === intervalPlayer[0]?.pot ||
                    data?.lastAction === "check") &&
                  data?.players.length !== 1
                ) {
                  await doCheck(roomid, intervalPlayer[0].id, io);
                  timer(++i, maxPosition);
                } else {
                  const isContinue = await doFold(
                    data,
                    intervalPlayer[0].id,
                    io
                  );
                  io.in(data?._id?.toString()).emit("automaticFold", {
                    msg: `${intervalPlayer[0].name} has automatically folded`,
                  });
                  await doSitOut(data, io);
                  if (isContinue) {
                    timer(++i, maxPosition);
                  }
                }
                // timer(++i,maxPosition);
              } else if (
                intervalPlayer &&
                (intervalPlayer[0]?.fold ||
                  intervalPlayer[0]?.action ||
                  intervalPlayer[0]?.wallet === 0 ||
                  !intervalPlayer[0]?.playing)
              ) {
                clearInterval(playerinterval);
                if (data.runninground === 5) {
                  return;
                }
                timer(++i, maxPosition);
              } else {
                j--;
                io.in(data?._id?.toString()).emit("timer", {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 2,
                  maxtimer: tx,
                });
              }
            }, 1000);
          }
        } else {
          timer(++i, maxPosition);
        }
      } else if (i === totalPlayer) {
        let newPosition = 0;

        if (
          udata?.smallBlindPosition === totalPlayer - 1 &&
          udata?.isCircleCompleted === false
        ) {
          newPosition = 0;
          await roomModel.updateOne(
            {
              _id: roomid,
            },
            {
              isCircleCompleted: true,
            }
          );
        } else {
          if (
            udata?.raisePlayerPosition !== null &&
            udata?.isCircleCompleted === true
          ) {
            newPosition = udata?.raisePlayerPosition;
          } else {
            newPosition = udata?.smallBlindPosition;
            await roomModel.updateOne(
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
          udata?.raisePlayerPosition === null ||
          i === udata?.raisePlayerPosition
        ) {
          setTimeout(() => {
            turnround(roomid, io);
          }, 50);
        } else {
          if (udata?.isCircleCompleted) {
            if (udata?.raisePlayerPosition < i) {
              timer(i, totalPlayer);
            } else {
              timer(i, udata?.raisePlayerPosition);
            }
          } else {
            timer(i, totalPlayer);
          }
        }
      }
    };
    let i = roomData?.smallBlindPosition;

    timer(i, totalPlayer);
  } catch (error) {
    console.log("error in flop timer function =>", error);
  }
};

export const turnround = async (roomid, io) => {
  try {
    console.log("turn round executed");
    const roomData = await roomModel.findOne({ _id: roomid });
    // const tournamentConfig = await tournamentConfModel.findOne().sort({'_id': -1});
    let playingPlayer = 0;

    if (roomData?.runninground === 2) {
      let distributedCards = [];
      let turnroundPlayersData = [];
      let totalPot = roomData?.pot;
      const fetchDistributedCards = () => {
        roomData?.flopround?.forEach((e) => {
          let playerchance = roomData?.timer;
          let actionType = null;
          if (e.fold === true) {
            playerchance = 0;
            actionType = "fold";
          }
          if (e.actionType === "all-in") {
            actionType = "all-in";
          }
          let p = {
            cards: e.cards,
            id: e.id,
            name: e.name,
            photoURI: e.photoURI,
            wallet: e.wallet,
            chipsBeforeHandStart: e.chipsBeforeHandStart,
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
            distributedCards.push(decryptCard(el));
          });

          if (actionType === null && e.playing) {
            playingPlayer++;
          }
        });

        roomData?.communityCard?.forEach((el) => {
          distributedCards.push(decryptCard(el));
        });
      };

      fetchDistributedCards();
      let newCard = verifycards(distributedCards, 1);
      newCard[0] = EncryptCard(newCard[0]);
      let communityCards = roomData.communityCard;
      communityCards.push(newCard[0]);

      await roomModel.updateOne(
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
          raiseAmount: roomData.bigBlind / 2,
          lastAction: "check",
          isCircleCompleted: false,
        }
      );
      await getSidePOt(roomid);
      const updatedRoom = await roomModel.findOne({ _id: roomid });
      io.in(updatedRoom?._id?.toString()).emit("turnround", updatedRoom);
      if (playingPlayer > 1) {
        setTimeout(() => {
          console.log("turn-timer called for room =>", roomid);
          turnTimer(roomid, io);
        }, 50);
      } else {
        setTimeout(() => {
          console.log("river-round called for room =>", roomid);
          riverround(roomid, io);
        }, 300);
      }
    }
  } catch (error) {
    console.log("error in turn round", error);
  }
};

export const turnTimer = async (roomid, io) => {
  try {
    const roomData = await roomModel.findOne({ _id: roomid });
    let totalPlayer =
      roomData?.turnround?.length + roomData?.eleminated?.length;

    const timer = async (i, maxPosition) => {
      let j = roomData?.timer;
      let t = "timer";
      let tx = roomData?.timer;
      const udata = await roomModel.findOne({ _id: roomid });
      if (udata.runninground === 5) {
        return;
      }
      if (i < maxPosition) {
        const cPlayer = udata.turnround.filter((el) => el.position === i);
        let cp = null;
        if (cPlayer.length) {
          if (
            cPlayer[0].wallet <= 0 ||
            cPlayer[0].fold ||
            !cPlayer[0].playing ||
            (cPlayer[0].pot >= udata.raiseAmount && cPlayer[0].action)
          ) {
            i += 1;
            return timer(i, maxPosition);
          }
          cp = cPlayer[0].id || cPlayer[0].userid;
        } else {
          i += 1;
          return timer(i, maxPosition);
        }
        console.log("timerplayer turn =>", cp);

        if (cPlayer?.length) {
          if (udata?.runninground === 3) {
            await roomModel.updateOne(
              {
                _id: roomid,
                "turnround.position": i,
              },
              {
                timerPlayer: cp,
                "turnround.$.action": false,
              }
            );
            let playerinterval = setInterval(async () => {
              const data = await roomModel.findOne({ _id: roomid });
              let turnData = data?.turnround;
              let intervalPlayer = turnData?.filter((e) => e.position === i);
              if (j <= 0) {
                clearInterval(playerinterval);
                if (
                  (data?.raiseAmount === intervalPlayer[0]?.pot ||
                    data?.lastAction === "check") &&
                  data?.players?.length !== 1
                ) {
                  await doCheck(roomid, intervalPlayer[0]?.id, io);
                  timer(++i, maxPosition);
                } else {
                  const isContinue = await doFold(
                    data,
                    intervalPlayer[0].id,
                    io
                  );
                  io.in(data?._id?.toString()).emit("automaticFold", {
                    msg: `${intervalPlayer[0]?.name} has automatically folded`,
                  });
                  await doSitOut(data, io);
                  if (isContinue) {
                    timer(++i, maxPosition);
                  }
                }

                // timer(++i,maxPosition);
              } else if (
                intervalPlayer &&
                (intervalPlayer[0]?.fold ||
                  intervalPlayer[0]?.action ||
                  intervalPlayer[0]?.wallet === 0 ||
                  !intervalPlayer[0]?.playing)
              ) {
                clearInterval(playerinterval);
                if (data.runninground === 5) {
                  return;
                }
                timer(++i, maxPosition);
              } else {
                j--;
                io.in(data?._id?.toString()).emit("timer", {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 3,
                  maxtimer: tx,
                });
              }
            }, 1000);
          }
        } else {
          timer(++i, maxPosition);
        }
      } else if (i === totalPlayer) {
        let newPosition = 0;
        if (
          udata?.smallBlindPosition === totalPlayer - 1 &&
          udata?.isCircleCompleted === false
        ) {
          newPosition = 0;
          await roomModel.updateOne(
            {
              _id: roomid,
            },
            {
              isCircleCompleted: true,
            }
          );
        } else {
          if (
            udata?.raisePlayerPosition !== null &&
            udata?.isCircleCompleted === true
          ) {
            newPosition = udata?.raisePlayerPosition;
          } else {
            newPosition = udata?.smallBlindPosition;
            await roomModel.updateOne(
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
          udata?.raisePlayerPosition === null ||
          i === udata?.raisePlayerPosition
        ) {
          setTimeout(() => {
            riverround(roomid, io);
          }, 50);
        } else {
          if (udata?.isCircleCompleted) {
            if (udata?.raisePlayerPosition < i) {
              timer(i, totalPlayer);
            } else {
              timer(i, udata?.raisePlayerPosition);
            }
          } else {
            timer(i, totalPlayer);
          }
        }
      }
    };
    let i = roomData?.smallBlindPosition;

    timer(i, totalPlayer);
  } catch (error) {
    console.log("error in turn timer function =>", error);
  }
};

export const riverround = async (roomid, io) => {
  try {
    console.log("river round executed");
    const roomData = await roomModel.findOne({ _id: roomid });
    let playingPlayer = 0;

    if (roomData?.runninground === 3) {
      let distributedCards = [];
      let riverroundPlayersData = [];
      let totalPot = roomData?.pot;
      const fetchDistributedCards = () => {
        roomData?.turnround?.forEach((e) => {
          let playerchance = roomData?.timer;
          let actionType = null;
          if (e.fold === true) {
            playerchance = 0;
            actionType = "fold";
          }
          if (e.actionType === "all-in") {
            actionType = "all-in";
          }
          let p = {
            cards: e.cards,
            id: e.id,
            name: e.name,
            photoURI: e.photoURI,
            wallet: e.wallet,
            chipsBeforeHandStart: e.chipsBeforeHandStart,
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
            distributedCards.push(decryptCard(el));
          });
          if (actionType === null && e.playing) {
            playingPlayer++;
          }
        });

        roomData?.communityCard?.forEach((el) => {
          distributedCards.push(decryptCard(el));
        });
      };

      fetchDistributedCards();

      let newCard = verifycards(distributedCards, 1);
      newCard[0] = EncryptCard(newCard[0]);
      let communityCards = roomData?.communityCard;
      communityCards.push(newCard[0]);

      await roomModel.updateOne(
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
          raiseAmount: roomData.bigBlind / 2,
          lastAction: "check",
          isCircleCompleted: false,
        },

        {
          new: true,
        }
      );
      await getSidePOt(roomid);
      const updatedRoom = await roomModel.findOne({ _id: roomid });

      io.in(updatedRoom?._id?.toString()).emit("riverround", updatedRoom);
      if (playingPlayer > 1) {
        setTimeout(() => {
          console.log("river-timer called for room =>", roomid);
          riverTimer(roomid, io);
        }, 50);
      } else {
        console.log("<<<-----show down first----->>>");
        setTimeout(() => {
          console.log("showdown called for room =>", roomid);
          showdown(roomid, io);
        }, 300);
      }
    }
  } catch (error) {
    console.log("error in river round", error);
  }
};

export const riverTimer = async (roomid, io) => {
  try {
    const roomData = await roomModel.findOne({ _id: roomid });
    let totalPlayer =
      roomData?.riverround?.length + roomData?.eleminated?.length;
    const timer = async (i, maxPosition) => {
      let j = roomData?.timer;
      let t = "timer";
      let tx = roomData?.timer;
      const udata = await roomModel.findOne({ _id: roomid });
      if (udata.runninground === 5) {
        return;
      }
      if (i < maxPosition) {
        const cPlayer = udata.riverround.filter(
          (el) => el.position === i && el.playing
        );
        let cp = null;
        if (cPlayer.length) {
          if (
            cPlayer[0].wallet <= 0 ||
            cPlayer[0].fold ||
            !cPlayer[0].playing ||
            (cPlayer[0].pot >= udata.raiseAmount && cPlayer[0].action)
          ) {
            i += 1;
            return timer(i, maxPosition);
          }
          cp = cPlayer[0].id || cPlayer[0].userid;
        } else {
          i += 1;
          return timer(i, maxPosition);
        }
        console.log("timerplayer river =>", cp);

        if (cPlayer?.length) {
          if (udata?.runninground === 4) {
            await roomModel.updateOne(
              {
                _id: roomid,
                "riverround.position": i,
              },
              {
                timerPlayer: cp,
                "riverround.$.action": false,
              }
            );
            let playerinterval = setInterval(async () => {
              const data = await roomModel.findOne({ _id: roomid });
              let riverData = data?.riverround;

              let intervalPlayer = riverData?.filter((e) => e.position === i);
              if (j <= 0) {
                clearInterval(playerinterval);
                if (
                  (data?.raiseAmount === intervalPlayer[0]?.pot ||
                    data?.lastAction === "check") &&
                  data?.players?.length !== 1
                ) {
                  await doCheck(roomid, intervalPlayer[0]?.id, io);
                  timer(++i, maxPosition);
                } else {
                  const isContinue = await doFold(
                    data,
                    intervalPlayer[0].id,
                    io
                  );
                  io.in(data?._id?.toString()).emit("automaticFold", {
                    msg: `${intervalPlayer[0]?.name} has automatically folded`,
                  });
                  await doSitOut(data, io);
                  if (isContinue) {
                    timer(++i, maxPosition);
                  }
                }
              } else if (
                intervalPlayer &&
                (intervalPlayer[0]?.fold ||
                  intervalPlayer[0]?.action ||
                  intervalPlayer[0]?.wallet === 0 ||
                  !intervalPlayer[0]?.playing)
              ) {
                clearInterval(playerinterval);
                if (data.runninground === 5) {
                  return;
                }
                timer(++i, maxPosition);
              } else {
                j--;
                io.in(data?._id?.toString()).emit("timer", {
                  id: intervalPlayer[0].id,
                  playerchance: j,
                  timerPlayer: i,
                  runninground: 4,
                  maxtimer: tx,
                });
              }
            }, 1000);
          }
        } else {
          timer(++i, maxPosition);
        }
      } else if (i === totalPlayer) {
        let newPosition = 0;
        if (
          udata?.smallBlindPosition === totalPlayer - 1 &&
          udata?.isCircleCompleted === false
        ) {
          newPosition = 0;
          await roomModel.updateOne(
            {
              _id: roomid,
            },
            {
              isCircleCompleted: true,
            }
          );
        } else {
          if (
            udata?.raisePlayerPosition !== null &&
            udata?.isCircleCompleted === true
          ) {
            newPosition = udata?.raisePlayerPosition;
          } else {
            newPosition = udata?.smallBlindPosition;
            await roomModel.updateOne(
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
          udata?.raisePlayerPosition === null ||
          i === udata?.raisePlayerPosition
        ) {
          setTimeout(() => {
            showdown(roomid, io);
          }, 50);
        } else {
          if (udata?.isCircleCompleted) {
            if (udata?.raisePlayerPosition < i) {
              timer(i, totalPlayer);
            } else {
              timer(i, udata?.raisePlayerPosition);
            }
          } else {
            timer(i, totalPlayer);
          }
        }
      }
    };
    let i = roomData?.smallBlindPosition;

    timer(i, totalPlayer);
  } catch (error) {
    console.log("error in river Timer", error);
  }
};

export const showdown = async (roomid, io) => {
  try {
    console.log("----showdown-----");
    const roomData = await roomModel.findOne({ _id: roomid });
    if (!roomData.isGameRunning) return;
    let playersHand = [];
    let hands = [];
    let showDownPlayers = [];
    let totalPot = roomData.pot;
    let playerData = roomData.riverround;
    playerData.forEach((e) => {
      let actionType = null;
      if (e.fold === true) {
        actionType = "fold";
      }
      if (e.actionType === "all-in") {
        actionType = "all-in";
      }
      let p = {
        cards: e.cards,
        id: e.id,
        name: e.name,
        photoURI: e.photoURI,
        wallet: e.wallet,
        chipsBeforeHandStart: e.chipsBeforeHandStart,
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
    const updateRoom = await roomModel.findOneAndUpdate(
      {
        _id: roomid,
      },
      {
        showdown: showDownPlayers,
        runninground: 5,
        timerPlayer: null,
        pot: totalPot,
      },
      { new: true }
    );

    if (updateRoom.sidePots.length || updateRoom.allinPlayers.length) {
      await getSidePOt(updateRoom._id);
    }
    const updatedRoom = await roomModel.findOne({ _id: roomid });

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
              allCards = allCards.map((card) => decryptCard(card));
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
            allCards = allCards.map((card) => decryptCard(card));
            let hand = Hand.solve(allCards);

            p.push({ id: el.id, position: el.position, hand: hand });
            h.push(hand);
          }
        });
        hands.push({ h, p, pot });
      }
    };

    clcHand(updatedRoom.sidePots);
    console.log("hand", hands, updatedRoom.sidePots);
    let showdownData = updatedRoom.showdown;
    let winnerPlayers = [];
    let sidePots = [...updatedRoom.sidePots];
    let i = 0;
    const findWinner = async () => {
      hands.forEach((e) => {
        let winners = Hand.winners(e.h);
        winners.forEach((winner) => {
          e.p.forEach((el) => {
            if (JSON.stringify(el.hand) == JSON.stringify(winner)) {
              let winnerData = showdownData.filter(
                (p) => p.position === el.position
              );
              winnerData[0].wallet +=
                winners.length > 1
                  ? parseInt(e.pot / winners.length, 10)
                  : e.pot;
              let winnerHand = [];
              winner.cards.forEach((c) => {
                winnerHand.push(`${c.value}${c.suit}`);
              });
              const totalPlayerTablePot = winnerData[0].prevPot;

              console.log("totalPlayerTablePot", totalPlayerTablePot);
              let winningAmount =
                (winners.length > 1
                  ? parseInt(e.pot / winners.length, 10)
                  : e.pot) - totalPlayerTablePot;

              if (winnerPlayers.length) {
                winnerPlayers.push({
                  id: winnerData[0].id,
                  name: winnerData[0].name,
                  position: winnerData[0].position,
                  winningAmount: winningAmount,
                  handName: winner.name,
                  winnerHand: winnerHand,
                  potPlayer: e.p,
                  winnerCards: winnerData[0].cards.map((card) =>
                    decryptCard(card)
                  ),
                  communityCards: updatedRoom.communityCard.map((card) =>
                    decryptCard(card)
                  ),
                });
                if (sidePots.length) {
                  sidePots[i] = {
                    ...sidePots[i],
                    winner: winnerData[0].position,
                  };
                  i++;
                }
              } else {
                if (sidePots.length) {
                  sidePots[i] = {
                    ...sidePots[i],
                    winner: winnerData[0].position,
                  };
                  i++;
                }
                winnerPlayers.push({
                  id: winnerData[0].id,
                  name: winnerData[0].name,
                  position: winnerData[0].position,
                  winningAmount: winningAmount,
                  handName: winner.name,
                  winnerHand: winnerHand,
                  potPlayer: e.p,
                  winnerCards: winnerData[0].cards.map((card) =>
                    decryptCard(card)
                  ),
                  communityCards: updatedRoom.communityCard.map((card) =>
                    decryptCard(card)
                  ),
                });
              }
            }
          });
        });
      });
    };
    await findWinner();
    const handWinner = updatedRoom.handWinner;
    handWinner.push(winnerPlayers);
    const upRoomData = await roomModel.findOne({ _id: updatedRoom._id });

    upRoomData.showdown.forEach((player, i) => {
      let action, amt;
      if (player.playing) {
        if (
          winnerPlayers.find((ele) => {
            return ele.id.toString() === player.id.toString();
          })
        ) {
          action = "game-win";
          const winnerObj = winnerPlayers.find(
            (ele) => ele.id.toString() === player.id.toString()
          );
          const updateRoomObj = updatedRoom.allinPlayers.find(
            (allin) => allin.id.toString() === player.id.toString()
          );
          if (updateRoomObj && winnerObj) {
            if (winnerObj.winningAmount - updateRoomObj.amt < 0) {
              action = "game-lose";
              amt = Math.abs(winnerObj.winningAmount - updateRoomObj.amt);
              console.log("update amount in game loss section---", amt);
            } else if (winnerObj.winningAmount - updateRoomObj.amt === 0) {
              return;
            } else {
              amt = winnerObj.winningAmount - player.prevPot;
            }
          } else {
            amt = winnerObj.winningAmount;
          }
        } else {
          const updateRoomObj = updatedRoom.allinPlayers.find(
            (allin) => allin.id.toString() === player.id.toString()
          );
          action = "game-lose";
          if (updateRoomObj) {
            amt = updateRoomObj.amt;
          } else {
            amt = player.prevPot;
          }
        }
        player.wallet = showdownData[i].wallet;
        player.tickets = amt;
        player.hands.push({
          action,
          amount: amt,
          date: new Date(),
          isWatcher: false,
        });
      }
    });

    upRoomData.winnerPlayer = winnerPlayers;
    upRoomData.handWinner = handWinner;
    upRoomData.isShowdown = true;
    upRoomData.sidePots = sidePots;
    console.log("showdwon", upRoomData.showdown);

    console.log("winner players ===>", winnerPlayers);

    // let noOfPLayrsWinn = [];
    // winnerPlayers.forEach((el) => {
    //   if (noOfPLayrsWinn.indexOf(el?.name) < 0) {
    //     noOfPLayrsWinn.push(el?.name);
    //   }
    // });

    if (winnerPlayers.length === 1) {
      gameRestartSeconds = 3000;
    } else {
      gameRestartSeconds = winnerPlayers.length * 2000;
    }

    io.in(upRoomData._id.toString()).emit("winner", {
      updatedRoom: upRoomData,
      gameRestartSeconds,
    });

    const upRoom = await roomModel.findOneAndUpdate(
      {
        _id: roomid,
      },
      {
        showdown: upRoomData.showdown,
        winnerPlayer: winnerPlayers,
        handWinner: handWinner,
        isShowdown: true,
      },
      {
        new: true,
      }
    );

    setTimeout(async () => {
      if (upRoom.tournament) {
        await elemination(upRoom, io);
        await reArrangeTables(upRoom.tournament, io, upRoom._id);
      } else {
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
              console.log("Table stopped waiting to start game");
              io.in(upRoom._id.toString()).emit("tablestopped", {
                msg: "Waiting to start game",
              });
            } else {
              console.log("Line 2275 Game finished one player left");
              io.in(upRoom._id.toString()).emit("onlyOnePlayingPlayer", {
                msg: "Game finished, Only one player left",
                roomdata: updatedRoomPlayers,
              });
              if (updatedRoomPlayers?.finish) {
                await finishedTableGame(io, updatedRoomPlayers);

                io.in(updatedRoomPlayers._id.toString()).emit("roomFinished", {
                  msg: "Room finished",
                  finish: updatedRoomPlayers?.finish,
                  roomdata: updatedRoomPlayers,
                });
              }
              if (updatedRoomPlayers.gameType === "pokerTournament_Tables") {
                console.log("Line 2275 Game finished ");
                await finishedTableGame(io, updatedRoomPlayers);
                io.in(updatedRoomPlayers._id.toString()).emit("roomFinished", {
                  msg: "Game finished",
                  finish: updatedRoomPlayers.finish,
                  roomdata: updatedRoomPlayers,
                });
              }
            }
          }
        } else {
          const room = await roomModel.findOneAndUpdate(
            { _id: upRoom._id },
            { gamestart: false },
            { new: true }
          );
          io.in(upRoom._id.toString()).emit("tablestopped", {
            msg: "Table stopped by host",
            game: room,
          });
        }
        const roomUpdate = await roomModel.findOne({ _id: upRoom._id });
        if (roomUpdate?.finish) {
          await finishedTableGame(io, roomUpdate);
          io.in(roomUpdate._id.toString()).emit("roomFinished", {
            msg: "Game finished",
            finish: roomUpdate?.finish,
            roomdata: roomUpdate,
          });
        }
      }
    }, gameRestartSeconds);
  } catch (error) {
    console.log("error in showdown =>", error);
  }
};

export const updateRoomForNewHand = async (roomid, io) => {
  console.log("Update data for new hand");
  try {
    return new Promise(async (resolve, reject) => {
      try {
        const roomData = await roomModel
          .findOne({ _id: convertMongoId(roomid) })
          .populate("tournament");
        let newHandPlayer = [];
        let buyin = roomData?.buyin;
        const bigBlindAmt = roomData?.bigBlind;
        const smallBlindAmt = roomData?.smallBlind;
        let playerData = [];
        console.log("running round =================>", roomData?.runninground);
        switch (roomData?.runninground) {
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

        if (!playerData.length) {
          return;
        }
        const anyNewPlayer = async (playerData, plrs) => {
          return new Promise((resolve, reject) => {
            let data = playerData;
            each(
              plrs,
              function (x, next) {
                try {
                  if (
                    roomData.tournament &&
                    roomData.tournament.eleminatedPlayers.find(
                      (el) => el.userid.toString() === x.userid.toString()
                    )
                  ) {
                    next();
                  }
                  if (roomData.runninground > 0) {
                    const playerexist = data.find(
                      (el) => el.userid.toString() === x.userid.toString()
                    );
                    if (!playerexist) {
                      data.push({ ...x, chipsBeforeHandStart: x.wallet });
                    }
                  }
                  next();
                } catch (error) {
                  console.log("anyNewPlayer error", error);
                  next();
                }
              },
              async function (err, x) {
                resolve(data);
              }
            );
          });
        };
        let sitin = roomData?.sitin;
        let leavereq = roomData?.leavereq;

        each(
          playerData,
          async function (el, next) {
            try {
              let uid = el.userid || el.id;
              if (
                roomData.tournament &&
                roomData.tournament.eleminatedPlayers.find(
                  (el) => el.userid.toString() === uid.toString()
                )
              ) {
                next();
              }
              let buyinchips = 0;
              let stripeBuy = el.hands;
              let haveBuyin = buyin.filter(
                (e) => e.userid.toString() === uid.toString() && !e.redeem
              );
              if (haveBuyin.length) {
                haveBuyin.forEach((x) => {
                  buyinchips += parseInt(x.wallet);
                  x.redeem = 1;

                  stripeBuy.push({
                    action: "buy-coins",
                    amount: x.wallet,
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
                  sitin = sitin.filter(
                    (el) => el.toString() !== uid.toString()
                  );
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
                  chipsBeforeHandStart: el.wallet + buyinchips,
                  userid: uid,
                  id: uid,
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
              console.log("Error in player data", error);
              next();
            }
          },
          async function (err, transformedItems) {
            //Success callback
            try {
              newHandPlayer = await anyNewPlayer(
                newHandPlayer,
                roomData.players
              );
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
                  gamestart:
                    newHandPlayer.filter((pl) => pl.wallet > 0 && pl.playing)
                      ?.length <= 1
                      ? false
                      : roomData.autoNextHand,
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
              io.in(upRoom._id.toString()).emit("newhand", {
                updatedRoom: upRoom,
              });

              resolve();
            } catch (error) {
              console.log("Error in transformedItems", err);
              resolve();
            }
          }
        );
      } catch (err) {
        console.log("error iinnn datatatattatattta", err);
        reject();
      }
    });
  } catch (error) {
    console.log("error iinnn daaadda", error);
  }
};

export const elemination = async (roomData, io) => {
  try {
    let eleminated_players = roomData.eleminated;
    let noOfElemination = 0;
    let newHandPlayer = [];
    let showDown = roomData.showdown;
    const bigBlindAmt = roomData.bigBlind;
    const smallBlindAmt = roomData.smallBlind;
    let players = roomData.players;
    console.log("players =>", players, showDown);
    showDown.forEach((el) => {
      if (parseFloat(el.wallet) > 0) {
        newHandPlayer.push({
          userid: el.id,
          id: el.id,
          name: el.name,
          photoURI: el.photoURI,
          wallet: el.wallet,
          chipsBeforeHandStart: el.chipsBeforeHandStart,
          position: el.position,
          timebank: el.timebank,
          stats: el.stats,
          hands: el.hands,
          meetingToken: el.meetingToken,
          playing: true,
        });
      } else {
        players = players.filter(
          (p) => p.userid.toString() !== el.id.toString()
        );
        noOfElemination++;
        eleminated_players.push({
          userid: el.id,
          name: el.name,
          photoURI: el.photoURI,
          wallet: el.wallet,
          chipsBeforeHandStart: el.chipsBeforeHandStart,
          position: el.position,
          timebank: el.timebank,
          stats: el.stats,
          hands: el.hands,
          meetingToken: el.meetingToken,
        });
      }
    });

    // console.log("eleminated_players", eleminated_players);
    // console.log("newHandPlayer", newHandPlayer);
    const upRoom = await roomModel
      .findOneAndUpdate(
        {
          _id: roomData._id,
        },
        {
          players,
          showdown: newHandPlayer,
          eleminated: eleminated_players?.filter(
            (item, index) => eleminated_players?.indexOf(item) === index
          ),
          preflopround: [],
          flopround: [],
          turnround: [],
          riverround: [],
          pot: 0,
          communityCard: [],
          gamestart: roomData.autoNextHand,
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
          eliminationCount: eleminated_players?.length,
          autoNextHand: true,
        },
        {
          new: true,
        }
      )
      .populate("tournament");
    console.log("remainging player in showdown after game finish", upRoom);
    if (
      eleminated_players.length > 0 &&
      upRoom.tournament.havePlayers > 0 &&
      roomData?.eliminationCount !== upRoom?.eliminationCount
    ) {
      const availablePlayerCount =
        parseInt(upRoom.tournament.havePlayers) -
        parseInt(upRoom?.eliminationCount);
      let eleminatedPlayers = [...upRoom.tournament.eleminatedPlayers].concat(
        eleminated_players.sort(
          (a, b) => a.chipsBeforeHandStart - b.chipsBeforeHandStart
        )
      );
      console.log("ele", eleminatedPlayers.length);

      // if (availablePlayerCount <= upRoom.tournament.winTotalPlayer) {
      //   await calculateTournamentPrize(
      //     upRoom.tournament._id,
      //     upRoom.eleminated
      //   );
      // }
      await tournamentModel.updateOne(
        { _id: upRoom.tournament._id },
        {
          havePlayers: parseInt(availablePlayerCount),
          eleminatedPlayers,
        }
      );
    }
    io.in(upRoom._id.toString()).emit("eliminatedPlayer", {
      eliminated: upRoom.eleminated,
      tournamentId: upRoom.tournament._id,
    });
  } catch (error) {
    console.log("error in eleminite function =>", error);
  }
};

export const calculateTournamentPrize = async (tournamentId, eleminated) => {
  try {
    const tournamentData = await tournamentModel
      .findOne({ _id: tournamentId })
      .populate("rooms", null)
      .lean();
    let { winPlayer, winTotalPlayer } = tournamentData;
    console.log("eleimiated plauer", eleminated);
    eleminated.forEach((ele) => {
      if (
        winTotalPlayer === 25 &&
        winPlayer["11-25"] &&
        winPlayer["11-25"].userIds.length < winPlayer["11-25"].playerCount
      ) {
        winPlayer["11-25"].userIds.push(ele.id || ele.userid);
        return;
      }
      if (
        winTotalPlayer === 10 &&
        winPlayer["4-10"] &&
        winPlayer["4-10"].userIds.length <= winPlayer["4-10"].playerCount
      ) {
        winPlayer["4-10"].userIds.push(ele.id || ele.userid);
        return;
      }
      if (!winPlayer.third.userId) {
        winPlayer.third.userId = ele.id || ele.userid;
        return;
      }
      if (!winPlayer.second.userId) {
        winPlayer.second.userId = ele.id || ele.userid;
        return;
      }
    });
    console.log("winpluyare", winPlayer);
    await tournamentModel.updateOne({ _id: tournamentId }, { winPlayer });
  } catch (err) {
    console.log("Error in prize calculation--->", err);
  }
};

const fixedPrizeDistribution = (tournamentdata, elem) => {
  try {
    let { winPlayer, winTotalPlayer, totalJoinPlayer } = tournamentdata;
    let winners = elem.slice(
      elem.length - tournamentdata.winTotalPlayer,
      elem.length
    );
    console.log("winners ====>", winners);

    if (totalJoinPlayer === 2 && winners.length === 2) {
      winners.shift();
    }

    winners.forEach((ele) => {
      if (
        winTotalPlayer === 25 &&
        winPlayer["11-25"] &&
        winPlayer["11-25"].userIds.length < winPlayer["11-25"].playerCount &&
        winners.length > 10
      ) {
        winPlayer["11-25"].userIds.push(ele.id || ele.userid);
        return;
      }
      if (
        winTotalPlayer === 10 &&
        winPlayer["4-10"] &&
        winPlayer["4-10"].userIds.length <= winPlayer["4-10"].playerCount &&
        winners.length > 3
      ) {
        console.log("enterd in second if ===>");
        winPlayer["4-10"].userIds.push(ele.id || ele.userid);
        return;
      }
      if (!winPlayer.third.userId && winners.length > 2) {
        console.log("enterd in third if ===>");
        winPlayer.third.userId = ele.id || ele.userid;
        return;
      }
      if (!winPlayer.second.userId && winners.length > 1) {
        console.log("enterd in forth if ===>");
        winPlayer.second.userId = ele.id || ele.userid;
        return;
      }
      if (!winPlayer.first.userId) {
        console.log("enterd in fifth if ===>");
        winPlayer.first.userId = ele.id || ele.userid;
        return;
      }
    });
    return winPlayer;
  } catch (error) {
    console.log("error in fixedPrizeDistribution", error);
  }
};

export const distributeTournamentPrize = async (
  tournamentId,
  lastPlayer,
  io
) => {
  try {
    const tournamentdata = await tournamentModel.findOne({ _id: tournamentId });

    let elem = [...tournamentdata.eleminatedPlayers];
    elem.push(lastPlayer);
    let { winPlayer, winTotalPlayer, prizeType, prizeDistribution } =
      tournamentdata;

    if (prizeType === "Fixed") {
      winPlayer = await fixedPrizeDistribution(tournamentdata, elem);
    } else {
      winPlayer = await calculatePercentagePrizes(tournamentdata, elem);
    }
    // console.log("Win playere", winPlayer);
    const tournament = await tournamentModel.findOneAndUpdate(
      { _id: tournamentId },
      {
        winPlayer: winPlayer,
        isFinished: true,
        isStart: false,
        eleminatedPlayers: elem,
      },
      { new: true }
    );
    // console.log(
    //   "winner tournamet",
    //   lastPlayer,
    //   tournament.winPlayer,
    //   winPlayer
    // );

    // console.log("tournament.winPlayer ===>", tournament.winPlayer);

    for await (let player of Object.values(tournament.winPlayer)) {
      if (player?.playerCount === 1) {
        //player.userId is the winner of amount player.amount
        if (player.userId) {
          console.log("entered in first--");
          const user = await userModel.findOneAndUpdate(
            { _id: player.userId },
            { $inc: { ticket: player.amount } },
            { new: true }
          );
          await transactionModel.create({
            userId: player.userId,
            amount: player.amount,
            transactionDetails: {},
            prevTicket: parseFloat(user?.ticket),
            updatedTicket: parseFloat(user?.ticket),
            prevWallet: parseFloat(user?.wallet),
            updatedWallet: parseFloat(user?.wallet),
            prevGoldCoin: parseFloat(user?.goldCoin),
            updatedGoldCoin: parseFloat(user?.goldCoin),
            transactionType: "poker tournament",
          });
        }
        // console.log("winner =>", player);
      } else {
        // player.userIds are winner of amount player.amount
        if (player.playerCount === 7) {
          console.log("In player count 7");

          if (player?.userIds?.length > 0) {
            for await (let userId of player?.userIds) {
              const user = await userModel.findOneAndUpdate(
                { _id: userId },
                { $inc: { ticket: player.amount } },
                { new: true }
              );
              // console.log("user =>", user);
              await transactionModel.create({
                userId,
                amount: player.amount,
                transactionDetails: {},
                prevTicket: parseFloat(user?.ticket),
                updatedTicket: parseFloat(user?.ticket),
                prevWallet: parseFloat(user?.wallet),
                updatedWallet: parseFloat(user?.wallet),
                prevGoldCoin: parseFloat(user?.goldCoin),
                updatedGoldCoin: parseFloat(user?.goldCoin),
                transactionType: "poker tournament",
              });
            }
          }
        }
        if (player?.playerCount === 15) {
          console.log("In player count 15");

          if (player?.userIds?.length > 0) {
            for await (let userId of player?.userIds) {
              const user = await userModel.findOneAndUpdate(
                { _id: userId },
                { $inc: { ticket: player.amount } },
                { new: true }
              );
              // console.log("user =>", user);
              await transactionModel.create({
                userId,
                amount: player.amount,
                transactionDetails: {},
                prevTicket: parseFloat(user?.ticket),
                updatedTicket: parseFloat(user?.ticket),
                prevWallet: parseFloat(user?.wallet),
                updatedWallet: parseFloat(user?.wallet),
                prevGoldCoin: parseFloat(user?.goldCoin),
                updatedGoldCoin: parseFloat(user?.goldCoin),
                transactionType: "poker tournament",
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.log("error in distributeTournamentPrize", error);
  }
};

const calculatePercentagePrizes = async (tournamentdata, elem) => {
  try {
    const { totalJoinPlayer, prizeDistribution, tournamentFee } =
      tournamentdata;
    let percnt = 0;
    elem = elem.reverse();
    if (prizeDistribution === "top-10") {
      percnt = Math.ceil(totalJoinPlayer * 0.1);
    } else if (prizeDistribution === "top-15") {
      percnt = Math.ceil(totalJoinPlayer * 0.15);
    } else {
      percnt = Math.ceil(totalJoinPlayer * 0.2);
    }
    // console.log("Percnt ---->: " + percnt);
    let winners = elem.slice(0, percnt);
    let values =
      (await payouts[prizeDistribution]) &&
      Object.values(payouts[prizeDistribution]);
    let reqPayout = values.find(
      (el) => el.min <= totalJoinPlayer && el.max >= totalJoinPlayer
    );
    const totalPoolAmt = totalJoinPlayer * tournamentFee;
    console.log("winners ==>", winners);
    const { amount } = reqPayout;

    if (winners.length < amount.length) {
      winners = elem;
    }

    let allWinnersWithAmount = {};
    amount.forEach((el, i) => {
      if (i < 9) {
        if (winners[i]) {
          allWinnersWithAmount[i] = {
            userId: winners[i]?.id || winners[i]?.userid,
            amount: totalPoolAmt * (el[i] / 100),
            name: winners[i]?.name,
            profile: winners[i]?.photoURI,
          };
        }
      } else {
        const key = Object.keys(el)[0];
        let splitdIndxs = key.split("-");
        let startIndx = parseInt(splitdIndxs[0]) - 1;
        const endIndx = parseInt(splitdIndxs[1]) - 1;
        let reqData = winners.slice(startIndx, endIndx + 1);
        allWinnersWithAmount[key] = {
          userIds: [],
        };
        reqData.forEach((winnr) => {
          allWinnersWithAmount[key] = {
            userIds: [
              ...allWinnersWithAmount[key]?.userIds,
              {
                id: winnr.id || winnr.userid,
                name: winnr.name,
                profile: winnr.photoURI,
              },
            ],
            amount: totalPoolAmt * (el[key] / 100),
          };
        });
      }
    });
    return allWinnersWithAmount;
  } catch (error) {
    console.log("error in calculatePercentagePrizes", error);
  }
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
      io.in(updatedData._id.toString()).emit("roomPaused", {
        pause: updatedData.pause,
      });
    } else {
      socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    console.log("error : ", e);
    socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doFinishGame = async (data, io, socket) => {
  console.log("doFinishGame API called ");
  const userid = convertMongoId(data.userid);
  let roomid = convertMongoId(data.roomid);
  const { isValid } = checkIfEmpty({ roomid });
  try {
    if (isValid) {
      const roomData = await roomModel.findOne({ _id: roomid });
      // console.log("roomData ===>", roomData);
      if (!roomData.finish) {
        console.log("entered in first cond");
        const updatedData = await roomModel.findOneAndUpdate(
          { _id: roomid },
          { finish: false, autoNextHand: true }, //i have update finish true with finish false and also I have add this for
          { new: true }
        );
        let msg = "";
        if (updatedData.runninground === 0) {
          msg = "Host initiated to finish this game";
        } else {
          msg =
            "Host initiated to finish this game, So you will see all stats after this hand";
        }

        if (updatedData.runninground === 0) {
          console.log("enterd in If condition for leaving tounament");
          await finishedTableGame(io, updatedData, userid);
        } else {
          const checkRoom = await roomModel.find({
            finish: false,
            public: true,
            gameMode: roomData?.gameMode,
          });
          console.log("checkRoom.length ===>", checkRoom.length);
          if (checkRoom && checkRoom.length > 2) {
            // if (dd || room.finish) await roomModel.deleteOne({ _id: room._id });
            console.log("roomData.finish ======>", roomData.finish);
            if (!roomData.finish) {
              const data = await roomModel.findOneAndUpdate(
                { _id: roomData._id },
                { finish: true },
                { new: true }
              );
              console.log("data qwdqwd", data);
            }

            //   const getAllRunningRoom = await roomModel
            //   .find({finish:false, public: true, gameType: "poker" })
            //   .populate("players.userid");
            // io.emit("AllTables", { tables: getAllRunningRoom });
          } else {
            msg = "Game paused, due to ring game";
            await roomModel.findOneAndUpdate(
              { _id: roomData._id },
              { pause: true },
              { new: true }
            );
          }
        }
        io.in(updatedData._id.toString()).emit("roomFinished", {
          msg: msg,
          finish: updatedData.finish,
          roomdata: updatedData,
        });
      } else {
        console.log("userId =====;...>", userid);
        await finishedTableGame(io, roomData, userid);
        console.log("action error executed");
        if (socket)
          socket.emit("actionError", { code: 400, msg: "Bad request" });
      }
    }
  } catch (e) {
    console.log("error : ", e);
    if (socket)
      socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doResumeGame = async (data, io, socket) => {
  console.log("doResumeGame API called ");
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
      io.in(updatedData._id.toString()).emit("roomResume", {
        pause: updatedData.pause,
      });
    } else {
      socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    console.log("error : ", e);
    socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doSitOut = async (data, io, socket) => {
  const { action } = data;
  const userid = convertMongoId(data.userId);
  let tableId = convertMongoId(data.tableId);
  let roomid;
  // console.log({ tableId, userid });
  const { isValid } = checkIfEmpty({ tableId, userid });
  let playingPlayer = [];
  let res = true;
  try {
    if (isValid) {
      const roomData = await roomModel
        .findOne({
          _id: tableId,
          "players.userid": userid,
        })
        .lean();
      if (roomData) {
        let lastAction = "fold";
        if (roomData && roomData.lastAction === "check") {
          lastAction = "check";
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
                "players.userid": userid,
              },
              {
                "players.$.playing": false,
                "players.$.forceBigBlind": true,
                sitin: sitin,
              },
              { new: true }
            );
            if (action !== "Leave") {
              io.in(updatedData._id.toString()).emit("notification", {
                id: userid,
                action: "SitOut",
                msg: "",
              });
            }
            if (socket) socket.emit("sitInOut", { updatedRoom: updatedData });
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
                "preflopround.id": userid,
              },
              {
                "preflopround.$.playing": false,
                "preflopround.$.forceBigBlind": true,
                "preflopround.$.fold": true,
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
            if (action !== "Leave") {
              io.in(updatedData._id.toString()).emit("notification", {
                id: userid,
                action: "SitOut",
              });
            }
            if (socket) {
              socket.emit("sitInOut", { updatedRoom: updatedData });
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
                "flopround.id": userid,
              },
              {
                "flopround.$.playing": false,
                "flopround.$.forceBigBlind": true,
                "flopround.$.fold": true,
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
            if (action !== "Leave") {
              io.in(updatedData._id.toString()).emit("notification", {
                id: userid,
                action: "SitOut",
              });
            }
            if (socket) {
              socket.emit("sitInOut", { updatedRoom: updatedData });
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
                "turnround.id": userid,
              },
              {
                "turnround.$.playing": false,
                "turnround.$.forceBigBlind": true,
                "turnround.$.fold": true,
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
            if (action !== "Leave") {
              io.in(updatedData._id.toString()).emit("notification", {
                id: userid,
                action: "SitOut",
              });
            }
            if (socket) {
              socket.emit("sitInOut", { updatedRoom: updatedData });
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
                "riverround.id": userid,
              },
              {
                "riverround.$.playing": false,
                "riverround.$.forceBigBlind": true,
                "riverround.$.fold": true,
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
            if (action !== "Leave") {
              io.in(updatedData._id.toString()).emit("notification", {
                id: userid,
                action: "SitOut",
              });
            }
            if (socket) {
              socket.emit("sitInOut", { updatedRoom: updatedData });
            }
            return res;

          case 5:
            sitOut.push(roomData.showdown.find((el) => el.id === userid));
            updatedData = await roomModel.findOneAndUpdate(
              {
                _id: roomid,
                "showdown.id": userid,
              },
              {
                "showdown.$.playing": false,
                "riverround.$.forceBigBlind": true,
                sitin: sitin,
              },
              { new: true }
            );
            if (updatedData) {
              if (action !== "Leave") {
                io.in(updatedData._id.toString()).emit("notification", {
                  id: userid,
                  action: "SitOut",
                });
              }
              if (socket) socket.emit("sitInOut", { updatedRoom: updatedData });
            }
            break;

          default:
            break;
        }
      }
    } else {
      if (socket) socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    console.log("error : ", e);
    if (socket)
      socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doSitIn = async (data, io, socket) => {
  console.log("doSitIn API called ");
  const userid = convertMongoId(data.userId);
  let tableId = convertMongoId(data.tableId);
  let roomid;
  const { isValid } = checkIfEmpty({ tableId, userid });
  try {
    if (isValid) {
      const roomdata = await roomModel
        .findOne({
          _id: tableId,
          "players.userid": userid,
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
            "players.userid": userid,
          },
          {
            "players.$.playing": true,
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
      if (socket) socket.emit("sitInOut", { updatedRoom: updatedData });
      io.in(updatedData._id.toString()).emit("notification", {
        id: userid,
        action: "SitIn",
      });
    } else {
      socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    console.log("error : ", e);
    socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doLeaveTable = async (data, io, socket) => {
  // console.log("datadatadata", data);
  console.log("doleave table executed");
  const userid = convertMongoId(data.userId);
  let tableId = convertMongoId(data.tableId);
  let roomid;

  const { isValid } = checkIfEmpty({ tableId, userid });
  try {
    if (isValid) {
      let roomdata = await roomModel
        .findOneAndUpdate(
          {
            _id: tableId,
            "players.userid": userid,
          },
          { "players.$.playing": false },
          { new: true }
        )
        .lean();
      if (roomdata) {
        console.log("IN ROOM DATA ====>");
        roomid = roomdata._id;
        if (roomdata?.hostId?.toString() === userid?.toString()) {
          let p = roomdata.players.filter(
            (ele) => ele?.userid?.toString() !== userid.toString()
          )[0];
          console.log("p ====>", p);
          if (p) {
            console.log("In P");
            roomdata.players
              .filter((ele) => ele.userid.toString() !== userid.toString())
              .forEach((pl) => {
                if (p.wallet < pl.wallet) {
                  p = pl;
                }
              });
            roomdata = await roomModel.findOneAndUpdate(
              { _id: tableId },
              { hostId: p.userid },
              { new: true }
            );
            io.in(roomdata._id.toString()).emit("adminLeave", {
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
          console.log("entered in first if");
          await leaveApiCall(roomdata, userid);
        } else {
          console.log("entered in else condition do leave");
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
          io.in(updatedData._id.toString()).emit("playerleft", {
            msg: `${playerdata[0].name} has left the game`,
            userId: userid,
          });
      }
    } else {
      if (socket) socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    if (socket)
      socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doFold = async (roomData, playerid, io) => {
  try {
    const roomid = roomData._id;
    let updatedRoom = null;
    let playingPlayer = [];
    let res = true;

    let lastAction = "fold";
    if (roomData.lastAction === "check") {
      lastAction = "check";
    }
    if (
      roomData?.timerPlayer &&
      roomData?.timerPlayer?.toString() === playerid?.toString()
    ) {
      switch (roomData.runninground) {
        case 1: {
          if (roomData.preflopround.find((pl) => pl.id === playerid)?.action) {
            return;
          }

          roomData.lastAction = lastAction;

          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
              "preflopround.id": playerid,
            },
            {
              "preflopround.$.fold": true,
              "preflopround.$.actionType": "fold",
              lastAction,
              "preflopround.$.tentativeAction": null,
            },
            {
              new: true,
            }
          );
          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "fold",
          });
          io.in(roomData._id.toString()).emit("fold", {
            updatedRoom: roomData,
          });

          updatedRoom.preflopround.forEach((el) => {
            if (
              !el.fold &&
              (el.wallet > 0 ||
                updatedRoom.allinPlayers.find((all) => all.id === el.id)) &&
              el.playing
            ) {
              playingPlayer.push({ id: el.id, position: el.position });
            }
          });

          if (playingPlayer.length === 1) {
            await roomModel.updateOne(
              {
                _id: roomid,
              },
              {
                runninground: 5,
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

        case 2: {
          if (roomData.flopround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          roomData.lastAction = lastAction;

          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
              "flopround.id": playerid,
            },
            {
              "flopround.$.fold": true,
              "flopround.$.actionType": "fold",
              "flopround.$.tentativeAction": null,
              lastAction,
            },
            {
              new: true,
            }
          );
          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "fold",
          });
          io.in(roomData._id.toString()).emit("fold", {
            updatedRoom: roomData,
          });
          updatedRoom.flopround.forEach((el) => {
            if (
              !el.fold &&
              (el.wallet > 0 ||
                updatedRoom.allinPlayers.find((all) => all.id === el.id)) &&
              el.playing
            ) {
              playingPlayer.push({ id: el.id, position: el.position });
            }
          });
          if (playingPlayer.length === 1) {
            await roomModel.updateOne(
              {
                _id: roomid,
              },
              {
                runninground: 5,
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

        case 3: {
          if (roomData.turnround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          roomData.lastAction = lastAction;
          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
              "turnround.id": playerid,
            },
            {
              "turnround.$.fold": true,
              "turnround.$.actionType": "fold",
              "turnround.$.tentativeAction": null,
              lastAction,
            },
            {
              new: true,
            }
          );
          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "fold",
          });
          io.in(roomData._id.toString()).emit("fold", {
            updatedRoom: roomData,
          });
          updatedRoom.turnround.forEach((el) => {
            if (
              !el.fold &&
              (el.wallet > 0 ||
                updatedRoom.allinPlayers.find((all) => all.id === el.id)) &&
              el.playing
            ) {
              playingPlayer.push({ id: el.id, position: el.position });
            }
          });
          if (playingPlayer.length === 1) {
            await roomModel.updateOne(
              {
                _id: roomid,
              },
              {
                runninground: 5,
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

        case 4: {
          if (roomData.riverround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          roomData.lastAction = lastAction;

          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
              "riverround.id": playerid,
            },
            {
              "riverround.$.fold": true,
              "riverround.$.actionType": "fold",
              "riverround.$.tentativeAction": null,
              lastAction,
            },
            {
              new: true,
            }
          );
          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "fold",
          });
          io.in(roomData._id.toString()).emit("fold", {
            updatedRoom: roomData,
          });
          updatedRoom.riverround.forEach((el) => {
            if (
              !el.fold &&
              (el.wallet > 0 ||
                updatedRoom.allinPlayers.find((all) => all.id === el.id)) &&
              el.playing
            ) {
              playingPlayer.push({ id: el.id, position: el.position });
            }
          });
          if (playingPlayer.length === 1) {
            await roomModel.updateOne(
              {
                _id: roomid,
              },
              {
                runninground: 5,
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
      return res;
    }
    console.log("exit called fold");
    return res;
  } catch (error) {
    console.log("fafdaaf", error);
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
            "players.userid": playerid,
          }
          // { _id: 1 }
        )
        .lean();
      if (data !== null) {
        await doFold(data, playerid, io);
      } else {
        socket.emit("actionError", { code: 400, msg: "Data not found" });
      }
    } else {
      socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    console.log("error : ", e);
    socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doCall = async (roomData, playerid, io, amout) => {
  let amt = amout;
  const { _id: roomid } = roomData;
  let updatedRoom = null;
  const res = true;

  let roundData = null;

  if (roomData.timerPlayer.toString() === playerid.toString()) {
    switch (roomData.runninground) {
      case 1:
        if (roomData.preflopround.find((pl) => pl.id === playerid)?.action) {
          return;
        }
        roundData = roomData.preflopround.filter(
          (el) => el.id.toString() === playerid.toString()
        );

        amt -= roundData[0].pot;

        await roomModel.updateOne(
          {
            _id: roomid,
            "preflopround.id": playerid,
          },
          {
            $inc: {
              "preflopround.$.wallet": -amt,
              "preflopround.$.pot": +amt,
            },
            "preflopround.$.action": true,
            "preflopround.$.actionType": "call",
            lastAction: "call",
            "preflopround.$.tentativeAction": null,
          },
          {
            new: true,
          }
        );
        updatedRoom = await roomModel.findOne({ _id: roomid });
        io.in(updatedRoom._id.toString()).emit("actionperformed", {
          id: playerid,
          action: "call",
        });
        io.in(updatedRoom._id.toString()).emit("call", { updatedRoom });

        break;

      case 2:
        if (roomData.flopround.find((pl) => pl.id === playerid)?.action) {
          return;
        }
        roundData = roomData.flopround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        amt -= roundData[0].pot;

        await roomModel.updateOne(
          {
            _id: roomid,
            "flopround.id": playerid,
          },
          {
            $inc: {
              "flopround.$.wallet": -amt,
              "flopround.$.pot": +amt,
            },
            "flopround.$.action": true,
            "flopround.$.actionType": "call",
            lastAction: "call",
            "flopround.$.tentativeAction": null,
          },
          {
            new: true,
          }
        );
        updatedRoom = await roomModel.findOne({ _id: roomid });
        io.in(updatedRoom._id.toString()).emit("actionperformed", {
          id: playerid,
          action: "call",
        });
        io.in(updatedRoom._id.toString()).emit("call", { updatedRoom });

        break;
      case 3:
        if (roomData.turnround.find((pl) => pl.id === playerid)?.action) {
          return;
        }
        roundData = roomData.turnround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        amt -= roundData[0].pot;

        await roomModel.updateOne(
          {
            _id: roomid,
            "turnround.id": playerid,
          },
          {
            $inc: {
              "turnround.$.wallet": -amt,
              "turnround.$.pot": +amt,
            },
            "turnround.$.action": true,
            "turnround.$.actionType": "call",
            lastAction: "call",
            "turnround.$.tentativeAction": null,
          },
          {
            new: true,
          }
        );
        updatedRoom = await roomModel.findOne({ _id: roomid });
        io.in(updatedRoom._id.toString()).emit("actionperformed", {
          id: playerid,
          action: "call",
        });
        io.in(updatedRoom._id.toString()).emit("call", { updatedRoom });

        return res;

      case 4:
        if (roomData.riverround.find((pl) => pl.id === playerid)?.action) {
          return;
        }
        roundData = roomData.riverround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        amt -= roundData[0].pot;

        await roomModel.updateOne(
          {
            _id: roomid,
            "riverround.id": playerid,
          },
          {
            $inc: {
              "riverround.$.wallet": -amt,
              "riverround.$.pot": +amt,
            },
            "riverround.$.action": true,
            "riverround.$.actionType": "call",
            lastAction: "call",
            "riverround.$.tentativeAction": null,
          },
          {
            new: true,
          }
        );
        updatedRoom = await roomModel.findOne({ _id: roomid });
        io.in(updatedRoom._id.toString()).emit("actionperformed", {
          id: playerid,
          action: "call",
        });
        io.in(updatedRoom._id.toString()).emit("call", { updatedRoom });

        break;
      default:
        return res;
    }
  }
};

export const socketDoCall = async (dta, io, socket) => {
  let userid = dta.userid;
  let roomid = dta.roomid;

  console.log("do call executed 1", dta);
  const { isValid } = checkIfEmpty({ roomid, userid, amt: dta.amount });

  try {
    if (isValid) {
      roomid = mongoose.Types.ObjectId(roomid);
      let playerid = mongoose.Types.ObjectId(userid);
      let amt = parseInt(dta.amount);
      const data = await roomModel
        .findOne({
          _id: roomid,
        })
        .lean();
      if (data !== null) {
        if (data.raiseAmount == amt) {
          const walletAmt = await getPlayerwallet(data, playerid);
          if (walletAmt >= amt) {
            await doCall(data, playerid, io, amt);
          } else {
            socket.emit("actionError", {
              code: 400,
              msg: "Insufficient chips",
            });
          }
        } else {
          socket.emit("actionError", {
            code: 400,
            msg: `Call amount must be ${data.raiseAmount}`,
          });
        }
      } else {
        socket.emit("actionError", { code: 404, msg: "Data not found" });
      }
    } else {
      socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    console.log("error : ", e);
    socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doBet = async (roomData, playerid, io, amt) => {
  try {
    // const roomData = await roomModel.findOne({ _id: roomid });
    const roomid = roomData._id;
    let updatedRoom = null;
    let res = true;
    let filterData = null;
    let roundData = null;
    let p;
    let updatedRaiseAmt = roomData.raiseAmount;
    const filterDta = roomData.players.filter(
      (el) => el.userid.toString() === roomData.timerPlayer.toString()
    );

    if (roomData.timerPlayer.toString() === playerid.toString()) {
      switch (roomData.runninground) {
        case 2: {
          if (roomData.flopround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          roundData = roomData.flopround.filter(
            (el) => el.id.toString() === playerid.toString()
          );
          amt = amt - roundData[0].pot;
          roomData.flopround.forEach((e) => {
            if (
              e.tentativeAction &&
              (e.tentativeAction.startsWith("call ") ||
                e.tentativeAction === "check")
            ) {
              e.tentativeAction = null;
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "check/fold"
            ) {
              e.tentativeAction = "fold";
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "callAny" &&
              amt >= e.wallet
            ) {
              e.tentativeAction = "allin";
            }
            if (e.id.toString() === playerid.toString()) {
              e.wallet = e.wallet - amt;
              e.pot = e.pot + amt;
              updatedRaiseAmt = e.pot;
              e.action = true;
              e.actionType = "bet";
              e.tentativeAction = null;
            }
          });
          roomData.raisePlayerPosition = filterDta[0].position;
          roomData.raiseAmount = updatedRaiseAmt;
          roomData.lastAction = "bet";
          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              flopround: roomData.flopround,
              raisePlayerPosition: filterDta[0].position,
              raiseAmount: updatedRaiseAmt, //amt + roundData[0].pot,
              lastAction: "bet",
            },
            {
              new: true,
            }
          );
          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "bet",
          });
          io.in(roomData._id.toString()).emit("bet", { updatedRoom });

          break;
        }

        case 3: {
          if (roomData.turnround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          roundData = roomData.turnround.filter(
            (el) => el.id.toString() === playerid.toString()
          );
          amt = amt - roundData[0].pot;
          roomData.turnround.forEach((e) => {
            if (
              e.tentativeAction &&
              (e.tentativeAction.startsWith("call ") ||
                e.tentativeAction === "check")
            ) {
              e.tentativeAction = null;
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "check/fold"
            ) {
              e.tentativeAction = "fold";
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "callAny" &&
              amt >= e.wallet
            ) {
              e.tentativeAction = "allin";
            }
            if (e.id.toString() === playerid.toString()) {
              e.wallet = e.wallet - amt;
              e.pot = e.pot + amt;
              updatedRaiseAmt = e.pot;
              e.action = true;
              e.actionType = "bet";
              e.tentativeAction = null;
            }
          });
          roomData.raisePlayerPosition = filterDta[0].position;
          roomData.raiseAmount = updatedRaiseAmt;
          roomData.lastAction = "bet";

          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              turnround: roomData.turnround,
              raisePlayerPosition: filterDta[0].position,
              raiseAmount: updatedRaiseAmt, //amt + roundData[0].pot,
              lastAction: "bet",
            },
            {
              new: true,
            }
          );
          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "bet",
          });
          io.in(roomData._id.toString()).emit("bet", { updatedRoom: roomData });

          break;
        }

        case 4: {
          if (roomData.riverround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          roundData = roomData.riverround.filter(
            (el) => el.id.toString() === playerid.toString()
          );
          amt = amt - roundData[0].pot;
          roomData.riverround.forEach((e) => {
            if (
              e.tentativeAction &&
              (e.tentativeAction.startsWith("call ") ||
                e.tentativeAction === "check")
            ) {
              e.tentativeAction = null;
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "check/fold"
            ) {
              e.tentativeAction = "fold";
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "callAny" &&
              amt >= e.wallet
            ) {
              e.tentativeAction = "allin";
            }
            if (e.id.toString() === playerid.toString()) {
              e.wallet = e.wallet - amt;
              e.pot = e.pot + amt;
              updatedRaiseAmt = e.pot;
              e.action = true;
              e.actionType = "bet";
              e.tentativeAction = null;
            }
          });
          roomData.raisePlayerPosition = filterDta[0].position;
          roomData.raiseAmount = updatedRaiseAmt;
          roomData.lastAction = "bet";

          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              riverround: roomData.riverround,
              raisePlayerPosition: filterDta[0].position,
              raiseAmount: updatedRaiseAmt, //amt + roundData[0].pot,
              lastAction: "bet",
            },
            {
              new: true,
            }
          );
          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "bet",
          });
          io.in(roomData._id.toString()).emit("bet", { updatedRoom: roomData });
          break;
        }
      }
    }
  } catch (error) {
    console.log("Error in do Bet", error);
  }
};

export const socketDoBet = async (dta, io, socket) => {
  let userid = convertMongoId(dta.userid);
  let roomid = convertMongoId(dta.roomid);

  const { isValid } = checkIfEmpty({ roomid, userid, amt: dta.amount });

  try {
    if (isValid) {
      let playerid = userid;
      let amt = parseInt(dta.amount);
      const data = await roomModel
        .findOne({
          _id: roomid,
        })
        .lean();

      if (data !== null) {
        if (data.raiseAmount <= amt) {
          const walletAmt = await getPlayerwallet(data, playerid);
          if (walletAmt >= amt) {
            await doBet(data, playerid, io, amt);
          } else {
            socket.emit("actionError", {
              code: 400,
              msg: "Insufficient chips",
            });
          }
        } else {
          socket.emit("actionError", {
            code: 400,
            msg: `bet amount must be equal or more than bigblind amount`,
          });
        }
      } else {
        socket.emit("actionError", { code: 404, msg: "Data not found" });
      }
    } else {
      socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    console.log("error : ", e);
    socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doRaise = async (roomData, playerid, io, amt) => {
  try {
    // const roomData = await roomModel.findOne({ _id: roomid });
    const roomid = roomData._id;
    let updatedRoom = null;
    let res = true;
    let filterData = null;
    let newRaiseAmt = null;
    let roundData = null;
    let unpdatedRaisdAmt = roomData.raiseAmount;
    let p;

    if (roomData?.timerPlayer?.toString() === playerid?.toString()) {
      switch (roomData.runninground) {
        case 1: {
          if (roomData.preflopround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          roundData = roomData.preflopround.filter(
            (el) => el.id.toString() === playerid.toString()
          );

          amt = amt - roundData[0].pot;
          roomData.preflopround.forEach((e) => {
            if (
              e.tentativeAction &&
              (e.tentativeAction.startsWith("call ") ||
                e.tentativeAction === "check")
            ) {
              e.tentativeAction = null;
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "check/fold"
            ) {
              e.tentativeAction = "fold";
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "callAny" &&
              amt >= e.wallet
            ) {
              e.tentativeAction = "allin";
            }
            if (e.id.toString() === playerid.toString()) {
              e.wallet = e.wallet - amt;
              e.pot = e.pot + amt;
              unpdatedRaisdAmt = e.pot;
              e.action = true;
              e.actionType = "raise";
              e.tentativeAction = null;
            }
          });
          roomData.raisePlayerPosition = roundData[0].position;
          roomData.raiseAmount = unpdatedRaisdAmt;
          roomData.lastAction = "raise";

          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              preflopround: roomData.preflopround,
              raisePlayerPosition: roundData[0].position,
              raiseAmount: unpdatedRaisdAmt, //amt + roundData[0].pot,
              lastAction: "raise",
            },
            {
              new: true,
            }
          );
          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "raise",
          });
          io.in(roomData._id.toString()).emit("raise", {
            updatedRoom: roomData,
          });
          break;
        }

        case 2: {
          if (roomData.flopround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          roundData = roomData.flopround.filter(
            (el) => el.id.toString() === playerid.toString()
          );
          amt = amt - roundData[0].pot;
          roomData.flopround.forEach((e) => {
            if (
              e.tentativeAction &&
              (e.tentativeAction.startsWith("call ") ||
                e.tentativeAction === "check")
            ) {
              e.tentativeAction = null;
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "check/fold"
            ) {
              e.tentativeAction = "fold";
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "callAny" &&
              amt >= e.wallet
            ) {
              e.tentativeAction = "allin";
            }
            if (e.id.toString() === playerid.toString()) {
              e.wallet = e.wallet - amt;
              e.pot = e.pot + amt;
              unpdatedRaisdAmt = e.pot;
              e.action = true;
              e.actionType = "raise";
              e.tentativeAction = null;
            }
          });

          roomData.raisePlayerPosition = roundData[0].position;
          roomData.raiseAmount = unpdatedRaisdAmt;
          roomData.lastAction = "raise";

          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              flopround: roomData.flopround,
              raisePlayerPosition: roundData[0].position,
              raiseAmount: unpdatedRaisdAmt, //amt + roundData[0].pot,
              lastAction: "raise",
            },
            {
              new: true,
            }
          );
          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "raise",
          });
          io.in(roomData._id.toString()).emit("raise", {
            updatedRoom: roomData,
          });

          break;
        }

        case 3: {
          if (roomData.turnround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          roundData = roomData.turnround.filter(
            (el) => el.id.toString() === playerid.toString()
          );
          amt = amt - roundData[0].pot;
          roomData.turnround.forEach((e) => {
            if (
              e.tentativeAction &&
              (e.tentativeAction.startsWith("call ") ||
                e.tentativeAction === "check")
            ) {
              e.tentativeAction = null;
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "check/fold"
            ) {
              e.tentativeAction = "fold";
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "callAny" &&
              amt >= e.wallet
            ) {
              e.tentativeAction = "allin";
            }
            if (e.id.toString() === playerid.toString()) {
              e.wallet = e.wallet - amt;
              e.pot = e.pot + amt;
              unpdatedRaisdAmt = e.pot;
              e.action = true;
              e.actionType = "raise";
              e.tentativeAction = null;
            }
          });
          roomData.raisePlayerPosition = roundData[0].position;
          roomData.raiseAmount = unpdatedRaisdAmt;
          roomData.lastAction = "raise";
          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              turnround: roomData.turnround,
              raisePlayerPosition: roundData[0].position,
              raiseAmount: unpdatedRaisdAmt, //amt + roundData[0].pot,
              lastAction: "raise",
            },
            {
              new: true,
            }
          );
          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "raise",
          });
          io.in(roomData._id.toString()).emit("raise", {
            updatedRoom: roomData,
          });

          return res;
        }

        case 4: {
          if (roomData.riverround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          roundData = roomData.riverround.filter(
            (el) => el.id.toString() === playerid.toString()
          );
          amt = amt - roundData[0].pot;
          roomData.riverround.forEach((e) => {
            if (
              e.tentativeAction &&
              (e.tentativeAction.startsWith("call ") ||
                e.tentativeAction === "check")
            ) {
              e.tentativeAction = null;
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "check/fold"
            ) {
              e.tentativeAction = "fold";
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "callAny" &&
              amt >= e.wallet
            ) {
              e.tentativeAction = "allin";
            }

            if (e.id.toString() === playerid.toString()) {
              e.wallet = e.wallet - amt;
              e.pot = e.pot + amt;
              unpdatedRaisdAmt = e.pot;
              e.action = true;
              e.actionType = "raise";
              e.tentativeAction = null;
            }
          });

          roomData.raisePlayerPosition = roundData[0].position;
          roomData.raiseAmount = unpdatedRaisdAmt;
          roomData.lastAction = "raise";

          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              riverround: roomData.riverround,
              raisePlayerPosition: roundData[0].position,
              raiseAmount: unpdatedRaisdAmt, //amt + roundData[0].pot,
              lastAction: "raise",
            },
            {
              new: true,
            }
          );
          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "raise",
          });
          io.in(roomData._id.toString()).emit("raise", {
            updatedRoom: roomData,
          });
          break;
        }
      }
    }
  } catch (error) {
    console.log("Error in doRaise", error);
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
      let amt = parseInt(dta.amount);

      const data = await roomModel
        .findOne({
          _id: roomid,
        })
        .lean();

      if (data !== null) {
        if (data.raiseAmount <= amt) {
          const walletAmt = await getPlayerwallet(data, playerid);
          console.log("walletAmt ======>", walletAmt, amt);
          if (walletAmt >= amt) {
            await doRaise(data, playerid, io, amt);
          } else {
            socket.emit("actionError", {
              code: 400,
              msg: "Insufficient chips",
            });
          }
        } else {
          socket.emit("actionError", {
            code: 400,
            msg: `Raise amount must be minimum ${data.raiseAmount}`,
          });
        }
      } else {
        socket.emit("actionError", { code: 404, msg: "Data not found" });
      }
    } else {
      socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    console.log("error : ", e);
    socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doCheck = async (roomData, playerid, io) => {
  try {
    const roomid = roomData._id;
    let res = true;

    if (roomData?.timerPlayer?.toString() === playerid?.toString()) {
      switch (roomData.runninground) {
        case 1: {
          if (roomData.preflopround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          let p = roomData.preflopround;

          p = p.map((el) => {
            if (el.id.toString() === playerid.toString()) {
              el.action = true;
              el.tentativeAction = null;
              el.actionType = "check";
            }
            return el;
          });

          roomData.preflopround = p;
          roomData.lastAction = "check";
          await roomModel.updateOne(
            {
              _id: roomid,
            },
            {
              preflopround: roomData.preflopround,
              lastAction: "check",
            }
          );
          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "check",
          });
          io.in(roomData._id.toString()).emit("check", {
            updatedRoom: roomData,
          });
          break;
        }

        case 2: {
          if (roomData.flopround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          let p = roomData.flopround;

          p = p.map((el) => {
            if (el.id.toString() === playerid.toString()) {
              el.action = true;
              el.tentativeAction = null;
              el.actionType = "check";
            }
            return el;
          });

          roomData.flopround = p;
          roomData.lastAction = "check";

          await roomModel.updateOne(
            {
              _id: roomid,
            },
            {
              flopround: roomData.flopround,
              lastAction: "check",
            }
          );

          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "check",
          });
          io.in(roomData._id.toString()).emit("check", {
            updatedRoom: roomData,
          });
          break;
        }

        case 3: {
          if (roomData.turnround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          let p = roomData.turnround;

          p = p.map((el) => {
            if (el.id.toString() === playerid.toString()) {
              el.action = true;
              el.tentativeAction = null;
              el.actionType = "check";
            }
            return el;
          });

          roomData.turnround = p;
          roomData.lastAction = "check";

          await roomModel.updateOne(
            {
              _id: roomid,
            },
            {
              lastAction: "check",
              turnround: roomData.turnround,
            }
          );
          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "check",
          });
          io.in(roomData._id.toString()).emit("check", {
            updatedRoom: roomData,
          });
          return res;
        }

        case 4:
          {
            if (roomData.riverround.find((pl) => pl.id === playerid)?.action) {
              return;
            }
            let p = roomData.riverround;

            p = p.map((el) => {
              if (el.id.toString() === playerid.toString()) {
                el.action = true;
                el.tentativeAction = null;
                el.actionType = "check";
              }
              return el;
            });

            roomData.riverround = p;
            roomData.lastAction = "check";
            await roomModel.updateOne(
              {
                _id: roomid,
              },
              {
                lastAction: "check",
                riverround: roomData.riverround,
              }
            );
          }
          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "check",
          });
          io.in(roomData._id.toString()).emit("check", {
            updatedRoom: roomData,
          });

          break;
      }
    }
  } catch (error) {
    console.log("errorerrorerrordd", error);
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
        .findOne({
          _id: roomid,
        })
        .lean();
      if (data !== null) {
        await doCheck(data, playerid, io);
      } else {
        socket.emit("actionError", { code: 404, msg: "Data not found" });
      }
    } else {
      socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    console.log("error : ", e);
    socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doAllin = async (roomData, playerid, io) => {
  try {
    let roomid = roomData._id;
    // const roomData = await roomModel.findOne({ _id: roomid });
    playerid = convertMongoId(playerid);
    roomid = roomData._id;
    roomid = convertMongoId(roomid);

    let updatedRoom = null;
    // let res = true;
    let roundData = null;
    let raiseAmount = roomData.raiseAmount;
    let raisePlayerPosition = roomData.raisePlayerPosition;
    let allinPlayer = roomData.allinPlayers;

    // const filterDta = roomData.players.filter(
    //   (el) => el?.userid?.toString() === roomData?.timerPlayer?.toString()
    // );

    if (roomData?.timerPlayer?.toString() === playerid?.toString()) {
      switch (roomData.runninground) {
        case 1: {
          if (roomData.preflopround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          roundData = roomData.preflopround.filter(
            (el) => el.id.toString() === playerid.toString()
          );
          raisePlayerPosition =
            raiseAmount < roundData[0].wallet + roundData[0].pot
              ? roundData[0].position
              : raisePlayerPosition;
          raiseAmount =
            raiseAmount < roundData[0].wallet + roundData[0].pot
              ? roundData[0].wallet + roundData[0].pot
              : raiseAmount;

          allinPlayer.push({
            id: playerid,
            amt: roundData[0].wallet + roundData[0].pot,
            wallet: roundData[0].wallet,
            round: roomData.runninground,
          });

          roomData.preflopround.forEach((e) => {
            if (
              e.tentativeAction &&
              (e.tentativeAction.startsWith("call ") ||
                e.tentativeAction === "check")
            ) {
              e.tentativeAction = null;
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "check/fold"
            ) {
              e.tentativeAction = "fold";
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "callAny" &&
              roundData[0].wallet + roundData[0].pot >= e.wallet
            ) {
              e.tentativeAction = "allin";
            }
            if (e.id.toString() === playerid.toString()) {
              e.pot += e.wallet;
              e.wallet = 0;
              e.action = true;
              e.actionType = "all-in";
              e.tentativeAction = null;
            }
          });
          roomData.raiseAmount = raiseAmount;
          roomData.raisePlayerPosition = raisePlayerPosition;
          roomData.lastAction = "all-in";
          roomData.allinPlayers = allinPlayer;
          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },

            {
              raisePlayerPosition: raisePlayerPosition,
              raiseAmount: raiseAmount,
              lastAction: "all-in",
              allinPlayers: allinPlayer,
              preflopround: roomData.preflopround,
            },
            {
              new: true,
            }
          );
          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "all-in",
          });
          io.in(roomData._id.toString()).emit("allin", {
            updatedRoom,
          });

          break;
        }

        case 2: {
          if (roomData.flopround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          roundData = roomData.flopround.filter(
            (el) => el.id.toString() === playerid.toString()
          );
          raisePlayerPosition =
            raiseAmount < roundData[0].wallet + roundData[0].pot
              ? roundData[0].position
              : raisePlayerPosition;
          raiseAmount =
            raiseAmount < roundData[0].wallet + roundData[0].pot
              ? roundData[0].wallet + roundData[0].pot
              : raiseAmount;
          allinPlayer.push({
            id: playerid,
            amt: roundData[0].wallet + roundData[0].pot,
            round: roomData.runninground,
            wallet: roundData[0].wallet,
          });

          roomData.flopround.forEach((e) => {
            if (
              e.tentativeAction &&
              (e.tentativeAction.startsWith("call ") ||
                e.tentativeAction === "check")
            ) {
              e.tentativeAction = null;
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "check/fold"
            ) {
              e.tentativeAction = "fold";
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "callAny" &&
              roundData[0].wallet + roundData[0].pot >= e.wallet
            ) {
              e.tentativeAction = "allin";
            }
            if (e.id.toString() === playerid.toString()) {
              e.pot += e.wallet;
              e.wallet = 0;
              e.action = true;
              e.actionType = "all-in";
              e.tentativeAction = null;
            }
          });

          roomData.raisePlayerPosition = raisePlayerPosition;
          roomData.allinPlayers = allinPlayer;
          roomData.lastAction = "all-in";
          roomData.raiseAmount = raiseAmount;

          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "all-in",
          });

          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              flopround: roomData.flopround,
              raisePlayerPosition: raisePlayerPosition,
              raiseAmount: raiseAmount,
              lastAction: "all-in",
              allinPlayers: allinPlayer,
            },
            {
              new: true,
            }
          );
          io.in(roomData._id.toString()).emit("allin", {
            updatedRoom,
          });

          break;
        }

        case 3: {
          if (roomData.turnround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          roundData = roomData.turnround.filter(
            (el) => el.id.toString() === playerid.toString()
          );
          raisePlayerPosition =
            raiseAmount < roundData[0].wallet + roundData[0].pot
              ? roundData[0].position
              : raisePlayerPosition;
          raiseAmount =
            raiseAmount < roundData[0].wallet + roundData[0].pot
              ? roundData[0].wallet + roundData[0].pot
              : raiseAmount;
          allinPlayer.push({
            id: playerid,
            amt: roundData[0].wallet + roundData[0].pot,
            round: roomData.runninground,
            wallet: roundData[0].wallet,
          });

          roomData.turnround.forEach((e) => {
            if (
              e.tentativeAction &&
              (e.tentativeAction.startsWith("call ") ||
                e.tentativeAction === "check")
            ) {
              e.tentativeAction = null;
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "check/fold"
            ) {
              e.tentativeAction = "fold";
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "callAny" &&
              roundData[0].wallet + roundData[0].pot >= e.wallet
            ) {
              e.tentativeAction = "allin";
            }
            if (e.id.toString() === playerid.toString()) {
              e.pot += e.wallet;
              e.wallet = 0;
              e.action = true;
              e.actionType = "all-in";
              e.tentativeAction = null;
            }
          });

          roomData.raisePlayerPosition = raisePlayerPosition;
          roomData.allinPlayers = allinPlayer;
          roomData.lastAction = "all-in";
          roomData.raiseAmount = raiseAmount;

          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "all-in",
          });

          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              turnround: roomData.turnround,
              raisePlayerPosition: raisePlayerPosition,
              raiseAmount: raiseAmount,
              lastAction: "all-in",
              allinPlayers: allinPlayer,
            },
            {
              new: true,
            }
          );
          io.in(roomData._id.toString()).emit("allin", {
            updatedRoom,
          });
          break;
        }

        case 4: {
          if (roomData.riverround.find((pl) => pl.id === playerid)?.action) {
            return;
          }
          roundData = roomData.riverround.filter(
            (el) => el.id.toString() === playerid.toString()
          );
          raisePlayerPosition =
            raiseAmount < roundData[0].wallet + roundData[0].pot
              ? roundData[0].position
              : raisePlayerPosition;
          raiseAmount =
            raiseAmount < roundData[0].wallet + roundData[0].pot
              ? roundData[0].wallet + roundData[0].pot
              : raiseAmount;
          allinPlayer.push({
            id: playerid,
            amt: roundData[0].wallet + roundData[0].pot,
            round: roomData.runninground,
            wallet: roundData[0].wallet,
          });

          roomData.riverround.forEach((e) => {
            if (
              e.tentativeAction &&
              (e.tentativeAction.startsWith("call ") ||
                e.tentativeAction === "check")
            ) {
              e.tentativeAction = null;
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "check/fold"
            ) {
              e.tentativeAction = "fold";
            } else if (
              e.tentativeAction &&
              e.tentativeAction === "callAny" &&
              roundData[0].wallet + roundData[0].pot >= e.wallet
            ) {
              e.tentativeAction = "allin";
            }
            if (e.id.toString() === playerid.toString()) {
              e.pot += e.wallet;
              e.wallet = 0;
              e.action = true;
              e.actionType = "all-in";
              e.tentativeAction = null;
            }
          });
          roomData.raisePlayerPosition = raisePlayerPosition;
          roomData.allinPlayers = allinPlayer;
          roomData.lastAction = "all-in";
          roomData.raiseAmount = raiseAmount;

          io.in(roomData._id.toString()).emit("actionperformed", {
            id: playerid,
            action: "all-in",
          });

          updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: roomid,
            },
            {
              riverround: roomData.riverround,
              raisePlayerPosition: raisePlayerPosition,
              raiseAmount: raiseAmount,
              lastAction: "all-in",
              allinPlayers: allinPlayer,
            },
            {
              new: true,
            }
          );
          io.in(roomData._id.toString()).emit("allin", {
            updatedRoom,
          });
          break;
        }
      }
    }
  } catch (error) {
    console.log("LINE NUMBER 4352 in function.js", error);
  }
};

export const socketDoAllin = async (dta, io, socket) => {
  let userid = mongoose.Types.ObjectId(dta.userid);
  let roomid = mongoose.Types.ObjectId(dta.roomid);

  const { isValid } = checkIfEmpty({ roomid, userid });

  try {
    if (isValid) {
      roomid = mongoose.Types.ObjectId(roomid);
      let playerid = userid;
      // let amt  = body.amount;
      const data = await roomModel
        .findOne({
          _id: roomid,
        })
        .lean();
      if (data !== null) {
        await doAllin(data, playerid, io);
      } else {
        socket.emit("actionError", { code: 404, msg: "Data not found" });
      }
    } else {
      socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    console.log("error : ", e);
    socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

const winnerBeforeShowdown = async (roomid, playerid, runninground, io) => {
  try {
    // console.log("winner before show down executed");
    const roomData = await roomModel.findOne({ _id: roomid });
    // console.log("ROOM DATA PLAYERS ", roomData.players);
    let winnerAmount = 0;
    let showDownPlayers = [];
    let playerData = null;
    let totalPot = roomData.pot;
    switch (runninground) {
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
      default:
        break;
    }
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
        chipsBeforeHandStart: e.chipsBeforeHandStart,
      };
      showDownPlayers.push(p);
    });
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
        winnerCards: winnerPlayerData[0].cards.map((card) => decryptCard(card)),
        communityCards: roomData.communityCard.map((card) => decryptCard(card)),
      },
    ];
    const handWinner = roomData.handWinner;
    handWinner.push(winnerPlayer);

    showDownPlayers.forEach((player, i) => {
      let action, amt;
      if (player.playing) {
        if (winnerPlayer.find((ele) => ele.id === player.id)) {
          action = "game-win";
          amt = winnerPlayer.find((ele) => ele.id === player.id).winningAmount;
        } else {
          action = "game-lose";
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

    roomData.isGameRunning = false;
    roomData.showdown = showDownPlayers;
    roomData.pot = 0;
    roomData.winnerPlayer = winnerPlayer;
    roomData.handWinner = handWinner;

    io.in(roomData._id.toString()).emit("winner", { updatedRoom: roomData });

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

    console.log("showwwwww---->", updatedRoom.showdown);
    gameRestartSeconds = 3000;

    // await finishHandApiCall(updatedRoom);
    handleWatcherWinner(updatedRoom, io);
    // await elemination(roomid, io);
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
      if (updatedRoom?.tournament) {
        await elemination(updatedRoom, io);
        await reArrangeTables(updatedRoom.tournament, io, updatedRoom._id);
      } else {
        await updateRoomForNewHand(roomid, io);
        ///dgs
        console.log("roomidroomidroomid", roomid);
        let updatedRoomPlayers = await roomModel.findOne({
          _id: roomid,
        });
        console.log(
          "I am here--- for check re arrange table",
          updatedRoomPlayers
        );
        console.log("auto hand 1--->");
        if (!updatedRoom.pause) {
          console.log("auto hand 2--->");
          if (updatedRoom.autoNextHand) {
            preflopround(updatedRoom, io);
          } else {
            console.log("updated room player-->");
            let havemoney = updatedRoomPlayers.players.filter(
              (el) => el.wallet > 0
            );
            console.log("havemoney-->");
            if (havemoney.length > 1) {
              console.log("Table stop waiting for start game");
              io.in(updatedRoom._id.toString()).emit("tablestopped", {
                msg: "Waiting to start game",
              });
            } else {
              io.in(updatedRoom._id.toString()).emit("onlyOnePlayingPlayer", {
                msg: "Game finished, Only one player left",
                roomdata: updatedRoomPlayers,
              });
              if (updatedRoomPlayers.gameType === "pokerTournament_Tables") {
                await finishedTableGame(io, updatedRoomPlayers, playerid);
                io.in(updatedRoomPlayers._id.toString()).emit("roomFinished", {
                  msg: "Game finished",
                  finish: updatedRoomPlayers.finish,
                  roomdata: updatedRoomPlayers,
                });
              }
            }
          }
        } else {
          const room = await roomModel.findOneAndUpdate(
            { _id: updatedRoom._id },
            { gamestart: false },
            { new: true }
          );
          io.in(updatedRoom._id.toString()).emit("tablestopped", {
            msg: "Table stopped by host",
            game: room,
          });
        }
        const roomUpdate = await roomModel.findOne({ _id: updatedRoom._id });
        if (roomUpdate?.finish) {
          await finishedTableGame(io, roomUpdate, playerid);
          io.in(roomUpdate._id.toString()).emit("roomFinished", {
            msg: "Room Finished",
            finish: roomUpdate?.finish,
            roomdata: roomUpdate,
          });
        }
      }
    }, gameRestartSeconds);
  } catch (error) {
    console.log("error in winnerBeforeShowdwon", error);
  }
};

export const getPlayerwallet = async (roomData, playerid) => {
  try {
    // const roomData = await roomModel.findOne({ _id: roomid });
    let res = null;
    let filterData = null;

    switch (roomData.runninground) {
      case 1:
        filterData = roomData.preflopround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        res = filterData[0].wallet + filterData[0].pot;
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
  } catch (error) {
    console.log("mmammamamm", error);
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
              $inc: { "levels.level": 1 },
              "levels.bigBlind.amount": bigBlind,
              "levels.smallBlind.amount": smallBlind,
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
  try {
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
  } catch (error) {
    console.log("jhhjgghgjhgj", error);
  }
};

export const nextWeekdayDate = (date, day_in_week) => {
  try {
    var ret = new Date(date || new Date());
    ret.setDate(ret.getDate() + ((day_in_week - 1 - ret.getDay() + 7) % 7) + 1);
    return ret;
  } catch (error) {
    console.log("hgfgfgfgh", error);
  }
};

export const reArrangeTables = async (tournamentId, io, roomId) => {
  try {
    const tournamentData = await tournamentModel
      .findOne(
        { _id: tournamentId },
        { rooms: 1, destroyedRooms: 1, havePlayers: 1 }
      )
      .populate("rooms", null)
      .lean();
    console.log("reArrange Called");
    if (tournamentData) {
      const notDestroyedYet = tournamentData.rooms.filter((el) => {
        let r = true;
        const have = tournamentData.destroyedRooms.filter(
          (e) => e.toString() === el._id.toString()
        );
        if (have.length) {
          r = false;
        }
        return r;
      });
      const allRooms = notDestroyedYet.sort((a, b) => {
        // ASC  -> a.length - b.length
        // DESC -> b.length - a.length
        return a.players.length - b.players.length;
      });
      if (allRooms.length > 0) {
        await fillSpot(allRooms, io, tournamentId, roomId);
      } else {
        console.log("no rooms in tournament");
      }
    } else {
      console.log("no tournament found");
    }
  } catch (error) {
    console.log("eror in reArrange =>", error);
  }
};

const fillSpot = async (allRooms, io, tournamentId, roomId) => {
  try {
    console.log("fill spot called");
    if (allRooms.length === 1) {
      if (allRooms[0].showdown.length > 1) {
        return preflopround(allRooms[0], io);
      } else {
        let totalPlayers = allRooms[0].showdown.length;
        allRooms[0].players.forEach((pl) => {
          if (
            allRooms[0].showdown.find(
              (sPl) => pl.userid.toString() !== sPl.userid.toString()
            )
          ) {
            totalPlayers += 1;
          }
        });
        if (totalPlayers > 1) {
          return preflopround(allRooms[0], io);
        }
        console.log("only one player =>", allRooms[0]);
        await distributeTournamentPrize(tournamentId, allRooms[0].showdown[0]);
        io.in(allRooms[0]._id.toString()).emit("tournamentFinished", {
          tournamentId,
        });
        //delete room push in destoryed room of tournament
        await tournamentModel.updateOne(
          { _id: tournamentId },
          { $push: { destroyedRooms: allRooms[0]._id } },
          {
            new: true,
          }
        );
        await roomModel.deleteOne({ _id: allRooms[0]._id });
        return;
      }
    }
    const room = allRooms.find((r) => r._id.toString() === roomId.toString());
    const OtherRoom = allRooms.filter(
      (r) => r._id.toString() !== roomId.toString()
    );
    let blankSpot = 0;
    OtherRoom.forEach((c) => {
      blankSpot += playerLimit - c.players.length;
    });
    if (blankSpot >= room.showdown.length) {
      let playersToMove = [...room.showdown];
      let userIds = [];
      for await (const r of OtherRoom) {
        if (playersToMove.length === 0 || blankSpot === 0) {
          break;
        }
        if (r.players.length >= playerLimit) {
          continue;
        }
        let newPlayers = [...r.players];
        let tempSpotArr = [...Array(playerLimit - r.players.length).keys()];
        for await (const temp of tempSpotArr) {
          if (playersToMove[temp]) {
            let position = await findAvailablePosition(newPlayers);
            newPlayers.push({ ...playersToMove[temp], position });
            userIds.push({
              userId: playersToMove[temp].userid,
              newRoomId: r._id,
            });
          }
        }
        const updatedRoom = await roomModel.findOneAndUpdate(
          {
            _id: r._id,
          },
          {
            players: newPlayers,
          },
          {
            new: true,
          }
        );
        playersToMove.splice(0, tempSpotArr.length);
        blankSpot -= tempSpotArr.length;
      }
      if (userIds.length) {
        io.in(room._id.toString()).emit("roomchanged", {
          userIds,
        });
        setTimeout(() => {
          allRooms.forEach((r) => {
            if (
              userIds.find(
                (user) => user.newRoomId.toString() === r._id.toString()
              ) &&
              !r.gamestart
            ) {
              preflopround(r, io);
            }
          });
        }, 1000);
      }
      if (playersToMove.length === 0) {
        await tournamentModel.updateOne(
          { _id: room.tournament },
          { $push: { destroyedRooms: room._id } },
          {
            new: true,
          }
        );
        await roomModel.deleteOne({ _id: room._id });
      }
    } else {
      console.log("Not enough blank spot");
      if (room.showdown.length > 1) {
        preflopround(room, io);
      } else {
        io.in(room._id.toString()).emit("waitForReArrange", {
          userIds: room.showdown.map((p) => p.id || p.userid),
        });
      }
    }
  } catch (error) {
    console.log("error in fillSpot function =>", error);
  }
};

export const destroyTable = async (mostBlnkRoom, leftBlankTables, io) => {
  try {
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

              io.in(roomData._id.toString()).emit("roomData", rUpdatedData);
              io.in(dRoomData._id.toString()).emit("roomchanged", {
                userid: player.userid,
                newRoomId: roomData._id,
              });
              const userData = await userModel.findOneAndUpdate(
                {
                  _id: player.userid,
                  "tournaments.tournamentId": roomData.tournament,
                },
                {
                  "tournaments.$.roomId": roomData._id,
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
              io.in(dRoomData._id.toString()).emit("roomData", dUpdatedData);

              let index = havePosition[0].spots.indexOf(player.position);
              if (index > -1) {
                havePosition[0].spots.splice(index, 1);
              }
              let otherleftTable = leftBlankTables.filter(
                (el) => !el.spots.includes(player.position)
              );
              console.log("<<----Other left table---->>");
            }
          }
          next();
        },
        function (err, transformedItems) {
          each(
            dPlayers,
            async function (player, next) {
              if (dPlayers.length) {
                const sit = async (player, i) => {
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
                      "roomData",
                      rUpdatedData
                    );
                    io.in(dRoomData._id.toString()).emit("roomchanged", {
                      userid: player.userid,
                      newRoomId: roomData._id,
                    });
                    const userData = await userModel.findOneAndUpdate(
                      {
                        _id: player.userid,
                        "tournaments.tournamentId": roomData.tournament,
                      },
                      {
                        "tournaments.$.roomId": roomData._id,
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
                      "roomData",
                      dUpdatedData
                    );

                    let index = havePosition[0].spots.indexOf(player.position);
                    if (index > -1) {
                      havePosition[0].spots.splice(index, 1);
                    }
                    let otherleftTable = leftBlankTables.filter(
                      (el) => !el.spots.includes(player.position)
                    );
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
  } catch (error) {
    console.log("rrrrryrry", error);
  }
};

export const getRoomsUpdatedData = async (rooms) => {
  try {
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
  } catch (error) {
    console.log("tytytyty", error);
  }
};

export const findAvailablePosition = async (playerList) => {
  return new Promise((resolve, reject) => {
    try {
      let i = 0;
      let isFound = false;
      while (i < 9 && !isFound) {
        let have = playerList.filter((el) => el.position === i);
        if (!have.length) {
          isFound = true;
          resolve(i);
        }
        i++;
      }
    } catch (error) {
      console.log("error", error);
    }
  });
};

export const startPreflopRound = async (data, socket, io) => {
  try {
    let room = await gameService.getGameById(data.tableId);
    // console.log({ room: JSON.stringify(room) })
    if (room && room.players.length === 1) {
      return socket.emit("OnlyOne", room);
    }
    if (room && !room.gamestart) {
      await roomModel.findOneAndUpdate(
        { _id: convertMongoId(data._id) },
        {
          pause: false,
        },
        { new: true }
      );
      await preflopround(room, io);
    }
  } catch (e) {
    console.log("error : ", e);
    socket.emit("actionError", "Action Error");
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
          "watchers.$.wallet": -amount,
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
              "bet.$.betAcceptBy": user,
              "bet.$.isAccepted": true,
            },
            { new: true }
          );
          if (update) socket.emit("betMatched");
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
          socket.emit("betCreated");
          io.in(_id.toString() + "watchers").emit("newBetPlaced", update);
          io.in(_id.toString()).emit("watcherbet", data);
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
        socket.emit("betCreated");
        io.in(_id.toString() + "watchers").emit("newBetPlaced", newbet);
        io.in(_id.toString()).emit("watcherbet", data);
      }
    } else {
      socket.emit("lowBalanceBet", {
        userid: user.userid,
      });
    }
  } catch (err) {
    console.log("Error in handleNewBet =>", err.message);
  }
};

export const acceptBet = async (data, socket, io) => {
  try {
    const { betAcceptBy, betId, tableId } = data;
    const bet = await BetModal.findOne({ bet: { $elemMatch: { _id: betId } } });

    const betmatch = bet.bet.find((ele) => ele._id.toString() === betId);
    if (betAcceptBy.userid === betmatch.betBy.userid) {
      return socket.emit("yourBetCard", "You cant bet on your bet card");
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
          "watchers.$.wallet": -betmatch.betAmount,
        },
      }
    );
    if (room) {
      const update = await BetModal.findOneAndUpdate(
        { bet: { $elemMatch: { _id: betId } } },
        {
          "bet.$.betAcceptBy": betAcceptBy,
          "bet.$.isAccepted": true,
        },
        { new: true }
      );
      if (update) {
        io.in(update._id.toString() + "watchers").emit("newBetPlaced", update);
      }
    } else {
      socket.emit("lowBalanceBet", {
        userid: betAcceptBy.userid,
      });
    }
  } catch (err) {
    console.log("Error in Accept Bet", err.message);
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
                action: "win-as-watcher",
                amount: item.betAmount,
                date: new Date(),
                isWatcher: true,
              });
              watchers[watcherBetAccetByIndex].hands.push({
                action: "lose-as-watcher",
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
                action: "lose-as-watcher",
                amount: item.betAmount,
                date: new Date(),
                isWatcher: true,
              });
              watchers[watcherBetAccetByIndex].hands.push({
                action: "win-as-watcher",
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
                action: "win-as-watcher",
                amount: item.betAmount,
                date: new Date(),
                isWatcher: true,
              });
              watchers[watcherBetAccetByIndex].hands.push({
                action: "lose-as-watcher",
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
                action: "lose-as-watcher",
                amount: item.betAmount,
                date: new Date(),
                isWatcher: true,
              });
              watchers[watcherBetAccetByIndex].hands.push({
                action: "win-as-watcher",
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
      io.in(room._id.toString() + "watchers").emit("watcherWinners", {
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
    console.log("Error in watcher winner Bet", err.message);
  }
};

export const findLoserAndWinner = async (room) => {
  try {
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
  } catch (error) {
    console.log("errorsass", error);
  }
};

export const finishedTableGame = async (io, room, userid) => {
  try {
    console.log("LEAVE API CALL 6885");
    const dd = await leaveApiCall(room, userid,io);
    const checkRoom = await roomModel.find({
      finish: false,
      public: true,
      gameMode: room?.gameMode,
    });
    console.log("checkRoom.length ===>", checkRoom.length);
    if (checkRoom && checkRoom.length > 2) {
      // if (dd || room.finish) await roomModel.deleteOne({ _id: room._id });
      if (dd || room.finish)
        await roomModel.updateOne({ _id: room._id }, { finish: true });
      //   const getAllRunningRoom = await roomModel
      //   .find({finish:false, public: true, gameType: "poker" })
      //   .populate("players.userid");
      // io.emit("AllTables", { tables: getAllRunningRoom });
    }
  } catch (err) {
    console.log("Error in finished game function =>", err.message);
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
        action: "buy-coins",
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
        { tableId, "watchers.userid": userId },
        {
          "watchers.$.wallet": wallet,
          "watchers.$.hands": hand,
        },
        {
          new: true,
        }
      );

      if (updateRoom) {
        io.in(_id.toString()).emit("CoinsAdded", {
          userId,
          name: updateRoom.watchers.find((ele) => ele.userid === userId).name,
          amt,
        });
      } else {
        socket.emit("addFail");
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
        io.in(_id.toString()).emit("CoinsAdded", {
          userId,
          name: updateRoom.players.find((ele) => ele.userid === userId).name,
          amt,
        });
      } else {
        socket.emit("addFail");
      }
    }
  } catch (err) {
    console.log("Error in addBuyIn =>", err.message);
    return true;
  }
};

export const leaveAndJoinWatcher = async (data, io, socket) => {
  try {
    await doLeaveTable(data, io, socket);
    await joinWatcherRequest(data, socket, io);
    socket.emit("joinAndLeave", {
      msg: "Success",
    });
  } catch (err) {
    console.log("Error in leaveJoinWatcher =>", err.message);
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
      const sendMessageToInvitedUsers = [
        ...newInvPlayers.map((el) => {
          return {
            sender: data.userId,
            receiver: el,
            message: `<a href='${process.env.CLIENTURL}/table?tableid=${data.tableId}&gamecollection=poker#/'>Click here</a> to play poker with me.`,
          };
        }),
      ];

      const sendNotificationToInvitedUsers = [
        ...newInvPlayers.map((el) => {
          return {
            sender: data.userId,
            receiver: el,
            message: `has invited you to play poker.`,
            url: `${process.env.CLIENTURL}/table?tableid=${data.tableId}&gamecollection=poker#/`,
          };
        }),
      ];

      await MessageModal.insertMany(sendMessageToInvitedUsers);
      await Notification.insertMany(sendNotificationToInvitedUsers);

      socket.emit("invitationSend", {
        room: updateRoom,
      });
      socket.emit("invitationSend");
    }
  } catch (err) {
    console.log("Error in InvitePlayer Function =>", err.message);
  }
};

export const doLeaveWatcher = async (data, io, socket) => {
  try {
    const { tableId, userId, gameType } = data;
    const room = await roomModel.findOne({ tableId });
    console.log("LEAVE API CALL 7046");
    const isCalled = await leaveApiCall(room, userId);
    if (isCalled) {
      const updatedRoom = await roomModel.findOneAndUpdate(
        { tableId, "watchers.userid": userId },
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
        io.in(_id.toString()).emit("updatePlayerList", updatedRoom);
        setTimeout(() => {
          socket.emit("reload");
        }, 30000);
      }
    }
  } catch (err) {
    console.log("Error in doLeaveWatcher =>", err.message);
  }
};

const createTransactionFromUsersArray = async (
  roomId,
  users = [],
  tournament
) => {
  try {
    console.log({ roomId, users: JSON.stringify(users) });
    console.log("users ===>", users);
    let transactionObjectsArray = [];
    const rankModelUpdate = [];
    let usersWalltAmt = [];
    let userTickets = [];
    let userGoldCoins = [];
    const room = await roomModel.findOne({ _id: roomId });
    tournament = room?.tournament;

    for await (const user of users) {
      const crrUser = await userModel.findOne({ _id: user.uid });
      usersWalltAmt.push(crrUser.wallet);
      userTickets.push(crrUser.ticket);
      userGoldCoins.push(crrUser.goldCoin);
    }

    console.log("users wallet amount ================>", usersWalltAmt);

    users.forEach(async (el, i) => {
      console.log("7013", JSON.stringify(el));
      let updatedAmount = el.coinsBeforeJoin; //el.wallet;
      console.log("Coinsbefore join ----->", el.coinsBeforeJoin);
      const userId = el.uid;

      let totalWinAmount = 0;
      let totalLossAmount = 0;
      let totalWin = 0;
      let totalLose = 0;
      let prevAmount = 0;
      let handsTransaction = [];
      if (!tournament) {
        handsTransaction = el.hands.map((elem) => {
          console.log({ elem });
          if (elem.action === "game-lose") {
            console.log("GAME LOSE");
            totalLossAmount += elem.amount;
            totalLose++;
          } else {
            console.log("GAME WIN");
            totalWinAmount += elem.amount;
            totalWin++;
          }
          const prvAmt = updatedAmount + usersWalltAmt[i];
          updatedAmount -= elem.amount;
          // Get each transaction last and update wallet amount

          const gameWinOrLoseamount =
            elem.action === "game-lose" ? -elem.amount : elem.amount;
          //const lastAmount = updatedAmount + usersWalltAmt[i];
          const prevTickets = userTickets[i];
          const crrTicket =
            userTickets[i] + (gameWinOrLoseamount > 0 ? elem.amount * 2 : 0);
          userTickets[i] = crrTicket;
          const prevGoldCoins = userGoldCoins[i] + updatedAmount;
          const crrGoldCoins =
            userGoldCoins[i] + (gameWinOrLoseamount > 0 ? elem.amount * 2 : 0);
          userGoldCoins[i] = crrGoldCoins;
          // updatedAmount = updatedAmount + gameWinOrLoseamount;
          console.log("updatedAmount",updatedAmount,"usersWalltAmt[i]==>",usersWalltAmt[i]);

          return {
            userId,
            roomId,
            amount:
              gameWinOrLoseamount >= 0
                ? gameWinOrLoseamount * 2
                : gameWinOrLoseamount,
            transactionDetails: {},
            prevWallet: prvAmt,
            updatedWallet:
              room?.gameMode !== "goldCoin"
                ? updatedAmount + usersWalltAmt[i] > 0
                  ? updatedAmount + usersWalltAmt[i]
                  : 0
                : prvAmt > 0
                ? prvAmt
                : 0,
            transactionType: "poker",
            prevTicket: prevTickets,
            updatedTicket:
              room?.gameMode !== "goldCoin"
                ? crrTicket > 0
                  ? crrTicket
                  : 0
                : prevTickets > 0
                ? prevTickets
                : 0,
            prevGoldCoin: prevGoldCoins,
            updatedGoldCoin:
              room?.gameMode !== "goldCoin"
                ? prevGoldCoins > 0
                  ? prevGoldCoins
                  : 0
                : crrGoldCoins > 0
                ? crrGoldCoins
                : 0,
          };
        });
      }

      console.log({ totalWin, totalLose, totalWinAmount, totalLossAmount });

      if (totalWin || totalLose || totalWinAmount || totalLossAmount) {
        rankModelUpdate.push(
          rankModel.updateOne(
            {
              userId: convertMongoId(userId),
              gameName: "poker",
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

      transactionObjectsArray = [
        ...transactionObjectsArray,
        ...handsTransaction,
      ];
      users[i].newBalance = updatedAmount;
    });

    return [transactionObjectsArray, rankModelUpdate];
  } catch (error) {
    console.log("rreeeemmm", error);
  }
};

export const leaveApiCall = async (room, userId,io) => {
  try {
    let player;
    console.log("leave api call", room.players.length);
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
      (!player?.find((el) =>
        el.id
          ? el.id.toString() === userId?.toString()
          : el.userid.toString() === userId?.toString()
      ) &&
        room.players.find((el) => el.userid.toString() === userId?.toString()))
    ) {
      player = room.players;
    }
    let url = "";
    if (!userId && room.handWinner.length === 0 && room.runninground === 0) {
      url = "https://leave-table-t3e66zpola-uc.a.run.app/all"; // for all user leave before any hands
    } else if (
      userId &&
      room.handWinner.length === 0 &&
      room.runninground === 0
    ) {
      url = "https://leave-table-t3e66zpola-uc.a.run.app/single"; // for one user leave before any hands
    } else if (userId && (room.runninground === 0 || room.runninground === 5)) {
      url = "https://leave-tab-v2-posthand-one-t3e66zpola-uc.a.run.app/"; // for one user leave after/before hand
    } else if (userId && room.runninground !== 0 && room.runninground !== 5) {
      url = "https://leave-tab-v2-inhand-one-t3e66zpola-uc.a.run.app/"; // for one user leave during hand
    } else {
      url = "https://leave-tab-v2-posthand-all-t3e66zpola-uc.a.run.app/"; // for all user leave after playing any hand
    }

    let allUsers = player.concat(room.watchers).concat(room.sitOut);

    // console.log({
    //   allUsers: JSON.stringify(allUsers),
    //   userId,
    //   runningRound: room.runninground,
    // })

    if (userId) {
      allUsers = allUsers.filter((ele) => {
        const elUserId = ele.id ? ele.id.toString() : ele.userid.toString();
        return elUserId === userId.toString();
      });
    }

    // console.log({ allUsers })
    let users = [];
    allUsers.forEach((item) => {
      // console.log({ item })
      let hands = item.hands ? [...item.hands] : [];
      let uid = item.id ? item.id : item.userid;
      // console.log({ uid })
      // console.log({ hands })
      // console.log({ runningRound: room.runninground })
      if (room.runninground !== 0 && room.runninground !== 5) {
        console.log("PUSHING HERE INTO ARRAY");
        hands.push({
          action: "game-lose",
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
        hands: hands,
        coinsBeforeJoin: item.initialCoinBeforeStart,
        gameLeaveAt: new Date(),
        wallet: item.wallet,
        gameJoinedAt: item.gameJoinedAt,
        isWatcher: room.watchers.find((ele) => ele.userid === uid)
          ? true
          : false,
      });
    });

    // console.log("USERS => 7301");

    let payload = {
      mode:
        room.runninground === 0 || room.runninground === 5
          ? "afterHand"
          : "duringHand",
      gameColl: room.gameType,
      _id: room._id,
      buyIn: room.gameType !== "poker-tournament" ? room.maxchips : 0,
      playerCount: player.length,
      users: users,
      adminUid: room.hostId,
    };

    console.log("Tournament rooom", room.tournament);
    let updateTournament = [];
    // let returnUser
    if (room.tournament) {
      updateTournament.push(
        tournamentModel.updateOne(
          {
            _id: room.tournament,
          },
          {
            $inc: {
              havePlayers: -1,
            },
          }
        )
      );
    }

    const [transactions, rankModelUpdate] =
      await createTransactionFromUsersArray(room._id, users, room.tournament);

    // console.log("users2====>", users);

    let tournament = null;
    if (room.tournament) {
      tournament = await tournamentModel
        .findOne({
          _id: room.tournament,
        })
        .populate("rooms");

      console.log("tournament data =====>", tournament);
    }

    console.log("users ======>", users);

    const userBalancePromise = users.map(async(el) => {
      if (!room.tournament) {
        let totalTicketWon = 0;
        // console.log("user hand ===>", el.hands);
        el.hands.forEach((hand) => {
          if (hand.action === "game-win") {
            totalTicketWon += hand.amount;
          }
        });

        // console.log("total tickets token", totalTicketWon);
        const newBalnce = el.newBalance > 0 ? el.newBalance : 0;
        let query;
        if (room.gameMode === "goldCoin") {
          query = { goldCoin: el.wallet };
        } else {
          query = {
            wallet: room.gameType !== "poker-tournament" ? newBalnce : 0,
            ticket: totalTicketWon * 2,
          };
        }
        return userModel.updateOne(
          {
            _id: convertMongoId(el.uid),
          },
          {
            $inc: query,
          }
        );
      } else {
        if (!tournament.isStart) {
          let updateData= await userModel.findOneAndUpdate(
            {
              _id: convertMongoId(el.uid),
            },
            {
              $inc: {
                wallet: tournament.tournamentFee,
              },
            },{new:true}
          )
          console.log();
          transactionModel.create({
            userId: userId,
            amount: parseFloat(tournament.tournamentFee),
            transactionDetails: {},
            prevWallet: parseFloat(updateData?.wallet),
            updatedWallet: updateData?.wallet,
            prevTicket: parseFloat(updateData?.ticket),
            updatedTicket: parseFloat(updateData?.ticket),
            prevGoldCoin: parseFloat(updateData?.goldCoin),
            updatedGoldCoin: parseFloat(updateData?.goldCoin),
            transactionType: "poker tournament",
          });
          try {
            
          
          return io.emit("leaveTournament", {
            message: "You leave the game.",
            code: 200,
            user: updateData || {},
          });   
          
      } catch (error) {
          console.log("error",error);  
      }       
    }}
    });

    // console.log("transactions ====>", transactions);

    const filterdHndWinnerData = room?.handWinner?.map((el) => {
      let filtrd = el.filter((obj) => obj.id.toString() !== userId.toString());
      return filtrd;
    });

    console.log("userId ======>", userId);
    if (userId) {
      const response = await Promise.allSettled([
        // Remove user from the room
        roomModel.updateOne(
          { _id: room._id, "players.userid": convertMongoId(userId) },
          {
            $pull: {
              players: { userid: userId },
            },
            handWinner: filterdHndWinnerData,
          }
        ),
        // Create transaction
        transactionModel.insertMany(transactions),
        // Update user wallet
        ...updateTournament,
        ...userBalancePromise,
        ...rankModelUpdate,
      ]);
      console.log(
        "FINAL RESPONSE:1"
        /* JSON.stringify(response.map((el) => el.value)), */
      );
    } else {
      const response = await Promise.allSettled([
        // Create transaction
        transactionModel.insertMany(transactions),
        // Update user wallet
        ...updateTournament,
        ...userBalancePromise,
        ...rankModelUpdate,
      ]);
      console.log(
        "FINAL RESPONSE:2"
        /* JSON.stringify(response.map((el) => el.value)), */
      );
    }

    return true;
  } catch (err) {
    console.log("Error in Leave APi call =>", err.message);
    return false;
  }
};

export const finishHandApiCall = async (room, userId) => {
  try {
    console.log("finish hand api call");
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
      console.log("playing user hands 7398==>");
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
      buyIn: room.gameType === "pokerTournament_Tables" ? room.maxchips : 0,
      playerCount: player.length,
      users: users,
      adminUid: room.hostId,
    };
    console.log("payload 7419=>");

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
    console.log("Players Line 7435=>");
    return true;
  } catch (err) {
    console.log("Error in finishHand APi call =>", err.message);
    return false;
  }
};

// NEW functions
export const checkForGameTable = async (data, socket, io) => {
  console.log("Check table socket trigger");
  try {
    const { gameId, userId, sitInAmount, gameMode } = data;
    let game = await gameService.getGameById(gameId);

    if (!game) {
      return socket.emit("tablenotFound", {
        message: "tablenotFound",
      });
    }

    const user = await userService.getUserById(userId);

    if (!user) {
      return socket.emit("notAuthorized", {
        message: "You are not authorized",
      });
    }

    // const limit = await checkLimits(userId, gameMode, sitInAmount, user);
    // console.log("limit ===>", limit);
    // if (!limit?.success) {
    //   return socket.emit("spendingLimitExceeds", {
    //     message: limit?.message,
    //   });
    // }

    if (game.players.length === 0) {
      game = await roomModel.findOneAndUpdate(
        {
          _id: gameId,
        },
        {
          finish: false,
          gamestart: false,
        },
        { new: true }
      );
    }

    if (game.finish) {
      return socket.emit("notFound", {
        message: "Game not found. Either game is finished or not exist",
      });
    }
    const { players } = game;
    if (players.find((el) => el.userid?.toString() === userId.toString())) {
      addUserInSocket(io, socket, gameId, userId);
      socket.join(gameId);
      const gameUpdatedData = await roomModel.findOneAndUpdate(
        {
          _id: convertMongoId(gameId),
          "players.userid": convertMongoId(userId),
        },
        {
          "players.$.playing": true,
        }
      );
      io.in(gameId).emit("updateGame", { game: gameUpdatedData });
      return;
    }
    if (game.players.length >= playerLimit) {
      return socket.emit("tablefull", { message: "This table is full." });
    }
    if (!sitInAmount) {
      return socket.emit("notInvitedPlayer", {
        message: "notInvited",
      });
    }

    console.log("USER WALLET ", user.wallet);

    const updatedRoom = await gameService.joinRoomByUserId(
      game,
      userId,
      sitInAmount,
      playerLimit
    );

    if (updatedRoom && Object.keys(updatedRoom).length > 0) {
      addUserInSocket(io, socket, gameId, userId);
      socket.join(gameId);
      let walletAmount;
      let query;
      if (gameMode === "goldCoin") {
        walletAmount = user.goldCoin - sitInAmount;
        query = { goldCoin: walletAmount };
      } else {
        walletAmount = user.wallet - sitInAmount;
        query = { wallet: walletAmount };
      }
      await userService.updateUserWallet(userId, query);
      io.in(gameId).emit("updateGame", { game: updatedRoom });
      if (updatedRoom?.players?.length === 2) {
        // setTimeout(() => {
        preflopround(updatedRoom, io);
        // }, 3000);
      }
      return;
    } else {
      socket.emit("tablefull", { message: "This table is full." });
    }
  } catch (error) {
    console.log("Error in check for table =>", error);
    socket.emit("socketError", error.message);
  }
};

export const checkLimits = async (userId, gameMode, sitInAmount, user) => {
  try {
    let crrDate = new Date();
    crrDate.setHours(0);
    crrDate.setMinutes(0);
    crrDate.setMilliseconds(0);
    crrDate = crrDate.toDateString();

    const todayTransactions = await transactionModel.find({
      $and: [
        { userId: userId },
        { createdAt: { $gte: crrDate } },
        { amount: { $lt: 0 } },
      ],
    });
    console.log("todayTransactions =====>", gameMode, todayTransactions);
    if (todayTransactions.length) {
      let spndedToday = 0;
      if (todayTransactions.length === 1) {
        spndedToday =
          gameMode === "goldCoin"
            ? todayTransactions[0].prevGoldCoin -
              todayTransactions[0].updatedGoldCoin
            : todayTransactions[0].prevWallet -
              todayTransactions[0].updatedWallet;
      } else {
        // spndedToday =
        //   gameMode === "goldCoin"
        //     ? todayTransactions[0].updatedGoldCoin -
        //       todayTransactions[todayTransactions.length - 1].updatedGoldCoin
        //     : todayTransactions[0].updatedWallet -
        //       todayTransactions[todayTransactions.length - 1].updatedWallet;
        if (gameMode === "goldCoin") {
          todayTransactions
            .filter((obj) => obj.updatedGoldCoin !== obj.prevGoldCoin)
            .forEach((obj) => {
              spndedToday +=
                parseFloat(obj.prevGoldCoin) - parseFloat(obj.updatedGoldCoin);
            });
        } else {
          todayTransactions
            .filter((obj) => obj.prevWallet !== obj.updatedWallet)
            .forEach((obj) => {
              spndedToday +=
                parseFloat(obj.prevWallet) - parseFloat(obj.updatedWallet);
            });
        }
      }
      // console.log(
      //   "spndedToday =====>",
      //   spndedToday + sitInAmount,
      //   user.dailyGoldCoinSpendingLimit
      // );
      if (
        gameMode === "goldCoin" &&
        spndedToday + sitInAmount > user.dailyGoldCoinSpendingLimit
      ) {
        return {
          success: false,
          message: "Your daily spending limit for goldcoins has been exhausted",
        };
      } else if (
        gameMode === "token" &&
        spndedToday + sitInAmount > user.dailyTokenSpendingLimit
      ) {
        return {
          success: false,
          message: "Your daily spending limit for tokens has been exhausted",
        };
      }
    } else {
      console.log(
        "spndedMonthly =====>",
        sitInAmount,
        user.monthlyGoldCoinSpendingLimit
      );
      if (
        gameMode === "goldCoin" &&
        sitInAmount > user.dailyGoldCoinSpendingLimit
      ) {
        return {
          success: false,
          message: "Your sitin amount is exceeding your daily spending limit",
        };
      } else if (
        gameMode === "token" &&
        sitInAmount > user.dailyTokenSpendingLimit
      ) {
        return {
          success: false,
          message: "Your sitin amount is exceeding your daily spending limit",
        };
      }
    }

    let weeklyStartDate = getLastSunday().toDateString();

    const weeklyTransactions = await transactionModel.find({
      $and: [
        { userId: userId },
        { createdAt: { $gte: weeklyStartDate } },
        { amount: { $lt: 0 } },
      ],
    });

    if (weeklyTransactions.length) {
      let spndedWeekly = 0;
      if (weeklyTransactions.length === 1) {
        spndedWeekly =
          gameMode === "goldCoin"
            ? weeklyTransactions[0].prevGoldCoin -
              weeklyTransactions[0].updatedGoldCoin
            : weeklyTransactions[0].prevWallet -
              weeklyTransactions[0].updatedWallet;
      } else {
        if (gameMode === "goldCoin") {
          weeklyTransactions
            .filter((obj) => obj.updatedGoldCoin !== obj.prevGoldCoin)
            .forEach((obj) => {
              spndedWeekly +=
                parseFloat(obj.prevGoldCoin) - parseFloat(obj.updatedGoldCoin);
            });
        } else {
          weeklyTransactions
            .filter((obj) => obj.prevWallet !== obj.updatedWallet)
            .forEach((obj) => {
              spndedWeekly +=
                parseFloat(obj.prevWallet) - parseFloat(obj.updatedWallet);
            });
        }
      }
      if (
        gameMode === "goldCoin" &&
        spndedWeekly + sitInAmount > user.weeklyGoldCoinSpendingLimit
      ) {
        return {
          success: false,
          message:
            "Your weekly spending limit for goldcoins has been exhausted",
        };
      } else if (
        gameMode === "token" &&
        spndedWeekly + sitInAmount > user.weeklyTokenSpendingLimit
      ) {
        return {
          success: false,
          message: "Your weekly spending limit for tokens has been exhausted",
        };
      }
    } else {
      if (
        gameMode === "goldCoin" &&
        sitInAmount > user.weeklyGoldCoinSpendingLimit
      ) {
        return {
          success: false,
          message: "Your sitin amount is exceeding your weekly spending limit",
        };
      } else if (
        gameMode === "token" &&
        sitInAmount > user.weeklyTokenSpendingLimit
      ) {
        return {
          success: false,
          message: "Your sitin amount is exceeding your weekly spending limit",
        };
      }
    }

    crrDate = new Date();
    crrDate.setDate(1);
    crrDate.setHours(0);
    crrDate.setMinutes(0);
    crrDate.setMilliseconds(0);

    let monthStartDate = crrDate.toDateString();

    const monthlyTransactions = await transactionModel.find({
      $and: [
        { userId: userId },
        { createdAt: { $gte: monthStartDate } },
        { amount: { $lt: 0 } },
      ],
    });

    if (monthlyTransactions.length) {
      let spndedMonthly = 0;
      if (monthlyTransactions.length === 1) {
        spndedMonthly =
          gameMode === "goldCoin"
            ? monthlyTransactions[0].prevGoldCoin -
              monthlyTransactions[0].updatedGoldCoin
            : monthlyTransactions[0].prevWallet -
              monthlyTransactions[0].updatedWallet;
      } else {
        if (gameMode === "goldCoin") {
          monthlyTransactions
            .filter((obj) => obj.updatedGoldCoin !== obj.prevGoldCoin)
            .forEach((obj) => {
              spndedMonthly +=
                parseFloat(obj.prevGoldCoin) - parseFloat(obj.updatedGoldCoin);
            });
        } else {
          spndedMonthly = monthlyTransactions
            .filter((obj) => obj.prevWallet !== obj.updatedWallet)
            .forEach((obj) => {
              spndedMonthly +=
                parseFloat(obj.prevWallet) - parseFloat(obj.updatedWallet);
            });
        }
      }

      console.log(
        "spndedMonthly =====>",
        spndedMonthly + sitInAmount,
        user.monthlyGoldCoinSpendingLimit
      );
      if (
        gameMode === "goldCoin" &&
        spndedMonthly + sitInAmount >= user.monthlyGoldCoinSpendingLimit
      ) {
        return {
          success: false,
          message:
            "Your monthly spending limit for goldcoins has been exhausted",
        };
      } else if (
        gameMode === "token" &&
        spndedMonthly + sitInAmount > user.monthlyTokenSpendingLimit
      ) {
        return {
          success: false,
          message: "Your weekly spending limit for tokens has been exhausted",
        };
      }
    } else {
      if (
        gameMode === "goldCoin" &&
        sitInAmount > user.monthlyGoldCoinSpendingLimit
      ) {
        return {
          success: false,
          message: "Your sitin amount is exceeding your weekly spending limit",
        };
      } else if (
        gameMode === "token" &&
        sitInAmount > user.monthlyTokenSpendingLimit
      ) {
        return {
          success: false,
          message: "Your sitin amount is exceeding your weekly spending limit",
        };
      }
    }

    return {
      success: true,
    };
  } catch (error) {
    console.log("error in checklimits ===>", error);
    return {
      success: true,
    };
  }
};

function getLastSunday() {
  var dt = new Date();
  dt.setDate(dt.getDate() - dt.getDay());
  dt.setHours(0);
  dt.setMinutes(0);
  dt.setMilliseconds(0);
  return dt;
}

export const checkAlreadyInGame = async (data, socket, io) => {
  try {
    const { userId, tableId, gameMode } = data;
    const checkIfInOtherGame = await gameService.checkIfUserInGame(
      userId,
      tableId,
      gameMode
    );
    if (checkIfInOtherGame) {
      console.log("User in the other table");
      return socket.emit("userAlreadyInGame", {
        message: "You are also on other table.",
        join: false,
      });
    } else {
      return socket.emit("userAlreadyInGame", {
        message: "You can join this game.",
        join: true,
      });
    }
  } catch (err) {
    console.log("error in check aleady in game function", err);
  }
};

// playerTentativeAction
export const playerTentativeAction = async (data, socket, io) => {
  try {
    const { userId, gameId, playerAction } = data;
    const game = await gameService.getGameById(gameId);
    if (game) {
      await gameService.playerTentativeActionSelection(
        game,
        userId,
        playerAction
      );
      let updatedGame;
      setTimeout(async () => {
        updatedGame = await gameService.getGameById(gameId);
        io.in(gameId).emit("updateGame", { game: updatedGame });
      }, 500);
      //  = await gameService.getGameById(gameId);
      // console.log("updatedGameupdatedGame", updatedGame);
    } else {
      socket.emit("actionError", { msg: "No game found" });
    }
  } catch (error) {
    console.log("Error in playerTentativeAction", error);
  }
};

export const UpdateRoomChat = async (data, socket, io) => {
  try {
    const { tableId, message, userId } = data;
    let room = await roomModel.find({ _id: tableId });
    if (room) {
      const user = await userModel.findOne({ _id: userId });

      const { firstName, lastName, profile } = user || {};
      await roomModel.findOneAndUpdate(
        { _id: tableId },
        {
          $push: {
            chats: {
              message: message,
              userId: userId,
              firstName: firstName,
              lastName: lastName,
              profile,
              date: new Date().toLocaleTimeString(),
              seenBy: [],
            },
          },
        }
      );
      let room = await roomModel.findOne({ _id: tableId });

      io.in(tableId).emit("updateChat", { chat: room?.chats });
    } else {
      io.in(tableId).emit("updateChat", { chat: [] });
    }

    console.log("room : ----- >");
  } catch (error) {
    console.log("Error in updateRoomChat", error);
  }
};

export const updateSeenBy = async (data, socket, io) => {
  try {
    const { userId, tableId } = data;
    let room = await roomModel.findOne({ _id: tableId });
    let filterdChats = room.chats.map((chat) => {
      if (chat.userId !== userId && chat.seenBy.indexOf(userId) < 0) {
        chat.seenBy.push(userId);
      }
      return chat;
    });
    // console.log(filterdChats);
    await roomModel.updateOne(
      { _id: tableId },
      { $set: { chats: filterdChats } }
    );
  } catch (err) {
    console.log("error in updateChatIsRead", err);
  }
};

export const emitTyping = async (data, socket, io) => {
  try {
    const { tableId, userId, typing } = data;
    const user = await userModel.findOne({ _id: userId }, { username: 1 });
    io.in(tableId).emit("typingOnChat", {
      crrTypingUserId: userId,
      typing,
      userName: user.username,
    });
  } catch (err) {
    console.log("error in emit typing", err);
  }
};

export const JoinTournament = async (data, io, socket) => {
  try {
    const { userId, tournamentId, fees } = data;
    console.log("Join user id", userId);
    const tournament = await tournamentModel
      .findOne({
        _id: tournamentId,
      })
      .populate("rooms");

    if (!tournament) {
      socket.emit("NoTournamentFound", {
        message: "No tournament found",
      });
    }

    const { rooms = [], isStart, isFinished } = tournament;

    if (isStart) {
      return socket.emit("tournamentAlreadyStarted", {
        message: "Tournament Has been already started",
        code: 400,
      });
    }

    if (isFinished) {
      return socket.emit("tournamentAlreadyFinished", {
        message: "Tournament Has been finished",
        code: 400,
      });
    }

    if (
      rooms.find((room) =>
        room.players.find(
          (pl) =>
            pl.userid.toString() === userId.toString() ||
            pl.id.toString() === userId.toString()
        )
          ? true
          : false
      )
    ) {
      return socket.emit("alreadyInTournament", {
        message: "You are already in game.",
        code: 400,
      });
    }

    if (tournament.havePlayers >= 10000) {
      return socket.emit("tournamentSlotFull", {
        message: "No empty slot",
      });
    }

    let roomWithSpace = rooms.find((room) => room.players.length < playerLimit);
    const userData = await User.findById(userId).lean();
    if (userData?.wallet < fees) {
      return socket.emit("notEnoughAmount", {
        message: "You do not have enough ST to join",
        code: 400,
      });
    }
    await pushPlayerInRoom(
      tournament,
      userData,
      tournamentId,
      roomWithSpace,
      socket,
      io
    );
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId },
      { $inc: { wallet: -parseFloat(fees) } },
      { new: true }
    );
    await transactionModel.create({
      userId: userId,
      amount: -parseFloat(fees),
      transactionDetails: {},
      prevWallet: parseFloat(userData?.wallet),
      updatedWallet: updatedUser?.wallet,
      prevTicket: parseFloat(userData?.ticket),
      updatedTicket: parseFloat(userData?.ticket),
      prevGoldCoin: parseFloat(userData?.goldCoin),
      updatedGoldCoin: parseFloat(userData?.goldCoin),
      transactionType: "poker tournament",
    });
    return socket.emit("alreadyInTournament", {
      message: "You joined in game.",
      code: 200,
      user: updatedUser || {},
    });
  } catch (error) {
    console.log("Error on line 7658", error);
  }
};

const pushPlayerInRoom = async (
  checkTournament,
  userData,
  tournamentId,
  room,
  socket,
  io
) => {
  try {
    const { username, _id, avatar, profile } = userData;
    const { rooms = [] } = checkTournament;
    let roomId;
    console.log("room ==>", room);
    if (room) {
      roomId = room._id;
      let players = room.players;
      let leaveReq = room.leavereq;

      leaveReq = leaveReq.filter((uid) => _id.toString() !== uid.toString());
      console.log("leaveReq ==>", leaveReq);
      let position = await findAvailablePosition(players);
      players.push({
        name: username,
        userid: _id,
        id: _id,
        photoURI: avatar ? avatar : profile ? profile : img,
        wallet: parseFloat(checkTournament.buyIn),
        position,
        missedSmallBlind: false,
        missedBigBlind: false,
        forceBigBlind: false,
        playing: true,
        stats: {},
        initialCoinBeforeStart: parseFloat(checkTournament.buyIn),
        gameJoinedAt: new Date(),
        hands: [],
      });

      const payload = {
        players: players,
        tournament: tournamentId,
        leavereq: leaveReq,
      };

      await roomModel.updateOne({ _id: roomId }, payload);
      const tournament = await tournamentModel.findOneAndUpdate(
        { _id: tournamentId },
        {
          $inc: {
            havePlayers: 1,
            totalJoinPlayer: 1,
            prizePool: checkTournament?.tournamentFee,
          },
        },

        { new: true }
      );
      console.log("rooms ==>", tournament?.havePlayers, playerLimit);
      if (
        tournament?.tournamentType === "sit&go" &&
        tournament?.havePlayers === playerLimit &&
        rooms.find((room) => room.players.length === playerLimit)
      ) {
        await tournamentModel.updateOne(
          { _id: tournamentId },
          { isStart: true }
        );
        console.log("Tournament started");
        blindTimer(checkTournament, io);
        let timer = 10;
        io.emit("tournamentStart", { rooms });
        const interval = setInterval(() => {
          if (timer < 0) {
            clearInterval(interval);
            preflopround(
              rooms.find((room) => room.players.length === playerLimit),
              io
            );
          } else {
            io.in(roomId.toString()).emit("tournamentStarted", { time: timer });
            timer -= 1;
          }
        }, 1000);

        return;
      }
    } else {
      let smallBlind = checkTournament?.levels?.smallBlind?.amount;
      let bigBlind = checkTournament?.levels?.bigBlind?.amount;
      const payload = {
        players: [
          {
            name: username,
            userid: _id,
            id: _id,
            photoURI: avatar ? avatar : profile ? profile : img,
            wallet: parseFloat(checkTournament.buyIn),
            position: 0,
            missedSmallBlind: false,
            missedBigBlind: false,
            forceBigBlind: false,
            playing: true,
            initialCoinBeforeStart: parseFloat(checkTournament.buyIn),
            gameJoinedAt: new Date(),
            hands: [],
          },
        ],
        tournament: tournamentId,
        autoNextHand: true,
        smallBlind: smallBlind || 100,
        bigBlind: bigBlind || 200,
        gameType: "poker-tournament",
      };

      const roomData = new roomModel(payload);
      const savedroom = await roomData.save();
      roomId = savedroom._id;

      await tournamentModel.findOneAndUpdate(
        { _id: tournamentId },
        {
          $inc: {
            havePlayers: 1,
            totalJoinPlayer: 1,
            prizePool: checkTournament?.tournamentFee,
          },
          $push: { rooms: roomId },
        },
        { upsert: true, new: true }
      );
    }
    const getAllTournament = await tournamentModel.find({}).populate("rooms");
    io.emit("updatePlayerList", getAllTournament);
  } catch (error) {
    console.log("error in push player in room function =>", error);
  }
};

export const activateTournament = async (io) => {
  try {
    const date = new Date().toISOString().split("T")[0];
    const time = `${new Date().getUTCHours()}:${new Date().getUTCMinutes()}:00`;
    const checkTournament = await tournamentModel
      .findOne({
        startDate: date,
        startTime: time,
        tournamentType: { $ne: "sit&go" },
      })
      .populate("rooms")
      .lean();
    if (checkTournament) {
      //preflopround()
      if (checkTournament?.isStart) {
        return;
      }
      if (checkTournament?.rooms?.length > 0 && !checkTournament?.isStart) {
        await tournamentModel.updateOne(
          { _id: checkTournament?._id },
          { isStart: true }
        );
        console.log("Tournament started");
        blindTimer(checkTournament, io);
        for (let room of checkTournament?.rooms) {
          preflopround(room, io);
        }
      }
    }
  } catch (error) {
    console.log("activateTournament", error);
  }
};

export const blindTimer = async (data, io) => {
  try {
    const {
      rooms,
      incBlindTime,
      levels: {
        smallBlind: { amount: smAmount },
      },
      _id,
      isFinished,
    } = data;
    console.log("blind Timer called", incBlindTime, isFinished);
    if (rooms && rooms.length && incBlindTime && !isFinished) {
      let getMinute = incBlindTime * 60;
      const interval = setInterval(async () => {
        if (getMinute > 0) {
          // emit timer
          const mm =
            getMinute / 60 < 10
              ? `0${parseInt(getMinute / 60, 10)}`
              : `${parseInt(getMinute / 60, 10)}`;
          const ss =
            getMinute % 60 < 10
              ? `0${parseInt(getMinute % 60, 10)}`
              : `${parseInt(getMinute % 60, 10)}`;
          const time = `${mm}:${ss}`;
          rooms.forEach((room) => {
            io.in(room._id.toString()).emit("blindTimer", {
              time,
            });
          });

          getMinute -= 1;
        } else {
          clearInterval(interval);
          getMinute = incBlindTime * 60;
          // find all room of tournamet
          let bliend = {
            levels: {
              smallBlind: { amount: smAmount * 2 },
              bigBlind: { amount: smAmount * 2 * 2 },
            },
          };
          await tournamentModel.updateOne({ _id }, bliend);
          const t = await tournamentModel
            .findOne({ _id })
            .populate("rooms")
            .lean();
          return blindTimer(t, io);
        }
      }, 1000);
    }
    return;
  } catch (error) {
    console.log("error in blindTimer", error);
  }
};
export const doCalculateCardPair = async (data, io, socket) => {
  let p = [];
  if (data?.roundData && data?.roundData?.length > 0) {
    data.roundData.forEach((el) => {
      if (!el.fold) {
        let cards = data.communityCard;
        let allCards = cards.concat(el.cards);
        allCards = allCards.map((card) => decryptCard(card));
        let hand = Hand.solve(allCards);
        p.push({ id: el.id, position: el.position, hand: hand });
      }
    });
    io.in(data.roomId.toString()).emit("showPairCard", {
      hands: p,
    });
  }
};
