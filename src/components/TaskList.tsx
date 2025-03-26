import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { TaskCalendar } from './TaskCalendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AIAssistantTab } from './AIAssistantTab';
import { useParams } from 'next/navigation';
import { KanbanBoard } from './KanbanBoard';

interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
  status: 'todo' | 'in-progress' | 'done';
  sessionId: string;
  aiResponseId: string;
  userId: string;
  startDate?: Date;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function TaskList() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session');
  const activeTab = searchParams.get('tab') || 'ai-assistant';
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastCalendarUpdate, setLastCalendarUpdate] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const url = sessionId 
        ? `/api/tasks?sessionId=${sessionId}`
        : '/api/tasks';
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }
      
      const data = await response.json();
      // The API returns { tasks: Task[] }, so we need to access data.tasks
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setError(null);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
      // Initialize with empty array on error
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Initial fetch - only when component mounts
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Handle task refresh events but filter out calendar updates
  useEffect(() => {
    const handleRefresh = (event: CustomEvent) => {
      // Skip calendar updates
      if (event.detail?.action === 'update' && activeTab === 'calendar') {
        return;
      }
      
      console.log('Refreshing tasks...')
      fetchTasks()
    }

    window.addEventListener('refreshTasks', handleRefresh as EventListener)
    return () => {
      window.removeEventListener('refreshTasks', handleRefresh as EventListener)
    }
  }, [fetchTasks, activeTab])

  // Sync task list when changing tabs but preserve calendar changes
  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', value);
    
    // Only refresh tasks if we're not coming from calendar
    if (activeTab === 'calendar' && value !== 'calendar') {
      // Save state that we just left calendar tab
      setLastCalendarUpdate(new Date().toISOString());
    } else if (value === 'calendar' && lastCalendarUpdate !== null) {
      // Don't reload tasks when returning to calendar to preserve event positions
      // We already have the calendar state in memory
    } else {
      // Otherwise refresh tasks
      fetchTasks();
    }
    
    router.push(`?${params.toString()}`);
  };

  // Ensure tasks is always an array before filtering
  const columns = {
    'todo': Array.isArray(tasks) ? tasks.filter(task => task.status === 'todo') : [],
    'in-progress': Array.isArray(tasks) ? tasks.filter(task => task.status === 'in-progress') : [],
    'done': Array.isArray(tasks) ? tasks.filter(task => task.status === 'done') : [],
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/tasks/${draggableId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: destination.droppableId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update task');
      }

      // Optimistically update the UI
      const updatedTasks = tasks.map(task =>
        task.id === draggableId
          ? { ...task, status: destination.droppableId as Task['status'] }
          : task
      );
      setTasks(updatedTasks);
      toast.success('Task updated successfully');
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task');
      // Revert the changes by re-fetching tasks
      fetchTasks();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <span className="ml-2">Loading tasks...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="text-red-500 mb-4">Error: {error}</div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <Tabs 
      value={activeTab} 
      onValueChange={handleTabChange} 
      className="h-full flex flex-col"
    >
      <TabsList className="grid w-full grid-cols-3 mb-2">
        <TabsTrigger value="ai-assistant">AI Assistant</TabsTrigger>
        <TabsTrigger value="kanban">Kanban Board</TabsTrigger>
        <TabsTrigger value="calendar">Calendar</TabsTrigger>
      </TabsList>

      <div className="flex-1 overflow-hidden">
        <TabsContent value="ai-assistant" className="h-full m-0 overflow-auto">
          <AIAssistantTab />
        </TabsContent>

        <TabsContent value="kanban" className="h-full m-0">
          <KanbanBoard tasks={tasks} onUpdate={fetchTasks} />
        </TabsContent>

        <TabsContent value="calendar" className="h-full m-0 overflow-hidden">
          <TaskCalendar tasks={tasks} />
        </TabsContent>
      </div>
    </Tabs>
  );
}