import mongoose from 'mongoose';
import User from '../landing-server/models/user.model.js';
import gameService from '../service/game.service.js';
import roomModel from './../models/room.js';

const img =
  'https://i.pinimg.com/736x/06/d0/00/06d00052a36c6788ba5f9eeacb2c37c3.jpg';

export const getDocument = async (req, res) => {
  try {
    const { coll, id } = req.params;

    if (coll === 'users' && id) {
      const userData = await User.findOne({ _id: mongoose.Types.ObjectId(id) });
      return res.status(200).send({ data: userData ?? {} });
    }

    return res.status(200).send({ data: {} });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: 'Internal server error' });
  }
};

export const createTable = async (req, res) => {
  try {
    const { gameName, public: isPublic, minchips } = req.body;
    const userData = req.user;
    const { username, wallet, email, _id, avatar } = userData;
    const timer = 15;

    const checkInGame = await gameService.checkIfUserInGame(userData._id);

    if (checkInGame) {
      return res.status(403).send({ message: 'You are already in a game.' });
    }

    console.log({ minchips });

    const roomData = await roomModel.create({
      gameName,
      public: isPublic,
      smallBlind: minchips / 2,
      bigblind: minchips,
      timer,
      hostId: userData._id,
      players: [
        {
          name: username,
          userid: _id,
          id: _id,
          photoURI: avatar || img,
          wallet: wallet,
          position: 0,
          missedSmallBlind: false,
          missedBigBlind: false,
          forceBigBlind: false,
          playing: true,
          initialCoinBeforeStart: wallet,
          gameJoinedAt: new Date(),
          hands: [],
        },
      ],
    });

    res.status(200).send({ roomData });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error' });
  }
};

export const getAllGame = async (req, res) => {
  try {
    const getAllRunningRoom = await roomModel
      .find({})
      .populate('players.userid');
    return res.status(200).send({ rooms: getAllRunningRoom || [] });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: 'Internal server error' });
  }
};
