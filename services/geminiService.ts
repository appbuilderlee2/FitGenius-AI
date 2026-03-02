
import { GoogleGenAI, Chat, Type, FunctionDeclaration } from "@google/genai";
import { Exercise, UserSettings, AIProvider } from "../types";

// Helper to determine endpoints/models for non-Gemini providers
const getProviderConfig = (provider: AIProvider) => {
    switch (provider) {
        case 'grok': 
            return { url: 'https://api.x.ai/v1/chat/completions', model: 'grok-2-latest' };
        case 'deepseek':
            return { url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' };
        case 'openrouter':
            return { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'google/gemini-2.0-flash-exp:free' };
        default: 
            return { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' };
    }
};

// --- Universal Chat Interface for Multi-Provider Support ---
// This mimics the structure of the GoogleGenAI Chat object so components don't break.
class UniversalChatSession {
    private history: any[] = [];
    private systemPrompt: string;
    private provider: AIProvider;
    private apiKey: string;
    private language: string;
    private openrouterModel?: string;

    constructor(provider: AIProvider, apiKey: string, systemPrompt: string, language: string, openrouterModel?: string) {
        this.provider = provider;
        this.apiKey = apiKey;
        this.systemPrompt = systemPrompt;
        this.language = language;
        this.openrouterModel = openrouterModel;
    }

    async sendMessage(payload: { message: string }): Promise<any> {
        const userMsg = payload.message;
        
        // Add user message to history
        this.history.push({ role: 'user', content: userMsg });

        if (this.provider === 'gemini') {
            // Should not happen via this class if we use native Gemini SDK, 
            // but fallback just in case we route here.
             throw new Error("Direct Gemini SDK should be used for Gemini provider.");
        }

        // OpenRouter 允許用戶選 model（通常用 :free）
        const providerConfig = getProviderConfig(this.provider);
        const { url: endpoint } = providerConfig;
        const model = (this.provider === 'openrouter' && this.openrouterModel)
            ? this.openrouterModel
            : providerConfig.model;

        // Prepare Tools (Plan Generation)
        const tools = [{
            type: "function",
            function: {
                name: "create_workout_plan",
                description: `Create a structured weekly workout plan in ${this.language}.`,
                parameters: {
                    type: "object",
                    properties: {
                        goal: { type: "string" },
                        level: { type: "string" },
                        duration: { type: "number" },
                        days: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    day: { type: "string" },
                                    focus: { type: "string" },
                                    exercises: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                name: { type: "string" },
                                                sets: { type: "string" },
                                                reps: { type: "string" }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    required: ["goal", "level", "days"]
                }
            }
        }];

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            };

            // OpenRouter 建議加上 Referer / Title 方便風控與統計
            if (this.provider === 'openrouter') {
                headers['HTTP-Referer'] = 'https://appbuilderlee2.github.io/FitGenius-AI/';
                headers['X-Title'] = 'FitGenius-AI';
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: this.systemPrompt },
                        ...this.history
                    ],
                    tools: tools,
                    tool_choice: "auto"
                })
            });

            const data = await response.json();
            
            if (data.error) {
                console.error("Provider Error:", data.error);
                throw new Error(data.error.message);
            }

            const choice = data.choices[0];
            const msg = choice.message;

            // Handle Tool Calls
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                 const toolCall = msg.tool_calls[0];
                 const args = JSON.parse(toolCall.function.arguments);
                 
                 // Mimic Gemini Structure for the UI
                 return {
                     text: null,
                     functionCalls: [{
                         name: toolCall.function.name,
                         args: args,
                         id: toolCall.id
                     }]
                 };
            }

            // Normal Text
            const text = msg.content;
            this.history.push({ role: 'assistant', content: text });
            
            return {
                text: text,
                functionCalls: []
            };

        } catch (e) {
            console.error(e);
            return { text: "Error connecting to AI service. Please check your API Key." };
        }
    }
    
    // Stub for tool response (handled via UI navigation mostly, but good to have)
    async sendToolResponse(response: any): Promise<void> {
        // In a real chat loop, we would push the tool result back to history here
        // For this app's "Generate Plan" flow, we just reset or acknowledge.
    }
}


