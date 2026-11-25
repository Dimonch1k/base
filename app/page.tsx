'use client'

import {
  Apple,
  ChevronRight,
  Download,
  Dumbbell,
  LogOut,
  Plus,
  Settings,
  Sparkles,
  Timer,
  X
} from 'lucide-react'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type Key = 'pushups' | 'dips' | 'pullups' | 'squats' | 'abs'
type Progress = {
  exercise_key: Key
  daily_target: number
  set_size: number
  step_increment: number
  consecutive_completions: number
}
type Log = { id: string; exercise_key: Key; reps: number; cycle_day: number; logged_date: string }
type State = {
  current_cycle_day: number
  streak_days: number
  last_completed_date: string | null
  auto_progression: boolean
}

const exercises: Record<
  Key,
  {
    name: string
    short: string
    target: number
    base: number
    norm: number
    set: number
    step: number
  }
> = {
  pushups: { name: 'Віджимання', short: 'ВІД', target: 60, base: 100, norm: 150, set: 12, step: 5 },
  dips: { name: 'Бруси', short: 'БРС', target: 50, base: 80, norm: 120, set: 10, step: 5 },
  pullups: { name: 'Підтягування', short: 'ПДТ', target: 35, base: 60, norm: 80, set: 7, step: 3 },
  squats: { name: 'Присідання', short: 'ПРС', target: 75, base: 125, norm: 200, set: 15, step: 10 },
  abs: { name: 'Прес', short: 'ПРС', target: 60, base: 100, norm: 150, set: 15, step: 5 }
}
const dayExercises: Record<number, Key[]> = {
  1: ['pushups', 'dips'],
  2: ['pullups', 'abs'],
  3: ['squats', 'abs'],
  4: []
}
const dayTitles = ['Жим', 'Тяга і прес', 'Ноги і прес', 'Відновлення']
const defaults = Object.entries(exercises).map(([exercise_key, v]) => ({
  exercise_key: exercise_key as Key,
  daily_target: v.target,
  set_size: v.set,
  step_increment: v.step,
  consecutive_completions: 0
}))
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date())
const emptyState: State = {
  current_cycle_day: 1,
  streak_days: 0,
  last_completed_date: null,
  auto_progression: true
}

const macosDownload = process.env.NEXT_PUBLIC_DOWNLOAD_MACOS_URL || '/downloads/base-macos.dmg'

