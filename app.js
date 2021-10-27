var express = require ('express');
var socket = require ('socket.io');
const redis = require ('redis');

var app = express ();
const port = app.listen (process.env.PORT || 4000);
var server = app.listen (port, function () {
  console.log ('listening for requests on port 4000');
});

const client = redis.createClient ({
  host: '127.0.0.1',
  port: 6379,
  password: process.env.REDIS_PASS,
});

var io = socket (server, {
  cors: {
    origin: '*',
  },
});

io.on ('connection', socket => {
  socket.on ('joinGroup', socketData => {
    socket.join (socketData.groupId);
    createOrAddGroup (socketData);
    socket.to (socketData.groupId).emit ('joinEvent', socketData);
  });
  socket.on ('leaveGroup', socketData => {
    client.get (socketData.groupId, function (err, redisData) {
      if (err) throw err;
      redisData = JSON.parse (redisData);
      if (
        redisData &&
        redisData.currentUserId == socketData.currentUserId &&
        redisData.tabId == socketData.tabId
      ) {
        deleteKeyFromRedis (socketData.groupId);
      } else if (redisData) {
        redisData.activeUsers = redisData.activeUsers.filter (
          D => D.currentUserId != socketData.currentUserId
        );
        setUsersocketDatatoRedis (redisData);
      }
      socket.leave (socketData.groupId);
      io.to (socketData.groupId).emit ('leftEvent', socketData); // Hasn't changed
    });
  });
  socket.on ('sendMessage', socketData => {
    console.log (socketData);
    socket.to (socketData.groupId).emit ('receiveMessage', socketData);
  });
});

function createOrAddGroup (socketData) {
  client.get (socketData.groupId, function (err, redisData) {
    if (err) throw err;
    redisData = JSON.parse (redisData);
    if (checkCurrentUserInGroup (socketData, redisData)) {
      socketData = addUserToCurrentList (socketData, redisData);
    } else {
      socketData.activeUsers = (redisData && redisData.activeUsers) || [];
    }
    socketData.tabId = (redisData && redisData.tabId) || socketData.tabId;
    setUsersocketDatatoRedis (socketData);
  });
}

function checkCurrentUserInGroup (socketData, redisData) {
  return redisData && socketData.currentUserId !== redisData.currentUserId;
}

function addUserToCurrentList (socketData, redisData) {
  if (isAlreadyAddedUser (socketData.currentUserId, redisData)) {
    redisData.activeUsers.push ({
      id: socketData.currentUserId,
      name: socketData.currentUser,
    });
  }
  return redisData;
}

function isAlreadyAddedUser (currentUserId, redisData) {
  return redisData && !redisData.activeUsers.find (D => D.id === currentUserId);
}

function setUsersocketDatatoRedis (socketData, exprirationType) {
  const id = socketData.groupId;
  socketData = JSON.stringify (socketData);
  client.set (id, socketData, 'EX', 3000000, (err, redisData) => {
    if (err) throw err;
  });
}

function deleteKeyFromRedis (groupId) {
  client.del (groupId, function (err, response) {
    if (response == 1) {
      console.log ('Deleted Successfully!');
    } else {
      console.log ('Cannot delete');
    }
  });
}
