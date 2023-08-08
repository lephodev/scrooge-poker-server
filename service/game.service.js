import roomModel from "../models/room.js";
import userService from "./user.service.js";
import mongoose from "mongoose";
import blackjackRoom from "./../models/blackjackRoom.js";
import tournamentModel from "../models/tournament.js";
import smsService from "./sms.service.js";
import moment from "moment";
import Notification from "../models/notificationModal.js";
import { verifyJwt } from "../functions/functions.js";
import { decryptPass } from "../validation/poker.validation.js";

const converMongoId = (id) => mongoose.Types.ObjectId(id);
const maxPlayer = 9;
const img =
  "https://i.pinimg.com/736x/06/d0/00/06d00052a36c6788ba5f9eeacb2c37c3.jpg";

const getGameById = async (id) => {
  const game = await roomModel.findOne({ _id: converMongoId(id) }).lean();
  if (game) return { ...game, id: game._id };
  return null;
};

const findAvailablePosition = async (playerList) => {
  return new Promise((resolve, reject) => {
    try {
      let i = 0;
      let isFound = false;
      while (i < maxPlayer && !isFound) {
        // eslint-disable-next-line no-loop-func
        const have = playerList.filter((el) => el.position === i);
        if (!have.length) {
          isFound = true;
          resolve({ i, isFound });
        }
        i += 1;
      }
      // eslint-disable-next-line prefer-promise-reject-errors
      reject({ isFound: false });
    } catch (error) {
      // eslint-disable-next-line prefer-promise-reject-errors
      reject({ isFound: false });
    }
  });
};

const pushUserInRoom = async (game, userId, position, sitInAmount, type) => {
  try {
    const userData = await userService.getUserById(userId);
    const { username, wallet, email, _id, avatar, profile } = userData;

    let hostId = null;
    console.log("type ===>", type);
    console.log("game?.hostId ===>", game?.hostId);

    if (!game?.hostId || type === 1) {
      hostId = _id;
    } else {
      hostId = game?.hostId;
    }

    console.log("hostId ========>", hostId);

    await Promise.allSettled([
      // userService.updateUserWallet(_id),
      roomModel.updateOne(
        { _id: game._id },
        {
          $push: {
            players: {
              name: username,
              userid: _id,
              id: _id,
              photoURI: avatar ? avatar : profile ? profile : img,
              wallet: sitInAmount,
              position,
              missedSmallBlind: false,
              missedBigBlind: false,
              forceBigBlind: false,
              playing: true,
              initialCoinBeforeStart: sitInAmount,
              gameJoinedAt: new Date(),
              hands: [],
              away: false,
              autoFoldCount: 0,
            },
          },
          hostId,
          $pull: {
            leavereq: converMongoId(userId),
          },
        }
      ),
    ]);

    const room = await getGameById(game._id);
    return room;
  } catch (error) {
    console.log(error);
    return null;
  }
};

const joinRoomByUserId = async (game, userId, sitInAmount, playerLimit) => {
  // if public table -
  // check empty slot for table else return slot full,
  // join user in game if there is empty slot
  console.log("join room  by user id executed===>");
  if (game.public && game.players.length < playerLimit) {
    const availblePosition = await findAvailablePosition(game.players);
    if (!availblePosition.isFound) {
      return null;
    }
    const Type = game.players.length === 0 ? 1 : 2;
    const room = pushUserInRoom(
      game,
      userId,
      availblePosition.i,
      sitInAmount,
      Type
    );
    return room;
    // else check invite array for private tables
    // join user in game if there is empty slot else return slot full
  } else if (
    game.invPlayers.find((uId) => uId.toString() === userId.toString()) &&
    game.players.length < playerLimit
  ) {
    const availblePosition = await findAvailablePosition(game.players);
    if (!availblePosition.isFound) {
      return null;
    }
    const Type = game.players.length === 0 ? 1 : 2;
    const room = pushUserInRoom(
      game,
      userId,
      availblePosition.i,
      sitInAmount,
      Type
    );

    return room;
  } else if (game.public && game.players.length >= playerLimit) {
    return null;
  } else {
    return null;
  }
};

// leave roomId empty if you want exclude any room to come in search
// Because in check game function we want to exclude it from there
const checkIfUserInGame = async (userId, roomId = "", gameMode) => {
  try {
    let query = {
      gameType: "poker",
      gameMode: gameMode,
      "players.userid": converMongoId(userId),
    };
    if (roomId) {
      query["_id"] = { $ne: converMongoId(roomId) };
    }
    const checkRoom = await roomModel.findOne(query);
    if (checkRoom) {
      return true;
    }
    return false;
  } catch (error) {
    console.log(error);
    return true;
  }
};

