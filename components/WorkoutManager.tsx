
import React, { useState, useEffect, useRef } from 'react';
import { WorkoutPlan, ExerciseLog, UserSettings, Exercise } from '../types';
import { generateStructuredWorkoutPlan } from '../services/geminiService';
import { searchExercises } from '../services/exerciseService';
import ExerciseDetailModal from './ExerciseDetailModal';
import { 
  ClipboardList, 
  History, 
  Plus, 
  Loader2, 
  Dumbbell, 
  Clock, 
  Repeat,
  Trash2,
  PlayCircle,
  ChevronRight,
  ArrowLeft,
  Calendar,
  Play,
  SkipForward,
  CheckCircle,
  X,
  Pause,
  RefreshCw,
  Trophy,
  Zap,
  Volume2,
  Share2,
  Filter
} from 'lucide-react';
import { t } from '../utils/translations';

interface WorkoutManagerProps {
  userSettings: UserSettings;
  plans: WorkoutPlan[];
  logs: ExerciseLog[];
  onAddPlan: (plan: WorkoutPlan) => void;
  onDeletePlan: (id: string) => void;
  onAddLog: (log: ExerciseLog) => void;
  onDeleteLog: (id: string) => void;
}

interface ActiveSessionState {
    planId: string;
    dayIndex: number;
    exerciseIndex: number;
    currentSet: number;
    step: 'ready' | 'work' | 'rest' | 'complete';
}

