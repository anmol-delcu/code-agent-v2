import { WorkspaceDashboard } from "../components/WorkspaceDashboard";
import ProtectedRoute from "../../../components/ProtectedRoute";

interface ContainerPageProps {
  params: Promise<{
    containerId: string;
  }>;
}

export default async function ContainerPage({ params }: ContainerPageProps) {
  const { containerId } = await params;

  return (
    <ProtectedRoute>
      <WorkspaceDashboard containerId={containerId} />
    </ProtectedRoute>
  );
}
