import mongoose from 'mongoose'

const AIResponseSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  sessionId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  rawResponse: {
    type: String,
    required: true,
  },
  formattedResponse: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
})

// Update the updatedAt timestamp before saving
AIResponseSchema.pre('save', function(next) {
  this.updatedAt = new Date()
  next()
})

const AIResponse = mongoose.models.AIResponse || mongoose.model('AIResponse', AIResponseSchema)

export default AIResponse 