const CACHE_KEY = 'fitgenius_exercise_cache';
const USAGE_KEY = 'fitgenius_ai_usage';

// --- Configuration Helper ---
const getProviderSettings = (): { provider: AIProvider, key: string, model?: string } => {
    try {
        const settingsRaw = localStorage.getItem('fitgenius_settings');
        if (!settingsRaw) return { provider: 'gemini', key: '', model: undefined };
        
        const settings: UserSettings = JSON.parse(settingsRaw);
        const provider = settings.activeProvider || 'gemini';
        const key = settings.apiKeys?.[provider] || '';
        const model = provider === 'openrouter' ? (settings.openrouterModel || 'google/gemini-2.0-flash-exp:free') : undefined;
        
        return { provider, key, model };
    } catch {
        return { provider: 'gemini', key: '', model: undefined };
    }
};

// --- Usage Tracking Helpers ---
export const trackAiUsage = (metric: 'requests' | 'cacheHits' | 'generatedPlans') => {
    try {
        const raw = localStorage.getItem(USAGE_KEY);
        const stats = raw ? JSON.parse(raw) : { requests: 0, cacheHits: 0, generatedPlans: 0 };
        stats[metric] = (stats[metric] || 0) + 1;
        localStorage.setItem(USAGE_KEY, JSON.stringify(stats));
    } catch (e) {
        console.warn("Usage tracking failed", e);
    }
};

export const getAiUsage = () => {
    try {
        const raw = localStorage.getItem(USAGE_KEY);
        return raw ? JSON.parse(raw) : { requests: 0, cacheHits: 0, generatedPlans: 0 };
    } catch {
        return { requests: 0, cacheHits: 0, generatedPlans: 0 };
    }
};

