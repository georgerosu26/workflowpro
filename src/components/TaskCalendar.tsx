import { useState, useMemo } from 'react'
import { Calendar, dateFnsLocalizer, View, stringOrDate } from 'react-big-calendar'
import withDragAndDrop, { withDragAndDropProps } from 'react-big-calendar/lib/addons/dragAndDrop'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { toast } from 'sonner'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'

interface Task {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  category: string
  status: 'todo' | 'in-progress' | 'done'
  sessionId: string
  dueDate?: Date
  startDate?: Date
}

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  resource: {
    priorityColor: string
    id: string
    title: string
    description: string
    priority: string
    category: string
    status: string
    sessionId: string
    startDate?: Date
    dueDate?: Date
  }
}

interface TaskCalendarProps {
  tasks: Task[]
}

const locales = {
  'en-US': enUS,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

type DnDCalendarEvent = CalendarEvent & { resource: Task }
const DnDCalendar = withDragAndDrop<DnDCalendarEvent, object>(Calendar as any)

export function TaskCalendar({ tasks }: TaskCalendarProps) {
  const [view, setView] = useState<View>('month')

  const events = useMemo(() => {
    return tasks.map(task => ({
      id: task.id,
      title: task.title,
      start: task.startDate ? new Date(task.startDate) : new Date(),
      end: task.dueDate ? new Date(task.dueDate) : new Date(),
      allDay: true,
      resource: {
        ...task,
        priorityColor: 
          task.priority === 'high' ? 'rgb(239 68 68)' : // red-500
          task.priority === 'medium' ? 'rgb(234 179 8)' : // yellow-500
          'rgb(34 197 94)', // green-500
      },
    }))
  }, [tasks])

  const eventStyleGetter = (event: DnDCalendarEvent) => {
    return {
      style: {
        backgroundColor: event.resource.priorityColor,
        borderRadius: '4px',
        opacity: 0.8,
        color: 'white',
        border: '0',
        display: 'block',
      },
    }
  }

  const onEventDrop = async ({ event, start, end }: { event: DnDCalendarEvent; start: stringOrDate; end: stringOrDate }) => {
    try {
      const startDate = typeof start === 'string' ? new Date(start) : start
      const endDate = typeof end === 'string' ? new Date(end) : end

      const response = await fetch(`/api/tasks/${event.resource.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          dueDate: endDate,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update task dates')
      }

      toast.success('Task dates updated successfully')
    } catch (error) {
      console.error('Error updating task dates:', error)
      toast.error('Failed to update task dates')
    }
  }

  const onEventResize = async ({ event, start, end }: { event: DnDCalendarEvent; start: stringOrDate; end: stringOrDate }) => {
    try {
      const startDate = typeof start === 'string' ? new Date(start) : start
      const endDate = typeof end === 'string' ? new Date(end) : end

      const response = await fetch(`/api/tasks/${event.resource.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          dueDate: endDate,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update task dates')
      }

      toast.success('Task duration updated successfully')
    } catch (error) {
      console.error('Error updating task duration:', error)
      toast.error('Failed to update task duration')
    }
  }

  return (
    <div className="h-[600px] bg-white p-4 rounded-lg shadow mt-8">
      <DnDCalendar
        localizer={localizer}
        events={events}
        startAccessor={(event: DnDCalendarEvent) => event.start}
        endAccessor={(event: DnDCalendarEvent) => event.end}
        style={{ height: '100%' }}
        views={['month', 'week', 'day']}
        view={view}
        onView={setView}
        eventPropGetter={eventStyleGetter}
        tooltipAccessor={(event: DnDCalendarEvent) => `${event.title} (${event.resource.status})`}
        resizable
        selectable
        onEventDrop={onEventDrop}
        onEventResize={onEventResize}
        popup
        defaultDate={new Date()}
      />
    </div>
  )
}