
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Activity, Dumbbell, MessageSquare, Settings, Calendar, Download, Trophy } from 'lucide-react';
import { UserSettings, WeightEntry, WorkoutPlan, ExerciseLog, Exercise, Achievement } from './types';
import { checkNewAchievements } from './services/achievementService';
import { t } from './utils/translations';

// Components
import Dashboard from './components/Dashboard';
import ExerciseLibrary from './components/ExerciseLibrary';
import AICoach from './components/AICoach';
import SettingsPage from './components/SettingsPage';
import WorkoutManager from './components/WorkoutManager';

const App: React.FC = () => {
  // Global State
  const [userSettings, setUserSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('fitgenius_settings');
    const defaults: UserSettings = { 
        name: 'User', 
        height: 175, 
        targetWeight: 70, 
        language: 'zh-TW',
        theme: 'light',
        activeProvider: 'gemini',
        apiKeys: { gemini: '', openrouter: '', openai: '', grok: '', deepseek: '' },
        openrouterModel: 'google/gemini-2.0-flash-exp:free'
    };

    if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaults, ...parsed, apiKeys: { ...defaults.apiKeys, ...(parsed.apiKeys || {}) } };
    }
    return defaults;
  });

  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>(() => {
    const saved = localStorage.getItem('fitgenius_weight');
    return saved ? JSON.parse(saved) : [];
  });

  const [workoutPlans, setWorkoutPlans] = useState<WorkoutPlan[]>(() => {
    const savedPlans = localStorage.getItem('fitgenius_plans');
    if (savedPlans) {
        const parsed = JSON.parse(savedPlans);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }

    // Migration logic...
    const singlePlan = localStorage.getItem('fitgenius_plan');
    if (singlePlan) {
      try {
        const parsed = JSON.parse(singlePlan);
        if (parsed && parsed.days) return [parsed];
      } catch (e) {
        console.error("Migration failed", e);
      }
    }
    
    // PRESET DEFAULT PLAN
    return [{
          id: 'preset-weight-loss-v2',
          createdAt: Date.now(),
          goal: '高效燃脂 (Weight Loss Pro)',
          level: '初學者 (Beginner)',
          equipment: '自重 (Bodyweight)',
          duration: 45,
          days: [
              {
                  day: 'Day 1',
                  focus: '全身燃脂 (Full Body Burn)',
                  exercises: [
                      { name: 'Jumping Jacks', sets: '3', reps: '45s' },
                      { name: 'Bodyweight Squats', sets: '4', reps: '15' },
                      { name: 'Push Ups', sets: '3', reps: '12' },
                      { name: 'Lunges', sets: '3', reps: '12/side' },
                      { name: 'Plank', sets: '3', reps: '45s' },
                      { name: 'Mountain Climbers', sets: '3', reps: '30s' },
                      { name: 'High Knees', sets: '3', reps: '30s' }
                  ]
              },
               {
                  day: 'Day 2',
                  focus: '核心與腹肌 (Core Strength)',
                  exercises: [
                      { name: 'Crunches', sets: '3', reps: '20' },
                      { name: 'Leg Raises', sets: '3', reps: '15' },
                      { name: 'Russian Twists', sets: '3', reps: '20' },
                      { name: 'Bicycle Crunches', sets: '3', reps: '20' },
                      { name: 'Plank Hip Dips', sets: '3', reps: '15/side' },
                      { name: 'Flutter Kicks', sets: '3', reps: '30s' }
                  ]
              },
               {
                  day: 'Day 3',
                  focus: '下肢與臀部 (Lower Body)',
                  exercises: [
                      { name: 'Glute Bridges', sets: '4', reps: '20' },
                      { name: 'Reverse Lunges', sets: '3', reps: '15/side' },
                      { name: 'Wall Sit', sets: '3', reps: '45s' },
                      { name: 'Donkey Kicks', sets: '3', reps: '20/side' },
                      { name: 'Side Leg Raises', sets: '3', reps: '20/side' },
                      { name: 'Sumo Squats', sets: '3', reps: '15' }
                  ]
              },
              {
                  day: 'Day 4',
                  focus: '高強度間歇 (HIIT)',
                  exercises: [
                      { name: 'Burpees', sets: '3', reps: '12' },
                      { name: 'Jump Squats', sets: '3', reps: '15' },
                      { name: 'Push Up to Rotation', sets: '3', reps: '10' },
                      { name: 'Skaters', sets: '3', reps: '30s' },
                      { name: 'Plank Jacks', sets: '3', reps: '30s' },
                      { name: 'Fast Feet', sets: '3', reps: '30s' }
                  ]
              }
          ]
      }];
  });

  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>(() => {
    const saved = localStorage.getItem('fitgenius_logs');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Achievement State
  const [achievements, setAchievements] = useState<Achievement[]>(() => {
      const saved = localStorage.getItem('fitgenius_achievements');
      return saved ? JSON.parse(saved) : [];
  });
  const [newUnlock, setNewUnlock] = useState<Achievement | null>(null);

  const [importedPlan, setImportedPlan] = useState<WorkoutPlan | null>(null);

  const lang = userSettings.language || 'zh-TW';
  const txt = t[lang];

  // Persistence
  useEffect(() => {
    localStorage.setItem('fitgenius_settings', JSON.stringify(userSettings));
  }, [userSettings]);

  useEffect(() => {
    localStorage.setItem('fitgenius_weight', JSON.stringify(weightHistory));
  }, [weightHistory]);

  useEffect(() => {
    localStorage.setItem('fitgenius_plans', JSON.stringify(workoutPlans));
  }, [workoutPlans]);

  useEffect(() => {
    localStorage.setItem('fitgenius_logs', JSON.stringify(exerciseLogs));
  }, [exerciseLogs]);
  
  useEffect(() => {
      localStorage.setItem('fitgenius_achievements', JSON.stringify(achievements));
  }, [achievements]);

  // Dark Mode Class Handling
  useEffect(() => {
      if (userSettings.theme === 'dark') {
          document.documentElement.classList.add('dark');
      } else {
          document.documentElement.classList.remove('dark');
      }
  }, [userSettings.theme]);

  // Import Detection
  useEffect(() => {
      const hash = window.location.hash;
      if (hash.includes('import=')) {
          try {
              const base64Param = hash.split('import=')[1];
              const jsonStr = atob(base64Param);
              const plan = JSON.parse(jsonStr);
              if (plan && plan.days) {
                  setImportedPlan(plan);
                  // Remove param from url to prevent re-import
                  window.history.replaceState(null, '', window.location.pathname + '#/workouts');
              }
          } catch (e) {
              console.error("Import failed", e);
          }
      }
  }, []);

  const confirmImport = () => {
      if (importedPlan) {
          addWorkoutPlan({
              ...importedPlan,
              id: `imported-${Date.now()}`,
              goal: `(Imported) ${importedPlan.goal}`
          });
          setImportedPlan(null);
          alert("Plan Imported Successfully!");
      }
  };

  const updateSettings = (newSettings: Partial<UserSettings>) => {
    setUserSettings(prev => ({ ...prev, ...newSettings }));
  };

  const addWeightEntry = (weight: number) => {
    const newEntry: WeightEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      weight,
    };
    setWeightHistory(prev => {
      const updated = [...prev, newEntry];
      return updated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });
  };

  const addWorkoutPlan = (plan: WorkoutPlan) => {
    setWorkoutPlans(prev => [plan, ...prev]);
  };

  const deleteWorkoutPlan = (id: string) => {
    setWorkoutPlans(prev => prev.filter(p => p.id !== id));
  };

  const handleAddToPlan = (planId: string, dayIndex: number, exercise: Exercise) => {
      setWorkoutPlans(prev => prev.map(plan => {
          if (plan.id === planId) {
              const newDays = [...plan.days];
              if (newDays[dayIndex]) {
                  newDays[dayIndex] = {
                      ...newDays[dayIndex],
                      exercises: [
                          ...newDays[dayIndex].exercises,
                          {
                              name: exercise.name,
                              sets: '3',
                              reps: '10'
                          }
                      ]
                  };
              }
              return { ...plan, days: newDays };
          }
          return plan;
      }));
  };

  const addExerciseLog = (log: ExerciseLog) => {
    setExerciseLogs(prev => {
        const nextLogs = [...prev, log];
        // Trigger Achievement Check
        const unlockedIds = achievements.map(a => a.id);
        const newBadges = checkNewAchievements(nextLogs, unlockedIds);
        
        if (newBadges.length > 0) {
            setAchievements(curr => [...curr, ...newBadges]);
            setNewUnlock(newBadges[0]); // Show the first new one
            setTimeout(() => setNewUnlock(null), 5000);
        }
        
        return nextLogs;
    });
  };

  const deleteExerciseLog = (id: string) => {
    setExerciseLogs(prev => prev.filter(l => l.id !== id));
  };

  const NavItem = ({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center flex-1 h-full transition-all duration-300 relative group ${
          isActive 
            ? 'text-emerald-600 dark:text-emerald-400' 
            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
        }`
      }
    >
      {({ isActive }) => (
        <>
            {isActive && (
               <div className="absolute top-0 w-12 h-1 bg-emerald-500 dark:bg-emerald-400 rounded-b-lg shadow-[0_0_8px_rgba(16,185,129,0.4)] transition-all duration-300" />
            )}
            
            <div className={`transition-all duration-300 ${isActive ? '-translate-y-0.5' : 'group-hover:-translate-y-0.5'}`}>
                <Icon 
                    size={24} 
                    strokeWidth={isActive ? 2.5 : 2} 
                    className={`transition-all duration-300 ${isActive ? 'drop-shadow-sm scale-110' : ''}`}
                />
            </div>

            <span className={`text-[10px] mt-1 transition-all duration-300 tracking-wide ${
                isActive ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'font-medium text-slate-500 dark:text-slate-500'
            }`}>
                {label}
            </span>
        </>
      )}
    </NavLink>
  );

  return (
    <div className={userSettings.theme === 'dark' ? 'dark' : ''}>
    <HashRouter>
      <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-300">
        
        {/* Import Notification Overlay */}
        {importedPlan && (
            <div className="absolute top-4 left-4 right-4 z-[60] bg-emerald-600 text-white p-4 rounded-xl shadow-lg flex items-center justify-between animate-slide-up">
                <div>
                    <p className="font-bold text-sm">{txt.plan_import_detect}</p>
                    <p className="text-xs opacity-90">{importedPlan.goal}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setImportedPlan(null)} className="px-3 py-1 bg-white/20 rounded text-xs font-bold">Cancel</button>
                    <button onClick={confirmImport} className="px-3 py-1 bg-white text-emerald-700 rounded text-xs font-bold flex items-center gap-1">
                        <Download size={12} /> {txt.plan_import_btn}
                    </button>
                </div>
            </div>
        )}
        
        {/* Achievement Unlock Overlay */}
        {newUnlock && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-6">
                <div className="bg-gradient-to-br from-yellow-300 to-amber-500 p-1 rounded-3xl animate-bounce-in max-w-sm w-full shadow-2xl shadow-amber-500/50">
                    <div className="bg-white dark:bg-slate-900 rounded-[22px] p-8 text-center relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-300 via-transparent to-transparent" />
                        
                        <div className="bg-amber-100 dark:bg-amber-900/30 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 text-amber-500 animate-pulse">
                            <Trophy size={48} />
                        </div>
                        
                        <h3 className="text-amber-500 font-black uppercase tracking-widest text-sm mb-2">{txt.ach_unlocked}</h3>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{txt[newUnlock.titleKey] || newUnlock.titleKey}</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{txt[newUnlock.descKey] || newUnlock.descKey}</p>
                        
                        <button 
                            onClick={() => setNewUnlock(null)}
                            className="bg-amber-500 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-amber-200 dark:shadow-none active:scale-95 transition-transform"
                        >
                            {txt.wo_resume}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto pb-20">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route 
              path="/dashboard" 
              element={
                <Dashboard 
                  userSettings={userSettings} 
                  weightHistory={weightHistory} 
                  logs={exerciseLogs}
                  achievements={achievements}
                  onAddWeight={addWeightEntry} 
                />
              } 
            />
            <Route 
              path="/workouts" 
              element={
                <WorkoutManager
                  userSettings={userSettings}
                  plans={workoutPlans}
                  logs={exerciseLogs}
                  onAddPlan={addWorkoutPlan}
                  onDeletePlan={deleteWorkoutPlan}
                  onAddLog={addExerciseLog}
                  onDeleteLog={deleteExerciseLog}
                />
              } 
            />
            <Route 
              path="/exercises" 
              element={
                <ExerciseLibrary 
                    userSettings={userSettings} 
                    plans={workoutPlans}
                    onAddToPlan={handleAddToPlan}
                />
              } 
            />
            <Route 
              path="/coach" 
              element={
                <AICoach 
                  userSettings={userSettings} 
                  onAddPlan={addWorkoutPlan}
                />
              } 
            />
            <Route 
              path="/settings" 
              element={
                <SettingsPage 
                  settings={userSettings} 
                  onUpdate={updateSettings} 
                />
              } 
            />
          </Routes>
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] dark:shadow-none z-50 safe-area-pb transition-colors duration-300">
          <div className="flex justify-between items-center h-16 max-w-md mx-auto px-2">
            <NavItem to="/dashboard" icon={Activity} label={txt.nav_home} />
            <NavItem to="/workouts" icon={Calendar} label={txt.nav_plans} />
            <NavItem to="/exercises" icon={Dumbbell} label={txt.nav_library} />
            <NavItem to="/coach" icon={MessageSquare} label={txt.nav_coach} />
            <NavItem to="/settings" icon={Settings} label={txt.nav_settings} />
          </div>
        </nav>
      </div>
    </HashRouter>
    </div>
  );
};

export default App;
