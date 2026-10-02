import Link from 'next/link';
import {UserButton} from '@clerk/nextjs';
import {NewProject} from '@/components/new-project';
import {prisma} from '@/lib/prisma';
import {requireUser} from '@/lib/auth';

export default async function Dashboard(){
  const user=await requireUser();
  const projects=await prisma.project.findMany({
    where:{userId:user.id},
    orderBy:{createdAt:'desc'},
    include:{_count:{select:{recordings:true}}}
  });

  return <main className="min-h-screen px-6 py-10"><div className="mx-auto max-w-6xl">
    <header className="flex items-center justify-between"><Link href="/" className="text-xl font-bold">DemoForge</Link><UserButton afterSignOutUrl="/"/></header>
    <section className="mt-16">
      <p className="text-sm uppercase tracking-widest text-zinc-500">Dashboard</p>
      <h1 className="mt-2 text-4xl font-bold">Your projects</h1>
      <p className="mt-3 text-zinc-400">Start with a deployed web app. GitHub metadata can be added next.</p>
      <NewProject/>

      {projects.length>0 && <div className="mt-10 grid gap-3">
        {projects.map(p=>(
          <Link key={p.id} href={`/projects/${p.id}`} className="rounded-xl border border-white/10 bg-white/[.03] p-4 hover:border-white/30">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{p.name}</span>
              <span className="text-sm text-zinc-500">{p._count.recordings} recording{p._count.recordings===1?'':'s'}</span>
            </div>
            <p className="mt-1 truncate text-sm text-zinc-500">{p.deploymentUrl||p.githubUrl}</p>
          </Link>
        ))}
      </div>}
    </section>
  </div></main>;
}
