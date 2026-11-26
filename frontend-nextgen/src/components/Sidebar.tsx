import { NavLink, useNavigate } from 'react-router-dom';
import stage7Logo from '../assets/stage7_logo.svg';

import { useAuthStore } from '../stores/authStore';

const Sidebar = () => {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  const navItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/assistants', label: 'Assistants', icon: '🤖' },
    { path: '/missions', label: 'Missions', icon: '🎯' },
    { path: '/feeds', label: 'Live Feeds', icon: '📡' },
    { path: '/brain', label: 'Brain', icon: '🧠' },
    { path: '/vault', label: 'Vault', icon: '🔐' },
    { path: '/artifacts', label: 'Artifacts', icon: '🗄️' },
    { path: '/tools', label: 'Tools', icon: '🔧' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="sidebar-logout" onClick={handleLogout}>Logout</button>
        <img src={stage7Logo} alt="Stage7" className="sidebar-logo" />
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
