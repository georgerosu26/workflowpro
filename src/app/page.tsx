import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function Home() {
  return (
    <div className="flex flex-col gap-8">
      {/* Hero Section */}
      <section className="mx-auto flex max-w-[980px] flex-col items-center gap-4 py-8 md:py-12 text-center">
        <h1 className="text-3xl font-bold leading-tight tracking-tighter md:text-6xl lg:leading-[1.1]">
          Transform Your Workflow with AI-Powered Intelligence
        </h1>
        <p className="max-w-[750px] text-lg text-muted-foreground sm:text-xl">
          Streamline your tasks, automate workflows, and boost productivity with
          our intelligent workspace platform.
        </p>
        <div className="flex gap-4">
          <Link href="/dashboard">
            <Button size="lg">Get Started</Button>
          </Link>
          <Link href="/demo">
            <Button variant="outline" size="lg">
              Live Demo
            </Button>
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>AI Assistant</CardTitle>
            <CardDescription>
              Intelligent support for your workflow
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-4 space-y-2">
              <li>Smart task suggestions</li>
              <li>Natural language processing</li>
              <li>Automated workflow optimization</li>
              <li>Context-aware assistance</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Task Management</CardTitle>
            <CardDescription>
              Organize and track your work efficiently
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-4 space-y-2">
              <li>Kanban board visualization</li>
              <li>Priority-based organization</li>
              <li>Progress tracking</li>
              <li>Team collaboration tools</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workflow Integration</CardTitle>
            <CardDescription>
              Seamless connection with your tools
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-4 space-y-2">
              <li>Custom API integrations</li>
              <li>Automated actions</li>
              <li>Real-time synchronization</li>
              <li>Extensible platform</li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
