'use client';

import { OnboardingStep } from '@/hooks/onboarding';
import { WelcomeStep } from './steps/welcome-step';
import { WorkspaceChoiceStep } from './steps/workspace-choice-step';
import { TemplateChoiceStep } from './steps/template-choice-step';
import { FirstMessageStep } from './steps/first-message-step';
import { TipsCompletionStep } from './steps/tips-completion-step';

/**
 * Worryless AI Onboarding Steps
 *
 * Flow:
 * 1. Welcome - Introduction to Worryless AI
 * 2. Workspace Choice - Create organization or use personal workspace
 * 3. Template Choice - Choose from featured templates or create blank agent
 * 4. First Message - Interactive tutorial to send first message
 * 5. Tips & Completion - Show tips and complete setup
 */
export const worrylessOnboardingSteps: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    description: 'Welcome to Worryless AI',
    content: <WelcomeStep />,
    canSkip: false,
    actionLabel: 'Get Started',
  },
  {
    id: 'workspace-choice',
    title: 'Workspace',
    description: 'Create organization or skip to personal workspace',
    content: <WorkspaceChoiceStep />,
    canSkip: true, // Can skip organization creation
    actionLabel: 'Continue',
  },
  {
    id: 'template-choice',
    title: 'First Agent',
    description: 'Choose from templates or create blank agent',
    content: <TemplateChoiceStep />,
    canSkip: true, // Can skip to blank agent
    actionLabel: 'Continue',
  },
  {
    id: 'first-message',
    title: 'Try It Out',
    description: 'Send your first message to an agent',
    content: <FirstMessageStep />,
    canSkip: true, // Can skip the tutorial
    actionLabel: 'Continue',
  },
  {
    id: 'tips-completion',
    title: 'Complete',
    description: 'Tips and completion',
    content: <TipsCompletionStep />,
    canSkip: false,
    actionLabel: 'Complete Setup',
  },
];

// Helper functions for navigation and validation
export const getWorrylessStepByIndex = (index: number): OnboardingStep | null => {
  return worrylessOnboardingSteps[index] || null;
};

export const getWorrylessStepById = (id: string): OnboardingStep | null => {
  return worrylessOnboardingSteps.find((step) => step.id === id) || null;
};

export const getWorrylessStepIndex = (id: string): number => {
  return worrylessOnboardingSteps.findIndex((step) => step.id === id);
};

export const isValidWorrylessStepIndex = (index: number): boolean => {
  return index >= 0 && index < worrylessOnboardingSteps.length;
};

export const canSkipWorrylessStep = (index: number): boolean => {
  const step = getWorrylessStepByIndex(index);
  return step?.canSkip || false;
};

export const isFirstWorrylessStep = (index: number): boolean => {
  return index === 0;
};

export const isLastWorrylessStep = (index: number): boolean => {
  return index === worrylessOnboardingSteps.length - 1;
};

// Progress calculation
export const getWorrylessProgressPercentage = (currentStep: number): number => {
  return Math.round(((currentStep + 1) / worrylessOnboardingSteps.length) * 100);
};

// Step validation
export const canProceedFromWorrylessStep = (
  stepIndex: number,
  context?: any
): boolean => {
  const step = getWorrylessStepByIndex(stepIndex);
  if (!step) return false;

  switch (step.id) {
    case 'welcome':
      return true; // Always can proceed from welcome

    case 'workspace-choice':
      // Can proceed if either choice is made
      // Or if skipping (personal workspace)
      return true;

    case 'template-choice':
      // Can proceed if template selected or blank chosen
      return !!(
        context?.selectedTemplateId ||
        context?.createBlankAgent === true
      );

    case 'first-message':
      // Can always proceed (tutorial is optional)
      return true;

    case 'tips-completion':
      return true;

    default:
      return true;
  }
};
