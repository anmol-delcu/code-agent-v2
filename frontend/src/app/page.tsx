import { ProjectsPage } from "./projects/components/ProjectsPage";
import ProtectedRoute from "../components/ProtectedRoute";

export default function Projects() {
  return (
    <ProtectedRoute>
      <ProjectsPage />
    </ProtectedRoute>
  );
}
