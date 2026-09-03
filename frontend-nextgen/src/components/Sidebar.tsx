import { NavLink } from 'react-router-dom';

const Sidebar = () => {
  const navItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/assistants', label: 'Assistants', icon: '🤖' },
    { path: '/missions', label: 'Missions', icon: '🎯' },
    { path: '/agents', label: 'Agents', icon: '🧑‍💻' },
    { path: '/canvas', label: 'Canvas', icon: '🕸️' },
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
        <h1>Stage7</h1>
        <p>NextGen</p>
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
