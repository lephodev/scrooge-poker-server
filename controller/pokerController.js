import mongoose from 'mongoose';
import User from '../landing-server/models/user.model.js';
import Message from '../models/messageModal.js';
import Notification from '../models/notificationModal.js';
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
    const {
      gameName,
      public: isPublic,
      minchips,
      maxchips,
      autohand,
      invitedUsers,
    } = req.body;
    const userData = req.user;
    const { username, wallet, email, _id, avatar } = userData;
    const timer = 15;

    const checkInGame = await gameService.checkIfUserInGame(userData._id);

    if (checkInGame) {
      return res.status(403).send({ message: 'You are already in a game.' });
    }

    console.log({ minchips });
    const invitetedPlayerUserId = invitedUsers.map((el) => el.value);
    const roomData = await roomModel.create({
      gameName,
      autoNextHand: autohand,
      invPlayers: invitetedPlayerUserId,
      public: isPublic,
      smallBlind: minchips,
      bigblind: maxchips,
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
    console.log(error);
    res.status(500).send({ message: 'Internal server error' });
  }
};

export const getAllGame = async (req, res) => {
  try {
    const getAllRunningRoom = await roomModel
      .find({ public: true })
      .populate('players.userid');
    return res.status(200).send({ rooms: getAllRunningRoom || [] });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: 'Internal server error' });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const allUsers = await User.find({
      _id: { $ne: req.user._id },
      isRegistrationComplete: true,
    }).select('_id username');

    console.log({ allUsers });

    return res.status(200).send({ allUsers });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: 'Internal server error' });
  }
};
