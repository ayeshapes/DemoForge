import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import { PostHogProvider } from '@/components/posthog-provider';

export const metadata={title:'DemoForge',description:'Turn your software project into a polished demo.'};

export default function RootLayout({children}:{children:React.ReactNode}){
  return (
    <ClerkProvider>
      <html lang="en"><body><PostHogProvider />{children}</body></html>
    </ClerkProvider>
  );
}
