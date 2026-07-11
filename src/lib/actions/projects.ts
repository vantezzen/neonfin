"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireUser, requireOwnedProject } from "@/lib/auth/dal";
import { createApiKey, revokeApiKey } from "@/lib/api-keys";
import type { ApiKeyKind } from "@/db/schema";
import { actionError, type FormState } from "./state";

export type ActionState = { error?: string; ok?: boolean };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseOrigins(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const projectInput = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1),
  mode: z.enum(["credit_codes", "external_auth"]),
  codePrefix: z
    .string()
    .min(1)
    .max(8)
    .transform((s) => s.toUpperCase()),
  codeExpiresInDays: z
    .number()
    .int()
    .min(1, "Code expiry must be at least 1 day")
    .max(3650, "Code expiry must be 10 years or less")
    .nullable(),
  anonymousWalletsPerHour: z
    .number()
    .int()
    .min(1, "Wallet creation limit must be at least 1")
    .max(1000, "Wallet creation limit must be 1000/hour or less"),
  outboundWebhookUrl: z
    .string()
    .url("Webhook URL must be a valid URL")
    .refine((value) => new URL(value).protocol === "https:", {
      message: "Webhook URL must use HTTPS",
    })
    .optional(),
  outboundWebhookSecret: z.string().min(16).max(200).optional(),
});

function optionalPositiveInt(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "0") return null;
  return Number(raw);
}

function readProjectForm(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  return projectInput.safeParse({
    name,
    slug: String(formData.get("slug") || slugify(name)),
    mode: String(formData.get("mode") ?? "credit_codes"),
    codePrefix: String(
      formData.get("codePrefix") ||
        slugify(name).replace(/-/g, "").slice(0, 4).toUpperCase() ||
        "NF",
    ),
    codeExpiresInDays: optionalPositiveInt(formData.get("codeExpiresInDays")),
    anonymousWalletsPerHour: Number(
      formData.get("anonymousWalletsPerHour") || 20,
    ),
    outboundWebhookUrl:
      String(formData.get("outboundWebhookUrl") ?? "").trim() || undefined,
    outboundWebhookSecret:
      String(formData.get("outboundWebhookSecret") ?? "").trim() || undefined,
  });
}

export async function createProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = readProjectForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.outboundWebhookUrl && !parsed.data.outboundWebhookSecret) {
    return { error: "Add a signing secret for the consumer webhook" };
  }

  let id: string;
  try {
    const created = await db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({
          ...parsed.data,
          outboundWebhookUrl: parsed.data.outboundWebhookUrl ?? null,
          outboundWebhookSecret: parsed.data.outboundWebhookSecret ?? null,
          ownerId: user.id,
          allowedOrigins: parseOrigins(
            String(formData.get("allowedOrigins") ?? ""),
          ),
        })
        .returning({ id: projects.id });
      await createApiKey(project.id, "publishable", "default", tx);
      return project;
    });
    id = created.id;
  } catch (e) {
    if (String(e).includes("projects_owner_slug_uq")) {
      return { error: "You already have a project with that slug" };
    }
    throw e;
  }
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard");
  redirect(`/dashboard/projects/${id}`);
}

export async function updateProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing project id" };
  const project = await requireOwnedProject(id);
  const parsed = readProjectForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.outboundWebhookUrl && !parsed.data.outboundWebhookSecret && !project.outboundWebhookSecret) {
    return { error: "Add a signing secret for the consumer webhook" };
  }

  await db
    .update(projects)
    .set({
      ...parsed.data,
      outboundWebhookUrl: parsed.data.outboundWebhookUrl ?? null,
      outboundWebhookSecret: parsed.data.outboundWebhookUrl
        ? (parsed.data.outboundWebhookSecret ?? project.outboundWebhookSecret)
        : null,
      allowedOrigins: parseOrigins(
        String(formData.get("allowedOrigins") ?? ""),
      ),
    })
    .where(eq(projects.id, id));
  revalidatePath(`/dashboard/projects/${id}`);
  return { ok: true };
}

export async function deleteProject(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const id = String(formData.get("id") ?? "");
    if (!id) return { error: "Missing project id" };
    const project = await requireOwnedProject(id);
    if (String(formData.get("confirmation") ?? "").trim() !== project.name) {
      return { error: "Enter the project name exactly to delete it" };
    }
    await db.delete(projects).where(eq(projects.id, id));
    revalidatePath("/dashboard/projects");
    redirect("/dashboard/projects");
  } catch (e) {
    return actionError(e);
  }
}

export type KeyState = { key?: string; error?: string };

export async function issueApiKey(
  _prev: KeyState,
  formData: FormData,
): Promise<KeyState> {
  const projectId = String(formData.get("projectId") ?? "");
  const kind = String(formData.get("kind") ?? "publishable") as ApiKeyKind;
  if (!projectId) return { error: "Missing project" };
  await requireOwnedProject(projectId);
  const { plaintext } = await createApiKey(projectId, kind);
  // Refresh the key list (server component) so the new key appears; the
  // plaintext is returned once and revealed inline - no navigation.
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { key: plaintext };
}

export async function removeApiKey(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const id = String(formData.get("id") ?? "");
    const projectId = String(formData.get("projectId") ?? "");
    if (!projectId) return { error: "Missing project id" };
    await requireOwnedProject(projectId);
    // Revocation is scoped to the owned project, so a key id from another tenant
    // (even with a projectId the caller does own) is a no-op.
    if (id) await revokeApiKey(id, projectId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
