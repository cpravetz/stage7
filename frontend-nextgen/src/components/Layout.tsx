import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useFeedStore } from '../stores/feedStore';

const Layout = () => {
  const ensureConnected = useFeedStore((s) => s.ensureConnected);
  useEffect(() => {
    ensureConnected();
  }, [ensureConnected]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">
        <header className="header">
          <h1>Stage7 NextGen Control Plane</h1>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
