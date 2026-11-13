import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "@workspace/lib/auth/client";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { useState } from "react";
import { ListPagination } from "@/components/list-pagination";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pageHead } from "@/lib/route-head";
import { type AdminUser, listAdminUsersFn } from "@/server/admin";

export const Route = createFileRoute("/_authed/admin/users")({
	staticData: { crumb: "Users" },
	head: pageHead({ title: "Users", description: "Find a user and view the app as they see it." }),
	component: AdminUsers,
});

function AdminUsers() {
	const { user: viewer } = useAuth();
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(0);
	const [target, setTarget] = useState<AdminUser | null>(null);
	const [confirming, setConfirming] = useState(false);
	const debouncedSearch = useDebouncedValue(search);

	const { data, error, isPending, isPlaceholderData } = useQuery({
		queryKey: ["admin", "users", debouncedSearch, page],
		queryFn: () => listAdminUsersFn({ data: { search: debouncedSearch, page } }),
		placeholderData: keepPreviousData,
	});

	return (
		<div className="space-y-8">
			<div className="space-y-2">
				<h1 className="text-3xl font-bold tracking-tight">Users</h1>
				<p className="text-muted-foreground">Find a user and view the app as they see it</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>All Users</CardTitle>
					<CardDescription>
						Impersonating signs you in as that user for up to an hour. Administrators can't be impersonated.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<Input
						type="search"
						aria-label="Search users"
						placeholder="Search by name or email"
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setPage(0);
						}}
						className="max-w-sm"
					/>

					{error ? (
						<p className="text-sm text-destructive" role="alert">
							{error.message || "Couldn't load users"}
						</p>
					) : isPending ? (
						<div className="space-y-3">
							{[0, 1, 2, 3, 4].map((n) => (
								<Skeleton key={n} className="h-12 w-full" />
							))}
						</div>
					) : data.users.length === 0 ? (
						<p className="py-8 text-center text-sm text-muted-foreground">No users match that search.</p>
					) : (
						<div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
							<div className="overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>User</TableHead>
											<TableHead>Organizations</TableHead>
											<TableHead>Role</TableHead>
											<TableHead>Joined</TableHead>
											<TableHead className="text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{data.users.map((row) => (
											<UserRow
												key={row.id}
												user={row}
												isViewer={row.id === viewer?.id}
												onImpersonate={() => {
													setTarget(row);
													setConfirming(true);
												}}
											/>
										))}
									</TableBody>
								</Table>
							</div>
							<ListPagination page={page} pageSize={data.pageSize} totalItems={data.total} onPageChange={setPage} />
						</div>
					)}
				</CardContent>
			</Card>

			<ImpersonateDialog user={target} open={confirming} onClose={() => setConfirming(false)} />
		</div>
	);
}

function UserRow({ user, isViewer, onImpersonate }: { user: AdminUser; isViewer: boolean; onImpersonate: () => void }) {
	const isAdmin = user.role === "admin";

	return (
		<TableRow>
			<TableCell>
				<div className="font-medium">{user.name}</div>
				<div className="text-xs text-muted-foreground">{user.email}</div>
			</TableCell>
			<TableCell className="max-w-64 whitespace-normal text-sm">
				{user.organizations.length > 0 ? (
					user.organizations.map((organization) => organization.name).join(", ")
				) : (
					<span className="text-muted-foreground">None</span>
				)}
			</TableCell>
			<TableCell>
				<div className="flex gap-1.5">
					<Badge variant={isAdmin ? "default" : "secondary"}>{isAdmin ? "Admin" : "User"}</Badge>
					{user.banned && <Badge variant="destructive">Banned</Badge>}
				</div>
			</TableCell>
			<TableCell className="text-sm">{new Date(user.createdAt).toLocaleDateString()}</TableCell>
			<TableCell className="text-right">
				{isViewer ? (
					<span className="text-sm text-muted-foreground">You</span>
				) : (
					<Button variant="outline" size="sm" disabled={isAdmin} onClick={onImpersonate} className="cursor-pointer">
						Impersonate
					</Button>
				)}
			</TableCell>
		</TableRow>
	);
}

function ImpersonateDialog({ user, open, onClose }: { user: AdminUser | null; open: boolean; onClose: () => void }) {
	const [starting, setStarting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const close = () => {
		setError(null);
		onClose();
	};

	const start = async () => {
		if (!user) return;
		setStarting(true);
		setError(null);
		const result = await authClient.admin.impersonateUser({ userId: user.id });
		if (result.error) {
			setError(result.error.message || "Couldn't impersonate this user");
			setStarting(false);
			return;
		}
		window.location.assign("/app");
	};

	return (
		<Dialog open={open} onOpenChange={(next) => !next && !starting && close()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Impersonate {user?.name || user?.email}?</DialogTitle>
					<DialogDescription>
						You'll be signed in as {user?.email} and anything you change is changed for them. Use the bar at the top of
						the page to return to your own account.
					</DialogDescription>
				</DialogHeader>
				{error && (
					<p className="text-sm text-destructive" role="alert">
						{error}
					</p>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={close} disabled={starting} className="cursor-pointer">
						Cancel
					</Button>
					<Button onClick={start} disabled={starting} className="cursor-pointer">
						{starting && <Spinner />}
						Impersonate
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