const WorkoutManager: React.FC<WorkoutManagerProps> = ({ 
  userSettings, 
  plans, 
  logs, 
  onAddPlan,
  onDeletePlan,
  onAddLog,
  onDeleteLog
}) => {
  const [activeTab, setActiveTab] = useState<'plan' | 'log' | 'history'>('plan');
  const lang = userSettings.language || 'zh-TW';
  const txt = t[lang];
  
  // Plan Navigation State
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedPlan, setSelectedPlan] = useState<WorkoutPlan | null>(null);
  const [generating, setGenerating] = useState(false);
  
  // Active Workout Session State
  const [activeSession, setActiveSession] = useState<ActiveSessionState | null>(null);
  const [restDefault, setRestDefault] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('fitgenius_rest_default');
      return raw ? Number(raw) : 60;
    } catch {
      return 60;
    }
  });
  const [restTimer, setRestTimer] = useState(60);
  const [workTimer, setWorkTimer] = useState(0); 
  const [timerRunning, setTimerRunning] = useState(false);

  // Ready countdown (hands-free start)
  const [readyTimer, setReadyTimer] = useState(3);
  const [readyRunning, setReadyRunning] = useState(false);
  
  // Progressive Overload & PRs
  const [overloadSuggestion, setOverloadSuggestion] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [prMessage, setPrMessage] = useState<string | null>(null);

  // History Filtering
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Plan Generator Inputs
  const [goal, setGoal] = useState(lang === 'en' ? 'Weight Loss' : '減重');
  const [level, setLevel] = useState(lang === 'en' ? 'Beginner' : '初學者');
  const [equipment, setEquipment] = useState(lang === 'en' ? 'Bodyweight' : '自重 (無器材)');
  const [days, setDays] = useState(3);
  const [duration, setDuration] = useState(45);

  // Logging State
  const [logForm, setLogForm] = useState({
    exerciseName: '',
    sets: 3,
    reps: 10,
    weight: 0,
    durationMinutes: 0
  });

  // Exercise Detail View State
  const [viewingExercise, setViewingExercise] = useState<Exercise | null>(null);
  const [loadingExercise, setLoadingExercise] = useState<string | null>(null);

  // --- Voice / TTS Helper ---
  const speak = (text: string) => {
      if (!window.speechSynthesis) return;
      // Cancel previous speech to prevent queue buildup
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'en' ? 'en-US' : 'zh-TW';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
  };

  // Timer Effect
  useEffect(() => {
    let interval: any = null;

    if (activeSession) {
        if (activeSession.step === 'ready' && readyRunning) {
            // Countdown for Ready
            if (readyTimer > 0) {
                interval = setInterval(() => setReadyTimer((p) => p - 1), 1000);
            } else {
                playBeep();
                try { navigator.vibrate?.(80); } catch {}
                setReadyRunning(false);
                setTimeout(() => {
                  try { nextSessionStep(); } catch {}
                }, 50);
            }
        }

        if (timerRunning) {
            if (activeSession.step === 'rest') {
                // Countdown for Rest
                if (restTimer > 0) {
                    interval = setInterval(() => {
                        setRestTimer((prev) => prev - 1);
                    }, 1000);
                } else {
                    // Rest finished -> beep/vibrate -> auto-advance
                    playBeep();
                    try { navigator.vibrate?.(200); } catch {}
                    speak(lang === 'en' ? "Rest complete. Next." : "休息結束，下一組／下一個動作");
                    setTimerRunning(false);
                    // Allow state to settle then advance
                    setTimeout(() => {
                      try { nextSessionStep(); } catch {}
                    }, 50);
                }
            } else if (activeSession.step === 'work') {
                // Count UP for Work
                interval = setInterval(() => {
                    setWorkTimer((prev) => prev + 1);
                }, 1000);
            }
        }
    }

    return () => clearInterval(interval);
  }, [activeSession, timerRunning, restTimer, readyRunning, readyTimer]);

  // When entering Ready step, auto start a short countdown (hands-free)
  useEffect(() => {
    if (activeSession?.step === 'ready') {
      setReadyTimer(3);
      setReadyRunning(true);
    } else {
      setReadyRunning(false);
    }
  }, [activeSession?.step, activeSession?.exerciseIndex, activeSession?.dayIndex]);

  // Progressive Overload Analysis
  useEffect(() => {
      if (activeSession && activeSession.step === 'ready' && selectedPlan) {
          const currentEx = selectedPlan.days[activeSession.dayIndex].exercises[activeSession.exerciseIndex];
          // Find last log for this exercise
          const history = logs.filter(l => l.exerciseName === currentEx.name).sort((a,b) => b.timestamp - a.timestamp);
          
          if (history.length > 0) {
              const last = history[0];
              if (last.weight > 0) {
                  const suggestedWeight = last.weight + 2.5;
                  const msg = txt.wo_overload_msg
                      .replace('{weight}', String(last.weight))
                      .replace('{reps}', String(last.reps))
                      .replace('{newWeight}', String(suggestedWeight));
                  setOverloadSuggestion(msg);
              } else {
                  setOverloadSuggestion(null);
              }
          } else {
              setOverloadSuggestion(null);
          }
      }
  }, [activeSession?.step, activeSession?.exerciseIndex]);


  const playBeep = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.value = 0.1;
            osc.start();
            setTimeout(() => osc.stop(), 500);
        }
    } catch (e) {
        console.error("Audio error", e);
    }
  };

  const handleGeneratePlan = async () => {
    setGenerating(true);
    try {
      const result = await generateStructuredWorkoutPlan(goal, level, equipment, days, duration, lang);
      const newPlan: WorkoutPlan = {
        id: Date.now().toString(),
        createdAt: Date.now(),
        goal,
        level,
        equipment,
        duration,
        days: result.days || []
      };
      onAddPlan(newPlan);
      setViewMode('list');
    } catch (err) {
      alert("Error generating plan. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDeletePlan = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if(window.confirm('Delete this plan?')) {
          onDeletePlan(id);
          if (selectedPlan?.id === id) {
              setSelectedPlan(null);
              setViewMode('list');
          }
      }
  };

  const handleSharePlan = (plan: WorkoutPlan) => {
      try {
          const jsonStr = JSON.stringify(plan);
          const base64 = btoa(jsonStr);
          const url = `${window.location.origin}${window.location.pathname}#/?import=${base64}`;
          
          navigator.clipboard.writeText(url).then(() => {
              alert(txt.plan_share_success);
          });
      } catch (e) {
          console.error("Share failed", e);
      }
  };

  const handleViewExercise = async (exerciseName: string) => {
    setLoadingExercise(exerciseName);
    try {
        const results = await searchExercises(exerciseName, lang);
        if (results && results.length > 0) {
            setViewingExercise(results[0]);
        } else {
            alert(`No details found for "${exerciseName}".`);
        }
    } catch (error) {
        console.error("Failed to fetch details", error);
        alert("Could not load exercise details.");
    } finally {
        setLoadingExercise(null);
    }
  };

  const handleLogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!logForm.exerciseName) return;

    // PR Check
    const prevMax = Math.max(...logs.filter(l => l.exerciseName === logForm.exerciseName).map(l => l.weight), 0);
    if (logForm.weight > prevMax && logForm.weight > 0) {
        setPrMessage(txt.wo_pr_msg.replace('{exercise}', logForm.exerciseName));
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
    }

    const newLog: ExerciseLog = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      timestamp: Date.now(),
      exerciseName: logForm.exerciseName,
      sets: Number(logForm.sets),
      reps: Number(logForm.reps),
      weight: Number(logForm.weight),
      durationMinutes: Number(logForm.durationMinutes)
    };
    onAddLog(newLog);
    setLogForm({ exerciseName: '', sets: 3, reps: 10, weight: 0, durationMinutes: 0 });
    setActiveTab('history');
  };

  const quickLog = (name: string, sets: string, reps: string) => {
    setLogForm({
      ...logForm,
      exerciseName: name,
      sets: parseInt(sets) || 3,
      reps: parseInt(reps) || 10,
    });
    setActiveTab('log');
  };

  // --- Session Control Functions ---
  const startSession = (planId: string, dayIndex: number) => {
      const day = plans.find(p => p.id === planId)?.days[dayIndex];
      const firstExercise = day?.exercises[0];

      if (day && firstExercise) {
          const intro = lang === 'en' ? `Get ready for ${firstExercise.name}` : `準備開始：${firstExercise.name}`;
          speak(intro);
      }
      setActiveSession({
          planId,
          dayIndex,
          exerciseIndex: 0,
          currentSet: 1,
          step: 'ready' 
      });
  };

  const nextSessionStep = () => {
      if (!activeSession || !selectedPlan) return;
      
      const currentDay = selectedPlan.days[activeSession.dayIndex];
      const currentExercise = currentDay.exercises[activeSession.exerciseIndex];
      const totalExercises = currentDay.exercises.length;
      const targetSets = parseInt(currentExercise.sets) || 3;

      if (activeSession.step === 'ready') {
          // Ready -> Work
          setActiveSession({ ...activeSession, step: 'work' });
          setWorkTimer(0);
          setTimerRunning(true);
          // Speak Exercise Name on Start
          const startMsg = lang === 'en' ? `Start ${currentExercise.name}` : `開始：${currentExercise.name}`;
          speak(startMsg);

      } else if (activeSession.step === 'work') {
          // Finish Set
          if (activeSession.currentSet < targetSets) {
               setActiveSession({ ...activeSession, step: 'rest' });
               setRestTimer(restDefault);
               setTimerRunning(true);
               speak(lang === 'en' ? "Rest" : "休息");
          } else {
              if (activeSession.exerciseIndex < totalExercises - 1) {
                  setActiveSession({ ...activeSession, step: 'rest' });
                  setRestTimer(restDefault);
                  setTimerRunning(true);
                  speak(lang === 'en' ? "Rest. Next exercise coming up." : "休息。準備下一個動作");
              } else {
                  setActiveSession({ ...activeSession, step: 'complete' });
                  setTimerRunning(false);
                  speak(lang === 'en' ? "Workout complete! Great job." : "訓練完成！太棒了");
              }
          }
      } else if (activeSession.step === 'rest') {
          if (activeSession.currentSet < targetSets) {
               // Same Exercise, Next Set
               setActiveSession({
                   ...activeSession,
                   currentSet: activeSession.currentSet + 1,
                   step: 'work'
               });
               setWorkTimer(0);
               setTimerRunning(true);
               speak(lang === 'en' ? `Set ${activeSession.currentSet + 1}` : `第 ${activeSession.currentSet + 1} 組`);
          } else {
              // Next Exercise
              const nextEx = currentDay.exercises[activeSession.exerciseIndex + 1];
              setActiveSession({
                  ...activeSession,
                  exerciseIndex: activeSession.exerciseIndex + 1,
                  currentSet: 1,
                  step: 'ready'
              });
              setTimerRunning(false);
              // Announce next exercise in Ready phase
              if (nextEx) {
                  const readyMsg = lang === 'en' ? `Get ready for ${nextEx.name}` : `準備開始：${nextEx.name}`;
                  speak(readyMsg);
              }
          }
      }
  };

  const logCurrentSet = () => {
    if (!activeSession || !selectedPlan) return;
    const day = selectedPlan.days[activeSession.dayIndex];
    const ex = day.exercises[activeSession.exerciseIndex];

    const log: ExerciseLog = {
      id: Date.now() + Math.random().toString(),
      date: new Date().toISOString(),
      timestamp: Date.now(),
      exerciseName: ex.name,
      sets: 1,
      reps: parseInt(ex.reps) || 10,
      weight: 0,
      durationMinutes: Math.max(1, Math.round(workTimer / 60))
    };
    onAddLog(log);
    speak(lang === 'en' ? 'Logged.' : '已記錄');
  };

  const finishSession = (save: boolean) => {
      if (save && activeSession && selectedPlan) {
          const day = selectedPlan.days[activeSession.dayIndex];
          day.exercises.forEach(ex => {
             const log: ExerciseLog = {
                 id: Date.now() + Math.random().toString(),
                 date: new Date().toISOString(),
                 timestamp: Date.now(),
                 exerciseName: ex.name,
                 sets: parseInt(ex.sets) || 3,
                 reps: parseInt(ex.reps) || 10,
                 weight: 0, 
                 durationMinutes: selectedPlan.duration ? Math.round(selectedPlan.duration / day.exercises.length) : 5
             };
             onAddLog(log);
          });
          setActiveTab('history');
      }
      setActiveSession(null);
      setTimerRunning(false);
      setReadyRunning(false);
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const getDayProgress = () => {
    if (!activeSession || !selectedPlan) return { done: 0, total: 0, pct: 0 };
    const day = selectedPlan.days[activeSession.dayIndex];
    const setsPerExercise = day.exercises.map(ex => parseInt(ex.sets) || 3);
    const totalSets = setsPerExercise.reduce((a,b) => a + b, 0);

    // Done sets = all sets from previous exercises + (currentSet-1) if currently on work/rest, or currentSet-1 if ready
    const prevSets = setsPerExercise.slice(0, activeSession.exerciseIndex).reduce((a,b) => a + b, 0);
    const currentDone = Math.max(0, activeSession.currentSet - 1);
    const doneSets = prevSets + currentDone;

    const pct = totalSets > 0 ? Math.min(100, Math.round((doneSets / totalSets) * 100)) : 0;
    return { done: doneSets, total: totalSets, pct };
  };

  const getWeeklyStreak = () => {
      const today = new Date();
      const last7Days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(today.getDate() - (6 - i));
          return d.toISOString().split('T')[0];
      });

      return last7Days.map(dateStr => {
          const hasLog = logs.some(log => log.date.startsWith(dateStr));
          return { date: dateStr, active: hasLog };
      });
  };
  
  // Group Logs By Date
  const getGroupedLogs = () => {
      const grouped: Record<string, ExerciseLog[]> = {};
      const filtered = selectedDate 
        ? logs.filter(l => l.date.startsWith(selectedDate)) 
        : logs;
        
      filtered.forEach(log => {
          const dateKey = log.date.split('T')[0];
          if (!grouped[dateKey]) grouped[dateKey] = [];
          grouped[dateKey].push(log);
      });
      
      // Sort dates desc
      return Object.entries(grouped).sort((a,b) => b[0].localeCompare(a[0]));
  };

  // --- Active Session Overlay ---
  const renderActiveSession = () => {
    if (!activeSession || !selectedPlan) return null;
    const day = selectedPlan.days[activeSession.dayIndex];
    const exercise = day.exercises[activeSession.exerciseIndex];
    const targetSets = parseInt(exercise.sets) || 3;
    const nextExercise = activeSession.exerciseIndex < day.exercises.length - 1 
        ? day.exercises[activeSession.exerciseIndex + 1] 
        : null;

    // TECH MODE STYLES
    const bgBase = "bg-slate-900 text-white";
    const cardBg = "bg-slate-800 border-slate-700";
    const accentText = "text-emerald-400";
    
    if (activeSession.step === 'complete') {
        const totalSets = day.exercises.reduce((acc, ex) => acc + (parseInt(ex.sets) || 0), 0);
        const totalReps = day.exercises.reduce((acc, ex) => acc + ((parseInt(ex.sets) || 0) * (parseInt(ex.reps) || 0)), 0);

        return (
            <div className={`fixed inset-0 z-[60] flex flex-col p-6 animate-fade-in ${userSettings.theme === 'dark' ? bgBase : 'bg-white text-slate-900'}`}>
                <div className="flex-1 flex flex-col items-center pt-10">
                    <div className="bg-emerald-100 p-4 rounded-full text-emerald-600 mb-4 animate-bounce">
                        <Trophy size={48} />
                    </div>
                    <h2 className="text-2xl font-black mb-2 uppercase tracking-tight">{txt.wo_mission_report}</h2>
                    <p className="opacity-70 text-center mb-8 text-sm">{txt.wo_completed_desc}</p>
                    
                    <div className={`w-full border rounded-2xl p-4 mb-6 flex justify-around ${userSettings.theme === 'dark' ? cardBg : 'bg-slate-50 border-slate-100'}`}>
                        <div className="text-center">
                            <p className="text-xs opacity-50 font-bold uppercase">{txt.log_sets}</p>
                            <p className="text-xl font-black">{totalSets}</p>
                        </div>
                        <div className="text-center border-l pl-4 border-slate-700">
                            <p className="text-xs opacity-50 font-bold uppercase">{txt.wo_total_vol}</p>
                            <p className="text-xl font-black text-emerald-500">{totalReps}</p>
                        </div>
                    </div>

                    <div className="w-full flex-1 overflow-y-auto mb-6 pr-2">
                        <h3 className="text-xs font-bold opacity-50 uppercase mb-3 tracking-wider">Completed Exercises</h3>
                        <div className="space-y-3">
                            {day.exercises.map((ex, i) => (
                                <div key={i} className={`flex items-center justify-between border p-3 rounded-xl shadow-sm ${userSettings.theme === 'dark' ? cardBg : 'bg-white border-slate-100'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="bg-emerald-500/20 text-emerald-500 rounded-full p-1">
                                            <CheckCircle size={16} />
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm">{ex.name}</p>
                                            <p className="text-xs opacity-50">{ex.sets} x {ex.reps}</p>
                                        </div>
                                    </div>
                                    <span className="text-xs font-mono font-bold opacity-30">DONE</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="w-full space-y-3">
                    <button 
                        onClick={() => finishSession(true)}
                        className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform"
                    >
                        {txt.wo_save_logs}
                    </button>
                    <button 
                        onClick={() => finishSession(false)}
                        className="w-full opacity-50 font-semibold py-2 hover:opacity-100 text-sm"
                    >
                        {txt.wo_quit}
                    </button>
                </div>
            </div>
        );
    }
    
    if (activeSession.step === 'ready') {
         const prog = getDayProgress();
         return (
            <div className={`fixed inset-0 z-[60] flex flex-col p-8 animate-fade-in justify-center items-center ${bgBase}`}> 
                <div className="absolute top-4 left-4 right-4">
                  <div className="flex items-center justify-between text-[11px] opacity-70">
                    <span>{prog.done}/{prog.total}</span>
                    <span>{prog.pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden mt-2">
                    <div className="h-full bg-emerald-500" style={{ width: `${prog.pct}%` }} />
                  </div>
                </div>
                <p className="text-emerald-400 font-bold uppercase tracking-widest mb-2 animate-pulse">{txt.wo_get_ready}</p>
                <div className="text-white/60 text-sm font-mono mb-4" onClick={() => setReadyRunning(!readyRunning)} title={lang === 'en' ? 'Tap to pause/resume countdown' : '點擊暫停/繼續倒數'}>
                  {readyRunning ? (lang === 'en' ? 'Auto start in' : '自動開始倒數') : (lang === 'en' ? 'Paused' : '已暫停')} <span className="text-2xl font-black text-emerald-400">{readyTimer}</span>
                </div>
                <h2 className="text-4xl sm:text-5xl font-black text-center mb-6 leading-tight">{exercise.name}</h2>
                <div className="flex gap-6 mb-8">
                     <div className="text-center">
                         <p className="text-sm opacity-50 uppercase font-bold">{txt.wo_target}</p>
                         <p className="text-2xl font-bold">{exercise.sets} <span className="text-sm font-normal opacity-50">{txt.log_sets}</span></p>
                     </div>
                     <div className="w-px bg-white/20"></div>
                     <div className="text-center">
                         <p className="text-sm opacity-50 uppercase font-bold">{txt.log_reps}</p>
                         <p className="text-2xl font-bold">{exercise.reps}</p>
                     </div>
                </div>
                {overloadSuggestion && (
                    <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl max-w-xs w-full text-center mb-6 animate-slide-up">
                        <p className="text-xs text-amber-500 font-bold uppercase mb-1 flex items-center justify-center gap-1">
                            {txt.wo_overload_tip}
                        </p>
                        <p className="text-amber-200 text-sm">{overloadSuggestion}</p>
                    </div>
                )}
                <button onClick={() => handleViewExercise(exercise.name)} disabled={loadingExercise === exercise.name} className="mb-6 flex items-center gap-2 text-white bg-white/10 px-6 py-3 rounded-full font-semibold hover:bg-white/20 transition-all active:scale-95 border border-white/10 backdrop-blur-sm">
                    {loadingExercise === exercise.name ? <Loader2 size={20} className="animate-spin" /> : <PlayCircle size={20} />} {txt.plan_view_guide}
                </button>
                <button onClick={nextSessionStep} className="w-full max-w-xs bg-emerald-600 text-white py-4 rounded-full font-bold text-xl shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_30px_rgba(16,185,129,0.6)] active:scale-95 transition-all flex items-center justify-center gap-2">
                    <Play size={24} fill="currentColor" /> {txt.wo_start}
                </button>
            </div>
         );
    }

    if (activeSession.step === 'rest') {
        const isInterSetRest = activeSession.currentSet < targetSets;
        return (
            <div className={`fixed inset-0 z-[60] flex flex-col p-6 animate-fade-in ${bgBase}`}>
                <div className="flex-1 flex flex-col items-center justify-center">
                    <p className="text-emerald-400 font-bold uppercase tracking-widest mb-4">{txt.wo_rest}</p>
                    <div className="text-8xl font-black font-mono mb-8 tracking-tighter tabular-nums text-white">
                        {Math.floor(restTimer / 60)}:{String(restTimer % 60).padStart(2, '0')}
                    </div>
                    <div className="flex gap-4">
                        <button onClick={() => setRestTimer(prev => prev + 10)} className="px-4 py-2 bg-white/10 rounded-lg text-sm font-semibold hover:bg-white/20">+10s</button>
                        <button onClick={() => setRestTimer(prev => Math.max(0, prev - 10))} className="px-4 py-2 bg-white/10 rounded-lg text-sm font-semibold hover:bg-white/20">-10s</button>
                        <button
                          onClick={() => {
                            setRestDefault(restTimer);
                            try { localStorage.setItem('fitgenius_rest_default', String(restTimer)); } catch {}
                          }}
                          className="px-4 py-2 bg-emerald-500/20 border border-emerald-400/30 rounded-lg text-sm font-semibold hover:bg-emerald-500/30"
                          title={lang === 'en' ? 'Set current as default rest' : '將目前休息時間設為預設'}
                        >
                          {lang === 'en' ? 'Set Default' : '設為預設'}
                        </button>
                    </div>
                </div>
                <div className="mb-8">
                    {isInterSetRest ? (
                         <div className={`p-6 rounded-2xl border ${cardBg}`}>
                             <p className="opacity-50 text-xs font-bold uppercase mb-2">{txt.wo_up_next}</p>
                             <h3 className="text-2xl font-bold mb-1">{exercise.name}</h3>
                             <p className={accentText}>Set {activeSession.currentSet + 1} / {targetSets}</p>
                         </div>
                    ) : nextExercise ? (
                        <div className={`p-6 rounded-2xl border ${cardBg}`}>
                            <p className="opacity-50 text-xs font-bold uppercase mb-2">{txt.wo_up_next}</p>
                            <h3 className="text-2xl font-bold mb-1">{nextExercise.name}</h3>
                            <p className={accentText}>{nextExercise.sets} x {nextExercise.reps}</p>
                        </div>
                    ) : (
                        <div className={`p-6 rounded-2xl border ${cardBg}`}>
                             <h3 className="text-xl font-bold text-emerald-400">Finish Line!</h3>
                        </div>
                    )}
                </div>
                <button onClick={nextSessionStep} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2">
                    {txt.wo_skip_rest} <SkipForward size={24} />
                </button>
            </div>
        );
    }
    
    // Work Mode
    const prog = getDayProgress();
    return (
        <div className={`fixed inset-0 z-[60] flex flex-col animate-fade-in ${userSettings.theme === 'dark' ? bgBase : 'bg-white text-slate-900'}`}>
             <div className="p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-bold opacity-50 uppercase tracking-wider">
                      Ex {activeSession.exerciseIndex + 1}/{day.exercises.length} • Set {activeSession.currentSet}/{targetSets}
                  </p>
                  <button onClick={() => setActiveSession(null)} className="p-2 opacity-50 hover:opacity-100 rounded-full"><X size={20} /></button>
                </div>
                <div className="flex items-center justify-between text-[11px] opacity-60">
                  <span>{prog.done}/{prog.total}</span>
                  <span>{prog.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200/60 dark:bg-white/10 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${prog.pct}%` }} />
                </div>
             </div>
             <div className="flex-1 flex flex-col items-center p-6 text-center overflow-y-auto">
                 <h2 className="text-3xl sm:text-4xl font-black mb-6 leading-tight">{exercise.name}</h2>
                 <div className="mb-8 relative group">
                     <div className={`text-8xl sm:text-9xl font-mono font-black tracking-tighter tabular-nums transition-colors duration-300 select-none ${timerRunning ? 'text-emerald-500 drop-shadow-lg' : 'opacity-30'}`} onClick={() => setTimerRunning(!timerRunning)}>
                        {formatTime(workTimer)}
                     </div>
                     <p className="text-xs opacity-50 uppercase tracking-widest font-semibold mt-2 animate-pulse">{timerRunning ? 'Session Active' : 'Paused'}</p>
                     <div className="flex justify-center gap-4 mt-4">
                         <button onClick={() => setTimerRunning(!timerRunning)} className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors">
                            {timerRunning ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                         </button>
                         <button onClick={() => setWorkTimer(0)} className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors">
                            <RefreshCw size={24} />
                         </button>
                     </div>
                 </div>
                 <div className="flex items-center gap-4 text-lg font-medium mb-6">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 px-6 py-3 rounded-2xl flex flex-col items-center min-w-[100px]">
                        <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{activeSession.currentSet} <span className="text-sm opacity-50">/ {targetSets}</span></span>
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 uppercase font-bold">{txt.wo_active_set}</span>
                    </div>
                    <div className="bg-slate-100 dark:bg-slate-800 px-6 py-3 rounded-2xl flex flex-col items-center min-w-[100px]">
                        <span className="text-2xl font-bold">{exercise.reps}</span>
                        <span className="text-xs opacity-50 uppercase">{txt.log_reps}</span>
                    </div>
                 </div>
                 <div className="w-full max-w-xs h-32 bg-slate-900 rounded-xl mb-6 flex items-center justify-center relative overflow-hidden group cursor-pointer border-2 border-slate-100 dark:border-slate-800 hover:border-emerald-400 transition-colors" onClick={() => handleViewExercise(exercise.name)}>
                    {loadingExercise === exercise.name ? <Loader2 size={32} className="text-emerald-500 animate-spin" /> : <> <PlayCircle size={32} className="text-white opacity-80" /> <p className="absolute bottom-2 text-white text-[10px] opacity-70 uppercase font-bold tracking-wide">{txt.plan_view_guide}</p> </>}
                 </div>
             </div>
             <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                 <button onClick={logCurrentSet} className="w-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 py-3 rounded-2xl font-bold text-base active:scale-95 transition-all flex items-center justify-center gap-2">
                    <ClipboardList size={18} /> {lang === 'en' ? 'Log this set' : '記錄本組'}
                 </button>
                 <button onClick={nextSessionStep} className="w-full bg-slate-900 dark:bg-emerald-600 text-white py-4 rounded-2xl font-bold text-xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3">
                    {activeSession.currentSet < targetSets ? <>{txt.wo_next} <Repeat size={24} /></> : <>{txt.wo_next} <ChevronRight size={24} /></>}
                 </button>
             </div>
        </div>
    );
  };
  
  // Reuse renderPlanContent logic...
  const renderPlanContent = () => {
    if (viewMode === 'create') {
          return (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 text-center space-y-4 animate-fade-in-up">
                <div className="flex justify-start">
                    <button onClick={() => setViewMode('list')} className="text-slate-500 dark:text-slate-400 flex items-center gap-1 text-sm font-medium">
                        <ArrowLeft size={16} /> {txt.plan_btn_back}
                    </button>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
                  <ClipboardList size={32} />
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">{txt.plan_new_title}</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm">{txt.plan_new_subtitle}</p>
                <div className="space-y-3 text-left">
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{txt.plan_goal}</label>
                    <select value={goal} onChange={(e) => setGoal(e.target.value)} className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-lg dark:text-white">
                      {lang === 'en' ? (<><option>Weight Loss</option><option>Muscle Gain</option><option>Endurance</option><option>Flexibility</option></>) : (<><option>減重</option><option>增肌</option><option>耐力訓練</option><option>柔軟度/伸展</option></>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{txt.plan_level}</label>
                    <select value={level} onChange={(e) => setLevel(e.target.value)} className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-lg dark:text-white">
                      {lang === 'en' ? (<><option>Beginner</option><option>Intermediate</option><option>Advanced</option></>) : (<><option>初學者</option><option>中階</option><option>進階</option></>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{txt.plan_equip}</label>
                    <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-lg dark:text-white">
                      {lang === 'en' ? (<><option>Bodyweight</option><option>Dumbbells</option><option>Gym Equipment</option><option>Resistance Bands</option></>) : (<><option>自重 (無器材)</option><option>啞鈴</option><option>健身房器材</option><option>彈力帶</option></>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{txt.plan_days_week}</label>
                        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-lg dark:text-white"><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option><option value={5}>5</option><option value={6}>6</option></select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{txt.plan_duration}</label>
                        <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-lg dark:text-white"><option value={15}>15</option><option value={30}>30</option><option value={45}>45</option><option value={60}>60</option><option value={90}>90</option></select>
                      </div>
                  </div>
                </div>
                <button onClick={handleGeneratePlan} disabled={generating} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-emerald-200 dark:shadow-none active:scale-95 transition-all flex justify-center items-center gap-2">
                  {generating ? <Loader2 className="animate-spin" /> : <Plus size={20} />} {txt.plan_btn_generate}
                </button>
            </div>
          );
      }
      if (viewMode === 'detail' && selectedPlan) {
          return (
              <div className="space-y-4 animate-slide-up">
                 <div className="flex items-center justify-between mb-2">
                    <button onClick={() => setViewMode('list')} className="text-slate-500 dark:text-slate-400 flex items-center gap-1 text-sm font-medium hover:text-emerald-600"><ArrowLeft size={18} /> {txt.plan_btn_back}</button>
                    <button onClick={() => handleSharePlan(selectedPlan!)} className="text-emerald-600 dark:text-emerald-400 text-sm font-medium flex items-center gap-1"><Share2 size={16} /> {txt.plan_share}</button>
                 </div>
                 <div className="bg-emerald-600 text-white p-6 rounded-2xl shadow-lg shadow-emerald-200 dark:shadow-none relative overflow-hidden">
                    <div className="relative z-10">
                        <h2 className="text-2xl font-bold">{selectedPlan.goal}</h2>
                        <div className="flex flex-wrap items-center gap-2 mt-2 opacity-90"><span className="bg-white/20 px-2 py-1 rounded text-xs">{selectedPlan.level}</span><span className="bg-white/20 px-2 py-1 rounded text-xs">{selectedPlan.days.length} Days/Wk</span>{selectedPlan.duration && <span className="bg-white/20 px-2 py-1 rounded text-xs">{selectedPlan.duration} {txt.plan_mins}</span>}</div>
                    </div>
                    <ClipboardList className="absolute -bottom-4 -right-4 text-emerald-500 opacity-50" size={120} />
                 </div>
                 <div className="space-y-4">
                 {selectedPlan.days.map((day, i) => (
                   <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                     <div className="bg-slate-800 text-white px-4 py-3 flex justify-between items-center">
                       <div><h3 className="font-bold text-lg">{day.day}</h3><span className="text-xs text-slate-400">{day.focus}</span></div>
                       <button onClick={() => startSession(selectedPlan!.id, i)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all"><Play size={12} fill="currentColor" /> {txt.wo_start}</button>
                     </div>
                     <div className="divide-y divide-slate-100 dark:divide-slate-800">
                       {day.exercises.map((ex, j) => (
                         <div key={j} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                           <div className="flex-1 cursor-pointer" onClick={() => handleViewExercise(ex.name)}>
                             <div className="flex items-center gap-2"><p className="font-semibold text-slate-800 dark:text-slate-200">{ex.name}</p>{loadingExercise === ex.name && <Loader2 size={12} className="animate-spin text-emerald-500" />}</div>
                             <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{ex.sets} x {ex.reps}</p>
                           </div>
                           <div className="flex gap-2">
                             <button onClick={() => handleViewExercise(ex.name)} className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 active:scale-95 transition-transform" disabled={loadingExercise === ex.name}>{loadingExercise === ex.name ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}</button>
                             <button onClick={() => quickLog(ex.name, String(ex.sets), String(ex.reps))} className="p-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg hover:bg-emerald-100 active:scale-95 transition-transform"><Plus size={16} /></button>
                           </div>
                         </div>
                       ))}
                     </div>
                   </div>
                 ))}
                 </div>
              </div>
          );
      }
      return (
          <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-800 dark:text-white">{txt.plan_my_plans}</h2><button onClick={() => setViewMode('create')} className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold shadow-md active:scale-95"><Plus size={16} /> {txt.plan_create_btn}</button></div>
              {plans.length === 0 ? (<div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-100 dark:border-slate-800 text-center shadow-sm"><div className="bg-slate-50 dark:bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-slate-400 mb-4"><ClipboardList size={32} /></div><h3 className="font-bold text-slate-700 dark:text-slate-200">{txt.plan_empty_title}</h3><p className="text-slate-400 text-sm mb-4">{txt.plan_empty_desc}</p><button onClick={() => setViewMode('create')} className="text-emerald-600 dark:text-emerald-400 font-semibold text-sm hover:underline">{txt.plan_create_now}</button></div>) : (<div className="grid gap-4">{plans.map((p) => (<div key={p.id} onClick={() => { setSelectedPlan(p); setViewMode('detail'); }} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between cursor-pointer hover:border-emerald-200 dark:hover:border-emerald-700 transition-colors"><div className="flex items-center gap-4"><div className="bg-blue-50 dark:bg-blue-900/20 w-12 h-12 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400"><Calendar size={20} /></div><div><h3 className="font-bold text-slate-800 dark:text-slate-200">{p.goal}</h3><div className="flex text-xs text-slate-500 dark:text-slate-400 gap-2"><span>{p.level}</span><span>•</span><span>{p.days.length} {txt.plan_days_week}</span></div></div></div><div className="flex items-center gap-3"><ChevronRight className="text-slate-300 dark:text-slate-600" size={20} /><button onClick={(e) => handleDeletePlan(e, p.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 size={16} /></button></div></div>))}</div>)}
          </div>
      );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* PR Confetti */}
      {showConfetti && (
          <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[80] bg-yellow-400 text-black px-6 py-3 rounded-full shadow-xl font-bold animate-bounce flex items-center gap-2">
              <Trophy size={20} /> {prMessage || "New PR!"}
          </div>
      )}

      {/* Top Tabs */}
      <div className="flex bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => setActiveTab('plan')} className={`flex-1 py-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'plan' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-400 dark:text-slate-500'}`}>{txt.plan_my_plans}</button>
        <button onClick={() => setActiveTab('log')} className={`flex-1 py-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'log' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-400 dark:text-slate-500'}`}>{txt.plan_log_workout}</button>
        <button onClick={() => setActiveTab('history')} className={`flex-1 py-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'history' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-400 dark:text-slate-500'}`}>{txt.plan_history}</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'plan' && renderPlanContent()}

        {activeTab === 'log' && (
          <div className="max-w-md mx-auto animate-fade-in">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-6">{txt.log_title}</h2>
            <form onSubmit={handleLogSubmit} className="space-y-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{txt.log_name}</label><input type="text" required placeholder={lang === 'en' ? "e.g., Bench Press" : "例如：臥推"} value={logForm.exerciseName} onChange={(e) => setLogForm({...logForm, exerciseName: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:text-white" /></div>
              <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"><Repeat size={14}/> {txt.log_sets}</label><input type="number" value={logForm.sets} onChange={(e) => setLogForm({...logForm, sets: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 dark:text-white" /></div><div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"><Repeat size={14}/> {txt.log_reps}</label><input type="number" value={logForm.reps} onChange={(e) => setLogForm({...logForm, reps: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 dark:text-white" /></div></div>
              <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"><Dumbbell size={14}/> {txt.log_weight}</label><input type="number" step="0.5" value={logForm.weight} onChange={(e) => setLogForm({...logForm, weight: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 dark:text-white" /></div><div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"><Clock size={14}/> {txt.log_time}</label><input type="number" value={logForm.durationMinutes} onChange={(e) => setLogForm({...logForm, durationMinutes: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 dark:text-white" /></div></div>
              <button type="submit" className="w-full bg-slate-900 dark:bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-slate-300 dark:shadow-none mt-4 active:scale-95 transition-transform">{txt.log_btn_save}</button>
            </form>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6 animate-fade-in">
            {/* Weekly Streak Visualization */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2"><History size={16} className="text-emerald-500" /> {txt.hist_streak}</h3>
                <div className="flex justify-between items-center px-2">
                    {getWeeklyStreak().map((day, i) => (<div key={i} className="flex flex-col items-center gap-2"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${day.active ? 'bg-emerald-500 text-white shadow-emerald-200 dark:shadow-none shadow-md scale-110' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600'}`}>{day.active ? <CheckCircle size={14} /> : null}</div><span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">{new Date(day.date).toLocaleDateString(undefined, { weekday: 'narrow' })}</span></div>))}
                </div>
            </div>

            {/* Date Filter & Grouped Logs */}
            <div className="flex justify-between items-center">
                 <h2 className="text-xl font-bold text-slate-800 dark:text-white">{txt.hist_title}</h2>
                 <div className="relative">
                    <input 
                        type="date" 
                        value={selectedDate} 
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="pl-3 pr-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                    />
                    {selectedDate && <button onClick={() => setSelectedDate('')} className="absolute -right-6 top-2 text-slate-400 hover:text-red-500"><X size={16}/></button>}
                 </div>
            </div>

            {logs.length === 0 ? (
                <div className="text-center text-slate-400 py-10">
                    <History size={48} className="mx-auto mb-4 opacity-50" />
                    <p>{txt.hist_empty}</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {getGroupedLogs().map(([dateStr, dayLogs]) => (
                        <div key={dateStr} className="animate-fade-in-up">
                            <div className="sticky top-0 bg-slate-50 dark:bg-slate-950 py-2 z-10 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 mb-2">
                                <Calendar size={14} className="text-emerald-500" />
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    {new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                </span>
                            </div>
                            <div className="space-y-3">
                                {dayLogs.slice().reverse().map(log => (
                                    <div key={log.id} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex justify-between items-center hover:border-emerald-100 dark:hover:border-emerald-900 transition-colors">
                                        <div>
                                            <h3 className="font-bold text-slate-800 dark:text-slate-200">{log.exerciseName}</h3>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex gap-3">
                                                <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300 font-medium">{log.sets} x {log.reps}</span>
                                                {log.weight > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-medium">• {log.weight}kg</span>}
                                                {log.durationMinutes > 0 && <span>• {log.durationMinutes}m</span>}
                                            </div>
                                        </div>
                                        <button onClick={() => onDeleteLog(log.id)} className="p-2 text-slate-200 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    {selectedDate && getGroupedLogs().length === 0 && (
                        <div className="text-center text-slate-400 py-4 italic text-sm">{txt.lib_no_result}</div>
                    )}
                </div>
            )}
          </div>
        )}
      </div>

      {viewingExercise && (
        <ExerciseDetailModal 
            exercise={viewingExercise} 
            onClose={() => setViewingExercise(null)}
            userSettings={userSettings}
        />
      )}

      {activeSession && renderActiveSession()}

    </div>
  );
};

export default WorkoutManager;
