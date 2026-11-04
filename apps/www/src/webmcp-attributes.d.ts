// WebMCP declarative form attributes (https://github.com/webmachinelearning/webmcp).
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
