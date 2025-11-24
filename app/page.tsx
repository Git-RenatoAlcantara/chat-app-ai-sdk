import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-center py-32 px-16 bg-white dark:bg-black">
        <div className="flex flex-col items-center gap-6 text-center">
          <h1 className="max-w-xs text-4xl font-bold leading-10 tracking-tight text-black dark:text-zinc-50">
            Chat App com AI SDK
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Uma aplicação de chat moderna construída com Next.js, AI SDK e ai-elements.
            Converse com inteligência artificial de forma natural e intuitiva.
          </p>
          
          <Link 
            href="/chat"
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-8 text-white font-medium transition-colors hover:bg-blue-700"
          >
            Iniciar Chat
          </Link>
        </div>
      </main>
    </div>
  );
}
