import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '../../db/mongoose'
import ChatHistoryModel from '@/models/ChatHistory'

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase()

    // Get the session ID from the query parameters
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')

    let chatHistory
    if (sessionId) {
      // Get chat history for specific session
      chatHistory = await ChatHistoryModel.findOne({ sessionId })
    } else {
      // Get most recent chat history
      chatHistory = await ChatHistoryModel.findOne().sort({ lastUpdated: -1 })
    }

    if (!chatHistory) {
      return NextResponse.json({ messages: [] })
    }

    return NextResponse.json(chatHistory)
  } catch (error) {
    console.error('Error fetching chat history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch chat history' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionId, messages } = body

    if (!sessionId || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      )
    }

    await connectToDatabase()

    // Update or create chat history
    const chatHistory = await ChatHistoryModel.findOneAndUpdate(
      { sessionId },
      { 
        sessionId,
        messages,
        lastUpdated: new Date()
      },
      { upsert: true, new: true }
    )

    return NextResponse.json(chatHistory)
  } catch (error) {
    console.error('Error saving chat history:', error)
    return NextResponse.json(
      { error: 'Failed to save chat history' },
      { status: 500 }
    )
  }
} 