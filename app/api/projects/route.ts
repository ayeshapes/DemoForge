import {NextResponse} from 'next/server';import {prisma} from '@/lib/prisma';import {projectSchema} from '@/lib/validators';import {requireUser,AuthError} from '@/lib/auth';import {logger} from '@/lib/logger';import {capture,flushAnalytics} from '@/lib/analytics';

export async function POST(req:Request){
  try{
    const user=await requireUser();
    const parsed=projectSchema.safeParse(await req.json());
    if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||'Invalid input'},{status:400});
    const p=await prisma.project.create({data:{name:parsed.data.name,githubUrl:parsed.data.githubUrl||null,deploymentUrl:parsed.data.deploymentUrl||null,userId:user.id}});
    capture(user.id,'project_created',{projectId:p.id,hasGithubUrl:Boolean(p.githubUrl),hasDeploymentUrl:Boolean(p.deploymentUrl)});
    await flushAnalytics();
    return NextResponse.json({id:p.id});
  }catch(e){
    if(e instanceof AuthError)return NextResponse.json({error:'Not authenticated'},{status:401});
    logger.error('Failed to create project',e,{route:'POST /api/projects'});
    return NextResponse.json({error:'Database unavailable. Configure DATABASE_URL and run Prisma.'},{status:500});
  }
}

export async function GET(){
  try{
    const user=await requireUser();
    const projects=await prisma.project.findMany({
      where:{userId:user.id},
      orderBy:{createdAt:'desc'},
      include:{_count:{select:{recordings:true}}}
    });
    return NextResponse.json(projects);
  }catch(e){
    if(e instanceof AuthError)return NextResponse.json({error:'Not authenticated'},{status:401});
    logger.error('Failed to list projects',e,{route:'GET /api/projects'});
    return NextResponse.json({error:'Could not load projects. Check your connection and try again.'},{status:500});
  }
}
