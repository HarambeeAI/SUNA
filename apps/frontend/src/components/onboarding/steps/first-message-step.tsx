'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Send, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { StepWrapper } from '../shared/step-wrapper';
import { userContext, updateUserContext } from '../shared/context';
import { cn } from '@/lib/utils';

const EXAMPLE_MESSAGES = [
  "Help me write an email to follow up with a client",
  "Research the latest trends in AI",
  "Create a summary of this document",
  "Generate a list of content ideas for my blog",
];

export const FirstMessageStep = () => {
  const [message, setMessage] = useState('');
  const [selectedExample, setSelectedExample] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showResponse, setShowResponse] = useState(false);

  const handleExampleClick = (example: string) => {
    setSelectedExample(example);
    setMessage(example);
    updateUserContext({ firstMessage: example });
  };

  const handleMessageChange = (value: string) => {
    setMessage(value);
    setSelectedExample(null);
    updateUserContext({ firstMessage: value });
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    setIsSimulating(true);
    updateUserContext({ firstMessage: message, hasCompletedTutorial: true });

    // Simulate agent thinking
    await new Promise(resolve => setTimeout(resolve, 1500));

    setShowResponse(true);
    setIsSimulating(false);
  };

  return (
    <StepWrapper>
      <div className="space-y-8 max-w-3xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-3xl font-medium mb-3">Send Your First Message</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Try out your new AI agent! Send a message to see how it works.
          </p>
        </motion.div>

        {/* Example prompts */}
        {!showResponse && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="space-y-3"
          >
            <p className="text-sm text-muted-foreground text-center">
              Try one of these examples:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {EXAMPLE_MESSAGES.map((example, index) => (
                <Card
                  key={index}
                  className={cn(
                    "cursor-pointer transition-all hover:bg-muted/50",
                    selectedExample === example && "border-primary bg-primary/10"
                  )}
                  onClick={() => handleExampleClick(example)}
                >
                  <CardContent className="p-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">{example}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        )}

        {/* Chat interface */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="border rounded-lg bg-muted/20 overflow-hidden"
        >
          {/* Chat messages */}
          <div className="min-h-[200px] p-4 space-y-4">
            {message && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex justify-end"
              >
                <div className="bg-primary text-primary-foreground px-4 py-2 rounded-lg max-w-[80%]">
                  <p className="text-sm">{message}</p>
                </div>
              </motion.div>
            )}

            {isSimulating && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex justify-start"
              >
                <div className="bg-muted px-4 py-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                        className="w-2 h-2 bg-primary/60 rounded-full"
                      />
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                        className="w-2 h-2 bg-primary/60 rounded-full"
                      />
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                        className="w-2 h-2 bg-primary/60 rounded-full"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">AI is thinking...</span>
                  </div>
                </div>
              </motion.div>
            )}

            {showResponse && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex justify-start"
              >
                <div className="bg-muted px-4 py-3 rounded-lg max-w-[80%] space-y-2">
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-medium">AI Agent</span>
                  </div>
                  <p className="text-sm">
                    I'm ready to help you with that! Once you complete the setup,
                    I'll be able to assist you with tasks like this. Your agent will
                    have access to various tools to help you accomplish your goals.
                  </p>
                  <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    Demo message - your real agent will be more helpful!
                  </div>
                </div>
              </motion.div>
            )}

            {!message && !isSimulating && !showResponse && (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p className="text-sm">Type a message or select an example above</p>
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="border-t p-3 bg-background">
            <div className="flex gap-2">
              <Input
                placeholder="Type your message..."
                value={message}
                onChange={(e) => handleMessageChange(e.target.value)}
                disabled={isSimulating || showResponse}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !showResponse) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!message.trim() || isSimulating || showResponse}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Success state */}
        {showResponse && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-3"
          >
            <div className="flex items-center justify-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Great job! You've sent your first message.</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Click 'Continue' to see some final tips and complete your setup.
            </p>
          </motion.div>
        )}

        {/* Skip option */}
        {!showResponse && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <p className="text-sm text-muted-foreground">
              You can also skip this step and explore on your own
            </p>
          </motion.div>
        )}
      </div>
    </StepWrapper>
  );
};
