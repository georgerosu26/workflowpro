'use client'

import React, { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable, DroppableProvided, DraggableProvided, DropResult } from '@hello-pangea/dnd'
import { toast } from 'sonner'
import { useAuth, useSession } from '@clerk/nextjs'
import { Suspense } from 'react'
import TaskList from '@/components/TaskList'
import { ChatSessions } from '@/components/ChatSessions'

interface Task {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  category: string
  status: 'todo' | 'in-progress' | 'done'
  sessionId: string
  aiResponseId?: string
  userId: string
}

interface AIResponse {
  formattedResponse: string
  fileInfo: {
    name: string
    type: string
    uri: string
  }
}

interface TasksResponse {
  tasks: Task[]
  aiResponse: AIResponse | null
}

export default function TasksPage() {
  const { userId } = useAuth()
  const { session } = useSession()
  const [tasks, setTasks] = useState<Task[]>([])
  const [aiResponse, setAIResponse] = useState<AIResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)

  useEffect(() => {
    if (session?.id && userId) {
      fetchTasks()
    } else {
      setError('Please sign in to view your tasks')
      setLoading(false)
    }
  }, [session?.id, userId])

  const fetchTasks = async () => {
    if (!session?.id || !userId) {
      setError('Authentication required')
      return
    }

    try {
      setLoading(true)
      setError(null)
      console.log('Fetching tasks with sessionId:', session.id, 'and userId:', userId)
      
      const response = await fetch(`/api/tasks?sessionId=${session.id}&userId=${userId}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch tasks')
      }

      const data: TasksResponse = await response.json()
      console.log('Fetched data:', data)

      setTasks(data.tasks || [])
      setAIResponse(data.aiResponse)
    } catch (error) {
      console.error('Error fetching tasks:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch tasks')
      toast.error('Failed to fetch tasks')
    } finally {
      setLoading(false)
    }
  }

  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    if (!session?.id || !userId) {
      toast.error('Please sign in to update tasks')
      return
    }

    try {
      setUpdatingTaskId(taskId)
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          status: newStatus,
          sessionId: session.id,
          userId: userId
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update task')
      }

      // Optimistically update the UI
      setTasks(prevTasks =>
        prevTasks.map(task =>
          task.id === taskId ? { ...task, status: newStatus as Task['status'] } : task
        )
      )

      toast.success('Task updated successfully')
    } catch (error) {
      console.error('Error updating task:', error)
      toast.error('Failed to update task status')
      
      // Revert the optimistic update
      await fetchTasks()
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return

    const { source, destination, draggableId } = result

    if (source.droppableId !== destination.droppableId) {
      // Update task status in the database
      updateTaskStatus(draggableId, destination.droppableId)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <span className="ml-2">Loading tasks...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={() => session?.id ? fetchTasks() : null}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  const columns = {
    todo: tasks.filter(task => task.status === 'todo'),
    'in-progress': tasks.filter(task => task.status === 'in-progress'),
    done: tasks.filter(task => task.status === 'done'),
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex gap-4">
        {/* Main content */}
        <div className="flex-1">
          <h1 className="text-2xl font-bold mb-4">Tasks</h1>
          <Suspense fallback={<div>Loading tasks...</div>}>
            <TaskList />
          </Suspense>
        </div>
        
        {/* Chat sessions sidebar */}
        <div className="w-80 border-l pl-4">
          <ChatSessions 
            onSessionSelect={(sessionId) => {
              // Update URL with session filter
              const url = new URL(window.location.href)
              url.searchParams.set('session', sessionId)
              window.history.pushState({}, '', url)
              // The TaskList component will handle the filter via useSearchParams
            }}
          />
        </div>
      </div>
    </div>
  )
} 