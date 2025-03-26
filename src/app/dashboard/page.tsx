'use client'

import { UserButton, useUser } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { MessageSquare } from 'lucide-react'

export default function DashboardPage() {
  const { user } = useUser()

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Welcome, {user?.firstName || 'User'}</h1>
        <UserButton afterSignOutUrl="/" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* AI Assistant Card */}
        <Card>
          <CardHeader>
            <CardTitle>AI Assistant</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Chat with our AI assistant to get help with tasks and file analysis.
            </p>
            <Link href="/ai-assistant">
              <Button className="w-full">
                <MessageSquare className="mr-2 h-4 w-4" />
                Open AI Assistant
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Add more dashboard cards and functionality here */}
      </div>
    </div>
  )
} 