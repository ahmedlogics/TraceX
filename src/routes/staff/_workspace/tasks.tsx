import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { TasksView } from "@/features/tasks/TasksView";

export const Route = createFileRoute("/staff/_workspace/tasks")({
  staticData: { access: "tasks" },
  head: () => pageHead("Tasks", "Scoped work queue with claim and assignment."),
  component: TasksRoute,
});

function TasksRoute() {
  return <TasksView />;
}
