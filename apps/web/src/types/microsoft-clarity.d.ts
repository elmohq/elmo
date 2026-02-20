declare module "@microsoft/clarity" {
	interface ClarityApi {
		init(projectId: string): void;
	}

	const clarity: ClarityApi;
	export default clarity;
}
