import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useFeedStore } from '../stores/feedStore';
import { initMissionsStore } from '../stores/missionsStore';

const Layout = () => {
  const ensureConnected = useFeedStore((s) => s.ensureConnected);
  useEffect(() => {
    ensureConnected();
    initMissionsStore();
  }, [ensureConnected]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">
        <header className="header">
          <h1>stage7 Control Plane</h1>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
