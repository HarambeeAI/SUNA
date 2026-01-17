'use client';

import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Users,
  LayoutGrid,
  CreditCard,
  ExternalLink,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StepWrapper } from '../shared/step-wrapper';
import Link from 'next/link';

interface Tip {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  linkText: string;
}

const TIPS: Tip[] = [
  {
    icon: <Users className="h-5 w-5" />,
    title: 'Invite Your Team',
    description: 'Add team members to collaborate on agents and share workflows.',
    href: '/settings/members',
    linkText: 'Manage Team',
  },
  {
    icon: <LayoutGrid className="h-5 w-5" />,
    title: 'Explore Templates',
    description: 'Browse our marketplace for pre-built agents to solve common tasks.',
    href: '/templates',
    linkText: 'View Templates',
  },
  {
    icon: <CreditCard className="h-5 w-5" />,
    title: 'Upgrade Your Plan',
    description: 'Get more agents, runs, and advanced features with Pro.',
    href: '/settings/billing',
    linkText: 'View Plans',
  },
];

export const TipsCompletionStep = () => {
  return (
    <StepWrapper>
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto space-y-8"
        >
          {/* Success header */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="space-y-4"
          >
            <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center mx-auto relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-full border-2 border-dashed border-primary/20"
              />
              <CheckCircle2 className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-medium bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              You're All Set!
            </h1>
            <p className="text-lg text-muted-foreground max-w-lg mx-auto">
              Your workspace is ready. Here are some tips to help you get the most out of Worryless AI.
            </p>
          </motion.div>

          {/* Tips grid */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="grid md:grid-cols-3 gap-4"
          >
            {TIPS.map((tip, index) => (
              <motion.div
                key={tip.title}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 + index * 0.1, duration: 0.3 }}
              >
                <Card className="h-full hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
                      {tip.icon}
                    </div>
                    <CardTitle className="text-base">{tip.title}</CardTitle>
                    <CardDescription className="text-sm">
                      {tip.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Link
                      href={tip.href}
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {tip.linkText}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          {/* Help menu note */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="p-4 bg-muted/30 rounded-lg border"
          >
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>
                You can revisit this onboarding anytime from the <strong>Help</strong> menu in the sidebar.
              </span>
            </div>
          </motion.div>

          {/* Final CTA */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="pt-4"
          >
            <p className="text-muted-foreground mb-4">
              Click 'Complete Setup' to start using Worryless AI
            </p>
          </motion.div>
        </motion.div>
      </div>
    </StepWrapper>
  );
};