// Helper to clean JSON string from Markdown code blocks
const cleanJsonString = (text: string): string => {
  if (!text) return '{}';
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

// --- Caching Helpers ---
const getExerciseFromCache = (name: string, lang: string): Exercise | null => {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}_${lang}`);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    const normalizedName = name.trim().toLowerCase();
    
    const data = cache[normalizedName];
    if (data && (data.youtubeId || (data.instructions && data.instructions.length > 0))) {
        trackAiUsage('cacheHits'); 
        return data;
    }
    return null;
  } catch (e) {
    try { localStorage.removeItem(`${CACHE_KEY}_${lang}`); } catch {}
    return null;
  }
};

const saveExerciseToCache = (name: string, data: Exercise, lang: string) => {
  try {
    if (!data.youtubeId && (!data.instructions || data.instructions.length <= 1)) return;

    const raw = localStorage.getItem(`${CACHE_KEY}_${lang}`);
    let cache: Record<string, Exercise> = {};
    try { cache = raw ? JSON.parse(raw) : {}; } catch { cache = {}; }

    const normalizedName = name.trim().toLowerCase();
    cache[normalizedName] = data;
    
    localStorage.setItem(`${CACHE_KEY}_${lang}`, JSON.stringify(cache));
  } catch (e) {
    console.warn("Cache write error", e);
  }
};

const getPlanTool = (language: string): FunctionDeclaration => ({
  name: 'create_workout_plan',
  description: `Create a structured weekly workout plan for the user in ${language === 'en' ? 'English' : 'Traditional Chinese'}.`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      goal: { type: Type.STRING, description: "The fitness goal" },
      level: { type: Type.STRING, description: "Difficulty level" },
      duration: { type: Type.NUMBER, description: "Duration of each workout in minutes" },
      days: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            day: { type: Type.STRING, description: "Day name" },
            focus: { type: Type.STRING, description: "Main focus" },
            exercises: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  sets: { type: Type.STRING },
                  reps: { type: Type.STRING },
                }
              }
            }
          }
        }
      }
    },
    required: ['goal', 'level', 'days']
  }
});

// --- CHAT FACTORY ---
export const createFitnessChat = (language: 'zh-TW' | 'en'): any => {
  trackAiUsage('requests');
  const { provider, key, model } = getProviderSettings();
  const langName = language === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
  
  const systemInstruction = `You are FitGenius, a highly motivating, energetic, and empathetic personal trainer.
      - Speak strictly in ${langName}.
      - Your tone should be conversational, encouraging, and friendly. Use emojis (💪, 🔥, ✨) frequently.
      - When giving advice, always end with a short, punchy motivational tip.
      - If the user asks for a workout plan, use the 'create_workout_plan' tool.
      - If using OpenAI, Grok, or DeepSeek, ensure you output valid JSON arguments for tools.`;

  if (!key) {
      // Mock chat that errors immediately if no key
      return {
          sendMessage: async () => { throw new Error("No API Key configured."); }
      };
  }

  if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: key });
      return ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction,
          temperature: 0.8,
          tools: [{ functionDeclarations: [getPlanTool(language)] }],
        },
      });
  } else {
      // Return Universal Polyfill for OpenAI/Grok/DeepSeek/OpenRouter
      return new UniversalChatSession(provider, key, systemInstruction, language, model);
  }
};

// --- PLAN GENERATOR ---
export const generateStructuredWorkoutPlan = async (
  goal: string,
  level: string,
  equipment: string,
  daysPerWeek: number,
  durationMinutes: number,
  language: 'zh-TW' | 'en'
): Promise<any> => {
  trackAiUsage('requests');
  const { provider, key, model } = getProviderSettings();
  
  if (!key) throw new Error("Missing API Key");

  const langName = language === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
  const prompt = `Create a weekly workout plan for a ${level} level user wanting to ${goal} using ${equipment}. 
  The plan should have ${daysPerWeek} days of workouts.
  Each workout session should be approximately ${durationMinutes} minutes long.
  
  IMPORTANT REQUIREMENTS:
  1. Return the response in ${langName}.
  2. Each workout session MUST include 6 to 8 distinct exercises.
  3. Format the response as a valid JSON Object.
  
  JSON Structure:
  {
    "days": [
      {
        "day": "Day Name",
        "focus": "Focus Area",
        "exercises": [ { "name": "Ex Name", "sets": "3", "reps": "10" } ]
      }
    ]
  }`;

  if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              days: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    day: { type: Type.STRING },
                    focus: { type: Type.STRING },
                    exercises: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          sets: { type: Type.STRING },
                          reps: { type: Type.STRING },
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });
      trackAiUsage('generatedPlans');
      const cleanText = cleanJsonString(response.text || '');
      return JSON.parse(cleanText || '{"days": []}');
  } else {
      // OpenAI / Grok / DeepSeek / OpenRouter (OpenAI-compatible)
      const providerConfig = getProviderConfig(provider);
      const endpoint = providerConfig.url;
      const selectedModel = provider === 'openrouter'
        ? (model || providerConfig.model)
        : providerConfig.model;

      const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
      };

      if (provider === 'openrouter') {
          headers['HTTP-Referer'] = 'https://appbuilderlee2.github.io/FitGenius-AI/';
          headers['X-Title'] = 'FitGenius-AI';
      }

      const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
              model: selectedModel,
              messages: [{ role: 'user', content: prompt }],
              response_format: { type: "json_object" }
          })
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      
      trackAiUsage('generatedPlans');
      const text = data.choices[0].message.content;
      return JSON.parse(text);
  }
};

// --- RECOMMENDATION ENGINE ---
export const recommendExercises = async (
    term: string,
    filters: { bodyPart?: string; equipment?: string; target?: string },
    language: 'zh-TW' | 'en'
): Promise<Exercise[]> => {
    trackAiUsage('requests');
    const { provider, key } = getProviderSettings();
    if (!key) return [];

    const langName = language === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
    const criteria = [];
    if (term) criteria.push(`Keyword: "${term}"`);
    if (filters.bodyPart && filters.bodyPart !== 'All') criteria.push(`Body Part: "${filters.bodyPart}"`);
    if (filters.equipment && filters.equipment !== 'All') criteria.push(`Equipment: "${filters.equipment}"`);
    if (filters.target && filters.target.trim()) criteria.push(`Target Muscle: "${filters.target}"`);

    const prompt = `Recommend a list of 6 to 8 diverse exercises matching these criteria:
    ${criteria.join(', ')}
    
    Output Language: ${langName}.
    
    Return a JSON Array of objects. Structure:
    [
      { "name": "string", "bodyPart": "string", "equipment": "string", "target": "string" }
    ]`;

    let jsonStr = '';

    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: key });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        jsonStr = response.text || '';
    } else {
        const { url: endpoint, model } = getProviderConfig(provider);
        
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: "json_object" } 
            })
        });
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '[]';
        jsonStr = content;
    }

    try {
        const cleanText = cleanJsonString(jsonStr);
        let items = JSON.parse(cleanText);
        
        // Handle wrapping quirks
        if (!Array.isArray(items) && items.exercises) items = items.exercises;
        if (!Array.isArray(items) && items.list) items = items.list;
        
        if (Array.isArray(items)) {
            return items.map((item: any, index: number) => ({
                id: `rec-${Date.now()}-${index}`,
                name: item.name,
                bodyPart: item.bodyPart,
                equipment: item.equipment,
                target: item.target,
                instructions: [] 
            }));
        }
        return [];
    } catch (e) {
        console.error("Recommendation parsing error", e);
        return [];
    }
};

// --- DETAIL FETCHING ---
export const getExerciseDetailsWithAI = async (exerciseName: string, language: 'zh-TW' | 'en'): Promise<Exercise> => {
  const cached = getExerciseFromCache(exerciseName, language);
  if (cached) {
    trackAiUsage('cacheHits');
    return cached;
  }

  trackAiUsage('requests');
  const { provider, key } = getProviderSettings();
  if (!key) return { id: 'err', name: exerciseName, bodyPart: '', equipment: '', target: '', instructions: [] };

  const langName = language === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
  
  const prompt = `Find details for the exercise: "${exerciseName}".
  1. Find a valid YouTube video ID (11 chars) for a tutorial.
  2. Provide step-by-step instructions in ${langName}.
  3. Identify target muscle and equipment in ${langName}.
  
  Return raw JSON:
  {
    "name": "Name",
    "bodyPart": "Part",
    "equipment": "Eq",
    "target": "Muscle",
    "youtubeId": "ID_HERE",
    "instructions": ["Step 1", "Step 2"]
  }`;

  try {
    let data: any = {};

    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: key });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] } // Gemini Exclusive
        });
        data = JSON.parse(cleanJsonString(response.text || '{}'));
    } else {
        // OpenAI / Grok / DeepSeek (No Live Search)
        const { url: endpoint, model } = getProviderConfig(provider);
        
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: 'You are a fitness database. Provide JSON details. For youtubeId, provide a highly probable popular video ID for this exercise.' },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: "json_object" }
            })
        });
        const resData = await res.json();
        data = JSON.parse(resData.choices?.[0]?.message?.content || '{}');
    }

    const result: Exercise = {
        id: Date.now().toString(),
        name: data.name || exerciseName,
        bodyPart: data.bodyPart || "General",
        equipment: data.equipment || "Bodyweight",
        target: data.target || "Full Body",
        youtubeId: data.youtubeId || "",
        instructions: data.instructions || [language === 'en' ? "Details loaded via AI." : "AI 已載入詳情。"]
    };

    saveExerciseToCache(exerciseName, result, language);
    return result;

  } catch (error) {
    console.error("AI Search Error:", error);
    return {
        id: Date.now().toString(),
        name: exerciseName,
        bodyPart: "Unknown",
        equipment: "Unknown",
        target: "Unknown",
        instructions: [language === 'en' ? "Could not load AI details." : "無法載入 AI 詳情。"]
    };
  }
};
