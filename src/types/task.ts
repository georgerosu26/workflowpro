export interface TaskSuggestion {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  category: string
  sessionId?: string
  aiResponseId?: string
  userId?: string
}

export interface Task extends Omit<TaskSuggestion, 'sessionId' | 'aiResponseId' | 'userId'> {
  id: string
  status: 'todo' | 'in-progress' | 'done'
  sessionId: string
  aiResponseId: string
  userId: string
  createdAt?: Date
  updatedAt?: Date
}

export interface Column {
  id: 'todo' | 'in-progress' | 'completed'
  title: string
  color: string
} 