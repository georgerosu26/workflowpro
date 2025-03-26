import mongoose, { Document } from 'mongoose'

export interface TaskDocument extends Document {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  category: string
  status: 'todo' | 'in-progress' | 'done'
  sessionId: string
  aiResponseId: string
  userId: string
  startDate: Date
  dueDate: Date
  isAllDay: boolean
  createdAt: Date
  updatedAt: Date
}

const TaskSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['todo', 'in-progress', 'done'],
    required: true,
  },
  sessionId: {
    type: String,
    required: true,
  },
  aiResponseId: {
    type: String,
  },
  userId: {
    type: String,
    required: true,
  },
  startDate: {
    type: Date,
  },
  dueDate: {
    type: Date,
  },
  isAllDay: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
})

// Update the updatedAt timestamp before saving
TaskSchema.pre('save', function(next) {
  this.updatedAt = new Date()
  next()
})

// Create indexes for better query performance
TaskSchema.index({ userId: 1 })
TaskSchema.index({ sessionId: 1 })
TaskSchema.index({ aiResponseId: 1 })
TaskSchema.index({ status: 1 })

const Task = mongoose.models.Task || mongoose.model<TaskDocument>('Task', TaskSchema)

export default Task 