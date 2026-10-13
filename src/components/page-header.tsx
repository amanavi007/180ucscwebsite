/** Title block shared by every portal page: the one h1, a one-line description, and the page's actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Buttons on the right. At most one of them should be the main (lime) button. */
  actions?: React.ReactNode;
  /** Anything that belongs directly under the title, such as a view switch. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-4xl leading-tight">{title}</h1>
        {description && <p className="mt-1.5 text-base text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
