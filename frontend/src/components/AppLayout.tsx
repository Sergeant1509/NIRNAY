import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Files, ClipboardList, FolderKanban, ShieldCheck, LogOut, Menu, X, Scale } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { apiRequest, type UserProfile } from '../lib/api';
import './AppLayout.css';

const links = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/records', label: 'My records', icon: ClipboardList },
  { to: '/documents', label: 'Documents', icon: Files },
  { to: '/tenders', label: 'Tenders & applications', icon: FolderKanban },
];

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let active = true;
    apiRequest<UserProfile>('/api/v1/auth/me')
      .then(value => { if (active) setProfile(value); })
      .catch(() => { if (active) setProfile(null); });
    return () => { active = false; };
  }, [location.pathname]);


  return <div className="app-frame">
    <aside className={'sidebar' + (menuOpen ? ' sidebar-open' : '')}>
      <NavLink to="/app" className="brand-lockup" aria-label="NIRNAY overview">
        <span className="brand-mark"><Scale size={21} strokeWidth={2.1} /></span>
        <span><strong>NIRNAY</strong><small>Procurement workspace</small></span>
      </NavLink>
      <p className="nav-caption">WORKSPACE</p>
      <nav className="primary-nav" aria-label="Main navigation">
        {links.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMenuOpen(false)} className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}>
          <item.icon size={18} strokeWidth={1.9} /><span>{item.label}</span>
        </NavLink>)}
      </nav>
      {profile?.role === 'admin' && <><p className="nav-caption nav-caption-spaced">ADMINISTRATION</p><nav className="primary-nav" aria-label="Administration"><NavLink to="/admin" onClick={() => setMenuOpen(false)} className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}><ShieldCheck size={18} strokeWidth={1.9} /><span>Admin console</span></NavLink></nav></>}
      <div className="sidebar-bottom">
        <div className="account-summary"><span className="account-avatar">{(user?.displayName || user?.email || 'N').charAt(0).toUpperCase()}</span><span className="account-copy"><strong>{user?.displayName || 'Signed in'}</strong><small>{user?.email || 'NIRNAY account'}</small></span></div>
        <button className="signout-link" onClick={() => void signOut()}><LogOut size={17} /><span>Sign out</span></button>
      </div>
    </aside>
    {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <div className="app-main">
      <header className="mobile-topbar"><button className="menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button><span className="mobile-brand">NIRNAY</span><span className="mobile-account">{(user?.displayName || user?.email || 'N').charAt(0).toUpperCase()}</span></header>
      <div className="page-content"><Outlet /></div>
    </div>
  </div>;
}
