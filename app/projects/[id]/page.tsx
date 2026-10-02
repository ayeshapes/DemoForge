import Link from 'next/link';
import {prisma} from '@/lib/prisma';import {notFound} from 'next/navigation';import {Recorder} from '@/components/recorder';import {requireUser} from '@/lib/auth';
import {fetchGithubMetadata} from '@/lib/github';
import {RepoPanel} from '@/components/repo-panel';

export default async function ProjectPage({params}:{params:{id:string}}){
  const user=await requireUser();
  const p=await prisma.project.findUnique({
    where:{id:params.id},
    include:{recordings:{orderBy:{createdAt:'desc'}}}
  });
  // Ownership check: a project existing isn't enough — it must belong to
  // the signed-in user. Returning 404 (rather than 403) avoids confirming
  // to other users that a given project id exists at all.
  if(!p || p.userId!==user.id) notFound();

  // DF-20 made githubUrl/deploymentUrl independently optional (a project just
  // needs at least one), so this can be null for a GitHub-only project.
  const github = p.githubUrl ? await fetchGithubMetadata(p.githubUrl) : null;

  return <main className="min-h-screen px-6 py-8"><div className="mx-auto max-w-7xl">
    <div className="mb-6"><h1 className="text-3xl font-bold">{p.name}</h1><p className="mt-1 text-zinc-400">{p.deploymentUrl}</p></div>
    {p.deploymentUrl ? (
      <Recorder url={p.deploymentUrl} projectId={p.id}/>
    ) : (
      <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-zinc-500">
        Add a deployed app URL to this project to enable screen recording.
      </div>
    )}
    {github && <RepoPanel result={github}/>}

    {p.recordings.length>0 && <div className="mt-10">
      <h2 className="text-lg font-semibold">Past recordings</h2>
      <div className="mt-3 grid gap-2">
        {p.recordings.map(r=>(
          <Link key={r.id} href={`/recordings/${r.id}`} className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm hover:border-white/30">
            <span className="font-mono text-zinc-400">{new Date(r.createdAt).toLocaleString()}</span>
            <span className="ml-3 text-zinc-500">{r.duration.toFixed(1)}s · {r.status}</span>
          </Link>
        ))}
      </div>
    </div>}
  </div></main>;
}
