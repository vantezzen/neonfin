import type { Metadata } from "next";
import { PrismStudio } from "./studio";
import { UnderTheHood } from "./under-the-hood";

export const metadata: Metadata = { title: "Demo" };

export default function ExamplePage() {
  return (
    <div className="flex flex-col">
      <PrismStudio />
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
        <UnderTheHood />
      </div>
    </div>
  );
}
