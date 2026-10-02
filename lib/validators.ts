import {z} from 'zod';
export const projectSchema=z.object({name:z.string().min(1).max(100),githubUrl:z.string().url().optional().or(z.literal('')),deploymentUrl:z.string().url().optional().or(z.literal(''))}).refine(v=>v.githubUrl||v.deploymentUrl,{message:'Provide a GitHub URL or deployed app URL'});
