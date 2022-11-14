import {
  verifyJwt,
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
} from "../functions/functions";
import { getDoc, getUserId } from "../firestore/dbFetch";

import roomModel from "../models/room";
let returnSocket = (io) => {
  const users = {};

  const socketToRoom = {};
  io.users = [];
  io.room = [];
  io.on("connection", async (socket) => {
    try {
      console.log("One user Connected");
    } catch (e) {
      console.log("error in connect block", e);
    }

    socket.on("room", (roomData) => {
      console.log("inside room socket ", roomData);
      console.log("join socket roomData ==>", roomData);
      console.log("room connected", typeof roomData.roomid, roomData.roomid);
      socket.join(roomData.roomid);

      socket.emit("welcome", { msg: "hello welcome to socket.io" });
    });

    socket.on("checkTable", async (data) => {
      console.log("User checktable", data);
      try {
        let userId = data.userId;
        if (!data.userId && data.token) {
          userId = await getUserId(data.token);
          socket.emit("userId", userId);
        } else {
          userId = data.userId;
        }
        let room = data.tableId;
        if (!room) return;
        let res, userData;
        if (room !== "undefined") {
          // console.log('Rmmm : ', room);
          if (room) {
            res = await getDoc(data.gameType, room);
            if (!res) {
              return socket.emit("noTable", "there is no such table exist");
            }
            //code for notification
            let socketid = socket.id;

            // console.log('frm cnnect:', io.room);
            // code for online users
            let lastSocketData = io.room;
            lastSocketData.push(room);
            io.room = [...new Set(lastSocketData)];
            console.log("io.room =>", io.room);
            socket.customRoom = room;
          }
          // console.log(
          //   'connectedUser Rmmmmm',
          //   socket.id,
          //   socket.customId,
          //   socket.customRoom,
          // );
        }
        if (userId && userId !== "undefined") {
          userData = await getDoc("users", userId);
          if (userData) {
            userData.userid = userId;
            res.roomid = data.tableId;
            //code for notification
            let socketid = socket.id;

            // console.log('User: ', io.users);
            // code for online users
            let lastSocketData = io.users;
            lastSocketData.push(userData.userid);
            io.users = [...new Set(lastSocketData)];
            socket.customId = userData.userid;
            console.log("Io.users=>", io.users);
            let payload = {
              user: userData,
              room: res,
              gameType: data.gameType,
            };
            socket.join(res.roomid.toString());
            await checkRoomForConnectedUser(payload, socket, io);
          } else {
            socket.emit("notAuthorized", "");
          }
        } else {
          socket.emit("notAuthorized", "");
        }
      } catch (err) {
        console.log("Error in checkTable =>", err.message);
      }
    });
    socket.on("joinGame", async (data) => {
      await joinRequest(data, socket, io);
    });

    socket.on("leaveWatcherJoinPlayer", async (data) => {
      await doLeaveWatcher(data, io, socket);
      await joinRequest(data, socket, io);
    });

    socket.on("joinWatcher", async (data) => {
      await joinWatcherRequest(data, socket, io);
    });

    socket.on("newBet", async (data) => {
      await handleNewBet(data, socket, io);
    });

    socket.on("acceptBet", async (data) => {
      await acceptBet(data, socket, io);
    });

    socket.on("approveRequest", async (data) => {
      await approveJoinRequest(data, socket, io);
    });

    socket.on("cancelRequest", async (data) => {
      await rejectJoinRequest(data, socket, io);
    });

    socket.on("startPreflopRound", async (data) => {
      await startPreflopRound(data, socket, io);
    });

    socket.on("dofold", async (data) => {
      let room = await roomModel.findOne({
        tableId: data.roomid,
      });
      data.roomid = room._id;
      await socketDoFold(data, io, socket);
    });

    socket.on("docall", async (data) => {
      let room = await roomModel.findOne({
        tableId: data.roomid,
      });
      data.roomid = room._id;
      await socketDoCall(data, io, socket);
    });

    socket.on("dobet", async (data) => {
      let room = await roomModel.findOne({
        tableId: data.roomid,
      });
      data.roomid = room._id;
      await socketDoBet(data, io, socket);
    });

    socket.on("doraise", async (data) => {
      let room = await roomModel.findOne({
        tableId: data.roomid,
      });
      data.roomid = room._id;
      await socketDoRaise(data, io, socket);
    });

    socket.on("docheck", async (data) => {
      let room = await roomModel.findOne({
        tableId: data.roomid,
      });
      data.roomid = room._id;
      await socketDoCheck(data, io, socket);
    });

    socket.on("doallin", async (data) => {
      let room = await roomModel.findOne({
        tableId: data.roomid,
      });
      data.roomid = room._id;
      await socketDoAllin(data, io, socket);
    });

    socket.on("dopausegame", async (data) => {
      let room = await roomModel.findOne({
        tableId: data.roomid,
      });
      data.roomid = room._id;
      await doPauseGame(data, io, socket);
    });

    socket.on("dofinishgame", async (data) => {
      let room = await roomModel.findOne({
        tableId: data.roomid,
      });
      data.roomid = room._id;
      await doFinishGame(data, io, socket);
    });

    socket.on("doresumegame", async (data) => {
      let room = await roomModel.findOne({
        tableId: data.roomid,
      });
      data.roomid = room._id;
      await doResumeGame(data, io, socket);
    });

    socket.on("dositout", async (data) => {
      await doSitOut(data, io, socket);
    });

    socket.on("dositin", async (data) => {
      await doSitIn(data, io, socket);
    });

    socket.on("doleavetable", async (data) => {
      if (data.isWatcher) {
        await doLeaveWatcher(data, io, socket);
      } else {
        await doLeaveTable(data, io, socket);
      }
    });

    socket.on("leaveJoinWatcher", async (data) => {
      await leaveAndJoinWatcher(data, io, socket);
    });

    socket.on("typing", async (data) => {
      console.log(data);
      socket.to(data.roomid).emit("usrtyping", { usr: data.user });
    });

    socket.on("msg_send", async (data) => {
      console.log(data);
      socket.to(data.roomid).emit("user_message", {
        usr: data.user,
        msg: data.msg,
        name: data.name,
      });
    });

    socket.on("join room", (data) => {
      console.log("join room is here");
      console.log("for video=>", data);
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
      console.log("all user emit => ", usersInThisRoom);
      socket.emit("all users", usersInThisRoom);
    });

    // BuyIn socket
    socket.on("addCoins", async (data) => {
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

    socket.on("sending signal", (payload) => {
      io.to(payload.userToSignal).emit("user joined", {
        signal: payload.signal,
        callerID: payload.callerID,
        userid: payload.userid,
      });
    });

    socket.on("returning signal", (payload) => {
      io.to(payload.callerID).emit("receiving returned signal", {
        signal: payload.signal,
        id: socket.id,
        userid: payload.userid,
      });
    });

    socket.on("disconnect", async () => {
      try {
        console.log(
          "disconnected",
          socket.id,
          socket.customId,
          socket.customRoom
        );

        const lastSockets = io.users;
        let filteredSockets = lastSockets.filter(
          (el) => el === socket.customId
        );
        const roomid = io.room;
        let filteredRoom = roomid.filter((el) => el === socket.customRoom);
        if (filteredSockets.length > 0 && filteredRoom.length > 0) {
          let indexUser = lastSockets.indexOf(socket.customId);
          if (indexUser !== -1) lastSockets.splice(indexUser, 1);

          io.users = lastSockets;

          let data = {
            roomid: socket.customRoom,
            userId: socket.customId,
            tableId: socket.customRoom,
          };
          console.log("data =>", data);

          setTimeout(async () => {
            console.log("After three second =>");
            let dd = { ...data };
            if (io.users.find((ele) => ele === dd.userId)) {
              return;
            } else {
              console.log("dd =>", dd);
              await doLeaveTable(dd, io, socket);
            }
          }, 120000);
        }
        const roomID = socketToRoom[socket.id];
        let room = users[roomID];
        if (room) {
          room = room.filter((el) => el.socketid !== socket.id);
          users[roomID] = room;
        }
      } catch (e) {
        console.log("error in disconnect block");
      }
      console.log("Player gone!");
    });

    socket.on("chatMessage", (data) => {
      io.in(data.tableId.toString()).emit("newMessage", data);
      console.log("Emitted");
    });

    socket.on("invPlayers", async (data) => {
      InvitePlayers(data, socket, io);
    });

    socket.on("giftItem", async (data) => {
      io.in(data.tableId).emit("newItem", data);
    });

    socket.on("clearData", async (data) => {
      if (data.tableId) doFinishGame(data, io, socket);
    });
  });
};
module.exports = returnSocket;
