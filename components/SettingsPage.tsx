
import React, { useState, useRef, useEffect } from 'react';
import { UserSettings, AIProvider } from '../types';
import { User, Target, Ruler, Globe, Database, Download, Upload, Zap, Activity, HardDrive, Key, Cpu, ExternalLink, Moon, Sun } from 'lucide-react';
import { t } from '../utils/translations';
import { getAiUsage } from '../services/geminiService';

interface SettingsPageProps {
  settings: UserSettings;
  onUpdate: (settings: Partial<UserSettings>) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onUpdate }) => {
  const [formData, setFormData] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState({ requests: 0, cacheHits: 0, generatedPlans: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const lang = settings.language || 'zh-TW';
  const txt = t[lang];

  useEffect(() => {
      setStats(getAiUsage());
  }, []);

  const handleChange = (field: keyof UserSettings, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleApiKeyChange = (provider: AIProvider, value: string) => {
      setFormData(prev => ({
          ...prev,
          apiKeys: {
              ...prev.apiKeys,
              [provider]: value
          }
      }));
      setSaved(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // --- Export Functionality ---
  const handleExport = () => {
    const data = {
      settings: localStorage.getItem('fitgenius_settings'),
      weight: localStorage.getItem('fitgenius_weight'),
      plans: localStorage.getItem('fitgenius_plans'),
      logs: localStorage.getItem('fitgenius_logs'),
      cache: localStorage.getItem('fitgenius_exercise_cache_zh-TW') || localStorage.getItem('fitgenius_exercise_cache_en'), 
    };

    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitgenius_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Import Functionality ---
  const handleImportClick = () => {
    if (window.confirm(txt.set_import_confirm)) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const data = JSON.parse(json);

        if (data.settings) {
            const existingKeys = JSON.parse(localStorage.getItem('fitgenius_settings') || '{}').apiKeys;
            const importedSettings = JSON.parse(data.settings);
            if (existingKeys) {
                importedSettings.apiKeys = { ...existingKeys, ...importedSettings.apiKeys };
            }
            localStorage.setItem('fitgenius_settings', JSON.stringify(importedSettings));
        }
        if (data.weight) localStorage.setItem('fitgenius_weight', data.weight);
        if (data.plans) localStorage.setItem('fitgenius_plans', data.plans);
        if (data.logs) localStorage.setItem('fitgenius_logs', data.logs);
        if (data.cache) {
             const currentLang = JSON.parse(data.settings)?.language || 'zh-TW';
             localStorage.setItem(`fitgenius_exercise_cache_${currentLang}`, data.cache);
        }

        alert(txt.set_import_success);
        window.location.reload();
      } catch (err) {
        console.error(err);
        alert(txt.set_import_error);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="p-6 max-w-md mx-auto min-h-full pb-20">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">{txt.set_title}</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">

        {/* API Configuration */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-2">
                <Key size={16} /> {txt.set_api_config}
            </h2>

            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Cpu size={14} /> {txt.set_provider}
                </label>
                <select
                    value={formData.activeProvider}
                    onChange={(e) => handleChange('activeProvider', e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white"
                >
                    <option value="gemini">Google Gemini 2.5</option>
                    <option value="openrouter">OpenRouter (Free Models)</option>
                    <option value="openai">OpenAI (ChatGPT 4o-mini)</option>
                    <option value="grok">xAI (Grok 2)</option>
                    <option value="deepseek">DeepSeek (V3/R1)</option>
                </select>
            </div>

            <div className="space-y-3 pt-2">
                {formData.activeProvider === 'gemini' && (
                    <div className="animate-fade-in space-y-1">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">{txt.set_key_gemini}</label>
                        <input
                            type="password"
                            value={formData.apiKeys?.gemini || ''}
                            onChange={(e) => handleApiKeyChange('gemini', e.target.value)}
                            placeholder={txt.set_key_ph}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500 text-sm dark:text-white"
                        />
                         <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-blue-500 dark:text-blue-400 hover:underline">
                            <ExternalLink size={10} /> {txt.set_get_gemini}
                        </a>
                    </div>
                )}
                {/* Other Providers Inputs same pattern */}
                {formData.activeProvider === 'openrouter' && (
                    <div className="animate-fade-in space-y-2">
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">{txt.set_key_openrouter}</label>
                          <input
                              type="password"
                              value={formData.apiKeys?.openrouter || ''}
                              onChange={(e) => handleApiKeyChange('openrouter', e.target.value)}
                              placeholder={txt.set_key_ph}
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500 text-sm dark:text-white"
                          />
                          <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-blue-500 dark:text-blue-400 hover:underline">
                              <ExternalLink size={10} /> {txt.set_get_openrouter}
                          </a>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">{txt.set_openrouter_model}</label>
                          <select
                              value={formData.openrouterModel || 'google/gemini-2.0-flash-exp:free'}
                              onChange={(e) => handleChange('openrouterModel' as any, e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white text-sm"
                          >
                              <option value="google/gemini-2.0-flash-exp:free">google/gemini-2.0-flash-exp:free</option>
                              <option value="google/gemma-3-12b-it:free">google/gemma-3-12b-it:free</option>
                              <option value="google/gemma-3-27b-it:free">google/gemma-3-27b-it:free</option>
                              <option value="mistralai/mistral-small-3.1-24b-instruct:free">mistralai/mistral-small-3.1-24b-instruct:free</option>
                              <option value="qwen/qwen3-coder:free">qwen/qwen3-coder:free</option>
                          </select>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                            {txt.set_openrouter_tip}
                          </div>
                        </div>
                    </div>
                )}

                {formData.activeProvider === 'openai' && (
                     <div className="animate-fade-in space-y-1">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">{txt.set_key_openai}</label>
                        <input
                            type="password"
                            value={formData.apiKeys?.openai || ''}
                            onChange={(e) => handleApiKeyChange('openai', e.target.value)}
                            placeholder={txt.set_key_ph}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500 text-sm dark:text-white"
                        />
                         <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-blue-500 dark:text-blue-400 hover:underline">
                            <ExternalLink size={10} /> {txt.set_get_openai}
                        </a>
                    </div>
                )}
                {formData.activeProvider === 'grok' && (
                    <div className="animate-fade-in space-y-1">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">{txt.set_key_grok}</label>
                        <input
                            type="password"
                            value={formData.apiKeys?.grok || ''}
                            onChange={(e) => handleApiKeyChange('grok', e.target.value)}
                            placeholder={txt.set_key_ph}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500 text-sm dark:text-white"
                        />
                         <a href="https://console.x.ai/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-blue-500 dark:text-blue-400 hover:underline">
                            <ExternalLink size={10} /> {txt.set_get_grok}
                        </a>
                    </div>
                )}
                {formData.activeProvider === 'deepseek' && (
                    <div className="animate-fade-in space-y-1">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">{txt.set_key_deepseek}</label>
                        <input
                            type="password"
                            value={formData.apiKeys?.deepseek || ''}
                            onChange={(e) => handleApiKeyChange('deepseek', e.target.value)}
                            placeholder={txt.set_key_ph}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500 text-sm dark:text-white"
                        />
                         <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-blue-500 dark:text-blue-400 hover:underline">
                            <ExternalLink size={10} /> {txt.set_get_deepseek}
                        </a>
                    </div>
                )}
            </div>
            
            {!formData.apiKeys?.[formData.activeProvider] && (
                <div className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 p-3 rounded-lg text-xs font-medium">
                    {txt.set_no_key_warning}
                </div>
            )}
        </div>
        
        {/* AI Stats Section */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
             <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-2">
                <Activity size={16} /> {txt.set_ai_stats}
             </h2>
             <div className="grid grid-cols-3 gap-2">
                 <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl text-center">
                     <div className="text-emerald-500 mb-1 flex justify-center"><Zap size={20} /></div>
                     <div className="text-xl font-bold text-slate-800 dark:text-white">{stats.requests}</div>
                     <div className="text-[10px] text-slate-400 font-medium">{txt.set_ai_requests}</div>
                 </div>
                 <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl text-center">
                     <div className="text-blue-500 mb-1 flex justify-center"><HardDrive size={20} /></div>
                     <div className="text-xl font-bold text-slate-800 dark:text-white">{stats.cacheHits}</div>
                     <div className="text-[10px] text-slate-400 font-medium">{txt.set_ai_cache}</div>
                 </div>
                 <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl text-center">
                     <div className="text-purple-500 mb-1 flex justify-center"><Database size={20} /></div>
                     <div className="text-xl font-bold text-slate-800 dark:text-white">{stats.generatedPlans}</div>
                     <div className="text-[10px] text-slate-400 font-medium">{txt.set_ai_generated}</div>
                 </div>
             </div>
        </div>

        {/* Profile Section */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-2">
            <User size={16} /> {txt.set_profile}
          </h2>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{txt.set_name}</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Ruler size={14} /> {txt.set_height}
                </label>
                <input
                type="number"
                value={formData.height}
                onChange={(e) => handleChange('height', parseFloat(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Target size={14} /> {txt.set_weight_target}
                </label>
                <input
                type="number"
                step="0.1"
                value={formData.targetWeight}
                onChange={(e) => handleChange('targetWeight', parseFloat(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white"
                />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Globe size={14} /> {txt.set_language}
            </label>
            <select
                value={formData.language || 'zh-TW'}
                onChange={(e) => handleChange('language', e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white"
            >
                <option value="zh-TW">繁體中文 (Traditional Chinese)</option>
                <option value="en">English</option>
            </select>
          </div>
          
          {/* Theme Toggle */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                {formData.theme === 'dark' ? <Moon size={14}/> : <Sun size={14} />} {txt.set_theme}
            </label>
            <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                <button 
                    type="button"
                    onClick={() => handleChange('theme', 'light')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        formData.theme !== 'dark' 
                        ? 'bg-white text-slate-900 shadow-sm' 
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                >
                    {txt.set_theme_light}
                </button>
                <button 
                    type="button"
                    onClick={() => handleChange('theme', 'dark')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        formData.theme === 'dark' 
                        ? 'bg-slate-700 text-white shadow-sm' 
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                >
                    {txt.set_theme_dark}
                </button>
            </div>
          </div>
        </div>

        {/* Data Management Section */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-2">
                <Database size={16} /> {txt.set_data_mgmt}
            </h2>
            <div className="flex gap-4">
                <button
                    type="button"
                    onClick={handleExport}
                    className="flex-1 flex flex-col items-center justify-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                    <Download size={20} className="text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{txt.set_export}</span>
                </button>
                <button
                    type="button"
                    onClick={handleImportClick}
                    className="flex-1 flex flex-col items-center justify-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                    <Upload size={20} className="text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{txt.set_import}</span>
                </button>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept=".json" 
                    className="hidden" 
                />
            </div>
        </div>

        <button
          type="submit"
          className={`w-full py-3 rounded-xl font-bold shadow-lg transition-all ${
            saved 
              ? 'bg-emerald-500 text-white shadow-emerald-200' 
              : 'bg-slate-900 dark:bg-emerald-600 text-white shadow-slate-300 dark:shadow-none active:scale-95'
          }`}
        >
          {saved ? txt.set_btn_saved : txt.set_btn_save}
        </button>

      </form>

      <div className="mt-8 text-center pb-8">
          <p className="text-xs text-slate-300 dark:text-slate-600">FitGenius AI v2.3.0 (Tech Edition)</p>
      </div>
    </div>
  );
};

export default SettingsPage;
