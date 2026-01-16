import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Organization Settings | Kortix',
  description: 'Manage your organization settings, plan, and billing',
  openGraph: {
    title: 'Organization Settings | Kortix',
    description: 'Manage your organization settings, plan, and billing',
    type: 'website',
  },
};

export default async function OrganizationSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
