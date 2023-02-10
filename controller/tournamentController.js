import tournamentModel from "../models/tournament.js";
import User from "../landing-server/models/user.model.js";
import roomModel from "../models/room.js";
import mongoose from "mongoose";

var cron = require("node-cron");

// cron.schedule("* * * * *", () => {
//   activateTournament();
// });

const img =
  "https://i.pinimg.com/736x/06/d0/00/06d00052a36c6788ba5f9eeacb2c37c3.jpg";

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

export const enterRoom = async (req, res) => {
  try {
    const { _id } = req.user;
    const { tournamentId } = req.body;
    console.log("req.body", req.body);
    const data = await User.findOne(
      { _id: _id, "tournaments.tournamentId": tournamentId },
      {
        tournaments: 1,
      }
    );
    const getCurrentTournament = data.tournaments.filter(
      (el) => el.tournamentId === tournamentId
    );
    let p = JSON.parse(JSON.stringify(getCurrentTournament));
    let roomId = p[p.length - 1].roomId;
    res.send({ code: 200, roomId });
  } catch (e) {
    console.log("error", e);
    res.send({ status: 406, msg: "Some error has occured!" });
  }
};
