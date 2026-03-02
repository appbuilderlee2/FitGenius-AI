
export interface Exercise {
  id: string;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  youtubeId?: string; // Replaces gifUrl
  instructions: string[];
}

export interface WeightEntry {
  id: string;
  date: string;
  weight: number;
}

export type AIProvider = 'gemini' | 'openai' | 'grok' | 'deepseek' | 'openrouter';

export interface UserSettings {
  name: string;
  height: number; // in cm
  targetWeight: number; // in kg
  language: 'zh-TW' | 'en';
  theme: 'light' | 'dark';
  activeProvider: AIProvider;
  apiKeys: {
    gemini?: string;
    openai?: string;
    grok?: string;
    deepseek?: string;
    openrouter?: string;
  };

  /** OpenRouter model id（建議用 :free） */
  openrouterModel?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text?: string;
  timestamp: number;
  toolCallId?: string;
  functionCall?: {
    name: string;
    args: any;
  };
  isToolResponse?: boolean;
}

export interface WorkoutExercise {
  name: string;
  sets: string;
  reps: string;
}

export interface WorkoutDay {
  day: string; // e.g., "Monday" or "Day 1"
  focus: string; // e.g., "Chest & Triceps"
  exercises: WorkoutExercise[];
}

export interface WorkoutPlan {
  id: string;
  createdAt: number;
  goal: string;
  level: string;
  equipment: string;
  duration: number; // minutes
  days: WorkoutDay[];
}

export interface ExerciseLog {
  id: string;
  date: string; // ISO string
  timestamp: number;
  exerciseName: string;
  sets: number;
  reps: number;
  weight: number; // kg
  durationMinutes: number;
}

export interface Achievement {
  id: string;
  titleKey: string; // Key for translation
  descKey: string; // Key for translation
  icon: string; // Identifier for Lucide icon
  unlockedAt?: string; // ISO String
}

export interface AICoachProps {
  userSettings: UserSettings;
  onAddPlan: (plan: WorkoutPlan) => void;
}

export interface WorkoutManagerProps {
  userSettings: UserSettings;
  plans: WorkoutPlan[];
  logs: ExerciseLog[];
  onAddPlan: (plan: WorkoutPlan) => void;
  onDeletePlan: (id: string) => void;
  onAddLog: (log: ExerciseLog) => void;
  onDeleteLog: (id: string) => void;
  onTriggerCheckAchievements?: () => void;
}
