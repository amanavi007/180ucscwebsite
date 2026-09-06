import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const metadata: Metadata = { title: "Our Team" };

const EXEC_BOARD = [
  { name: "Sudheeksha Nettam", role: "President" },
  { name: "Aman Avinash", role: "Director of Projects" },
  { name: "Aanya Agarwal", role: "Director of Internal Affairs" },
  { name: "Devarsh Jayakrishnan", role: "Director of External Affairs" },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function TeamPage() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16 sm:pt-28">
        <p className="text-sm font-medium tracking-wide text-primary uppercase">Our Team</p>
        <h1 className="font-brand mt-3 max-w-2xl text-4xl leading-[1.1] font-bold tracking-tight text-balance sm:text-5xl">
          Meet the people behind the work.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground text-pretty">
          Our chapter runs on student consultants, project managers, and an
          executive board -- every one of them balancing a full course load
          with real client work.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">
          Executive Board
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {EXEC_BOARD.map((member) => (
            <div key={member.name} className="glass-panel rounded-2xl p-6 text-center">
              <Avatar className="mx-auto size-16">
                <AvatarFallback className="bg-primary/15 text-lg font-semibold text-primary">
                  {initials(member.name)}
                </AvatarFallback>
              </Avatar>
              <h3 className="mt-4 font-semibold">{member.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{member.role}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 pb-24">
        <div className="glass-panel flex flex-col items-start justify-between gap-6 rounded-3xl p-10 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">
              And a full roster of consultants
            </h2>
            <p className="mt-2 max-w-md text-muted-foreground">
              Behind every client project is a team of project managers and
              consultants pulled from majors across campus. Want to be one
              of them next quarter?
            </p>
          </div>
          <Button nativeButton={false} size="lg" render={<Link href="/apply" />} className="shrink-0 gap-1.5">
            Apply Now
            <ArrowUpRight className="size-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}
