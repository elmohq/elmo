export type EnvMap = Record<string, string>;

export interface MigrationLogger {
	info(msg: string): void;
	warn(msg: string): void;
	step(msg: string): void;
}

export interface MigrationContext {
	configDir: string;
	log: MigrationLogger;
	readEnv(): Promise<EnvMap>;
	setEnv(name: string, value: string): Promise<void>;
}

export interface Migration {
	from: string;
	to: string;
	description: string;
	requiresMaintenance?: boolean;
	run(ctx: MigrationContext): Promise<void>;
}