export default function Home() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('login')
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState<State>(emptyState)
  const [progress, setProgress] = useState<Progress[]>(defaults)
  const [logs, setLogs] = useState<Log[]>([])
  const [settings, setSettings] = useState(false)
  const [notice, setNotice] = useState('')

  const sessionExpired = useCallback(async () => {
    const maxDays = Number(process.env.NEXT_PUBLIC_SESSION_MAX_DAYS || 7)
    const last = Number(localStorage.getItem('base_last_login_at'))
    if (last && Date.now() - last > maxDays * 86400000) {
      await supabase.auth.signOut()
      localStorage.removeItem('base_last_login_at')
      setUserEmail(null)
      setUserId(null)
      setNotice('Сеанс завершено. Увійдіть знову.')
      return true
    }
    return false
  }, [])

  const loadData = useCallback(async (id: string) => {
    const [{ data: dbState }, { data: dbProgress }, { data: dbLogs }] = await Promise.all([
      supabase.from('user_state').select('*').eq('user_id', id).maybeSingle(),
      supabase.from('user_progress').select('*').eq('user_id', id),
      supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', id)
        .eq('logged_date', today())
        .order('created_at')
    ])
    if (!dbState) {
      await supabase
        .from('user_state')
        .upsert({ user_id: id, ...emptyState }, { onConflict: 'user_id' })
      setState(emptyState)
    } else setState(dbState)
    if (!dbProgress?.length) {
      await supabase.from('user_progress').upsert(
        defaults.map(p => ({ ...p, user_id: id })),
        { onConflict: 'user_id,exercise_key' }
      )
      setProgress(defaults)
    } else setProgress(dbProgress as Progress[])
    setLogs((dbLogs || []) as Log[])
  }, [])

  useEffect(() => {
    const boot = async () => {
      if (await sessionExpired()) {
        setLoading(false)
        return
      }
      const { data } = await supabase.auth.getSession()
      const u = data.session?.user
      if (u) {
        setUserEmail(u.email || '')
        setUserId(u.id)
        await loadData(u.id)
      }
      setLoading(false)
    }
    boot()
    const visibility = () => {
      if (document.visibilityState === 'visible') sessionExpired()
    }
    document.addEventListener('visibilitychange', visibility)
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        setUserEmail(null)
        setUserId(null)
      }
    })
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      listener.subscription.unsubscribe()
    }
  }, [loadData, sessionExpired])

  const submitAuth = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAuthError('')
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email'))
    const password = String(form.get('password'))
    if (!email || !password) return setAuthError('Заповніть електронну пошту та пароль.')
    const request =
      authTab === 'login'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password })
    const { data, error } = await request
    if (error)
      return setAuthError(
        error.message === 'Invalid login credentials'
          ? 'Невірна електронна пошта або пароль.'
          : error.message
      )
    localStorage.setItem('base_last_login_at', Date.now().toString())
    if (!data.session || !data.user)
      return setAuthError('Перевірте електронну пошту, щоб завершити реєстрацію.')
    setUserId(data.user.id)
    setUserEmail(data.user.email || email)
    await loadData(data.user.id)
  }

  const active = dayExercises[state.current_cycle_day]
  const getProgress = (key: Key) =>
    progress.find(p => p.exercise_key === key) || defaults.find(p => p.exercise_key === key)!
  const reps = (key: Key) =>
    logs.filter(l => l.exercise_key === key).reduce((n, l) => n + l.reps, 0)
  const totalTarget = active.reduce((n, k) => n + getProgress(k).daily_target, 0)
  const totalReps = active.reduce((n, k) => n + reps(k), 0)
  const overall =
    state.current_cycle_day === 4 ? 0 : Math.min(100, Math.round((totalReps / totalTarget) * 100))

  const addSet = async (key: Key, amount: number) => {
    if (!userId || amount < 1) return
    const optimistic: Log = {
      id: `local-${Date.now()}`,
      exercise_key: key,
      reps: amount,
      cycle_day: state.current_cycle_day,
      logged_date: today()
    }
    setLogs(x => [...x, optimistic])
    const { data, error } = await supabase
      .from('workout_logs')
      .insert({
        user_id: userId,
        exercise_key: key,
        reps: amount,
        cycle_day: state.current_cycle_day,
        logged_date: today()
      })
      .select()
      .single()
    if (error) {
      setLogs(x => x.filter(l => l.id !== optimistic.id))
      setNotice('Не вдалося зберегти підхід. Спробуйте ще раз.')
    } else setLogs(x => x.map(l => (l.id === optimistic.id ? data : l)))
  }

  const deleteLog = async (log: Log) => {
    setLogs(x => x.filter(l => l.id !== log.id))
    if (!log.id.startsWith('local-')) {
      const { error } = await supabase.from('workout_logs').delete().eq('id', log.id)
      if (error) {
        setLogs(x => [...x, log])
        setNotice('Не вдалося видалити запис.')
      }
    }
  }

  const finishDay = async () => {
    if (!userId) return
    if (state.current_cycle_day !== 4 && active.some(k => reps(k) < getProgress(k).daily_target)) {
      setNotice('Спершу виконайте ціль усіх вправ на сьогодні.')
      return
    }
    const elevated: string[] = []
    let newProgress = [...progress]
    if (state.auto_progression && state.current_cycle_day !== 4) {
      newProgress = progress.map(p => {
        if (!active.includes(p.exercise_key)) return p
        const count = p.consecutive_completions + 1
        if (count >= 2) {
          const target = p.daily_target + p.step_increment
          elevated.push(`${exercises[p.exercise_key].name}: ${target} повт.`)
          return {
            ...p,
            daily_target: target,
            set_size: Math.max(1, Math.round(target / 5)),
            consecutive_completions: 0
          }
        }
        return { ...p, consecutive_completions: count }
      })
      setProgress(newProgress)
      await supabase.from('user_progress').upsert(
        newProgress.map(p => ({ ...p, user_id: userId })),
        { onConflict: 'user_id,exercise_key' }
      )
    }
    const next = state.current_cycle_day === 4 ? 1 : state.current_cycle_day + 1
    const newState = {
      ...state,
      current_cycle_day: next,
      streak_days: state.streak_days + 1,
      last_completed_date: today()
    }
    setState(newState)
    await supabase
      .from('user_state')
      .upsert({ ...newState, user_id: userId }, { onConflict: 'user_id' })
    setNotice(
      elevated.length
        ? `Рівень підвищено! Нова ціль для ${elevated.join(' · ')}`
        : 'День завершено. Чудова робота!'
    )
  }

  const saveSettings = async () => {
    if (!userId) return
    await supabase.from('user_progress').upsert(
      progress.map(p => ({ ...p, user_id: userId })),
      { onConflict: 'user_id,exercise_key' }
    )
    await supabase
      .from('user_state')
      .update({ auto_progression: state.auto_progression })
      .eq('user_id', userId)
    setSettings(false)
    setNotice('Налаштування збережено.')
  }
  const signOut = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('base_last_login_at')
    setUserEmail(null)
    setUserId(null)
  }

  if (loading)
    return (
      <main className='min-h-screen grid place-items-center text-slate-500'>Завантаження…</main>
    )
  if (!userId)
    return (
      <AuthCard
        tab={authTab}
        setTab={setAuthTab}
        onSubmit={submitAuth}
        error={authError}
        notice={notice}
      />
    )

  return (
    <main className='mx-auto min-h-screen max-w-6xl px-5 py-6 md:px-10'>
      {notice && (
        <div className='fade-in fixed left-1/2 top-5 z-30 flex w-[min(520px,90vw)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-emerald-400/20 bg-[#13231f] px-4 py-3 text-sm text-emerald-100 shadow-2xl'>
          <Sparkles size={16} className='text-emerald-400' />
          {notice}
          <button className='ml-auto text-emerald-300' onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <header className='mb-10 flex flex-wrap items-center justify-between gap-5'>
        <div className='flex items-center gap-3'>
          <div className='grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-[#07110f]'>
            <Dumbbell size={20} />
          </div>
          <div>
            <h1 className='text-xl font-semibold tracking-tight'>Base</h1>
            <p className='text-xs text-slate-500'>Щоденна практика</p>
          </div>
        </div>
        <div className='flex items-center gap-2 text-sm'>
          <span className='hidden text-slate-500 md:block'>{userEmail}</span>
          <button
            onClick={() => setSettings(true)}
            className='rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white'
          >
            <Settings size={18} />
          </button>
          <button
            onClick={signOut}
            className='flex items-center gap-2 rounded-lg px-2 py-2 text-slate-400 hover:bg-white/5 hover:text-white'
          >
            <LogOut size={16} />
            <span className='hidden sm:inline'>Вийти</span>
          </button>
        </div>
      </header>
      <section className='mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-end'>
        <div>
          <p className='mb-2 text-xs font-medium uppercase tracking-[.18em] text-emerald-400'>
            Тренування на сьогодні
          </p>
          <h2 className='text-3xl font-semibold tracking-tight'>
            День {state.current_cycle_day}{' '}
            <span className='text-slate-500'>/ {dayTitles[state.current_cycle_day - 1]}</span>
          </h2>
        </div>
        <div className='glass min-w-[205px] rounded-2xl px-4 py-3'>
          <div className='mb-2 flex justify-between text-xs text-slate-400'>
            <span>Загальний прогрес</span>
            <span className='tabular text-emerald-400'>{overall}%</span>
          </div>
          <div className='h-1.5 overflow-hidden rounded-full bg-white/5'>
            <div
              className='h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all'
              style={{ width: `${overall}%` }}
            />
          </div>
        </div>
      </section>
      <nav className='mb-8 flex flex-wrap gap-2'>
        {[1, 2, 3, 4].map(day => (
          <button
            key={day}
            onClick={() => setState(s => ({ ...s, current_cycle_day: day }))}
            className={`rounded-xl px-4 py-2 text-sm transition ${state.current_cycle_day === day ? 'bg-white text-slate-950 font-semibold' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
          >
            День {day}
          </button>
        ))}
        <span className='ml-auto flex items-center gap-2 rounded-xl bg-amber-400/10 px-4 py-2 text-sm text-amber-300'>
          <Timer size={15} /> Серія: <b className='tabular'>{state.streak_days}</b> дн.
        </span>
      </nav>
      {state.current_cycle_day === 4 ? (
        <RestCard onFinish={finishDay} />
      ) : (
        <div className='grid gap-4 md:grid-cols-2'>
          {active.map(key => (
            <ExerciseCard
              key={key}
              item={exercises[key]}
              data={getProgress(key)}
              reps={reps(key)}
              logs={logs.filter(l => l.exercise_key === key)}
              add={addSet}
              remove={deleteLog}
            />
          ))}
        </div>
      )}
      <div className='mt-8 flex justify-end'>
        <button
          onClick={finishDay}
          className='flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-[#07110f] hover:bg-emerald-300'
        >
          {state.current_cycle_day === 4 ? 'Завершити день відновлення' : 'Завершити день'}{' '}
          <ChevronRight size={17} />
        </button>
      </div>
      {settings && (
        <SettingsModal
          progress={progress}
          state={state}
          setProgress={setProgress}
          setState={setState}
          save={saveSettings}
          close={() => setSettings(false)}
        />
      )}
    </main>
  )
}

function AuthCard({
  tab,
  setTab,
  onSubmit,
  error,
  notice
}: {
  tab: 'login' | 'signup'
  setTab: (x: 'login' | 'signup') => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  error: string
  notice: string
}) {
  return (
    <main className='grid min-h-screen place-items-center p-5'>
      <form onSubmit={onSubmit} className='glass w-full max-w-sm rounded-3xl p-7 fade-in'>
        <div className='mb-7 text-center'>
          <div className='mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400 text-[#07110f]'>
            <Dumbbell />
          </div>
          <h1 className='text-2xl font-semibold'>Base</h1>
          <p className='mt-1 text-sm text-slate-500'>Твоя щоденна сила</p>
        </div>
        <div className='mb-6 grid grid-cols-2 rounded-xl bg-black/20 p-1'>
          {(['login', 'signup'] as const).map(x => (
            <button
              type='button'
              key={x}
              onClick={() => setTab(x)}
              className={`rounded-lg py-2 text-sm ${tab === x ? 'bg-white/10 text-white' : 'text-slate-500'}`}
            >
              {x === 'login' ? 'Вхід' : 'Реєстрація'}
            </button>
          ))}
        </div>
        <label className='mb-4 block text-sm text-slate-400'>
          Електронна пошта
          <input
            name='email'
            type='email'
            autoComplete='email'
            className='mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white outline-none focus:border-emerald-400'
            placeholder='you@example.com'
          />
        </label>
        <label className='block text-sm text-slate-400'>
          Пароль
          <input
            name='password'
            type='password'
            autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            className='mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white outline-none focus:border-emerald-400'
            placeholder='••••••••'
          />
        </label>
        {(error || notice) && <p className='mt-4 text-sm text-rose-300'>{error || notice}</p>}
        <button className='mt-6 w-full rounded-xl bg-emerald-400 py-3 font-semibold text-[#07110f] hover:bg-emerald-300'>
          {tab === 'login' ? 'Увійти' : 'Створити профіль'}
        </button>
      </form>
    </main>
  )
}

function ExerciseCard({
  item,
  data,
  reps,
  logs,
  add,
  remove
}: {
  item: (typeof exercises)[Key]
  data: Progress
  reps: number
  logs: Log[]
  add: (k: Key, n: number) => void
  remove: (l: Log) => void
}) {
  const [custom, setCustom] = useState('')
  const percent = Math.min(100, Math.round((reps / data.daily_target) * 100))
  const key = data.exercise_key
  const tier =
    data.daily_target <= item.target
      ? 'Старт'
      : data.daily_target <= item.base
        ? 'База'
        : data.daily_target <= item.norm
          ? 'Норма'
          : 'Профі'
  return (
    <article className='glass rounded-3xl p-5 fade-in'>
      <div className='mb-5 flex items-start justify-between'>
        <div>
          <span className='rounded-md bg-white/5 px-2 py-1 text-[10px] font-bold tracking-widest text-slate-500'>
            {item.short}
          </span>
          <h3 className='mt-3 text-xl font-medium'>{item.name}</h3>
          <p className='mt-1 text-sm text-slate-500'>
            {tier} · підхід {data.set_size}
          </p>
        </div>
        <div className='text-right'>
          <p className='tabular text-2xl font-semibold'>
            {reps}
            <span className='text-base font-normal text-slate-500'> / {data.daily_target}</span>
          </p>
          <p className='mt-1 text-xs text-emerald-400'>{percent}% виконано</p>
        </div>
      </div>
      <div className='mb-5 h-2 overflow-hidden rounded-full bg-white/5'>
        <div
          className='h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all'
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className='flex gap-2'>
        <button
          onClick={() => add(key, data.set_size)}
          className='flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 py-3 text-sm font-medium hover:bg-emerald-400 hover:text-[#07110f]'
        >
          <Plus size={16} />1 підхід <span className='tabular opacity-70'>(+{data.set_size})</span>
        </button>
        <form
          onSubmit={e => {
            e.preventDefault()
            add(key, Number(custom))
            setCustom('')
          }}
          className='flex w-28'
        >
          <input
            value={custom}
            onChange={e => setCustom(e.target.value)}
            min='1'
            type='number'
            aria-label='Інша кількість повторів'
            placeholder='Інша к-сть'
            className='w-full rounded-l-xl border border-white/10 bg-black/20 px-2 text-center text-xs outline-none focus:border-emerald-400'
          />
          <button className='rounded-r-xl bg-white/10 px-2 hover:bg-white/20'>
            <Plus size={15} />
          </button>
        </form>
      </div>
      {logs.length > 0 && (
        <div className='mt-5 border-t border-white/5 pt-4'>
          <p className='mb-2 text-xs uppercase tracking-widest text-slate-600'>Сьогодні</p>
          <div className='flex flex-wrap gap-2'>
            {logs.map(log => (
              <span
                key={log.id}
                className='flex items-center gap-1 rounded-lg bg-black/20 py-1 pl-2 pr-1 text-xs tabular text-slate-300'
              >
                +{log.reps}
                <button
                  onClick={() => remove(log)}
                  className='rounded p-0.5 text-slate-600 hover:bg-rose-400/20 hover:text-rose-300'
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

function RestCard({ onFinish }: { onFinish: () => void }) {
  return (
    <section className='glass mx-auto max-w-xl rounded-3xl p-10 text-center fade-in'>
      <div className='mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-cyan-400/10 text-cyan-300'>
        <Sparkles size={28} />
      </div>
      <p className='text-xs font-medium uppercase tracking-[.2em] text-cyan-400'>День 4</p>
      <h3 className='mt-3 text-2xl font-semibold'>Відновлення — це теж тренування</h3>
      <p className='mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500'>
        Дайте тілу відпочинок: пройдіться, потягніться, виспіться. Завтра почнеться новий цикл.
      </p>
      <button
        onClick={onFinish}
        className='mt-7 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-[#07110f] hover:bg-cyan-300'
      >
        Завершити день відновлення
      </button>
    </section>
  )
}

function DownloadApp() {
  const [environmentChecked, setEnvironmentChecked] = useState(false)
  const [isDesktopApp, setIsDesktopApp] = useState(false)

  useEffect(() => {
    // Tauri injects this internal bridge in its native WebView. Do not offer the
    // installer from inside the app the user has already installed.
    setIsDesktopApp('__TAURI_INTERNALS__' in window)
    setEnvironmentChecked(true)
  }, [])

  if (!environmentChecked || isDesktopApp) return null

  return (
    <section className='mt-6 border-t border-white/5 pt-6'>
      <div className='mb-4'>
        <h3 className='text-sm font-semibold text-slate-200'>Завантажити застосунок</h3>
        <p className='mt-1 text-sm text-slate-500'>Версія для Apple Silicon та Intel.</p>
      </div>
      <a
        href={macosDownload}
        download
        className='flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 transition hover:bg-emerald-400/15'
      >
        <span className='grid h-10 w-10 place-items-center rounded-xl bg-emerald-400 text-[#07110f]'>
          <Apple size={20} />
        </span>
        <span className='flex-1'>
          <b className='block text-sm text-emerald-50'>Завантажити для macOS</b>
          <span className='text-xs text-emerald-200/60'>Apple Silicon та Intel · .dmg</span>
        </span>
        <Download size={19} className='text-emerald-300' />
      </a>
    </section>
  )
}

function SettingsModal({
  progress,
  state,
  setProgress,
  setState,
  save,
  close
}: {
  progress: Progress[]
  state: State
  setProgress: (x: Progress[]) => void
  setState: (x: State) => void
  save: () => void
  close: () => void
}) {
  return (
    <div className='fixed inset-0 z-20 grid place-items-center bg-black/70 p-4 backdrop-blur-sm'>
      <section className='glass max-h-[85vh] w-full max-w-2xl overflow-auto rounded-3xl p-6'>
        <div className='mb-6 flex justify-between'>
          <div>
            <h2 className='text-xl font-semibold'>Налаштування</h2>
            <p className='mt-1 text-sm text-slate-500'>Налаштуйте цілі під свій темп.</p>
          </div>
          <button onClick={close} className='rounded-lg p-2 text-slate-400 hover:bg-white/5'>
            <X />
          </button>
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full text-left text-sm'>
            <thead className='text-xs uppercase tracking-wider text-slate-500'>
              <tr>
                <th className='pb-3'>Вправа</th>
                <th className='pb-3'>Ціль</th>
                <th className='pb-3'>Підхід</th>
                <th className='pb-3'>Крок</th>
              </tr>
            </thead>
            <tbody>
              {progress.map((p, i) => (
                <tr key={p.exercise_key} className='border-t border-white/5'>
                  <td className='py-3 text-slate-200'>{exercises[p.exercise_key].name}</td>
                  {(['daily_target', 'set_size', 'step_increment'] as const).map(field => (
                    <td key={field}>
                      <input
                        type='number'
                        min='1'
                        value={p[field]}
                        onChange={e =>
                          setProgress(
                            progress.map((x, j) =>
                              j === i ? { ...x, [field]: Number(e.target.value) } : x
                            )
                          )
                        }
                        className='w-20 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 tabular outline-none focus:border-emerald-400'
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className='mt-6 flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-sm'>
          <span>
            <b className='block text-slate-200'>Автопрогресія</b>
            <span className='text-slate-500'>Підвищувати ціль після двох циклів.</span>
          </span>
          <input
            type='checkbox'
            checked={state.auto_progression}
            onChange={e => setState({ ...state, auto_progression: e.target.checked })}
            className='h-5 w-5 accent-emerald-400'
          />
        </label>
        <DownloadApp />
        <div className='mt-6 flex justify-end gap-2'>
          <button
            onClick={close}
            className='rounded-xl px-4 py-2 text-sm text-slate-400 hover:bg-white/5'
          >
            Скасувати
          </button>
          <button
            onClick={save}
            className='rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-[#07110f]'
          >
            Зберегти
          </button>
        </div>
      </section>
    </div>
  )
}
