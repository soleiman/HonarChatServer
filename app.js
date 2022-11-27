const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const UserModel = require('./models/user');
const GroupModel = require('./models/group');
const MessageModel = require('./models/message');
const ContactModel = require('./models/contact');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const moment = require('moment');

const app = express();
app.disable('etag');
app.use(express.static('public')); 

app.use(express.json());

const http = require('http').Server(app);
const port = process.env.PORT || 3001;

app.use(cors());
const secretString = "Nt_j5d1LlI#X2";

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(cookieParser(secretString));
app.use(session({
  secret: secretString,
  resave: true,
  secure: false,
  saveUninitialized: true
}));

connectDb().catch(err => console.log(err));

async function connectDb() {
    await mongoose.connect('mongodb://127.0.0.1:27017/MessengerDb');
    console.log("DB Connected");
    // use `await mongoose.connect('mongodb://user:password@localhost:27017/test');` if your database has auth enabled
}

http.listen(port, () => {
    console.log('listening on *: ' + port);
});

let checkPrvRoom = (user, roomId) => {
    let prvRoomId = roomId + user;
    let prvRoomIdRev = user + roomId;

    let rooms = io.sockets.adapter.rooms;

    if(rooms.has(prvRoomId)) {
        return prvRoomId;
    }
    else if(rooms.has(prvRoomIdRev)) {
        return prvRoomIdRev;
    }
    else {
        return false;
    }
};

// setup my socket server
var io = require('socket.io')(http, {
    cors: {
      origin: 'http://localhost:4200',
    }
});

io.on('connection', function(socket) {

    socket.on("join_room", function(roomData) {
        try {
            console.log('[socket]','join room :', roomData);
            console.log("ROOMID: ", roomData.roomId);

            socket.join(roomData.roomId);
            socket.to(roomData.roomId).emit('user_joined', socket.id);
        } catch(e){
            console.log('[error]','join room :', e);
        }
    });

    socket.on('leave_room', function(room) {  
        try {
            console.log('[socket]','leave room :', room);
            socket.leave(room);
            socket.to(room).emit('user_left', socket.id);
        } catch(e){
            console.log('[error]','leave room :', e);
        }
    });
    
    console.log('New connection');
    const count = io.engine.clientsCount;
    console.log("Connected clients: " + count);
    // io.emit('participants',count);
    
    // Called when the client calls socket.emit('message')
    socket.on('send_message', function(data) {

        // socket.broadcast.emit('message', msg); // to all, but the sender
        //io.to(obj.room).emit('message',obj); // to all, including the sender

        let msg = {
            'body': data.body, 
            'date': moment().format(), 
            'sender': data.sender,
            'status': data.status,
            'recvId': data.recvId,
            'recvIsGroup': data.recvIsGroup
        };

        MessageModel.collection.insertOne(msg);

        if(data.recvIsGroup) {
            socket.to(data.recvId).emit('receive_message', data, room=data.recvId);
        }
        else {
            let prvRoom = checkPrvRoom(data.sender, data.recvId);
            if(prvRoom) {
                socket.to(prvRoom).emit('receive_message', data, room=data.recvId);
            }
        }

        socket.broadcast.emit('new_message', msg);
        
    });

    // Called when a client disconnects
    socket.on('disconnect', function() {
        console.log('Disconnection');
        const count = io.engine.clientsCount;
        console.log("Connected clients: " + count);
        io.emit('participants',count);
    });
});


// ============ API =========================================================

app.post('/rooms/check-prv-room', (req, res) => {
    let user = req.body.user;
    let roomId = req.body.roomId;

    let prvRoomId = roomId + user;
    let prvRoomIdRev = user + roomId;

    let rooms = io.sockets.adapter.rooms;

    if(rooms.has(prvRoomId)) {
        return res.json({
            exist: true,
            roomId: prvRoomId
        });
    }
    else if(rooms.has(prvRoomIdRev)) {
        return res.json({
            exist: true,
            roomId: prvRoomIdRev
        });
    }
    else {
        return res.json({
            exist: false,
            roomId: prvRoomId
        });
    }
});

app.get('/message/user-messsages-list/:id', function(req, res) {
    let user_id = req.params.id;
    
    GroupModel.find({ 'members': { '$regex': user_id, "$options" :'i' } }, (err, grps) => {
        let userGroups = [];
        for(let gr of grps) {
            userGroups.push(gr._id)
        }

        MessageModel.find({ '$or': [
            {'sender': user_id}, 
            {'recvId': user_id},
            {'recvId': { '$in': userGroups }}
        ]},
        (err, msgs) => {
            return res.status(200).json(msgs);
        });
    });
});

