import React from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useUser } from '@clerk/nextjs';

interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
}

interface ChatSessionsProps {
  onSessionSelect: (sessionId: string | null) => void;
}

export function ChatSessions({ onSessionSelect }: ChatSessionsProps) {
  const { user } = useUser();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const activeSessionId = searchParams.get('session');

  useEffect(() => {
    const fetchSessions = async () => {
      if (!user) return;

      try {
        setLoading(true);
        const response = await fetch('/api/chat-sessions');
        if (!response.ok) {
          throw new Error('Failed to fetch chat sessions');
        }
        const data = await response.json();
        setSessions(data.sessions || []);
      } catch (err) {
        console.error('Error fetching chat sessions:', err);
        setError(err instanceof Error ? err.message : 'Failed to load chat sessions');
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [user]);

  if (loading) {
    return <div className="p-4">Loading sessions...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Chat History</h2>
        {activeSessionId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSessionSelect(null)}
            className="text-sm"
          >
            Clear Filter
          </Button>
        )}
      </div>
      <ScrollArea className="h-[500px]">
        <div className="space-y-2">
          {sessions.map((session) => (
            <Button
              key={session.id}
              variant={activeSessionId === session.id ? "secondary" : "ghost"}
              className="w-full justify-start text-left"
              onClick={() => onSessionSelect(session.id)}
            >
              <div className="truncate">
                <div className="font-medium">{session.title}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(session.updatedAt).toLocaleDateString()}
                </div>
              </div>
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
} 