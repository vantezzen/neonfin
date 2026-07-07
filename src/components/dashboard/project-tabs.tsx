"use client";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TAB_VALUES = ["products", "developers", "settings"] as const;
type ProjectTab = (typeof TAB_VALUES)[number];

function readTab(value: string | null): ProjectTab {
  return TAB_VALUES.includes(value as ProjectTab)
    ? (value as ProjectTab)
    : "products";
}

export function ProjectTabs({
  products,
  developers,
  settings,
}: {
  products: React.ReactNode;
  developers: React.ReactNode;
  settings: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const requestedTab = readTab(searchParams.get("tab"));

  return (
    <Tabs key={requestedTab} defaultValue={requestedTab} className="w-full">
      <TabsList>
        <TabsTrigger value="products">Products</TabsTrigger>
        <TabsTrigger value="developers">Developers</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="products" className="mt-6">
        {products}
      </TabsContent>
      <TabsContent value="developers" className="mt-6">
        {developers}
      </TabsContent>
      <TabsContent value="settings" className="mt-6">
        {settings}
      </TabsContent>
    </Tabs>
  );
}
