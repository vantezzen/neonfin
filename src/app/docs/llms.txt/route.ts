import { source } from "@/lib/docs/source";
import { llms } from "fumadocs-core/source";

export function GET() {
  return new Response(llms(source).index());
}
