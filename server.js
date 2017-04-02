var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var mongoClient = require('mongodb').MongoClient;
var dbPath = 'mongodb://localhost:27017/chat';


var user_socketid = {};
var socketid_user = {};
var globalDB = null;









app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html')
});


app.get('/react', function(req, res){
  res.sendFile(__dirname + '/react.js')
});

app.get('/react-dom', function(req, res){
  res.sendFile(__dirname + '/react-dom.js')
});

app.get('/babel', function(req, res){
  res.sendFile(__dirname + '/babel.min.js')
});



io.on('connection', function(socket){







  socket.on('init', function(userid){
    user_socketid[userid] = socket.id;
    socketid_user[socket.id] = userid;
    io.sockets.connected[socket.id].emit('init', 'success');

    globalDB.collection('users').find({userid: userid})
    .toArray()
    .then( (res) => {
      if(res.length !== 0) { return }

      globalDB.collection('users').insert({userid: userid, chatList: {}})
    })
    .catch( (err) => {

    })
  });







  socket.on('chatList', function(data){
    globalDB.collection('users').find({userid: data.userid})
    .limit(1)
    .toArray()
    .then( (result) => {
      let totSocketId = user_socketid[data.userid];

      if(result.length == 0) {
        io.sockets.connected[totSocketId].emit('chatList', []);
        return;
      }

      let chatList = Object.assign({}, result[0].chatList);

      let lastTimestamp = 0;
      let response = [];

      for(let key in chatList) {

          if(chatList.hasOwnProperty(key)) {
            let item = {
                name: key,
                from: chatList[key].from,
                message: chatList[key].message,
                timestamp: chatList[key].timestamp
            }

            if(chatList[key].timestamp > lastTimestamp) {

              lastTimestamp = chatList[key].timestamp;
              response.unshift(item);
            } else {
              response.push(item);
            }
          }
      }

      io.sockets.connected[totSocketId].emit('chatList', response);


    })
    .catch( () => {})
  });







  socket.on('message', function(data){

    data.timestamp = Date.now();

    let messageToDatabase =  {
      chatid: [data.userid, data.chatWith].sort().join(''),
      from: data.userid,
      timestamp: data.timestamp,
      message: data.message,
      seen: false
    }

    globalDB.collection('messages').insert(messageToDatabase)
    .then( () => {
      let totSocketId = user_socketid[data.chatWith];
      let messageToUser = {
        from: data.userid,
        message: data.message,
        timestamp: data.timestamp
      };

      let tempA = "chatList." + data.chatWith;
      globalDB.collection('users').update({userid: data.userid}, {$set: {[tempA]: messageToUser}})

      let tempB = "chatList." + data.userid;
      globalDB.collection('users').update({userid: data.chatWith}, {$set: {[tempB]: messageToUser}})


      if(io.sockets.connected[totSocketId] == undefined){
        return;
      }
      io.sockets.connected[totSocketId].emit('message', messageToUser);
    })
    .catch( (err) => { console.log(err) })
  });




  socket.on('history', function(data){
    let greaterThanDate = null;

    if(!data.timestamp) {
      greaterThanDate = 0;
    }

    globalDB.collection('historyLimit').find({chatid: [data.userid, data.chatWith].sort().join('')})
    .toArray()
    .then( (res) => {
      if(res.length !== 0){
        greaterThanDate = res[0][data.userid]
      }

      globalDB.collection('messages').find({chatid: [data.userid, data.chatWith].sort().join(''), timestamp: {$gt: greaterThanDate}})
      .sort({timestamp: 1})
      .limit(10)
      .toArray()
      .then( (result) => {
        var totSocketId = user_socketid[data.userid];
        var messageToUser = result;
        if(io.sockets.connected[totSocketId] == undefined){
          return;
        }
        io.sockets.connected[totSocketId].emit('updateChat', messageToUser);
      })
      .catch( (err) => {
        console.log(err)
        var totSocketId = user_socketid[data.userid];
        var messageToUser = {
          error: true
        };
        if(io.sockets.connected[totSocketId] == undefined){
          return;
        }
        io.sockets.connected[totSocketId].emit('updateChat', messageToUser);
      });
    })
    .catch( (err) => {
      console.log(err)
    })
  });




  socket.on('deleteHistory', function(data){
    globalDB.collection('historyLimit').find({chatid: [data.userid, data.chatWith].sort().join('')})
    .limit(1)
    .toArray()
    .then( (result) => {
      if(result.length == 1) {
        globalDB.collection('historyLimit').update({chatid: [data.userid, data.chatWith].sort().join('')}, {$set: {[data.userid]: data.timestamp}})
        .catch( (err) => {console.log(err)})
      } else {
        globalDB.collection('historyLimit').insert({chatid: [data.userid, data.chatWith].sort().join(''), [data.userid]: data.timestamp})
        .catch( (err) => { console.log(err)})
      }

      globalDB.collection('users').find({userid: data.userid})
      .toArray()
      .then( (result) => {
        if(result.length != 1) { return }

        let userData = result[0];
        let chatList = Object.assign({}, userData.chatList);
        delete chatList[data.chatWith];
        globalDB.collection('users').update({userid: data.userid}, {$set: {chatList: chatList}})
        .catch( (err) => { console.log(err)})

      })
      .catch( (err) => { console.log(err)})
    })
    .catch( (err) => { console.log(err)})
  });




  socket.on('updateChat', function(data){
    let greaterThanDate = null;

    if(!data.timestamp) {
      greaterThanDate = 0;
    }

    globalDB.collection('historyLimit').find({chatid: [data.userid, data.chatWith].sort().join('')})
    .toArray()
    .then( (res) => {
      if(res.length !== 0){
        if(res[0][data.userid]) {
            greaterThanDate = res[0][data.userid]
        }
      }

      globalDB.collection('messages').find({chatid: [data.userid, data.chatWith].sort().join(''), timestamp: {$gt: greaterThanDate}})
      .sort({timestamp: 1})
      .toArray()
      .then( (result) => {
        var totSocketId = user_socketid[data.userid];
        var messageToUser = result;
        if(io.sockets.connected[totSocketId] == undefined){
          return;
        }
        io.sockets.connected[totSocketId].emit('updateChat', messageToUser);
      })
      .catch( (err) => {
        console.log(err)
        var totSocketId = user_socketid[data.userid];
        var messageToUser = {
          error: true
        };
        if(io.sockets.connected[totSocketId] == undefined){
          return;
        }
        io.sockets.connected[totSocketId].emit('updateChat', messageToUser);
      });
    })
    .catch( (err) => {
      console.log(err)
    })
  });




  socket.on('disconnect', function(){
    delete user_socketid[socketid_user[socket.id]];
    delete socketid_user[socket.id];
  });


});




mongoClient.connect(dbPath)
.then( (db) => {
  globalDB = db;
  console.log('Connection to chat database successful.');
  console.log('Starting up server.')
  http.listen(3000, () => {
    console.log('Server started. Listening on port 3000');
  });
})
.catch( (err) => {
  console.log('Could not connect to chat database.');
  console.log('Error Stacktrace:');
  console.log(err)
  return;
});
