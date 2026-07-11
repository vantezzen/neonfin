"use client";
import { Trash2 } from "lucide-react";
import { deleteProject } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Input } from "@/components/ui/input";

export function DeleteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  return (
    <ConfirmAction
      action={deleteProject}
      trigger={
        <Button type="button" variant="destructive" size="sm">
          <Trash2 className="size-4" />
          Delete project
        </Button>
      }
      title="Delete this project?"
      description={`All its wallets, orders, API keys, and catalog data will be removed. Enter “${projectName}” to continue.`}
      confirmLabel="Delete project"
      pendingLabel="Deleting…"
      successMessage="Project deleted"
    >
      <input type="hidden" name="id" value={projectId} />
      <Input
        name="confirmation"
        placeholder={projectName}
        autoComplete="off"
        autoFocus
        required
      />
    </ConfirmAction>
  );
}
