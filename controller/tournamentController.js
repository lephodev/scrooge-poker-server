import tournamentModel from "../models/tournament.js";
import User from "../landing-server/models/user.model.js";
import roomModel from "../models/room.js";
import mongoose from "mongoose";
import { JoinTournament } from "../functions/functions.js";

var cron = require("node-cron");
const img =
  "https://i.pinimg.com/736x/06/d0/00/06d00052a36c6788ba5f9eeacb2c37c3.jpg";

export const getAllGame = async (req, res) => {
  try {
    const getAllTournament = await tournamentModel.find({}).populate("rooms");
    return res.status(200).send({ tournaments: getAllTournament || [] });
  } catch (error) {
    console.log("getAllGame", error);
    return res.status(500).send({ message: "Internal server error" });
  }
};
//this API to show the data on the leader board page
export const getTournamentById=async(req,res)=>{
  try{
   const {tournamentId}=req.query
   if(tournamentId){
    const tournament=await tournamentModel.findOne({_id:tournamentId}).populate("rooms").populate({
      path:"winPlayer.first.userId",
      model:'User'
    }).populate({
      path:"winPlayer.second.userId",
      model:'User'
    }).populate({
      path:"winPlayer.third.userId",
      model:'User'
    }).populate({
      path:"winPlayer.4-10.userIds",
      model:'User'
    }).populate({
      path:"winPlayer.11-25.userIds",
      model:'User'
    });
    if(tournament){
      return res.status(200).send({ tournament: tournament || {} });
    }
    return res.status(404).send({message:"Tournament not found"})
   }
  }catch(err){
    return res.status(500).send({ message: "Internal server error" });
  }
}
export const jointournament = async (req, res) => {
  try {
    const { _id } = req.user;
    const { tournamentId } = req.body;
    await JoinTournament({ userId: _id, tournamentId });
  } catch (error) {
    console.log("eroor in jointournament", error);
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
    console.log("error in enterRoom", e);
    res.send({ status: 406, msg: "Some error has occured!" });
  }
};
