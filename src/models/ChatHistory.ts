import mongoose from 'mongoose'

interface Message {
  role: 'user' | 'assistant'
  content: string
  fileInfo?: {
    name: string
    type: string
  }
}

interface ChatHistory {
  sessionId: string
  messages: Message[]
  lastUpdated: Date
}

const chatHistorySchema = new mongoose.Schema<ChatHistory>({
  sessionId: { type: String, required: true, unique: true },
  messages: [{
    role: { 
      type: String, 
      required: true,
      enum: ['user', 'assistant']
    },
    content: { type: String, required: true },
    fileInfo: {
      name: String,
      type: String
    }
  }],
  lastUpdated: { type: Date, default: Date.now }
}, {
  timestamps: true
})

// Create index for better query performance
chatHistorySchema.index({ sessionId: 1 })
chatHistorySchema.index({ lastUpdated: -1 })

const ChatHistoryModel = mongoose.models.ChatHistory || mongoose.model<ChatHistory>('ChatHistory', chatHistorySchema)

export default ChatHistoryModel 