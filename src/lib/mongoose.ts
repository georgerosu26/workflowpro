import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env')
}

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  var mongoose: MongooseCache | undefined
}

let cached: MongooseCache = global.mongoose || { conn: null, promise: null }

if (!global.mongoose) {
  global.mongoose = { conn: null, promise: null }
  cached = global.mongoose
}

export async function connectToDatabase() {
  if (cached.conn) {
    console.log('Using cached database connection')
    return cached.conn
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }

    console.log('Creating new database connection')
    cached.promise = mongoose.connect(MONGODB_URI!, opts)
      .then((mongoose) => {
        console.log('Database connected successfully')
        mongoose.connection.on('error', (err) => {
          console.error('MongoDB connection error:', err)
          cached.conn = null
          cached.promise = null
        })
        return mongoose
      })
      .catch((err) => {
        console.error('Failed to connect to database:', err)
        cached.promise = null
        throw err
      })
  }

  try {
    cached.conn = await cached.promise
    return cached.conn
  } catch (e) {
    console.error('Error establishing database connection:', e)
    cached.conn = null
    cached.promise = null
    throw e
  }
}

// Re-export mongoose for convenience
export { mongoose } 