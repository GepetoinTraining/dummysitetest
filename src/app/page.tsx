"use client";

import { useEffect, useState } from "react";
import { LoadingOverlay } from "@mantine/core";
import PrimitiveRenderer from "@/components/PrimitiveRenderer";

export default function Home() {
  const [viewData, setViewData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/primitives?user_id=usr_001&view=dashboard")
      .then((r) => r.json())
      .then((data) => {
        setViewData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingOverlay visible />;

  return <PrimitiveRenderer viewData={viewData} />;
}
