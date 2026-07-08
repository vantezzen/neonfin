import "./styles.css";
import { source } from "@/lib/docs/source";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/components/docs/layout.shared";

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-col min-h-screen">
      <RootProvider
        search={{
          options: {
            api: "/docs/api/search",
          },
        }}
      >
        <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
          {children}
        </DocsLayout>
      </RootProvider>
    </div>
  );
}
