'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Key, Plus, Trash2, Copy, Shield, ExternalLink, AlertCircle } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  createOrgApiKey,
  listOrgApiKeys,
  revokeOrgApiKey,
  deleteOrgApiKey,
  OrgApiKeyScope,
  OrgApiKeyResponse,
  OrgApiKeyCreateResponse,
  OrgApiKeyCreateRequest,
  ORG_API_KEY_SCOPES,
} from '@/lib/api/org-api-keys';

interface NewApiKeyData {
  name: string;
  description: string;
  scopes: OrgApiKeyScope[];
  expiresInDays: string;
}

export default function OrgApiKeysPage() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get('org');
  const queryClient = useQueryClient();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyData, setNewKeyData] = useState<NewApiKeyData>({
    name: '',
    description: '',
    scopes: [],
    expiresInDays: 'never',
  });
  const [createdApiKey, setCreatedApiKey] = useState<OrgApiKeyCreateResponse | null>(null);
  const [showCreatedKey, setShowCreatedKey] = useState(false);

  // Fetch API keys
  const {
    data: apiKeysResponse,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['org-api-keys', orgId],
    queryFn: () => listOrgApiKeys(orgId!),
    enabled: !!orgId,
  });

  const apiKeys = apiKeysResponse?.api_keys || [];

  // Create API key mutation
  const createMutation = useMutation({
    mutationFn: (request: OrgApiKeyCreateRequest) => createOrgApiKey(orgId!, request),
    onSuccess: (response) => {
      setCreatedApiKey(response);
      setShowCreatedKey(true);
      setIsCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['org-api-keys', orgId] });
      toast.success('API key created successfully');
      setNewKeyData({ name: '', description: '', scopes: [], expiresInDays: 'never' });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Failed to create API key');
      console.error('Error creating API key:', error);
    },
  });

  // Revoke API key mutation
  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeOrgApiKey(orgId!, keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-api-keys', orgId] });
      toast.success('API key revoked successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Failed to revoke API key');
    },
  });

  // Delete API key mutation
  const deleteMutation = useMutation({
    mutationFn: (keyId: string) => deleteOrgApiKey(orgId!, keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-api-keys', orgId] });
      toast.success('API key deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Failed to delete API key');
    },
  });

  const handleCreateApiKey = () => {
    if (!newKeyData.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (newKeyData.scopes.length === 0) {
      toast.error('At least one scope is required');
      return;
    }

    const request: OrgApiKeyCreateRequest = {
      name: newKeyData.name.trim(),
      scopes: newKeyData.scopes,
      description: newKeyData.description.trim() || undefined,
      expires_in_days:
        newKeyData.expiresInDays !== 'never'
          ? parseInt(newKeyData.expiresInDays)
          : undefined,
    };

    createMutation.mutate(request);
  };

  const handleScopeToggle = (scope: OrgApiKeyScope) => {
    setNewKeyData((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope],
    }));
  };

  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleCopyFullKey = async (publicKey: string, secretKey: string) => {
    const fullKey = `${publicKey}:${secretKey}`;
    await handleCopyKey(fullKey);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>;
      case 'revoked':
        return <Badge className="bg-red-100 text-red-800 border-red-200">Revoked</Badge>;
      case 'expired':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Expired</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getScopeBadge = (scope: OrgApiKeyScope) => {
    const scopeInfo = ORG_API_KEY_SCOPES.find((s) => s.value === scope);
    return (
      <Badge key={scope} variant="outline" className="text-xs">
        {scopeInfo?.label || scope}
      </Badge>
    );
  };

  const isKeyExpired = (expiresAt?: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  // Show message if no org selected
  if (!orgId) {
    return (
      <div className="container mx-auto max-w-6xl px-6 py-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Organization Required</AlertTitle>
          <AlertDescription>
            Please select an organization to manage API keys. Use the organization
            switcher in the navigation to select an organization.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-6 py-6">
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-medium">Organization API Keys</h1>
          </div>
          <p className="text-muted-foreground">
            Manage API keys for programmatic access to your organization&apos;s resources
          </p>
        </div>

        {/* API Documentation Notice */}
        <Card className="border-blue-200/60 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 dark:from-blue-950/20 dark:to-indigo-950/10 dark:border-blue-800/30">
          <CardContent className="py-4">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 border border-blue-500/20">
                <Key className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  Organization API Keys
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                  Organization API keys allow programmatic access with fine-grained scopes.
                  Use them to build integrations that access agents and templates on behalf of your organization.
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <a
                    href="https://api.kortix.com/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  >
                    <span>View API Documentation</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Header Actions */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="w-4 h-4" />
            <span>Keys use the format: opk_xxx:osk_xxx for secure authentication</span>
          </div>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Generate API Key
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Generate API Key</DialogTitle>
                <DialogDescription>
                  Create a new API key with specific scopes for your organization.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="name" className="m-1">Name *</Label>
                  <Input
                    id="name"
                    placeholder="Production API Key"
                    value={newKeyData.name}
                    onChange={(e) =>
                      setNewKeyData((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="description" className="m-1">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Optional description for this API key"
                    value={newKeyData.description}
                    onChange={(e) =>
                      setNewKeyData((prev) => ({ ...prev, description: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <Label className="m-1">Scopes *</Label>
                  <div className="mt-2 space-y-3">
                    {ORG_API_KEY_SCOPES.map((scope) => (
                      <div key={scope.value} className="flex items-start space-x-3">
                        <Checkbox
                          id={scope.value}
                          checked={newKeyData.scopes.includes(scope.value)}
                          onCheckedChange={() => handleScopeToggle(scope.value)}
                        />
                        <div className="grid gap-1.5 leading-none">
                          <label
                            htmlFor={scope.value}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {scope.label}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {scope.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="expires" className="m-1">Expires In</Label>
                  <Select
                    value={newKeyData.expiresInDays}
                    onValueChange={(value) =>
                      setNewKeyData((prev) => ({ ...prev, expiresInDays: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Never expires" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Never expires</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="365">1 year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateApiKey}
                  disabled={
                    !newKeyData.name.trim() ||
                    newKeyData.scopes.length === 0 ||
                    createMutation.isPending
                  }
                >
                  {createMutation.isPending ? 'Creating...' : 'Generate API Key'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* API Keys List */}
        {isLoading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-3 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">
                Failed to load API keys. Please try again.
              </p>
            </CardContent>
          </Card>
        ) : apiKeys.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Key className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No API keys yet</h3>
              <p className="text-muted-foreground mb-4">
                Generate your first organization API key to start using the API programmatically.
                Each key includes scopes to control what operations it can perform.
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Generate API Key
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {apiKeys.map((apiKey: OrgApiKeyResponse) => (
              <Card
                key={apiKey.key_id}
                className={isKeyExpired(apiKey.expires_at) ? 'border-yellow-200' : ''}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{apiKey.name}</CardTitle>
                      {apiKey.description && (
                        <CardDescription className="mt-1">
                          {apiKey.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(apiKey.status)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-4">
                    {/* Key prefix */}
                    <div className="flex items-center gap-2">
                      <code className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
                        {apiKey.public_key_prefix}
                      </code>
                    </div>

                    {/* Scopes */}
                    <div className="flex flex-wrap gap-2">
                      {apiKey.scopes.map((scope) => getScopeBadge(scope))}
                    </div>

                    {/* Metadata */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground mb-1">Created</p>
                        <p className="font-medium">{formatDate(apiKey.created_at)}</p>
                      </div>
                      {apiKey.expires_at && (
                        <div>
                          <p className="text-muted-foreground mb-1">Expires</p>
                          <p className={`font-medium ${isKeyExpired(apiKey.expires_at) ? 'text-yellow-600' : ''}`}>
                            {formatDate(apiKey.expires_at)}
                          </p>
                        </div>
                      )}
                      {apiKey.last_used_at && (
                        <div>
                          <p className="text-muted-foreground mb-1">Last Used</p>
                          <p className="font-medium">{formatDate(apiKey.last_used_at)}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {apiKey.status === 'active' && (
                    <div className="flex gap-2 mt-4">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Revoke
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to revoke &quot;{apiKey.name}&quot;?
                              This action cannot be undone and any applications using this key will stop working.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => revokeMutation.mutate(apiKey.key_id)}
                              className="bg-destructive hover:bg-destructive/90 text-white"
                            >
                              Revoke Key
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}

                  {(apiKey.status === 'revoked' || apiKey.status === 'expired') && (
                    <div className="flex gap-2 mt-4">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to permanently delete &quot;{apiKey.name}&quot;?
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(apiKey.key_id)}
                              className="bg-destructive hover:bg-destructive/90 text-white"
                            >
                              Delete Key
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Show Created API Key Dialog */}
        <Dialog open={showCreatedKey} onOpenChange={setShowCreatedKey}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-600" />
                API Key Created
              </DialogTitle>
              <DialogDescription>
                Your organization API key has been created successfully
              </DialogDescription>
            </DialogHeader>

            {createdApiKey && (
              <div className="space-y-4">
                <div>
                  <Label className="m-1">Full API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      value={`${createdApiKey.public_key}:${createdApiKey.secret_key}`}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleCopyFullKey(createdApiKey.public_key, createdApiKey.secret_key)
                      }
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="m-1">Scopes</Label>
                  <div className="flex flex-wrap gap-2">
                    {createdApiKey.scopes.map((scope) => getScopeBadge(scope))}
                  </div>
                </div>

                <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertTitle className="text-yellow-800 dark:text-yellow-200">
                    Important
                  </AlertTitle>
                  <AlertDescription className="text-yellow-700 dark:text-yellow-300">
                    Store this API key securely. For security reasons, we cannot show it again.
                    Use the format <code className="bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">X-API-Key: opk_xxx:osk_xxx</code> in your request headers.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={() => setShowCreatedKey(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
