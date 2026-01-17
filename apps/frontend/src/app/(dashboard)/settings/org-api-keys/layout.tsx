import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Organization API Keys | Settings",
  description: "Manage API keys for your organization",
};

export default function OrgApiKeysLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
