import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server'
import TaskModel from '@/models/Task'
import AIResponseModel from '@/models/AIResponse'
import { connectToDatabase } from '@/lib/mongoose'

if (!process.env.GOOGLE_GEMINI_API_KEY) {
  throw new Error('Missing GOOGLE_GEMINI_API_KEY environment variable')
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY)
const fileManager = new GoogleAIFileManager(process.env.GOOGLE_GEMINI_API_KEY)

interface Task {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  category: string
}

function extractTasksAndFormatResponse(content: string): { 
  formattedResponse: string, 
  tasks: Task[] 
} {
  try {
    // Extract JSON from the content
    const jsonMatch = content.match(/```json([\s\S]*?)```/)
    if (!jsonMatch) {
      console.log('No JSON found in content:', content)
      return {
        formattedResponse: content,
        tasks: []
      }
    }

    const jsonContent = jsonMatch[1].trim()
    console.log('Extracted JSON:', jsonContent)

    const tasks = JSON.parse(jsonContent) as Task[]
    console.log('Parsed tasks:', tasks)
    
    // Group tasks by category
    const tasksByCategory = tasks.reduce((acc, task) => {
      if (!acc[task.category]) {
        acc[task.category] = []
      }
      acc[task.category].push(task)
      return acc
    }, {} as Record<string, Task[]>)

    // Create a natural language response with categorized tasks
    const formattedResponse = Object.entries(tasksByCategory)
      .map(([category, categoryTasks]) => {
        const tasksText = categoryTasks
          .map(task => `• ${task.title} (${task.priority} priority)\n  ${task.description}`)
          .join('\n\n')
        return `${category}:\n\n${tasksText}`
      })
      .join('\n\n')

    return {
      formattedResponse: `I've analyzed the content and organized the tasks by category:\n\n${formattedResponse}`,
      tasks
    }
  } catch (error) {
    console.error('Error parsing tasks:', error)
    console.log('Content that caused error:', content)
    return {
      formattedResponse: content.replace(/```json[\s\S]*?```/g, '').trim(),
      tasks: []
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Generate session ID for this interaction
    const sessionId = crypto.randomUUID()
    const aiResponseId = crypto.randomUUID()

    // Convert File to Buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Upload to Gemini
    const uploadResult = await fileManager.uploadFile(buffer, {
      mimeType: file.type,
      displayName: file.name,
    })

    // Poll for processing completion
    let processedFile = await fileManager.getFile(uploadResult.file.name)
    let attempts = 0
    const maxAttempts = 10

    while (processedFile.state === FileState.PROCESSING && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      processedFile = await fileManager.getFile(uploadResult.file.name)
      attempts++
    }

    if (processedFile.state === FileState.FAILED || attempts >= maxAttempts) {
      throw new Error('File processing failed or timed out')
    }

    // Generate content with the processed file
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent([
      {
        text: `Analyze this file and suggest tasks. Format your response as follows:
1. First, provide a JSON array of tasks wrapped in \`\`\`json code blocks. Each task should have:
   - title: string
   - description: string
   - priority: "low" | "medium" | "high"
   - category: string
2. After the JSON, provide a brief summary of the analysis.`
      },
      {
        inlineData: {
          data: uploadResult.file.uri,
          mimeType: uploadResult.file.mimeType
        }
      }
    ])

    const rawResponse = result.response.text()
    console.log('Raw AI response:', rawResponse)

    const { formattedResponse, tasks } = extractTasksAndFormatResponse(rawResponse)
    console.log('Extracted tasks:', tasks)

    if (tasks.length === 0) {
      console.warn('No tasks were extracted from the AI response')
      return NextResponse.json({ 
        success: false,
        error: 'No tasks were found in the AI response',
        rawResponse
      }, { status: 400 })
    }

    // Connect to database
    await connectToDatabase()

    // Save AI response
    const aiResponse = await AIResponseModel.create({
      id: aiResponseId,
      sessionId,
      rawResponse,
      formattedResponse,
      fileInfo: {
        name: file.name,
        type: file.type,
        uri: uploadResult.file.uri
      }
    })

    console.log('Saved AI response:', aiResponse)

    // Save tasks with session and AI response reference
    const tasksWithIds = tasks.map(task => ({
      ...task,
      id: crypto.randomUUID(),
      status: 'todo' as const,
      sessionId,
      aiResponseId
    }))

    console.log('Tasks to save:', tasksWithIds)
    const savedTasks = await TaskModel.insertMany(tasksWithIds)
    console.log('Saved tasks:', savedTasks)

    return NextResponse.json({ 
      success: true,
      response: formattedResponse,
      tasks: tasksWithIds,
      sessionId,
      aiResponseId,
      fileInfo: {
        name: file.name,
        type: file.type,
        uri: uploadResult.file.uri
      }
    })
  } catch (error) {
    console.error('Error in upload route:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process file' },
      { status: 500 }
    )
  }
} 