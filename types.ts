export enum View {
  PROMPTER,
  HISTORY,
  TEMPLATES,
}

export interface Settings {
  theme: 'dark';
  apiKeySource: 'environment' | 'custom';
  apiKey: string;
  hasSeenWelcome?: boolean;
}

export interface HistoryItem {
  id: string;
  userPrompt: string;
  generatedPrompt: string;
  timestamp: number;
  model: string;
  mode: 'Text' | 'JSON';
  config?: {
    style: 'default' | 'anime' | 'realistic';
    length: 'default' | 'short' | 'long';
    isJsonMode: boolean;
    useReasoning: boolean;
    useMarsLsp: boolean;
  };
  referencedTemplates?: string[]; // Storing only IDs now
  referencedBundles?: string[]; // Storing only IDs now
}

export interface PromptTemplate {
  id: string;
  title: string;
  description: string;
  prompt: string;
  tags: string[];
  models: string[];
  exampleVideo?: string; // Base64 encoded video
  exampleVideoType?: string; // Mime type e.g., 'video/mp4'
}

export interface BundledTemplate {
  id: string;
  name: string;
  description: string;
  templateIds: string[];
}
