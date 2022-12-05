const express = require('express');
require('dotenv').config();
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const UserModel = require('./models/user');
const GroupModel = require('./models/group');
const MessageModel = require('./models/message');
const ContactModel = require('./models/contact');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { verifyToken, verify_token } = require("./utils/verify-token");
const verifyRefreshToken = require('./utils/verify-refresh-token');
const generateTokens = require('./utils/generate-token');
const multer = require('multer');
const path = require('path');

const upload_dir = process.env.UPLOADDIR;
const file_upload_dir = process.env.FILEUPLOADDIR;
 
const avatarStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, upload_dir)
    },
    filename: function (req, file, cb) {
        let extArray = file.mimetype.split("/");
        let extension = extArray[extArray.length - 1];
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);

        cb(null, file.fieldname + '-' + uniqueSuffix + `.${extension}`);
    }
});

const fileStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, file_upload_dir)
    },
    filename: function (req, file, cb) {
        let extArray = file.mimetype.split("/");
        let extension = extArray[extArray.length - 1];
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        let finalName = '';
        if(extension !== 'pdf' || extension !== 'png' 
        || extension !== 'jpg' || extension !== 'jpeg' 
        || extension !== 'gif' ||  extension !== 'svg') {
            finalName = uniqueSuffix + '-' + file.originalname;
        }
        else {
            finalName = file.fieldname + '-' + uniqueSuffix + `.${extension}`;
        }
        
        cb(null, finalName);
    }
});

let upload = multer({ 
    storage: avatarStorage,
    limits: {
        fileSize: 200000000
    },
    fileFilter: function(req, file, cb){
        checkImageFileType(file, cb);
    }
});

let uploadFiles = multer({ 
    storage:fileStorage,
    limits: {
        fileSize: 200000000
    },
    fileFilter: function(req, file, cb){
        checkImageFileType(file, cb);
    }
});

function checkImageFileType(file, cb){
    // Allowed ext
    const filetypes = /jpeg|jpg|png|gif/;
    // Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime
    const mimetype = filetypes.test(file.mimetype);
  
    if(mimetype && extname){
      return cb(null,true);
    } else {
      cb('Error: Images Only!');
    }
}

const app = express();

app.disable('etag');
app.use(express.static('public')); 

app.use(express.json());

const http = require('http').Server(app);
const port = process.env.PORT || 3001;

var corsOptions = {
    origin: 'http://localhost:4200',
    methods: '*'
};

app.use(cors(corsOptions));

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
}

// setup my socket server
var io = require('socket.io')(http, {
    pingTimeout: 30000,
    pingInterval: 5000,
    upgradeTimeout: 30000,
    cors: {
      origin: 'http://localhost:4200',
    }
});

io.use((socket, next) => {
    const query = socket.handshake.query;
    if (!query || !query.user_id || !socket.handshake.auth.token) {
        console.log(`[IO MIDDLEWARE]: Invalid Session`);
      return next(new Error("احراز هویت نامعتبر می باشد"));
    }

    // if(!verify_token(socket.handshake.auth.token)) {
    //     return next(new Error("احراز هویت نامعتبر می باشد"));
    // }

    socket.username = query.user_id;
    next();
});

let sokcet_users = [];

let remove_socket_user = (user_id) => {
    let s_u = sokcet_users.filter(e => e.user_id === user_id);
    s_u.forEach(f => sokcet_users.splice(sokcet_users.findIndex(e => e.user_id === f.user_id),1));
}

let add_socket_user = (user_id, socket_id) => {
    sokcet_users.push({
        socket_id: socket_id,
        user_id: user_id,
    });
}