const playerTentativeActionSelection = async (game, userId, actionType) => {
  try {
    const { runninground, id } = game;

    switch (runninground) {
      case 1:
        await roomModel.updateOne(
          { _id: id, "preflopround.id": mongoose.Types.ObjectId(userId) },
          { "preflopround.$.tentativeAction": actionType }
        );
        break;
      case 2:
        await roomModel.updateOne(
          { _id: id, "flopround.id": mongoose.Types.ObjectId(userId) },
          { "flopround.$.tentativeAction": actionType }
        );
        break;
      case 3:
        await roomModel.updateOne(
          { _id: id, "turnround.id": mongoose.Types.ObjectId(userId) },
          { "turnround.$.tentativeAction": actionType }
        );
        break;
      case 4:
        await roomModel.updateOne(
          { _id: id, "riverround.id": mongoose.Types.ObjectId(userId) },
          { "riverround.$.tentativeAction": actionType }
        );
        break;
      default:
        return "";
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log("Error in playerTentativeActionSelection", error);
  }
};
const subSubtractTimeForSendMail = (tournamentDate, startDate) => {
  const currentDate = new Date().toISOString().split("T")[0];
  const oldTime = new Date(tournamentDate);
  const newTime = oldTime.setUTCMinutes(oldTime.getUTCMinutes() - 2);
  const beforeTime = `${new Date(newTime).getUTCHours()}:${new Date(
    newTime
  ).getUTCMinutes()}:00`;
  const currentTime = `${new Date().getUTCHours()}:${new Date().getUTCMinutes()}:00`;
  return currentDate === startDate && beforeTime === currentTime;
};
const findRoom = (rooms) => {
  let data = [];
  let roomId;
  rooms.map((el) => {
    data = [...el.players];
    roomId = el._id;
  });
  return { players: data, roomId };
};
const sendAcknowledgementForJoinTournament = async (io) => {
  try {
    const findTournament = await tournamentModel
      .find({})
      .populate({
        path: "rooms",
      })
      .exec();
    if (findTournament?.length > 0) {
      findTournament.forEach(async (el) => {
        const matched = subSubtractTimeForSendMail(
          el.tournamentDate,
          el.startDate
        );
        if (matched) {
          await tournamentModel.updateOne(
            { _id: el._id },
            { showButton: true },
            { new: true }
          );
          io.emit("tournamentUpdate", { updateTournament: true });
          const room = findRoom(el.rooms);
          const { players, roomId } = room;
          if (players && players?.length > 0) {
            players.forEach(async (player) => {
              const payload = {
                sender: player.userid,
                receiver: player.userid,
                message: "Poker tournament start in 2 minutes",
                url: `${process.env.CLIENTURL}/table?gamecollection=poker&tableid=${roomId}`,
              };

              await Notification.create(payload);
            });
          }
        }
      });
    }
    return;
  } catch (err) {
    console.log("Error in send acknowledge--->", err);
  }
};
const tokenVerificationForSocket = async (headerData) => {
  try {
    let token = "";
    let mode = "";
    const cookieData = headerData?.headers?.cookie;
    const cookieDetails = cookieData?.split(";");
    cookieData &&
      cookieDetails?.length > 0 &&
      cookieDetails?.forEach((el) => {
        if (el.includes("token=")) {
          token = el;
        }
        if (el.includes("mode=")) {
          mode = el;
        }
      });
    const tokenForVerify = token?.split("token=")[1];
    let decryptedToken = decryptPass(tokenForVerify);
    const verify = await verifyJwt(decryptedToken);
    return { userId: verify?.sub, gameMode: mode?.split("mode=")[1] };
  } catch (err) {
    console.log("Error-->", err);
  }
};

const checkJoinTimeExceeded = async (io) => {
  try {
    const allTournaments = await tournamentModel.find({
      isStart: true,
      tournamentType: "Multi-Table",
      joinTimeExceeded: false,
    });
    console.log("all tournaments :", allTournaments);
    if (allTournaments.length) {
      console.log("tournament alllllllllllllll");
      for await (const tournament of allTournaments) {
        // console.log("joinTimejoinTime", joinTime);
        const { startDate, startTime, joinTime } = tournament;
        let endDate = new Date(startDate + " " + startTime);
        console.log("endDate", endDate, startDate + " " + startTime, joinTime);
        endDate.setMinutes(endDate.getMinutes() + joinTime);
        console.log("endDate", endDate);
        let endTime = endDate.getTime();
        let crrTime = new Date().getTime();
        console.log("endTime==>", endTime, "crrTime===>>", crrTime);
        if (crrTime > endTime) {
          await tournamentModel.updateOne(
            {
              _id: converMongoId(tournament._id),
            },
            {
              joinTimeExceeded: true,
            }
          );
        }
      }
      const allUpdatedTournaments = await tournamentModel
        .find({})
        .populate("rooms");
      io.emit("allTournaments", { tournaments: allUpdatedTournaments });
    }
  } catch (err) {
    console.log("error in checkJoinTimeExceeded ==>", err);
  }
};

const gameService = {
  getGameById,
  joinRoomByUserId,
  checkIfUserInGame,
  playerTentativeActionSelection,
  sendAcknowledgementForJoinTournament,
  tokenVerificationForSocket,
  checkJoinTimeExceeded,
};

export default gameService;
