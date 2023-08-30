import jwt from "jsonwebtoken";
import transactionModel from "../models/transaction";
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
import { getCachedGame, setCachedGame, deleteCachedGame } from "../redis-cache";
import Queue from "better-queue";
const gameState = {
  0: "players",
  1: "preflopround",
  2: "flopround",
  3: "turnround",
  4: "riverround",
  5: "showdown",
};

const rearrangeQueue = new Queue(async function (task, cb) {
  const { roomData, io, tournament, roomId } = task;
  await elemination(roomData, io);
  await reArrangeTables(tournament, io, roomId);
  cb(null, 1);
});

let gameRestartSeconds = 3000;
const playerLimit = 4;
const convertMongoId = (id) => mongoose.Types.ObjectId(id);
const img =
  "https://i.pinimg.com/736x/06/d0/00/06d00052a36c6788ba5f9eeacb2c37c3.jpg";

const addUserInSocket = (io, socket, gameId, userId) => {
  try {
    let lastSocketData = io.room || [];
    lastSocketData.push({ gameId, pretimer: false, room: gameId.toString() });
    io.room = [
      ...new Set(lastSocketData.map((ele) => ele.room.toString())),
    ].map((el) => ({
      room: el,
      pretimer: false,
      preflop: el.preflop || false,
      flop: el.flop || false,
      turn: el.turn || false,
      river: el.river || false,
    }));
    lastSocketData = io.users;
    lastSocketData.push(userId.toString());
    io.users = [...new Set(lastSocketData)];
    socket.customId = userId.toString();
    socket.customRoom = gameId.toString();
    socket.join(gameId);
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

//verify jwt token
export const verifyJwt = (token) => {
  return new Promise(async (resolve, reject) => {
    try {
      const isTokenValid = jwt.verify(token, process.env.JWT_SECRET);
      if (isTokenValid) {
        resolve(isTokenValid);
      }
    } catch (e) {
      console.log("ererer", e);
      reject(false);
    }
  });
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
    console.log("error in verify cards", error);
  }
};
export const getSidePOt = async (roomId) => {
  let updatedRoomData = await getCachedGame(roomId);
  let sidePot = updatedRoomData.sidePots;
  let state = gameState[updatedRoomData.runninground];
  let playerData = updatedRoomData[state];
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
        // playerData[playersOfPot[0]].wallet += sidePotValue;
        playerData.filter((el) => playersOfPot[0] === el.position)[0].wallet +=
          sidePotValue;
      } else {
        sidePot.push({ pot: sidePotValue, players: playersOfPot });
      }
      otherPlayer = roundData1.filter((el) => el.prevPot > 0);
      if (otherPlayer.length) {
        z(otherPlayer);
      }
    };
    z(roundData);
    sidePot = sidePot.filter((el) => el.pot > 0 && el.players.length > 0);
    if (sidePot.length >= 2) {
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
    updatedRoomData.sidePots = sidePot;
    updatedRoomData[state] = playerData;
    updatedRoomData.pot = 0;
  } else if (updatedRoomData.allinPlayers.length && sidePot.length) {
    playerData.forEach((el) => {
      sidePot[sidePot.length - 1].pot += el.prevPot;
      el.prevPot = 0;
    });
    updatedRoomData.sidePots = sidePot;
    updatedRoomData[state] = playerData;
    updatedRoomData.pot = 0;
  }
  await setCachedGame({
    ...updatedRoomData,
    tournament: updatedRoomData.tournament,
  });
};

export const preflopPlayerPush = async (players, room) => {
  try {
    const roomData = room;
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
          away: player.away,
          autoFoldCount: player.autoFoldCount,
        });
      }
    });

    roomData.preflopround = newP;
    await setCachedGame({ ...roomData, tournament: roomData.tournament });
  } catch (error) {
    console.log("error in preflopplayer push function =>", error);
  }
};

