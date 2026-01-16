import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Team Members | Kortix',
  description: 'Manage your organization team members and invitations',
  openGraph: {
    title: 'Team Members | Kortix',
    description: 'Manage your organization team members and invitations',
    type: 'website',
  },
};

export default async function TeamMembersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
