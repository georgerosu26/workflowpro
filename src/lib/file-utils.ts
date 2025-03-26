import { TaskSuggestion } from '@/types/task'

export interface UploadResponse {
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

export async function uploadAndProcessFile(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error('Failed to upload file')
  }

  const data = await response.json()
  return data
} 