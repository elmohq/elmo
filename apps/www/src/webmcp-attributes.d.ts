import "react";

declare module "react" {
	interface FormHTMLAttributes<T> {
		toolname?: string;
		tooldescription?: string;
	}
	interface InputHTMLAttributes<T> {
		toolparamdescription?: string;
	}
}