io.on('connection', function(socket) {

    for (let [id, socket] of io.of("/").sockets) {
        remove_socket_user(socket.username);
        add_socket_user(socket.username, id);
    }

    console.log('[SOCKET USERS]:', sokcet_users);

    socket.conn.once("upgrade", () => {
        // called when the transport is upgraded (i.e. from HTTP long-polling to WebSocket)
        console.log("[Upgraded Transport]:", socket.conn.transport.name); // prints "websocket"
    });

    socket.on("join_room", function(roomData) {
        try {
            console.log('[socket]','join room :', roomData);
            console.log("ROOMID: ", roomData.roomId);

            let alreadyJoined = [];

            let room_clients = io.sockets.adapter.rooms.get(roomData.roomId);
            if(room_clients) {
                console.log("[room_clients]:", room_clients);

                if(!roomData.is_group) { // private
                    for(let cl of room_clients) {
                        let s_u = sokcet_users.filter(f=>f.socket_id === cl);
                        console.log('[SEARCH SOCKET USERS]:', s_u);
                        if(s_u.length > 0)
                            alreadyJoined.push(s_u[0].user_id);
                    }
                }
            }

            socket.join(roomData.roomId);

            room_clients = io.sockets.adapter.rooms.get(roomData.roomId);

            io.sockets.in(roomData.roomId).emit('user_joined', {
                user_id: roomData.mobile_number,
                room_id: roomData.roomId,
                online_count: room_clients ? room_clients.size : 0,
                already_joined_user: alreadyJoined
            }); //socket.id
        } catch(e){
            console.log('[error]','join room :', e);
        }
    });

    socket.on('leave_room', function(data) {  
        try {
            console.log('[socket]','leave room :', data);

            socket.leave(data.room_id);

            let room_clients = io.sockets.adapter.rooms.get(data.room_id);

            socket.to(data.room_id).emit('user_left', {
                user_id: data.mobile_number,
                room_id: data.room_id,
                online_count: room_clients ? room_clients.size : 0
            });
        } catch(e){
            console.log('[error]','leave room :', e);
        }
    });
    
    // console.log('New connection');
    // const count = io.engine.clientsCount;
    // console.log("Connected clients: " + count);
    // io.emit('participants',count);
    
    // Called when the client calls socket.emit('message')
    
    socket.on('send_message', function(data) {

        // socket.broadcast.emit('message', msg); // to all, but the sender
        //io.to(obj.room).emit('message',obj); // to all, including the sender

        let clientId = '';

        let msg = {
            'body': data.body, 
            'date': new Date(),//moment().format(), 
            'sender': data.sender,
            'status': data.status,
            'recvId': data.recvId,
            'recvIsGroup': data.recvIsGroup,
            'isAdminMsg': false
        };

        MessageModel.collection.insertOne(msg);

        let msgWithClId = {
            '_id': msg._id,
            'body': msg.body, 
            'date': msg.date, 
            'sender': msg.sender,
            'status': msg.status,
            'recvId': msg.recvId,
            'recvIsGroup': msg.recvIsGroup,
            'isAdminMsg': false,
            'clientId': ''
        };

        if(data.recvIsGroup) {
            socket.to(data.recvId).emit('receive_message', msgWithClId); //room=data.recvId
        }
        else {
            let prvRoom = checkPrvRoom(data.sender, data.recvId);
            if(prvRoom) {
                msgWithClId.clientId = data.clientId;
                io.sockets.in(prvRoom).emit('receive_message', msgWithClId);
                //socket.to(prvRoom).emit('receive_message', msgWithClId); //, room=data.recvId
            }
        }

        socket.broadcast.emit('new_message', msg);
        
    });

    socket.on('chage_msg_status', async (data)=> {

        console.log('[chage_msg_status]:', data);

        let msgId = data.msgId;
        let status = data.status;
        let roomId = data.roomId;

        await MessageModel.findByIdAndUpdate(msgId, { 'status': status });

        socket.to(roomId).emit('msg_status_changed', data);
    });

    // Called when a client disconnects
    socket.on('disconnect_client', function(data) {
        console.log('Disconnection:', data);

        socket.disconnect();

        remove_socket_user(data.user_id);
        
        console.log('[AFTER DISCONNECT]:', sokcet_users);
    });
});


// ============ API =========================================================
app.options('*', cors());

// Register
app.post("/signup", cors(corsOptions), async (req, res) => {

    // Our register logic starts here
    try {
        // Get user input
        const { full_name, mobile_number, password, profile_image } = req.body;

        // Validate user input
        if (!(mobile_number && password && full_name)) {
            res.status(400).send("تمامی فیلدها الزامی می باشد");
        }

        // check if user already exist
        // Validate if user exist in our database
        const oldUser = await UserModel.findOne({'_id': mobile_number});

        if (oldUser) {
            return res.status(409).send("شماره همراه تکراری می باشد");
        }

        //Encrypt user password
        encryptedPassword = await bcrypt.hash(password, 10);

        // Create user in our database

        let newUser = {
            _id: mobile_number,
            mobile_number:mobile_number,
            password: encryptedPassword,
            full_name: full_name,
            profile_image: profile_image
        };

        UserModel.collection.insertOne(newUser);

        const { accessToken, refreshToken } = await generateTokens(user);

        // save user token
        newUser.access_token = accessToken;
        newUser.refresh_token = refreshToken;

        // return new user
        res.status(201).json({ 
            'token': accessToken,
            'refresh_token': refreshToken,
            'mobile_number': newUser.mobile_number,
            'full_name': newUser.full_name,
            'profile_image': newUser.profile_image
        });
        
    } catch (err) {
        console.log(err);
    }
    // Our register logic ends here
});

