require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const connectDB = require('./config/db');
const User = require('./models/User');
const ChatChunk = require('./models/ChatChunk');


if (!process.env.JWT_SECRET || !process.env.MONGO_URI) {
    console.error('ERROR: Missing required environment variables (JWT_SECRET, MONGO_URI)');
    process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
connectDB();


app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;
    try {
       
        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required" });
        }
        if (username.length < 3) {
            return res.status(400).json({ error: "Username must be at least 3 characters" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword });
        res.status(201).json({ message: "User Created" });
    }
     catch (err) { 
        const errorMsg = err.code === 11000 ? "Username already exists" : err.message || "Signup failed";
        res.status(400).json({ error: errorMsg }); 
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required" });
        }
        
        const user = await User.findOne({ username });
        if (user && await bcrypt.compare(password, user.password)) {
            const token = jwt.sign({ id: user._id, username }, process.env.JWT_SECRET, { expiresIn: '7d' });
            res.json({ token, username });
        } else { 
            res.status(401).json({ error: "Invalid username or password" }); 
        }
    } catch (err) {
        res.status(500).json({ error: "Login failed" });
    }
});


app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({}, 'username');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

app.get('/api/messages/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const chunks = await ChatChunk.find({ conversationId }).sort({ createdAt: 1 });
        
        let allMessages = [];
        chunks.forEach(chunk => {
            allMessages = [...allMessages, ...chunk.messages];
        });
        
        res.json(allMessages);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch history" });
    }
});


async function saveToLinkedList(conversationId, msg) {
    let chunk = await ChatChunk.findOne({ conversationId, isFull: false });
    if (!chunk) chunk = new ChatChunk({ conversationId, messages: [] });

    const msgSize = Buffer.byteLength(JSON.stringify(msg));
    
   

    if (chunk.sizeInBytes + msgSize > 2097152) {
        chunk.isFull = true;
        await chunk.save();
        const newChunk = new ChatChunk({
            conversationId,
            prevChunkId: chunk._id,
            messages: [msg],
            sizeInBytes: msgSize
        });
        return await newChunk.save();
    }

    chunk.messages.push(msg);
    chunk.sizeInBytes += msgSize;
    return await chunk.save();
}


io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    try {
        socket.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) { next(new Error("Auth failed")); }
});

const onlineUsers = new Set(); 

io.on('connection', (socket) => {
    const username = socket.user.username;
    onlineUsers.add(username);
    io.emit('user_status', { username, status: 'online' }); 

    socket.on('join', (room) => socket.join(room));
    socket.on('leave', (room) => socket.leave(room));

    socket.on('send_message', async (data) => {
        try {
         
            if (!data.conversationId || !data.text || !data.text.trim()) {
                return socket.emit('error', { message: 'Message text cannot be empty' });
            }
            
            const members = data.conversationId.split('_');
            const targetUser = members.find(m => m !== username);
            
            const isOnline = onlineUsers.has(targetUser);
            
            const msg = { 
                senderId: username, 
                text: data.text.trim(), 
                status: isOnline ? 'delivered' : 'sent',
                timestamp: new Date() 
            };
            
            await saveToLinkedList(data.conversationId, msg);
            io.to(data.conversationId).emit('message', msg);
        } catch (err) {
            console.error('Error sending message:', err);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    socket.on('disconnect', () => {
        onlineUsers.delete(username);
        io.emit('user_status', { username, status: 'offline' });
    });

  
    socket.on('broadcast_message', async (data) => {
        try {
            if (!data.text || !data.text.trim()) {
                return socket.emit('error', { message: 'Broadcast message text cannot be empty' });
            }
            
            const msg = { 
                senderId: username, 
                text: data.text.trim(), 
                timestamp: new Date(),
                type: 'broadcast'
            };
            io.emit('broadcast', msg);
        } catch (err) {
            console.error('Error broadcasting message:', err);
            socket.emit('error', { message: 'Failed to broadcast message' });
        }
    });

   
socket.on('mark_read', async (data) => {
    try {
        if (!data.conversationId) {
            return socket.emit('error', { message: 'Conversation ID required' });
        }
        
        
        await ChatChunk.updateMany(
            { conversationId: data.conversationId },
            { $set: { "messages.$[elem].status": "read" } },
            { arrayFilters: [{ "elem.status": { $ne: "read" } }] }
        );

       
        io.to(data.conversationId).emit('messages_read', { conversationId: data.conversationId });
    } catch (err) {
        console.error('Error marking messages as read:', err);
        socket.emit('error', { message: 'Failed to mark messages as read' });
    }
});
});



server.listen(5000, () => console.log("Server running on 5000"));
