import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Assistants from './pages/Assistants';
import Missions from './pages/Missions';
import MissionRoom from './pages/MissionRoom';
import Agents from './pages/Agents';
import Settings from './pages/Settings';
import Login from './pages/Login';
import EntityWorkspace from './pages/EntityWorkspace';
import Canvas from './pages/Canvas';
import LiveFeeds from './pages/LiveFeeds';
import Brain from './pages/Brain';
import Vault from './pages/Vault';
import Artifacts from './pages/Artifacts';
import Tools from './pages/Tools';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="assistants" element={<Assistants />} />
        <Route path="missions" element={<Missions />} />
        <Route path="missions/:workflowId" element={<MissionRoom />} />
        <Route path="agents" element={<Agents />} />
        <Route path="entity/:id" element={<EntityWorkspace />} />
        <Route path="canvas" element={<Canvas />} />
        <Route path="feeds" element={<LiveFeeds />} />
        <Route path="brain" element={<Brain />} />
        <Route path="vault" element={<Vault />} />
        <Route path="artifacts" element={<Artifacts />} />
        <Route path="tools" element={<Tools />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
