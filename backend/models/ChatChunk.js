const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    senderId: String,
    text: String,
    status: {
        type: String,
        default: "sent"
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const chatChunkSchema = new mongoose.Schema({
    conversationId: String,
    messages: [messageSchema],
    sizeInBytes: {
        type: Number,
        default: 0
    },
    isFull: {
        type: Boolean,
        default: false
    },
    prevChunkId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ChatChunk"
    }
}, { timestamps: true });


chatChunkSchema.index({ conversationId: 1 });
chatChunkSchema.index({ conversationId: 1, isFull: 1 });

module.exports = mongoose.model("ChatChunk", chatChunkSchema);
