import { GoogleGenerativeAI } from '@google/generative-ai'

// Initialize the Google Generative AI with your API key
const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY || '')

// Create a reusable chat model
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

export type Message = {
  role: 'user' | 'assistant'
  content: string
  fileInfo?: {
    name: string
    type: string
  }
}

// Map our roles to Gemini roles
function mapRoleToGemini(role: 'user' | 'assistant'): string {
  return role === 'assistant' ? 'model' : 'user'
}

export async function chat(messages: Message[]): Promise<string> {
  try {
    // Start a chat session
    const chat = model.startChat()

    // Send all previous messages to maintain context
    for (const message of messages) {
      if (message.role === 'user') {
        await chat.sendMessage(message.content)
      }
    }

    // Get the response for the last message
    const lastMessage = messages[messages.length - 1]
    const result = await chat.sendMessage(lastMessage.content)
    const response = await result.response
    const text = response.text()

    return text
  } catch (error) {
    console.error('Error in chat:', error)
    throw new Error('Failed to get AI response')
  }
}

export async function* streamChat(messages: Message[]) {
  try {
    const chat = model.startChat({
      history: messages.slice(0, -1).map(msg => ({
        role: mapRoleToGemini(msg.role),
        parts: [{ text: msg.content }],
      })),
    })

    const result = await chat.sendMessageStream(messages[messages.length - 1].content)

    for await (const chunk of result.stream) {
      const text = chunk.text()
      yield text
    }
  } catch (error) {
    console.error('Error in streamChat:', error)
    throw error
  }
} 