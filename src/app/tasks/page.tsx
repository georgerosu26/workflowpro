'use client'

import React, { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable, DroppableProvided, DraggableProvided, DropResult } from '@hello-pangea/dnd'
import { toast } from 'sonner'
import { useAuth, useSession } from '@clerk/nextjs'
import { Suspense } from 'react'
import { TaskList } from '@/components/TaskList'
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
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

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

  const toggleSidebar = () => {
    setSidebarExpanded(prev => !prev)
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
    <div className="w-full p-4 h-screen flex flex-col">
      <h1 className="text-2xl font-bold mb-4">Tasks</h1>
      <div className="flex gap-4 flex-1 h-[calc(100vh-6rem)] overflow-hidden">
        {/* Main content - takes more space when sidebar is collapsed */}
        <div className={`${sidebarExpanded ? 'flex-[4]' : 'flex-[6]'} overflow-auto transition-all duration-300`}>
          <Suspense fallback={<div>Loading tasks...</div>}>
            <TaskList />
          </Suspense>
        </div>
        
        {/* Sidebar toggle button */}
        <button 
          onClick={toggleSidebar}
          className="self-start mt-2 p-2 bg-gray-100 hover:bg-gray-200 rounded-md shadow-sm"
          aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarExpanded ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          )}
        </button>
        
        {/* Chat sessions sidebar - collapsed by default */}
        <div className={`
          border-l pl-4 h-full flex flex-col 
          transition-all duration-300 ease-in-out 
          ${sidebarExpanded 
            ? 'flex-1 min-w-[250px] max-w-[300px] opacity-100' 
            : 'w-0 overflow-hidden opacity-0'
          }
        `}>
          <div className="sticky top-0 bg-white pb-2 z-10">
            <h2 className="text-lg font-semibold mb-2">Chat History</h2>
          </div>
          <div className="flex-1 overflow-y-auto h-full">
            <ChatSessions 
              onSessionSelect={(sessionId: string | null) => {
                if (sessionId) {
                  const url = new URL(window.location.href)
                  url.searchParams.set('session', sessionId)
                  window.history.pushState({}, '', url)
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
} 