'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { streamChat, Message } from '@/lib/gemini'
import { uploadAndProcessFile } from '@/lib/file-utils'
import { toast } from 'sonner'
import { Upload, Image as ImageIcon, FileText, Loader2, Plus, MessageSquare } from 'lucide-react'
import Link from 'next/link'
import { UserButton, useUser, useSession } from '@clerk/nextjs'

interface TaskSuggestion {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  category: string
  sessionId?: string
  aiResponseId?: string
  userId?: string
}

interface ChatSession {
  id: string
  title: string
  updatedAt: Date
  active: boolean
}

interface UploadResponse {
  success: boolean
  response: string
  tasks: TaskSuggestion[]
  sessionId: string
  aiResponseId: string
  fileInfo: {
    name: string
    type: string
    uri: string
  }
}

interface APIMessage {
  role: string
  content: string
  fileInfo?: {
    name: string
    type: string
  }
}

export default function AIAssistantPage() {
  const { user } = useUser()
  const { session } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [partialResponse, setPartialResponse] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [taskSuggestions, setTaskSuggestions] = useState<TaskSuggestion[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [currentAiResponseId, setCurrentAiResponseId] = useState<string | null>(null)
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load chat sessions when component mounts
  useEffect(() => {
    const loadChatSessions = async () => {
      if (!user) return

      try {
        const response = await fetch('/api/chat-sessions')
        const data = await response.json()
        if (data.sessions) {
          // Sort sessions by updatedAt
          const sortedSessions = data.sessions.sort((a: ChatSession, b: ChatSession) => 
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )
          setChatSessions(sortedSessions.map((session: ChatSession) => ({
            ...session,
            active: true
          })))

          // If there are sessions, load the most recent one
          if (sortedSessions.length > 0) {
            await loadChatSession(sortedSessions[0].id)
          }
        }
      } catch (error) {
        console.error('Error loading chat sessions:', error)
        toast.error('Failed to load chat history')
      }
    }

    loadChatSessions()
  }, [user])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages, partialResponse])

  const extractTaskSuggestions = (content: string) => {
    try {
      // Try to parse JSON if the response is in JSON format
      if (content.includes('```json')) {
        const jsonStr = content.split('```json')[1].split('```')[0]
        const parsedTasks = JSON.parse(jsonStr)
        console.log('Extracted raw tasks:', parsedTasks)
        // Ensure we return an empty array if no tasks are found
        return Array.isArray(parsedTasks) ? parsedTasks : []
      }
      return []
    } catch (error) {
      console.error('Error parsing task suggestions:', error)
      return []
    }
  }

  const validateTaskSuggestion = (task: TaskSuggestion): boolean => {
    const required = ['title', 'description', 'priority', 'category', 'sessionId', 'aiResponseId', 'userId']
    const missing = required.filter(field => !task[field as keyof TaskSuggestion])
    if (missing.length > 0) {
      console.warn('Task missing required fields:', {
        task,
        missingFields: missing
      })
      return false
    }
    return true
  }

  const ensureTaskFields = (task: TaskSuggestion): TaskSuggestion => {
    if (!user) return task
    
    return {
      ...task,
      sessionId: task.sessionId || currentSessionId || crypto.randomUUID(),
      aiResponseId: task.aiResponseId || currentAiResponseId || crypto.randomUUID(),
      userId: task.userId || user.id
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !session?.id || !user) {
      console.log('Upload prevented:', { 
        file: !!file, 
        session: !!session?.id,
        user: !!user 
      })
      return
    }

    setIsLoading(true)
    try {
      const response = await uploadAndProcessFile(file)
      const { tasks, aiResponseId, fileInfo } = response

      console.log('File upload response:', {
        sessionId: session.id,
        aiResponseId,
        tasksCount: tasks.length
      })

      // Add messages to the chat
      const userMessage: Message = { 
        role: 'user', 
        content: `[Uploaded ${file.name}] Analyze this file and suggest tasks.`,
        fileInfo: {
          name: fileInfo.name,
          type: fileInfo.type,
        }
      }
      const assistantMessage: Message = {
        role: 'assistant',
        content: response.response
      }
      
      setMessages(prev => [...prev, userMessage, assistantMessage])
      
      // Update task suggestions with session info
      const tasksWithIds = tasks.map(task => ensureTaskFields({
        ...task,
        sessionId: session.id,
        aiResponseId,
        userId: user.id
      }))

      console.log('Tasks with IDs:', tasksWithIds)
      
      setTaskSuggestions(prev => [...prev, ...tasksWithIds])
      
      // Store current session info
      setCurrentSessionId(session.id)
      setCurrentAiResponseId(aiResponseId)

      // Save AI response
      await fetch('/api/airesponses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: aiResponseId,
          sessionId: session.id,
          userId: user.id,
          rawResponse: response.response,
          formattedResponse: response.response
        }),
      })
    } catch (error) {
      toast.error('Failed to process file. Please try again.')
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const startNewChat = () => {
    setMessages([])
    setCurrentSessionId(null)
    setCurrentAiResponseId(null)
    setTaskSuggestions([])
    setInput('')
    setPartialResponse('')
    setIsTyping(false)
    
    // Update chat sessions to show the current chat as inactive
    setChatSessions(prev => prev.map(chat => ({
      ...chat,
      active: false
    })))
  }

  const loadChatSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/chat-sessions/${sessionId}`)
      const data = await response.json()
      
      if (data.session?.messages) {
        setMessages(data.session.messages)
        setCurrentSessionId(sessionId)
        // Update chat sessions to mark this one as active
        setChatSessions(prev => prev.map(chat => ({
          ...chat,
          active: chat.id === sessionId
        })))
        setTaskSuggestions([]) // Clear task suggestions when loading a new chat
      }
    } catch (error) {
      console.error('Error loading chat session:', error)
      toast.error('Failed to load chat session')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading || !user) {
      return
    }

    // Create new session if this is the first message
    const sessionId = currentSessionId || crypto.randomUUID()
    const newAiResponseId = crypto.randomUUID()
    const messageTitle = input.slice(0, 50) + (input.length > 50 ? '...' : '')

    const enhancedPrompt = input + "\n\nIf this request involves tasks or actions, please suggest them in a structured JSON format with the following fields: title, description, priority (low/medium/high), and category. Wrap the JSON in ```json``` code blocks."

    const userMessage: Message = { role: 'user', content: input }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)
    setPartialResponse('')
    setIsTyping(true)

    try {
      let fullResponse = ''
      
      for await (const chunk of streamChat([...newMessages, { role: 'user', content: enhancedPrompt }])) {
        fullResponse += chunk
        setPartialResponse(fullResponse)
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: fullResponse,
      }
      
      const updatedMessages = [...newMessages, assistantMessage]
      setMessages(updatedMessages)
      setPartialResponse('')

      // If this is a new chat, create a new session
      if (!currentSessionId) {
        setCurrentSessionId(sessionId)
        // Add new session to chat history
        const newSession = {
          id: sessionId,
          title: messageTitle,
          updatedAt: new Date(),
          active: true
        }
        setChatSessions(prev => prev.map(chat => ({
          ...chat,
          active: false
        })).concat(newSession))
      } else {
        // Update existing session in chat history
        setChatSessions(prev => prev.map(chat => 
          chat.id === sessionId 
            ? { ...chat, title: messageTitle, updatedAt: new Date(), active: true }
            : { ...chat, active: false }
        ))
      }

      // Save chat session to database
      const sessionData = {
        id: sessionId,
        userId: user.id,
        title: messageTitle,
        messages: updatedMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
          ...(msg.fileInfo ? { fileInfo: msg.fileInfo } : {})
        }))
      }

      console.log('Saving chat session:', sessionData)
      const response = await fetch('/api/chat-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Failed to save chat session:', errorData)
        throw new Error(errorData.error || 'Failed to save chat session')
      }

      // Save AI response
      const aiResponseData = {
        id: newAiResponseId,
        sessionId: sessionId,
        userId: user.id,
        rawResponse: fullResponse,
        formattedResponse: fullResponse
      }

      console.log('Saving AI response:', aiResponseData)
      const aiResponse = await fetch('/api/airesponses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(aiResponseData),
      })

      if (!aiResponse.ok) {
        console.error('Failed to save AI response:', await aiResponse.json())
      }

      // Extract and save task suggestions
      const newTasks = extractTaskSuggestions(fullResponse)
      const tasksWithSession = newTasks.map(task => ({
        ...task,
        sessionId: sessionId,
        aiResponseId: newAiResponseId,
        userId: user.id
      }))

      const validTasks = tasksWithSession.filter(validateTaskSuggestion)
      setTaskSuggestions(prev => [...prev, ...validTasks.map(ensureTaskFields)])

    } catch (error) {
      console.error('Error in handleSubmit:', error)
      if (error instanceof Error) {
        toast.error(error.message)
      } else {
        toast.error('Failed to get AI response. Please try again.')
      }
    } finally {
      setIsLoading(false)
      setIsTyping(false)
    }
  }

  const addToTasks = async (task: TaskSuggestion) => {
    const enrichedTask = ensureTaskFields(task)
    console.log('Adding task - Full task object:', enrichedTask)
    console.log('Current user:', user)

    if (!user?.id || !currentSessionId) {
      const missingFields = {
        userId: !user?.id,
        sessionId: !currentSessionId
      }
      console.error('Missing required fields:', missingFields)
      toast.error(`Failed to add task: Missing ${Object.entries(missingFields)
        .filter(([_, isMissing]) => isMissing)
        .map(([field]) => field)
        .join(', ')}`)
      return
    }

    try {
      // First verify that the AI response exists
      const aiResponseCheck = await fetch(`/api/airesponses?id=${enrichedTask.aiResponseId}`)
      
      if (!aiResponseCheck.ok) {
        console.log('AI Response not found, creating one...')
        
        // Create a new AI response
        const createResponse = await fetch('/api/airesponses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: enrichedTask.aiResponseId,
            sessionId: currentSessionId,
            userId: user.id,
            rawResponse: JSON.stringify([enrichedTask]),
            formattedResponse: JSON.stringify([enrichedTask])
          }),
        })

        if (!createResponse.ok) {
          throw new Error('Failed to create AI response')
        }
      }

      // Validate priority
      const validPriorities = ['low', 'medium', 'high']
      const priority = validPriorities.includes(enrichedTask.priority) 
        ? enrichedTask.priority 
        : 'medium'

      // Validate required fields
      if (!enrichedTask.title?.trim()) {
        throw new Error('Task title is required')
      }
      if (!enrichedTask.description?.trim()) {
        throw new Error('Task description is required')
      }

      const taskData = {
        id: crypto.randomUUID(),
        title: enrichedTask.title.trim(),
        description: enrichedTask.description.trim(),
        priority: priority as 'low' | 'medium' | 'high',
        category: enrichedTask.category?.trim() || 'general',
        status: 'todo' as const,
        sessionId: currentSessionId,
        aiResponseId: enrichedTask.aiResponseId,
        userId: user.id
      }

      console.log('Sending task data:', taskData)

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tasks: [taskData]
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Server error response:', errorData)
        throw new Error(errorData.error || 'Failed to add task')
      }

      const data = await response.json()
      console.log('Server success response:', data)
      toast.success('Task added to board!')
      
      setTaskSuggestions(prev => prev.filter(t => 
        t.title !== enrichedTask.title || 
        t.description !== enrichedTask.description
      ))
    } catch (error) {
      console.error('Error adding task:', error)
      if (error instanceof Error) {
        console.error('Error details:', error.message)
        toast.error(error.message)
      } else {
        console.error('Unknown error:', error)
        toast.error('Failed to add task to board')
      }
    }
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">AI Assistant</h1>
        <UserButton afterSignOutUrl="/" />
      </div>
      
      <div className="flex gap-4">
        {/* Chat History Sidebar */}
        <div className="w-[300px] flex-shrink-0">
          <Card className="h-[calc(100vh-8rem)] flex flex-col sticky top-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Chat History</CardTitle>
              <Button onClick={startNewChat} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                New Chat
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              <div className="space-y-2">
                {chatSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No chat history yet. Start a new conversation!
                  </p>
                ) : (
                  chatSessions.map((chat) => (
                    <Button
                      key={chat.id}
                      variant={currentSessionId === chat.id ? "secondary" : "ghost"}
                      className="w-full justify-start text-left"
                      onClick={() => loadChatSession(chat.id)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2 flex-shrink-0" />
                      <div className="flex flex-col items-start overflow-hidden">
                        <span className="text-sm font-medium truncate w-full">
                          {chat.title || 'New Chat'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(chat.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </Button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1">
          <div className="space-y-4">
            {/* Chat Messages */}
            <div 
              ref={chatContainerRef}
              className="h-[500px] overflow-y-auto border rounded-lg p-4 mb-4"
            >
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <p>Start a new conversation or select a chat from the history.</p>
                </div>
              ) : (
                <>
                  {messages.map((message, i) => (
                    <div
                      key={i}
                      className={`mb-4 ${
                        message.role === 'user' ? 'text-blue-600' : 'text-gray-800'
                      }`}
                    >
                      <p className="font-semibold mb-1">
                        {message.role === 'user' ? 'You' : 'AI Assistant'}:
                      </p>
                      <div className="whitespace-pre-wrap">
                        {message.fileInfo && (
                          <div className="text-sm text-gray-500 mb-1">
                            [Uploaded: {message.fileInfo.name}]
                          </div>
                        )}
                        {message.content}
                      </div>
                    </div>
                  ))}
                  {isTyping && partialResponse && (
                    <div className="text-gray-800">
                      <p className="font-semibold mb-1">AI Assistant:</p>
                      <div className="whitespace-pre-wrap">{partialResponse}</div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me anything..."
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

            {/* Task Suggestions */}
            {taskSuggestions.length > 0 && (
              <Card className="mt-8">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Task Suggestions</CardTitle>
                  <Link href="/tasks">
                    <Button variant="ghost" size="sm">
                      View All Tasks
                    </Button>
                  </Link>
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
                              onClick={() => addToTasks(task)}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Add to Tasks
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
                            <span className="text-muted-foreground">
                              {task.category}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 