import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import AIResponseModel from '@/models/AIResponse'

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase()
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')
    const sessionId = searchParams.get('sessionId')

    if (!id && !sessionId) {
      return NextResponse.json({ error: 'Either id or sessionId is required' }, { status: 400 })
    }

    let aiResponse
    if (id) {
      aiResponse = await AIResponseModel.findOne({ id })
    } else {
      // If sessionId is provided, get the most recent AI response for that session
      aiResponse = await AIResponseModel.findOne({ sessionId }).sort({ createdAt: -1 })
    }

    if (!aiResponse) {
      console.log('AI response not found for:', { id, sessionId })
      return NextResponse.json({ error: 'AI response not found' }, { status: 404 })
    }

    console.log('Found AI response:', {
      id: aiResponse.id,
      sessionId: aiResponse.sessionId,
      hasRawResponse: Boolean(aiResponse.rawResponse),
      hasFormattedResponse: Boolean(aiResponse.formattedResponse)
    })

    return NextResponse.json(aiResponse)
  } catch (error) {
    console.error('Error in GET /api/airesponses:', error)
    return NextResponse.json(
      { error: 'Failed to fetch AI response' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await connectToDatabase()

    // Validate required fields
    if (!body.id || !body.sessionId || !body.rawResponse || !body.formattedResponse) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create AI response
    const aiResponse = await AIResponseModel.create(body)
    console.log('Saved AI response:', aiResponse)

    return NextResponse.json({ success: true, aiResponse })
  } catch (error) {
    console.error('Error saving AI response:', error)
    return NextResponse.json(
      { error: 'Failed to save AI response' },
      { status: 500 }
    )
  }
} 