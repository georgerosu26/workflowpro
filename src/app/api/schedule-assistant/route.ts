import { NextRequest, NextResponse } from 'next/server'
import { OpenAI } from 'openai'
import { currentUser } from '@clerk/nextjs/server'
import { StreamingTextResponse } from 'ai'
import { connectToDatabase } from '@/lib/mongoose'
import Task from '@/models/Task'

// Setup OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: NextRequest) {
  try {
    // Get the current user
    const user = await currentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get the request data
    const { messages, sessionId, aiResponseId, enhancedPrompt } = await req.json()

    // Create a system message with scheduling rules and context
    const systemMessage = {
      role: 'system',
      content: `You are an intelligent scheduling assistant that helps users manage their tasks and calendar. 
      
Your primary functions:
1. Understand the user's existing calendar events and tasks
2. Help suggest optimal scheduling for new tasks 
3. Find available time slots that work around existing commitments
4. Provide scheduling recommendations based on task priority, duration, and deadlines
5. Identify potential conflicts and suggest solutions

When suggesting task schedules, consider:
- Working hours (generally 9am-5pm unless specified otherwise)
- Avoiding back-to-back meetings without breaks
- Prioritizing high-priority tasks
- Clustering similar categories of work when possible
- Allowing buffer time between tasks

The user's existing calendar events and tasks are provided as context. Always suggest specific dates and times for new tasks.

If suggesting new tasks, provide them in a structured JSON format wrapped in a code block like this:
\`\`\`json
[
  {
    "title": "Task title",
    "description": "Description of the task",
    "priority": "high|medium|low",
    "category": "category",
    "duration": 60, 
    "startDate": "2023-10-25T09:00:00Z",
    "dueDate": "2023-10-25T10:00:00Z"
  }
]
\`\`\`

Durations should be in minutes, and dates should be in ISO format.`
    }

    // Prepare API request
    const apiMessages = [
      systemMessage,
      ...messages.map((message: any) => ({
        role: message.role,
        content: message.content,
      })),
    ]

    // Add the enhanced prompt with calendar context if available
    if (enhancedPrompt) {
      apiMessages.push({
        role: 'system',
        content: `Here is the user's current calendar and task context:
        
Calendar events: ${JSON.stringify(enhancedPrompt.calendarEvents, null, 2)}

Existing tasks: ${JSON.stringify(enhancedPrompt.existingTasks, null, 2)}

The user's question is: "${enhancedPrompt.message}"

Using this context, suggest an optimal schedule for any new tasks. Be specific with dates and times.`
      })
    }

    // Make an API request to OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: apiMessages,
      temperature: 0.7,
      stream: true,
    })

    // Create a streaming text response
    return new StreamingTextResponse(response.toReadableStream())
  } catch (error) {
    console.error('Error in schedule-assistant API route:', error)
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    )
  }
}

// Helper function to find available time slots
async function findAvailableTimeSlots(
  calendarEvents: any[],
  taskDuration: number,
  startDate: Date,
  endDate: Date
) {
  // Sort events chronologically
  const sortedEvents = [...calendarEvents].sort((a, b) => 
    new Date(a.start).getTime() - new Date(b.start).getTime()
  )

  // Define working hours (9 AM to 5 PM)
  const workingHoursStart = 9
  const workingHoursEnd = 17

  // Available slots array
  const availableSlots = []

  // Current date pointer
  let currentDate = new Date(startDate)
  currentDate.setHours(workingHoursStart, 0, 0, 0)

  // Loop through each day
  while (currentDate < endDate) {
    // Skip weekends
    if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
      currentDate = new Date(currentDate)
      currentDate.setDate(currentDate.getDate() + 1)
      currentDate.setHours(workingHoursStart, 0, 0, 0)
      continue
    }

    // Set end of working day
    const endOfDay = new Date(currentDate)
    endOfDay.setHours(workingHoursEnd, 0, 0, 0)

    // Find events for the current day
    const eventsForDay = sortedEvents.filter(event => {
      const eventStart = new Date(event.start)
      const eventEnd = new Date(event.end)
      return eventStart <= endOfDay && eventEnd >= currentDate
    })

    if (eventsForDay.length === 0) {
      // No events for the day, entire working day is available
      availableSlots.push({
        start: new Date(currentDate),
        end: new Date(endOfDay),
        duration: (workingHoursEnd - workingHoursStart) * 60
      })
    } else {
      // Check for gaps between events
      let timePointer = new Date(currentDate)

      for (const event of eventsForDay) {
        const eventStart = new Date(event.start)
        const eventEnd = new Date(event.end)

        // If there's a gap before the event
        if (eventStart > timePointer) {
          const gapMinutes = (eventStart.getTime() - timePointer.getTime()) / 60000
          
          // If the gap is large enough for the task
          if (gapMinutes >= taskDuration) {
            availableSlots.push({
              start: new Date(timePointer),
              end: new Date(eventStart),
              duration: gapMinutes
            })
          }
        }

        // Move pointer to after this event
        timePointer = new Date(Math.max(timePointer.getTime(), eventEnd.getTime()))
      }

      // Check for gap after the last event until end of day
      if (timePointer < endOfDay) {
        const gapMinutes = (endOfDay.getTime() - timePointer.getTime()) / 60000
        
        if (gapMinutes >= taskDuration) {
          availableSlots.push({
            start: new Date(timePointer),
            end: new Date(endOfDay),
            duration: gapMinutes
          })
        }
      }
    }

    // Move to next day
    currentDate = new Date(currentDate)
    currentDate.setDate(currentDate.getDate() + 1)
    currentDate.setHours(workingHoursStart, 0, 0, 0)
  }

  return availableSlots
} 