'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { streamChat, Message } from '@/lib/gemini'
import { uploadAndProcessFile } from '@/lib/file-utils'
import { toast } from 'sonner'
import { Upload, Image as ImageIcon, FileText, Loader2, Plus, MessageSquare } from 'lucide-react'
import Link from 'next/link'
import { UserButton, useUser, useSession } from '@clerk/nextjs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'

interface TaskSuggestion {
  id?: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  category: string
  status?: 'todo' | 'in-progress' | 'done'
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

export function AIAssistantTab() {
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

  const loadChatSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/chat-sessions/${sessionId}`)
      if (!response.ok) throw new Error('Failed to load chat session')
      
      const data = await response.json()
      if (data.session) {
        setMessages(data.session.messages)
        setCurrentSessionId(data.session.id)
        
        // Preserve the current tab when switching sessions
        const searchParams = new URLSearchParams(window.location.search)
        const currentTab = searchParams.get('tab') || 'ai-assistant'
        const newUrl = `${window.location.pathname}?session=${sessionId}&tab=${currentTab}`
        window.history.replaceState({ path: newUrl }, '', newUrl)
        
        // Extract tasks from assistant messages
        const newTasks: TaskSuggestion[] = []
        data.session.messages.forEach((message: Message) => {
          if (message.role === 'assistant') {
            const extractedTasks = extractTaskSuggestions(message.content)
            if (extractedTasks.length > 0) {
              const tasksWithSession = extractedTasks.map(task => ({
                ...task,
                sessionId: data.session.id,
                userId: user?.id
              }))
              newTasks.push(...tasksWithSession)
            }
          }
        })

        // Fetch existing tasks to filter out ones that have already been added
        const tasksResponse = await fetch(`/api/tasks?sessionId=${data.session.id}`)
        if (tasksResponse.ok) {
          const tasksData = await tasksResponse.json()
          const existingTasks = tasksData.tasks || []
          
          // Filter out tasks that have already been added to the Kanban board
          const filteredTasks = newTasks.filter(newTask => 
            !existingTasks.some((existingTask: any) => 
              existingTask.title === newTask.title &&
              existingTask.description === newTask.description &&
              existingTask.priority === newTask.priority &&
              existingTask.category === newTask.category
            )
          )
          
          // Update task suggestions with filtered tasks
          setTaskSuggestions(filteredTasks.map(ensureTaskFields))
        } else {
          // If we can't fetch existing tasks, just show all suggestions
          setTaskSuggestions(newTasks.map(ensureTaskFields))
        }
        
        // Update active state in chat sessions
        setChatSessions(prev => prev.map(chat => ({
          ...chat,
          active: chat.id === sessionId
        })))
      }
    } catch (error) {
      console.error('Error loading chat session:', error)
      toast.error('Failed to load chat session')
    }
  }

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
      id: crypto.randomUUID(),
      status: 'todo' as const,
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

      // Save chat session
      const sessionData = {
        id: session.id,
        userId: user.id,
        title: `File Analysis: ${file.name}`,
        messages: [...messages, userMessage, assistantMessage]
      }

      const sessionResponse = await fetch('/api/chat-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData),
      })

      if (!sessionResponse.ok) {
        throw new Error('Failed to save chat session')
      }

      toast.success('File processed successfully!')
    } catch (error) {
      console.error('Error processing file:', error)
      toast.error('Failed to process file')
    } finally {
      setIsLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
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

      // Save tasks to database
      if (validTasks.length > 0) {
        const tasksResponse = await fetch('/api/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tasks: validTasks }),
        })

        if (!tasksResponse.ok) {
          console.error('Failed to save tasks:', await tasksResponse.json())
        }
      }

      // Refresh chat sessions
      const chatSessionsResponse = await fetch('/api/chat-sessions')
      if (chatSessionsResponse.ok) {
        const data = await chatSessionsResponse.json()
        if (data.sessions) {
          const sortedSessions = data.sessions.sort((a: ChatSession, b: ChatSession) => 
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )
          setChatSessions(sortedSessions.map((session: ChatSession) => ({
            ...session,
            active: session.id === sessionId
          })))
        }
      }

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

  const addTask = async (task: TaskSuggestion) => {
    try {
      const taskWithFields = ensureTaskFields(task);
      console.log('Adding task:', taskWithFields);
      
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tasks: [taskWithFields] }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to add task:', errorData);
        throw new Error(errorData.error || 'Failed to add task');
      }

      const responseData = await response.json();
      console.log('Task added successfully:', responseData);

      // Remove the task from suggestions after successful addition
      setTaskSuggestions(prev => prev.filter(t => 
        // Compare all relevant fields to ensure we remove the correct task
        !(t.title === task.title && 
          t.description === task.description && 
          t.priority === task.priority && 
          t.category === task.category)
      ));

      // Save the updated task suggestions to the session
      if (currentSessionId) {
        const updatedSession = {
          id: currentSessionId,
          userId: user?.id,
          title: messages[0]?.content.slice(0, 50) || 'New Chat',
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content,
            ...(msg.fileInfo ? { fileInfo: msg.fileInfo } : {})
          })),
          taskSuggestions: taskSuggestions.filter(t => 
            !(t.title === task.title && 
              t.description === task.description && 
              t.priority === task.priority && 
              t.category === task.category)
          )
        };

        await fetch('/api/chat-sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatedSession),
        });
      }

      // Trigger a refresh of the Kanban board by dispatching a custom event
      const refreshEvent = new CustomEvent('refreshTasks', {
        detail: { sessionId: currentSessionId }
      });
      window.dispatchEvent(refreshEvent);

      toast.success('Task added successfully!');
    } catch (error) {
      console.error('Error adding task:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add task');
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-12rem)]">
      {/* Chat Sessions Sidebar */}
      <div className="w-full md:w-64 flex-shrink-0 bg-background">
        <div className="p-4 border-b">
          <Button 
            onClick={() => {
              setMessages([])
              setCurrentSessionId(null)
              setChatSessions(prev => prev.map(chat => ({ ...chat, active: false })))
            }}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" /> New Chat
          </Button>
        </div>
        <ScrollArea className="h-full">
          <div className="p-2 space-y-2">
            {chatSessions.map((chat) => (
              <Button
                key={chat.id}
                variant={chat.active ? "secondary" : "ghost"}
                className="w-full justify-start text-left"
                onClick={() => loadChatSession(chat.id)}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                <span className="truncate">{chat.title}</span>
              </Button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-h-0">
        <Card className="flex-1 flex flex-col h-full overflow-hidden">
          <CardHeader className="flex-shrink-0">
            <CardTitle>AI Assistant</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col overflow-hidden p-4">
            {/* Messages Container */}
            <ScrollArea className="flex-1 pr-4 h-[calc(100%-8rem)]">
              <div className="space-y-4 mb-4">
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
                      {message.fileInfo ? (
                        <div className="flex items-center gap-2 mb-2">
                          {message.fileInfo.type.startsWith('image/') ? (
                            <ImageIcon className="h-4 w-4" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                          <span className="text-sm">{message.fileInfo.name}</span>
                        </div>
                      ) : null}
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
            <div className="mt-4 space-y-4 flex-shrink-0">
              <div className="flex gap-2">
                <Input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".txt,.md,.json,.csv,.pdf,image/*"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload File
                </Button>
              </div>
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message..."
                  disabled={isLoading}
                />
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Send'
                  )}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task Suggestions Panel */}
      <div className="w-full md:w-80 flex-shrink-0">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Task Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-16rem)]">
              <div className="space-y-4">
                {taskSuggestions.length === 0 ? (
                  <p className="text-muted-foreground text-center">
                    No task suggestions yet. Start a conversation to get suggestions!
                  </p>
                ) : (
                  taskSuggestions.map((task, index) => (
                    <Card key={index} className="p-4">
                      <h4 className="font-semibold">{task.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {task.description}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Badge
                          variant={
                            task.priority === 'high'
                              ? 'destructive'
                              : task.priority === 'medium'
                              ? 'secondary'
                              : 'outline'
                          }
                        >
                          {task.priority}
                        </Badge>
                        <Badge variant="outline">{task.category}</Badge>
                      </div>
                      <div className="mt-3">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full"
                          onClick={() => addTask(task)}
                        >
                          Add Task
                        </Button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 