import {
  checkForGameTable,
  socketDoFold,
  socketDoCall,
  socketDoBet,
  socketDoRaise,
  socketDoCheck,
  socketDoAllin,
  doPauseGame,
  doFinishGame,
  doResumeGame,
  doSitOut,
  doSitIn,
  doLeaveTable,
  checkRoomForConnectedUser,
  joinRequest,
  joinWatcherRequest,
  approveJoinRequest,
  rejectJoinRequest,
  startPreflopRound,
  handleNewBet,
  acceptBet,
  addBuyIn,
  leaveAndJoinWatcher,
  InvitePlayers,
  doLeaveWatcher,
} from '../functions/functions';
import mongoose from 'mongoose';
import roomModel from '../models/room';

const convertMongoId = (id) => mongoose.Types.ObjectId(id);

let returnSocket = (io) => {
  const users = {};

  const socketToRoom = {};
  io.users = [];
  io.room = [];
  io.on('connection', async (socket) => {
    try {
      console.log('One user Connected');
    } catch (e) {
      console.log('error in connect block', e);
    }

    socket.on('room', (roomData) => {
      console.log('inside room socket ', roomData);
      console.log('join socket roomData ==>', roomData);
      console.log('room connected', typeof roomData.roomid, roomData.roomid);
      socket.join(roomData.roomid);

      socket.emit('welcome', { msg: 'hello welcome to socket.io' });
    });

    socket.on('checkTable', async (data) => {
      console.log('---------------CHECK TABLE-------------------', { data });
      try {
        await checkForGameTable(data, socket, io);
      } catch (err) {
        console.log('Error in checkTable =>', err.message);
      }
    });
    socket.on('joinGame', async (data) => {
      await joinRequest(data, socket, io);
    });

    socket.on('leaveWatcherJoinPlayer', async (data) => {
      await doLeaveWatcher(data, io, socket);
      await joinRequest(data, socket, io);
    });

    socket.on('joinWatcher', async (data) => {
      await joinWatcherRequest(data, socket, io);
    });

    socket.on('newBet', async (data) => {
      await handleNewBet(data, socket, io);
    });

    socket.on('acceptBet', async (data) => {
      await acceptBet(data, socket, io);
    });

    socket.on('approveRequest', async (data) => {
      await approveJoinRequest(data, socket, io);
    });

    socket.on('cancelRequest', async (data) => {
      await rejectJoinRequest(data, socket, io);
    });

    socket.on('startPreflopRound', async (data) => {
      console.log('startPreflopRound - ', { data });
      await startPreflopRound(data, socket, io);
    });

    socket.on('dofold', async (data) => {
      let room = await roomModel.findOne({
        _id: convertMongoId(data.roomid),
      });
      data.roomid = room._id;
      await socketDoFold(data, io, socket);
    });

    socket.on('docall', async (data) => {
      let room = await roomModel.findOne({
        _id: data.roomid,
      });
      data.roomid = room._id;
      await socketDoCall(data, io, socket);
    });

    socket.on('dobet', async (data) => {
      let room = await roomModel.findOne({
        _id: convertMongoId(data.roomid),
      });
      data.roomid = room._id;
      await socketDoBet(data, io, socket);
    });

    socket.on('doraise', async (data) => {
      let room = await roomModel.findOne({
        _id: data.roomid,
      });
      data.roomid = room._id;
      await socketDoRaise(data, io, socket);
    });

    socket.on('docheck', async (data) => {
      let room = await roomModel.findOne({
        _id: convertMongoId(data.roomid),
      });
      data.roomid = room._id;
      await socketDoCheck(data, io, socket);
    });

    socket.on('doallin', async (data) => {
      console.log('INSIDE ALL IN');
      let room = await roomModel.findOne({
        _id: data.roomid,
      });
      data.roomid = room._id;
      await socketDoAllin(data, io, socket);
    });

    socket.on('dopausegame', async (data) => {
      let room = await roomModel.findOne({
        _id: data.roomid,
      });
      data.roomid = room._id;
      await doPauseGame(data, io, socket);
    });

    socket.on('dofinishgame', async (data) => {
      let room = await roomModel.findOne({
        _id: convertMongoId(data.roomid),
      });
      data.roomid = room._id;
      await doFinishGame(data, io, socket);
    });

    socket.on('doresumegame', async (data) => {
      let room = await roomModel.findOne({
        _id: data.roomid,
      });
      data.roomid = room._id;
      await doResumeGame(data, io, socket);
    });

    socket.on('dositout', async (data) => {
      await doSitOut(data, io, socket);
    });

    socket.on('dositin', async (data) => {
      await doSitIn(data, io, socket);
    });

    socket.on('doleavetable', async (data) => {
      if (data.isWatcher) {
        await doLeaveWatcher(data, io, socket);
      } else {
        await doLeaveTable(data, io, socket);
      }
    });

    socket.on('leaveJoinWatcher', async (data) => {
      await leaveAndJoinWatcher(data, io, socket);
    });

    socket.on('typing', async (data) => {
      console.log(data);
      socket.to(data.roomid).emit('usrtyping', { usr: data.user });
    });

    socket.on('msg_send', async (data) => {
      console.log(data);
      socket.to(data.roomid).emit('user_message', {
        usr: data.user,
        msg: data.msg,
        name: data.name,
      });
    });

    socket.on('join room', (data) => {
      console.log('join room is here');
      console.log('for video=>', data);
      if (users[data.roomid]) {
        const length = users[data.roomid].length;
        // if (length === 25) {
        //     socket.emit("room full");
        //     return;
        // }
        users[data.roomid].push({ userid: data.userid, socketid: socket.id });
      } else {
        users[data.roomid] = [{ userid: data.userid, socketid: socket.id }];
      }
      socketToRoom[socket.id] = data.roomid;
      const usersInThisRoom = users[data.roomid].filter(
        (el) => el.socketid !== socket.id
      );
      console.log('all user emit => ', usersInThisRoom);
      socket.emit('all users', usersInThisRoom);
    });

    // BuyIn socket
    socket.on('addCoins', async (data) => {
      await addBuyIn(
        data.amt,
        data.userId,
        data.usd,
        data.payMethod,
        data.cardNr,
        data.tableId,
        io,
        socket
      );
    });

    socket.on('sending signal', (payload) => {
      io.to(payload.userToSignal).emit('user joined', {
        signal: payload.signal,
        callerID: payload.callerID,
        userid: payload.userid,
      });
    });

    socket.on('returning signal', (payload) => {
      io.to(payload.callerID).emit('receiving returned signal', {
        signal: payload.signal,
        id: socket.id,
        userid: payload.userid,
      });
    });

    socket.on('disconnect', async () => {
      try {
        console.log(
          'disconnected',
          socket.id,
          socket.customId, // userid of player who leaves the game
          socket.customRoom // Room id on which user was playing game
        );

        if (!socket.custoumId && !socket.customRoom) {
          return;
        }

        const lastSockets = io.users;
        console.log({ lastSockets });
        let filteredSockets = lastSockets.filter(
          (el) => el.toString() === socket.customId.toString()
        );
        const roomid = io.room;
        console.log({ roomid, custoumId: socket.customId });
        let filteredRoom = roomid.filter(
          (el) => el.room.toString() === socket.customRoom.toString()
        );
        console.log({ filteredSockets, filteredRoom });
        if (filteredSockets.length > 0 && filteredRoom.length > 0) {
          console.log('IN THE IF');
          let indexUser = lastSockets.indexOf(socket.customId);
          if (indexUser !== -1) lastSockets.splice(indexUser, 1);

          io.users = lastSockets;

          let data = {
            roomid: socket.customRoom,
            userId: socket.customId,
            tableId: socket.customRoom,
          };
          console.log('data =>', data);

          setTimeout(async () => {
            console.log('Player join in game again');
            console.log('After three second =>');
            let dd = { ...data };
            console.log({ dd });
            console.log(
              'RESULT ',
              io.users.find((ele) => ele?.toString() === dd?.userId?.toString())
            );
            if (
              io.users.find((ele) => ele?.toString() === dd?.userId?.toString())
            ) {
              console.log('USER JOINS THE ROOM AGAIN');
              return;
            } else {
              console.log('dd =>', dd);
              await doLeaveTable(dd, io, socket);
            }
          }, 120000);
        }
        console.log({ socketToRoom, idSocket: socket.id });
        const roomID = socketToRoom[socket.id];
        console.log({ roomID });
        let room = users[roomID];
        if (room) {
          room = room.filter((el) => el.socketid !== socket.id);
          users[roomID] = room;
        }
      } catch (e) {
        console.log('error in disconnect block', e);
      }
      console.log('Player gone!');
    });

    socket.on('chatMessage', (data) => {
      io.in(data.tableId.toString()).emit('newMessage', data);
      console.log('Emitted');
    });

    socket.on('invPlayers', async (data) => {
      InvitePlayers(data, socket, io);
    });

    socket.on('giftItem', async (data) => {
      io.in(data.tableId).emit('newItem', data);
    });

    socket.on('clearData', async (data) => {
      if (data.tableId) doFinishGame(data, io, socket);
    });
  });
};
module.exports = returnSocket;
