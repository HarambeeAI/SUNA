'use client';

import React, { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, MessageCircle, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getPublicShareLink, type PublicShareLink, type ShareLinkError } from '@/lib/api/share-links';
import { normalizeIconName } from '@/lib/utils/icon-utils';
import { cn } from '@/lib/utils';

interface ShareAgentPageParams {
  shareId: string;
}

export default function ShareAgentPage({
  params,
}: {
  params: Promise<ShareAgentPageParams>;
}) {
  const unwrappedParams = use(params);
  const shareId = unwrappedParams.shareId;
  const router = useRouter();

  const [shareLink, setShareLink] = useState<PublicShareLink | null>(null);
  const [error, setError] = useState<ShareLinkError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    async function fetchShareLink() {
      try {
        const data = await getPublicShareLink(shareId);
        setShareLink(data);
      } catch (err: unknown) {
        // Handle specific error responses
        if (err && typeof err === 'object' && 'response' in err) {
          const response = (err as { response?: { data?: ShareLinkError } }).response;
          if (response?.data?.code) {
            setError(response.data);
            return;
          }
        }
        setError({
          error: 'Failed to load share link',
          code: 'LINK_NOT_FOUND',
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchShareLink();
  }, [shareId]);

  const handleStartChat = () => {
    // For now, redirect to sign up with the agent context
    // In a full implementation, this would create a new thread and start a chat
    router.push(`/auth?redirect=/agents&agent=${shareLink?.agent.agent_id}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading agent...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-destructive">
                {error.code === 'LINK_DEACTIVATED'
                  ? 'Link Deactivated'
                  : error.code === 'LINK_EXPIRED'
                  ? 'Link Expired'
                  : 'Link Not Found'}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{error.error}</p>
            <Button onClick={() => router.push('/')} variant="outline" className="w-full">
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!shareLink) {
    return null;
  }

  const { agent } = shareLink;
  const normalizedIconName = agent.icon_name ? normalizeIconName(agent.icon_name) : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Agent Avatar */}
              <div
                className="flex items-center justify-center border"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: agent.icon_background || '#F3F4F6',
                }}
              >
                {normalizedIconName ? (
                  <DynamicIcon
                    name={normalizedIconName as any}
                    size={20}
                    color={agent.icon_color || '#6B7280'}
                  />
                ) : (
                  <Bot size={20} color="#6B7280" />
                )}
              </div>
              <div>
                <h1 className="font-semibold text-lg">{agent.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {shareLink.views_count} view{shareLink.views_count !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <Button onClick={handleStartChat} size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              Try this Agent
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Agent Info Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              About this Agent
            </CardTitle>
          </CardHeader>
          <CardContent>
            {agent.description ? (
              <p className="text-muted-foreground whitespace-pre-wrap">{agent.description}</p>
            ) : (
              <p className="text-muted-foreground italic">No description provided.</p>
            )}
          </CardContent>
        </Card>

        {/* Custom Greeting */}
        {shareLink.settings?.custom_greeting && (
          <Alert className="mb-8">
            <MessageCircle className="h-4 w-4" />
            <AlertTitle>Welcome</AlertTitle>
            <AlertDescription>{shareLink.settings.custom_greeting}</AlertDescription>
          </Alert>
        )}

        {/* Preview/Demo Section */}
        <Card>
          <CardHeader>
            <CardTitle>Chat Preview</CardTitle>
            <CardDescription>
              Sign up or log in to start chatting with this agent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Mock chat area */}
              <div className="border rounded-lg p-4 min-h-[200px] bg-muted/30 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div
                    className="mx-auto flex items-center justify-center border"
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 16,
                      backgroundColor: agent.icon_background || '#F3F4F6',
                    }}
                  >
                    {normalizedIconName ? (
                      <DynamicIcon
                        name={normalizedIconName as any}
                        size={32}
                        color={agent.icon_color || '#6B7280'}
                      />
                    ) : (
                      <Bot size={32} color="#6B7280" />
                    )}
                  </div>
                  <p className="font-medium">{agent.name}</p>
                  <p className="text-sm text-muted-foreground">Ready to help you</p>
                </div>
              </div>

              {/* Disabled input */}
              <div className="relative">
                <Textarea
                  placeholder="Type a message to get started..."
                  disabled
                  className="pr-20 resize-none"
                  rows={3}
                />
                <div className="absolute bottom-3 right-3">
                  <Button size="sm" disabled>
                    Send
                  </Button>
                </div>
              </div>

              {/* CTA */}
              <div className="flex justify-center pt-4">
                <Button onClick={handleStartChat} size="lg" className="w-full sm:w-auto">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Sign Up to Chat with {agent.name}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <footer className="text-center mt-8 text-sm text-muted-foreground">
          <p>Powered by Worryless AI</p>
        </footer>
      </main>
    </div>
  );
}
