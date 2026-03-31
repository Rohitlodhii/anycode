import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

function IndexRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({
      replace: true,
      search: { folder: "" },
      to: "/editor",
    });
  }, [navigate]);

  return null;
}

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});
