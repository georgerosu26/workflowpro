import { Document } from 'mongoose'

export interface AIResponse extends Document {
  id: string
  sessionId: string
  userId: string
  rawResponse: string
  formattedResponse: string
  createdAt: Date
  updatedAt: Date
}

export interface Task extends Document {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  category: string
  status: 'todo' | 'in-progress' | 'done'
  sessionId: string
  aiResponseId: string
  userId: string
  createdAt: Date
  updatedAt: Date
} 