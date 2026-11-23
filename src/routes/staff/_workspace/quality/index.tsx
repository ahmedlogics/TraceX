import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { paths } from "@/app/paths";
import { useAppNavigate } from "@/app/navigation";
import { useMe } from "@/features/shared/useMe";
import { QualityView } from "@/features/quality/QualityView";

export const Route = createFileRoute("/staff/_workspace/quality/")({
  staticData: { access: "quality" },
  head: () => pageHead("Quality", "Incoming, final and reinspection queues."),
  component: QualityRoute,
});

function QualityRoute() {
  const me = useMe();
  const navigate = useAppNavigate();
  const isIncomingQC =
    me.username?.toLowerCase() === "qc.incoming" ||
    me.department?.toLowerCase() === "receiving" ||
    me.department?.toLowerCase() === "raw-store" ||
    (me.department as string)?.toLowerCase() === "raw_store";

  useEffect(() => {
    if (isIncomingQC) {
      void navigate(paths.home, { replace: true });
    }
  }, [isIncomingQC, navigate]);

  if (isIncomingQC) return null;

  return <QualityView />;
}
