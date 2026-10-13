/** The next few meeting days for the quarter, each a date block and a plain label. */
export function ComingUp({ dates }: { dates: string[] }) {
  return (
    <aside aria-labelledby="coming-up-heading" className="space-y-3">
      <div>
        <h2 id="coming-up-heading" className="text-lg">
          Coming up
        </h2>
        <p className="text-sm text-muted-foreground">The next meeting days this quarter</p>
      </div>
      {dates.length === 0 ? (
        <p className="rounded-[18px] border bg-card px-4 py-4 text-sm text-muted-foreground">
          No more meeting days are set. Add some in Scheduling, under Meeting days.
        </p>
      ) : (
        <ul className="rounded-[22px] border bg-card px-5">
          {dates.map((d) => {
            const date = new Date(`${d}T12:00:00`);
            return (
              <li key={d} className="grid grid-cols-[3.25rem_1fr] items-center gap-4 border-t py-3 first:border-t-0">
                <div className="text-center leading-tight">
                  <div className="text-xs font-bold tracking-wide text-link uppercase">
                    {date.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div className="font-heading text-2xl font-extrabold">{date.getDate()}</div>
                </div>
                <div>
                  <div className="text-[0.9375rem] font-semibold">Meeting day</div>
                  <div className="text-sm text-muted-foreground">
                    {date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="rounded-[22px] bg-accent p-5">
        <div className="text-sm font-bold">Jump to anything</div>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Press ⌘K, then type a person, a page or an action. Rarely used pages live there instead of in the menu.
        </p>
      </div>
    </aside>
  );
}
