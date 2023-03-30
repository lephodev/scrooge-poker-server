import mongoose from "mongoose";
import User from "../landing-server/models/user.model.js";
import Message from "../models/messageModal.js";
import Notification from "../models/notificationModal.js";
import gameService from "../service/game.service.js";
import roomModel from "./../models/room.js";

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
    } = req.body;
    const userData = req.user;
    const { username, wallet, email, _id, avatar, profile } = userData;
    const timer = 15;

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

    if (sitInAmount > wallet) {
      return res.status(403).send({ message: "You don't have enough balance" });
    }

    // if (checkInGame) {
    //   return res.status(403).send({ message: "You are already in a game." });
    // }

    const bigBlind = minchips * 2;
    const invitetedPlayerUserId = invitedUsers.map((el) => el.value);
    const roomData = await roomModel.create({
      gameName,
      gameType: "poker",
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
          userid: _id,
          id: _id,
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
        },
      ],
    });
    const getAllRunningRoom = await roomModel
      .find({ public: true })
      .populate("players.userid");
    io.emit("AllTables", { tables: getAllRunningRoom });
    await User.updateOne({ _id }, { wallet: wallet - sitInAmount });

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
      .find({ public: true })
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
      let { tableId, amount, userid, username } = data;
      amount = parseInt(amount);
      let room = await roomModel.findOne({
        _id: tableId,
      });

      if (room != null) {
        const playerExist = room.players.filter(
          (el) =>
            mongoose.Types.ObjectId(el.userid).toString() === userid.toString()
        );
        if (!room.isGameRunning) {
          await roomModel.updateOne(
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

          const roomData = await roomModel.findOne({
            $and: [
              { _id: tableId },
              {
                players: {
                  $elemMatch: { userid: mongoose.Types.ObjectId(userid) },
                },
              },
            ],
          });
          await User.updateOne(
            { _id: mongoose.Types.ObjectId(userid) },
            { $inc: { wallet: -amount } }
          );
          if (roomData) {
            socket.emit("updateRoom", roomData);
          }
        }
        if (playerExist?.length && room.isGameRunning) {
          let buyinrequest = room.buyinrequest;
          let buyin = {
            userid: userid,
            name: username,
            wallet: amount,
            redeem: 0,
          };
          buyinrequest.push(buyin);

          await roomModel.findByIdAndUpdate(room._id, {
            buyin: buyinrequest,
          });

          await User.updateOne(
            { _id: mongoose.Types.ObjectId(userid) },
            { $inc: { wallet: -amount } }
          );
          socket.emit("InrunningGame");
        }
      }
    } catch (error) {
      console.log("error in  refillWallet", error);
    }
  });
};
