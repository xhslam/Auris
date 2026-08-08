type StatusPillProps = {
  children: string;
};

export function StatusPill({ children }: StatusPillProps) {
  return <span>{children}</span>;
}
