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
    default: 'medium',
  },
  category: {
    type: String,
    required: true,
    default: 'general',
  },
  status: {
    type: String,
    enum: ['todo', 'in-progress', 'done'],
    default: 'todo',
  },
  sessionId: {
    type: String,
    required: true,
  },
  aiResponseId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  startDate: {
    type: Date,
    default: Date.now,
  },
  dueDate: {
    type: Date,
    default: () => {
      const date = new Date()
      date.setDate(date.getDate() + 7) // Default due date is 7 days from creation
      return date
    },
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