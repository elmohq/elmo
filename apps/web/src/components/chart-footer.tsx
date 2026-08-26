import { CardFooter } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";

interface ChartFooterProps {
	children: React.ReactNode;
	className?: string;
}

export function ChartFooter({ children, className = "" }: ChartFooterProps) {
	return (
		<>
			<Separator className="py-0 my-0" />
			<CardFooter className={`flex justify-between items-center px-3 pt-3 pb-0 ${className}`}>{children}</CardFooter>
		</>
	);
}
