import React, { useState } from 'react';
import { useStore } from './lib/store';
import { Icon } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Tests from './pages/Tests';
import MarksEntry from './pages/MarksEntry';
import Results from './pages/Results';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import StudentHome from './pages/StudentHome';

const NAV = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'students', label: 'Students', icon: 'users' },
  { id: 'tests', label: 'Tests', icon: 'tests' },
  { id: 'results', label: 'Results', icon: 'results' },
  { id: 'more', label: 'More', icon: 'more' },
];

export default function App() {
  const store = useStore();
  const { me, booted, online, pending, data, isStaff } = store;
  const [view, setView] = useState('home');
  const [params, setParams] = useState({});
  const go = (v, p = {}) => { setView(v); setParams({ ...p, _t: Date.now() }); window.scrollTo(0, 0); };

  if (!booted) return <div className="empty">Loading…</div>;
  if (!me) return <Login />;

  if (!isStaff) {
    return (
      <div className="shell">
        <div className="main" style={{ paddingBottom: 24 }}><StudentHome /></div>
      </div>
    );
  }

  const active = view === 'marks' ? 'tests' : view === 'analytics' || view === 'settings' ? 'more' : view;
  const page = {
    home: <Dashboard go={go} />,
    students: <Students go={go} />,
    tests: <Tests go={go} params={params} />,
    marks: <MarksEntry go={go} params={params} />,
    results: <Results go={go} params={params} />,
    analytics: <Analytics />,
    settings: <Settings />,
    more: <More go={go} />,
  }[view] || <Dashboard go={go} />;

  const status = !online ? 'off' : pending.length ? 'pending' : '';

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><span className={`dot ${status}`} title={!online ? 'Offline' : pending.length ? 'Changes waiting to sync' : 'Synced'} />{data.settings.institute_name || 'AREESE Marks'}<small>{data.settings.session}</small></div>
        <button className="iconbtn" style={{ color: '#fff' }} aria-label="Settings" onClick={() => go('settings')}><Icon name="settings" size={20} /></button>
      </header>
      <nav className="nav" aria-label="Main">
        <div className="navbrand">{data.settings.institute_name || 'AREESE Marks'}<small>{data.settings.session}</small></div>
        {NAV.map((n) => (
          <button key={n.id} className={active === n.id ? 'on' : ''} onClick={() => go(n.id)} aria-current={active === n.id ? 'page' : undefined}><Icon name={n.icon} />{n.label}</button>
        ))}
        <div className="navstatus"><span className={`dot ${status}`} />{!online ? 'Offline' : pending.length ? `${pending.length} to sync` : 'Synced'}</div>
      </nav>
      <main className="main">{page}</main>
    </div>
  );
}

function More({ go }) {
  const { me, logout } = useStore();
  return (
    <div>
      <div className="page-head"><div><h1>More</h1><p>{me.name} · {me.role}</p></div></div>
      <div className="list">
        <button className="item" onClick={() => go('analytics')}><Icon name="chart" /><div className="grow"><span className="title">Analytics</span><span className="sub">Batch trends, falling students</span></div></button>
        <button className="item" onClick={() => go('settings')}><Icon name="settings" /><div className="grow"><span className="title">Settings</span><span className="sub">Server, institute, staff logins, pending sync</span></div></button>
        <button className="item" onClick={logout}><Icon name="logout" /><div className="grow"><span className="title">Sign out</span></div></button>
      </div>
    </div>
  );
}
