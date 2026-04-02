import { Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { LocaleProvider } from "./components/LocaleProvider";
import { AgentsList } from "./pages/AgentsList";
import { AgentDetail } from "./pages/AgentDetail";
import { AgentCreate } from "./pages/AgentCreate";
import { AgentTasksList } from "./pages/AgentTasksList";
import { AgentTaskDetail } from "./pages/AgentTaskDetail";
import { RunsList } from "./pages/RunsList";
import { RunDetail } from "./pages/RunDetail";
import { TaskSubmit } from "./pages/TaskSubmit";
import { HealthDashboard } from "./pages/HealthDashboard";

export default function App() {
  return (
    <LocaleProvider>
      <AppLayout>
        <Routes>
          <Route path="/" element={<AgentsList />} />
          <Route path="/agents" element={<AgentsList />} />
          <Route path="/agents/new" element={<AgentCreate />} />
          <Route path="/agents/:id" element={<AgentDetail />} />
          <Route path="/agent-tasks" element={<AgentTasksList />} />
          <Route path="/agent-tasks/:id" element={<AgentTaskDetail />} />
          <Route path="/runs" element={<RunsList />} />
          <Route path="/runs/:id" element={<RunDetail />} />
          <Route path="/tasks/new" element={<TaskSubmit />} />
          <Route path="/health" element={<HealthDashboard />} />
        </Routes>
      </AppLayout>
    </LocaleProvider>
  );
}
