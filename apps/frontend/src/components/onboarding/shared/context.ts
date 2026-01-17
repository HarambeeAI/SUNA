import { UserContext } from './types';

// Global user context - this will be replaced with proper state management
export let userContext: UserContext = {
  name: '',
  primaryGoals: [],
  selectedAgents: [],
  // Worryless AI onboarding fields
  createdOrgId: undefined,
  selectedTemplateId: undefined,
  selectedTemplateName: undefined,
  createBlankAgent: false,
  firstMessage: undefined,
  hasCompletedTutorial: false,
};

export const updateUserContext = (updates: Partial<UserContext>) => {
  userContext = { ...userContext, ...updates };
};

export const resetUserContext = () => {
  userContext = {
    name: '',
    primaryGoals: [],
    selectedAgents: [],
    createdOrgId: undefined,
    selectedTemplateId: undefined,
    selectedTemplateName: undefined,
    createBlankAgent: false,
    firstMessage: undefined,
    hasCompletedTutorial: false,
  };
};

