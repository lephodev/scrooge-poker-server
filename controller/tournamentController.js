import tournamentModel from "../models/tournament.js";
import User from "../landing-server/models/user.model.js";
import roomModel from "../models/room.js";
import mongoose from "mongoose";

export const getAllGame = async (req, res) => {
  try {
    const getAllTournament = await tournamentModel.find({}).populate("rooms");
    // console.log("getAllTournament", getAllTournament);
    return res.status(200).send({ tournaments: getAllTournament || [] });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Internal server error" });
  }
};

export const JoinTournament = async (req, res) => {
  try {
    // console.log("Body", req.body);
    const { _id } = req.user;
    const { tournamentId } = req.body;
    const userData = await User.findById(_id).lean();
    // console.log("userData", userData);
    const checkTable = await roomModel.findOne({
      tournament: mongoose.Types.ObjectId(tournamentId),
      "players.id": mongoose.Types.ObjectId(_id),
    });

    console.log("checkTable", checkTable);
    if (!checkTable) {
      await Tournament(_id, tournamentId);
      res.send({
        status: 200,
        msg: "You have successfully joined upcoming tournament.",
      });
    } else {
      res.send({
        status: 400,
        msg: "You are already in tournament.",
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Internal server error" });
  }
};

const Tournament = async (userId, tournamentId) => {
  const userData = await User.findById(userId).lean();
  let checkTournament = await tournamentModel
    .findOne({ _id: tournamentId })
    .lean();
  if (checkTournament) {
    if (checkTournament.havePlayers < 10000) {
      await pushPlayerInRoom(checkTournament, userData, tournamentId);
    }
  }
};

const pushPlayerInRoom = async (checkTournament, userData, tournamentId) => {
  // console.log("checkTournamentin PushPlayer", checkTournament);
  let roomId;
  const { username, wallet, _id, avatar, profile } = userData;
  let lastRoom = null;
  if (checkTournament?.rooms?.length) {
    lastRoom = await roomModel
      .findById(checkTournament.rooms[checkTournament.rooms.length - 1])
      .lean();
  }
  if (checkTournament?.rooms?.length && lastRoom?.players?.length < 10) {
    console.log("push player to ==>", lastRoom._id);
    roomId = lastRoom._id;
    let players = lastRoom.players;
    players.push({
      name: username,
      userid: _id,
      id: _id,
      photoURI: avatar ? avatar : profile ? profile : img,
      wallet: wallet,
      position: players.length,
      missedSmallBlind: false,
      missedBigBlind: false,
      forceBigBlind: false,
      playing: true,
      initialCoinBeforeStart: 100,
      gameJoinedAt: new Date(),
      hands: [],

      // timebank: tournamentconfig.emergencyTimer,
    });

    const payload = {
      players: players,
      tournament: tournamentId,
    };

    const updatedRoom = await roomModel.findOneAndUpdate(
      { _id: roomId },
      payload,
      { new: true }
    );
    console.log("updatedRoom", updatedRoom);
    const updatedTournament = await tournamentModel.findOneAndUpdate(
      { _id: tournamentId },
      { $inc: { havePlayers: 1 } },
      { new: true }
    );
    console.log("updatedTournament", updatedTournament);
    const updatedUser = await User.findOneAndUpdate(
      { _id: userData._id },
      { $push: { tournaments: { tournamentId, roomId } } },
      { upsert: true, new: true }
    );
    console.log("updatedUser", updatedUser);
  } else {
    console.log("create new Room");
    const payload = {
      players: [
        {
          name: username,
          userid: _id,
          id: _id,
          photoURI: avatar ? avatar : profile ? profile : img,
          wallet: wallet,
          position: 0,
          missedSmallBlind: false,
          missedBigBlind: false,
          forceBigBlind: false,
          playing: true,
          initialCoinBeforeStart: 100,
          gameJoinedAt: new Date(),
          hands: [],
        },
      ],
      tournament: tournamentId,
    };

    console.log("payload", payload);
    const roomData = new roomModel(payload);
    const savedroom = await roomData.save();
    roomId = savedroom._id;

    const updatedTournament = await tournamentModel.findOneAndUpdate(
      { _id: tournamentId },
      { $inc: { havePlayers: 1 }, $push: { rooms: roomId } },
      { upsert: true, new: true }
    );
    console.log("updatedTournament", updatedTournament);
    const updatedUser = await User.findOneAndUpdate(
      { _id: userData._id },
      { $push: { tournaments: { tournamentId, roomId } } },
      { upsert: true, new: true }
    );
    console.log("updatedUser", updatedUser);
  }
};