// Login
app.post("/login", cors(corsOptions), async (req, res) => {
        // Our login logic starts here
    try {
        // Get user input
        const { mobile_number, password } = req.body;

        // Validate user input
        if (!(mobile_number && password)) {
            res.status(400).json("شماره همراه و کلمه عبور الزامی میباشد");
        }
        // Validate if user exist in our database
        const user = await UserModel.collection.findOne({ '_id': mobile_number });

        if (user && (await bcrypt.compare(password, user.password))) {
            // Create token
            const { accessToken, refreshToken } = await generateTokens(user);

            // save user token
            user.access_token = accessToken;
            user.refresh_token = refreshToken;

            // user
            res.status(200).json({ 
                'token': accessToken,
                'refresh_token': refreshToken,
                'mobile_number': user.mobile_number,
                'full_name': user.full_name,
                'profile_image': user.profile_image
            });
        }
        else
            res.status(400).json("شماره همراه یا کلمه عبور اشتباه است");
    } catch (err) {
        console.log(err);
    }
});

app.post("/refresh-token", cors(corsOptions), async (req, res) => {
    console.log('[REQ REFRESH TOKEN]');
    const { mobile_number, refresh_token } = req.body;

    let user = await UserModel.collection.findOne({ '_id': mobile_number });
    let verified = await verifyRefreshToken(refresh_token);
    if(verified) {

        const { accessToken, refreshToken } = generateTokens(user);
    
        return res.status(200).json({ 
            'token': accessToken,
            'refresh_token': refreshToken,
            'mobile_number': user.mobile_number,
            'full_name': user.full_name,
            'profile_image': user.profile_image
         });
    }
    else
        return res.status(401).json({ success: false, error: "توکن نامعتبر است" });
});

app.post('/avatar/upload-avatar', verifyToken, upload.single('avatar'), async function (req, res, next) {
    
    const avatar_id = req.body.avatarId;
    const is_group = (req.body.isGroup === 'true');

    if (!req.file) {
        console.log("No file is available!");
        return res.send({
          success: false
        });
      } else {

        let avatarPath = 'assets/img/avatars/' + req.file.filename;
        if(!is_group) {
            const update = { 'profile_image': avatarPath };
            await UserModel.findByIdAndUpdate(avatar_id, update);
        }
        else {
            console.log('[is_group]:', avatar_id);
            //const update = { 'image': avatarPath };
            //await GroupModel.findByIdAndUpdate(avatar_id, update);
        }

        console.log('File is available!');
        return res.send({
          success: true,
          file_name: req.file.filename
        });
      }
});

app.post('/file/upload', uploadFiles.array('files'), async function (req, res, next) {
    
    if (!req.files) {
        console.log("No file is available!");

        return res.send({
          success: false
        });
      } else {

        console.log('File is available!');

        return res.send({
          success: true
          //file_name: req.file.filename
        });
      }
});

app.post('/rooms/check-prv-room', verifyToken, (req, res) => {
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

app.get('/message/user-messsages-list/:id', verifyToken, (req, res) => {
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
        ]})
        .sort({ 'date': -1 })
        .exec((err, msgs) => {
            return res.status(200).json(msgs);
        });
    });
});

