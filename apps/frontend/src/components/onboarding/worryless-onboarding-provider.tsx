'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useOnboarding } from '@/hooks/onboarding';
import { useAuth } from '@/components/AuthProvider';
import { NewOnboardingPage } from './new-onboarding-page';
import { worrylessOnboardingSteps } from './worryless-onboarding-config';
import { resetUserContext, userContext } from './shared/context';
import { createAgentFromTemplate } from '@/lib/api/templates';
import { createAgent } from '@/hooks/agents/utils';

interface WorrylessOnboardingProviderProps {
  children: React.ReactNode;
}

/**
 * Worryless AI Onboarding Provider
 *
 * Handles onboarding flow for new users:
 * - Detects new users via auth_event=signup URL param
 * - Shows onboarding modal with Worryless-specific steps
 * - Persists onboarding state in localStorage (and can sync to DB)
 * - Can be resumed from Help menu
 */
export function WorrylessOnboardingProvider({
  children,
}: WorrylessOnboardingProviderProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const {
    isOpen,
    hasCompletedOnboarding,
    startOnboarding,
    completeOnboarding,
    setIsOpen,
  } = useOnboarding();

  const [hasCheckedParams, setHasCheckedParams] = useState(false);

  // Check URL params for new user signup and trigger onboarding
  useEffect(() => {
    if (hasCheckedParams || !user) return;

    const authEvent = searchParams?.get('auth_event');
    const isNewUser = authEvent === 'signup';

    // Only show onboarding for new users who haven't completed it
    if (isNewUser && !hasCompletedOnboarding) {
      console.log('🎯 New user detected - starting Worryless onboarding');
      resetUserContext(); // Reset context for fresh start
      startOnboarding(worrylessOnboardingSteps);
    }

    setHasCheckedParams(true);
  }, [
    user,
    searchParams,
    hasCompletedOnboarding,
    startOnboarding,
    hasCheckedParams,
  ]);

  // Handle onboarding completion
  const handleOnboardingComplete = async () => {
    console.log('✅ Onboarding complete - processing user choices');

    try {
      // Create agent from template if user selected one
      if (userContext.selectedTemplateId) {
        console.log(
          '📦 Creating agent from template:',
          userContext.selectedTemplateId
        );
        try {
          const agent = await createAgentFromTemplate(
            userContext.selectedTemplateId,
            { name: userContext.selectedTemplateName || 'My First Agent' }
          );
          console.log('✅ Agent created:', agent.agent_id);

          // Navigate to the new agent's thread
          router.push(`/agents/${agent.agent_id}`);
        } catch (err) {
          console.error('Failed to create agent from template:', err);
          // Still complete onboarding even if agent creation fails
        }
      } else if (userContext.createBlankAgent) {
        console.log('📦 Creating blank agent');
        try {
          const agent = await createAgent({
            name: 'My First Agent',
            description: 'A custom AI agent',
          });
          console.log('✅ Blank agent created:', agent.agent_id);
          router.push(`/agents/${agent.agent_id}/config`);
        } catch (err) {
          console.error('Failed to create blank agent:', err);
        }
      }

      // Mark onboarding as complete
      completeOnboarding();

      // Clean up URL params
      if (searchParams?.get('auth_event')) {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('auth_event');
        newUrl.searchParams.delete('auth_method');
        router.replace(newUrl.pathname + newUrl.search);
      }
    } catch (err) {
      console.error('Error completing onboarding:', err);
      completeOnboarding(); // Still mark complete to not block user
    }
  };

  // Handle onboarding close/dismiss
  const handleOnboardingClose = () => {
    console.log('🚪 Onboarding dismissed');
    setIsOpen(false);
    // Don't mark as complete - allow resuming later

    // Clean up URL params
    if (searchParams?.get('auth_event')) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('auth_event');
      newUrl.searchParams.delete('auth_method');
      router.replace(newUrl.pathname + newUrl.search);
    }
  };

  return (
    <>
      {children}
      {isOpen && (
        <NewOnboardingPage
          onComplete={handleOnboardingComplete}
          onClose={handleOnboardingClose}
        />
      )}
    </>
  );
}
