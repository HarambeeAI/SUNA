'use client';

import { motion } from 'framer-motion';
import { Sparkles, Zap, Users, Rocket } from 'lucide-react';
import { StepWrapper } from '../shared/step-wrapper';

export const WelcomeStep = () => {
  return (
    <StepWrapper>
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto space-y-8"
        >
          {/* Hero icon */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="relative mx-auto"
          >
            <div className="w-24 h-24 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center mx-auto relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-full border-2 border-dashed border-primary/20"
              />
              <Sparkles className="h-12 w-12 text-primary" />
            </div>
          </motion.div>

          {/* Welcome message */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="space-y-4"
          >
            <h1 className="text-4xl md:text-5xl font-medium bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Welcome to Worryless AI!
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Let's get you started with your AI-powered workspace.
              This quick setup will personalize your experience.
            </p>
          </motion.div>

          {/* Feature highlights */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8"
          >
            <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-muted/30">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-medium">AI Agents</h3>
                <p className="text-sm text-muted-foreground">Deploy pre-built agents instantly</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-muted/30">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-medium">Team Collaboration</h3>
                <p className="text-sm text-muted-foreground">Work together on shared agents</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-muted/30">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Rocket className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-medium">Quick Start</h3>
                <p className="text-sm text-muted-foreground">Templates for every use case</p>
              </div>
            </div>
          </motion.div>

          {/* Estimated time */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="text-sm text-muted-foreground"
          >
            This setup takes about 2 minutes
          </motion.p>
        </motion.div>
      </div>
    </StepWrapper>
  );
};
