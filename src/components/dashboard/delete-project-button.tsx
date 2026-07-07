"use client";
import { Trash2 } from "lucide-react";
import { deleteProject } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  return (
    <form
      action={deleteProject}
      onSubmit={(e) => {
        if (
          !confirm(
            "Delete this project? All its wallets, orders, and keys are removed. This cannot be undone.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={projectId} />
      <Button type="submit" variant="destructive" size="sm">
        <Trash2 className="size-4" />
        Delete project
      </Button>
    </form>
  );
}
