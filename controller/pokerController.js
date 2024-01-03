import mongoose from "mongoose";
import User from "../landing-server/models/user.model.js";
import Message from "../models/messageModal.js";
import Notification from "../models/notificationModal.js";
import gameService from "../service/game.service.js";
import roomModel from "./../models/room.js";
import userService from "../service/user.service.js";
import { getCachedGame, setCachedGame } from "../redis-cache/index.js";
// import { checkLimits } from "../functions/functions.js";

const convertMongoId = (id) => mongoose.Types.ObjectId(id);

const img =
  "https://i.pinimg.com/736x/06/d0/00/06d00052a36c6788ba5f9eeacb2c37c3.jpg";

export const getDocument = async (req, res) => {
  try {
    const { coll, id } = req.params;

    if (coll === "users" && id) {
      const userData = await User.findOne({ _id: mongoose.Types.ObjectId(id) });
      return res.status(200).send({ data: userData ?? {} });
    }

    return res.status(200).send({ data: {} });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Internal server error" });
  }
};

export const createTable = async (req, res, io) => {
  try {
    const {
      gameName,
      public: isPublic,
      minchips,
      maxchips,
      autohand,
      invitedUsers,
      sitInAmount,
      actionTime,
      gameMode,
    } = req.body;
    const userData = req.user;
    const { username, wallet, goldCoin, email, _id, avatar, profile, monthlyClaimBonus } =
      userData;
    const timer = actionTime;
    console.log("timer ==>", actionTime);

    const checkInGame = await gameService.checkIfUserInGame(userData._id);

    if (checkInGame) {
      return res.status(403).send({ message: "You are already in a game." });
    }

    if (!sitInAmount) {
      return res.status(403).send({ message: "Sit in amount is required" });
    }

    if (sitInAmount < 100) {
      return res
        .status(403)
        .send({ message: "Minimum 100 coins need for sit in amount" });
    }

    if (sitInAmount > wallet && gameMode === "token") {
      return res.status(403).send({ message: "You don't have enough token" });
    }
    if (sitInAmount > goldCoin && gameMode === "goldCoin") {
      return res
        .status(403)
        .send({ message: "You don't have enough gold coin" });
    }

    if(sitInAmount > (wallet - monthlyClaimBonus && gameMode !== "goldCoin")){
      return res
        .status(403)
        .send({ message: "You can only create with One Time Wager and Withdrawable amount" });
    }

    // const limit = await checkLimits(_id, gameMode, sitInAmount, userData);
    // console.log("limit ===>", limit);
    // if (!limit?.success) {
    //   return res.status(403).send({ message: limit?.message });
    // }

    // if (checkInGame) {
    //   return res.status(403).send({ message: "You are already in a game." });
    // }

    const bigBlind = minchips * 2;
    const invitetedPlayerUserId = invitedUsers.map((el) => el.value);
    const roomData = await roomModel.create({
      gameName,
      gameType: "poker",
      gameMode: gameMode,
      autoNextHand: autohand,
      invPlayers: invitetedPlayerUserId,
      public: isPublic,
      smallBlind: minchips,
      bigBlind,
      timer,
      hostId: userData._id,
      players: [
        {
          name: username,
          userid: _id.toString(),
          id: _id.toString(),
          photoURI: avatar ? avatar : profile ? profile : img,
          wallet: sitInAmount,
          position: 0,
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
      ],
    });
    const getAllRunningRoom = await roomModel
      .find({ public: true, finish: false, gameType: "poker" })
      .populate("players.userid");
    io.emit("AllTables", { tables: getAllRunningRoom });
    let walletAmount;
    let query;
    if (gameMode === "goldCoin") {
      walletAmount = goldCoin - sitInAmount;
      query = { goldCoin: walletAmount };
    } else {
      walletAmount = wallet - sitInAmount;
      query = { wallet: walletAmount };
    }
    await userService.updateUserWallet(_id, query);
    // await User.updateOne({ _id }, { wallet: wallet - sitInAmount });

    if (Array.isArray(invitetedPlayerUserId) && invitetedPlayerUserId.length) {
      const sendMessageToInvitedUsers = [
        ...invitetedPlayerUserId.map((el) => {
          return {
            sender: _id,
            receiver: el,
            message: `<a href='${process.env.CLIENTURL}/table?tableid=${roomData._id}&gamecollection=poker#/'>Click here</a> to play poker with me.`,
          };
        }),
      ];

      const sendNotificationToInvitedUsers = [
        ...invitetedPlayerUserId.map((el) => {
          return {
            sender: _id,
            receiver: el,
            message: `has invited you to play poker.`,
            url: `${process.env.CLIENTURL}/table?tableid=${roomData._id}&gamecollection=poker#/`,
          };
        }),
      ];

      await Message.insertMany(sendMessageToInvitedUsers);
      await Notification.insertMany(sendNotificationToInvitedUsers);
    }

    res.status(200).send({ roomData });
  } catch (error) {
    console.log("Eroor In create Table", error);
    res.status(500).send({ message: "Internal server error" });
  }
};

export const getAllGame = async (req, res) => {
  try {
    const getAllRunningRoom = await roomModel
      .find({ finish: false, public: true, gameType: "poker" })
      .populate("players.userid");
    return res.status(200).send({ rooms: getAllRunningRoom || [] });
  } catch (error) {
    console.log("error in Get All Game", error);
    res.status(500).send({ message: "Internal server error" });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const allUsers = await User.find({
      _id: { $ne: req.user._id },
    }).select("_id username");

    return res.status(200).send({ allUsers });
  } catch (error) {
    console.log("error in Get All user", error);
    res.status(500).send({ message: "Internal server error" });
  }
};

export const checkIfUserInTable = async (req, res) => {
  try {
    const user = req.user;
    const tableId = req.params.tableId;
    const checkTable = await roomModel.findOne({
      _id: mongoose.Types.ObjectId(tableId),
      "players.userid": mongoose.Types.ObjectId(user._id),
    });
    if (!checkTable) {
      return res.status(200).send({ inTable: false });
    }

    return res.status(200).send({ inTable: true, players: checkTable.players });
  } catch (error) {
    console.log("error in checkIfUserInTable", error);
    res.status(500).send({ message: "Internal server error" });
  }
};

export const getTablePlayers = async (req, res) => {
  try {
    const user = req.user;
    const tableId = req.params.tableId;

    const roomData = await roomModel.find({
      _id: mongoose.Types.ObjectId(tableId),
      "players.id": userid,
    });
    if (!roomData) {
      return res.status(403).send({ message: "Room not found" });
    }

    res.status(200).send({ players: roomData.players });
  } catch (error) {
    console.log("getTablePlayers", error);

    res.status(500).send({ message: "Internal server error" });
  }
};

// export const refillWallet = async (req, res) => {
//   try {
//     const user = req.user;
//     let { tableId, amount } = req.body;
//     console.log("req.bod", req.body, user);
//     // console.log("req.bod", parseInt(req.body.amount));

//     if (!tableId || !amount) {
//       return res.status(403).send({ msg: "Invalid data" });
//     }

//     amount = parseInt(amount);

//     if (amount > user.wallet) {
//       return res
//         .status(403)
//         .send({ msg: "You dont have balance in your wallet" });
//     }

//     await roomModel.updateOne(
//       {
//         $and: [
//           { _id: tableId },
//           { players: { $elemMatch: { id: mongoose.Types.ObjectId(user.id) } } },
//         ],
//       },
//       {
//         $inc: {
//           "players.$.wallet": amount,
//           // "players.$.initialCoinBeforeStart": 100,
//         },
//       }
//     );

//     const roomData = await roomModel.findOne({
//       $and: [
//         { _id: tableId },
//         {
//           players: { $elemMatch: { userid: mongoose.Types.ObjectId(user.id) } },
//         },
//       ],
//     });

//     // if (roomData) {
//     //   io.in(tableId).emit("updateRoom", roomData);
//     // }

//     console.log({ roomData });

//     await User.updateOne(
//       { _id: mongoose.Types.ObjectId(user.id) },
//       { $inc: { wallet: -amount } }
//     );

//     res.status(200).send({ msg: "Success", roomData });
//   } catch (error) {
//     console.log("error", error);
//     res.status(500).send({ msg: "Internel server error" });
//     console.log(error);
//   }
// };

export const refillWallet = async (data, io, socket) => {
  process.nextTick(async () => {
    try {
      const verification = await gameService.tokenVerificationForSocket(
        socket?.handshake
      );
      if (!verification?.userId) {
        return socket.emit("notEnoughAmount", {
          message: "Your not loggedIn!",
          code: 400,
        });
      }
      let { tableId, amount, username } = data;
      const userid = verification?.userId;
      const gameMode = verification?.gameMode;
      amount = parseInt(amount);
      if (!gameMode) {
        return socket.emit("notEnoughAmount", {
          message: "Please select game mode.",
          code: 400,
        });
      }
      const user = await User.findOne({
        _id: userid,
      });
      if (parseInt(amount) < 100) {
        return socket.emit("notEnoughAmount", {
          message: "Minimum amount to enter is 100.",
          code: 400,
        });
      }
      if (parseFloat(amount) > user?.wallet && gameMode === "token") {
        return socket.emit("notEnoughAmount", {
          message: "You don't have enough token.",
          code: 400,
        });
      }
      if (parseFloat(amount) > user?.goldCoin && gameMode === "goldCoin") {
        return socket.emit("notEnoughAmount", {
          message: "You don't have enough gold coin.",
          code: 400,
        });
      }
      let room = await getCachedGame(tableId);
      if (!room)
        room = await roomModel.findOne({
          _id: tableId,
        });

      if (room != null) {
        const playerExist = room.players.filter(
          (el) => el.userid.toString() === userid.toString()
        );

        let totalHandsSpend = 0;
        playerExist[0].hands.forEach((el) => {
          if (el.action === "game-lose") {
            totalHandsSpend += el?.amount;
          }
        });

        console.log(
          "aount =====================>",
          amount,
          playerExist[0].wallet,
          totalHandsSpend,
          amount + playerExist[0].wallet + totalHandsSpend
        );

        // const limit = await checkLimits(
        //   userid.toString(),
        //   room.gameMode,
        //   amount + playerExist[0].wallet + totalHandsSpend,
        //   user
        // );
        // console.log("limit ===>", limit);
        // if (!limit?.success) {
        //   return socket.emit("spendingLimitExceeds", {
        //     message: limit?.message,
        //     from: "refillWallet",
        //   });
        // }

        if (!room.isGameRunning) {
          room.players.forEach((pl) => {
            if (pl.id === userid) {
              pl.wallet += amount;
              pl.initialCoinBeforeStart += amount;
            }
          });
          await setCachedGame(room);
          roomModel.updateOne(
            {
              $and: [
                { _id: tableId },
                {
                  players: {
                    $elemMatch: { id: mongoose.Types.ObjectId(userid) },
                  },
                },
              ],
            },
            {
              $inc: {
                "players.$.wallet": amount,
                "players.$.initialCoinBeforeStart": amount,
              },
            }
          );

          // const roomData = await roomModel.findOne({
          //   $and: [
          //     { _id: tableId },
          //     {
          //       players: {
          //         $elemMatch: { userid: mongoose.Types.ObjectId(userid) },
          //       },
          //     },
          //   ],
          // });
          let query;
          if (room.gameMode === "goldCoin") {
            query = { goldCoin: -amount };
          } else {
            query = { wallet: -amount };
          }
          await User.updateOne(
            { _id: mongoose.Types.ObjectId(userid) },
            { $inc: query }
          );
          if (room) {
            socket.emit("updateRoom", room);
          }
        }
        if (playerExist?.length && room.isGameRunning) {
          let buyinrequest = room.buyin;
          let buyin = {
            userid: userid,
            name: username,
            wallet: amount,
            redeem: 0,
          };
          buyinrequest.push(buyin);
          room.buyin = buyinrequest;
          await setCachedGame(room);
          roomModel.findByIdAndUpdate(room._id, {
            buyin: buyinrequest,
          });
          let query;
          if (room.gameMode === "goldCoin") {
            query = { goldCoin: -amount };
          } else {
            query = { wallet: -amount };
          }
          await User.updateOne(
            { _id: mongoose.Types.ObjectId(userid) },
            { $inc: query }
          );
          socket.emit("InrunningGame");
        }
      }
    } catch (error) {
      console.log("error in  refillWallet", error);
    }
  });
};
