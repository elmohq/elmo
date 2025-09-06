import clsx from "clsx";

export function Logo(props: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...props}
      className={clsx(
        "-mt-2 font-normal font-titan text-5xl text-blue-600",
        props.className
      )}
    >
      elmo
    </div>
  );
}
