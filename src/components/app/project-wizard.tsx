"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { createProject, type ActionState } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const initial: ActionState = {};

/** Full-page variant, used at /dashboard/projects/new. */
export function ProjectWizard() {
  return (
    <div className="mx-auto max-w-lg">
      <ProjectWizardForm />
    </div>
  );
}

/** Dialog variant used by the dashboard first-steps guide. */
export function ProjectWizardDialog({
  trigger,
}: {
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        {trigger ?? (
          <>
            <Plus className="size-4" /> Create project
          </>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a project</DialogTitle>
            <DialogDescription>
              Create the project first, then add products and prices from its
              setup guide.
            </DialogDescription>
          </DialogHeader>
          <ProjectWizardForm />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProjectWizardForm() {
  const [state, action, pending] = useActionState(createProject, initial);
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Project name</Label>
        <Input
          name="name"
          placeholder="Example"
          required
          autoFocus
        />
        <span className="text-xs text-muted-foreground">
          Products, prices, providers, and SDK setup happen on the project page.
        </span>
      </div>

      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating..." : "Create project"}
        </Button>
      </div>
    </form>
  );
}
