import mongoose, { Document } from 'mongoose'

export interface ChatSessionDocument extends Document {
  id: string
  userId: string
  title: string
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    fileInfo?: {
      name: string
      type: string
    }
  }>
  createdAt: Date
  updatedAt: Date
}

const ChatSessionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: [true, 'Session ID is required'],
    trim: true
  },
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    trim: true
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    default: 'New Chat',
    trim: true,
    maxlength: [500, 'Title cannot be longer than 500 characters']
  },
  messages: [{
    _id: false, // Disable automatic _id for subdocuments
    role: {
      type: String,
      enum: {
        values: ['user', 'assistant'],
        message: '{VALUE} is not a valid role'
      },
      required: [true, 'Message role is required']
    },
    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true
    },
    fileInfo: {
      _id: false, // Disable automatic _id for subdocuments
      name: String,
      type: String
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true, // Automatically manage createdAt and updatedAt
  strict: true, // Only allow fields defined in the schema
  versionKey: '__v' // Use default version key name
})

// Create indexes matching the MongoDB structure
ChatSessionSchema.index({ id: 1 }, { unique: true })
ChatSessionSchema.index({ userId: 1 })
ChatSessionSchema.index({ createdAt: -1 })

// Add error handling middleware
ChatSessionSchema.post('save', function(error: any, doc: any, next: any) {
  if (error.name === 'MongoServerError' && error.code === 11000) {
    next(new Error('A chat session with this ID already exists'))
  } else {
    next(error)
  }
})

// Clean up old indexes that might exist
const cleanup = async () => {
  try {
    const model = mongoose.models.ChatSession || mongoose.model<ChatSessionDocument>('ChatSession', ChatSessionSchema)
    await model.collection.dropIndex('sessionId_1')
    await model.collection.dropIndex('userId_1_id_1')
  } catch (error) {
    // Ignore errors if indexes don't exist
  }
}

cleanup()

export const ChatSession = mongoose.models.ChatSession || mongoose.model<ChatSessionDocument>('ChatSession', ChatSessionSchema) 