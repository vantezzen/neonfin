import { notFound } from "next/navigation";
import { getLLMText } from "@/lib/docs/get-llm-text";
import { source } from "@/lib/docs/source";

export async function GET() {
  const page = source.getPage(["agent"]);
  if (!page) notFound();

  return new Response(await getLLMText(page), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