app.get('/message/user-messsages/:id', function(req, res) {
    let user_id = req.params.id;
    
    GroupModel.find({ 'members': { '$regex': user_id, "$options" :'i' } }, (err, grps) => {
        let userGroups = [];
        for(let gr of grps) {
            userGroups.push(gr._id)
        }

        MessageModel.find({ '$or': [
            {'sender': user_id}, 
            {'recvId': user_id},
            {'recvId': { '$in': userGroups }}
        ]},
        (err, msgs) => {
            return res.status(200).json(msgs);
        });
    });
});

app.get('/message/group-messsages/:id', (req, res)=> {
    let group_id = req.params.id;

    MessageModel.find({ 'recvId': group_id }, (err, messages) => {
        return res.status(200).json(messages);
    });
});

app.get('/message/private-messsages/:id/:user', (req, res)=> {
    let contact_id = req.params.id;
    let user_id = req.params.user;
    MessageModel.find({ '$or': [{'$and': [{'recvId': user_id}, {'sender': contact_id}]}, 
                {'$and': [{'sender': user_id}, {'recvId': contact_id}]}] }, 
            (err, messages) => {
                return res.status(200).json(messages);
    });
});

app.get('/user/user-contacts/:id', (req, res)=> {
    let user_id = req.params.id;

    ContactModel.find({ 'user': user_id }, (err, contacts) => {
        //console.log(user_id, " contacts:", contacts);
        return res.status(200).json(contacts);
    });
});

app.post('/user/create-contact', function(req, res) {

    ContactModel.findOne({ 'user': req.body.user, 'mobile_number': req.body.mobile_number }, (err, contact) => {
        if (err) 
            return res.status(500).json("خطا در ثبت مخاطب");

        if(contact)
            return res.status(500).json("مخاطب تکراری است");

        if(!contact) {
            let newContact = { 
                user: req.body.user,
                mobile_number: req.body.mobile_number, 
                full_name: req.body.full_name,
                contact_image: req.body.contact_image,
                last_seen: moment().format(),
                create_date: moment().format()
            };

            ContactModel.collection.insertOne(newContact);

            ContactModel.findOne({ 'user': req.body.user, 'mobile_number': req.body.mobile_number }, (err, new_contact) => {
                return res.status(200).json(new_contact);
            });
    
            
        }
    });
});

app.get('/group/user-group/:id', (req, res)=> {
    let user_id = req.params.id;

    GroupModel.find({ 'members': { '$regex': user_id, "$options" :'i' } }, (err, groups) => {
        return res.status(200).json(groups);
    });
});

app.post('/group/create-group', async function(req, res) {
    let newGroup = { 
        name: req.body.group_name,
        members: req.body.members + ',' + req.body.user, 
        image: req.body.image,
        admins: req.body.user,
        created_by: req.body.user,
        create_at: moment().format()
    };

    await GroupModel.collection.insertOne(newGroup);
    let msg = {
        'body': 'گروه ایجاد شد', 
        'date': moment().format(), 
        'sender': '',
        'status': 1,
        'recvId': newGroup._id.toString(),
        'recvIsGroup': true
    };

    MessageModel.collection.insertOne(msg);

    io.sockets.emit('new_message', msg);

    return res.status(200).json(newGroup);
});

app.get('/user/user-chat-list/:id', (req, res) => {
    let user_id = req.params.id;

    GroupModel.find({ 'members': { '$regex': user_id, "$options" :'i' } }, (err, grps) => {
        let userGroups = [];
        for(let gr of grps) {
            userGroups.push(gr._id.toString());
        }

        MessageModel.aggregate([
            { 
                '$match': { 
                    '$or': [
                        { 'sender': user_id }, 
                        { 'recvId': user_id },
                        { 'recvId': { '$in': userGroups } }
                    ]
                }
            },
            { 
                '$group': { 
                    '_id': "$recvId", 
                    'date': { '$max': "$date" }, 
                    'recvId': { "$first": "$recvId" },
                    'body': { "$first": "$body" }, 
                    'sender': { "$first": "$sender" }, 
                    'recvIsGroup': { "$first": "$recvIsGroup" }
                }
            }
        ], 
        (err, msgs) => {
            return res.status(200).json(msgs);
        });
    });
});

app.get('/user/fullname/:id', (req, res) => {
    let user_id = req.params.id;

    UserModel.findOne({ '_id': user_id },
    (err, user) => {
        return res.status(200).json(user.full_name);
    });
});

app.get('/user/profileimage/:id', (req, res) => {
    let user_id = req.params.id;

    UserModel.findOne({ '_id': user_id },
    (err, user) => {
        return res.status(200).json(user.profile_image);
    });
});

app.get('/group/name/:id', (req, res) => {
    let group_id = req.params.id;

    GroupModel.findOne({ '_id': group_id },
    (err, group) => {
        return res.status(200).json(group.name);
    });
});

app.get('/group/image/:id', (req, res) => {
    let group_id = req.params.id;

    GroupModel.findOne({ '_id': group_id },
    (err, group) => {
        return res.status(200).json(group.image);
    });
});