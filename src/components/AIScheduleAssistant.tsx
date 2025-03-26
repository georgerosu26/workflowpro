'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Calendar as CalendarIcon, Clock, Plus } from 'lucide-react'
import { useUser, useSession } from '@clerk/nextjs'

// Define types for our component
interface Task {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  category: string
  status: 'todo' | 'in-progress' | 'done'
  startDate?: string | Date
  dueDate?: string | Date
  isAllDay?: boolean
  duration?: number // in minutes
  sessionId?: string
  aiResponseId?: string
  userId?: string
  createdAt: Date // Change to required
  updatedAt: Date // Change to required
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  fileInfo?: {
    name: string
    type: string
  }
}

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  priority?: 'low' | 'medium' | 'high'
}

interface AIScheduleAssistantProps {
  existingTasks: Task[]
  calendarEvents: CalendarEvent[]
  onCreateTask: (task: Omit<Task, 'id'>) => Promise<string>
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void>
  onScheduleRefresh: () => void
}

export function AIScheduleAssistant({
  existingTasks,
  calendarEvents,
  onCreateTask,
  onUpdateTask,
  onScheduleRefresh
}: AIScheduleAssistantProps) {
  const { user } = useUser()
  const { session } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [partialResponse, setPartialResponse] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [taskSuggestions, setTaskSuggestions] = useState<Omit<Task, 'id'>[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [currentAiResponseId, setCurrentAiResponseId] = useState<string | null>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages, partialResponse])

  // Helper function to create a session ID if none exists
  const getOrCreateSessionId = () => {
    if (currentSessionId) return currentSessionId
    
    const newSessionId = crypto.randomUUID()
    setCurrentSessionId(newSessionId)
    return newSessionId
  }

  // Helper function to format calendar events for AI
  const formatCalendarEventsForAI = () => {
    return calendarEvents.map(event => ({
      title: event.title,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      allDay: event.allDay
    }))
  }

  // Helper function to format tasks for AI
  const formatTasksForAI = () => {
    return existingTasks.map(task => ({
      title: task.title,
      description: task.description,
      priority: task.priority,
      category: task.category,
      status: task.status,
      startDate: task.startDate,
      dueDate: task.dueDate
    }))
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading || !user) {
      return
    }

    // Create session ID if needed
    const sessionId = getOrCreateSessionId()
    const newAiResponseId = crypto.randomUUID()
    
    // Add user message to chat
    const userMessage: Message = { role: 'user', content: input }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)
    setPartialResponse('')
    setIsTyping(true)

    try {
      // Combine current calendar events and tasks for context
      const calendarContext = formatCalendarEventsForAI()
      const tasksContext = formatTasksForAI()

      // Enhance the prompt with scheduling context
      const enhancedPrompt = {
        message: input,
        calendarEvents: calendarContext,
        existingTasks: tasksContext,
        currentSession: sessionId
      }

      // Stream the response
      const response = await fetch('/api/schedule-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: newMessages,
          sessionId,
          aiResponseId: newAiResponseId,
          enhancedPrompt
        }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        console.error('API error response:', errorText)
        throw new Error(`Server error: ${response.status} - ${errorText || response.statusText}`)
      }

      if (!response.body) {
        throw new Error('Response body is null')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let responseText = ''
      let aiResponseData = null

      // Stream in the response
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          responseText += chunk

          // Look for task suggestions in JSON format
          try {
            if (chunk.includes('```json') && chunk.includes('```')) {
              const jsonMatch = chunk.match(/```json\n([\s\S]*?)\n```/)
              if (jsonMatch && jsonMatch[1]) {
                const parsedData = JSON.parse(jsonMatch[1])
                if (Array.isArray(parsedData)) {
                  aiResponseData = parsedData
                }
              }
            }
          } catch (jsonError) {
            console.warn('Error parsing JSON from chunk:', jsonError)
          }

          setPartialResponse(responseText)
        }
      } catch (streamError) {
        console.error('Error reading stream:', streamError)
        if (responseText) {
          // We got some response before the error, so we can still use it
          toast.warning('Response was interrupted, but partial content was received')
        } else {
          throw new Error('Failed to read response stream')
        }
      }

      // Process any task suggestions from the response
      if (aiResponseData) {
        try {
          processSuggestedTasks(aiResponseData, sessionId, newAiResponseId)
        } catch (taskError) {
          console.error('Error processing task suggestions:', taskError)
          toast.error('Failed to process task suggestions')
        }
      }

      // Add assistant's response to messages
      const assistantMessage: Message = { 
        role: 'assistant', 
        content: responseText || 'Sorry, I was unable to generate a complete response.'
      }
      
      setMessages(prev => [...prev, assistantMessage])
      setCurrentAiResponseId(newAiResponseId)

      // Save the chat session
      try {
        await saveChatSession(sessionId, [...newMessages, assistantMessage])
      } catch (saveError) {
        console.error('Error saving chat session:', saveError)
        // Non-critical error, don't throw
      }

    } catch (error) {
      console.error('Error getting AI response:', error)
      toast.error(`AI assistant error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      
      // Add error message to chat
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your request. Please try again later.'
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
      setIsTyping(false)
      setPartialResponse('')
    }
  }

  // Process and display task suggestions from AI
  const processSuggestedTasks = (tasks: any[], sessionId: string, aiResponseId: string) => {
    // Validate and normalize tasks
    const validTasks = tasks.filter(task => 
      task.title && 
      task.description &&
      ['low', 'medium', 'high'].includes(task.priority)
    ).map(task => ({
      title: task.title,
      description: task.description,
      priority: task.priority as 'low' | 'medium' | 'high',
      category: task.category || 'general',
      status: 'todo' as const,
      sessionId,
      aiResponseId,
      userId: user?.id,
      startDate: task.startDate || undefined,
      dueDate: task.dueDate || undefined,
      duration: task.duration || 60, // default 1 hour if not specified
      createdAt: new Date(), // Add current date for createdAt
      updatedAt: new Date()  // Add current date for updatedAt
    }))

    setTaskSuggestions(validTasks)
  }

  // Save chat session to database
  const saveChatSession = async (sessionId: string, messages: Message[]) => {
    try {
      await fetch('/api/chat-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: sessionId,
          userId: user?.id,
          title: 'Schedule Planning',
          messages
        }),
      })
    } catch (error) {
      console.error('Error saving chat session:', error)
    }
  }

  // Add a suggested task to the calendar
  const addToSchedule = async (task: Omit<Task, 'id'>) => {
    try {
      // Make sure we have all required fields
      const fullTask = {
        ...task,
        // Ensure required fields exist even if they weren't in the original task suggestion
        createdAt: task.createdAt || new Date(),
        updatedAt: task.updatedAt || new Date(),
        sessionId: task.sessionId || getOrCreateSessionId(),
        aiResponseId: task.aiResponseId || currentAiResponseId || crypto.randomUUID(),
        userId: task.userId || user?.id
      };

      // Create the task first
      const taskId = await onCreateTask(fullTask)
      
      // If we have scheduling info, update with it
      if (task.startDate && task.dueDate) {
        await onUpdateTask(taskId, {
          startDate: task.startDate,
          dueDate: task.dueDate
        })
      }
      
      // Remove from suggestions
      setTaskSuggestions(prev => prev.filter(t => t.title !== task.title))
      
      // Refresh the schedule view
      onScheduleRefresh()
      
      toast.success('Task added to schedule')
    } catch (error) {
      console.error('Error adding task to schedule:', error)
      toast.error('Failed to add task to schedule')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Card className="flex-1 flex flex-col h-full overflow-hidden">
        <CardHeader className="flex-shrink-0">
          <CardTitle>Schedule Assistant</CardTitle>
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col overflow-hidden p-4">
          {/* Messages Container */}
          <ScrollArea className="flex-1 pr-4 h-[calc(100%-8rem)]" ref={chatContainerRef}>
            <div className="space-y-4 mb-4">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground p-4">
                  <div className="mb-2">
                    <CalendarIcon className="h-12 w-12 mx-auto opacity-50 mb-2" />
                    <h3 className="text-lg font-medium">Schedule Assistant</h3>
                  </div>
                  <p>Ask me to help schedule your tasks around your existing calendar events.</p>
                  <div className="mt-4 text-sm">
                    <p>For example:</p>
                    <ul className="text-left list-disc pl-6 mt-2 space-y-1">
                      <li>"Help me schedule my work for this week"</li>
                      <li>"I need to add 3 new tasks to my schedule"</li>
                      <li>"Find time for me to work on project X"</li>
                    </ul>
                  </div>
                </div>
              )}
              
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === 'assistant' ? 'justify-start' : 'justify-end'
                  }`}
                >
                  <div
                    className={`max-w-[80%] p-4 rounded-lg ${
                      message.role === 'assistant'
                        ? 'bg-muted'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              ))}
              
              {isTyping && partialResponse && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] p-4 rounded-lg bg-muted">
                    <div className="whitespace-pre-wrap">{partialResponse}</div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the scheduler assistant..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Send'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Task Suggestions Panel */}
      {taskSuggestions.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Suggested Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {taskSuggestions.map((task, index) => (
                <Card key={index} className="bg-muted">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-base">{task.title}</CardTitle>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => addToSchedule(task)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add to Schedule
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-2">
                      {task.description}
                    </p>
                    <div className="flex justify-between text-sm">
                      <span className={`px-2 py-1 rounded ${
                        task.priority === 'high' ? 'bg-red-100 text-red-800' :
                        task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {task.priority}
                      </span>
                      <div className="flex gap-2 items-center">
                        <span className="text-muted-foreground">
                          {task.category}
                        </span>
                        {task.duration && (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {task.duration} min
                          </Badge>
                        )}
                      </div>
                    </div>
                    {task.startDate && task.dueDate && (
                      <div className="mt-2 text-xs flex items-center gap-1 text-muted-foreground">
                        <CalendarIcon className="h-3 w-3" />
                        <span>
                          {new Date(task.startDate).toLocaleString()} - {new Date(task.dueDate).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 