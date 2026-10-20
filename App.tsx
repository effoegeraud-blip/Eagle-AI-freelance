import { useCallback, useEffect, useState } from 'react';
import { LayoutDashboard, Kanban, Bot, Crown, LogOut, Loader2, TriangleAlert } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, type Mission, type MissionStatus, type Profile } from './lib/supabase';
import { isGeminiConfigured } from './lib/gemini';
import Dashboard from './components/Dashboard';
import MissionCopilot from './components/MissionCopilot';
import KanbanBoard from './components/KanbanBoard';
import PricingModal from './components/PricingModal';

type View = 'dashboard' | 'copilot' | 'kanban';
const FREE_LIMIT = 5;

function SetupScreen() {
  const vars = [
    ['VITE_SUPABASE_URL', isSupabaseConfigured],
    ['VITE_SUPABASE_ANON_KEY', isSupabaseConfigured],
    ['VITE_GEMINI_API_KEY', isGeminiConfigured],
  ] as const;
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-lg rounded-xl border border-line bg-panel p-6">
        <h1 className="font-display text-2xl font-bold">Configuration requise</h1>
        <p className="mt-2 text-sm text-mist">Copiez <code>.env.example</code> vers <code>.env</code>, renseignez les valeurs, puis relancez <code>npm run dev</code>.</p>
        <ul className="mt-4 space-y-1.5 text-sm">
          {vars.map(([name, ok]) => (
            <li key={name} className="flex items-center gap-2">
              <span className={ok ? 'text-lagoon' : 'text-talon'}>{ok ? '✔' : '✘'}</span><code>{name}</code>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const submit = async () => {
    setState('sending'); setError('');
    const { error } = await supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) { setError(error.message); setState('idle'); } else setState('sent');
  };
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="font-display text-4xl font-bold">Eagle AI Freelance</h1>
        <p className="text-mist">Trouvez, évaluez et gagnez vos missions.</p>
        {state === 'sent' ? (
          <p className="rounded-lg border border-lagoon/40 bg-lagoon/10 p-3 text-sm">Lien de connexion envoyé à {email}. Ouvrez-le depuis votre boîte mail.</p>
        ) : (
          <>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" aria-label="Adresse e-mail"
              className="w-full rounded-lg border border-line bg-panel p-3 focus:outline-2 focus:outline-lagoon" />
            <button disabled={!email.includes('@') || state === 'sending'} onClick={submit} className="w-full rounded-lg bg-talon py-3 font-semibold text-ink disabled:opacity-40">
              Recevoir un lien de connexion
            </button>
          </>
        )}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      </div>
    </main>
  );
}

function Workspace({ session }: { session: Session }) {
  const sb = supabase!;
  const [view, setView] = useState<View>('dashboard');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    const [p, m] = await Promise.all([
      sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
      sb.from('missions').select('*').order('created_at', { ascending: false }),
    ]);
    if (p.error || m.error) { setLoadError((p.error ?? m.error)!.message); return; }
    setLoadError(''); setProfile(p.data); setMissions(m.data ?? []);
  }, [sb, session.user.id]);

  useEffect(() => { void load(); }, [load]);

  // Retour de SasPay : le webhook peut arriver quelques secondes après la redirection → on réessaie.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('payment') !== 'success') return;
    let n = 0;
    const t = setInterval(() => { void load(); if (++n >= 6) clearInterval(t); }, 3000);
    history.replaceState({}, '', '/');
    return () => clearInterval(t);
  }, [load]);

  const addMission = async (m: { title: string; description: string; budget: string | null }) => {
    if (!profile?.is_pro && missions.length >= FREE_LIMIT) { setPricingOpen(true); throw new Error(`Limite de ${FREE_LIMIT} missions atteinte sur le plan gratuit.`); }
    const { error } = await sb.from('missions').insert({ ...m, user_id: session.user.id, status: 'lead' });
    if (error) throw new Error(error.message);
    await load(); setView('kanban');
  };
  const moveMission = async (id: string, status: MissionStatus) => {
    setMissions((ms) => ms.map((x) => (x.id === id ? { ...x, status } : x))); // optimiste
    const { error } = await sb.from('missions').update({ status }).eq('id', id);
    if (error) { await load(); throw new Error(error.message); }
  };
  const deleteMission = async (id: string) => {
    const { error } = await sb.from('missions').delete().eq('id', id);
    if (error) throw new Error(error.message);
    setMissions((ms) => ms.filter((x) => x.id !== id));
  };

  const nav: { id: View; label: string; Icon: typeof Bot }[] = [
    { id: 'dashboard', label: 'Tableau de bord', Icon: LayoutDashboard },
    { id: 'copilot', label: 'Copilot', Icon: Bot },
    { id: 'kanban', label: 'Missions', Icon: Kanban },
  ];

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="flex flex-col gap-1 border-b border-line p-4 md:border-b-0 md:border-r">
        <p className="mb-4 font-display text-lg font-bold">🦅 Eagle AI</p>
        {nav.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setView(id)} aria-current={view === id ? 'page' : undefined}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${view === id ? 'bg-panel text-snow' : 'text-mist hover:text-snow'}`}>
            <Icon className="size-4" aria-hidden />{label}
          </button>
        ))}
        <div className="mt-auto flex flex-col gap-1 pt-4">
          {profile?.is_pro
            ? <p className="flex items-center gap-2 px-3 text-sm text-talon"><Crown className="size-4" aria-hidden />Pro actif</p>
            : <button onClick={() => setPricingOpen(true)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-talon hover:bg-talon/10"><Crown className="size-4" aria-hidden />Passer Pro</button>}
          <button onClick={() => void sb.auth.signOut()} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-mist hover:text-snow"><LogOut className="size-4" aria-hidden />Se déconnecter</button>
        </div>
      </aside>

      <main className="p-5 md:p-8">
        {!isGeminiConfigured && <p className="mb-4 flex items-center gap-2 text-xs text-talon"><TriangleAlert className="size-3.5" aria-hidden />Clé Gemini absente : le Copilot est désactivé.</p>}
        {loadError && <p role="alert" className="mb-4 rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">Chargement impossible : {loadError}. Avez-vous exécuté supabase/schema.sql ?</p>}
        {view === 'dashboard' && <Dashboard profile={profile} missions={missions} onUpgrade={() => setPricingOpen(true)} onOpenCopilot={() => setView('copilot')} />}
        {view === 'copilot' && <MissionCopilot onSaveMission={addMission} />}
        {view === 'kanban' && <KanbanBoard missions={missions} onMove={moveMission} onDelete={deleteMission} />}
      </main>
      <PricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session)).catch(console.error).finally(() => setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <SetupScreen />;
  if (!ready) return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-mist" aria-label="Chargement" /></div>;
  return session ? <Workspace session={session} /> : <AuthScreen />;
}
