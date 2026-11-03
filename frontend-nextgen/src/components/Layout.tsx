import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import MissionInputAlert from './MissionInputAlert';
import { useFeedStore } from '../stores/feedStore';
import { initMissionsStore, useMissionsStore } from '../stores/missionsStore';

const Layout = () => {
  const ensureConnected = useFeedStore((s) => s.ensureConnected);
  const fetchMissions = useMissionsStore((s) => s.fetchMissions);
  useEffect(() => {
    ensureConnected();
    initMissionsStore();
    void fetchMissions();
  }, [ensureConnected, fetchMissions]);

  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">
        <MissionInputAlert />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
