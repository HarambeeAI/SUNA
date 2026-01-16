'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Users,
  UserPlus,
  Mail,
  MoreHorizontal,
  Trash2,
  RefreshCw,
  Shield,
  AlertCircle,
  Loader2,
  Clock,
  X,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  getOrganization,
  getOrganizationMembers,
  updateOrganizationMemberRole,
  removeOrganizationMember,
  getOrganizationInvitations,
  createInvitation,
  revokeInvitation,
  OrganizationMember,
  OrganizationRole,
  Invitation,
  InvitationStatus,
} from '@/lib/api/organizations';

// Role display helpers
const roleLabels: Record<OrganizationRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

const roleColors: Record<OrganizationRole, string> = {
  owner: 'bg-purple-100 text-purple-800 border-purple-200',
  admin: 'bg-blue-100 text-blue-800 border-blue-200',
  member: 'bg-green-100 text-green-800 border-green-200',
  viewer: 'bg-gray-100 text-gray-800 border-gray-200',
};

const invitationStatusColors: Record<InvitationStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  accepted: 'bg-green-100 text-green-800 border-green-200',
  expired: 'bg-gray-100 text-gray-800 border-gray-200',
  revoked: 'bg-red-100 text-red-800 border-red-200',
};

export default function TeamMembersPage() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get('org');
  const queryClient = useQueryClient();

  // State for dialogs
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrganizationRole>('member');
  const [memberToRemove, setMemberToRemove] = useState<OrganizationMember | null>(null);
  const [invitationToRevoke, setInvitationToRevoke] = useState<Invitation | null>(null);

  // Fetch organization data
  const { data: organization, isLoading: orgLoading } = useQuery({
    queryKey: ['organization', orgId],
    queryFn: () => getOrganization(orgId!),
    enabled: !!orgId,
  });

  // Fetch members
  const {
    data: members,
    isLoading: membersLoading,
    error: membersError,
  } = useQuery({
    queryKey: ['organization-members', orgId],
    queryFn: () => getOrganizationMembers(orgId!),
    enabled: !!orgId,
  });

  // Fetch invitations
  const {
    data: invitations,
    isLoading: invitationsLoading,
  } = useQuery({
    queryKey: ['organization-invitations', orgId],
    queryFn: () => getOrganizationInvitations(orgId!),
    enabled: !!orgId,
  });

  // Create invitation mutation
  const createInvitationMutation = useMutation({
    mutationFn: () => createInvitation(orgId!, { email: inviteEmail, role: inviteRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-invitations', orgId] });
      toast.success('Invitation sent successfully');
      setIsInviteDialogOpen(false);
      setInviteEmail('');
      setInviteRole('member');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send invitation');
    },
  });

  // Update member role mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: OrganizationRole }) =>
      updateOrganizationMemberRole(orgId!, memberId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members', orgId] });
      toast.success('Member role updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update role');
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeOrganizationMember(orgId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members', orgId] });
      toast.success('Member removed');
      setMemberToRemove(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove member');
    },
  });

  // Revoke invitation mutation
  const revokeInvitationMutation = useMutation({
    mutationFn: (invitationId: string) => revokeInvitation(orgId!, invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-invitations', orgId] });
      toast.success('Invitation revoked');
      setInvitationToRevoke(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to revoke invitation');
    },
  });

  // Get current user's role (for permission checks)
  const currentUserRole = members?.find(m => m.user_id === organization?.account_id)?.role;
  const canManageMembers = currentUserRole === 'owner' || currentUserRole === 'admin';
  const isOwner = currentUserRole === 'owner';

  // Show message if no org is selected
  if (!orgId) {
    return (
      <div className="container mx-auto max-w-6xl px-6 py-6">
        <Card>
          <CardContent className="p-6 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No organization selected</h3>
            <p className="text-muted-foreground">
              Please select an organization from the navigation to manage team members.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (orgLoading || membersLoading) {
    return (
      <div className="container mx-auto max-w-6xl px-6 py-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  // Error state
  if (membersError) {
    return (
      <div className="container mx-auto max-w-6xl px-6 py-6">
        <Card className="border-red-200">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Failed to load team members</h3>
            <p className="text-muted-foreground">
              {membersError instanceof Error ? membersError.message : 'An unexpected error occurred.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingInvitations = invitations?.filter(inv => inv.status === 'pending') || [];

  return (
    <div className="container mx-auto max-w-6xl px-6 py-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-medium">Team Members</h1>
            <p className="text-muted-foreground">
              Manage your organization&apos;s team members and invitations
            </p>
          </div>
          {canManageMembers && (
            <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Team Member</DialogTitle>
                  <DialogDescription>
                    Send an invitation to join {organization?.name}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select
                      value={inviteRole}
                      onValueChange={(value) => setInviteRole(value as OrganizationRole)}
                    >
                      <SelectTrigger id="role">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {isOwner && (
                          <>
                            <SelectItem value="admin">Admin - Can manage members and settings</SelectItem>
                          </>
                        )}
                        <SelectItem value="member">Member - Can create and manage agents</SelectItem>
                        <SelectItem value="viewer">Viewer - Read-only access</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {inviteRole === 'admin' && 'Admins can manage members, agents, and organization settings.'}
                      {inviteRole === 'member' && 'Members can create and manage their own agents.'}
                      {inviteRole === 'viewer' && 'Viewers can only view agents and data.'}
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsInviteDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => createInvitationMutation.mutate()}
                    disabled={!inviteEmail || createInvitationMutation.isPending}
                  >
                    {createInvitationMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4 mr-2" />
                    )}
                    Send Invitation
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Members Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Members ({members?.length || 0})
            </CardTitle>
            <CardDescription>
              People who have access to this organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  {canManageMembers && <TableHead className="w-[50px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members && members.length > 0 ? (
                  members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{member.email || 'Unknown'}</span>
                          <span className="text-xs text-muted-foreground">
                            {member.user_id.slice(0, 8)}...
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {canManageMembers && member.role !== 'owner' ? (
                          <Select
                            value={member.role}
                            onValueChange={(value) =>
                              updateRoleMutation.mutate({
                                memberId: member.user_id,
                                role: value as OrganizationRole,
                              })
                            }
                            disabled={updateRoleMutation.isPending}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {isOwner && (
                                <SelectItem value="admin">Admin</SelectItem>
                              )}
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={roleColors[member.role]}>
                            {member.role === 'owner' && <Shield className="w-3 h-3 mr-1" />}
                            {roleLabels[member.role]}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {new Date(member.joined_at).toLocaleDateString()}
                        </span>
                      </TableCell>
                      {canManageMembers && (
                        <TableCell>
                          {member.role !== 'owner' && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => setMemberToRemove(member)}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Remove member
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={canManageMembers ? 4 : 3} className="text-center py-8">
                      <p className="text-muted-foreground">No members found</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pending Invitations */}
        {canManageMembers && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Pending Invitations ({pendingInvitations.length})
              </CardTitle>
              <CardDescription>
                Invitations that have been sent but not yet accepted
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invitationsLoading ? (
                <Skeleton className="h-24" />
              ) : pendingInvitations.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingInvitations.map((invitation) => (
                      <TableRow key={invitation.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            {invitation.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={roleColors[invitation.role]}>
                            {roleLabels[invitation.role]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={invitationStatusColors[invitation.status]}>
                            {invitation.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {new Date(invitation.expires_at).toLocaleDateString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                createInvitationMutation.mutate()
                              }
                              disabled={createInvitationMutation.isPending}
                              title="Resend invitation"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setInvitationToRevoke(invitation)}
                              title="Revoke invitation"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-8 text-muted-foreground">
                  No pending invitations
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Remove Member Confirmation Dialog */}
        <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove team member?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove {memberToRemove?.email} from the organization?
                They will lose access to all organization resources.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => memberToRemove && removeMemberMutation.mutate(memberToRemove.user_id)}
                disabled={removeMemberMutation.isPending}
              >
                {removeMemberMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Revoke Invitation Confirmation Dialog */}
        <AlertDialog open={!!invitationToRevoke} onOpenChange={() => setInvitationToRevoke(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke invitation?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to revoke the invitation to {invitationToRevoke?.email}?
                They will no longer be able to join using this invitation link.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => invitationToRevoke && revokeInvitationMutation.mutate(invitationToRevoke.id)}
                disabled={revokeInvitationMutation.isPending}
              >
                {revokeInvitationMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <X className="w-4 h-4 mr-2" />
                )}
                Revoke
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