app.get('/message/user-messsages/:id', verifyToken, (req, res) => {
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

app.get('/message/group-messsages/:id', verifyToken, (req, res)=> {
    let group_id = req.params.id;

    MessageModel.aggregate([
        {
            '$match': { 'recvId': group_id }
        },
        {
            '$group' : {
               '_id' :{ $dateToString: { format: "%Y-%m-%d", date: "$date"} },
               'list': { $push: "$$ROOT" },
               'count': { $sum: 1 }
            }
        },
        { '$sort': { '_id': 1 }}
    ])
    //.sort({ 'date': 1 })
    .exec((err, messages) => {
        return res.status(200).json(messages);
    });
});

app.get('/message/private-messsages/:id/:user', verifyToken, (req, res)=> {
    let contact_id = req.params.id;
    let user_id = req.params.user;
    MessageModel.aggregate([
        {
            '$match': { 
                '$or': [
                    {'$and': [{'recvId': user_id}, {'sender': contact_id}]}, 
                    {'$and': [{'sender': user_id}, {'recvId': contact_id}]}
                ]
            }
        },
        {
            '$group' : {
               '_id' :{ $dateToString: { format: "%Y-%m-%d", date: "$date"} },
               'list': { $push: "$$ROOT" },
               'count': { $sum: 1 }
            }
        },
        { '$sort': { '_id': 1 }}
    ])
    //.sort({ 'date': 1 })
    .exec((err, messages) => {
        return res.status(200).json(messages);
    });
});

app.get('/user/user-contacts/:id', verifyToken, (req, res)=> {
    let user_id = req.params.id;

    ContactModel.find({ 'user': user_id }, (err, contacts) => {
        //console.log(user_id, " contacts:", contacts);
        return res.status(200).json(contacts);
    });
});

app.post('/user/create-contact', verifyToken, (req, res) => {

    ContactModel.findOne({ 'user': req.body.user, 'mobile_number': req.body.mobile_number }, (err, contact) => {
        if (err) 
            return res.status(500).json("خطا در ثبت مخاطب");

        if(contact)
            return res.status(500).json("مخاطب تکراری است");

        UserModel.collection.findOne({ '_id': req.body.mobile_number }, (error, user) => {
            if (error) 
                return res.status(500).json("خطا در ثبت مخاطب");

            if(!user)
                return res.status(500).json("این شماره همراه حساب کاربری ندارد");

            if(!contact) {
                let newContact = { 
                    user: req.body.user,
                    mobile_number: req.body.mobile_number, 
                    full_name: user.full_name,//req.body.full_name,
                    contact_image: user.profile_image,//req.body.contact_image,
                    last_seen: new Date(),//moment().format(),
                    create_date: new Date()//moment().format()
                };
    
                ContactModel.collection.insertOne(newContact);
    
                ContactModel.findOne({ 'user': req.body.user, 'mobile_number': req.body.mobile_number }, (err, new_contact) => {
                    return res.status(200).json(new_contact);
                });
        
                
            }
        });

        
    });
});

app.get('/group/user-group/:id', verifyToken, (req, res)=> {
    let user_id = req.params.id;

    GroupModel.find({ 'members': { '$regex': user_id, "$options" :'i' } }, (err, groups) => {
        return res.status(200).json(groups);
    });
});

app.post('/group/create-group', verifyToken, async (req, res) => {
    let newGroup = { 
        name: req.body.group_name,
        members: req.body.members + ',' + req.body.user, 
        image: req.body.image,
        admins: req.body.user,
        created_by: req.body.user,
        create_at: new Date()//moment().format()
    };

    await GroupModel.collection.insertOne(newGroup);
    let msg = {
        'body': 'گروه ایجاد شد', 
        'date': new Date(),//moment().format(), 
        'sender': '09000000000',
        'status': 1,
        'recvId': newGroup._id.toString(),
        'recvIsGroup': true,
        'isAdminMsg': true
    };

    MessageModel.collection.insertOne(msg);

    io.sockets.emit('new_message', msg);

    return res.status(200).json(newGroup);
});

app.get('/user/user-chat-list/:id', verifyToken, (req, res) => {
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
                        //{ 'sender': user_id }, 
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
        ])
        .sort({ 'date': -1 })
        .exec((err, msgs) => {
            return res.status(200).json(msgs);
        });
    });
});

app.get('/user/fullname/:id', verifyToken, (req, res) => {
    let user_id = req.params.id;

    UserModel.findOne({ '_id': user_id },
    (err, user) => {
        return res.status(200).json(user.full_name);
    });
});

app.get('/user/profileimage/:id', verifyToken, (req, res) => {
    let user_id = req.params.id;

    UserModel.findOne({ '_id': user_id },
    (err, user) => {
        return res.status(200).json(user.profile_image);
    });
});

app.get('/group/name/:id', verifyToken, (req, res) => {
    let group_id = req.params.id;

    GroupModel.findOne({ '_id': group_id },
    (err, group) => {
        return res.status(200).json(group.name);
    });
});

app.get('/group/image/:id', verifyToken, (req, res) => {
    let group_id = req.params.id;

    GroupModel.findOne({ '_id': group_id },
    (err, group) => {
        return res.status(200).json(group.image);
    });
});

app.get('/group/get-group-users/:id', verifyToken, (req, res) => {
    let group_id = req.params.id;
    GroupModel.findOne({ '_id': group_id },
    (err, group) => {
        let group_members = group.members.toString().split(',');

        UserModel.find({'mobile_number': { '$in': group_members }},
        { mobile_number: 1, full_name: 1, profile_image: 1, _id: 0 },
        (err, users) => {
            return res.status(200).json(users);
        });

        
    });
});