export const preflopround = async (room, io) => {
  try {
    if (!room) {
      return;
    }

    if (
      io.room.find((el) => el.room.toString() === room._id.toString())?.preflop
    ) {
      console.log("preflop round already executed");
      return;
    }
    console.log(
      "preflop round before update room for new hand tourrnament value",
      room._id
    );

    await updateRoomForNewHand(room._id, io);

    room = await getCachedGame(room._id);

    // console.log("preflop round after update room for new hand", room);
    // console.log("io", io);
    // console.log("afetr update roomfor new hand", room.players);

    let playingPlayer = room?.players?.filter(
      (el) => el.playing && el.wallet > 0
    );
    if (!room.finish) {
      if (room.runninground === 0) {
        if (playingPlayer.length > 1) {
          room = {
            ...room,
            runninground: 1,
            gamestart: true,
            isGameRunning: true,
            pause: false,
          };

          await preflopPlayerPush(room.players, room);

          let room1111 = await getCachedGame(room._id);

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
          let maxPosition = 0;
          room1111.preflopround.forEach((el) => {
            if (el.position > maxPosition) maxPosition = el.position;
          });

          let totalplayer = maxPosition + 1 + room1111.eleminated.length;

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

            if (d <= totalplayer - 1) {
              d += 1;
            } else {
              d = 0;
            }
            // console.log("position in check is playing ==>", d);
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
          console.log("blind positions", {
            smallBlindPosition,
            bigBlindPosition,
          });

          const deductSmallBlind = async () => {
            const playerAvilable = room1111.players.filter(
              (el) =>
                el.position === smallBlindPosition &&
                el.playing &&
                el.wallet > 0
            );
            if (playerAvilable.length) {
              if (playerAvilable[0].wallet > smallBlindAmt) {
                room1111.preflopround.forEach((pl) => {
                  if (pl.position === smallBlindPosition) {
                    pl.wallet -= smallBlindAmt;
                    pl.pot += smallBlindAmt;
                    pl.missedSmallBlind = false;
                    pl.missedBigBlind = false;
                    pl.forceBigBlind = false;
                  }
                });
                room1111.smallBlind = smallBlindAmt;
                room1111.smallBlindPosition = smallBlindPosition;
                room1111.dealerPosition = dealerPosition;
              } else {
                allinPlayer.push({
                  id: playerAvilable[0].id,
                  amt: playerAvilable[0].wallet,
                  wallet: playerAvilable[0].wallet,
                  round: 1,
                });
                room1111.preflopround.forEach((pl) => {
                  if (pl.position === smallBlindPosition) {
                    pl.pot += pl.wallet;
                    pl.wallet = 0;
                    pl.action = true;
                    pl.actionType = "all-in";
                    pl.missedSmallBlind = false;
                    pl.missedBigBlind = false;
                    pl.forceBigBlind = false;
                  }
                });
                room1111.smallBlind = smallBlindAmt;
                room1111.lastAction = "all-in";
                room1111.allinPlayers = allinPlayer;
                room1111.smallBlindPosition = smallBlindPosition;
                room1111.dealerPosition = dealerPosition;
              }

              smallBlindDeducted = 1;
            } else {
              const isPlayerSitOut = room1111.preflopround.filter(
                (el) => el.position === smallBlindPosition && !el.playing
              );
              if (isPlayerSitOut.length) {
                room1111.preflopround.forEach((pl) => {
                  if (pl.position === smallBlindPosition) {
                    missedSmallBlind = true;
                  }
                });
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
                room1111.preflopround.forEach((pl) => {
                  if (pl.position === bigBlindPosition) {
                    pl.wallet -= bigBlindAmt;
                    pl.pot += bigBlindAmt;
                    pl.missedSmallBlind = false;
                    pl.missedBigBlind = false;
                    pl.forceBigBlind = false;
                  }
                });
                room1111.bigBlind = bigBlindAmt;
                room1111.bigBlindPosition = bigBlindPosition;
                room1111.raiseAmount = bigBlindAmt;
              } else {
                allinPlayer.push({
                  id: playerAvilable[0].id,
                  amt: playerAvilable[0].wallet,
                  wallet: playerAvilable[0].wallet,
                  round: 1,
                });
                room1111.preflopround.forEach((pl) => {
                  if (pl.position === bigBlindPosition) {
                    pl.pot += pl.wallet;
                    pl.wallet = 0;
                    pl.action = true;
                    pl.actionType = "all-in";
                    pl.missedSmallBlind = false;
                    pl.missedBigBlind = false;
                    pl.forceBigBlind = false;
                  }
                });
                room1111.bigBlind = bigBlindAmt;
                room1111.lastAction = "all-in";
                room1111.allinPlayers = allinPlayer;
                room1111.bigBlindPosition = bigBlindPosition;
                room1111.raiseAmount = bigBlindAmt;
              }
              bigBlindDeducted = 1;
            } else {
              const isPlayerSitOut = room1111.preflopround.filter(
                (el) => el.position === bigBlindPosition && !el.playing
              );
              if (isPlayerSitOut.length) {
                room1111.preflopround.forEach((pl) => {
                  if (pl.position === bigBlindPosition) {
                    missedBigBlind = true;
                  }
                });
              }
              if (bigLoopTime < totalplayer - 1) {
                if (bigBlindPosition < totalplayer - 1) {
                  bigBlindPosition += 1;
                } else if (bigBlindPosition === totalplayer - 1) {
                  bigBlindPosition = 0;
                }
                bigLoopTime += 1;
              } else {
                room1111.preflopround.forEach((pl) => {
                  if (pl.position === smallBlindPosition) {
                    missedBigBlind = true;
                  }
                });
                room1111.preflopround.forEach((pl) => {
                  if (pl.position === smallBlindPosition) {
                    pl.missedBigBlind = true;
                    pl.wallet += smallBlindAmt;
                  }
                });

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
          await setCachedGame({ ...room1111, tournament: room1111.tournament });
          if (!io.room.find((el) => el.room === room._id.toString())?.preflop) {
            console.log("game turn timer for room", room1111._id);
            gameTurnTimer(room._id, io);
            let updatedRoom = await getCachedGame(room._id);
            io.in(room._id.toString()).emit("preflopround", updatedRoom);
            return;
          }
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

export const gameTurnTimer = async (roomid, io) => {
  try {
    const roomData = await getCachedGame(roomid);
    console.log("");
    let state = gameState[roomData.runninground];
    console.log("game round", state);
    io.room = io.room.map((el) => {
      if (el.room.toString() === roomid.toString()) {
        return {
          ...el,
          preflop: state === "preflopround" ? true : el.preflop,
          flop: state === "flopround" ? true : el.flop,
          turn: state === "turnround" ? true : el.turn,
          river: state === "riverround" ? true : el.river,
        };
      }
      return el;
    });

    let totalPlayer = 0;

    roomData[state].forEach((el) => {
      if (el.position > totalPlayer) {
        totalPlayer = el.position;
      }
    });

    totalPlayer++;

    // console.log("totalPlayer =======>", totalPlayer);

    const timer = async (i, maxPosition) => {
      let j = roomData.timer;
      let t = "timer";
      let tx = roomData.timer;
      const udata = await getCachedGame(roomid);
      if (udata.runninground === 5) {
        return;
      }
      if (i < maxPosition) {
        const cPlayer = udata[gameState[udata.runninground]].filter(
          (el) => el.position === i
        );
        let cp = null;
        if (cPlayer.length) {
          if (
            cPlayer[0].wallet <= 0 ||
            cPlayer[0].fold ||
            !cPlayer[0].playing ||
            (cPlayer[0].pot >= udata.raiseAmount && cPlayer[0].action) ||
            (cPlayer[0].actionType === "check" && udata.lastAction === "check")
          ) {
            i += 1;
            return timer(i, maxPosition);
          }
          cp = cPlayer[0].userid || cPlayer[0].id;
        } else {
          i += 1;
          return timer(i, maxPosition);
        }

        if (cPlayer.length) {
          udata[gameState[udata.runninground]].forEach((pl) => {
            if (pl.position === i) {
              pl.action = false;
            }
          });
          udata.timerPlayer = cp;
          await setCachedGame({ ...udata, tournamentData: udata.tournament });

          let playerinterval = setInterval(async () => {
            const data = await getCachedGame(roomid);

            let intervalPlayer = data[gameState[data.runninground]].filter(
              (e) => e.position === i
            );
            if (j <= 0) {
              clearInterval(playerinterval);
              if (
                (data.raiseAmount === intervalPlayer[0]?.pot ||
                  data.lastAction === "check") &&
                data.players.length !== 1
              ) {
                await doCheck(data, intervalPlayer[0]?.id, io);
                // console.log("auto do Check completed");
                timer(++i, maxPosition);
              } else {
                let isContinue = false;
                if (intervalPlayer[0]) {
                  if (intervalPlayer[0].autoFoldCount === 1) {
                    data[gameState[data.runninground]].forEach((pl) => {
                      if (pl.id === intervalPlayer[0]?.id) {
                        pl.away = true;
                        pl.autoFoldCount = 0;
                      }
                    });
                  } else {
                    data[gameState[data.runninground]].forEach((pl) => {
                      if (pl.id === intervalPlayer[0]?.id) {
                        pl.autoFoldCount = 1;
                      }
                    });
                  }
                  await setCachedGame({ ...data, tournament: data.tournament });
                  isContinue = await doFold(data, intervalPlayer[0]?.id, io);
                  console.log("automatic do Fold completed", data._id);
                  io.in(data?._id?.toString()).emit("automaticFold", {
                    msg: `${intervalPlayer[0]?.name} has automatically folded`,
                  });
                  await doSitOut(data, io);
                }
                if (isContinue) {
                  timer(++i, maxPosition);
                }
              }
            } else if (
              data.showdown.length ||
              (intervalPlayer &&
                (intervalPlayer[0]?.fold ||
                  intervalPlayer[0]?.action ||
                  intervalPlayer[0]?.wallet === 0 ||
                  !intervalPlayer[0]?.playing))
            ) {
              clearInterval(playerinterval);
              if (data.runninground === 5 || data.showdown.length) {
                console.log("game time stopped");
                return;
              }
              timer(++i, maxPosition);
            } else {
              j--;
              if (intervalPlayer[0]?.away) {
                j = 0;
              }
              io.in(udata?._id?.toString()).emit("timer", {
                id: intervalPlayer[0]?.id,
                playerchance: j,
                timerPlayer: i,
                runninground: 1,
                maxtimer: tx,
              });
            }
          }, 1000);
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
          udata.isCircleCompleted = true;
          await setCachedGame({ ...udata, tournament: udata.tournament });
        } else {
          if (
            udata?.raisePlayerPosition !== null &&
            udata?.isCircleCompleted === true
          ) {
            newPosition = udata?.raisePlayerPosition;
          } else {
            newPosition = udata?.bigBlindPosition + 1;
            udata.isCircleCompleted = true;
            await setCachedGame({ ...udata, tournament: udata.tournament });
          }
        }
        timer(0, newPosition);
      } else {
        if (
          udata?.raisePlayerPosition === null ||
          i === udata?.raisePlayerPosition
        ) {
          setTimeout(() => {
            if (udata.runninground === 1) {
              flopround(roomid, io);
            } else if (udata.runninground === 2) {
              turnround(roomid, io);
            } else if (udata.runninground === 3) {
              riverround(roomid, io);
            } else if (udata.runninground === 4) {
              showdown(roomid, io);
            }
          }, 300);
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
    if (roomData.runninground === 1) {
      if (roomData?.bigBlindPosition === totalPlayer - 1) {
        i = 0;
      } else {
        i = roomData?.bigBlindPosition + 1;
      }
    } else {
      i = roomData.smallBlindPosition;
    }

    timer(i, totalPlayer);
  } catch (error) {
    console.log("Error in prefloptimer =>", error);
  }
};

export const flopround = async (roomid, io) => {
  try {
    let roomData = await getCachedGame(roomid);

    if (io.room.find((el) => el.room === roomData._id.toString()).flop) {
      console.log("flop round already executed");
      return;
    }
    console.log("flop round execution start");
    if (roomData?.runninground === 1) {
      let distributedCards = [];
      let floproundPlayersData = [];
      let totalPot = roomData.pot;
      let playingPlayer = 0;

      const fetchDistributedCards = () => {
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
            away: e.away,
            autoFoldCount: e.autoFoldCount,
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
      let communityCards = verifycards(distributedCards, 3);
      communityCards = communityCards.map((card) => EncryptCard(card));
      roomData = {
        ...roomData,
        flopround: floproundPlayersData,
        communityCard: communityCards,
        runninground: 2,
        timerPlayer: null,
        pot: totalPot,
        raisePlayerPosition: roomData.smallBlindPosition,
        raiseAmount: roomData.smallBlind,
        lastAction: "check",
        isCircleCompleted: false,
      };
      // console.log("flop round tourrnament before", roomData.tournament);
      await setCachedGame({ ...roomData, tournament: roomData.tournament });
      await getSidePOt(roomid);
      const updatedRoom = await getCachedGame(roomid);
      // console.log("turn round tourrnament value after", roomData.tournament);
      io.in(updatedRoom?._id?.toString()).emit("flopround", updatedRoom);
      if (playingPlayer > 1) {
        setTimeout(() => {
          console.log("flop-timer called for room =>", roomid);
          if (
            !io.room.find((el) => el.room === updatedRoom._id.toString()).flop
          ) {
            gameTurnTimer(roomid, io);
          }
        }, 200);
      } else {
        setTimeout(() => {
          console.log("turn-round called for room =>", roomid);
          if (
            !io.room.find((el) => el.room === updatedRoom._id.toString()).turn
          ) {
            turnround(roomid, io);
          }
        }, 900);
      }
    }
  } catch (error) {
    console.log("error in flop function", error);
  }
};

export const turnround = async (roomid, io) => {
  try {
    let roomData = await getCachedGame(roomid);

    if (io.room.find((el) => el.room === roomData._id.toString()).turn) {
      console.log("turn round already executed");
      return;
    }
    console.log("turn round execution start");
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
            away: e.away,
            autoFoldCount: e.autoFoldCount,
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
      roomData = {
        ...roomData,
        turnround: turnroundPlayersData,
        communityCard: communityCards,
        runninground: 3,
        timerPlayer: null,
        pot: totalPot,
        raisePlayerPosition: roomData.smallBlindPosition,
        raiseAmount: roomData.bigBlind / 2,
        lastAction: "check",
        isCircleCompleted: false,
      };
      // console.log("turn round tourrnament value before", roomData.tournament);
      await setCachedGame({ ...roomData, tournament: roomData.tournament });
      await getSidePOt(roomid);
      const updatedRoom = await getCachedGame(roomid);
      // console.log("river round tourrnament value after", roomData.tournament);
      io.in(updatedRoom?._id?.toString()).emit("turnround", updatedRoom);
      if (playingPlayer > 1) {
        setTimeout(() => {
          console.log("turn-timer called for room =>", roomid);
          if (!io.room.find((el) => el.room === roomData._id.toString()).turn) {
            gameTurnTimer(roomid, io);
          }
        }, 200);
      } else {
        setTimeout(() => {
          console.log("river-round called for room ==>", roomid);
          if (
            !io.room.find((el) => el.room === roomData._id.toString()).river
          ) {
            riverround(roomid, io);
          }
        }, 900);
      }
    }
  } catch (error) {
    console.log("error in turn round", error);
  }
};

export const riverround = async (roomid, io) => {
  try {
    let roomData = await getCachedGame(roomid);

    if (io.room.find((el) => el.room === roomData._id.toString()).river) {
      console.log("river round already executed");
      return;
    }

    let playingPlayer = 0;
    console.log("river round execution start");
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
            away: e.away,
            autoFoldCount: e.autoFoldCount,
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
      roomData = {
        ...roomData,
        riverround: riverroundPlayersData,
        communityCard: communityCards,
        runninground: 4,
        timerPlayer: null,
        pot: totalPot,
        raisePlayerPosition: roomData.smallBlindPosition,
        raiseAmount: roomData.bigBlind / 2,
        lastAction: "check",
        isCircleCompleted: false,
      };
      // console.log("river round tourrnament value before", roomData.tournament);
      await setCachedGame({ ...roomData, tournament: roomData.tournament });
      await getSidePOt(roomid);
      const updatedRoom = await getCachedGame(roomid);
      // console.log("river round tourrnament value after", roomData.tournament);

      io.in(updatedRoom?._id?.toString()).emit("riverround", updatedRoom);
      if (playingPlayer > 1) {
        setTimeout(() => {
          console.log("river-timer called for room =>", roomid);
          if (
            !io.room.find((el) => el.room === roomData._id.toString()).river
          ) {
            console.log("river round already executed");
            gameTurnTimer(roomid, io);
            return;
          }
        }, 200);
      } else {
        setTimeout(() => {
          console.log("showdown called for room =>", roomid);
          showdown(roomid, io);
        }, 900);
      }
    }
  } catch (error) {
    console.log("error in river round", error);
  }
};

export const showdown = async (roomid, io) => {
  try {
    console.log("----showdown-----");

    let roomData = await getCachedGame(roomid);
    // console.log("tournament in showdown", roomid, roomData.tournament);
    if (!roomData.isGameRunning) return;
    let playersHand = [];
    let hands = [];
    let showDownPlayers = [];
    let totalPot = roomData.pot;
    let playerData = roomData.riverround;
    let playerWithWallets = [];
    io.room = io.room.map((el) => {
      if (el.room.toString() === roomData._id.toString()) {
        return {
          ...el,
          preflop: false,
          flop: false,
          turn: false,
          river: false,
        };
      }
      return el;
    });
    playerData.forEach((e) => {
      let actionType = null;
      if (e.fold === true) {
        actionType = "fold";
      }
      if (e.actionType === "all-in") {
        actionType = "all-in";
      }
      playerWithWallets.push({
        id: e.id,
        wallet: e.wallet,
        totalWin: 0,
        totalBet: 0,
      });
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
        away: e.away,
        autoFoldCount: e.autoFoldCount,
      };
      totalPot += e.pot;
      showDownPlayers.push(p);
    });
    // return;
    roomData = {
      ...roomData,
      showdown: showDownPlayers,
      runninground: 5,
      timerPlayer: null,
      pot: totalPot,
    };

    await setCachedGame({ ...roomData, tournament: roomData.tournament });

    if (roomData.sidePots.length || roomData.allinPlayers.length) {
      await getSidePOt(roomData._id);
    }
    const updatedRoom = await getCachedGame(roomid);
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
    let showdownData = updatedRoom.showdown;
    let winnerPlayers = [];
    let sidePots = [...updatedRoom.sidePots];
    let i = 0;
    const findWinner = async () => {
      hands.forEach((e) => {
        let winners = Hand.winners(e.h);
        const betdAmt = e.pot / e.p.length;

        e.p.forEach((el) => {
          playerWithWallets = playerWithWallets.map((plyr) => {
            if (plyr.id.toString() === el.id.toString()) {
              plyr.totalBet += betdAmt;
            }
            return plyr;
          });
        });

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
              let totalPlayerTablePot = winnerData[0].prevPot;

              let winningAmount =
                winners.length > 1
                  ? parseInt(e.pot / winners.length, 10)
                  : e.pot; // - totalPlayerTablePot;
              playerWithWallets = playerWithWallets.map((plyr) => {
                if (plyr.id.toString() === el.id.toString()) {
                  plyr.totalWin += winningAmount;
                }
                return plyr;
              });
              console.log(
                "Winning ammount-->",
                winningAmount,
                parseInt(e.pot / winners.length, 10)
              );
              if (winnerPlayers.length) {
                winnerPlayers.push({
                  id: winnerData[0].id,
                  name: winnerData[0].name,
                  position: winnerData[0].position,
                  winningAmount: winningAmount,
                  handName: winner.name,
                  winnerHand: winnerHand,
                  betAmount: totalPlayerTablePot,
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
                  betAmount: totalPlayerTablePot,
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
    const upRoomData = await getCachedGame(roomid);

    upRoomData.showdown.forEach((player, i) => {
      let action, amt;
      let betAmt = 0;
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

          betAmt = winnerObj.betAmount;

          if (updateRoomObj && winnerObj) {
            if (winnerObj.winningAmount - updateRoomObj.amt < 0) {
              action = "game-lose";
              amt = Math.abs(winnerObj.winningAmount - updateRoomObj.amt);
            }
            // else if (winnerObj.winningAmount - updateRoomObj.amt === 0) {
            //   return;
            // }
            else {
              // amt = winnerObj.winningAmount - player.prevPot;
              amt = winnerObj.winningAmount;
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
          betAmt = amt;
        }
        player.wallet = showdownData[i].wallet;
        player.tickets = amt;

        const plyr = playerWithWallets.filter(
          (el) => player.id.toString() === el.id.toString()
        )[0];

        if (plyr) {
          action = plyr.totalWin > plyr.totalBet ? "game-win" : "game-lose";
          amt = plyr.totalWin - plyr.totalBet;
          amt = action === "game-win" ? amt : amt * -1;
        }

        player.hands.push({
          action,
          amount: amt,
          date: new Date(),
          isWatcher: false,
          betAmount: betAmt,
        });
      }
    });

    upRoomData.winnerPlayer = winnerPlayers;
    upRoomData.handWinner = handWinner;
    upRoomData.isShowdown = true;
    upRoomData.sidePots = sidePots;

    console.log("winner players ===>", winnerPlayers);

    if (winnerPlayers.length === 1) {
      gameRestartSeconds = 5000;
    } else {
      gameRestartSeconds = winnerPlayers.length * 2000;
    }

    io.in(upRoomData._id.toString()).emit("winner", {
      updatedRoom: upRoomData,
      gameRestartSeconds,
    });
    const upRoom = {
      ...upRoomData,
      showdown: upRoomData.showdown,
      winnerPlayer: winnerPlayers,
      handWinner,
      isShowdown: true,
      runninground: 5,
    };
    await setCachedGame({ ...upRoom, tournament: upRoom.tournament });
    await roomModel.updateOne(
      { _id: upRoom._id },
      {
        showdown: upRoomData.showdown,
        winnerPlayer: winnerPlayers,
        handWinner,
        isShowdown: true,
        runninground: 5,
      }
    );
    // console.log("player after showdwon winner", upRoom.showdown);
    // console.log("game finished");
    setTimeout(async () => {
      console.log("showdown room ==>", upRoom._id, upRoom.tournament?._id);
      if (upRoom.tournament) {
        // await elemination(upRoom, io);
        // await reArrangeTables(upRoom.tournament, io, upRoom._id);
        rearrangeQueue.push({
          roomData: upRoom,
          io,
          tournament: upRoom.tournament,
          roomId: upRoom._id,
        });
      } else {
        await updateRoomForNewHand(roomid, io);
        let updatedRoomPlayers = await getCachedGame(roomid);
        if (!updatedRoomPlayers.pause) {
          if (updatedRoomPlayers.autoNextHand) {
            preflopround(updatedRoomPlayers, io);
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
          updatedRoomPlayers.gamestart = false;
          await setCachedGame({
            ...updatedRoomPlayers,
            tournament: updatedRoomPlayers.tournament,
          });

          io.in(upRoom._id.toString()).emit("tablestopped", {
            msg: "Table stopped by host",
            game: updatedRoomPlayers,
          });
        }
        const roomUpdate = await getCachedGame(roomid);
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
        let roomData = await getCachedGame(roomid);
        if (roomData?.tournament) {
          const tourId = roomData.tournament._id
            ? roomData.tournament._id
            : roomData.tournament;

          roomData.tournament = await tournamentModel
            .findOne({ _id: tourId })
            .lean();
        } else {
          console.log(
            "tournament not found in update room for new hand",
            roomid
          );
        }
        let newHandPlayer = [];
        let buyin = roomData?.buyin;
        let availablerequest = roomData?.availablerequest;
        const bigBlindAmt =
          roomData?.tournament?.levels?.bigBlind?.amount || roomData?.bigBlind;
        const smallBlindAmt =
          roomData?.tournament?.levels?.smallBlind?.amount ||
          roomData?.smallBlind;
        let playerData = roomData[gameState[roomData.runninground]];
        // console.log(
        //   "running round =================>",
        //   roomData?.runninground,
        //   roomData.tournament
        // );

        if (!playerData.length) {
          return;
        }
        let sitin = roomData?.sitin;
        let leavereq = roomData?.leavereq;
        const anyNewPlayer = async (playerData, room) => {
          let data = playerData;
          let plrs = room.players;

          for await (let x of plrs) {
            try {
              if (!x) return;
              if (
                room.leavereq.includes(x?.userid) ||
                (room.tournament &&
                  room.tournament.eleminatedPlayers.find(
                    (el) => el.userid.toString() === x.userid.toString()
                    // || el.id
                    //   ? el.id
                    //   : el.userid === x.id
                    //   ? x.id
                    //   : x.userid
                  ))
              ) {
                console.log("entred in eleminated players");
                continue;
              }

              if (room.runninground > 0) {
                const playerexist = data.find((el) => el.userid === x.userid);
                if (!playerexist) {
                  data.push({ ...x, chipsBeforeHandStart: x.wallet });
                }
              }
              continue;
            } catch (error) {
              console.log("anyNewPlayer error", error);
              continue;
            }
          }
          return data;
        };

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

              let availabilityRequest = availablerequest.filter(
                (e) => e.userid.toString() === uid.toString()
              );

              let isAvailable = false;

              if (availabilityRequest.length) {
                isAvailable = true;
              }

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
                  away: isAvailable ? !isAvailable : el.away,
                  autoFoldCount: isAvailable ? 0 : el.autoFoldCount,
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
              newHandPlayer = await anyNewPlayer(newHandPlayer, roomData);
              // console.log("new hand playersssssss ===>", newHandPlayer);

              // console.log("tournamnettttt +====>", roomData.tournament);

              roomData = {
                ...roomData,
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
                availablerequest: [],
              };
              await setCachedGame({
                ...roomData,
                tournament: roomData.tournament,
              });
              console.log(
                "room data tournament in updateRoomForNewHand: " + roomData._id,
                roomData.tournament?._id
              );
              io.in(roomData._id.toString()).emit("newhand", {
                updatedRoom: roomData,
              });
              await roomModel.updateOne({ _id: roomData._id }, { ...roomData });
              resolve();
            } catch (error) {
              console.log("Error in transformedItems", error);
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
    // console.log("elemination runs for at starting ===>", roomData.tournament);
    console.log("elemination called ==>", roomData._id);
    roomData = await getCachedGame(roomData._id);
    let eleminated_players = roomData.eleminated;
    let noOfElemination = 0;
    let newHandPlayer = [];
    let showDown = roomData.showdown;
    const bigBlindAmt = roomData.bigBlind;
    const smallBlindAmt = roomData.smallBlind;
    let players = roomData.players;
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
          away: el.away,
          autoFoldCount: el.autoFoldCount,
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

    // console.log(
    //   "eleminated playersssss ===>",
    //   noOfElemination,
    //   eleminated_players
    // );

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
          eliminationCount: eleminated_players?.length,
          autoNextHand: true,
        },
        {
          new: true,
        }
      )
      .populate("tournament");

    // console.log("elemination runs for at starting ===>", upRoom.tournament);

    await setCachedGame({
      ...roomData,
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
      raisePlayerPosition: null,
      raiseAmount: 0,
      timerPlayer: null,
      lastAction: null,
      winnerPlayer: [],
      sidePots: [],
      isShowdown: false,
      isCircleCompleted: false,
      allinPlayers: [],
      eliminationCount: eleminated_players?.length,
      autoNextHand: true,
      tournament: roomData.tournament,
    });
    if (eleminated_players.length > 0 && noOfElemination > 0) {
      const availablePlayerCount =
        parseInt(upRoom.tournament.havePlayers) -
        parseInt(upRoom?.eliminationCount);
      let eleminatedPlayers = [...upRoom.tournament.eleminatedPlayers].concat(
        eleminated_players.sort(
          (a, b) => a.chipsBeforeHandStart - b.chipsBeforeHandStart
        )
      );
      // console.log("eleminated players length", eleminatedPlayers);

      await tournamentModel.updateOne(
        { _id: upRoom.tournament._id },
        {
          havePlayers: parseInt(availablePlayerCount),
          eleminatedPlayers: eleminatedPlayers || [],
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
        winPlayer["4-10"].userIds.push(ele.id || ele.userid);
        return;
      }
      if (!winPlayer.third.userId && winners.length > 2) {
        winPlayer.third.userId = ele.id || ele.userid;
        return;
      }
      if (!winPlayer.second.userId && winners.length > 1) {
        winPlayer.second.userId = ele.id || ele.userid;
        return;
      }
      if (!winPlayer.first.userId) {
        winPlayer.first.userId = ele.id || ele.userid;
        return;
      }
    });
    return winPlayer;
  } catch (error) {
    console.log("error in fixedPrizeDistribution", error);
  }
};

// const fixedPrizeDistribution = (tournamentdata, elem) => {
//   try {
//     let { winPlayer, winTotalPlayer, totalJoinPlayer } = tournamentdata;
//     let winners = elem.slice(
//       elem.length - tournamentdata.winTotalPlayer,
//       elem.length
//     );
//     console.log("winners ====>", winners);

//     if (totalJoinPlayer === 2 && winners.length === 2) {
//       winners.shift();
//     }

//     winners.reverse().forEach((ele) => {
//       if (
//         winTotalPlayer === 25 &&
//         winPlayer["11-25"] &&
//         winPlayer["11-25"].userIds.length < winPlayer["11-25"].playerCount &&
//         winners.length > 25
//       ) {
//         winPlayer["11-25"].userIds.push(ele.id || ele.userid);
//         return;
//       }
//       if (
//         winTotalPlayer === 10 &&
//         winPlayer["4-10"] &&
//         winPlayer["4-10"].userIds.length <= winPlayer["4-10"].playerCount &&
//         winners.length > 10
//       ) {
//         winPlayer["4-10"].userIds.push(ele.id || ele.userid);
//         return;
//       }
//       if (!winPlayer.third.userId && winners.length > 2) {
//         winPlayer.third.userId = ele.id || ele.userid;
//         return;
//       }
//       if (!winPlayer.second.userId && winners.length > 1) {
//         winPlayer.second.userId = ele.id || ele.userid;
//         return;
//       }
//       if (!winPlayer.first.userId) {
//         winPlayer.first.userId = ele.id || ele.userid;
//         return;
//       }
//     });
//     return winPlayer;
//   } catch (error) {
//     console.log("error in fixedPrizeDistribution", error);
//   }
// };

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

    const tournament = await tournamentModel.findOneAndUpdate(
      { _id: tournamentId },
      {
        winPlayer: winPlayer,
        isFinished: true,
        isStart: false,
        eleminatedPlayers: elem || [],
      },
      { new: true }
    );

    for await (let player of Object.values(tournament.winPlayer)) {
      if (player?.playerCount === 1) {
        //player.userId is the winner of amount player.amount
        if (player.userId) {
          const user = await userModel.findOneAndUpdate(
            { _id: player.userId },
            { $inc: { ticket: player.amount } },
            { new: true }
          );

          const { _id, username, email, firstName, lastName, profile } = user;

          await transactionModel.create({
            userId: {
              _id,
              username,
              email,
              firstName,
              lastName,
              profile,
            },
            eleminatedPlayers: [],
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
      } else {
        // player.userIds are winner of amount player.amount
        if (player.playerCount === 7) {
          if (player?.userIds?.length > 0) {
            for await (let userId of player?.userIds) {
              const user = await userModel.findOneAndUpdate(
                { _id: userId },
                { $inc: { ticket: player.amount } },
                { new: true }
              );

              const { _id, username, email, firstName, lastName, profile } =
                user;

              await transactionModel.create({
                userId: {
                  _id,
                  username,
                  email,
                  firstName,
                  lastName,
                  profile,
                },
                amount: player.amount,
                eleminatedPlayers: [],
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
          if (player?.userIds?.length > 0) {
            for await (let userId of player?.userIds) {
              const user = await userModel.findOneAndUpdate(
                { _id: userId },
                { $inc: { ticket: player.amount } },
                { new: true }
              );
              const { _id, username, email, firstName, lastName, profile } =
                user;

              await transactionModel.create({
                userId: {
                  _id,
                  username,
                  email,
                  firstName,
                  lastName,
                  profile,
                },
                amount: player.amount,
                transactionDetails: {},
                eleminatedPlayers: [],
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
      let gameData = await getCachedGame(roomid);
      gameData.pause = true;

      io.in(gameData._id.toString()).emit("roomPaused", {
        pause: gameData.pause,
      });
      await setCachedGame(gameData);
      roomModel.updateOne({ _id: roomid }, { pause: true });
    } else {
      socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    console.log("error in pause game: ", e);
    socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doFinishGame = async (data, io, socket) => {
  console.log("doFinishGame API called ");
  const userid = data.userid;
  let roomid = data.roomid;
  const { isValid } = checkIfEmpty({ roomid });
  try {
    if (isValid) {
      let roomData = await getCachedGame(roomid);
      if (!roomData.finish) {
        roomData.finish = false;
        roomData.autoNextHand = true;
        await setCachedGame(roomData);
        await roomModel.updateOne(
          { _id: roomData._id },
          { finish: false, autoNextHand: true }
        );
        let msg = "";
        if (roomData.runninground === 0) {
          msg = "Host initiated to finish this game";
        } else {
          msg =
            "Host initiated to finish this game, So you will see all stats after this hand";
        }

        if (roomData.runninground === 0) {
          await finishedTableGame(io, roomData, userid);
        } else {
          const checkRoom = await roomModel.find({
            finish: false,
            public: true,
            gameMode: roomData?.gameMode,
          });

          if (checkRoom && checkRoom.length > 2) {
            // if (dd || room.finish) await roomModel.deleteOne({ _id: room._id });

            if (!roomData.finish) {
              await setCachedGame({ ...roomData, finish: true });
              await roomModel.updateOne(
                { _id: roomData._id },
                { finish: true }
              );
            }

            //   const getAllRunningRoom = await roomModel
            //   .find({finish:false, public: true, gameType: "poker" })
            //   .populate("players.userid");
            // io.emit("AllTables", { tables: getAllRunningRoom });
          } else {
            msg = "Game paused, due to ring game";
            await setCachedGame({ ...roomData, pause: true });
            await roomModel.updateOne({ _id: roomData._id }, { pause: true });
          }
        }
        io.in(roomData._id.toString()).emit("roomFinished", {
          msg: msg,
          finish: roomData.finish,
          roomdata: roomData,
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
    console.log("error in doFinishGame: ", e);
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
      const roomData = await getCachedGame(roomid);
      const updatedData = {
        ...roomData,
        pause: false,
      };
      io.in(updatedData._id.toString()).emit("roomResume", {
        pause: updatedData.pause,
      });
      await setCachedGame(updatedData);
      await roomModel.updateOne({ _id: roomid }, { pause: false });
    } else {
      socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    console.log("error in do resume : ", e);
    socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doSitOut = async (data, io, socket) => {
  const { action } = data;
  const userid = data.userId;
  let tableId = data.tableId;
  let roomid;

  const { isValid } = checkIfEmpty({ tableId, userid });
  let playingPlayer = [];
  let res = true;
  try {
    if (isValid) {
      const roomData = await getCachedGame(tableId);
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
        const players = roomData[gameState[roomData.runninground]];
        sitOut.push(players.find((el) => el.id === userid));
        players.forEach((pl) => {
          if (pl.id === userid) {
            pl.playing = false;
            pl.fold = true;
          }
        });
        roomData[gameState[roomData.runninground]] = players;
        roomData.sitin = sitin;
        roomData.sitOut = sitOut;
        await setCachedGame({ ...roomData });
        players.forEach((el) => {
          if (!el.fold && el.wallet > 0 && el.playing) {
            playingPlayer.push({ id: el.id, position: el.position });
          }
        });

        if (
          roomData.runninground > 0 &&
          roomData.runninground < 5 &&
          playingPlayer.length === 1
        ) {
          await setCachedGame({ ...roomData, runninground: 5 });
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
            msg: "",
          });
        }
        if (socket) socket.emit("sitInOut", { updatedRoom: roomData });
      }
    } else {
      if (socket) socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    console.log("error in doSitOut: ", e);
    if (socket)
      socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doSitIn = async (data, io, socket) => {
  console.log("doSitIn API called ");
  const userid = data.userId;
  let tableId = data.tableId;
  let roomid;
  const { isValid } = checkIfEmpty({ tableId, userid });
  try {
    if (isValid) {
      const roomdata = await getCachedGame(tableId);
      roomid = roomdata._id;
      let sitin = roomdata.sitin;
      sitin.push(userid);
      let sitOut = roomdata.sitOut.filter((el) => el.id !== userid);
      let updatedData;
      if (roomdata.runninground === 0) {
        roomdata.players.forEach((pl) => {
          if (pl.id === userid) {
            pl.playing = true;
          }
        });
      } else {
        roomdata.sitin = sitin;
        roomdata.sitOut = sitOut;
      }
      await setCachedGame(roomdata);
      if (socket) socket.emit("sitInOut", { updatedRoom: roomdata });
      io.in(roomdata._id.toString()).emit("notification", {
        id: userid,
        action: "SitIn",
      });
    } else {
      socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    console.log("error doSitIn: ", e);
    socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doLeaveTable = async (data, io, socket) => {
  console.log("doleave table executed");
  const userid = data.userId;
  let tableId = data.tableId;
  let roomid;

  const { isValid } = checkIfEmpty({ tableId, userid });
  try {
    if (isValid) {
      let roomdata = await getCachedGame(tableId);
      roomdata.players.forEach((pl) => {
        if (pl.id === userid) {
          pl.playing = false;
        }
      });

      if (roomdata) {
        roomid = roomdata._id;
        if (roomdata?.tournament && roomdata?.isGameRunning) {
          return socket.emit("tournamentLeave");
        }

        if (roomdata?.hostId?.toString() === userid?.toString()) {
          let p = roomdata.players.filter(
            (ele) => ele?.userid?.toString() !== userid.toString()
          )[0];

          if (p) {
            roomdata.players
              .filter((ele) => ele.userid.toString() !== userid.toString())
              .forEach((pl) => {
                if (p.wallet < pl.wallet) {
                  p = pl;
                }
              });
            roomdata.hostId = p.userid;
            await setCachedGame(roomdata);
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
          await leaveApiCall(roomdata, userid);
          // io.in(tableId.toString()).emit("updateRoom", updatedData);
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
        roomdata = await getCachedGame(roomdata._id);
        roomdata.leavereq = leavereq;
        await setCachedGame(roomdata);

        let playerdata = roomdata.players.filter(
          (el) => el.userid.toString() === userid.toString()
        );

        const user = await User.findOne({ _id: userid });

        if (getRoomsUpdatedData)
          io.in(roomdata._id.toString()).emit("playerleft", {
            msg: `${user.username} has left the game`,
            userId: userid,
          });
      }
    } else {
      if (socket) socket.emit("actionError", { code: 400, msg: "Bad request" });
    }
  } catch (e) {
    console.log("err in doLeaveTable", e);
    if (socket)
      socket.emit("actionError", { code: 444, msg: "Some error has occured." });
  }
};

export const doFold = async (roomData, playerid, io, isAuto = true) => {
  try {
    const roomid = roomData._id;
    let playingPlayer = [];
    let res = true;

    console.log(
      "do fold for room id ==>",
      roomData._id,
      "playerid ==>",
      playerid
    );

    let lastAction = "fold";
    if (roomData.lastAction === "check") {
      lastAction = "check";
    }
    if (
      roomData?.timerPlayer &&
      roomData?.timerPlayer?.toString() === playerid?.toString()
    ) {
      let players = roomData[gameState[roomData.runninground]];
      //check is already acted
      if (players.find((pl) => pl.id === playerid)?.action) {
        return true;
      }
      players.forEach((pl) => {
        if (pl.id === playerid) {
          pl.fold = true;
          pl.actionType = lastAction;
          pl.action = true;
          pl.tentativeAction = null;
          if (!isAuto) {
            pl.away = false;
            pl.autoFoldCount = 0;
          }
        }
      });
      roomData.lastAction = lastAction;

      roomData[gameState[roomData.runninground]] = players;
      // console.log("tournament in do fold ==>", roomData.tournament);
      await setCachedGame({ ...roomData, tournament: roomData.tournament });

      io.in(roomData._id.toString()).emit("actionperformed", {
        id: playerid,
        action: "fold",
      });
      io.in(roomData._id.toString()).emit("fold", {
        updatedRoom: roomData,
      });

      players.forEach((el) => {
        if (
          !el.fold &&
          (el.wallet > 0 ||
            roomData.allinPlayers.find(
              (all) => all.id.toString() === el.id.toString()
            )) &&
          el.playing
        ) {
          playingPlayer.push({ id: el.id, position: el.position });
        }
      });

      if (playingPlayer.length <= 1) {
        await setCachedGame({ ...roomData, runninground: 5 });
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
    console.log("exit called fold");
    return res;
  } catch (error) {
    console.log("fafdaaf", error);
  }
};

export const socketDoFold = async (dta, io, socket) => {
  const userid = dta.userid;
  let roomid = dta.roomid;

  const { isValid } = checkIfEmpty({ roomid, userid });

  try {
    if (isValid) {
      let playerid = userid;

      const data = await getCachedGame(roomid);
      if (data !== null) {
        await doFold(data, playerid, io, false);
        console.log("manual do fold completed");
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
  if (roomData.timerPlayer.toString() === playerid.toString()) {
    let players = roomData[gameState[roomData.runninground]];
    if (players.find((pl) => pl.id === playerid)?.action) {
      return;
    }
    console.log(
      "do call for room id ==>",
      roomData._id,
      "playerid ==>",
      playerid
    );
    players.forEach((pl) => {
      if (pl.id === playerid) {
        amt -= pl.pot;
        pl.pot += amt;
        pl.wallet -= amt;
        pl.action = true;
        pl.actionType = "call";
        pl.tentativeAction = null;
        pl.away = false;
        pl.autoFoldCount = 0;
      }
    });
    roomData[gameState[roomData.runninground]] = players;
    roomData.lastAction = "call";
    // console.log("tournament in do call ==>", roomData.tournament);
    await setCachedGame(roomData);
    io.in(roomData._id.toString()).emit("actionperformed", {
      id: playerid,
      action: "call",
    });
    io.in(roomData._id.toString()).emit("call", { updatedRoom: roomData });
  }
};

export const socketDoCall = async (dta, io, socket) => {
  let userid = dta.userid;
  let roomid = dta.roomid;

  console.log("do call with", dta.amount);
  const { isValid } = checkIfEmpty({ roomid, userid, amt: dta.amount });

  try {
    if (isValid) {
      let playerid = userid;
      let amt = parseInt(dta.amount);
      const data = await getCachedGame(roomid);

      if (data !== null) {
        if (data.raiseAmount == amt) {
          const walletAmt = await getPlayerwallet(data, playerid);
          if (walletAmt >= amt) {
            await doCall(data, playerid, io, amt);
          } else {
            socket.emit("actionError", {
              code: 400,
              msg: "Insufficient tokens",
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
    let updatedRaiseAmt = roomData.raiseAmount;
    if (
      roomData.timerPlayer.toString() === playerid.toString() &&
      roomData.runninground > 1
    ) {
      let players = roomData[gameState[roomData.runninground]];
      let currentPlayer = players.find((pl) => pl.id === playerid);
      amt = amt - currentPlayer.pot;
      if (currentPlayer?.action) {
        return;
      }

      console.log(
        "do do bet for room id ==>",
        roomData._id,
        "playerid ==>",
        playerid
      );
      players.forEach((pl) => {
        if (
          pl.tentativeAction &&
          (pl.tentativeAction.startsWith("call ") ||
            pl.tentativeAction === "check")
        ) {
          pl.tentativeAction = null;
        } else if (pl.tentativeAction && pl.tentativeAction === "check/fold") {
          pl.tentativeAction = "fold";
        } else if (
          pl.tentativeAction &&
          pl.tentativeAction === "callAny" &&
          amt >= pl.wallet
        ) {
          pl.tentativeAction = "allin";
        }
        if (pl.id === playerid) {
          pl.pot += amt;
          pl.wallet -= amt;
          pl.action = true;
          pl.actionType = "bet";
          pl.tentativeAction = null;
          pl.away = false;
          pl.autoFoldCount = 0;
          updatedRaiseAmt = pl.pot;
        }
      });
      roomData[gameState[roomData.runninground]] = players;
      roomData.raisePlayerPosition = currentPlayer.position;
      roomData.raiseAmount = updatedRaiseAmt;
      roomData.lastAction = "bet";
      // console.log("tournament in do bet ==>", roomData.tournament);
      await setCachedGame(roomData);
      io.in(roomData._id.toString()).emit("actionperformed", {
        id: playerid,
        action: "bet",
      });
      io.in(roomData._id.toString()).emit("bet", { updatedRoom: roomData });
    }
  } catch (error) {
    console.log("Error in do Bet", error);
  }
};

export const socketDoBet = async (dta, io, socket) => {
  let userid = dta.userid;
  let roomid = dta.roomid;

  const { isValid } = checkIfEmpty({ roomid, userid, amt: dta.amount });

  try {
    if (isValid) {
      let playerid = userid;
      let amt = parseInt(dta.amount);
      const data = await getCachedGame(roomid);

      console.log("do bet with", dta.amount);
      if (data !== null) {
        if (data.raiseAmount <= amt) {
          const walletAmt = await getPlayerwallet(data, playerid);
          if (walletAmt >= amt) {
            await doBet(data, playerid, io, amt);
          } else {
            socket.emit("actionError", {
              code: 400,
              msg: "Insufficient tokens",
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
    let unpdatedRaisdAmt = roomData.raiseAmount;
    if (roomData?.timerPlayer?.toString() === playerid?.toString()) {
      let players = roomData[gameState[roomData.runninground]];
      let currentPlayer = players.find((pl) => pl.id === playerid);
      amt = amt - currentPlayer.pot;
      if (currentPlayer?.action) {
        return;
      }

      console.log(
        "do raise for room id ==>",
        roomData._id,
        "playerid ==>",
        playerid
      );
      players.forEach((e) => {
        if (
          e.tentativeAction &&
          (e.tentativeAction.startsWith("call ") ||
            e.tentativeAction === "check")
        ) {
          e.tentativeAction = null;
        } else if (e.tentativeAction && e.tentativeAction === "check/fold") {
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
          e.away = false;
          e.autoFoldCount = 0;
        }
      });
      roomData[gameState[roomData.runninground]] = players;
      roomData.raisePlayerPosition = currentPlayer.position;
      roomData.raiseAmount = unpdatedRaisdAmt;
      roomData.lastAction = "raise";
      await setCachedGame(roomData);
      // console.log("tournament in do raise ==>", roomData.tournament);
      io.in(roomData._id.toString()).emit("actionperformed", {
        id: playerid,
        action: "raise",
      });
      io.in(roomData._id.toString()).emit("raise", { updatedRoom: roomData });
    }
  } catch (error) {
    console.log("Error in doRaise", error);
  }
};

export const socketDoRaise = async (dta, io, socket) => {
  let userid = dta.userid;
  let roomid = dta.roomid;

  const { isValid } = checkIfEmpty({ roomid, userid, amt: dta.amount });

  try {
    if (isValid) {
      let playerid = userid;
      let amt = parseInt(dta.amount);
      console.log("do raise with", dta.amount);
      const data = await getCachedGame(roomid);

      if (data !== null) {
        if (data.raiseAmount <= amt) {
          const walletAmt = await getPlayerwallet(data, playerid);
          if (walletAmt >= amt) {
            await doRaise(data, playerid, io, amt);
          } else {
            socket.emit("actionError", {
              code: 400,
              msg: "Insufficient tokens",
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
    if (roomData?.timerPlayer?.toString() === playerid?.toString()) {
      let players = roomData[gameState[roomData.runninground]];
      if (players.find((pl) => pl.id === playerid)?.action) {
        return;
      }
      console.log(
        "do check for room id ==>",
        roomData._id,
        "playerid ==>",
        playerid
      );
      players.forEach((pl) => {
        if (pl.id === playerid) {
          pl.action = true;
          pl.actionType = "check";
          pl.tentativeAction = null;
          pl.away = false;
          pl.autoFoldCount = 0;
        }
      });
      roomData[gameState[roomData.runninground]] = players;
      roomData.lastAction = "check";
      await setCachedGame(roomData);
      // console.log("tournament in do check ==>", roomData.tournament);
      io.in(roomData._id.toString()).emit("actionperformed", {
        id: playerid,
        action: "check",
      });
      io.in(roomData._id.toString()).emit("check", { updatedRoom: roomData });
    }
  } catch (error) {
    console.log("Error in do Check", error);
  }
};

export const socketDoCheck = async (dta, io, socket) => {
  let userid = dta.userid;
  let roomid = dta.roomid;

  const { isValid } = checkIfEmpty({ roomid, userid });
  console.log("do check");
  try {
    if (isValid) {
      roomid = roomid;
      let playerid = userid;
      const data = await getCachedGame(roomid);
      if (data !== null) {
        await doCheck(data, playerid, io);
        console.log("manual do check complete");
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
    let { raiseAmount, raisePlayerPosition, allinPlayers, runninground } =
      roomData;
    // console.log("tournament in do allIn ==>", roomData.tournament);
    if (roomData?.timerPlayer?.toString() === playerid?.toString()) {
      let players = roomData[gameState[runninground]];
      let currentPlayer = players.find((pl) => pl.id === playerid);
      if (currentPlayer?.action) {
        return;
      }
      console.log(
        "do allin for room id ==>",
        roomData._id,
        "playerid ==>",
        playerid
      );
      raisePlayerPosition =
        raiseAmount < currentPlayer.wallet + currentPlayer.pot
          ? currentPlayer.position
          : raisePlayerPosition;
      raiseAmount =
        raiseAmount < currentPlayer.wallet + currentPlayer.pot
          ? currentPlayer.wallet + currentPlayer.pot
          : raiseAmount;
      allinPlayers.push({
        id: playerid,
        amt:
          currentPlayer?.wallet + currentPlayer?.pot + currentPlayer?.prevPot,
        wallet: currentPlayer?.wallet,
        round: roomData.runninground,
      });
      players.forEach((e) => {
        if (
          e.tentativeAction &&
          (e.tentativeAction.startsWith("call ") ||
            e.tentativeAction === "check")
        ) {
          e.tentativeAction = null;
        } else if (e.tentativeAction && e.tentativeAction === "check/fold") {
          if (e.pot >= currentPlayer.wallet + currentPlayer.pot) {
            e.tentativeAction = null;
          } else {
            e.tentativeAction = "fold";
          }
        } else if (
          e.tentativeAction &&
          e.tentativeAction === "callAny" &&
          currentPlayer.wallet + currentPlayer.pot >= e.wallet
        ) {
          e.tentativeAction = "allin";
        }
        if (e.id.toString() === playerid.toString()) {
          e.pot += e.wallet;
          e.wallet = 0;
          e.action = true;
          e.actionType = "all-in";
          e.tentativeAction = null;
          e.away = false;
          e.autoFoldCount = 0;
        }
      });
      roomData.raiseAmount = raiseAmount;
      roomData.raisePlayerPosition = raisePlayerPosition;
      roomData.lastAction = "all-in";
      roomData.allinPlayers = allinPlayers;
      roomData[gameState[runninground]] = players;
      await setCachedGame({ ...roomData, tournament: roomData.tournament });
      // console.log("tournament in do allIn ==>", roomData.tournament);
      io.in(roomData._id.toString()).emit("actionperformed", {
        id: playerid,
        action: "all-in",
      });
      io.in(roomData._id.toString()).emit("allin", { updatedRoom: roomData });
    }
  } catch (error) {
    console.log("LINE NUMBER 4352 in function.js", error);
  }
};

export const socketDoAllin = async (dta, io, socket) => {
  let userid = dta.userid;
  let roomid = dta.roomid;

  const { isValid } = checkIfEmpty({ roomid, userid });

  try {
    if (isValid) {
      let playerid = userid;
      // let amt  = body.amount;
      const data = await getCachedGame(roomid);
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
    let roomData = await getCachedGame(roomid);
    // console.log("tournament in winnerBefore Show", roomData.tournament);
    let winnerAmount = 0;
    let showDownPlayers = [];
    let playerData = null;
    let totalPot = roomData.pot;
    io.room = io.room.map((el) => {
      if (el.room.toString() === roomData._id.toString()) {
        return {
          ...el,
          preflop: false,
          flop: false,
          turn: false,
          river: false,
        };
      }
      return el;
    });

    playerData = roomData[gameState[runninground]];
    playerData.forEach((e) => {
      let actionType = null;
      if (e.fold === true) {
        actionType = "fold";
      }
      if (e.actionType === "all-in") {
        actionType = "all-in";
      }
      totalPot += e.pot;
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
        actionType,
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
        away: e.away,
        autoFoldCount: e.autoFoldCount,
      };
      showDownPlayers.push(p);
      winnerAmount += e.pot;
    });
    winnerAmount += roomData.pot;
    console.log("total pot", { winnerAmount, totalPot });

    roomData = {
      ...roomData,
      showdown: showDownPlayers,
      runninground: 5,
      timerPlayer: null,
      pot: totalPot,
      tournament: roomData.tournament,
    };

    await setCachedGame(roomData);

    if (roomData.sidePots.length || roomData.allinPlayers.length) {
      // console.log("all folded and allin");
      await getSidePOt(roomData._id);
      roomData = await getCachedGame(roomid);
      let sidePotTotal = roomData.sidePots.reduce((acc, el) => acc + el.pot, 0);
      if (sidePotTotal) {
        winnerAmount = sidePotTotal;
        console.log("winnet amount", winnerAmount);
      }
    }

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

    // roomData.isGameRunning = false;
    roomData.showdown = showDownPlayers;
    roomData.pot = 0;
    roomData.winnerPlayer = winnerPlayer;
    roomData.handWinner = handWinner;

    io.in(roomData._id.toString()).emit("winner", { updatedRoom: roomData });
    await setCachedGame({ ...roomData, tournament: roomData.tournament });
    console.log("winner decieded");
    // console.log("showdown players after winner", roomData.showdown);

    const updatedRoom = await roomModel.findOneAndUpdate(
      {
        _id: roomid,
      },
      {
        isGameRunning: false,
        showdown: showDownPlayers,
        pot: 0,
        winnerPlayer,
        handWinner,
      },
      {
        new: true,
      }
    );

    gameRestartSeconds = 5000;
    console.log("game finished");
    setTimeout(async () => {
      console.log(
        "winner before showdown room ==>",
        roomData._id,
        updatedRoom.tournament?._id
      );
      if (updatedRoom?.tournament) {
        // await elemination(roomData, io);
        // await reArrangeTables(updatedRoom.tournament, io, updatedRoom._id);
        rearrangeQueue.push({
          roomData,
          io,
          tournament: updatedRoom.tournament,
          roomId: updatedRoom._id,
        });
      } else {
        await updateRoomForNewHand(roomid, io);
        let updatedRoomPlayers = await getCachedGame(roomid);

        if (!updatedRoomPlayers.pause) {
          if (updatedRoomPlayers.autoNextHand) {
            preflopround(updatedRoomPlayers, io);
          } else {
            let havemoney = updatedRoomPlayers.players.filter(
              (el) => el.wallet > 0
            );

            if (havemoney.length > 1) {
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
          updatedRoomPlayers.gamestart = false;
          await setCachedGame(updatedRoomPlayers);
          io.in(updatedRoom._id.toString()).emit("tablestopped", {
            msg: "Table stopped by host",
            game: updatedRoomPlayers,
          });
        }
        const roomUpdate = await getCachedGame(roomid);
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
        res = filterData[0].wallet + filterData[0].pot;
        return res;
      case 3:
        filterData = roomData.turnround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        res = filterData[0].wallet + filterData[0].pot;
        return res;
      case 4:
        filterData = roomData.riverround.filter(
          (el) => el.id.toString() === playerid.toString()
        );
        res = filterData[0].wallet + filterData[0].pot;
        return res;
    }
  } catch (error) {
    console.log("error in getPlayerwallet", error);
  }
};

export const reArrangeTables = async (tournament, io, roomId) => {
  try {
    console.log("tournamentId", tournament);
    let tournamentId = tournament?._id; //? tournament?._id : tournament;
    const tournamentData = await tournamentModel
      .findOne(
        { _id: tournamentId },
        { rooms: 1, destroyedRooms: 1, havePlayers: 1 }
      )
      .lean();
    // if (tournamentData.tournamentType !== "Multi-Table") {
    //   return;
    // }
    let rooms = [];
    console.log("reArrange Called for room -", roomId);
    if (tournamentData) {
      const notDestroyedYet = tournamentData.rooms.filter((el) => {
        let r = true;
        const have = tournamentData.destroyedRooms.filter(
          (e) => e.toString() === el.toString()
        );
        if (have.length) {
          r = false;
        }
        return r;
      });
      for await (const room of notDestroyedYet) {
        rooms.push(await getCachedGame(room));
      }

      rooms = rooms.filter((room) => room);

      console.log(
        "not destoryed rooms",
        rooms.map((el) => el._id)
      );
      const allRooms = rooms.sort((a, b) => {
        // ASC  -> a.length - b.length
        // DESC -> b.length - a.length
        return a.players.length - b.players.length;
      });
      if (allRooms.length > 0) {
        await fillSpot(allRooms, io, tournamentData, roomId);
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

const reArrangementBeforeTournamentStart = async (
  allRooms,
  io,
  tournamentId,
  roomId
) => {
  try {
    console.log("fill spot called");

    // Calculate the total number of players in all remaining rooms
    const totalPlayers = allRooms.reduce(
      (count, room) => count + room.players.length,
      0
    );

    console.log("totalPlayers ==>", totalPlayers);

    // Calculate the ideal number of players per table
    const idealPlayerCount = Math.floor(totalPlayers / allRooms.length);

    console.log("idealPlayerCount ==>", idealPlayerCount);

    // Sort the rooms in descending order based on the number of players
    allRooms.sort((a, b) => b.players.length - a.players.length);

    // Iterate over the rooms and redistribute the players evenly

    for await (let room of allRooms) {
      const currentPlayerCount = room.players.length;
      const playersToMoveCount = currentPlayerCount - idealPlayerCount;

      if (playersToMoveCount > 0) {
        // Calculate the number of players to move from the current room

        console.log("playersToMoveCount ==>", playersToMoveCount);

        const playersToMove = room.players.splice(0, playersToMoveCount);
        console.log("playersToMove ==>", playersToMove);

        let flag = true;
        let userIds;
        allRooms = allRooms.map((r) => {
          if (r !== room && r.players.length < idealPlayerCount) {
            const occupiedPositions = r.players.map((el) => el.position);

            let blankPositions = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(
              (el) => occupiedPositions.indexOf(el) < 0
            );
            console.log("blank positions ====>", blankPositions);
            const updatedPLayersWithPositions = playersToMove.map((p, i) => {
              p.position = blankPositions[i];
              return p;
            });
            r.players.push(...updatedPLayersWithPositions);
            userIds = playersToMove.map((player) => ({
              userId: player.userid,
              newRoomId: r._id,
            }));
            flag = false;
          }
          return r;
        });
        // console.log("allRooms ===>", allRooms);

        if (flag) {
          room.players.push(...playersToMove);
        }

        const udpatedRoom = await roomModel
          .findOneAndUpdate(
            { _id: room._id },
            {
              players: room.players,
            },
            { new: true }
          )
          .populate("tournament")
          .lean();
        console.log("udpatedRoom =====>", udpatedRoom);
        await setCachedGame({ ...room, tournament: udpatedRoom.tournament });
        console.log(
          "udpatedRoom changed players for room ==>",
          udpatedRoom._id,
          udpatedRoom?.players
        );

        // Emit the "roomchanged" event for the moved players

        io.in(room._id.toString()).emit("roomchanged", { userIds });
      } else {
        const udpatedRoom = await roomModel
          .findOneAndUpdate(
            { _id: room._id },
            {
              players: room.players,
            },
            { new: true }
          )
          .populate("tournament");
        console.log("udpatedRoom =====>", udpatedRoom, room.tournament);
        await setCachedGame({ ...room, tournament: udpatedRoom.tournament });
        console.log("udpatedRoom ==>", udpatedRoom?.players);
      }
    }

    // Check if any rooms have fewer players than the ideal count
    const underfilledRooms = allRooms.filter(
      (room) => room.players.length < idealPlayerCount
    );

    if (underfilledRooms.length === 1) {
      // Only one room left, start the game or emit "waitForReArrange" event
      const room = underfilledRooms[0];
      if (room.players.length > 1) {
        // preflopround(room, io);
      } else {
        io.in(room._id.toString()).emit("waitForReArrange", {
          userIds: room.showdown.map((p) => p.id || p.userid),
        });
      }
    } else if (underfilledRooms.length === 0) {
      // All rooms have reached the ideal player count
      console.log("All tables have reached the ideal player count");
    } else {
      // More than one room still underfilled, continue the redistribution process
      console.log("Continue redistributing players");
    }

    return await roomModel
      .find({
        tournament: tournamentId,
      })
      .populate("tournament")
      .lean();
  } catch (error) {
    console.log("error in reArragnement before start function =>", error);
  }
};

const fillSpot = async (allRooms, io, tournamentId, roomId) => {
  try {
    console.log("fill spot called", roomId);
    console.log("tournament in do fillSPot ==>", tournamentId._id);
    if (allRooms.length === 1) {
      let remainingPlayers = allRooms[0].players.filter(
        (pl) => !allRooms[0].eleminated.find((el) => el.id === pl.id)
      );
      if (remainingPlayers.length > 1) {
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
        console.log("Last table in tournament", remainingPlayers.length);
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
        await deleteCachedGame(allRooms[0]._id);
        await roomModel.deleteOne({ _id: allRooms[0]._id });
        return;
      }
    }
    let room = await getCachedGame(roomId);
    const OtherRoom = allRooms.filter(
      (r) => r._id.toString() !== roomId.toString()
    );

    const totalPlayers = allRooms.reduce(
      (count, room) => count + room.players.length,
      0
    );

    // console.log("totalPlayers ==>", totalPlayers);

    const noOfTablesShudBe = Math.ceil(totalPlayers / playerLimit);

    let remainingPlayers = room.players
      .filter((pl) => !room.eleminated.find((el) => el.id === pl.id))
      .map((pl) => {
        let el = room.showdown.find((el) => el.id === pl.id);
        if (el) {
          return {
            ...pl,
            wallet: el.wallet,
          };
        } else {
          return { ...pl };
        }
      });

    if (
      noOfTablesShudBe < allRooms.length &&
      remainingPlayers.length < playerLimit
    ) {
      let userIds = [];
      const idealPlayerCount = playerLimit;
      console.log(" idealPlayerCount ==>", idealPlayerCount);
      let noOfPlayersToMove = remainingPlayers.length;
      console.log("no of players to move ", noOfPlayersToMove);
      let playersToMove = remainingPlayers.splice(0, noOfPlayersToMove);

      for await (let newRoom of OtherRoom) {
        newRoom = await getCachedGame(newRoom._id);
        console.log("new room ==>", newRoom._id);
        if (noOfPlayersToMove) {
          const totalPlayersInNewRoom = newRoom.players.length;

          if (totalPlayersInNewRoom < idealPlayerCount) {
            const NoOfPlayersReqInNewRoom =
              idealPlayerCount - totalPlayersInNewRoom;

            let player = playersToMove.splice(0, NoOfPlayersReqInNewRoom);
            const occupiedPositions = newRoom.players.map((el) => el.position);

            let blankPositions = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(
              (el) => occupiedPositions.indexOf(el) < 0
            );

            player = player.map((el, i) => {
              userIds.push({
                userId: el.id,
                newRoomId: newRoom._id,
              });
              return {
                ...el,
                position: blankPositions[i],
              };
            });

            const updatedPlayersInNewRoom = [...newRoom.players, ...player];
            newRoom.players = [...updatedPlayersInNewRoom];
            await setCachedGame({ ...newRoom, tournament: tournamentId });
            const updatedNewRoom = await roomModel.findOneAndUpdate(
              {
                _id: newRoom._id,
              },
              {
                players: newRoom.players,
              }
            );

            if (!newRoom.gamestart) {
              await preflopround(newRoom, io);
            }
          }
        } else {
          break;
        }
      }

      if (userIds.length) {
        console.log("now currnt room players", { ...remainingPlayers });

        console.log("remaining players ==>", { ...playersToMove });

        room.players = [...remainingPlayers, ...playersToMove];

        const updatedRoom = {
          ...room,
          showdown: [...remainingPlayers, ...playersToMove],
        };

        room = updatedRoom;

        await setCachedGame({ ...updatedRoom, tournament: tournamentId });
        await roomModel.findOneAndUpdate(
          {
            _id: room._id,
          },
          {
            players: updatedRoom.players,
            showdown: updatedRoom.players,
          },
          { new: true }
        );
        console.log("updatedTable ==>", {
          players: room.players,
          showdown: room.showdown,
        });
        io.in(room._id.toString()).emit("updateGame", { game: updatedRoom });
        io.in(room._id.toString()).emit("roomchanged", {
          userIds,
        });

        if (updatedRoom.length) {
          await preflopround(updatedRoom, io);
          return;
        } else {
          await tournamentModel.updateOne(
            { _id: room.tournament },
            { $push: { destroyedRooms: room._id } },
            {
              new: true,
            }
          );
          await deleteCachedGame(room._id);
          await roomModel.deleteOne({ _id: room._id });
        }
      }
    } else {
      let userIds = [];

      // Calculate the ideal number of players per table
      const idealPlayerCount = Math.floor(totalPlayers / allRooms.length);
      console.log(" idealPlayerCount ==>", idealPlayerCount);

      remainingPlayers = remainingPlayers;
      // let playersWaitingztoPlay = remainingPlayers.filter((el) => {
      //   let isWaiting = true;
      //   room.showdown.forEach((el2) => {
      //     if (el2.userid.toString() === el.userid.toString()) {
      //       isWaiting = false;
      //     }
      //   });
      //   return isWaiting;
      // });
      const totalPlayersInRoom = [...remainingPlayers];

      console.log(
        "ideal count condition ==>",
        totalPlayersInRoom.length,
        idealPlayerCount
      );
      // console.log("totalPlayersInRoom ==>", totalPlayersInRoom);

      if (totalPlayersInRoom.length > idealPlayerCount) {
        let noOfPlayersToMove = totalPlayersInRoom.length - idealPlayerCount;
        console.log("no of players to move ", noOfPlayersToMove);
        let playersToMove = remainingPlayers.splice(0, noOfPlayersToMove);

        console.log("playersToMove ==>", playersToMove);

        console.log("remianing in showdown ===>", remainingPlayers);

        // await sendPLayerToANotherTables()

        for await (let newRoom of OtherRoom) {
          newRoom = await getCachedGame(newRoom._id);
          console.log("new room ==>", newRoom._id);
          if (noOfPlayersToMove) {
            let playersWaitingtoPlayInNewRoom = newRoom.players;
            const totalPlayersInNewRoom = newRoom.players.length;

            // console.log("cached room ==>", playersWaitingtoPlayInNewRoom);

            console.log(
              "totalPlayersInNewRoom ===>",
              totalPlayersInNewRoom,
              idealPlayerCount
            );

            if (totalPlayersInNewRoom < idealPlayerCount) {
              const NoOfPlayersReqInNewRoom =
                idealPlayerCount - totalPlayersInNewRoom;

              let player = playersToMove.splice(0, NoOfPlayersReqInNewRoom);

              // console.log("player who s going to another table ==>", player);

              const occupiedPositions = newRoom.players.map(
                (el) => el.position
              );

              let blankPositions = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(
                (el) => occupiedPositions.indexOf(el) < 0
              );

              player = player.map((el, i) => {
                userIds.push({
                  userId: el.id,
                  newRoomId: newRoom._id,
                });
                return {
                  ...el,
                  position: blankPositions[i],
                };
              });

              const updatedPlayersInNewRoom = [...newRoom.players, ...player];
              // console.log("now updated player ==>", updatedPlayersInNewRoom);

              newRoom.players = [...updatedPlayersInNewRoom];
              await setCachedGame({ ...newRoom, tournament: tournamentId });
              const updatedNewRoom = await roomModel.findOneAndUpdate(
                {
                  _id: newRoom._id,
                },
                {
                  players: newRoom.players,
                }
              );

              if (!newRoom.gamestart) {
                await preflopround(newRoom, io);
              }
            }
          } else {
            break;
          }
          // if (!newRoom.isGameRunning) {
          //   preflopround(newRoom, io);
          // }
        }

        // console.log("user ids to  move ==>", userIds);

        if (userIds.length) {
          console.log("now currnt room players", { ...remainingPlayers });

          console.log("remaining players ==>", { ...playersToMove });

          room.players = [...remainingPlayers, ...playersToMove];

          const updatedRoom = {
            ...room,
            showdown: [...remainingPlayers, ...playersToMove],
          };

          room = updatedRoom;

          await setCachedGame({ ...updatedRoom, tournament: tournamentId });
          await roomModel.findOneAndUpdate(
            {
              _id: room._id,
            },
            {
              players: updatedRoom.players,
              showdown: updatedRoom.players,
            },
            { new: true }
          );
          console.log("updatedTable ==>", {
            players: room.players,
            showdown: room.showdown,
          });
          io.in(room._id.toString()).emit("updateGame", { game: updatedRoom });
          io.in(room._id.toString()).emit("roomchanged", {
            userIds,
          });
          await preflopround(updatedRoom, io);
          return;
        } else {
          console.log("updatedTable1 ==>", { room: room.players });
          await preflopround(room, io);
        }
      } else if (totalPlayersInRoom.length === 1) {
        console.log("only one player in room");
        let blankSpotFound = false;

        for await (let newRoom of OtherRoom) {
          newRoom = await getCachedGame(newRoom._id);
          let playersWaitingtoPlayInNewRoom = newRoom.players.filter((el) => {
            let isWaiting = true;
            room.showdown.forEach((el2) => {
              if (el2.userid.toString() === el.userid.toString()) {
                isWaiting = false;
              }
            });
            return isWaiting;
          });
          const totalPlayersInNewRoom =
            playersWaitingtoPlayInNewRoom.length + newRoom.showdown.length;
          if (totalPlayersInNewRoom < playerLimit) {
            const occupiedPositions = newRoom.players.map((el) => el.position);

            let blankPositions = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(
              (el) => occupiedPositions.indexOf(el) < 0
            );

            totalPlayersInRoom[0].position = blankPositions[0];

            newRoom.players = [...newRoom.players, ...totalPlayersInRoom];
            newRoom.watchers = [...newRoom.watchers, room.watchers];
            await setCachedGame({ ...newRoom, tournament: tournamentId });
            await roomModel.updateOne(
              {
                _id: newRoom._id,
              },
              {
                players: newRoom.players,
                watchers: newRoom.watchers,
              }
            );
            blankSpotFound = true;
            userIds.push({
              userId: room.players[0].id,
              newRoomId: newRoom._id,
            });
            userIds = [
              ...userIds,
              newRoom.watchers.map((el) => ({
                userId: el,
                newRoomId: newRoom._id,
              })),
            ];
            io.in(room._id.toString()).emit("roomchanged", {
              userIds,
            });
            if (!newRoom.gamestart) {
              await preflopround(newRoom, io);
            }

            break;
          }
        }

        if (!blankSpotFound) {
          io.in(room._id.toString()).emit("waitForReArrange", {
            userIds: room.showdown.map((p) => p.id || p.userid),
          });

          await setCachedGame({
            ...room,
            players: room.showdown,
            runninground: 0,
            gamestart: false,
            communityCard: [],
            tournament: tournamentId,
          });

          const updatedRoom = await roomModel.findOneAndUpdate(
            {
              _id: convertMongoId(room._id),
            },
            {
              players: room.showdown,
              runninground: 0,
              gamestart: false,
              communityCard: [],
            },
            { new: true }
          );

          io.in(room._id.toString()).emit("updateGame", { game: updatedRoom });
        } else {
          await tournamentModel.updateOne(
            { _id: room.tournament },
            { $push: { destroyedRooms: room._id } },
            {
              new: true,
            }
          );
          await deleteCachedGame(room._id);
          await roomModel.deleteOne({ _id: room._id });
        }
      } else {
        await preflopround(room, io);
      }
    }

    // let blankSpot = 0;
    // OtherRoom.forEach((c) => {
    //   blankSpot += playerLimit - c.players.length;
    // });
    // let totalPlayers = room.showdown.length;
    // room.players.forEach((pl) => {
    //   if (
    //     room.showdown.find(
    //       (sPl) => pl.userid.toString() !== sPl.userid.toString()
    //     )
    //   ) {
    //     totalPlayers += 1;
    //   }
    // });
    // // room.showdown.length
    // console.log("blank spot ==>", blankSpot);
    // if (blankSpot >= totalPlayers) {
    //   let playersWaitingztoPlay = room.players.filter((el) => {
    //     let isWaiting = true;
    //     room.showdown.forEach((el2) => {
    //       if (el2.userid.toString() === el.userid.toString()) {
    //         isWaiting = false;
    //       }
    //     });
    //     return isWaiting;
    //   });
    //   let playersToMove = [...room.showdown, ...playersWaitingztoPlay];
    //   console.log("playersToMove ==>", playersToMove);
    //   let userIds = [];
    //   for await (const r of OtherRoom) {
    //     if (playersToMove.length === 0 || blankSpot === 0) {
    //       break;
    //     }
    //     if (r.players.length >= playerLimit) {
    //       continue;
    //     }
    //     let newPlayers = [...r.players];
    //     let tempSpotArr = [...Array(playerLimit - r.players.length).keys()];
    //     for await (const temp of tempSpotArr) {
    //       if (playersToMove[temp]) {
    //         let position = await findAvailablePosition(newPlayers);
    //         newPlayers.push({ ...playersToMove[temp], position });
    //         userIds.push({
    //           userId: playersToMove[temp].userid,
    //           newRoomId: r._id,
    //         });
    //       }
    //     }
    //     await setCachedGame({ ...r, players: newPlayers });
    //     const updatedRoom = await roomModel.findOneAndUpdate(
    //       {
    //         _id: r._id,
    //       },
    //       {
    //         players: newPlayers,
    //       },
    //       {
    //         new: true,
    //       }
    //     );
    //     playersToMove.splice(0, tempSpotArr.length);
    //     blankSpot -= tempSpotArr.length;
    //   }
    //   console.log("users who have moved", userIds);
    //   if (userIds.length) {
    //     io.in(room._id.toString()).emit("roomchanged", {
    //       userIds,
    //     });
    //     setTimeout(() => {
    //       allRooms.forEach((r) => {
    //         if (
    //           userIds.find(
    //             (user) => user.newRoomId.toString() === r._id.toString()
    //           ) &&
    //           !r.gamestart
    //         ) {
    //           preflopround(r, io);
    //         }
    //       });
    //     }, 1000);
    //   }
    //   if (playersToMove.length === 0) {
    //     await tournamentModel.updateOne(
    //       { _id: room.tournament },
    //       { $push: { destroyedRooms: room._id } },
    //       {
    //         new: true,
    //       }
    //     );
    //     await deleteCachedGame(room._id);
    //     await roomModel.deleteOne({ _id: room._id });
    //   }
    // } else {
    //   console.log("Not enough blank spot");
    //   if (room.showdown.length > 1) {
    //     // console.log("UPdateeeeddddddd dataaaaaaa -->", updatedRoom);
    //     // io.in(room._id.toString()).emit("updateRoom", updatedRoom);
    //     if (room.showdown.length < playerLimit) {
    //       const stopedRoom = OtherRoom.filter(
    //         (r) => !r.gamestart && r.players.length === 1
    //       )[0];
    //       if (stopedRoom) {
    //         // console.log("stooped room", stopedRoom?.players);
    //         const occupiedPositions = room.players.map((p) => p.position);
    //         const blankPositions = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(
    //           (el) => occupiedPositions.indexOf(el) < 0
    //         );

    //         room.players.push({
    //           ...stopedRoom.players[0],
    //           position: blankPositions[0],
    //         });
    //         console.log("running room players", room.players);

    //         io.in(stopedRoom._id.toString()).emit("roomchanged", {
    //           userIds: [
    //             {
    //               userId: stopedRoom.players[0]?.userid,
    //               newRoomId: room._id,
    //             },
    //           ],
    //         });
    //         await setCachedGame(room);
    //         await roomModel.updateOne(
    //           {
    //             _id: room._id,
    //           },
    //           {
    //             players: room.players,
    //           }
    //         );

    //         await tournamentModel.updateOne(
    //           { _id: stopedRoom.tournament },
    //           { $push: { destroyedRooms: stopedRoom._id } },
    //           {
    //             new: true,
    //           }
    //         );
    //         await deleteCachedGame(stopedRoom._id);
    //         await roomModel.deleteOne({ _id: stopedRoom._id });
    //       }
    //     }

    //     await preflopround(room, io);
    //   } else {
    //     console.log(
    //       "wait for rearrangesdfsdf =====>",
    //       { showDown: room.showdown },
    //       room._id
    //     );
    //     const updatedRoom = await roomModel.findOneAndUpdate(
    //       {
    //         _id: convertMongoId(room._id),
    //       },
    //       {
    //         players: room.showdown,
    //         runninground: 0,
    //         gamestart: false,
    //         communityCard: [],
    //       },
    //       { new: true }
    //     );
    //     await setCachedGame({
    //       ...room,
    //       players: room.showdown,
    //       runninground: 0,
    //       gamestart: false,
    //       communityCard: [],
    //     });
    //     io.in(room._id.toString()).emit("updateGame", { game: updatedRoom });
    //     io.in(room._id.toString()).emit("waitForReArrange", {
    //       userIds: room.showdown.map((p) => p.id || p.userid),
    //     });
    //   }
    // }
  } catch (error) {
    console.log("error in fillSpot function =>", error);
  }
};

const sendPLayerToANotherTables = async (data) => {
  try {
    for await (let newRoom of OtherRoom) {
      newRoom = await getCachedGame(newRoom._id);
      console.log("new room ==>", newRoom._id);
      if (noOfPlayersToMove) {
        let playersWaitingtoPlayInNewRoom = newRoom.players;
        const totalPlayersInNewRoom = newRoom.players.length;

        // console.log("cached room ==>", playersWaitingtoPlayInNewRoom);

        console.log(
          "totalPlayersInNewRoom ===>",
          totalPlayersInNewRoom,
          idealPlayerCount
        );

        if (totalPlayersInNewRoom < idealPlayerCount) {
          const NoOfPlayersReqInNewRoom =
            idealPlayerCount - totalPlayersInNewRoom;

          let player = playersToMove.splice(0, NoOfPlayersReqInNewRoom);

          // console.log("player who s going to another table ==>", player);

          const occupiedPositions = newRoom.players.map((el) => el.position);

          let blankPositions = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(
            (el) => occupiedPositions.indexOf(el) < 0
          );

          player = player.map((el, i) => {
            userIds.push({
              userId: el.id,
              newRoomId: newRoom._id,
            });
            return {
              ...el,
              position: blankPositions[i],
            };
          });

          const updatedPlayersInNewRoom = [...newRoom.players, ...player];
          // console.log("now updated player ==>", updatedPlayersInNewRoom);

          newRoom.players = [...updatedPlayersInNewRoom];
          await setCachedGame({ ...newRoom, tournament: tournamentId });
          const updatedNewRoom = await roomModel.findOneAndUpdate(
            {
              _id: newRoom._id,
            },
            {
              players: newRoom.players,
            }
          );

          if (!newRoom.gamestart) {
            await preflopround(newRoom, io);
          }
        }
      }
      // if (!newRoom.isGameRunning) {
      //   preflopround(newRoom, io);
      // }
    }

    // console.log("user ids to  move ==>", userIds);

    if (userIds.length) {
      console.log("now currnt room players", { ...remainingPlayers });

      console.log("remaining players ==>", { ...playersToMove });

      room.players = [...remainingPlayers, ...playersToMove];

      const updatedRoom = {
        ...room,
        showdown: [...remainingPlayers, ...playersToMove],
      };

      room = updatedRoom;

      await setCachedGame({ ...updatedRoom, tournament: tournamentId });
      await roomModel.findOneAndUpdate(
        {
          _id: room._id,
        },
        {
          players: updatedRoom.players,
          showdown: updatedRoom.players,
        },
        { new: true }
      );
      console.log("updatedTable ==>", {
        players: room.players,
        showdown: room.showdown,
      });
      io.in(room._id.toString()).emit("updateGame", { game: updatedRoom });
      io.in(room._id.toString()).emit("roomchanged", {
        userIds,
      });
      await preflopround(updatedRoom, io);
      return;
    } else {
      console.log("updatedTable1 ==>", { room: room.players });
      await preflopround(room, io);
    }
  } catch (err) {
    console.log("error in sendPLayerToANotherTables function =>", err);
  }
};

export const getRoomsUpdatedData = async (rooms) => {
  try {
    return new Promise((resolve, reject) => {
      let updatedRooms = [];
      each(
        rooms,
        async function (room, next) {
          let roomData = await getCachedGame(room._id);
          if (!roomData) roomData = await roomModel.findById(room._id).lean();
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
    console.log("error in getRoomsUpdatedData", error);
  }
};

export const findAvailablePosition = async (playerList) => {
  return new Promise((resolve, reject) => {
    try {
      let i = 0;
      let isFound = false;
      while (i < playerLimit && !isFound) {
        let have = playerList.filter((el) => el.position === i);
        if (!have.length) {
          isFound = true;
          resolve(i);
        }
        i++;
      }
    } catch (error) {
      console.log("Error in findAvailablePosition =", error);
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
      await setCachedGame({ ...room, pause: false });
      await preflopround(room, io);
    }
  } catch (e) {
    console.log("error in startPreflopround : ", e);
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
    console.log("finishtableGame called ");
    const dd = await leaveApiCall(room, userid, io);
    const checkRoom = await roomModel.find({
      finish: false,
      public: true,
      gameMode: room?.gameMode,
    });
    console.log("checkRoom.length ===>", checkRoom.length);
    if (checkRoom && checkRoom.length > 2) {
      if (dd || room.finish) await setCachedGame({ ...room, finish: true });
      await roomModel.updateOne({ _id: room._id }, { finish: true });
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

      MessageModal.insertMany(sendMessageToInvitedUsers);
      Notification.insertMany(sendNotificationToInvitedUsers);

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

    const room = await getCachedGame(tableId);
    console.log("LEAVE API CALL from doLeaveaWatcher");
    const isCalled = await leaveApiCall(room, userId);
    if (isCalled) {
      room.watchers = room.watchers.filter((wt) => wt.userid !== userId);

      if (room) {
        io.in(_id.toString()).emit("updatePlayerList", room);
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
    let transactionObjectsArray = [];
    const rankModelUpdate = [];
    let usersWalltAmt = [];
    let userTickets = [];
    let userGoldCoins = [];
    const room = await getCachedGame(roomId);
    tournament = room?.tournament;
    const userData = [];
    for await (const user of users) {
      const crrUser = await userModel.findOne({ _id: user.uid });
      usersWalltAmt.push(crrUser.wallet);
      userTickets.push(crrUser.ticket);
      userGoldCoins.push(crrUser.goldCoin);
      userData.push({
        _id: crrUser._id,
        username: crrUser.username,
        email: crrUser.email,
        firstName: crrUser.firstName,
        lastName: crrUser.lastName,
        profile: crrUser.profile,
      });
    }

    users.forEach(async (el, i) => {
      let updatedAmount = el.coinsBeforeJoin; //el.wallet;
      const userId = el.uid;

      let totalWinAmount = 0;
      let totalLossAmount = 0;
      let totalWin = 0;
      let totalLose = 0;
      let prevAmount = el.coinsBeforeJoin;
      let handsTransaction = [];
      if (!tournament) {
        el.hands.forEach((elem) => {
          console.log({ elem });
          if (elem.action === "game-lose") {
            totalLossAmount += elem.amount;
            totalLose++;
          } else {
            totalWinAmount += elem.amount;
            totalWin++;
          }
        });

        const ticketAmt =
          totalLossAmount >= totalWinAmount
            ? 0
            : totalWinAmount - totalLossAmount;
        const totalLooseAmt =
          totalLossAmount >= totalWinAmount
            ? totalLossAmount - totalWinAmount
            : 0;

        let updatedWallet =
          room?.gameMode !== "goldCoin"
            ? usersWalltAmt[i] + el.wallet - ticketAmt
            : usersWalltAmt[i];
        let updatedTicket =
          room?.gameMode !== "goldCoin"
            ? userTickets[i] + ticketAmt
            : userTickets[i];
        let updatedGoldCoin =
          room?.gameMode !== "goldCoin"
            ? userGoldCoins[i]
            : userGoldCoins[i] + el.wallet;
        let prevGoinCoin =
          room?.gameMode !== "goldCoin"
            ? userGoldCoins[i]
            : userGoldCoins[i] + el.wallet - ticketAmt;

        handsTransaction.push({
          userId: userData[i],
          roomId,
          amount: ticketAmt || -totalLooseAmt,
          transactionDetails: {},
          transactionType: "poker",
          prevWallet: usersWalltAmt[i],
          updatedWallet: updatedWallet,
          prevTicket: userTickets[i],
          updatedTicket: updatedTicket,
          prevGoldCoin: prevGoinCoin,
          updatedGoldCoin: updatedGoldCoin,
        });
      }

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
    console.log("Error in createTransactionFromUsersArray", error);
  }
};

export const leaveApiCall = async (room, userId, io) => {
  try {
    let player;
    console.log("leave api call player length", room.players.length);
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

    let allUsers = player.concat(room.watchers);

    if (userId) {
      allUsers = allUsers.filter((ele) => {
        const elUserId = ele.id ? ele.id.toString() : ele.userid.toString();
        return elUserId === userId.toString();
      });
    }

    let users = [];
    allUsers.forEach((item) => {
      let hands = item.hands ? [...item.hands] : [];
      let uid = item.id ? item.id : item.userid;

      if (room.runninground !== 0 && room.runninground !== 5) {
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

    let updateTournament = [];
    // let returnUser
    if (room.tournament) {
      updateTournament.push(
        tournamentModel.updateOne(
          {
            _id: room.tournament,
            havePlayers: { $gt: 0 }, // Ensure havePlayers is greater than 0
            totalJoinPlayer: { $gt: 0 }, // Ensure totalJoinPlayer is greater than 0
          },
          {
            $inc: {
              havePlayers: -1,
              totalJoinPlayer: -1,
            },
          }
        )
      );
    }

    const [transactions, rankModelUpdate] =
      await createTransactionFromUsersArray(room._id, users, room.tournament);

    let tournament = null;
    if (room.tournament) {
      tournament = await tournamentModel
        .findOne({
          _id: room.tournament,
        })
        .populate("rooms");
    }

    const userBalancePromise = users.map(async (el) => {
      if (!room.tournament) {
        let totalTicketWon = 0;
        let totalLoose = 0;
        // console.log("user hand ===>", el.hands);
        el.hands.forEach((hand) => {
          if (hand.action === "game-win") {
            totalTicketWon += hand.amount;
          } else {
            totalLoose += hand.amount;
          }
        });
        totalTicketWon =
          totalTicketWon <= totalLoose ? 0 : totalTicketWon - totalLoose;
        // console.log("total tickets token", totalTicketWon);
        // const newBalnce = totalTicketWon//el.newBalance > 0 ? el.newBalance : 0;
        const crrntWallt = el.wallet - totalTicketWon;
        let query;
        if (room.gameMode === "goldCoin") {
          query = { goldCoin: el.wallet };
        } else {
          query = {
            wallet: room.gameType !== "poker-tournament" ? crrntWallt : 0,
            ticket: totalTicketWon,
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
          let updateData = await userModel.findOneAndUpdate(
            {
              _id: convertMongoId(el.uid),
            },
            {
              $inc: {
                wallet: tournament.tournamentFee,
              },
            },
            { new: true }
          );

          const { _id, username, email, firstName, lastName, profile } =
            updateData;
          try {
            io?.emit("leaveTournament", {
              message: "You leave the game.",
              code: 200,
              user: updateData || {},
            });
          } catch (error) {
            console.log("error in leaveTournament", error);
          }
          return transactionModel.create({
            userId: {
              _id,
              username,
              email,
              firstName,
              lastName,
              profile,
            },
            eleminatedPlayers: [],
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
        }
      }
    });

    const filterdHndWinnerData = room?.handWinner?.map((el) => {
      let filtrd = el.filter((obj) => obj.id.toString() !== userId.toString());
      return filtrd;
    });

    if (userId) {
      room.players = room.players.filter((pl) => pl.id !== userId);
      // console.log("pleayer after remvoe in leaveApiCall", room.players);
      room.watchers = room.watchers.filter((wt) => wt !== userId);
      room.handWinner = filterdHndWinnerData;
      let rrr = await getCachedGame(room._id);
      await setCachedGame({
        ...rrr,
        players: room.players,
        watchers: room.watchers,
        handWinner: filterdHndWinnerData,
      });
      const response = await Promise.allSettled([
        // Remove user from the room
        // Create transaction
        roomModel.updateOne(
          { _id: room._id },
          {
            players: room.players,
            handWinner: filterdHndWinnerData,
          }
        ),
        transactionModel.insertMany(transactions),
        // Update user wallet
        ...updateTournament,
        ...userBalancePromise,
        ...rankModelUpdate,
      ]);
      console.log(
        "leaveApiCALL FINAL RESPONSE:1"
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
        "leaveApiCALL FINAL RESPONSE:2"
        /* JSON.stringify(response.map((el) => el.value)), */
      );
    }

    return true;
  } catch (err) {
    console.log("Error in Leave APi call =>", err);
    return false;
  }
};

const joinAsWatcher = async (data, socket, io) => {
  try {
    console.log("join as watcher executed");
    const { gameId, userId } = data;
    const game = await getCachedGame(gameId);
    game.watchers.push(userId);
    await setCachedGame(game);
    await roomModel.updateOne(
      {
        _id: gameId,
      },
      { $push: { watchers: userId } },
      { new: true }
    );
    socket.emit("redirectToTableAsWatcher", { userId, gameId });
    socket.emit("newWatcherJoin", {
      watcherId: userId.toString(),
      roomData: game,
    });
    io.in(gameId).emit("updateGame", { game: game });
  } catch (err) {
    console.log("Error in joinAsWatcher", err);
  }
};

// NEW functions
export const checkForGameTable = async (data, socket, io) => {
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

    if (game.finish && game?.tournament === null) {
      return socket.emit("notFound", {
        message: "Game not found. Either game is finished or not exist",
      });
    }
    const { players, watchers } = game;
    if (watchers.find((el) => el?.toString() === userId?.toString())) {
      addUserInSocket(io, socket, gameId, userId);
      socket.join(gameId);
      socket.emit("newWatcherJoin", {
        watcherId: userId.toString(),
        roomData: game,
      });
      io.in(gameId.toString()).emit("updateGame", { game: game });
      return;
    }

    if (players.find((el) => el.userid?.toString() === userId.toString())) {
      addUserInSocket(io, socket, gameId, userId);
      socket.join(gameId);
      game.players.forEach((player) => {
        if (player.userid === userId) {
          player.playing = true;
        }
      });
      await setCachedGame(game);
      io.in(gameId).emit("updateGame", { game });
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

    const updatedRoom = await gameService.joinRoomByUserId(
      game,
      userId,
      sitInAmount,
      playerLimit
    );

    if (updatedRoom && Object.keys(updatedRoom).length > 0) {
      addUserInSocket(io, socket, gameId, userId);
      socket.join(gameId);

      // return;
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
      updatedGame = await gameService.getGameById(gameId);
      io.in(gameId).emit("updateGame", { game: updatedGame });
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
    let room = await getCachedGame(tableId);
    if (room) {
      const user = await userModel.findOne({ _id: userId });

      const { firstName, lastName, profile, username } = user || {};
      room.chats.push({
        message: message,
        userId: userId,
        firstName: firstName,
        lastName: lastName,
        username,
        profile,
        date: new Date().toLocaleTimeString(),
        seenBy: [],
      });
      await setCachedGame(room);
      await roomModel.updateOne(
        { _id: tableId },
        {
          chats: room.chats,
        }
      );

      io.in(tableId).emit("updateChat", { chat: room?.chats });
    } else {
      io.in(tableId).emit("updateChat", { chat: [] });
    }
  } catch (error) {
    console.log("Error in updateRoomChat", error);
  }
};

export const updateSeenBy = async (data, socket, io) => {
  try {
    const { userId, tableId } = data;
    let room = await getCachedGame(tableId);
    let filterdChats = room.chats.map((chat) => {
      if (chat.userId !== userId && chat.seenBy.indexOf(userId) < 0) {
        chat.seenBy.push(userId);
      }
      return chat;
    });
    // console.log(filterdChats);
    room.chats = filterdChats;
    await setCachedGame(room);
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

    const tournament = await tournamentModel.findOne({
      _id: tournamentId,
    });

    if (!tournament) {
      socket.emit("NoTournamentFound", {
        message: "No tournament found",
      });
    }
    let rooms = [];
    const {
      rooms: tournamentRooms = [],
      isStart,
      isFinished,
      joinTime,
      startDate,
      startTime,
    } = tournament;
    for await (let r of tournamentRooms) {
      rooms.push(await getCachedGame(r));
    }
    rooms = rooms.filter((room) => room);
    // console.log("tournamenttournament",tournament);

    let endDate = new Date(startDate + " " + startTime);

    endDate.setMinutes(endDate.getMinutes() + joinTime);

    let endTime = endDate.getTime();
    let crrTime = new Date().getTime();

    // if (crrTime > endTime && tournament.tournamentType !== "sit&go") {
    //   socket.emit("tournamentAlreadyStarted", {
    //     message: "Joining time has been exceeded",
    //     code: 400,
    //   });

    //   return;
    // }
    if (
      tournament.isStart &&
      tournament.tournamentType === "sit&go" &&
      userId
    ) {
      await joinAsWatcher(
        { gameId: tournament.rooms[0], userId: userId },
        socket,
        io
      );

      return;
    }

    if (isFinished) {
      return socket.emit("tournamentAlreadyFinished", {
        message: "Tournament Has been finished",
        code: 400,
      });
    }

    console.log("rooms ==>", rooms);

    if (
      rooms.find((room) =>
        room.players?.find(
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

    const userData = await User.findById(userId).lean();
    if (userData?.wallet < fees) {
      return socket.emit("notEnoughAmount", {
        message: "You do not have enough ST to join",
        code: 400,
      });
    }

    let roomWithSpace = rooms.find(
      (room) => room.players.length < playerLimit //&& !room.gamestart
    );
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

    const { _id, username, email, firstName, lastName, profile } = updatedUser;

    await transactionModel.create({
      userId: {
        _id,
        username,
        email,
        firstName,
        lastName,
        profile,
      },
      amount: -parseFloat(fees),
      transactionDetails: {},
      eleminatedPlayers: [],
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
    console.log("Error on JoinTournament", error);
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
    // const tournament = await tournamentModel.findOne({
    //   _id: tournamentId,
    // });
    // checkTournament = tournament;
    const { username, _id, avatar, profile } = userData;
    // let rooms = [];
    // for await (let r of checkTournament.rooms) {
    //   rooms.push(await getCachedGame(r));
    // }
    // rooms = rooms.filter((room) => room);
    // let roomWithSpace = rooms.find(
    //   (room) => room.players.length < playerLimit && !room.gamestart
    // );

    // room = roomWithSpace;

    let roomId;

    if (room) {
      room = await getCachedGame(room._id);
      roomId = room._id;
      let players = room.players;
      let leaveReq = room.leavereq;
      leaveReq = leaveReq.filter((uid) => _id.toString() !== uid.toString());

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
        autoFoldCount: 0,
        away: false,
      });

      const payload = {
        ...room,
        players,
        tournament: tournamentId,
        leavereq: leaveReq,
      };

      const updatedRoom = await roomModel
        .findOneAndUpdate({ _id: roomId }, payload, { new: true })
        .populate("tournament");
      // .populate("tournament");
      await setCachedGame(updatedRoom);
      const tournament = await tournamentModel
        .findOneAndUpdate(
          { _id: tournamentId },
          {
            $inc: {
              havePlayers: 1,
              totalJoinPlayer: 1,
              prizePool: checkTournament?.tournamentFee,
            },
          },
          { new: true }
        )
        .lean();
      // .populate("rooms");
      let rooms = [];
      for await (let r of tournament.rooms) {
        rooms.push(await getCachedGame(r));
      }

      tournament.rooms = rooms;

      if (
        tournament?.tournamentType === "sit&go" &&
        // tournament?.totalJoinPlayer === playerLimit &&
        tournament?.rooms.find((room) => room.players.length === playerLimit)
      ) {
        const updatedTournament = await tournamentModel
          .findOneAndUpdate(
            { _id: tournamentId },
            { isStart: true, totalJoinPlayer: 9 },
            {
              new: true,
            }
          )
          .populate("rooms");
        console.log("Tournament started");
        blindTimer(checkTournament, io);
        let timer = 10;
        io.emit("tournamentStart", { rooms: updatedTournament.rooms });
        const interval = setInterval(async () => {
          if (timer < 0) {
            clearInterval(interval);
            preflopround(
              tournament?.rooms.find(
                (room) => room.players.length === playerLimit
              ),
              io
            );
            const date = new Date().toISOString().split("T")[0];
            const time = `${new Date().getUTCHours()}:${new Date().getUTCMinutes()}:00`;
            await tournamentModel.findOneAndUpdate(
              { _id: tournamentId },
              {
                startDate: date,
                startTime: time,
              }
            );
          } else {
            io.in(roomId.toString()).emit("tournamentStarted", { time: timer });
            timer -= 1;
          }
        }, 1000);

        // return;
      }

      console.log("updatedRoom after joining player ==>", updatedRoom);
      if (
        tournament?.tournamentType !== "sit&go" &&
        tournament?.isStart &&
        updatedRoom?.players.length > 1 &&
        !updatedRoom.gamestart
      ) {
        console.log("started preflop round");
        preflopround(updatedRoom, io);
      }
    } else {
      // console.log("checkTournament ===>", checkTournament.actionTime);
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
            autoFoldCount: 0,
            away: false,
          },
        ],
        tournament: tournamentId,
        autoNextHand: true,
        smallBlind: smallBlind || 100,
        bigBlind: bigBlind || 200,
        gameType: "poker-tournament",
        timer: checkTournament.actionTime,
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
      const newRoom = await roomModel.findOne({ _id: roomId });
      // .populate("tournament");
      await setCachedGame(newRoom);
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
    console.log("timings ==>", date, time);
    const checkTournament = await tournamentModel
      .findOne({
        startDate: date,
        startTime: time,
        tournamentType: { $ne: "sit&go" },
      })
      .lean();

    if (checkTournament) {
      //preflopround()
      if (checkTournament?.isStart) {
        console.log("tournament already started true");
        return;
      }
      if (!checkTournament?.isStart) {
        await tournamentModel.updateOne(
          { _id: checkTournament?._id },
          { isStart: true }
        );
        blindTimer(checkTournament, io);
        if (checkTournament?.rooms?.length > 0) {
          console.log("Tournament started");

          let allRooms = [];
          for await (const r of checkTournament.rooms) {
            allRooms.push(await getCachedGame(r));
          }
          allRooms = allRooms.filter((room) => room);
          const updatedRooms = await reArrangementBeforeTournamentStart(
            allRooms,
            io,
            checkTournament._id
          );
          for (let room of updatedRooms) {
            console.log(
              "room with tournament inactivate tournament",
              room.tournament
            );
            preflopround(room, io);
          }
        }
      }
    }
    const getAllTournament = await tournamentModel.find({}).populate("rooms");
    io.emit("updatePlayerList", getAllTournament);
  } catch (error) {
    console.log("Error in activateTournament", error);
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

export const spectateMultiTable = async (data, io, socket) => {
  try {
    const { roomId, userId } = data;
    console.log("roomId ===>", roomId);
    const room = await getCachedGame(roomId);

    if (
      room.players.find((el) =>
        el.id ? el.id === userId : el.userid === userId
      )
    ) {
      // console.log("entered in first if", room);
      return io.in(roomId.toString()).emit("updateGame", { game: room });
    }
    if (room && userId) {
      await joinAsWatcher({ gameId: roomId, userId }, socket, io);
    }
  } catch (err) {
    console.log("error in spectateMultiTable", err);
  }
};

export const setAvailability = async (data, io, socket) => {
  try {
    console.log("data ==>", data);
    const { availability, userId, tableId } = data;
    const roomData = await getCachedGame(tableId);
    console.log("availablity hello ==>", data);

    console.log("room data running round==>", roomData.runninground);
    let availablerequest = roomData.availablerequest;
    if (roomData.gamestart) {
      availablerequest = availablerequest.filter(
        (el) => !el.userid.toString() === userId
      );
      availablerequest.push({
        userid: userId,
      });
      roomData.availablerequest = availablerequest;
      await setCachedGame(roomData);
      await roomModel.findOneAndUpdate(
        {
          _id: convertMongoId(tableId),
        },
        {
          availablerequest,
        },
        {
          new: true,
        }
      );
    } else {
      roomData.players.forEach((pl) => {
        if (pl.id === userId) {
          pl.away = availability;
          pl.autoFoldCount = 0;
        }
      });
      await setCachedGame(roomData);
      await roomModel.findOneAndUpdate(
        {
          _id: convertMongoId(tableId),
          "players.id": convertMongoId(userId),
        },
        {
          "players.$.away": availability,
          "players.$.autoFoldCount": 0,
        },
        {
          new: true,
        }
      );
    }

    socket.emit("availableinNextRound");
    io.in(tableId.toString()).emit("updateGame", { game: roomData });
  } catch (error) {
    console.log("error in setAvailability", error);
  }
};
